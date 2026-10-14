import { fmt } from './format';
import {
  type Pt,
  type Seg,
  type ShapeSpec,
  linkSegments,
  pathLength,
  pt,
  reversePath,
  sdfNode,
  segAt,
  segLength,
  segTangentAt,
  segmentsMarkup,
  shapeVertices,
  trimPath,
} from './geometry';
import type { LinePath } from './types';

/**
 * Merged and smooth joins.
 *
 * A link becomes a bar: a thick stroke in the node colour. Where the bar meets
 * a node, a "foot" shape fills the space between the bar and the node outline:
 *
 * - Merged: the foot is just the sliver between the bar's square end and the
 *   curved node edge, so the two meet with no gap.
 * - Smooth: each side of the foot is a circular arc that touches the bar edge
 *   and the node outline (a tangent fillet), so the bar flares into the node.
 *
 * Everything is plain path geometry. Pieces overlap a little where they meet,
 * so no hairline seams show between shapes of the same colour.
 */

export interface JoinEnd {
  c: Pt;
  /** The outline the bar joins: the node edge, or the middle of its ring. */
  spec: ShapeSpec;
  /** A solid node hides whatever runs under it, so the bar can run to its centre. */
  solid: boolean;
}

export interface BarShapes {
  bar: string;
  feet: string[];
}

/** How wide a bar may be, as a share of the node's `half`, so its edges still meet the outline. */
export const BAR_LIMIT: Record<ShapeSpec['shape'], number> = {
  circle: 0.98,
  square: 0.98,
  rounded: 0.98,
  // Narrowest across a corner-to-corner diagonal.
  diamond: 0.69,
  hexagon: 0.85,
};

export function barMarkup(
  a: Pt,
  b: Pt,
  bend: 'h' | 'v',
  mode: LinePath,
  radius: number,
  endA: JoinEnd,
  endB: JoinEnd,
  /** Half the bar width. */
  halfWidth: number,
  /** Fillet radius. 0 for a merged join. */
  fillet: number,
): BarShapes | null {
  const route = linkSegments(a, b, bend, mode, radius);
  const visible = trimPath(route, { spec: endA.spec, c: a }, { spec: endB.spec, c: b });
  if (!visible || !visible.length) return null;

  // Under a solid node the bar can run on to the centre; otherwise it stops at the outline.
  const body = trimPath(route, endA.solid ? null : { spec: endA.spec, c: a }, endB.solid ? null : { spec: endB.spec, c: b });
  if (!body || !body.length) return null;

  const half = pathLength(visible) / 2;
  const feet: string[] = [];
  const addFoot = (path: Seg[], end: JoinEnd) => {
    if (fillet <= 0 && end.solid) return; // a merged bar already disappears into a solid node
    // A foot may reach half way along the bar, and never round an elbow's first bend.
    const reach = path.length > 1 && path[0].t === 'L' ? Math.min(half, segLength(path[0])) : half;
    const foot = footMarkup(path, end, halfWidth, fillet, reach);
    if (foot) feet.push(foot);
  };
  addFoot(visible, endA);
  addFoot(reversePath(visible), endB);
  return { bar: segmentsMarkup(body), feet };
}

interface SideHit {
  /** Where the outline of the foot leaves the bar edge. */
  onBar: Pt;
  /** Where it meets the node outline. */
  onNode: Pt;
  /** Distance along the bar from the exit point. */
  s: number;
  /** Fillet circle, or null for a sharp merged corner. */
  arc: { c: Pt; r: number } | null;
}

interface Sample {
  s: number;
  p: Pt;
  /** Unit normal, to the left of the direction of travel. */
  n: Pt;
}

/** Points along a path, with their distance from the start and their normal. */
function samplePath(path: Seg[], upTo: number, step: number): Sample[] {
  const out: Sample[] = [];
  let s = 0;
  for (const seg of path) {
    const parts = Math.max(2, Math.ceil(segLength(seg) / step));
    for (let i = out.length ? 1 : 0; i <= parts; i++) {
      const t = i / parts;
      const p = segAt(seg, t);
      if (out.length) s += Math.hypot(p.x - out[out.length - 1].p.x, p.y - out[out.length - 1].p.y);
      const dir = segTangentAt(seg, t);
      out.push({ s, p, n: { x: -dir.y, y: dir.x } });
    }
    if (s > upTo) break;
  }
  return out;
}

