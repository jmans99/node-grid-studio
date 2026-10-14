import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { measure, render } from './render';
import { DEFAULT_SETTINGS } from './settings';
import type { Scene } from './types';

const { params, style } = DEFAULT_SETTINGS;

type Pt = { x: number; y: number };
function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
/** True when two segments cross strictly inside both (shared end points do not count). */
function properlyCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function diagonalsCross(scene: Scene) {
  const at = new Map(scene.nodes.map((n) => [n.id, n]));
  const diagonals = scene.links.filter((l) => l.kind === 'd');
  for (let i = 0; i < diagonals.length; i++) {
    for (let j = i + 1; j < diagonals.length; j++) {
      const [a, b] = [diagonals[i], diagonals[j]];
      if (properlyCross(at.get(a.from)!, at.get(a.to)!, at.get(b.from)!, at.get(b.to)!)) return true;
    }
  }
  return false;
}

describe('generate', () => {
  it('gives about 38 links at the defaults', () => {
    expect(generate(params).links.length).toBe(38);
  });

  it('puts 8 x 6 nodes on the grid', () => {
    expect(generate(params).nodes.length).toBe(48);
  });

  it('is repeatable: same settings, same picture', () => {
    const a = render(generate(params), style);
    const b = render(generate(params), style);
    expect(a).toBe(b);
    const moved = { ...params, displacement: 25 };
    expect(render(generate(moved), style)).toBe(render(generate(moved), style));
  });

  it('changes with the seed', () => {
    const a = render(generate(params), style);
    const b = render(generate({ ...params, seed: 43 }), style);
    expect(a).not.toBe(b);
  });

  it('never lets two diagonals cross, at any density', () => {
    for (const seed of [0, 1, 42, 777, 9999]) {
      const scene = generate({ ...params, density: 1, seed });
      expect(diagonalsCross(scene)).toBe(false);
    }
  });

  it('only adds links when density goes up', () => {
    const low = new Set(generate({ ...params, density: 0.2 }).links.map((l) => l.id));
    const high = new Set(generate({ ...params, density: 0.6 }).links.map((l) => l.id));
    for (const id of low) expect(high.has(id)).toBe(true);
    expect(high.size).toBeGreaterThan(low.size);
  });

  it('draws no links at density 0', () => {
    expect(generate({ ...params, density: 0 }).links.length).toBe(0);
  });

  it('only uses the 8 neighbours', () => {
    const at = new Map(generate(params).nodes.map((n) => [n.id, n]));
    for (const l of generate({ ...params, density: 1 }).links) {
      const a = at.get(l.from)!;
      const b = at.get(l.to)!;
      expect(Math.abs(a.col - b.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.row - b.row)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps nodes on the grid with no displacement, and moves them with it', () => {
    const flat = generate(params);
    expect(flat.nodes.every((n) => n.x === n.gx && n.y === n.gy)).toBe(true);
    const bent = generate({ ...params, displacement: 20 });
    expect(bent.nodes.some((n) => n.x !== n.gx || n.y !== n.gy)).toBe(true);
    expect(bent.nodes.every((n) => Math.hypot(n.x - n.gx, n.y - n.gy) <= 20 * Math.SQRT2 + 1e-9)).toBe(true);
  });
});

describe('render', () => {
  it('fits a 160 x 120 viewBox at the defaults (the nodes plus one node size of edge)', () => {
    const m = measure(generate(params), style);
    expect([m.width, m.height]).toEqual([160, 120]);
    expect(render(generate(params), style)).toContain('viewBox="0 0 160 120"');
  });

  it('uses no patterns or filters', () => {
    const svg = render(generate({ ...params, displacement: 10 }), style);
    expect(svg).not.toMatch(/<pattern|<filter/);
  });
});
