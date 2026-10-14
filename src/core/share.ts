import { emptyEdits } from './edits';
import { defaultOfferings } from './offerings';
import { DEFAULT_SETTINGS } from './settings';
import type { Edits, Offering, OfferingsSettings, Settings } from './types';

/**
 * Settings to and from a short text, for the page address. Only what differs
 * from the defaults is written, and offerings are written compactly (states,
 * hand-set colours, additions), so links stay short.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The parts of `value` that differ from `base`. Objects are compared key by key; anything else whole. */
function diff(base: unknown, value: unknown): unknown {
  if (isObject(base) && isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (JSON.stringify(base[key]) === JSON.stringify(value[key])) continue;
      out[key] = key in base ? diff(base[key], value[key]) : value[key];
    }
    return out;
  }
  return value;
}

/**
 * Lay `patch` over `base`, keeping only values of the right kind, so a damaged
 * or out-of-date link can never break the app. Objects with no fixed keys
 * (like the colour palettes per mode, or dragged positions) take their keys
 * from the patch.
 */
function merge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (isObject(base)) {
    if (!isObject(patch)) return base;
    const fixed = Object.keys(base).length > 0;
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(patch)) {
      if (key in base) out[key] = merge(base[key as keyof T], patch[key]);
      else if (!fixed) out[key] = patch[key];
    }
    return out as T;
  }
  if (Array.isArray(base)) return (Array.isArray(patch) ? patch : base) as T;
  if (typeof base === 'number') return (typeof patch === 'number' && Number.isFinite(patch) ? patch : base) as T;
  return (typeof patch === typeof base ? patch : base) as T;
}

/** Offerings, compactly: only states, colours and additions that differ from the data file. */
function packOfferings(o: OfferingsSettings): Json {
  const base = defaultOfferings();
  const baseCats = new Map(base.categories.map((c) => [c.id, c]));
  const baseItems = new Set(base.items.map((i) => i.id));
  const out: Record<string, Json> = {};
  const states: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const i of o.items) {
    if (i.state !== 'off') states[i.id] = i.state === 'lead' ? 'l' : 'i';
    if (i.color) colors[i.id] = i.color;
  }
  if (Object.keys(states).length) out.st = states;
  if (Object.keys(colors).length) out.c = colors;
  const catColors: Record<string, string> = {};
  for (const c of o.categories) if (baseCats.has(c.id) && baseCats.get(c.id)!.color !== c.color) catColors[c.id] = c.color;
  if (Object.keys(catColors).length) out.cc = catColors;
  const removedCats = base.categories.filter((c) => !o.categories.some((x) => x.id === c.id)).map((c) => c.id);
  if (removedCats.length) out.rc = removedCats;
  const addedCats = o.categories.filter((c) => !baseCats.has(c.id)).map((c) => [c.id, c.name, c.color]);
  if (addedCats.length) out.xc = addedCats;
  const addedItems = o.items
    .filter((i) => !baseItems.has(i.id))
    .map((i) => [i.id, i.categoryId, i.name, i.short === i.name ? '' : i.short]);
  if (addedItems.length) out.xi = addedItems;
  const rest = diff(
    { shadeStrength: base.shadeStrength, spread: base.spread, includedSpread: base.includedSpread, blueModeColors: base.blueModeColors, titles: base.titles },
    { shadeStrength: o.shadeStrength, spread: o.spread, includedSpread: o.includedSpread, blueModeColors: o.blueModeColors, titles: o.titles },
  ) as Record<string, Json>;
  if (Object.keys(rest).length) out.r = rest;
  return out;
}

