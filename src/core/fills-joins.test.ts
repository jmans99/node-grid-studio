import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { type ShapeSpec, insetSpec, nodeMarkup, sdfNode, shapeMarkup } from './geometry';
import { barMarkup } from './joins';
import { patternMarkup } from './patterns';
import { render } from './render';
import { DEFAULT_SETTINGS } from './settings';
import type { FillPattern, NodeShape, Style } from './types';

const { params } = DEFAULT_SETTINGS;
const baseStyle = DEFAULT_SETTINGS.style;
const draw = (patch: Partial<Style>, p = params) => render(generate(p), { ...baseStyle, ...patch });
const SHAPES: NodeShape[] = ['circle', 'square', 'rounded', 'diamond', 'hexagon'];
const O = { x: 0, y: 0 };
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

describe('distance to a node outline', () => {
  const spec = (shape: NodeShape): ShapeSpec => ({ shape, half: 5, corner: 2 });
  it('is exact for each shape', () => {
    expect(sdfNode(spec('circle'), O, { x: 8, y: 0 })).toBeCloseTo(3);
    expect(sdfNode(spec('square'), O, { x: 8, y: 0 })).toBeCloseTo(3);
    expect(sdfNode(spec('square'), O, { x: 8, y: 9 })).toBeCloseTo(5);
    expect(sdfNode(spec('rounded'), O, { x: 7, y: 7 })).toBeCloseTo(Math.hypot(4, 4) - 2);
    expect(sdfNode(spec('diamond'), O, { x: 8, y: 0 })).toBeCloseTo(3);
    expect(sdfNode(spec('hexagon'), O, { x: 8, y: 0 })).toBeCloseTo(3);
    expect(sdfNode(spec('hexagon'), O, { x: 0, y: 8 })).toBeCloseTo(8 - (5 * Math.sqrt(3)) / 2);
    expect(sdfNode(spec('circle'), O, O)).toBeCloseTo(-5);
  });

  it('insets shapes the same way outlines do', () => {
    for (const shape of SHAPES) {
      const outer: ShapeSpec = { shape, half: 6, corner: shape === 'rounded' ? 2.5 : 0 };
      expect(shapeMarkup(insetSpec(outer, 1), { x: 10, y: 10 })).toBe(
        nodeMarkup({ shape, cx: 10, cy: 10, half: 6, corner: 2.5, outline: 2 }),
      );
    }
  });
});

