import { describe, expect, it } from 'vitest';
import { AUDIENCE_PRESETS } from '../offerings';
import { generate } from './generate';
import { addOffering, applyPreset, defaultOfferings, resolveOfferings, updateOffering } from './offerings';
import { render } from './render';
import { DEFAULT_SETTINGS } from './settings';
import { measureText, wrapTwoLines } from './text';
import { planTitles, titleRequests } from './titles';
import type { OfferingsSettings, Params, Scene, TitleSettings } from './types';

const { style } = DEFAULT_SETTINGS;
const ctx = { nodeSize: 5, blueMode: false };
const big: Params = { ...DEFAULT_SETTINGS.params, columns: 20, rows: 14 };
const preset = (id: string) => AUDIENCE_PRESETS.find((p) => p.id === id)!;
const offers = (id: string, titles: Partial<TitleSettings> = {}, patch: Partial<OfferingsSettings> = {}) => {
  const o = applyPreset(defaultOfferings(), preset(id));
  return { ...o, ...patch, titles: { ...o.titles, ...titles } };
};
const touches = (a: Scene['titles'][number], b: Scene['titles'][number]) =>
  !(a.col + a.cols < b.col || b.col + b.cols < a.col || a.row + a.rows < b.row || b.row + b.rows < a.row);
const capsuleGap = (t: Scene['titles'][number], x: number, y: number) => {
  const reach = Math.max(t.halfW - t.halfH, 0);
  return Math.hypot(Math.max(Math.abs(x - t.cx) - reach, 0), y - t.cy) - t.halfH;
};

describe('title text', () => {
  it('measures with the real font widths', () => {
    expect(measureText('Mapping', 'Manrope', 500, 10)).toBeGreaterThan(30);
    expect(measureText('Mapping', 'Manrope', 600, 10)).toBeGreaterThan(measureText('Mapping', 'Manrope', 300, 10));
    expect(measureText('Mapping', 'Open Sans', 400, 10)).not.toBe(measureText('Mapping', 'Manrope', 400, 10));
  });

  it('wraps onto two balanced lines, but keeps single words whole', () => {
    expect(wrapTwoLines('Procurement on behalf of government', 'Manrope', 500, 5)).toEqual([
      'Procurement on',
      'behalf of government',
    ]);
    expect(wrapTwoLines('Mapping', 'Manrope', 500, 5)).toEqual(['Mapping']);
  });
});

describe('title shapes', () => {
  const reqs = (titles: Partial<TitleSettings> = {}) =>
    titleRequests(resolveOfferings(offers('full-portfolio', titles)), { ...defaultOfferings().titles, ...titles }, {
      nodeSize: 5,
      gapX: 20,
      gapY: 20,
    });
  const get = (list: ReturnType<typeof reqs>, id: string) => list.find((r) => r.offering.id === id)!;

  it('are as many cells wide as the title needs', () => {
    const r = reqs();
    expect(get(r, 'mapping').cols).toBeLessThan(get(r, 'infrastructure-modelling').cols);
    for (const x of r) expect(x.halfW * 2).toBeLessThanOrEqual((x.cols - 1) * 20 + 2 * (20 - 5 - 3) + 1e-6);
  });

  it('use full names when asked, which are wider', () => {
    expect(get(reqs({ names: 'full' }), 'policy-modelling').cols).toBeGreaterThan(get(reqs(), 'policy-modelling').cols);
    expect(get(reqs({ names: 'full' }), 'policy-modelling').lines).toEqual(['Predictive policy and planning modelling']);
  });

  it('wrap to two lines and two rows', () => {
    const r = get(reqs({ wrap: true, names: 'full' }), 'policy-modelling');
    expect(r.lines.length).toBe(2);
    expect(r.rows).toBe(2);
    expect(get(reqs({ wrap: true }), 'mapping').rows).toBe(1);
  });

  it('give lead titles larger text', () => {
    const o = updateOffering(offers('full-portfolio'), 'mapping', { state: 'lead' });
    const r = titleRequests(resolveOfferings(o), o.titles, { nodeSize: 5, gapX: 20, gapY: 20 });
    expect(get(r, 'mapping').fontSize).toBeCloseTo(4.5 * 1.2);
    expect(get(r, 'research').fontSize).toBeCloseTo(4.5);
  });
});