/**
 * The foot at the start of `path`, which begins where the bar's centre line
 * crosses the node outline. Positions are given by `s`, the distance along the
 * bar from that point, and an offset across it. The bar edges are the true
 * offsets of the centre line, so the fillets follow curved and bent bars too.
 */
function footMarkup(path: Seg[], end: JoinEnd, h: number, fillet: number, reach: number): string | null {
  const overlap = Math.max(0.5, h * 0.25);
  const samples = samplePath(path, reach + overlap + 1, Math.max(0.25, h / 8));
  const first = samples[0];
  const dir = { x: first.n.y, y: -first.n.x };

  /** Centre-line point and normal at distance s. Before the start, carry on in a straight line. */
  const frame = (s: number): { p: Pt; n: Pt } => {
    if (s <= 0) return { p: { x: first.p.x + dir.x * s, y: first.p.y + dir.y * s }, n: first.n };
    let i = 1;
    while (i < samples.length - 1 && samples[i].s < s) i++;
    const a = samples[i - 1];
    const b = samples[i];
    const t = b.s > a.s ? Math.min(1, (s - a.s) / (b.s - a.s)) : 0;
    const n = { x: a.n.x + (b.n.x - a.n.x) * t, y: a.n.y + (b.n.y - a.n.y) * t };
    const nl = Math.hypot(n.x, n.y) || 1;
    return { p: { x: a.p.x + (b.p.x - a.p.x) * t, y: a.p.y + (b.p.y - a.p.y) * t }, n: { x: n.x / nl, y: n.y / nl } };
  };
  const at = (side: number, off: number, s: number): Pt => {
    const f = frame(s);
    return { x: f.p.x + f.n.x * side * off, y: f.p.y + f.n.y * side * off };
  };
  const sd = (p: Pt) => sdfNode(end.spec, end.c, p);

  /**
   * Find s where f changes from <= 0 to > 0, searching outwards from the
   * deepest point behind the start (where f is lowest) to `reach`.
   */
  const solve = (f: (s: number) => number): number | null => {
    let lo = 0;
    let low = f(0);
    for (let i = 1; i <= 40; i++) {
      const s = (-2 * end.spec.half * i) / 40;
      const v = f(s);
      if (v < low) {
        low = v;
        lo = s;
      }
    }
    let hi = reach;
    if (low > 0 || f(hi) <= 0) return null;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) <= 0) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  /** Sharp corner: where the bar edge meets the node outline. */
  const edgeHit = (side: number): SideHit | null => {
    const s = solve((x) => sd(at(side, h, x)));
    if (s === null) return null;
    const p = at(side, h, s);
    return { onBar: p, onNode: p, s, arc: null };
  };

  /**
   * Fillet: a circle of radius r that touches the bar edge and the node outline
   * from outside. Its centre sits r beyond the bar edge, and r away from the node.
   */
  const filletHit = (side: number, r: number): SideHit | null => {
    const s = solve((x) => sd(at(side, h + r, x)) - r);
    if (s === null) return null;
    const c = at(side, h + r, s);
    const e = Math.max(1e-4, end.spec.half * 1e-5);
    const g = { x: sd({ x: c.x + e, y: c.y }) - sd({ x: c.x - e, y: c.y }), y: sd({ x: c.x, y: c.y + e }) - sd({ x: c.x, y: c.y - e }) };
    const gl = Math.hypot(g.x, g.y) || 1;
    return {
      onBar: at(side, h, s),
      onNode: { x: c.x - (g.x / gl) * r, y: c.y - (g.y / gl) * r },
      s,
      arc: { c, r },
    };
  };

  const side = (sign: number): SideHit | null => {
    // Shrink the fillet until it fits within the reach.
    for (let r = fillet, i = 0; r > 0.05 && i < 6; r /= 2, i++) {
      const hit = filletHit(sign, r);
      if (hit) return hit;
    }
    return edgeHit(sign);
  };

  const plus = side(1);
  const minus = side(-1);
  if (!plus || !minus) return null;

  // The foot runs a little way along the bar past both corners, so the two overlap.
  const sTop = Math.min(Math.max(plus.s, minus.s, 0), reach) + overlap;

  /** Points along one bar edge between two distances, in the order given. */
  const walk = (sign: number, from: number, to: number): string => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const inner = samples.filter((x) => x.s > lo + 1e-6 && x.s < hi - 1e-6).map((x) => x.s);
    if (from > to) inner.reverse();
    return simplify([from, ...inner, to].map((x) => at(sign, h, x)))
      .slice(1)
      .map((p) => `L${pt(p)}`)
      .join('');
  };

  let d = `M${pt(at(1, h, sTop))}${walk(1, sTop, plus.s)}`;
  if (plus.arc) d += arcTo(plus.onBar, plus.onNode, plus.arc.c, plus.arc.r);
  d += end.solid ? `L${pt(end.c)}L${pt(minus.onNode)}` : traceOutline(end.spec, end.c, plus.onNode, minus.onNode);
  if (minus.arc) d += arcTo(minus.onNode, minus.onBar, minus.arc.c, minus.arc.r);
  d += `${walk(-1, minus.s, sTop)}Z`;
  return `<path d="${d}"/>`;
}

