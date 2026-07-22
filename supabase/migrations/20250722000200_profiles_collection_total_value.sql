/*
  # profiles.collection_total_value

  Read by getCollectionTotalValue (api.ts) and the Collection/Community realtime
  handlers, but never created by a migration (it lived only on the old prod DB,
  where a trigger maintained it). Add the column so reads don't 400.

  NOTE: the trigger that keeps this value in sync from `collections.price_usd`
  is NOT restored here — the value defaults to 0 until that follow-up lands.
*/

alter table public.profiles
  add column if not exists collection_total_value numeric default 0;