describe('placement', () => {
  it('never overlaps titles, and keeps a free cell between them', () => {
    for (const seed of [1, 42, 999]) {
      const scene = generate({ ...big, seed }, offers('full-portfolio'), ctx);
      for (let i = 0; i < scene.titles.length; i++)
        for (let j = i + 1; j < scene.titles.length; j++) expect(touches(scene.titles[i], scene.titles[j])).toBe(false);
      for (const t of scene.titles) {
        expect(t.col).toBeGreaterThanOrEqual(0);
        expect(t.col + t.cols).toBeLessThanOrEqual(big.columns);
        expect(t.row + t.rows).toBeLessThanOrEqual(big.rows);
      }
    }
  });

  it('is the same every time for the same settings, and changes with the seed', () => {
    const a = generate(big, offers('ict-regulator'), ctx).titles.map((t) => [t.id, t.col, t.row]);
    expect(generate(big, offers('ict-regulator'), ctx).titles.map((t) => [t.id, t.col, t.row])).toEqual(a);
    expect(generate({ ...big, seed: 7 }, offers('ict-regulator'), ctx).titles.map((t) => [t.id, t.col, t.row])).not.toEqual(a);
  });

  it('reports titles that do not fit, draws only those that do, and suggests a grid that fits them all', () => {
    const o = offers('ministry-of-education');
    const small = generate(DEFAULT_SETTINGS.params, o, ctx);
    expect(small.fit).toBeDefined();
    expect(small.fit!.placed).toBeLessThan(small.fit!.total);
    expect(small.titles.length).toBe(small.fit!.placed);
    const s = small.fit!.suggestion!;
    expect(s.columns).toBeGreaterThanOrEqual(8);
    expect(s.rows).toBeGreaterThanOrEqual(6);
    const fitted = generate({ ...DEFAULT_SETTINGS.params, columns: s.columns, rows: s.rows }, o, ctx);
    expect(fitted.fit).toBeUndefined();
    expect(fitted.titles.length).toBe(9);
  });

  it('suggests nothing when even the largest grid is too small', () => {
    let o = offers('full-portfolio', { names: 'full', size: 9 });
    for (let i = 0; i < 12; i++) o = addOffering(o, 'finance', `Extra offering with a long name ${i}`, '', null);
    const scene = generate(DEFAULT_SETTINGS.params, o, ctx);
    expect(scene.fit?.suggestion).toBeNull();
  });

  it('keeps categories together when asked', () => {
    const spread = (keepCategories: boolean) => {
      const scene = generate({ ...big, columns: 25, rows: 20 }, offers('full-portfolio', { keepCategories }), ctx);
      let total = 0;
      let n = 0;
      for (const a of scene.titles)
        for (const b of scene.titles)
          if (a !== b && a.categoryId === b.categoryId) {
            total += Math.hypot(a.cx - b.cx, a.cy - b.cy);
            n++;
          }
      return total / n;
    };
    expect(spread(true)).toBeLessThan(spread(false) * 0.8);
  });

  it('puts a dragged title where it was dropped, if it fits there', () => {
    const scene = generate(big, offers('ict-regulator', { positions: { mapping: { col: 2, row: 9 } } }), ctx);
    expect(scene.titles.find((t) => t.id === 'mapping')).toMatchObject({ col: 2, row: 9 });
    // Off the grid: placed automatically instead.
    const off = generate(big, offers('ict-regulator', { positions: { mapping: { col: 40, row: 9 } } }), ctx);
    expect(off.titles.find((t) => t.id === 'mapping')!.col).toBeLessThan(big.columns);
  });

  it('places hand-placed titles first and works around them', () => {
    const o = offers('ict-regulator');
    const r = titleRequests(resolveOfferings(o), o.titles, { nodeSize: 5, gapX: 20, gapY: 20 });
    const { placed } = planTitles(r, 20, 14, 42, false, { research: { col: 0, row: 0 } });
    expect(placed.get('research')).toEqual({ col: 0, row: 0 });
    expect(placed.size).toBe(r.length);
  });
});

