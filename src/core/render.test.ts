import { describe, expect, it } from 'vitest';
import { BRAND, bluePalette } from '../brand';
import { lighten, mix, normalizeHex } from './color';
import { generate } from './generate';
import { fitDash, insideNode, linkMarkup } from './geometry';
import { measure, render } from './render';
import { DEFAULT_SETTINGS } from './settings';
import type { NodeShape, Style } from './types';

const { params } = DEFAULT_SETTINGS;
const baseStyle = DEFAULT_SETTINGS.style;
const draw = (patch: Partial<Style>, p = params) => render(generate(p), { ...baseStyle, ...patch });
const withCanvas = (patch: Partial<Style['canvas']>): Partial<Style> => ({ canvas: { ...baseStyle.canvas, ...patch } });

describe('colour helpers', () => {
  it('normalises hex input', () => {
    expect(normalizeHex('#0af')).toBe('#00AAFF');
    expect(normalizeHex('00aeef')).toBe('#00AEEF');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('nope')).toBeNull();
  });
  it('mixes colours', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(lighten('#00AEEF', 0)).toBe('#00AEEF');
  });
});

describe('background modes', () => {
  it('paper and navy use the brand backgrounds', () => {
    expect(draw({ backgroundMode: 'paper' })).toContain(`id="background" width="150" height="110" fill="${BRAND.offWhite}"`);
    expect(draw({ backgroundMode: 'navy' })).toContain(`fill="${BRAND.navy}"/>`);
  });

  it('transparent draws no background', () => {
    expect(draw({ backgroundMode: 'transparent' })).not.toContain('id="background"');
  });

  it('blue only uses nothing but shades of UNICEF blue', () => {
    const svg = draw({ backgroundMode: 'blue', nodeStyle: 'both' });
    const colours = new Set(svg.match(/#[0-9A-Fa-f]{6}/g)?.map((c) => c.toUpperCase()));
    const allowed = new Set(Object.values(bluePalette()));
    expect(colours.size).toBeGreaterThan(1);
    for (const c of colours) expect(allowed.has(c)).toBe(true);
    // Every shade keeps the blue hue: red is the smallest channel and blue the largest.
    for (const c of colours) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect(b).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(r);
    }
  });

  it('keeps separate colours per background', () => {
    const navy = { ...baseStyle.palettes.navy, node: '#FF0000' };
    const svg = draw({ backgroundMode: 'navy', palettes: { ...baseStyle.palettes, navy } });
    expect(svg).toContain('fill="#FF0000"');
    expect(draw({ backgroundMode: 'paper', palettes: { ...baseStyle.palettes, navy } })).not.toContain('#FF0000');
  });
});

describe('node shapes and styles', () => {
  const tag: Record<NodeShape, string> = {
    circle: '<circle',
    square: '<rect x=',
    rounded: 'rx=',
    diamond: '<polygon',
    hexagon: '<polygon',
  };
  for (const shape of Object.keys(tag) as NodeShape[]) {
    it(`draws ${shape} nodes`, () => {
      expect(draw({ nodeShape: shape })).toContain(tag[shape]);
    });
  }

  it('hexagons have six corners and diamonds four', () => {
    const corners = (svg: string) => svg.match(/<polygon points="([^"]+)"/)![1].split(' ').length;
    expect(corners(draw({ nodeShape: 'hexagon' }))).toBe(6);
    expect(corners(draw({ nodeShape: 'diamond' }))).toBe(4);
  });

  it('plain squares have no corner radius', () => {
    expect(draw({ nodeShape: 'square' })).not.toContain('rx=');
  });

  it('outline nodes have no fill, and keep their outer size', () => {
    const svg = draw({ nodeStyle: 'outline', outlineWidth: 2, nodeSize: 5 });
    expect(svg).toContain('<g id="nodes" fill="none" stroke="#16171A" stroke-width="2">');
    // Centre line of the ring is pulled in by half the thickness: r = 5 - 1.
    expect(svg).toContain('r="4"');
  });

  it('both uses the outline colour', () => {
    expect(draw({ nodeStyle: 'both' })).toContain(`fill="#16171A" stroke="${baseStyle.palettes.paper.outline}"`);
  });
});

