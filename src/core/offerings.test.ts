import { describe, expect, it } from 'vitest';
import { AUDIENCE_PRESETS, CATEGORIES } from '../offerings';
import { generate } from './generate';
import {
  addCategory,
  addOffering,
  applyPreset,
  cycleState,
  defaultOfferings,
  matchingPreset,
  removeCategory,
  resolveOfferings,
  shadeFor,
  updateCategory,
  updateOffering,
} from './offerings';
import { render } from './render';
import { DEFAULT_SETTINGS } from './settings';
import type { OfferingsSettings } from './types';

const { params, style } = DEFAULT_SETTINGS;
const preset = (id: string) => AUDIENCE_PRESETS.find((p) => p.id === id)!;
const withPreset = (id: string, patch: Partial<OfferingsSettings> = {}) => ({
  ...applyPreset(defaultOfferings(), preset(id)),
  ...patch,
});

describe('offerings data', () => {
  it('has the six categories and 18 offerings', () => {
    expect(CATEGORIES.map((c) => [c.name, c.color])).toEqual([
      ['Modelling', '#7E8CFF'],
      ['Finance', '#22B99A'],
      ['Sustainable business models', '#A3C93A'],
      ['Network and data solutions', '#00AEEF'],
      ['Ecosystem readiness', '#F2A93B'],
      ['Procurement', '#EC6A8C'],
    ]);
    const items = defaultOfferings().items;
    expect(items.length).toBe(18);
    expect(new Set(items.map((i) => i.id)).size).toBe(18);
    expect(items.find((i) => i.id === 'policy-modelling')).toMatchObject({
      name: 'Predictive policy and planning modelling',
      short: 'Policy modelling',
    });
    expect(items.find((i) => i.id === 'mapping')!.short).toBe('Mapping');
  });

  it('starts with everything off, so the plain grid is unchanged', () => {
    expect(defaultOfferings().items.every((i) => i.state === 'off')).toBe(true);
    expect(render(generate(params, defaultOfferings()), style)).toBe(render(generate(params), style));
  });

  it('presets only name real offerings, and full portfolio includes everything', () => {
    const ids = new Set(defaultOfferings().items.map((i) => i.id));
    for (const p of AUDIENCE_PRESETS) for (const id of [...p.lead, ...p.included]) expect(ids.has(id)).toBe(true);
    expect(AUDIENCE_PRESETS.map((p) => p.name)).toEqual([
      'Ministry of education',
      'Development bank',
      'Mobile network operator',
      'ICT regulator',
      'Philanthropic donor',
      'Full portfolio',
    ]);
    expect(withPreset('full-portfolio').items.every((i) => i.state === 'included')).toBe(true);
  });

  it('applies a preset and recognises it afterwards', () => {
    const o = withPreset('ict-regulator');
    expect(o.items.find((i) => i.id === 'policy-modelling')!.state).toBe('lead');
    expect(o.items.find((i) => i.id === 'mapping')!.state).toBe('included');
    expect(o.items.find((i) => i.id === 'investment-case')!.state).toBe('off');
    expect(matchingPreset(o)?.id).toBe('ict-regulator');
    expect(matchingPreset(updateOffering(o, 'research', { state: 'lead' }))).toBeUndefined();
  });

  it('cycles off, included, lead, off', () => {
    expect(cycleState('off')).toBe('included');
    expect(cycleState('included')).toBe('lead');
    expect(cycleState('lead')).toBe('off');
  });
});

describe('offering colours', () => {
  it('shades each offering from its category colour, darker to lighter', () => {
    const finance = resolveOfferings(defaultOfferings()).filter((i) => i.categoryId === 'finance');
    const colours = finance.map((i) => i.resolvedColor);
    expect(new Set(colours).size).toBe(4);
    expect(colours).not.toContain('#22B99A');
    expect(shadeFor('#22B99A', 0, 4, 0.45)).toBe(colours[0]);
    // Darkest first, lightest last.
    const brightness = (h: string) => [1, 3, 5].reduce((n, i) => n + parseInt(h.slice(i, i + 2), 16), 0);
    expect(brightness(colours[0])).toBeLessThan(brightness('#22B99A'));
    expect(brightness(colours[3])).toBeGreaterThan(brightness('#22B99A'));
  });

  it('uses the category colour itself at shade strength 0', () => {
    const all = resolveOfferings({ ...defaultOfferings(), shadeStrength: 0 });
    for (const i of all) expect(i.resolvedColor).toBe(CATEGORIES.find((c) => c.id === i.categoryId)!.color);
  });

  it('lets a hand-set colour win, and reset brings back the shade', () => {
    let o = updateOffering(defaultOfferings(), 'mapping', { color: '#FF0000' });
    expect(resolveOfferings(o).find((i) => i.id === 'mapping')!.resolvedColor).toBe('#FF0000');
    o = updateOffering(o, 'mapping', { color: null });
    expect(resolveOfferings(o).find((i) => i.id === 'mapping')!.resolvedColor).toBe(
      resolveOfferings(defaultOfferings()).find((i) => i.id === 'mapping')!.resolvedColor,
    );
  });

  it('changing a category colour updates its offerings, except hand-set ones', () => {
    let o = updateOffering(defaultOfferings(), 'mapping', { color: '#FF0000' });
    const before = resolveOfferings(o);
    o = updateCategory(o, 'network-data', { color: '#333333' });
    const after = resolveOfferings(o);
    const get = (list: typeof after, id: string) => list.find((i) => i.id === id)!.resolvedColor;
    expect(get(after, 'mapping')).toBe('#FF0000');
    expect(get(after, 'real-time-monitoring')).not.toBe(get(before, 'real-time-monitoring'));
    expect(get(after, 'investment-case')).toBe(get(before, 'investment-case'));
  });
});

