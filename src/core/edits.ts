import { randomAt } from './random';
import type { Edits, SceneLink, SceneNode } from './types';

export const emptyEdits = (): Edits => ({ hidden: [], linksAdded: [], linksRemoved: [], moved: {} });

export const hasEdits = (e: Edits) =>
  e.hidden.length > 0 || e.linksAdded.length > 0 || e.linksRemoved.length > 0 || Object.keys(e.moved).length > 0;

/** One name for a pair of nodes, whichever way round they are given. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const cell = (id: string) => id.split(',').map(Number) as [number, number];

/**
 * A link between two neighbouring nodes, written the same way the generator
 * writes its own: left to right, top to bottom, and for diagonals from the
 * cell's top corner.
 */
export function makeLink(a: SceneNode, b: SceneNode, seed: number): SceneLink | null {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  if (dc > 1 || dr > 1 || (dc === 0 && dr === 0)) return null;
  const col = Math.min(a.col, b.col);
  const row = Math.min(a.row, b.row);
  let from: SceneNode;
  let to: SceneNode;
  let kind: SceneLink['kind'];
  if (dr === 0) [from, to, kind] = a.col < b.col ? [a, b, 'h'] : [b, a, 'h'];
  else if (dc === 0) [from, to, kind] = a.row < b.row ? [a, b, 'v'] : [b, a, 'v'];
  else {
    kind = 'd';
    const top = a.row < b.row ? a : b;
    [from, to] = [top, top === a ? b : a];
  }
  const bend = kind === 'h' ? 'h' : kind === 'v' ? 'v' : randomAt(seed, 5, col, row) < 0.5 ? 'h' : 'v';
  return { id: `${from.id}-${to.id}`, from: from.id, to: to.id, kind, bend };
}

/** The other diagonal of the same cell, which a diagonal link must never cross. */
export function crossingKey(key: string): string | null {
  const [a, b] = key.split('|').map(cell);
  if (Math.abs(a[0] - b[0]) !== 1 || Math.abs(a[1] - b[1]) !== 1) return null;
  const col = Math.min(a[0], b[0]);
  const row = Math.min(a[1], b[1]);
  const goesDown = (a[0] - b[0]) * (a[1] - b[1]) > 0; // top-left to bottom-right
  return goesDown ? pairKey(`${col + 1},${row}`, `${col},${row + 1}`) : pairKey(`${col},${row}`, `${col + 1},${row + 1}`);
}

/**
 * Apply added and removed links to the generated ones. An added diagonal wins
 * over the generated diagonal it would cross. Pairs that are no longer on the
 * grid (after making it smaller) are skipped.
 */
export function applyLinkEdits(links: SceneLink[], nodes: SceneNode[], edits: Edits, seed: number): SceneLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const removed = new Set(edits.linksRemoved);
  const added = edits.linksAdded.filter((k) => k.split('|').every((id) => byId.has(id)));
  const crossed = new Set(added.map(crossingKey).filter((k): k is string => !!k));
  const out = links.filter((l) => {
    const key = pairKey(l.from, l.to);
    return !removed.has(key) && !crossed.has(key);
  });
  const present = new Set(out.map((l) => pairKey(l.from, l.to)));
  for (const key of added) {
    if (present.has(key)) continue;
    const [a, b] = key.split('|').map((id) => byId.get(id)!);
    const link = makeLink(a, b, seed);
    if (link) {
      out.push(link);
      present.add(key);
    }
  }
  return out;
}

export function toggleHidden(e: Edits, id: string): Edits {
  return { ...e, hidden: e.hidden.includes(id) ? e.hidden.filter((x) => x !== id) : [...e.hidden, id] };
}

/** Remove a link that is drawn now, whether it came from the generator or a click. */
function removeLink(e: Edits, key: string): Edits {
  if (e.linksAdded.includes(key)) return { ...e, linksAdded: e.linksAdded.filter((k) => k !== key) };
  return e.linksRemoved.includes(key) ? e : { ...e, linksRemoved: [...e.linksRemoved, key] };
}

/**
 * Click on the gap between two neighbouring nodes. `existing` is the link
 * drawn there now, if any (for a title shape, the link between it and this
 * node). Adding a diagonal also removes the one that would cross it.
 */
export function toggleLink(e: Edits, a: string, b: string, existing?: { from: string; to: string }): Edits {
  if (existing) return removeLink(e, pairKey(existing.from, existing.to));
  const key = pairKey(a, b);
  let next: Edits = e.linksRemoved.includes(key)
    ? { ...e, linksRemoved: e.linksRemoved.filter((k) => k !== key) }
    : { ...e, linksAdded: [...e.linksAdded, key] };
  const cross = crossingKey(key);
  if (cross) next = removeLink(next, cross);
  return next;
}

export function moveNode(e: Edits, id: string, dx: number, dy: number): Edits {
  const moved = { ...e.moved };
  if (Math.hypot(dx, dy) < 0.01) delete moved[id];
  else moved[id] = { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 };
  return { ...e, moved };
}
