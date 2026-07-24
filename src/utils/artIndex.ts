/**
 * Prebuilt card-art embedding index for the experimental CV scanner.
 *
 * The index is produced offline by scripts/build-art-index.mjs: each unique
 * card illustration is embedded with DINOv2-small (mean-pooled, L2-normalized
 * to a 384-dim vector), quantized to int8 (round(v * scale)), and packed
 * row-major into a compact binary the PWA cosine-matches against on-device.
 *
 *   public/card-art-index.json  { model, dim, scale, count, ids }
 *   public/card-art-index.bin   Int8Array length count*dim, row i = ids[i]
 */

export interface ArtIndex {
  model: string;
  dim: number;
  /** Quantization scale used at build time (embedding value * scale, rounded). */
  scale: number;
  ids: string[];
  /** count * dim int8 values, row-major (row i is the embedding for ids[i]). */
  rows: Int8Array;
}

export interface ArtMatch {
  id: string;
  score: number;
}

interface ArtIndexMeta {
  model: string;
  dim: number;
  scale: number;
  count: number;
  ids: string[];
}

let indexPromise: Promise<ArtIndex> | null = null;

/**
 * Load and cache the art index (metadata JSON + packed int8 binary) from the
 * app origin. Both files are precached by the service worker, so this works
 * offline once the app has been visited.
 */
export function loadArtIndex(): Promise<ArtIndex> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [metaRes, binRes] = await Promise.all([
        fetch('/card-art-index.json'),
        fetch('/card-art-index.bin'),
      ]);
      if (!metaRes.ok || !binRes.ok) {
        throw new Error('Failed to load the card art index');
      }
      const meta = (await metaRes.json()) as ArtIndexMeta;
      const rows = new Int8Array(await binRes.arrayBuffer());
      return { model: meta.model, dim: meta.dim, scale: meta.scale, ids: meta.ids, rows };
    })();
  }
  return indexPromise;
}

/**
 * Cosine similarity of an L2-normalized float query against every quantized
 * row, returning the top-k ids by score. Both the query and the stored rows
 * are unit vectors, so cosine reduces to the dot product; dividing the int8
 * row by `scale` undoes the build-time quantization. Plain linear scan — the
 * index is small (a few thousand rows now, ~40k later) and this runs once per
 * capture, not per frame.
 */
export function matchTopK(query: Float32Array, index: ArtIndex, k = 5): ArtMatch[] {
  const { dim, scale, ids, rows } = index;
  const inv = 1 / scale;
  const scored: ArtMatch[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const off = i * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += query[d] * rows[off + d];
    scored[i] = { id: ids[i], score: dot * inv };
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