describe('lines', () => {
  it('sets thickness, cap and dashes', () => {
    const svg = draw({ lineWidth: 2, lineCap: 'butt', dashed: true });
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="butt"');
    expect(svg).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
    expect(svg).not.toContain('<g id="links" fill="none" stroke="#A9ADB2" stroke-width="2" stroke-linecap="butt" stroke-dasharray');
    expect(draw({ dashed: false })).not.toContain('stroke-dasharray');
    expect(draw({ lineCap: 'round' })).toContain('stroke-linecap="round"');
  });

  const A = { x: 0, y: 0 };
  const B = { x: 20, y: 20 };

  it('elbow lines with no radius use only right angles', () => {
    expect(linkMarkup(A, B, 'h', 'elbow', 0)).toBe('<path d="M0 0L10 0L10 20L20 20"/>');
    expect(linkMarkup(A, B, 'v', 'elbow', 0)).toBe('<path d="M0 0L0 10L20 10L20 20"/>');
  });

  it('elbow radius rounds the bends with arcs, held back to fit', () => {
    // right then down is a clockwise turn, then down then right is anticlockwise
    expect(linkMarkup(A, B, 'h', 'elbow', 4)).toBe('<path d="M0 0L6 0A4 4 0 0 1 10 4L10 16A4 4 0 0 0 14 20L20 20"/>');
    // Radius 50 is far too big. Each bend stops at 10 (half the middle part).
    expect(linkMarkup(A, B, 'h', 'elbow', 50)).toBe('<path d="M0 0A10 10 0 0 1 10 10A10 10 0 0 0 20 20"/>');
  });

  it('elbow and curved routes only change diagonals when nodes sit on the grid', () => {
    const a = { x: 0, y: 0 };
    expect(linkMarkup(a, { x: 20, y: 0 }, 'h', 'curved', 4)).toContain('<line');
    expect(linkMarkup(a, { x: 0, y: 20 }, 'v', 'elbow', 4)).toContain('<line');
    expect(linkMarkup(a, { x: 20, y: 20 }, 'h', 'curved', 4)).toContain('<path d="M0 0C10 0 10 20 20 20"/>');
    expect(linkMarkup(a, { x: 20, y: 20 }, 'v', 'curved', 4)).toContain('C0 10 20 10 20 20');
  });

  describe('dashes', () => {
    const attrs = (s: string) => s.split(' ').map(Number);

    it('fit each link so it starts and ends on a dash', () => {
      for (const length of [10, 13.7, 20, 33, 80]) {
        const [d, g] = attrs(fitDash(length, { dash: 6, gap: 4.5, cap: 0 }));
        const n = Math.max(2, Math.round((length + g) / (d + g)));
        expect(n * d + (n - 1) * g).toBeCloseTo(length, 1);
      }
    });

    it('always show a gap, even on a short link', () => {
      const [d, g] = attrs(fitDash(8, { dash: 12, gap: 9, cap: 0 }));
      expect(d).toBeLessThan(8 / 2);
      expect(g).toBeGreaterThan(0);
      expect(2 * d + g).toBeCloseTo(8, 1);
    });

    it('keep the same look with round caps, which stretch dashes at both ends', () => {
      const cap = 1.5;
      for (const length of [10, 25, 60]) {
        const [d, g] = attrs(fitDash(length, { dash: 6, gap: 4.5, cap }));
        // On screen a dash is d + cap long and a gap is g - cap.
        const n = Math.max(2, Math.round((length + cap + g - cap) / (d + cap + g - cap)));
        expect(n * d + (n - 1) * g).toBeCloseTo(length, 1);
        expect(g).toBeGreaterThan(cap);
      }
    });

    it('are set on each link, not on the group', () => {
      const svg = draw({ dashed: true });
      expect(svg.match(/stroke-dasharray=/g)!.length).toBe(generate(params).links.length);
    });
  });

  describe('trimming at the node edge', () => {
    const circle = { shape: 'circle' as const, half: 5, corner: 0 };
    const start = (markup: string) => markup.match(/M([\d.-]+) ([\d.-]+)/)!.slice(1).map(Number);
    const reach = (p: number[], c = A) => Math.hypot(p[0] - c.x, p[1] - c.y);

    it('stops a straight line at the edge of both nodes', () => {
      expect(linkMarkup(A, { x: 20, y: 0 }, 'h', 'straight', 0, circle)).toBe('<line x1="5" y1="0" x2="15" y2="0"/>');
    });

    it('draws nothing when the nodes touch', () => {
      expect(linkMarkup(A, { x: 8, y: 0 }, 'h', 'straight', 0, circle)).toBe('');
    });

    it('cuts curved and rounded elbow lines at the edge too', () => {
      for (const mode of ['curved', 'elbow'] as const) {
        const m = linkMarkup(A, B, 'h', mode, 10, circle);
        expect(reach(start(m))).toBeCloseTo(5, 1); // output is rounded to 2 decimals
        const end = m.match(/([\d.-]+) ([\d.-]+)"\/>$/)!.slice(1).map(Number);
        expect(reach(end, B)).toBeCloseTo(5, 1);
      }
    });

    it('knows each node shape', () => {
      const c = { x: 0, y: 0 };
      const at = (shape: 'circle' | 'square' | 'rounded' | 'diamond' | 'hexagon', x: number, y: number) =>
        insideNode({ shape, half: 5, corner: 2 }, c, { x, y });
      expect(at('square', 4.9, 4.9)).toBe(true);
      expect(at('rounded', 4.9, 4.9)).toBe(false);
      expect(at('circle', 3.6, 3.6)).toBe(false);
      expect(at('diamond', 2, 2)).toBe(true);
      expect(at('diamond', 3, 3)).toBe(false);
      expect(at('hexagon', 4.9, 0)).toBe(true);
      expect(at('hexagon', 0, 4.4)).toBe(false);
      expect(at('hexagon', 0, 4.3)).toBe(true);
    });

    it('outline-only nodes show no line inside the ring', () => {
      const scene = generate(params);
      const svg = render(scene, { ...baseStyle, nodeStyle: 'outline', outlineWidth: 1 });
      const ends = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].flatMap((m) => [
        { x: +m[1], y: +m[2] },
        { x: +m[3], y: +m[4] },
      ]);
      expect(ends.length).toBe(scene.links.length * 2);
      const centres = scene.nodes.map((n) => ({ x: n.x + 5, y: n.y + 5 }));
      for (const e of ends) {
        const nearest = Math.min(...centres.map((c) => Math.hypot(e.x - c.x, e.y - c.y)));
        // 5 - 0.5 (middle of the 1-wide ring) + 0.5 (round cap) = 5
        expect(nearest).toBeGreaterThanOrEqual(4.99);
      }
    });

    it('plain solid lines are still centre to centre under filled nodes', () => {
      const scene = generate(params);
      const first = scene.links[0];
      const a = scene.nodes.find((n) => n.id === first.from)!;
      const b = scene.nodes.find((n) => n.id === first.to)!;
      expect(draw({})).toContain(`<line x1="${a.x + 5}" y1="${a.y + 5}" x2="${b.x + 5}" y2="${b.y + 5}"/>`);
    });
  });

  it('straight is the default look', () => {
    expect(draw({ linePath: 'straight' })).not.toContain('<path');
  });
});

