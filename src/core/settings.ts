import { DEFAULT_PALETTES, bluePalette } from '../brand';
import { defaultOfferings } from './offerings';
import type { CanvasPreset, Palette, Settings, Style } from './types';

/** Slider ranges. The panel and any input checks read from here. */
export const LIMITS = {
  nodeSize: { min: 0.5, max: 12, step: 0.1 },
  cornerRadius: { min: 0, max: 12, step: 0.1 },
  outlineWidth: { min: 0.2, max: 4, step: 0.1 },
  density: { min: 0, max: 1, step: 0.01 },
  displacement: { min: 0, max: 40, step: 1 },
  columns: { min: 3, max: 25, step: 1 },
  rows: { min: 3, max: 20, step: 1 },
  seed: { min: 0, max: 9999, step: 1 },
  gapX: { min: 10, max: 60, step: 1 },
  gapY: { min: 10, max: 60, step: 1 },
  margin: { min: 0, max: 400, step: 1 },
  lineWidth: { min: 0.2, max: 6, step: 0.1 },
  lineRadius: { min: 0, max: 20, step: 0.5 },
  dashLength: { min: 0.5, max: 30, step: 0.5 },
  dashGap: { min: 0.5, max: 30, step: 0.5 },
  patternDensity: { min: 0, max: 1, step: 0.01 },
  patternSize: { min: 0.1, max: 3, step: 0.05 },
  patternAngle: { min: 0, max: 180, step: 1 },
  patternMix: { min: 0, max: 100, step: 1 },
  barWidth: { min: 0.5, max: 20, step: 0.1 },
  smoothness: { min: 0, max: 1, step: 0.01 },
  shadeStrength: { min: 0, max: 1, step: 0.01 },
  spread: { min: 0, max: 3, step: 1 },
  includedSpread: { min: 0, max: 1, step: 0.01 },
  titleSize: { min: 2, max: 14, step: 0.1 },
  leadScale: { min: 1, max: 2, step: 0.05 },
  titlePadding: { min: 0, max: 8, step: 0.1 },
  includedTint: { min: 0, max: 1, step: 0.01 },
  canvasSize: { min: 16, max: 8000, step: 1 },
} as const;

export const CANVAS_PRESETS: { id: CanvasPreset; label: string; width?: number; height?: number }[] = [
  { id: 'fit', label: 'Fit pattern' },
  { id: '1:1', label: '1:1', width: 1080, height: 1080 },
  { id: '16:9', label: '16:9', width: 1920, height: 1080 },
  { id: '4:5', label: '4:5', width: 1080, height: 1350 },
  { id: 'a4', label: 'A4', width: 794, height: 1123 },
  { id: 'custom', label: 'Custom' },
];

export const DEFAULT_SETTINGS: Settings = {
  params: {
    columns: 8,
    rows: 6,
    density: 0.33,
    displacement: 0,
    seed: 42,
    gapX: 20,
    gapY: 20,
  },
  style: {
    nodeSize: 5,
    nodeShape: 'circle',
    cornerRadius: 2,
    nodeStyle: 'filled',
    outlineWidth: 1,

    lineWidth: 1,
    lineCap: 'round',
    dashed: false,
    dashLength: 4,
    dashGap: 3,
    linePath: 'straight',
    lineRadius: 4,

    fillPattern: 'solid',
    patternDensity: 0.5,
    patternSize: 0.6,
    patternAngle: 45,
    patternMix: 100,

    joinStyle: 'plain',
    barWidth: 4,
    smoothness: 0.4,

    backgroundMode: 'paper',
    palettes: DEFAULT_PALETTES,
    canvas: { preset: 'fit', width: 1080, height: 1080, margin: 0 },
  },
  offerings: defaultOfferings(),
};

/** The colours actually used to draw, after the background mode is applied. */
export function resolvePalette(style: Style): { palette: Palette; transparent: boolean } {
  if (style.backgroundMode === 'blue') return { palette: bluePalette(), transparent: false };
  return {
    palette: style.palettes[style.backgroundMode],
    transparent: style.backgroundMode === 'transparent',
  };
}
