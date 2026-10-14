import { fmt } from './format';
import type { LinePath, NodeShape } from './types';

/**
 * Shape builders. Everything here works in output pixels, after the scene has
 * been scaled onto the canvas, and returns plain SVG elements.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface NodeBox {
  shape: NodeShape;
  cx: number;
  cy: number;
  /** Half the node width. The outer edge of the node, outline included. */
  half: number;
  /** Outer corner radius of the rounded square. */
  corner: number;
  /** Outline thickness. 0 for a node without an outline. */
  outline: number;
}

/**
 * One node. When there is an outline, the shape is pulled in by half the
 * outline thickness so the outer edge stays exactly `half` from the centre.
 */
export function nodeMarkup({ shape, cx, cy, half, corner, outline }: NodeBox): string {
  const inset = outline / 2;
  const min = 0.01;
  switch (shape) {
    case 'circle':
      return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(Math.max(half - inset, min))}"/>`;
    case 'square':
    case 'rounded': {
      const h = Math.max(half - inset, min);
      const outerCorner = shape === 'rounded' ? Math.min(corner, half) : 0;
      const rx = Math.min(Math.max(outerCorner - inset, 0), h);
      return (
        `<rect x="${fmt(cx - h)}" y="${fmt(cy - h)}" width="${fmt(h * 2)}" height="${fmt(h * 2)}"` +
        (rx > 0.005 ? ` rx="${fmt(rx)}"` : '') +
        `/>`
      );
    }
    case 'diamond': {
      const r = Math.max(half - inset / Math.cos(Math.PI / 4), min);
      return polygon([
        { x: cx - r, y: cy },
        { x: cx, y: cy - r },
        { x: cx + r, y: cy },
        { x: cx, y: cy + r },
      ]);
    }
    case 'hexagon': {
      const r = Math.max(half - inset / Math.cos(Math.PI / 6), min);
      const points: Pt[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      return polygon(points);
    }
  }
}

function polygon(points: Pt[]): string {
  return `<polygon points="${points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}"/>`;
}

/**
 * Links are built as a list of segments (straight, arc or cubic curve), so they
 * can be cut exactly where they leave a node, and written out as plain SVG.
 */
type Seg =
  | { t: 'L'; a: Pt; b: Pt }
  | { t: 'C'; a: Pt; c1: Pt; c2: Pt; b: Pt }
  /** A circular arc around (cx, cy), from angle a0 to a1 (radians, y pointing down). */
  | { t: 'A'; cx: number; cy: number; r: number; a0: number; a1: number };

/** Where a link stops short of a node. All nodes share one shape and size. */
export interface Trim {
  shape: NodeShape;
  /** Half the node width, at the point where the line should end. */
  half: number;
  /** Corner radius of the rounded square at that size. */
  corner: number;
}

