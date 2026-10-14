import { describe, expect, it } from 'vitest';
import { AUDIENCE_PRESETS } from '../offerings';
import { crossingKey, emptyEdits, moveNode, pairKey, toggleHidden, toggleLink } from './edits';
import { generate } from './generate';
import { hitTest } from './hit';
import { addCategory, addOffering, applyPreset, defaultOfferings, updateOffering } from './offerings';
import { render } from './render';
import { DEFAULT_SETTINGS } from './settings';
import { decodeSettings, encodeSettings } from './share';
import type { Edits, Settings } from './types';

const { params, style } = DEFAULT_SETTINGS;
const ctx = (edits: Edits) => ({ nodeSize: 5, blueMode: false, edits });
const keys = (scene: ReturnType<typeof generate>) => new Set(scene.links.map((l) => pairKey(l.from, l.to)));
const big = { ...params, columns: 12, rows: 8 };
const offers = (id: string) => applyPreset(defaultOfferings(), AUDIENCE_PRESETS.find((p) => p.id === id)!);

describe('hand edits', () => {
  it('hides a node and its links, and shows it again', () => {
    const base = generate(params);
    const linked = base.links[0].from;
    const e = toggleHidden(emptyEdits(), linked);
    const scene = generate(params, undefined, ctx(e));
    const node = scene.nodes.find((n) => n.id === linked)!;
    expect(node).toMatchObject({ hidden: true, userHidden: true });
    expect(scene.links.some((l) => l.from === linked || l.to === linked)).toBe(false);
    expect(render(scene, style)).not.toEqual(render(base, style));
    expect(render(generate(params, undefined, ctx(toggleHidden(e, linked))), style)).toEqual(render(base, style));
  });

  it('adds and removes links between neighbours', () => {
    const base = generate(params);
    const present = base.links[0];
    const removed = toggleLink(emptyEdits(), present.from, present.to, present);
    expect(keys(generate(params, undefined, ctx(removed))).has(pairKey(present.from, present.to))).toBe(false);
    // Clicking the same gap again puts it back.
    expect(toggleLink(removed, present.from, present.to)).toEqual(emptyEdits());
    const free = ['0,0|1,0', '0,0|0,1', '1,0|2,0'].find((k) => !keys(base).has(k))!;
    const [a, b] = free.split('|');
    const added = toggleLink(emptyEdits(), a, b);
    expect(keys(generate(params, undefined, ctx(added))).has(free)).toBe(true);
  });

  it('never lets two diagonals cross: adding one removes the other', () => {
    expect(crossingKey(pairKey('2,3', '3,4'))).toBe(pairKey('3,3', '2,4'));
    const scene = generate({ ...params, density: 1 });
    const diagonal = scene.links.find((l) => l.kind === 'd')!;
    const other = crossingKey(pairKey(diagonal.from, diagonal.to))!;
    const [a, b] = other.split('|');
    const e = toggleLink(emptyEdits(), a, b);
    const after = keys(generate({ ...params, density: 1 }, undefined, ctx(e)));
    expect(after.has(other)).toBe(true);
    expect(after.has(pairKey(diagonal.from, diagonal.to))).toBe(false);
  });

  it('moves a node by hand, and its links follow', () => {
    const e = moveNode(emptyEdits(), '3,2', 6, -4);
    const before = generate(params).nodes.find((n) => n.id === '3,2')!;
    const after = generate(params, undefined, ctx(e)).nodes.find((n) => n.id === '3,2')!;
    expect([after.x - before.x, after.y - before.y]).toEqual([6, -4]);
    expect(after.moved).toBe(true);
  });

  it('keeps edits where possible when the seed changes', () => {
    const e = toggleHidden(moveNode(toggleLink(emptyEdits(), '0,0', '1,0'), '4,4', 3, 3), '2,2');
    const scene = generate({ ...params, seed: 7 }, undefined, ctx(e));
    expect(scene.nodes.find((n) => n.id === '2,2')!.hidden).toBe(true);
    expect(keys(scene).has('0,0|1,0')).toBe(true);
    expect(scene.nodes.find((n) => n.id === '4,4')!.moved).toBe(true);
    // Edits off the grid are ignored, not an error.
    const small = generate({ ...params, columns: 3, rows: 3 }, undefined, ctx(e));
    expect(small.nodes.length).toBe(9);
  });

  it('a moved node still keeps clear of title shapes', () => {
    const o = offers('ict-regulator');
    const plain = generate(big, o, ctx(emptyEdits()));
    const t = plain.titles[0];
    // Drag a nearby node right onto the middle of the title.
    const near = plain.nodes.find((n) => !n.hidden && Math.abs(n.row - t.row) === 1)!;
    const e = moveNode(emptyEdits(), near.id, t.cx - near.x, t.cy - near.y);
    const moved = generate(big, o, ctx(e)).nodes.find((n) => n.id === near.id)!;
    const reach = Math.max(t.halfW - t.halfH, 0);
    const gap = Math.hypot(Math.max(Math.abs(moved.x - t.cx) - reach, 0), moved.y - t.cy) - t.halfH;
    expect(gap).toBeGreaterThanOrEqual(5 - 1e-6);
  });
});