function unpackOfferings(packed: unknown): OfferingsSettings {
  const base = defaultOfferings();
  if (!isObject(packed)) return base;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const removed = new Set(Array.isArray(packed.rc) ? packed.rc.map(str) : []);
  const categories = base.categories.filter((c) => !removed.has(c.id));
  const catColors = isObject(packed.cc) ? packed.cc : {};
  for (const c of categories) if (typeof catColors[c.id] === 'string') c.color = catColors[c.id] as string;
  if (Array.isArray(packed.xc)) {
    for (const x of packed.xc)
      if (Array.isArray(x) && str(x[0]) && !categories.some((c) => c.id === x[0]))
        categories.push({ id: str(x[0]), name: str(x[1]), color: str(x[2]) || '#7A7A7A', custom: true });
  }
  const items: Offering[] = base.items.filter((i) => categories.some((c) => c.id === i.categoryId));
  if (Array.isArray(packed.xi)) {
    for (const x of packed.xi)
      if (Array.isArray(x) && str(x[0]) && categories.some((c) => c.id === x[1]) && !items.some((i) => i.id === x[0]))
        items.push({ id: str(x[0]), categoryId: str(x[1]), name: str(x[2]), short: str(x[3]) || str(x[2]), state: 'off', color: null, custom: true });
  }
  const states = isObject(packed.st) ? packed.st : {};
  const colors = isObject(packed.c) ? packed.c : {};
  for (const i of items) {
    i.state = states[i.id] === 'l' ? 'lead' : states[i.id] === 'i' ? 'included' : 'off';
    if (typeof colors[i.id] === 'string') i.color = colors[i.id] as string;
  }
  const rest = merge(
    { shadeStrength: base.shadeStrength, spread: base.spread, includedSpread: base.includedSpread, blueModeColors: base.blueModeColors, titles: base.titles },
    packed.r,
  );
  return { ...base, ...rest, categories, items };
}

function packEdits(e: Edits): Json {
  const out: Record<string, Json> = {};
  if (e.hidden.length) out.h = e.hidden;
  if (e.linksAdded.length) out.a = e.linksAdded;
  if (e.linksRemoved.length) out.r = e.linksRemoved;
  const moved = Object.entries(e.moved).map(([id, m]) => [id, m.dx, m.dy]);
  if (moved.length) out.m = moved;
  return out;
}

function unpackEdits(packed: unknown): Edits {
  const e = emptyEdits();
  if (!isObject(packed)) return e;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  e.hidden = ids(packed.h);
  e.linksAdded = ids(packed.a);
  e.linksRemoved = ids(packed.r);
  if (Array.isArray(packed.m)) {
    for (const m of packed.m)
      if (Array.isArray(m) && typeof m[0] === 'string' && Number.isFinite(m[1]) && Number.isFinite(m[2]))
        e.moved[m[0]] = { dx: m[1] as number, dy: m[2] as number };
  }
  return e;
}

/** Bytes to and from URL-safe base64. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** Settings as a short text. Empty when everything is at its default. */
export function encodeSettings(s: Settings): string {
  const packed: Record<string, Json> = { v: 1 };
  const params = diff(DEFAULT_SETTINGS.params, s.params) as Record<string, Json>;
  const style = diff(DEFAULT_SETTINGS.style, s.style) as Record<string, Json>;
  const offerings = packOfferings(s.offerings) as Record<string, Json>;
  const edits = packEdits(s.edits) as Record<string, Json>;
  if (Object.keys(params).length) packed.p = params;
  if (Object.keys(style).length) packed.s = style;
  if (Object.keys(offerings).length) packed.o = offerings;
  if (Object.keys(edits).length) packed.e = edits;
  return Object.keys(packed).length > 1 ? toBase64Url(JSON.stringify(packed)) : '';
}

/** Settings from a short text. Returns null if it cannot be read at all. */
export function decodeSettings(code: string): Settings | null {
  if (!code) return DEFAULT_SETTINGS;
  try {
    const packed = JSON.parse(fromBase64Url(code));
    if (!isObject(packed)) return null;
    return {
      params: merge(DEFAULT_SETTINGS.params, packed.p),
      style: merge(DEFAULT_SETTINGS.style, packed.s),
      offerings: unpackOfferings(packed.o),
      edits: unpackEdits(packed.e),
    };
  } catch {
    return null;
  }
}