const pt = (p: Pt) => `${fmt(p.x)} ${fmt(p.y)}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const arcPoint = (g: { cx: number; cy: number; r: number }, angle: number): Pt => ({
  x: g.cx + g.r * Math.cos(angle),
  y: g.cy + g.r * Math.sin(angle),
});

function segStart(seg: Seg): Pt {
  return seg.t === 'A' ? arcPoint(seg, seg.a0) : seg.a;
}

function segEnd(seg: Seg): Pt {
  return seg.t === 'A' ? arcPoint(seg, seg.a1) : seg.b;
}

function segAt(seg: Seg, t: number): Pt {
  switch (seg.t) {
    case 'L':
      return lerp(seg.a, seg.b, t);
    case 'A':
      return arcPoint(seg, seg.a0 + (seg.a1 - seg.a0) * t);
    case 'C': {
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      return {
        x: w[0] * seg.a.x + w[1] * seg.c1.x + w[2] * seg.c2.x + w[3] * seg.b.x,
        y: w[0] * seg.a.y + w[1] * seg.c1.y + w[2] * seg.c2.y + w[3] * seg.b.y,
      };
    }
  }
}

/** The part of a segment from `t` to its end. */
function segFrom(seg: Seg, t: number): Seg {
  switch (seg.t) {
    case 'L':
      return { t: 'L', a: lerp(seg.a, seg.b, t), b: seg.b };
    case 'A':
      return { ...seg, a0: seg.a0 + (seg.a1 - seg.a0) * t };
    case 'C': {
      // de Casteljau: split at t and keep the second half.
      const ab = lerp(seg.a, seg.c1, t);
      const bc = lerp(seg.c1, seg.c2, t);
      const cd = lerp(seg.c2, seg.b, t);
      const abc = lerp(ab, bc, t);
      const bcd = lerp(bc, cd, t);
      return { t: 'C', a: lerp(abc, bcd, t), c1: bcd, c2: cd, b: seg.b };
    }
  }
}

function reverseSeg(seg: Seg): Seg {
  switch (seg.t) {
    case 'L':
      return { t: 'L', a: seg.b, b: seg.a };
    case 'A':
      return { ...seg, a0: seg.a1, a1: seg.a0 };
    case 'C':
      return { t: 'C', a: seg.b, c1: seg.c2, c2: seg.c1, b: seg.a };
  }
}

const reversePath = (segs: Seg[]) => segs.map(reverseSeg).reverse();

/** Is this point inside a node of this shape, centred on `c`? */
export function insideNode(trim: Trim, c: Pt, p: Pt): boolean {
  const dx = Math.abs(p.x - c.x);
  const dy = Math.abs(p.y - c.y);
  const h = trim.half;
  switch (trim.shape) {
    case 'circle':
      return Math.hypot(dx, dy) <= h;
    case 'square':
      return dx <= h && dy <= h;
    case 'rounded': {
      const r = Math.min(trim.corner, h);
      const qx = dx - (h - r);
      const qy = dy - (h - r);
      return dx <= h && dy <= h && Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= r;
    }
    case 'diamond':
      return dx + dy <= h;
    case 'hexagon':
      return dy <= (Math.sqrt(3) / 2) * h && Math.sqrt(3) * dx + dy <= Math.sqrt(3) * h;
  }
}

/**
 * Cut the start of a path where it leaves the node it starts in. Nodes are
 * convex and the path starts at their centre, so it leaves exactly once.
 * Returns null if the whole path lies inside the node.
 */
function trimStart(segs: Seg[], inside: (p: Pt) => boolean): Seg[] | null {
  const rest = [...segs];
  while (rest.length) {
    const seg = rest[0];
    if (inside(segEnd(seg))) {
      rest.shift();
      continue;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (inside(segAt(seg, mid))) lo = mid;
      else hi = mid;
    }
    rest[0] = segFrom(seg, hi);
    return rest;
  }
  return null;
}

function trimPath(segs: Seg[], trim: Trim, from: Pt, to: Pt): Seg[] | null {
  const start = trimStart(segs, (p) => insideNode(trim, from, p));
  if (!start) return null;
  const end = trimStart(reversePath(start), (p) => insideNode(trim, to, p));
  return end ? reversePath(end) : null;
}

function segLength(seg: Seg): number {
  switch (seg.t) {
    case 'L':
      return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
    case 'A':
      return seg.r * Math.abs(seg.a1 - seg.a0);
    case 'C': {
      // Add up short straight pieces along the curve.
      let total = 0;
      let last = seg.a;
      for (let i = 1; i <= 32; i++) {
        const p = segAt(seg, i / 32);
        total += Math.hypot(p.x - last.x, p.y - last.y);
        last = p;
      }
      return total;
    }
  }
}

/** Dash look, as it appears on screen: dash and gap lengths, and how far a cap sticks out at each end. */
export interface Dash {
  dash: number;
  gap: number;
  /** Round caps stretch every dash by the line width, so `cap` is the line width. 0 for flat caps. */
  cap: number;
}

/**
 * Fit the dashes to one link so it starts and ends on a dash, with the same gap
 * all the way along. A link always gets at least two dashes, so a short link
 * still shows a gap instead of looking solid. Returns the stroke-dasharray values.
 */
export function fitDash(length: number, { dash, gap, cap }: Dash): string {
  const visible = length + cap;
  const count = Math.max(2, Math.round((visible + gap) / (dash + gap)));
  const scale = visible / (count * dash + (count - 1) * gap);
  const d = Math.max(dash * scale - cap, 0.01);
  const g = gap * scale + cap;
  return `${fmt(d)} ${fmt(g)}`;
}

function segmentsMarkup(segs: Seg[], dash?: Dash): string {
  const extra = dash ? ` stroke-dasharray="${fitDash(segs.reduce((n, seg) => n + segLength(seg), 0), dash)}"` : '';
  if (segs.length === 1 && segs[0].t === 'L') {
    const { a, b } = segs[0];
    return `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}"${extra}/>`;
  }
  let d = `M${pt(segStart(segs[0]))}`;
  for (const seg of segs) {
    if (seg.t === 'L') d += `L${pt(seg.b)}`;
    else if (seg.t === 'C') d += `C${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.b)}`;
    else {
      const sweep = seg.a1 > seg.a0 ? 1 : 0;
      const large = Math.abs(seg.a1 - seg.a0) > Math.PI ? 1 : 0;
      d += `A${fmt(seg.r)} ${fmt(seg.r)} 0 ${large} ${sweep} ${pt(arcPoint(seg, seg.a1))}`;
    }
  }
  return `<path d="${d}"${extra}/>`;
}