/** Drop points that sit on a straight line between their neighbours. */
function simplify(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    const off = len > 1e-9 ? Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / len : 0;
    if (off > 0.01) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** The short arc from `from` to `to` around `c`. */
function arcTo(from: Pt, to: Pt, c: Pt, r: number): string {
  const cross = (from.x - c.x) * (to.y - c.y) - (from.y - c.y) * (to.x - c.x);
  return `A${fmt(r)} ${fmt(r)} 0 0 ${cross > 0 ? 1 : 0} ${pt(to)}`;
}

const wrap = (a: number) => {
  let v = a;
  while (v <= -Math.PI) v += 2 * Math.PI;
  while (v > Math.PI) v -= 2 * Math.PI;
  return v;
};

/** Follow the node outline the short way from `from` to `to`. Both points lie on it. */
function traceOutline(spec: ShapeSpec, c: Pt, from: Pt, to: Pt): string {
  const angle = (p: Pt) => Math.atan2(p.y - c.y, p.x - c.x);
  const start = angle(from);
  const delta = wrap(angle(to) - start);

  if (spec.shape === 'circle') {
    const r = Math.hypot(from.x - c.x, from.y - c.y);
    return `A${fmt(r)} ${fmt(r)} 0 0 ${delta > 0 ? 1 : 0} ${pt(to)}`;
  }

  const corners = shapeVertices(spec, c);
  if (corners) {
    // Every corner passed on the way.
    const passed = corners
      .map((p) => ({ p, d: wrap(angle(p) - start) }))
      .filter(({ d }) => d * Math.sign(delta) > 1e-9 && Math.abs(d) < Math.abs(delta) - 1e-9)
      .sort((x, y) => Math.abs(x.d) - Math.abs(y.d));
    return passed.map(({ p }) => `L${pt(p)}`).join('') + `L${pt(to)}`;
  }

  // Rounded square: points on the outline every 5 degrees.
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 36)));
  let d = '';
  for (let i = 1; i < steps; i++) {
    const a = start + (delta * i) / steps;
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    let lo = 0;
    let hi = spec.half * 2;
    for (let j = 0; j < 40; j++) {
      const mid = (lo + hi) / 2;
      if (sdfNode(spec, c, { x: c.x + dir.x * mid, y: c.y + dir.y * mid }) <= 0) lo = mid;
      else hi = mid;
    }
    d += `L${pt({ x: c.x + dir.x * lo, y: c.y + dir.y * lo })}`;
  }
  return d + `L${pt(to)}`;
}
