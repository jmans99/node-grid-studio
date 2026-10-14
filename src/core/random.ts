/** Seeded random numbers. Same seed in, same numbers out. */

/** mulberry32: a small, fast seeded generator. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix whole numbers into one 32-bit seed. Order matters. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/**
 * A random number in [0, 1) tied to a seed and some whole-number coordinates.
 * It does not depend on call order, so a cell keeps its value when the grid
 * around it changes size.
 */
export function randomAt(seed: number, ...coords: number[]): number {
  return mulberry32(hashInts(seed, ...coords))();
}
