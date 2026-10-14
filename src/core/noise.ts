import { randomAt } from './random';

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth 2D value noise, roughly in [-1, 1]. `channel` gives independent fields. */
export function valueNoise2D(seed: number, x: number, y: number, channel = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const corner = (ix: number, iy: number) => randomAt(seed, 7919, channel, ix, iy) * 2 - 1;
  const top = corner(x0, y0) + (corner(x0 + 1, y0) - corner(x0, y0)) * fx;
  const bottom = corner(x0, y0 + 1) + (corner(x0 + 1, y0 + 1) - corner(x0, y0 + 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Two layers of value noise (one coarse, one fine), kept in [-1, 1]. */
export function fractalNoise2D(seed: number, x: number, y: number, channel = 0): number {
  const coarse = valueNoise2D(seed, x, y, channel);
  const fine = valueNoise2D(seed, x * 2.1 + 31.7, y * 2.1 + 17.3, channel);
  return (coarse + fine * 0.5) / 1.5;
}