/** The route of a link, before any trimming. */
export function linkSegments(a: Pt, b: Pt, bend: 'h' | 'v', mode: LinePath, radius: number): Seg[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (mode === 'straight' || Math.abs(dx) < 0.005 || Math.abs(dy) < 0.005) return [{ t: 'L', a, b }];

  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (mode === 'curved') {
    const c1 = bend === 'h' ? { x: mid.x, y: a.y } : { x: a.x, y: mid.y };
    const c2 = bend === 'h' ? { x: mid.x, y: b.y } : { x: b.x, y: mid.y };
    return [{ t: 'C', a, c1, c2, b }];
  }
  return roundedRoute(
    bend === 'h'
      ? [a, { x: mid.x, y: a.y }, { x: mid.x, y: b.y }, b]
      : [a, { x: a.x, y: mid.y }, { x: b.x, y: mid.y }, b],
    radius,
  );
}

/**
 * One link between two node centres.
 *
 * Straight: a plain line.
 * Elbow: right angles. A sideways or up/down link stays straight (unless
 *   displacement has nudged its ends out of line). A diagonal becomes a step
 *   with two bends, half way across, so the bends never land on a node.
 * Curved: the same route, drawn as an S-curve.
 *
 * `bend` says whether the line leaves the first node sideways ('h') or
 * up/down ('v'). `radius` rounds the elbow bends. With `trim`, the line stops
 * at the edge of each node instead of running to its centre; it returns an
 * empty string if the nodes are so close that nothing is left to draw. With
 * `dash`, the dashes are fitted to this link's length.
 */
export function linkMarkup(
  a: Pt,
  b: Pt,
  bend: 'h' | 'v',
  mode: LinePath,
  radius: number,
  trim?: Trim,
  dash?: Dash,
): string {
  const route = linkSegments(a, b, bend, mode, radius);
  const segs = trim ? trimPath(route, trim, a, b) : route;
  return segs && segs.length ? segmentsMarkup(segs, dash) : '';
}

/**
 * A path through axis-aligned points with the corners rounded by quarter-circle
 * arcs. Each radius is held back so arcs never run past the middle of a
 * segment they share with the next corner.
 */
export function roundedRoute(points: Pt[], radius: number): Seg[] {
  const segs: Seg[] = [];
  let cursor = points[0];
  const lineTo = (p: Pt) => {
    if (Math.hypot(p.x - cursor.x, p.y - cursor.y) > 1e-6) segs.push({ t: 'L', a: cursor, b: p });
    cursor = p;
  };
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const here = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(here.x - prev.x, here.y - prev.y);
    const lenOut = Math.hypot(next.x - here.x, next.y - here.y);
    const r = Math.min(radius, lenIn * (i === 1 ? 1 : 0.5), lenOut * (i === points.length - 2 ? 1 : 0.5));
    if (r < 0.01) {
      lineTo(here);
      continue;
    }
    const inDir = { x: (here.x - prev.x) / lenIn, y: (here.y - prev.y) / lenIn };
    const outDir = { x: (next.x - here.x) / lenOut, y: (next.y - here.y) / lenOut };
    const start = { x: here.x - inDir.x * r, y: here.y - inDir.y * r };
    const end = { x: here.x + outDir.x * r, y: here.y + outDir.y * r };
    // In SVG, y points down, so a positive cross product is a clockwise turn.
    const turn = inDir.x * outDir.y - inDir.y * outDir.x > 0 ? 1 : -1;
    const cx = start.x + outDir.x * r;
    const cy = start.y + outDir.y * r;
    const a0 = Math.atan2(start.y - cy, start.x - cx);
    lineTo(start);
    segs.push({ t: 'A', cx, cy, r, a0, a1: a0 + (turn * Math.PI) / 2 });
    cursor = end;
  }
  lineTo(points[points.length - 1]);
  return segs;
}
