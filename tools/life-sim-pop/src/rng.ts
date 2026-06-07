/**
 * @saulene/life-sim-pop — deterministic PRNG
 *
 * Splitmix64 seeded from a 32-bit integer. Same API as core's birth seeder but
 * independent implementation — no shared import, no cross-package coupling. Used
 * exclusively inside this package; inject the seed, never call Math.random.
 */

const MASK64 = (1n << 64n) - 1n;
const TWO53 = 9007199254740992; // 2^53

export interface Rng {
  /** Uniform float in [0, 1). */
  uniform(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

/** Build a splitmix64 RNG from a 32-bit integer seed. */
export function makeRng(seed: number): Rng {
  let state = BigInt(seed >>> 0) & MASK64;

  const next64 = (): bigint => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  };

  const uniform = (): number => Number(next64() >> 11n) / TWO53;
  const int = (n: number): number => Math.floor(uniform() * n);

  return { uniform, int };
}

/** Hash two integers into a single RNG seed — used to derive per-call RNGs. */
export function hashPair(a: number, b: number): number {
  // FNV-1a over the two 32-bit values.
  let h = 2166136261;
  h = Math.imul(h ^ (a & 0xff), 16777619);
  h = Math.imul(h ^ ((a >> 8) & 0xff), 16777619);
  h = Math.imul(h ^ ((a >> 16) & 0xff), 16777619);
  h = Math.imul(h ^ ((a >> 24) & 0xff), 16777619);
  h = Math.imul(h ^ (b & 0xff), 16777619);
  h = Math.imul(h ^ ((b >> 8) & 0xff), 16777619);
  h = Math.imul(h ^ ((b >> 16) & 0xff), 16777619);
  h = Math.imul(h ^ ((b >> 24) & 0xff), 16777619);
  return h >>> 0;
}

/** Fisher-Yates shuffle in-place using a seeded RNG. */
export function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
}
