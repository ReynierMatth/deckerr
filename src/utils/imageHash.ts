/**
 * Perceptual hashing for the camera scanner (Phase 1).
 *
 * The dHash here MUST stay algorithmically identical to
 * scripts/build-hash-index.mjs — the client hashes a live camera crop and
 * matches it against the index that script produced, so any divergence in the
 * grid size, grayscale weights, cell mapping or bit order breaks matching.
 */

const GRID_W = 9;
const GRID_H = 8;

/**
 * Deterministic 64-bit dHash from raw RGBA pixels. Box-average the source to a
 * 9x8 grayscale grid, then emit one bit per adjacent horizontal pair
 * (left < right). Returned as {hi, lo} 32-bit halves for fast Hamming compares.
 */
export function dhashFromRGBA(data: Uint8ClampedArray, width: number, height: number): { hi: number; lo: number } {
  const grid = new Float64Array(GRID_W * GRID_H);
  const counts = new Uint32Array(GRID_W * GRID_H);

  for (let y = 0; y < height; y++) {
    const cy = Math.min(GRID_H - 1, Math.floor((y * GRID_H) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(GRID_W - 1, Math.floor((x * GRID_W) / width));
      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const cell = cy * GRID_W + cx;
      grid[cell] += luma;
      counts[cell] += 1;
    }
  }
  for (let c = 0; c < grid.length; c++) grid[c] = counts[c] ? grid[c] / counts[c] : 0;

  // Build the 64 bits, MSB first, into two 32-bit halves (bits 63..32 = hi).
  let hi = 0;
  let lo = 0;
  let index = 0;
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W - 1; c++) {
      const bit = grid[r * GRID_W + c] < grid[r * GRID_W + c + 1] ? 1 : 0;
      if (index < 32) {
        hi = (hi << 1) | bit;
      } else {
        lo = (lo << 1) | bit;
      }
      index += 1;
    }
  }
  // >>> 0 keeps them as unsigned 32-bit values.
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

/** Parse a 16-char big-endian hex dHash (as written by the build script). */
export function parseHexHash(hex: string): { hi: number; lo: number } {
  return {
    hi: parseInt(hex.slice(0, 8), 16) >>> 0,
    lo: parseInt(hex.slice(8, 16), 16) >>> 0,
  };
}

const popcount = (n: number): number => {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  n = (n + (n >>> 4)) & 0x0f0f0f0f;
  return (n * 0x01010101) >>> 24;
};

/** Hamming distance (0-64) between two split hashes. */
export function hammingDistance(a: { hi: number; lo: number }, b: { hi: number; lo: number }): number {
  return popcount((a.hi ^ b.hi) >>> 0) + popcount((a.lo ^ b.lo) >>> 0);
}

/** Raw index file shape written by scripts/build-hash-index.mjs. */
export interface HashIndexFile {
  version: number;
  algo: string;
  ids: string[];
  hashes: string[];
}

/** Index in a form that matches fast: ids alongside parallel hi/lo arrays. */
export interface HashIndex {
  ids: string[];
  hi: Uint32Array;
  lo: Uint32Array;
}

/** Build the fast in-memory index from the downloaded JSON file. */
export function buildHashIndex(file: HashIndexFile): HashIndex {
  const n = file.ids.length;
  const hi = new Uint32Array(n);
  const lo = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const parsed = parseHexHash(file.hashes[i]);
    hi[i] = parsed.hi;
    lo[i] = parsed.lo;
  }
  return { ids: file.ids, hi, lo };
}

/**
 * Nearest neighbour by Hamming distance. Returns the closest card id and its
 * distance, or null if the query is further than maxDistance from everything.
 */
export function matchHashIndex(
  index: HashIndex,
  query: { hi: number; lo: number },
  maxDistance: number,
): { id: string; distance: number } | null {
  let bestIdx = -1;
  let best = 65;
  const { hi, lo, ids } = index;
  for (let i = 0; i < ids.length; i++) {
    const dist = popcount((query.hi ^ hi[i]) >>> 0) + popcount((query.lo ^ lo[i]) >>> 0);
    if (dist < best) {
      best = dist;
      bestIdx = i;
      if (best === 0) break;
    }
  }
  if (bestIdx === -1 || best > maxDistance) return null;
  return { id: ids[bestIdx], distance: best };
}
