import type { Settings } from './types';

/** Distance between node centres on the grid, in units. */
export const GRID_SPACING = 20;

/** Slider ranges. The panel and any input checks read from here. */
export const LIMITS = {
  nodeSize: { min: 1, max: 5, step: 1 },
  density: { min: 0, max: 1, step: 0.01 },
  displacement: { min: 0, max: 40, step: 1 },
  columns: { min: 3, max: 25, step: 1 },
  rows: { min: 3, max: 20, step: 1 },
  seed: { min: 0, max: 9999, step: 1 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  params: {
    columns: 8,
    rows: 6,
    density: 0.33,
    displacement: 0,
    seed: 42,
  },
  style: {
    nodeSize: 5,
    nodeColor: '#16171A',
    lineColor: '#A9ADB2',
    backgroundColor: '#F8F8F8',
    lineWidth: 1,
  },
};
