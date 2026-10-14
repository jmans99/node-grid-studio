import type { ResolvedOffering } from './offerings';
import { hashInts, randomAt } from './random';
import type { SceneLink, SceneNode, TitleShape } from './types';

/** A whole number from a string, for seeding things by id. */
export function hashString(text: string): number {
  return hashInts(...Array.from(text, (ch) => ch.charCodeAt(0)));
}

/**
 * Pick a node for each active offering. Placeholder placement, to be replaced
 * by real title shapes.
 *
 * Each offering gets its own seeded target point on the grid and takes the
 * free node nearest to it, keeping clear of the offerings placed before it.
 * Because targets come from the offering id, turning one offering on or off
 * rarely moves the others.
 */
export function placeTitles(
  nodes: SceneNode[],
  offerings: ResolvedOffering[],
  seed: number,
  columns: number,
  rows: number,
): TitleShape[] {
  const taken: SceneNode[] = [];
  const titles: TitleShape[] = [];
  for (const o of offerings) {
    if (o.state === 'off') continue;
    const h = hashString(o.id);
    const tx = randomAt(seed, 21, h) * (columns - 1);
    const ty = randomAt(seed, 22, h) * (rows - 1);
    const free = nodes
      .filter((n) => !taken.includes(n))
      .sort((a, b) => Math.hypot(a.col - tx, a.row - ty) - Math.hypot(b.col - tx, b.row - ty));
    const gap = (n: SceneNode) => Math.min(Infinity, ...taken.map((t) => Math.max(Math.abs(t.col - n.col), Math.abs(t.row - n.row))));
    // Prefer a node with a clear ring around it, then one that is just not touching, then any.
    const node = free.find((n) => gap(n) >= 3) ?? free.find((n) => gap(n) >= 2) ?? free[0];
    if (!node) break;
    taken.push(node);
    titles.push({
      id: o.id,
      nodeId: node.id,
      state: o.state,
      color: o.resolvedColor,
      text: o.short,
      x: node.x,
      y: node.y,
    });
  }
  return titles;
}

/**
 * Colour spread: nodes and links within `steps` link-steps of a title shape
 * take its colour. Steps are counted along links. Where two titles reach the
 * same node, the nearer wins; on a tie, lead beats included, then list order.
 * At 0 nothing beyond the title shape itself is coloured.
 */
export function spreadColors(nodes: SceneNode[], links: SceneLink[], titles: TitleShape[], steps: number): void {
  if (steps <= 0 || !titles.length) return;
  const next = new Map<string, string[]>();
  for (const l of links) {
    next.set(l.from, [...(next.get(l.from) ?? []), l.to]);
    next.set(l.to, [...(next.get(l.to) ?? []), l.from]);
  }
  // Lead first, then list order: earlier entries win ties.
  const ordered = [...titles.filter((t) => t.state === 'lead'), ...titles.filter((t) => t.state !== 'lead')];
  const owner = new Map<string, { dist: number; color: string }>();
  for (const t of ordered) {
    let frontier = [t.nodeId];
    const seen = new Set(frontier);
    for (let d = 0; d <= steps && frontier.length; d++) {
      const after: string[] = [];
      for (const id of frontier) {
        const current = owner.get(id);
        if (!current || d < current.dist) owner.set(id, { dist: d, color: t.color });
        for (const n of next.get(id) ?? []) {
          if (!seen.has(n)) {
            seen.add(n);
            after.push(n);
          }
        }
      }
      frontier = after;
    }
  }
  for (const n of nodes) {
    const o = owner.get(n.id);
    if (o && o.dist > 0) n.color = o.color;
  }
  // A link is one step further out than its nearer end. It takes that end's colour.
  for (const l of links) {
    const a = owner.get(l.from);
    const b = owner.get(l.to);
    const near = !a ? b : !b ? a : a.dist <= b.dist ? a : b;
    if (near && near.dist + 1 <= steps) l.color = near.color;
  }
}
