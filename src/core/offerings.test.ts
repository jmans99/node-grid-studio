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

  it('only counts a preset as active while the states still match it exactly', () => {
    const start = defaultOfferings();
    expect(matchingPreset(start)).toBeUndefined(); // everything off: no preset
    const applied = applyPreset(start, preset('ict-regulator'));
    expect(matchingPreset(applied)?.id).toBe('ict-regulator');
    // Clear all, or undoing back to the start, matches nothing.
    expect(matchingPreset({ ...applied, items: applied.items.map((i) => ({ ...i, state: 'off' as const })) })).toBeUndefined();
    // Changing one offering breaks the match; changing it back restores it.
    const changed = updateOffering(applied, 'research', { state: 'off' });
    expect(matchingPreset(changed)).toBeUndefined();
    expect(matchingPreset(updateOffering(changed, 'research', { state: 'included' }))?.id).toBe('ict-regulator');
    // Adding an offering (it starts included) breaks every preset except full portfolio.
    const added = addOffering(applied, 'finance', 'Blended finance', '', null);
    expect(matchingPreset(added)).toBeUndefined();
    expect(matchingPreset(applyPreset(added, preset('full-portfolio')))?.id).toBe('full-portfolio');
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
