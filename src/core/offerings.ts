import { AUDIENCE_PRESETS, type AudiencePreset, CATEGORIES, SHADE_STRENGTH } from '../offerings';
import { darken, lighten } from './color';
import type { Category, Offering, OfferingState, OfferingsSettings } from './types';

/** Starting offerings, built from the data file. Everything starts off. */
export function defaultOfferings(): OfferingsSettings {
  return {
    categories: CATEGORIES.map(({ id, name, color }) => ({ id, name, color })),
    items: CATEGORIES.flatMap((c) =>
      c.offerings.map((o) => ({
        id: o.id,
        categoryId: c.id,
        name: o.name,
        short: o.short ?? o.name,
        state: 'off' as OfferingState,
        color: null,
      })),
    ),
    shadeStrength: SHADE_STRENGTH,
    spread: 1,
  };
}

const NEXT: Record<OfferingState, OfferingState> = { off: 'included', included: 'lead', lead: 'off' };
export const cycleState = (state: OfferingState): OfferingState => NEXT[state];

/**
 * The default colour of an offering: a shade of its category colour. Offerings
 * in a category run from darker to lighter, so they look related but
 * different. A category with one offering keeps the category colour.
 */
export function shadeFor(categoryColor: string, index: number, count: number, strength: number): string {
  if (count < 2 || strength <= 0) return categoryColor.toUpperCase();
  const t = (index / (count - 1)) * 2 - 1; // -1 (darkest) to 1 (lightest)
  return t < 0 ? darken(categoryColor, -t * strength) : lighten(categoryColor, t * strength);
}

export interface ResolvedOffering extends Offering {
  /** The colour actually used: set by hand, or the category shade. */
  resolvedColor: string;
  /** The colour it would have without a hand-set colour. */
  autoColor: string;
  categoryName: string;
}

/** Every offering with its final colour, in list order. */
export function resolveOfferings(o: OfferingsSettings): ResolvedOffering[] {
  const categories = new Map(o.categories.map((c) => [c.id, c]));
  const out: ResolvedOffering[] = [];
  for (const category of o.categories) {
    const items = o.items.filter((i) => i.categoryId === category.id);
    items.forEach((item, index) => {
      const autoColor = shadeFor(category.color, index, items.length, o.shadeStrength);
      out.push({ ...item, autoColor, resolvedColor: item.color ?? autoColor, categoryName: category.name });
    });
  }
  // Offerings whose category is missing are dropped rather than drawn in a wrong colour.
  return out.filter((i) => categories.has(i.categoryId));
}

/** Set every offering's state from an audience preset. */
export function applyPreset(o: OfferingsSettings, preset: AudiencePreset): OfferingsSettings {
  const lead = new Set(preset.lead);
  const included = new Set(preset.included);
  return {
    ...o,
    items: o.items.map((i) => ({
      ...i,
      state: preset.all ?? (lead.has(i.id) ? 'lead' : included.has(i.id) ? 'included' : 'off'),
    })),
  };
}

/** The preset whose states match the current ones exactly, if any. */
export function matchingPreset(o: OfferingsSettings): AudiencePreset | undefined {
  return AUDIENCE_PRESETS.find((p) => {
    const next = applyPreset(o, p);
    return next.items.every((i, n) => i.state === o.items[n].state);
  });
}

/** A short id from a name, made unique among `taken`. */
function makeId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function addCategory(o: OfferingsSettings, name: string, color: string): OfferingsSettings {
  const id = makeId(name, new Set(o.categories.map((c) => c.id)));
  const category: Category = { id, name: name.trim(), color, custom: true };
  return { ...o, categories: [...o.categories, category] };
}

export function addOffering(
  o: OfferingsSettings,
  categoryId: string,
  name: string,
  short: string,
  color: string | null,
): OfferingsSettings {
  const id = makeId(name, new Set(o.items.map((i) => i.id)));
  const item: Offering = {
    id,
    categoryId,
    name: name.trim(),
    short: short.trim() || name.trim(),
    state: 'included',
    color,
    custom: true,
  };
  return { ...o, items: [...o.items, item] };
}

export function removeCategory(o: OfferingsSettings, id: string): OfferingsSettings {
  return {
    ...o,
    categories: o.categories.filter((c) => c.id !== id),
    items: o.items.filter((i) => i.categoryId !== id),
  };
}

export function removeOffering(o: OfferingsSettings, id: string): OfferingsSettings {
  return { ...o, items: o.items.filter((i) => i.id !== id) };
}

export function updateOffering(o: OfferingsSettings, id: string, patch: Partial<Offering>): OfferingsSettings {
  return { ...o, items: o.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

export function updateCategory(o: OfferingsSettings, id: string, patch: Partial<Category>): OfferingsSettings {
  return { ...o, categories: o.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}
