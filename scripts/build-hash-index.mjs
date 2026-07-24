/**
 * Build the perceptual-hash index used by the camera scanner (Phase 1).
 *
 * For every printing we hash Scryfall's `border_crop` image (the whole card,
 * trimmed to its border — a stable reference that matches the on-screen guide
 * frame) into a 64-bit dHash, and write a compact index the client downloads
 * once and matches against on-device.
 *
 * Usage:
 *   SETS=ltr,ltc,stx,usg node scripts/build-hash-index.mjs   # subset by set
 *   LIMIT=4000 node scripts/build-hash-index.mjs             # first N (bulk)
 *   node scripts/build-hash-index.mjs                        # full unique_artwork
 *
 * Output: public/card-hashes.json { version, algo, ids[], hashes[] (hex16) }
 *
 * IMPORTANT: the dHash here MUST stay byte-for-byte algorithmically identical
 * to src/utils/imageHash.ts, or client reads won't match the index.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import Jimp from 'jimp';

const UA = 'Deckerr/1.0 (card scanner index builder; contact matthieu.reynier@echoes.solutions)';
const OUT = process.env.OUT || 'public/card-hashes.json';
// MERGE=1 folds the newly-hashed cards into the existing index (dedupe by id)
// instead of overwriting it — handy to add a set without rebuilding everything.
const MERGE = process.env.MERGE === '1';
const GRID_W = 9;
const GRID_H = 8;
const REQUEST_DELAY_MS = 100; // be a good Scryfall citizen

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic 64-bit dHash from raw RGBA pixels. Box-average the source to a
 * 9x8 grayscale grid, then emit one bit per adjacent horizontal pair
 * (left < right). Returns a 16-char big-endian hex string. Keep in lockstep
 * with src/utils/imageHash.ts.
 */
export function dhashFromRGBA(data, width, height) {
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

  let bits = 0n;
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W - 1; c++) {
      const left = grid[r * GRID_W + c];
      const right = grid[r * GRID_W + c + 1];
      bits = (bits << 1n) | (left < right ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** All printings for a set via the search API (avoids the 252MB bulk file). */
async function cardsForSet(set) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${set} unique:prints`)}&order=set`;
  while (url) {
    const page = await fetchJson(url);
    cards.push(...(page.data ?? []));
    url = page.has_more ? page.next_page : null;
    await sleep(REQUEST_DELAY_MS);
  }
  return cards;
}

/** The full unique-artwork bulk (streamed would be nicer; 252MB fits in memory). */
async function cardsFromBulk(limit) {
  const bulk = await fetchJson('https://api.scryfall.com/bulk-data');
  const entry = bulk.data.find((b) => b.type === 'unique_artwork');
  const all = await fetchJson(entry.download_uri);
  return limit ? all.slice(0, limit) : all;
}

const borderCrop = (card) =>
  card.image_uris?.border_crop ?? card.card_faces?.[0]?.image_uris?.border_crop;

async function main() {
  const sets = process.env.SETS?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

  let cards;
  if (sets?.length) {
    console.log(`Fetching sets: ${sets.join(', ')}`);
    cards = [];
    for (const set of sets) {
      const s = await cardsForSet(set);
      console.log(`  ${set}: ${s.length} printings`);
      cards.push(...s);
    }
  } else {
    console.log(`Fetching unique_artwork bulk${limit ? ` (first ${limit})` : ''}...`);
    cards = await cardsFromBulk(limit);
    console.log(`  ${cards.length} cards`);
  }

  const ids = [];
  const hashes = [];
  let done = 0;
  let failed = 0;

  for (const card of cards) {
    const url = borderCrop(card);
    if (!url) continue;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      const img = await Jimp.read(buf);
      const { data, width, height } = img.bitmap;
      ids.push(card.id);
      hashes.push(dhashFromRGBA(data, width, height));
      done += 1;
      if (done % 100 === 0) console.log(`  hashed ${done}/${cards.length}`);
    } catch (err) {
      failed += 1;
      console.warn(`  skip ${card.name} (${card.set}): ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  let outIds = ids;
  let outHashes = hashes;
  if (MERGE) {
    try {
      const existing = JSON.parse(await readFile(OUT, 'utf8'));
      const byId = new Map();
      for (let i = 0; i < existing.ids.length; i++) byId.set(existing.ids[i], existing.hashes[i]);
      for (let i = 0; i < ids.length; i++) byId.set(ids[i], hashes[i]); // new wins on conflict
      outIds = [...byId.keys()];
      outHashes = [...byId.values()];
      console.log(`Merged with ${existing.ids.length} existing -> ${outIds.length} total.`);
    } catch {
      console.log('No existing index to merge; writing fresh.');
    }
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ version: 1, algo: 'dhash9x8', ids: outIds, hashes: outHashes }));
  console.log(`\nWrote ${OUT}: ${done} hashes this run (${failed} failed), ${outIds.length} total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
