/*
  # Foil finish + condition on collection entries (Scryfall model: same card,
  # foil is just a different price/finish). Kept as attributes (no unique-key
  # change) — value uses usd_foil when is_foil.
*/
alter table public.collections add column if not exists is_foil boolean not null default false;
alter table public.collections add column if not exists condition text;
