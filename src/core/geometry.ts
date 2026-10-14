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

/** A node outline: its shape, half-width and (for the rounded square) corner radius, in px. */
export interface ShapeSpec {
  shape: NodeShape;
  /** Half the width. For the diamond and hexagon, the distance to a corner. */
  half: number;
  /** Corner radius of the rounded square. Ignored for other shapes. */
  corner: number;
}

/** Draw a shape outline exactly as described, with no outline inset. */
export function shapeMarkup(spec: ShapeSpec, c: Pt): string {
  return nodeMarkup({ shape: spec.shape, cx: c.x, cy: c.y, half: spec.half, corner: spec.corner, outline: 0 });
}

/**
 * The same shape with every edge moved inwards by `d` (outwards when `d` is
 * negative). Matches how nodeMarkup pulls a shape in for its outline.
 */
export function insetSpec(spec: ShapeSpec, d: number): ShapeSpec {
  const step = spec.shape === 'diamond' ? d * Math.SQRT2 : spec.shape === 'hexagon' ? d / Math.cos(Math.PI / 6) : d;
  const half = Math.max(spec.half - step, 0.01);
  const corner = spec.shape === 'rounded' ? Math.max(Math.min(spec.corner, spec.half) - d, 0) : 0;
  return { shape: spec.shape, half, corner: Math.min(corner, half) };
}

