// Supabase Edge Function: refresh-prices
// Runs on a daily schedule to refresh every collection card's price (in USD,
// canonical) and record a per-user value-history snapshot. Deploy + schedule it
// yourself (see README.md) — it needs the service_role key.
//
// Multi-TCG: collection `card_id`s are game-qualified (`game:rawId`). We group
// by game and price each via its source — MTG through Scryfall, Pokémon through
// TCGdex (no key, carries TCGplayer prices). Stored values stay USD.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SCRYFALL = 'https://api.scryfall.com';
const TCGDEX = 'https://api.tcgdex.net/v2/en';
const CHUNK = 75;

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

interface PricePoint {
  price_usd: number | null;
  price_usd_foil: number | null;
}

const parseRef = (id: string): { game: string; raw: string } => {
  const i = id.indexOf(':');
  if (i > 0) return { game: id.slice(0, i), raw: id.slice(i + 1) };
  return { game: 'mtg', raw: id };
};

const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// MTG via Scryfall: batch by raw id -> { qualifiedId: pricePoint }
async function priceMtg(qualified: string[]): Promise<Map<string, PricePoint>> {
  const out = new Map<string, PricePoint>();
  const rawToQualified = new Map(qualified.map((q) => [parseRef(q).raw, q]));
  const raws = [...rawToQualified.keys()];
  for (const ids of chunk(raws, CHUNK)) {
    const res = await fetch(`${SCRYFALL}/cards/collection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Deckerr/1.0 (price-refresh)',
      },
      body: JSON.stringify({ identifiers: ids.map((id) => ({ id })) }),
    });
    const json = await res.json().catch(() => ({}));
    for (const card of json.data ?? []) {
      const q = rawToQualified.get(card.id);
      if (!q) continue;
      out.set(q, {
        price_usd: card.prices?.usd ? Number(card.prices.usd) : null,
        price_usd_foil: card.prices?.usd_foil ? Number(card.prices.usd_foil) : null,
      });
    }
    await new Promise((r) => setTimeout(r, 100)); // Scryfall rate limit
  }
  return out;
}

// Pokémon via TCGdex (per id — no batch): pick TCGplayer USD market prices.
async function pricePokemon(qualified: string[]): Promise<Map<string, PricePoint>> {
  const out = new Map<string, PricePoint>();
  for (const q of qualified) {
    const { raw } = parseRef(q);
    try {
      const res = await fetch(`${TCGDEX}/cards/${encodeURIComponent(raw)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const card = await res.json();
      const tp = card?.pricing?.tcgplayer ?? {};
      const variants: Record<string, any> = {};
      for (const [k, v] of Object.entries(tp)) {
        if (k === 'unit' || k === 'updated') continue;
        if (v && typeof v === 'object') variants[k] = v;
      }
      const first = Object.values(variants)[0] as any;
      const nonFoil = variants.normal ?? first;
      const foilBlock = variants.holofoil ?? variants.reverseHolofoil;
      const market = num(nonFoil?.marketPrice) ?? num(foilBlock?.marketPrice);
      const foil = num(foilBlock?.marketPrice);
      out.set(q, { price_usd: market, price_usd_foil: foil });
    } catch {
      // skip on error; keeps the existing stored price
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return out;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Every distinct (qualified) card id across all collections
  const { data: rows, error } = await supabase.from('collections').select('card_id');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const cardIds = [...new Set((rows ?? []).map((r) => r.card_id as string))];

  // 2. Group by game and price each via its source
  const byGame = new Map<string, string[]>();
  for (const id of cardIds) {
    const { game } = parseRef(id);
    (byGame.get(game) ?? byGame.set(game, []).get(game)!).push(id);
  }

  const priceById = new Map<string, PricePoint>();
  for (const [game, ids] of byGame) {
    const priced = game === 'pokemon' ? await pricePokemon(ids) : await priceMtg(ids);
    for (const [id, pp] of priced) priceById.set(id, pp);
  }

  // 3. Persist prices (per card_id, across all owners) -> triggers recompute totals
  const today = new Date().toISOString().slice(0, 10);
  const historyRows: { card_id: string; game: string; recorded_at: string; price_usd: number | null; price_usd_foil: number | null }[] = [];
  for (const [cardId, pp] of priceById) {
    const value = pp.price_usd ?? pp.price_usd_foil ?? 0;
    await supabase.from('collections').update({ price_usd: value }).eq('card_id', cardId);
    historyRows.push({
      card_id: cardId,
      game: parseRef(cardId).game,
      recorded_at: today,
      price_usd: pp.price_usd,
      price_usd_foil: pp.price_usd_foil,
    });
  }

  // 3b. Record today's per-card price point for the card price-history chart
  if (historyRows.length > 0) {
    await supabase.from('card_price_history').upsert(historyRows, { onConflict: 'card_id,recorded_at' });
  }

  // 4. Snapshot each user's value for today's history point
  const { data: profiles } = await supabase.from('profiles').select('id, collection_total_value');
  for (const p of profiles ?? []) {
    await supabase
      .from('collection_value_history')
      .upsert({ user_id: p.id, snapshot_date: today, value: p.collection_total_value ?? 0 }, { onConflict: 'user_id,snapshot_date' });
  }

  return new Response(JSON.stringify({ cards: cardIds.length, users: profiles?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