describe('canvas', () => {
  it('fit pattern keeps the 150 x 110 default, and adds the margin on each side', () => {
    expect(measure(generate(params), baseStyle)).toMatchObject({ width: 150, height: 110, scale: 1 });
    expect(measure(generate(params), { ...baseStyle, ...withCanvas({ margin: 10 }) })).toMatchObject({
      width: 170,
      height: 130,
    });
  });

  it('centres the pattern on a preset canvas, with the margin as the closest gap', () => {
    const scene = generate(params);
    for (const [preset, width, height] of [
      ['1:1', 1080, 1080],
      ['16:9', 1920, 1080],
      ['4:5', 1080, 1350],
      ['a4', 794, 1123],
    ] as const) {
      const m = measure(scene, { ...baseStyle, ...withCanvas({ preset, width, height, margin: 60 }) });
      expect([m.width, m.height]).toEqual([width, height]);
      const { x, y, width: pw, height: ph } = m.pattern;
      expect(x).toBeCloseTo(width - (x + pw), 6);
      expect(y).toBeCloseTo(height - (y + ph), 6);
      expect(Math.min(x, y)).toBeCloseTo(60, 6);
    }
  });

  it('puts the output in the SVG size, with nothing drawn outside the canvas', () => {
    const svg = draw(withCanvas({ preset: 'custom', width: 600, height: 300, margin: 20 }));
    expect(svg).toContain('width="600" height="300" viewBox="0 0 600 300"');
    for (const [, v] of svg.matchAll(/\b(?:cx|cy)="([\d.]+)"/g)) {
      expect(Number(v)).toBeGreaterThanOrEqual(20);
      expect(Number(v)).toBeLessThanOrEqual(580);
    }
  });

  it('scales line thickness with the picture, with no transform needed', () => {
    const svg = draw(withCanvas({ preset: '1:1', width: 1500, height: 1500, margin: 0 }));
    expect(svg).not.toContain('transform');
    const k = measure(generate(params), { ...baseStyle, ...withCanvas({ preset: '1:1', width: 1500, height: 1500 }) }).scale;
    expect(svg).toContain(`stroke-width="${Math.round(k * 100) / 100}"`);
  });
});

describe('export is clean', () => {
  it('never uses pattern, filter, mask or transform, in any combination', () => {
    const shapes: NodeShape[] = ['circle', 'square', 'rounded', 'diamond', 'hexagon'];
    for (const nodeShape of shapes) {
      for (const linePath of ['straight', 'elbow', 'curved'] as const) {
        for (const nodeStyle of ['filled', 'outline', 'both'] as const) {
          const svg = draw(
            { nodeShape, linePath, nodeStyle, dashed: true, backgroundMode: 'blue', ...withCanvas({ preset: '16:9', width: 1920, height: 1080, margin: 80 }) },
            { ...params, displacement: 15, density: 1 },
          );
          expect(svg).not.toMatch(/<pattern|<filter|<mask|<clipPath|transform=|NaN|undefined/);
        }
      }
    }
  });

  it('is repeatable', () => {
    const style = { ...baseStyle, linePath: 'curved' as const, nodeShape: 'hexagon' as const };
    const p = { ...params, displacement: 18 };
    expect(render(generate(p), style)).toBe(render(generate(p), style));
  });
});