function sdBox(x: number, y: number, h: number): number {
  const qx = Math.abs(x) - h;
  const qy = Math.abs(y) - h;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/**
 * Signed distance from a point to a node outline: negative inside, 0 on the
 * edge, the true distance outside. Exact for all five shapes.
 */
export function sdfNode(spec: ShapeSpec, c: Pt, p: Pt): number {
  const x = p.x - c.x;
  const y = p.y - c.y;
  const h = spec.half;
  switch (spec.shape) {
    case 'circle':
      return Math.hypot(x, y) - h;
    case 'square':
      return sdBox(x, y, h);
    case 'rounded': {
      const r = Math.min(spec.corner, h);
      return sdBox(x, y, h - r) - r;
    }
    case 'diamond':
      // A square turned 45 degrees.
      return sdBox((x + y) / Math.SQRT2, (y - x) / Math.SQRT2, h / Math.SQRT2);
    case 'hexagon': {
      // Corners point left and right; flat top and bottom.
      const apothem = (h * Math.sqrt(3)) / 2;
      const kx = -Math.sqrt(3) / 2;
      const ky = 0.5;
      const kz = 1 / Math.sqrt(3);
      let px = Math.abs(x);
      let py = Math.abs(y);
      const fold = 2 * Math.min(kx * px + ky * py, 0);
      px -= fold * kx;
      py -= fold * ky;
      px -= Math.max(-kz * apothem, Math.min(kz * apothem, px));
      py -= apothem;
      return Math.hypot(px, py) * Math.sign(py);
    }
  }
}

/** Is this point inside the node outline? */
export function insideNode(spec: ShapeSpec, c: Pt, p: Pt): boolean {
  return sdfNode(spec, c, p) <= 0;
}

/** Corner points of the straight-sided shapes, or null for circle and rounded square. */
export function shapeVertices(spec: ShapeSpec, c: Pt): Pt[] | null {
  const h = spec.half;
  switch (spec.shape) {
    case 'square':
      return [
        { x: c.x - h, y: c.y - h },
        { x: c.x + h, y: c.y - h },
        { x: c.x + h, y: c.y + h },
        { x: c.x - h, y: c.y + h },
      ];
    case 'diamond':
      return [
        { x: c.x - h, y: c.y },
        { x: c.x, y: c.y - h },
        { x: c.x + h, y: c.y },
        { x: c.x, y: c.y + h },
      ];
    case 'hexagon':
      return Array.from({ length: 6 }, (_, i) => ({
        x: c.x + h * Math.cos((Math.PI / 3) * i),
        y: c.y + h * Math.sin((Math.PI / 3) * i),
      }));
    default:
      return null;
  }
}

/**
 * Links are built as a list of segments (straight, arc or cubic curve), so they
 * can be cut exactly where they leave a node, and written out as plain SVG.
 */
export type Seg =
  | { t: 'L'; a: Pt; b: Pt }
  | { t: 'C'; a: Pt; c1: Pt; c2: Pt; b: Pt }
  /** A circular arc around (cx, cy), from angle a0 to a1 (radians, y pointing down). */
  | { t: 'A'; cx: number; cy: number; r: number; a0: number; a1: number };

export const pt = (p: Pt) => `${fmt(p.x)} ${fmt(p.y)}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const arcPoint = (g: { cx: number; cy: number; r: number }, angle: number): Pt => ({
  x: g.cx + g.r * Math.cos(angle),
  y: g.cy + g.r * Math.sin(angle),
});

export function segStart(seg: Seg): Pt {
  return seg.t === 'A' ? arcPoint(seg, seg.a0) : seg.a;
}

function segEnd(seg: Seg): Pt {
  return seg.t === 'A' ? arcPoint(seg, seg.a1) : seg.b;
}

export function segAt(seg: Seg, t: number): Pt {
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

const unit = (v: Pt): Pt | null => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : null;
};

/** Direction the segment is heading at `t`, as a unit vector. */
export function segTangentAt(seg: Seg, t: number): Pt {
  if (seg.t === 'C' && t > 1e-6) {
    const u = 1 - t;
    const d = {
      x: 3 * u * u * (seg.c1.x - seg.a.x) + 6 * u * t * (seg.c2.x - seg.c1.x) + 3 * t * t * (seg.b.x - seg.c2.x),
      y: 3 * u * u * (seg.c1.y - seg.a.y) + 6 * u * t * (seg.c2.y - seg.c1.y) + 3 * t * t * (seg.b.y - seg.c2.y),
    };
    return unit(d) ?? segTangentStart(seg);
  }
  if (seg.t === 'A') {
    const turn = Math.sign(seg.a1 - seg.a0) || 1;
    const angle = seg.a0 + (seg.a1 - seg.a0) * t;
    return { x: -Math.sin(angle) * turn, y: Math.cos(angle) * turn };
  }
  return segTangentStart(seg);
}

/** Direction the segment is heading at its start, as a unit vector. */
export function segTangentStart(seg: Seg): Pt {
  switch (seg.t) {
    case 'L':
      return unit({ x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y }) ?? { x: 1, y: 0 };
    case 'A': {
      const turn = Math.sign(seg.a1 - seg.a0) || 1;
      return { x: -Math.sin(seg.a0) * turn, y: Math.cos(seg.a0) * turn };
    }
    case 'C':
      return (
        unit({ x: seg.c1.x - seg.a.x, y: seg.c1.y - seg.a.y }) ??
        unit({ x: seg.c2.x - seg.a.x, y: seg.c2.y - seg.a.y }) ??
        unit({ x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y }) ?? { x: 1, y: 0 }
      );
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

export const reversePath = (segs: Seg[]) => segs.map(reverseSeg).reverse();

export function segLength(seg: Seg): number {
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

export const pathLength = (segs: Seg[]) => segs.reduce((n, seg) => n + segLength(seg), 0);

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

/** A node to cut a path at: its outline and centre. */
export interface Stop {
  spec: ShapeSpec;
  c: Pt;
}

/** Cut a path where it leaves its first node and enters its last. A null end is left alone. */
export function trimPath(segs: Seg[], from: Stop | null, to: Stop | null): Seg[] | null {
  const start = from ? trimStart(segs, (p) => insideNode(from.spec, from.c, p)) : segs;
  if (!start) return null;
  if (!to) return start;
  const end = trimStart(reversePath(start), (p) => insideNode(to.spec, to.c, p));
  return end ? reversePath(end) : null;
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
 * all the way along. The dash count is the nearest whole number to what the
 * dash length and gap ask for, so a short link may get a single dash (and look
 * solid) instead of being squeezed into tiny stubs. Returns the
 * stroke-dasharray values.
 */
export function fitDash(length: number, { dash, gap, cap }: Dash): string {
  const visible = length + cap;
  const count = Math.max(1, Math.round((visible + gap) / (dash + gap)));
  const scale = visible / (count * dash + (count - 1) * gap);
  const d = Math.max(dash * scale - cap, 0.01);
  const g = gap * scale + cap;
  return `${fmt(d)} ${fmt(g)}`;
}

export function segmentsMarkup(segs: Seg[], dash?: Dash): string {
  const extra = dash ? ` stroke-dasharray="${fitDash(pathLength(segs), dash)}"` : '';
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

/**
 * The route of a link between two node centres, before any trimming.
 *
 * Straight: a plain line.
 * Elbow: right angles. A sideways or up/down link stays straight (unless
 *   displacement has nudged its ends out of line). A diagonal becomes a step
 *   with two bends, half way across, so the bends never land on a node.
 * Curved: the same route, drawn as an S-curve.
 *
 * `bend` says whether the line leaves the first node sideways ('h') or
 * up/down ('v'). `radius` rounds the elbow bends.
 */
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

export interface LinkOptions {
  /** Stop the line at the edge of this outline around the first node, instead of its centre. */
  trimFrom?: ShapeSpec;
  /** Same for the last node. */
  trimTo?: ShapeSpec;
  /** Fit dashes to this link. */
  dash?: Dash;
}

/**
 * One plain link between two node centres. Returns an empty string if the
 * nodes are so close that nothing is left to draw after trimming.
 */
export function linkMarkup(
  a: Pt,
  b: Pt,
  bend: 'h' | 'v',
  mode: LinePath,
  radius: number,
  { trimFrom, trimTo, dash }: LinkOptions = {},
): string {
  const route = linkSegments(a, b, bend, mode, radius);
  const segs = trimPath(route, trimFrom ? { spec: trimFrom, c: a } : null, trimTo ? { spec: trimTo, c: b } : null);
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
