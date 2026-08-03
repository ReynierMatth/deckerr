/**
 * Build the ART-embedding index used by the Phase-2 scanner (per game).
 *
 * Embeds each card's illustration with DINOv2-small via transformers.js — the
 * SAME model the browser runs — mean-pooled to a 384-dim L2-normalized vector,
 * quantized to int8, packed row-major into a compact binary the PWA loads and
 * cosine-matches against on-device.
 *
 * Ids are GAME-QUALIFIED (`${game}:${rawId}`) so a match maps straight to a
 * UnifiedCard id (the facade routes it to the right provider).
 *
 * Sources per game:
 *   mtg      -> Scryfall `unique_artwork` bulk (or SETS), embedding `art_crop`.
 *   pokemon  -> TCGdex sets (no key), embedding the full card image
 *               (`<image>/high.webp`; Pokémon has no separate art crop).
 *
 * Output (OUTBASE; default public/card-art-index for mtg,
 *          public/<game>/card-art-index otherwise):
 *   <OUTBASE>.json  { model, dim, count, scale, game, ids: [...] }
 *   <OUTBASE>.bin   Int8Array length count*dim, row-major
 *
 * Usage:
 *   GAME=mtg     MODE=build [SETS=ltr,ltc] [LIMIT=n]
 *   GAME=pokemon MODE=build [SETS=base1,base2] [LIMIT=n]
 *   MODE=convert FROM=emb-art.json        -> repack an existing {rows:[{id,vec}]}
 *
 * Resumable: re-run continues (skips ids already in the .json), checkpoints
 * every 500. FRESH=1 to start over.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline, RawImage } from '@huggingface/transformers';
import Jimp from 'jimp';

const MODEL = process.env.MODEL || 'Xenova/dinov2-small';
const DIM = 384;
const SCALE = 127;
const GAME = process.env.GAME || 'mtg';
const OUTBASE = process.env.OUTBASE || (GAME === 'mtg' ? 'public/card-art-index' : `public/${GAME}/card-art-index`);
const UA = 'Deckerr/1.0 (scanner art index)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qualify = (rawId) => `${GAME}:${rawId}`;

// fp32 to match the browser pipeline (scannerCvPipeline.ts) so on-device query
// vectors align with these index vectors.
let extractorP;
const extractor = () => (extractorP ??= pipeline('image-feature-extraction', MODEL, { dtype: 'fp32' }));

// Illustration window (fraction of the card face) embedded for Pokémon — the
// same crop the scanner applies at query time (scannerCvPipeline GEOMETRY.pokemon).
// Focusing on the art (not the whole card) is more discriminant and language-
// independent, mirroring MTG's art_crop.
const POKEMON_ART_CROP = { x: 0.06, y: 0.12, w: 0.88, h: 0.42 };

// Mean-pool + L2-normalize a DINOv2 output into a unit vector.
async function embedRawImage(img) {
  const out = await (await extractor())(img);
  const [, T, D] = out.dims.length === 3 ? out.dims : [1, 1, out.data.length];
  const v = new Float64Array(D);
  for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) v[d] += out.data[t * D + d];
  let n = 0;
  for (let d = 0; d < D; d++) { v[d] /= T; n += v[d] * v[d]; }
  n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}

async function embed(src) {
  return embedRawImage(await RawImage.read(src));
}

// Fetch a full-card image and embed only its cropped illustration window.
async function embedCropped(url, crop) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const img = await Jimp.read(Buffer.from(await res.arrayBuffer()));
  const { width, height } = img.bitmap;
  img.crop(
    Math.round(crop.x * width),
    Math.round(crop.y * height),
    Math.round(crop.w * width),
    Math.round(crop.h * height),
  );
  const raw = new RawImage(new Uint8ClampedArray(img.bitmap.data), img.bitmap.width, img.bitmap.height, 4);
  return embedRawImage(raw);
}

const quantize = (vec) => Int8Array.from(vec, (x) => Math.max(-127, Math.min(127, Math.round(x * SCALE))));

async function writeIndex(ids, vecs) {
  await mkdir(dirname(OUTBASE), { recursive: true });
  const bin = new Int8Array(ids.length * DIM);
  vecs.forEach((q, i) => bin.set(q, i * DIM));
  await writeFile(`${OUTBASE}.bin`, Buffer.from(bin.buffer));
  await writeFile(`${OUTBASE}.json`, JSON.stringify({ model: MODEL, dim: DIM, scale: SCALE, game: GAME, count: ids.length, ids }));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// --- per-game card sources: return [{ id: qualified, url }] --------------------

const artUri = (c) => c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop;

async function mtgSource(sets, limit) {
  let cards;
  if (sets?.length) {
    cards = [];
    for (const set of sets) {
      let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${set} unique:art`)}&order=set`;
      while (url) {
        const page = await fetchJson(url);
        cards.push(...(page.data ?? []));
        url = page.has_more ? page.next_page : null;
        await sleep(120);
      }
    }
  } else {
    const bulk = await fetchJson('https://api.scryfall.com/bulk-data');
    const all = await fetchJson(bulk.data.find((b) => b.type === 'unique_artwork').download_uri);
    cards = limit ? all.slice(0, limit) : all;
  }
  return cards.map((c) => ({ id: qualify(c.id), url: artUri(c) }));
}

async function pokemonSource(sets, limit) {
  const TCGDEX = 'https://api.tcgdex.net/v2/en';
  const setIds = sets?.length ? sets : (await fetchJson(`${TCGDEX}/sets`)).map((s) => s.id);
  const items = [];
  for (const setId of setIds) {
    try {
      const set = await fetchJson(`${TCGDEX}/sets/${setId}`);
      for (const card of set.cards ?? []) {
        if (!card.image) continue; // some promos lack an image
        // .png so jimp can decode it (no webp support); crop to the art window.
        items.push({ id: qualify(card.id), url: `${card.image}/high.png`, crop: POKEMON_ART_CROP });
        if (limit && items.length >= limit) return items;
      }
    } catch (e) {
      console.warn(`  skip set ${setId}: ${e.message}`);
    }
    await sleep(80);
  }
  return items;
}

const SOURCES = { mtg: mtgSource, pokemon: pokemonSource };

async function build() {
  const sets = process.env.SETS?.split(',').map((s) => s.trim()).filter(Boolean);
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const source = SOURCES[GAME];
  if (!source) throw new Error(`No card source for GAME=${GAME}`);

  const items = await source(sets, limit);
  console.log(`[${GAME}] ${items.length} cards to consider -> ${OUTBASE}.{json,bin}`);

  const byId = new Map(); // qualified id -> quantized Int8Array
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
  for (const { id, url, crop } of items) {
    if (byId.has(id) || !url) continue;
    try {
      byId.set(id, quantize(crop ? await embedCropped(url, crop) : await embed(url)));
      if (++done % 50 === 0) console.log(`  embedded ${done} this run / ${byId.size} total (of ${items.length})`);
      if (done % 500 === 0) await flush();
    } catch (e) { failed++; console.warn(`  skip ${id}: ${e.message}`); }
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