describe('making room', () => {
  it('remove: hides the nodes under a title and drops links between them', () => {
    const scene = generate(big, offers('ict-regulator'), ctx);
    const hidden = new Set(scene.nodes.filter((n) => n.hidden).map((n) => n.id));
    expect(hidden.size).toBe(scene.titles.reduce((s, t) => s + t.cols * t.rows, 0));
    for (const l of scene.links) expect(hidden.has(l.from) && hidden.has(l.to)).toBe(false);
    for (const l of scene.links) {
      if (hidden.has(l.from)) expect(l.titleFrom).toBeDefined();
      if (hidden.has(l.to)) expect(l.titleTo).toBeDefined();
    }
  });

  it('links attach to the title shape, at most once per neighbouring node', () => {
    const scene = generate({ ...big, density: 1 }, offers('ict-regulator'), ctx);
    const pairs = scene.links.filter((l) => l.titleFrom || l.titleTo).map((l) => (l.titleFrom ? `${l.titleFrom}|${l.to}` : `${l.titleTo}|${l.from}`));
    expect(pairs.length).toBeGreaterThan(0);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('push apart: replaces one node per title and moves the others clear of it', () => {
    const scene = generate(big, offers('ict-regulator', { makeRoom: 'push' }), ctx);
    expect(scene.nodes.filter((n) => n.hidden).length).toBe(scene.titles.length);
    for (const t of scene.titles) {
      expect(t.cols).toBe(1);
      for (const n of scene.nodes) if (!n.hidden) expect(capsuleGap(t, n.x, n.y)).toBeGreaterThanOrEqual(5 - 1e-6);
    }
  });

  it('push apart keeps every row in order: nodes slide apart, never past each other', () => {
    const scene = generate(big, offers('ict-regulator', { makeRoom: 'push' }), ctx);
    for (let row = 0; row < big.rows; row++) {
      const xs = scene.nodes.filter((n) => n.row === row).sort((a, b) => a.col - b.col).map((n) => n.x);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });

  it('push apart never makes two nodes overlap, even with many titles', () => {
    for (const seed of [3, 42]) {
      const scene = generate({ ...big, seed }, offers('full-portfolio', { makeRoom: 'push' }), ctx);
      const shown = scene.nodes.filter((n) => !n.hidden);
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++)
          expect(Math.hypot(shown[i].x - shown[j].x, shown[i].y - shown[j].y)).toBeGreaterThanOrEqual(10);
      for (let i = 0; i < scene.titles.length; i++)
        for (let j = i + 1; j < scene.titles.length; j++) {
          const a = scene.titles[i];
          const b = scene.titles[j];
          const apart = Math.abs(a.cx - b.cx) >= a.halfW + b.halfW || Math.abs(a.cy - b.cy) >= a.halfH + b.halfH;
          expect(apart).toBe(true);
        }
    }
  });

  it('in remove mode, no node sits on a title shape either', () => {
    const scene = generate({ ...big, displacement: 12 }, offers('full-portfolio'), ctx);
    for (const t of scene.titles)
      for (const n of scene.nodes) if (!n.hidden) expect(capsuleGap(t, n.x, n.y)).toBeGreaterThanOrEqual(5 - 1e-6);
  });
});

describe('spread and colours', () => {
  it('included offerings spread a paler tint; at strength 1 it matches lead', () => {
    const o = offers('mobile-network-operator', {}, { spread: 1, includedSpread: 0.5 });
    const scene = generate(big, o, ctx);
    const included = scene.titles.find((t) => t.state === 'included')!;
    const lead = scene.titles.find((t) => t.state === 'lead')!;
    const colours = (s: Scene, id: string) =>
      s.links.filter((l) => l.titleFrom === id || l.titleTo === id).map((l) => l.color);
    expect(colours(scene, lead.id).every((c) => c === lead.color)).toBe(true);
    expect(colours(scene, included.id).every((c) => c && c !== included.color)).toBe(true);
    const full = generate(big, { ...o, includedSpread: 1 }, ctx);
    expect(colours(full, included.id).every((c) => c === included.color)).toBe(true);
  });

  it('in blue-only mode, uses shades of UNICEF blue when offering colours are turned off', () => {
    const o = offers('full-portfolio', {}, { blueModeColors: false });
    const blue = generate(big, o, { nodeSize: 5, blueMode: true });
    for (const t of blue.titles) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.color.slice(i, i + 2), 16));
      expect(b).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(r);
    }
    expect(new Set(blue.titles.map((t) => t.color)).size).toBe(blue.titles.length);
    // Turned on (the default), offering colours stay as they are.
    const kept = generate(big, { ...o, blueModeColors: true }, { nodeSize: 5, blueMode: true });
    expect(kept.titles.find((t) => t.id === 'connectivity-credits')!.color).not.toMatch(/^#00/);
  });
});

