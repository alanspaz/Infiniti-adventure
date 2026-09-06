/**
 * Seedable mulberry32 PRNG for reproducible dice in tests / sessions.
 * Returns floats in [0, 1).
 */
export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default non-deterministic RNG. */
export function defaultRng(): Rng {
  return Math.random;
}

/** Uniform integer in [min, max] inclusive using the given RNG. */
export function randomInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) {
    throw new Error(`randomInt: max (${max}) < min (${min})`);
  }
  return lo + Math.floor(rng() * (hi - lo + 1));
}