describe('adding offerings and categories', () => {
  it('adds a category and an offering in it, with unique ids', () => {
    let o = addCategory(defaultOfferings(), 'Mapping', '#123456');
    const cat = o.categories[o.categories.length - 1];
    expect(cat).toMatchObject({ name: 'Mapping', color: '#123456', custom: true });
    o = addOffering(o, cat.id, 'Mapping', '', null);
    const added = o.items[o.items.length - 1];
    expect(added.id).not.toBe('mapping');
    expect(added).toMatchObject({ categoryId: cat.id, name: 'Mapping', short: 'Mapping', state: 'included', custom: true });
    expect(resolveOfferings(o).find((i) => i.id === added.id)!.resolvedColor).toBe('#123456');
  });

  it('an added offering takes a category shade unless given a colour', () => {
    const o = addOffering(defaultOfferings(), 'finance', 'Blended finance', 'Blended', null);
    const added = resolveOfferings(o).find((i) => i.name === 'Blended finance')!;
    expect(added.short).toBe('Blended');
    expect(added.resolvedColor).toBe(shadeFor('#22B99A', 4, 5, 0.45));
    const set = addOffering(defaultOfferings(), 'finance', 'Grants', '', '#ABCDEF');
    expect(resolveOfferings(set).find((i) => i.name === 'Grants')!.resolvedColor).toBe('#ABCDEF');
  });

  it('removing a category removes its offerings', () => {
    let o = addCategory(defaultOfferings(), 'Extra', '#123456');
    o = addOffering(o, 'extra', 'Thing', '', null);
    o = removeCategory(o, 'extra');
    expect(o.items.some((i) => i.categoryId === 'extra')).toBe(false);
  });
});

describe('title shapes on the grid (placeholder) and colour spread', () => {
  it('places one title per active offering, each on its own node, the same way every time', () => {
    const o = withPreset('development-bank');
    const scene = generate(params, o);
    const active = o.items.filter((i) => i.state !== 'off').length;
    expect(scene.titles.length).toBe(active);
    expect(new Set(scene.titles.map((t) => t.nodeId)).size).toBe(active);
    expect(generate(params, o).titles).toEqual(scene.titles);
    expect(scene.titles.find((t) => t.id === 'investment-case')!.state).toBe('lead');
  });

  it('mostly leaves other titles where they are when one is turned off', () => {
    const o = withPreset('ict-regulator');
    const before = new Map(generate(params, o).titles.map((t) => [t.id, t.nodeId]));
    const after = generate(params, updateOffering(o, 'research', { state: 'off' })).titles;
    const kept = after.filter((t) => before.get(t.id) === t.nodeId).length;
    expect(kept).toBeGreaterThanOrEqual(after.length - 1);
  });

  it('colours nothing beyond the title at spread 0', () => {
    const scene = generate(params, withPreset('full-portfolio', { spread: 0 }));
    expect(scene.nodes.some((n) => n.color)).toBe(false);
    expect(scene.links.some((l) => l.color)).toBe(false);
  });

  it('at spread 1, colours the links touching a title and the nodes at their far end', () => {
    const scene = generate(params, withPreset('mobile-network-operator', { spread: 1 }));
    const titleAt = new Map(scene.titles.map((t) => [t.nodeId, t.color]));
    for (const l of scene.links) {
      const touches = titleAt.get(l.from) ?? titleAt.get(l.to);
      if (touches) expect(l.color).toBeDefined();
    }
    const coloured = scene.nodes.filter((n) => n.color);
    expect(coloured.length).toBeGreaterThan(0);
    for (const n of coloured) {
      const nearTitle = scene.links.some(
        (l) => (l.from === n.id && titleAt.has(l.to)) || (l.to === n.id && titleAt.has(l.from)),
      );
      expect(nearTitle).toBe(true);
    }
  });

  it('spreads further as the slider goes up', () => {
    const count = (spread: number) => {
      const s = generate({ ...params, density: 0.6 }, withPreset('mobile-network-operator', { spread }));
      return s.nodes.filter((n) => n.color).length + s.links.filter((l) => l.color).length;
    };
    expect(count(1)).toBeLessThan(count(2));
    expect(count(2)).toBeLessThanOrEqual(count(3));
  });

  it('draws lead titles in solid colour and included ones as a light tint, in place of their node', () => {
    const o = withPreset('ict-regulator', { spread: 1 });
    const scene = generate(params, o);
    const svg = render(scene, style);
    const lead = scene.titles.find((t) => t.state === 'lead')!;
    expect(svg).toContain('<g id="titles">');
    expect(svg).toMatch(new RegExp(`<rect [^>]*fill="${lead.color}"/>`));
    expect(svg).toMatch(/<rect [^>]*fill="#[0-9A-F]{6}" stroke="#[0-9A-F]{6}"/);
    expect((svg.match(/<circle /g) ?? []).length).toBe(48 - scene.titles.length);
    expect(svg).not.toMatch(/NaN|undefined|<filter|<pattern/);
  });

  it('paints spread colours on nodes, lines and bars', () => {
    const o = withPreset('mobile-network-operator', { spread: 2 });
    const colour = generate(params, o).titles[0].color;
    expect(render(generate(params, o), style)).toContain(`stroke="${colour}"`);
    expect(render(generate(params, o), { ...style, joinStyle: 'smooth' })).toContain(`fill="${colour}"`);
  });
});
