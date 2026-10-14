import { escapeXml, fmt } from './format';
import { type Pt, type ShapeSpec, nodeMarkup, sdfNode, shapeMarkup } from './geometry';
import { hashInts, mulberry32 } from './random';
import type { FillPattern } from './types';

export interface PatternInput {
  pattern: FillPattern;
  /** The area to fill, in px: the node, or the inside of its ring. */
  spec: ShapeSpec;
  c: Pt;
  /** Units to px. */
  scale: number;
  /** 0 to 1. */
  density: number;
  /** Line thickness or dot width, in units. */
  size: number;
  /** Line angle in degrees, anticlockwise from horizontal. */
  angle: number;
  /** This node's own seed, for scattered dots. */
  seed: number;
  /** Unique id for this node's clip shape. */
  clipId: string;
  /** The node has an outline ring, so the outermost concentric ring is skipped. */
  ringed: boolean;
  color: string;
}

/**
 * The marks inside one node, drawn in the node colour.
 *
 * Dots and concentric rings are placed fully inside the shape, so they need no
 * clipping. Parallel lines and cross-hatch are long lines clipped to the shape:
 * the one place the export uses clipPath.
 */
export function patternMarkup(input: PatternInput): { defs: string; body: string } {
  switch (input.pattern) {
    case 'lines':
    case 'hatch':
      return linesPattern(input);
    case 'dots':
      return { defs: '', body: dotsPattern(input) };
    case 'rings':
      return { defs: '', body: ringsPattern(input) };
    default:
      return { defs: '', body: '' };
  }
}

function linesPattern({ pattern, spec, c, density, size, angle, scale, clipId }: PatternInput) {
  // Density 0 gives 2 lines across the node, density 1 gives 16.
  const spacing = (spec.half * 2) / (2 + density * 14);
  const width = size * scale;
  // Long enough to cross the whole shape at any angle.
  const reach = spec.half * Math.SQRT2 + width;
  const lines: string[] = [];
  for (const deg of pattern === 'hatch' ? [angle, angle + 90] : [angle]) {
    const rad = (deg * Math.PI) / 180;
    const along = { x: Math.cos(rad), y: -Math.sin(rad) };
    const across = { x: Math.sin(rad), y: Math.cos(rad) };
    const count = Math.floor(reach / spacing);
    for (let i = -count; i <= count; i++) {
      const offset = i * spacing;
      const half = Math.sqrt(Math.max(reach * reach - offset * offset, 0));
      const mx = c.x + across.x * offset;
      const my = c.y + across.y * offset;
      lines.push(
        `<line x1="${fmt(mx - along.x * half)}" y1="${fmt(my - along.y * half)}" x2="${fmt(mx + along.x * half)}" y2="${fmt(my + along.y * half)}"/>`,
      );
    }
  }
  return {
    defs: `<clipPath id="${clipId}">${shapeMarkup(spec, c)}</clipPath>`,
    body: `<g clip-path="url(#${clipId})">${lines.join('')}</g>`,
  };
}

function dotsPattern({ spec, c, density, size, scale, seed, color }: PatternInput): string {
  const r = (size / 2) * scale;
  const halfUnits = spec.half / scale;
  // About 3 to 40 dots in a node of size 5, more in bigger nodes.
  const wanted = Math.max(1, Math.round((3 + density * 37) * (halfUnits / 5) ** 2));
  const minGap = r * 2.5;
  const random = mulberry32(hashInts(seed, 77));
  const dots: Pt[] = [];
  // Throw darts: keep a dot if it sits fully inside and clear of the others.
  for (let tries = 0; tries < wanted * 25 && dots.length < wanted; tries++) {
    const p = { x: c.x + (random() * 2 - 1) * spec.half, y: c.y + (random() * 2 - 1) * spec.half };
    if (sdfNode(spec, c, p) > -r) continue;
    if (dots.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < minGap)) continue;
    dots.push(p);
  }
  if (!dots.length) return '';
  return `<g fill="${escapeXml(color)}" stroke="none">${dots
    .map((p) => `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}"/>`)
    .join('')}</g>`;
}

function ringsPattern({ spec, c, density, size, scale, ringed }: PatternInput): string {
  if (spec.shape === 'capsule') return '';
  const shape = spec.shape;
  // Density 0 gives 1 ring, density 1 gives 7.
  const count = 1 + Math.round(density * 6);
  const step = spec.half / count;
  const width = size * scale;
  const rings: string[] = [];
  // With an outline ring already drawn on the edge, start one step in.
  for (let i = ringed ? 1 : 0; i < count; i++) {
    const outer = spec.half - i * step;
    if (outer <= width / 2 + 0.01) break;
    rings.push(
      nodeMarkup({
        shape,
        cx: c.x,
        cy: c.y,
        half: outer,
        corner: Math.max(spec.corner - i * step, 0),
        outline: width,
      }),
    );
  }
  return rings.join('');
}
