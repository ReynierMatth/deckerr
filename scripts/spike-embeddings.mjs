/**
 * SPIKE — validate image-embedding recognition for the card scanner (Phase 2).
 *
 * Uses transformers.js (@xenova/transformers) so the SAME model + embeddings
 * run here (Node, offline DB build) and later in the browser PWA — no alignment
 * mismatch. Nothing here ships yet; it's a throwaway accuracy probe.
 *
 * Model: MODEL env (default DINOv2-small, strong for image-to-image retrieval).
 *
 * Modes:
 *   MODE=build SETS=ltr,stx        -> embed each card's `normal` image -> scratch/emb.json
 *   MODE=selftest                  -> query the DB with a DIFFERENT resolution of each
 *                                     card (large) and measure top-1 accuracy
 *   MODE=query IMG=<path|url>      -> top-5 nearest cards for one image
 *
 * DB path: scratch/emb.json  (override with DB=...)
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { pipeline, RawImage } from '@xenova/transformers';

const MODEL = process.env.MODEL || 'Xenova/dinov2-small';
const DB = process.env.DB || '/private/tmp/claude-501/-Users-matthieureynier-Perso-deckerr/11381e05-295b-4e6f-b2ef-202b8c200a4a/scratchpad/emb.json';
const UA = 'Deckerr/1.0 (scanner spike)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let extractorP;
const extractor = () => (extractorP ??= pipeline('image-feature-extraction', MODEL));

/** L2-normalized embedding (Float array) of an image URL/path.
 * transformers.js returned the full patch grid [1, T, D] for DINOv2, so we
 * mean-pool over the T tokens ourselves down to a single D-dim vector. */
async function embed(src) {
  const img = await RawImage.read(src);
  const out = await (await extractor())(img);
  const dims = out.dims;
  const data = out.data;
  // Expected [1, T, D]; fall back to treating the whole thing as one vector.
  const [, T, D] = dims.length === 3 ? dims : [1, 1, data.length];
  const v = new Float64Array(D);
  for (let t = 0; t < T; t++) {
    const off = t * D;
    for (let d = 0; d < D; d++) v[d] += data[off + d];
  }
  let norm = 0;
  for (let d = 0; d < D; d++) {
    v[d] /= T;
    norm += v[d] * v[d];
  }
  norm = Math.sqrt(norm) || 1;
  const outVec = new Array(D);
  for (let d = 0; d < D; d++) outVec[d] = v[d] / norm;
  return outVec;
}

const cosine = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // already normalized
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function cardsForSet(set) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${set} unique:prints`)}&order=set`;
  while (url) {
    const page = await fetchJson(url);
    cards.push(...(page.data ?? []));
    url = page.has_more ? page.next_page : null;
    await sleep(120);
  }
  return cards;
}
const imgUri = (card, kind) =>
  card.image_uris?.[kind] ?? card.card_faces?.[0]?.image_uris?.[kind];

async function build() {
  const sets = (process.env.SETS || 'ltr').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  const cards = [];
  for (const s of sets) cards.push(...(await cardsForSet(s)));
  const rows = [];
  let done = 0;
  for (const card of cards.slice(0, limit)) {
    const url = imgUri(card, process.env.IMGKIND || 'normal');
    if (!url) continue;
    try {
      rows.push({ id: card.id, name: card.name, set: card.set, vec: await embed(url) });
      if (++done % 25 === 0) console.log(`  embedded ${done}`);
    } catch (e) {
      console.warn(`  skip ${card.name}: ${e.message}`);
    }
    await sleep(60);
  }
  await mkdir(DB.replace(/\/[^/]+$/, ''), { recursive: true });
  await writeFile(DB, JSON.stringify({ model: MODEL, rows }));
  console.log(`\nModel ${MODEL} — wrote ${rows.length} embeddings -> ${DB}`);
}

async function loadDb() {
  return JSON.parse(await readFile(DB, 'utf8'));
}

function topK(db, qvec, k = 5) {
  return db.rows
    .map((r) => ({ name: r.name, set: r.set, id: r.id, score: cosine(qvec, r.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

async function selftest() {
  const db = await loadDb();
  console.log(`Self-test on ${db.rows.length} cards (query = a different resolution)`);
  let hit = 0;
  let n = 0;
  for (const r of db.rows) {
    // query with `large` (different framing/resolution than the `normal` DB image)
    const card = await fetchJson(`https://api.scryfall.com/cards/${r.id}`);
    const url = imgUri(card, 'large') ?? imgUri(card, 'png');
    if (!url) continue;
    const q = await embed(url);
    const best = topK(db, q, 1)[0];
    n++;
    if (best.id === r.id) hit++;
    else console.log(`  MISS ${r.name} -> ${best.name} (${best.score.toFixed(3)})`);
    await sleep(80);
  }
  console.log(`\nTop-1 accuracy: ${hit}/${n} (${((100 * hit) / n).toFixed(1)}%)`);
}

async function query() {
  const db = await loadDb();
  const q = await embed(process.env.IMG);
  console.log(`Top-5 for ${process.env.IMG} (model ${db.model}):`);
  for (const r of topK(db, q, 5)) console.log(`  ${r.score.toFixed(3)}  ${r.name} (${r.set})`);
}

const mode = process.env.MODE || 'build';
({ build, selftest, query })[mode]().catch((e) => {
  console.error(e);
  process.exit(1);
});
