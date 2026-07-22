// Supabase Edge Function: refresh-prices
// Runs on a daily schedule to refresh every collection card's Scryfall price
// and record a per-user value-history snapshot. Deploy + schedule it yourself
// (see README.md) — it needs the service_role key and cannot run from the app.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SCRYFALL = 'https://api.scryfall.com';
const CHUNK = 75;

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const priceOf = (prices: any): number => {
  const usd = prices?.usd ?? prices?.usd_foil;
  return usd ? Number(usd) : 0;
};

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Every distinct card in every collection
  const { data: rows, error } = await supabase.from('collections').select('card_id');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const cardIds = [...new Set((rows ?? []).map((r) => r.card_id as string))];

  // 2. Fetch current prices from Scryfall (batched; UA header required off-browser)
  const priceById = new Map<string, number>();
  for (const ids of chunk(cardIds, CHUNK)) {
    const res = await fetch(`${SCRYFALL}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Deckerr/1.0 (price-refresh)' },
      body: JSON.stringify({ identifiers: ids.map((id) => ({ id })) }),
    });
    const json = await res.json();
    for (const card of json.data ?? []) priceById.set(card.id, priceOf(card.prices));
    await new Promise((r) => setTimeout(r, 100)); // Scryfall rate limit
  }

  // 3. Persist prices (per card_id, across all owners) -> triggers recompute totals
  for (const [cardId, price] of priceById) {
    await supabase.from('collections').update({ price_usd: price }).eq('card_id', cardId);
  }

  // 4. Snapshot each user's value for today's history point
  const { data: profiles } = await supabase.from('profiles').select('id, collection_total_value');
  const today = new Date().toISOString().slice(0, 10);
  for (const p of profiles ?? []) {
    await supabase
      .from('collection_value_history')
      .upsert({ user_id: p.id, snapshot_date: today, value: p.collection_total_value ?? 0 }, { onConflict: 'user_id,snapshot_date' });
  }

  return new Response(JSON.stringify({ cards: cardIds.length, users: profiles?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