describe('drawing titles', () => {
  const svgFor = (titles: Partial<TitleSettings> = {}, s = style) => render(generate(big, offers('ict-regulator', titles), ctx), s);

  it('writes each title as live text in a capsule, grouped by offering', () => {
    const svg = svgFor();
    expect(svg).toContain('<g id="title-policy-modelling"><rect ');
    expect(svg).toMatch(/<text x="[\d.]+" y="[\d.]+" font-family="Manrope, 'Open Sans', sans-serif" font-size="[\d.]+" font-weight="500" fill="#[0-9A-F]{6}" text-anchor="middle">Policy modelling<\/text>/);
    expect(svg).not.toMatch(/font-weight="(700|800|900|bold)"/);
    expect(svg).not.toMatch(/<filter|<pattern|<mask|transform=|NaN|undefined/);
  });

  it('switches font, weight, alignment and text colour', () => {
    const svg = svgFor({ font: 'Open Sans', weight: 300, align: 'left', textColor: 'text' });
    expect(svg).toContain(`font-family="'Open Sans', Manrope, sans-serif"`);
    expect(svg).toContain('font-weight="300"');
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain(`fill="${style.palettes.paper.text}" text-anchor="start"`);
  });

  it('writes two lines as one text with two tspans', () => {
    expect(svgFor({ wrap: true, names: 'full' })).toMatch(/<text [^>]+><tspan x="[\d.]+" y="[\d.]+">Predictive policy and<\/tspan><tspan x="[\d.]+" y="[\d.]+">planning modelling<\/tspan><\/text>/);
  });

  it('escapes text that would break the SVG', () => {
    let o = offers('ict-regulator');
    o = addOffering(o, 'finance', 'Risk & <returns>', '', null);
    const svg = render(generate(big, o, ctx), style);
    expect(svg).toContain('Risk &amp; &lt;returns&gt;');
  });

  it('attaches links in every join style without breaking', () => {
    for (const joinStyle of ['plain', 'merged', 'smooth'] as const)
      for (const makeRoom of ['remove', 'push'] as const)
        for (const linePath of ['straight', 'elbow', 'curved'] as const) {
          const svg = render(generate({ ...big, density: 0.6 }, offers('full-portfolio', { makeRoom }), ctx), {
            ...style,
            joinStyle,
            linePath,
            dashed: joinStyle === 'plain',
          });
          expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        }
  });

  it('dashed lines stop at the capsule edge', () => {
    const scene = generate({ ...big, density: 0.6 }, offers('ict-regulator'), ctx);
    const svg = render(scene, { ...style, dashed: true, canvas: { ...style.canvas, margin: 0 } });
    expect(svg).toMatch(/stroke-dasharray/);
  });
});
