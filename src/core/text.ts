import { FONT_METRICS, METRIC_CHARS } from './fontMetrics';

import type { TitleFont, TitleWeight } from './types';

export type { TitleFont, TitleWeight };

export const TITLE_FONTS: TitleFont[] = ['Manrope', 'Open Sans'];
/** Font stacks written into the SVG. */
export const FONT_STACK: Record<TitleFont, string> = {
  Manrope: "Manrope, 'Open Sans', sans-serif",
  'Open Sans': "'Open Sans', Manrope, sans-serif",
};

const INDEX = new Map(Array.from(METRIC_CHARS, (ch, i) => [ch, i]));

/** Width of a line of text in the same units as `size`. Kerning is ignored. */
export function measureText(text: string, font: TitleFont, weight: TitleWeight, size: number): number {
  const widths = FONT_METRICS[font].widths[weight] as readonly (number | null)[];
  // Average lowercase width, for characters not in the table.
  const fallback = widths[INDEX.get('n')!] ?? 0.55;
  let total = 0;
  for (const ch of text) total += widths[INDEX.get(ch) ?? -1] ?? fallback;
  return total * size;
}

export function fontMetrics(font: TitleFont) {
  return FONT_METRICS[font];
}

/**
 * Split a title into two lines at the space that makes the longer line as
 * short as possible. A single word stays on one line.
 */
export function wrapTwoLines(text: string, font: TitleFont, weight: TitleWeight, size: number): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) return [text];
  let best: string[] = [text];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const widest = Math.max(...lines.map((l) => measureText(l, font, weight, size)));
    if (widest < bestWidth) {
      bestWidth = widest;
      best = lines;
    }
  }
  return best;
}