describe('clicking on the canvas', () => {
  it('finds nodes, ghosts of hidden nodes, gaps and titles', () => {
    const scene = generate(params);
    const n = scene.nodes[9];
    expect(hitTest(scene, 5, { x: n.x + 1, y: n.y })).toEqual({ kind: 'node', id: n.id, ghost: false });
    const hidden = generate(params, undefined, ctx(toggleHidden(emptyEdits(), n.id)));
    expect(hitTest(hidden, 5, { x: n.x, y: n.y })).toMatchObject({ kind: 'node', id: n.id, ghost: true });
    // Half way between two side-by-side nodes.
    const right = scene.nodes.find((m) => m.col === n.col + 1 && m.row === n.row)!;
    expect(hitTest(scene, 5, { x: (n.x + right.x) / 2, y: n.y })).toMatchObject({ kind: 'gap', a: n.id, b: right.id });
  });

  it('a gap next to a title is the gap between the node and the title', () => {
    const scene = generate(big, offers('ict-regulator'), ctx(emptyEdits()));
    const link = scene.links.find((l) => l.titleFrom || l.titleTo)!;
    const title = scene.titles.find((t) => t.id === (link.titleFrom ?? link.titleTo))!;
    expect(hitTest(scene, 5, { x: title.cx, y: title.cy })).toEqual({ kind: 'title', id: title.id });
    const outside = scene.nodes.find((n) => n.id === (link.titleFrom ? link.to : link.from))!;
    // Just outside the node, towards the title.
    const toward = { x: title.cx - outside.x, y: title.cy - outside.y };
    const len = Math.hypot(toward.x, toward.y);
    const p = { x: outside.x + (toward.x / len) * 7, y: outside.y + (toward.y / len) * 7 };
    const hit = hitTest(scene, 5, p);
    expect(hit?.kind).toBe('gap');
    if (hit?.kind === 'gap') {
      expect(hit.existing?.id).toBe(link.id);
      // Removing it works through the normal toggle.
      const e = toggleLink(emptyEdits(), hit.a, hit.b, hit.existing);
      const after = generate(big, offers('ict-regulator'), ctx(e));
      expect(after.links.some((l) => l.id === link.id)).toBe(false);
    }
  });
});

describe('saving settings in the address', () => {
  it('writes nothing for the defaults', () => {
    expect(encodeSettings(DEFAULT_SETTINGS)).toBe('');
    expect(decodeSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips everything: settings, offerings, titles and hand edits', () => {
    let o = updateOffering(offers('development-bank'), 'mapping', { color: '#123456', state: 'lead' });
    o = addCategory(o, 'Training', '#336699');
    o = addOffering(o, 'training', 'Digital skills for teachers', 'Teacher skills', null);
    o = { ...o, spread: 2, titles: { ...o.titles, wrap: true, positions: { mapping: { col: 3, row: 1 } } } };
    o = { ...o, categories: o.categories.map((c) => (c.id === 'finance' ? { ...c, color: '#000000' } : c)) };
    const s: Settings = {
      params: { ...params, seed: 1234, columns: 14 },
      style: { ...style, nodeShape: 'hexagon', palettes: { ...style.palettes, navy: { ...style.palettes.navy, node: '#FF0000' } } },
      offerings: o,
      edits: toggleHidden(moveNode(toggleLink(emptyEdits(), '0,0', '1,0'), '4,4', 3.5, -1), '2,2'),
    };
    const code = encodeSettings(s);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(1200);
    expect(decodeSettings(code)).toEqual(s);
  });

  it('survives damaged or odd input', () => {
    expect(decodeSettings('not base64 !!')).toBeNull();
    const odd = btoa(JSON.stringify({ v: 1, p: { columns: 'lots', seed: 5 }, s: { nodeShape: 3 }, o: { st: { nope: 'l' } } }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const s = decodeSettings(odd)!;
    expect(s.params.columns).toBe(8);
    expect(s.params.seed).toBe(5);
    expect(s.style.nodeShape).toBe('circle');
  });
});
