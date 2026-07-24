/**
 * Build the ART-embedding index used by the Phase-2 scanner.
 *
 * Embeds each card's `art_crop` (illustration only) with DINOv2-small via
 * transformers.js — the SAME model the browser runs — mean-pooled to a 384-dim
 * L2-normalized vector, quantized to int8, packed row-major into a compact
 * binary the PWA loads and cosine-matches against on-device.
 *
 * We use Scryfall's `unique_artwork` bulk: one entry per unique illustration
 * (printings that share art are visually identical — the edition is picked by
 * the user afterwards), so the DB is smaller and semantically right.
 *
 * Output (OUTBASE, default public/card-art-index):
 *   <OUTBASE>.json  { model, dim, count, scale, ids: [...] }
 *   <OUTBASE>.bin   Int8Array length count*dim, row-major
 *
 * Modes:
 *   MODE=build [SETS=ltr,ltc] [LIMIT=n]   -> embed + write index (resumable)
 *   MODE=convert FROM=emb-art.json        -> repack an existing {rows:[{id,vec}]} JSON
 *
 * Resumable: re-run continues (skips ids already in the .json), checkpoints
 * every 500. FRESH=1 to start over.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { pipeline, RawImage } from '@huggingface/transformers';

const MODEL = process.env.MODEL || 'Xenova/dinov2-small';
const DIM = 384;
const SCALE = 127;
const OUTBASE = process.env.OUTBASE || 'public/card-art-index';
const UA = 'Deckerr/1.0 (scanner art index)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fp32 to match the browser pipeline (scannerCvPipeline.ts) so on-device query
// vectors align with these index vectors. The backend (CPU here, WebGPU in the
// browser) doesn't change the output; the dtype does.
let extractorP;
const extractor = () => (extractorP ??= pipeline('image-feature-extraction', MODEL, { dtype: 'fp32' }));

async function embed(src) {
  const img = await RawImage.read(src);
  const out = await (await extractor())(img);
  const [, T, D] = out.dims.length === 3 ? out.dims : [1, 1, out.data.length];
  const v = new Float64Array(D);
  for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) v[d] += out.data[t * D + d];
  let n = 0;
  for (let d = 0; d < D; d++) { v[d] /= T; n += v[d] * v[d]; }
  n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}

const quantize = (vec) => Int8Array.from(vec, (x) => Math.max(-127, Math.min(127, Math.round(x * SCALE))));

async function writeIndex(ids, vecs) {
  const bin = new Int8Array(ids.length * DIM);
  vecs.forEach((q, i) => bin.set(q, i * DIM));
  await writeFile(`${OUTBASE}.bin`, Buffer.from(bin.buffer));
  await writeFile(`${OUTBASE}.json`, JSON.stringify({ model: MODEL, dim: DIM, scale: SCALE, count: ids.length, ids }));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const artUri = (c) => c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop;

async function cardsForSets(sets) {
  const out = [];
  for (const set of sets) {
    let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${set} unique:art`)}&order=set`;
    while (url) {
      const page = await fetchJson(url);
      out.push(...(page.data ?? []));
      url = page.has_more ? page.next_page : null;
      await sleep(120);
    }
  }
  return out;
}
async function cardsFromBulk(limit) {
  const bulk = await fetchJson('https://api.scryfall.com/bulk-data');
  const all = await fetchJson(bulk.data.find((b) => b.type === 'unique_artwork').download_uri);
  return limit ? all.slice(0, limit) : all;
}

async function build() {
  const sets = process.env.SETS?.split(',').map((s) => s.trim()).filter(Boolean);
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const cards = sets?.length ? await cardsForSets(sets) : await cardsFromBulk(limit);
  console.log(`${cards.length} cards to consider`);

  const byId = new Map(); // id -> quantized Int8Array
  if (!process.env.FRESH) {
    try {
      const meta = JSON.parse(await readFile(`${OUTBASE}.json`, 'utf8'));
      const bin = new Int8Array((await readFile(`${OUTBASE}.bin`)).buffer);
      meta.ids.forEach((id, i) => byId.set(id, bin.slice(i * DIM, (i + 1) * DIM)));
      console.log(`Resuming from ${byId.size} embedded`);
    } catch { /* fresh */ }
  }

  const flush = async () => writeIndex([...byId.keys()], [...byId.values()]);
  let done = 0, failed = 0;
  for (const c of cards) {
    if (byId.has(c.id)) continue;
    const url = artUri(c);
    if (!url) continue;
    try {
      byId.set(c.id, quantize(await embed(url)));
      if (++done % 50 === 0) console.log(`  embedded ${done} this run / ${byId.size} total (of ${cards.length})`);
      if (done % 500 === 0) await flush();
    } catch (e) { failed++; console.warn(`  skip ${c.name}: ${e.message}`); }
    await sleep(50);
  }
  await flush();
  console.log(`\nWrote ${OUTBASE}.{bin,json}: ${byId.size} embeddings (${done} this run, ${failed} failed)`);
}

async function convert() {
  const src = JSON.parse(await readFile(process.env.FROM, 'utf8'));
  const ids = src.rows.map((r) => r.id);
  const vecs = src.rows.map((r) => quantize(r.vec));
  await writeIndex(ids, vecs);
  console.log(`Converted ${ids.length} embeddings -> ${OUTBASE}.{bin,json}`);
}

({ build, convert })[process.env.MODE || 'build']().catch((e) => { console.error(e); process.exit(1); });