describe('fill patterns', () => {
  const base = {
    spec: { shape: 'circle' as const, half: 10, corner: 0 },
    c: { x: 50, y: 50 },
    scale: 2,
    density: 0.5,
    size: 0.6,
    angle: 45,
    seed: 1234,
    clipId: 'x',
    ringed: false,
    color: '#000000',
  };

  it('solid is the default and adds nothing', () => {
    const svg = draw({});
    expect(svg).not.toContain('node-patterns');
    expect(svg).not.toContain('clipPath');
  });

  it('places scattered dots fully inside every shape, from the seed', () => {
    for (const shape of SHAPES) {
      const spec = { shape, half: 10, corner: 3 };
      const body = patternMarkup({ ...base, pattern: 'dots', spec }).body;
      const dots = [...body.matchAll(/cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
      expect(dots.length).toBeGreaterThan(2);
      for (const [, x, y, r] of dots) expect(sdfNode(spec, base.c, { x: +x, y: +y })).toBeLessThanOrEqual(-+r + 0.02);
      expect(body).not.toContain('clip-path');
    }
    const a = patternMarkup({ ...base, pattern: 'dots' }).body;
    expect(patternMarkup({ ...base, pattern: 'dots' }).body).toBe(a);
    expect(patternMarkup({ ...base, pattern: 'dots', seed: 99 }).body).not.toBe(a);
  });

  it('more density means more marks', () => {
    for (const pattern of ['dots', 'lines', 'rings'] as FillPattern[]) {
      const few = patternMarkup({ ...base, pattern, density: 0.1 }).body;
      const many = patternMarkup({ ...base, pattern, density: 0.9 }).body;
      expect(count(many, /<(circle|line|rect|polygon)/g)).toBeGreaterThan(count(few, /<(circle|line|rect|polygon)/g));
    }
  });

  it('clips lines and cross-hatch to the node, and hatch has two directions', () => {
    const lines = patternMarkup({ ...base, pattern: 'lines' });
    const hatch = patternMarkup({ ...base, pattern: 'hatch' });
    expect(lines.defs).toBe('<clipPath id="x"><circle cx="50" cy="50" r="10"/></clipPath>');
    expect(lines.body).toMatch(/^<g clip-path="url\(#x\)">/);
    expect(count(hatch.body, /<line/g)).toBe(2 * count(lines.body, /<line/g));
  });

  it('turns lines with the angle', () => {
    const flat = patternMarkup({ ...base, pattern: 'lines', angle: 0 }).body;
    const [, y1, , y2] = flat.match(/y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/)!.map(Number);
    expect(y1).toBeCloseTo(y2);
    const steep = patternMarkup({ ...base, pattern: 'lines', angle: 90 }).body;
    const [, x1, x2] = steep.match(/x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"/)!.map(Number);
    expect(x1).toBeCloseTo(x2);
  });

  it('draws concentric rings inside the shape, without clipping', () => {
    expect(count(patternMarkup({ ...base, pattern: 'rings', density: 0 }).body, /<circle/g)).toBe(1);
    expect(count(patternMarkup({ ...base, pattern: 'rings', density: 1 }).body, /<circle/g)).toBe(7);
    // With an outline ring already on the edge, the first ring is skipped.
    expect(count(patternMarkup({ ...base, pattern: 'rings', density: 1, ringed: true }).body, /<circle/g)).toBe(6);
    expect(patternMarkup({ ...base, pattern: 'rings' }).defs).toBe('');
  });

  it('uses clipPath only for lines and cross-hatch, one per patterned node, with unique ids', () => {
    for (const fillPattern of ['empty', 'dots', 'rings'] as FillPattern[]) {
      expect(draw({ fillPattern })).not.toContain('clipPath');
    }
    const svg = draw({ fillPattern: 'hatch' });
    const ids = [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((x) => x[1]);
    expect(ids.length).toBe(48);
    expect(new Set(ids).size).toBe(48);
    for (const id of ids) expect(svg).toContain(`clip-path="url(#${id})"`);
  });

  it('empty leaves the inside open', () => {
    const svg = draw({ fillPattern: 'empty' });
    expect(svg).not.toContain('id="nodes"');
    expect(draw({ fillPattern: 'empty', nodeStyle: 'both' })).toContain('id="node-outlines"');
  });

  it('mix sets the share of patterned nodes; raising it only adds more', () => {
    const patternedIds = (mix: number) =>
      new Set([...draw({ fillPattern: 'lines', patternMix: mix }).matchAll(/<clipPath id="([^"]+)"/g)].map((x) => x[1]));
    expect(patternedIds(0).size).toBe(0);
    expect(patternedIds(100).size).toBe(48);
    const some = patternedIds(30);
    const more = patternedIds(60);
    expect(some.size).toBeGreaterThan(5);
    expect(some.size).toBeLessThan(30);
    for (const id of some) expect(more.has(id)).toBe(true);
    // The rest stay solid.
    expect(count(draw({ fillPattern: 'lines', patternMix: 30 }), /<circle /g)).toBeGreaterThan(48 - some.size - 1);
  });

  it('outline-only nodes have no fill, so no pattern', () => {
    expect(draw({ fillPattern: 'dots', nodeStyle: 'outline' })).not.toContain('node-patterns');
  });

  it('plain lines stop at the edge of patterned nodes instead of showing inside', () => {
    const scene = generate(params);
    const svg = render(scene, { ...baseStyle, fillPattern: 'rings' });
    const ends = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)]
      .slice(0, scene.links.length)
      .flatMap((x) => [
        { x: +x[1], y: +x[2] },
        { x: +x[3], y: +x[4] },
      ]);
    expect(ends.length).toBe(scene.links.length * 2);
    for (const e of ends) {
      const nearest = Math.min(...scene.nodes.map((n) => Math.hypot(e.x - n.x - 10, e.y - n.y - 10)));
      // Node edge at 5, plus half a round-capped line.
      expect(nearest).toBeCloseTo(5.5, 1);
    }
  });
});

describe('joins', () => {
  const circle: ShapeSpec = { shape: 'circle', half: 5, corner: 0 };
  const solidEnd = (c: { x: number; y: number }) => ({ c, spec: circle, solid: true });
  const hollowEnd = (c: { x: number; y: number }) => ({ c, spec: circle, solid: false });
  const B = { x: 40, y: 0 };

  it('plain is the default look', () => {
    expect(draw({})).not.toContain('id="joins"');
  });

  it('merged draws links as bars in the node colour, running into solid nodes', () => {
    const svg = draw({ joinStyle: 'merged', barWidth: 4 });
    expect(svg).toContain('<g id="links" fill="none" stroke="#16171A" stroke-width="4">');
    // Solid nodes hide the bar ends, so no extra pieces are needed.
    expect(svg).not.toContain('id="joins"');
  });

  it('merged fills the gap between a square bar end and a curved hollow node', () => {
    const shapes = barMarkup(O, B, 'h', 'straight', 0, hollowEnd(O), hollowEnd(B), 2, 0)!;
    // The bar stops at the node edge...
    expect(shapes.bar).toBe('<line x1="5" y1="0" x2="35" y2="0"/>');
    // ...and each foot follows the node edge between the two bar edges.
    expect(shapes.feet.length).toBe(2);
    expect(shapes.feet[0]).toMatch(/A5 5 0 0 [01]/);
  });

  it('smooth adds a tangent arc on each side, touching both the bar and the node', () => {
    const r = 3;
    const shapes = barMarkup(O, B, 'h', 'straight', 0, solidEnd(O), solidEnd(B), 2, r)!;
    expect(shapes.feet.length).toBe(2);
    const foot = shapes.feet[0];
    const arcs = [...foot.matchAll(/A3 3 0 0 [01] ([\d.-]+) ([\d.-]+)/g)];
    expect(arcs.length).toBe(2);
    // Each fillet ends on the node edge or on the bar edge.
    const points = [...foot.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((x) => ({ x: +x[1], y: +x[2] }));
    const onBar = points.filter((p) => Math.abs(Math.abs(p.y) - 2) < 0.02 && p.x > 4);
    expect(onBar.length).toBeGreaterThanOrEqual(2);
    for (const [, x, y] of arcs) {
      const p = { x: +x, y: +y };
      const onNode = Math.abs(Math.hypot(p.x, p.y) - 5) < 0.02;
      const onEdge = Math.abs(Math.abs(p.y) - 2) < 0.02;
      expect(onNode || onEdge).toBe(true);
    }
    // The fillet circle sits r from the bar edge and r outside the node: tangent to both.
    // The path is: top corner, then the point where the first fillet leaves the bar.
    const tip = points[1];
    expect(Math.abs(tip.y)).toBeCloseTo(2, 1);
    const centre = { x: tip.x, y: Math.sign(tip.y) * (2 + r) };
    expect(Math.hypot(centre.x, centre.y)).toBeCloseTo(5 + r, 1);
  });

  it('smoothness 0 is the same as merged', () => {
    expect(draw({ joinStyle: 'smooth', smoothness: 0 })).toBe(draw({ joinStyle: 'merged' }));
  });

  it('keeps bars narrow enough to meet the node outline', () => {
    const svg = draw({ joinStyle: 'merged', barWidth: 20, nodeShape: 'diamond' });
    const width = Number(svg.match(/<g id="links" [^>]*stroke-width="([\d.]+)"/)![1]);
    expect(width).toBeLessThanOrEqual(5 * 2 * 0.69 + 0.01);
  });

  it('works for every shape, line path, node style and fill, with no filters or masks', () => {
    for (const nodeShape of SHAPES) {
      for (const linePath of ['straight', 'elbow', 'curved'] as const) {
        for (const nodeStyle of ['filled', 'outline', 'both'] as const) {
          for (const joinStyle of ['merged', 'smooth'] as const) {
            const svg = draw(
              { nodeShape, linePath, nodeStyle, joinStyle, fillPattern: 'dots', patternMix: 50, lineRadius: 6 },
              { ...params, displacement: 8, density: 0.7 },
            );
            expect(svg).not.toMatch(/<pattern|<filter|<mask|transform=|NaN|undefined|Infinity/);
            if (joinStyle === 'smooth') expect(svg).toContain('id="joins"');
          }
        }
      }
    }
  });

  it('is repeatable', () => {
    const style = { ...baseStyle, joinStyle: 'smooth' as const, fillPattern: 'dots' as const, patternMix: 50 };
    expect(render(generate(params), style)).toBe(render(generate(params), style));
  });
});
