import { pairKey } from './edits';
import type { Scene, SceneLink, SceneNode, TitleShape } from './types';

interface Pt {
  x: number;
  y: number;
}

export type Hit =
  | { kind: 'title'; id: string }
  | { kind: 'node'; id: string; ghost: boolean }
  | {
      kind: 'gap';
      a: string;
      b: string;
      /** The link drawn here now, if any. */
      existing?: SceneLink;
      /** End points of the gap's line, in units, for the hover hint. */
      from: Pt;
      to: Pt;
    };

const insideTitle = (t: TitleShape, p: Pt) => {
  const reach = Math.max(t.halfW - t.halfH, 0);
  return Math.hypot(Math.max(Math.abs(p.x - t.cx) - reach, 0), p.y - t.cy) <= t.halfH;
};

/** Where a link to a title aims: the spot where its node was, kept inside the capsule. */
export function aimPoint(t: TitleShape, p: Pt): Pt {
  const reach = Math.max(t.halfW - t.halfH, 0);
  return {
    x: Math.max(t.cx - reach, Math.min(t.cx + reach, p.x)),
    y: Math.max(t.cy - t.halfH / 2, Math.min(t.cy + t.halfH / 2, p.y)),
  };
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * What is under the pointer, in scene units: a title shape, a node (or the
 * ghost of a hidden one), or the gap between two neighbouring nodes. A gap next
 * to a title counts as the gap between the node and that title.
 */
export function hitTest(scene: Scene, nodeSize: number, p: Pt): Hit | null {
  const title = scene.titles.find((t) => insideTitle(t, p));
  if (title) return { kind: 'title', id: title.id };

  // Which title, if any, sits on each node.
  const titleOf = new Map<string, TitleShape>();
  for (const t of scene.titles)
    for (let r = t.row; r < t.row + t.rows; r++)
      for (let c = t.col; c < t.col + t.cols; c++) titleOf.set(`${c},${r}`, t);

  const reach = Math.max(nodeSize, 2.5);
  let node: SceneNode | null = null;
  let best = Infinity;
  for (const n of scene.nodes) {
    if (n.hidden && !n.userHidden) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= reach && d < best) {
      best = d;
      node = n;
    }
  }
  if (node) return { kind: 'node', id: node.id, ghost: !!node.userHidden };

  const at = new Map(scene.nodes.map((n) => [n.id, n]));
  const where = (n: SceneNode): Pt => {
    const t = titleOf.get(n.id);
    return t && n.hidden && !n.userHidden ? aimPoint(t, n) : n;
  };
  const tolerance = 0.3 * Math.min(scene.gapX, scene.gapY);
  let gap: Extract<Hit, { kind: 'gap' }> | null = null;
  best = Infinity;
  for (const a of scene.nodes) {
    if (a.userHidden) continue;
    for (const [dc, dr] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ]) {
      const b = at.get(`${a.col + dc},${a.row + dr}`);
      if (!b || b.userHidden) continue;
      const ta = titleOf.get(a.id);
      const tb = titleOf.get(b.id);
      if (ta && tb) continue; // inside one title, or between two: never a link
      const from = where(a);
      const to = where(b);
      const d = distanceToSegment(p, from, to);
      if (d > tolerance || d >= best) continue;
      best = d;
      const titled = ta ?? tb;
      const outside = ta ? b : a;
      const existing = titled
        ? scene.links.find(
            (l) =>
              (l.titleFrom === titled.id && l.to === outside.id) || (l.titleTo === titled.id && l.from === outside.id),
          )
        : scene.links.find((l) => pairKey(l.from, l.to) === pairKey(a.id, b.id));
      gap = { kind: 'gap', a: a.id, b: b.id, existing, from, to };
    }
  }
  return gap;
}
