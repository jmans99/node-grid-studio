/**
 * DI brand colours and the colour palettes built from them.
 * This is the one file to edit when the brand colours change.
 */
import { darken, lighten } from './core/color';
import type { Palette } from './core/types';

export const BRAND = {
  /** UNICEF blue */
  blue: '#00AEEF',
  navy: '#1A2A3C',
  offWhite: '#F8F8F8',
  /** Accent only. Not used in any default palette. */
  orange: '#F7761F',
} as const;

/** Shown as quick-pick dots next to every colour field. */
export const BRAND_SWATCHES: { name: string; hex: string; note?: string }[] = [
  { name: 'UNICEF blue', hex: BRAND.blue },
  { name: 'Navy', hex: BRAND.navy },
  { name: 'Off-white', hex: BRAND.offWhite },
  { name: 'Orange', hex: BRAND.orange, note: 'accent only' },
];

/** Starting colours for the modes whose colours you can edit. */
export const DEFAULT_PALETTES = {
  paper: {
    background: BRAND.offWhite,
    node: '#16171A',
    line: '#A9ADB2',
    text: '#16171A',
    outline: BRAND.blue,
  },
  navy: {
    background: BRAND.navy,
    node: BRAND.offWhite,
    line: '#5E7087',
    text: BRAND.offWhite,
    outline: BRAND.blue,
  },
  // The background is not drawn here. The other colours are for placing the
  // picture on top of something else.
  transparent: {
    background: BRAND.offWhite,
    node: '#16171A',
    line: '#A9ADB2',
    text: '#16171A',
    outline: BRAND.blue,
  },
} satisfies Record<string, Palette>;

/**
 * "Blue only": every colour is a lighter or darker shade of UNICEF blue.
 * The numbers are how far to blend towards white (lighten) or black (darken).
 */
export function bluePalette(): Palette {
  return {
    background: BRAND.blue,
    node: darken(BRAND.blue, 0.62),
    line: lighten(BRAND.blue, 0.5),
    text: lighten(BRAND.blue, 0.92),
    outline: lighten(BRAND.blue, 0.78),
  };
}
