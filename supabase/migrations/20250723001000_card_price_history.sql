/*
  # Per-card daily price history (for the card price chart)

  One row per (card_id, day) with the Scryfall usd / usd_foil prices, written by
  any signed-in price refresh (client or edge function). Prices are not
  user-specific, so every authenticated user can read and record them.
*/
create table if not exists public.card_price_history (
  card_id text not null,
  price_usd numeric,
  price_usd_foil numeric,
  recorded_at date not null default current_date,
  created_at timestamptz default now(),
  primary key (card_id, recorded_at)
);

create index if not exists card_price_history_card_recorded_idx
  on public.card_price_history (card_id, recorded_at desc);

alter table public.card_price_history enable row level security;

drop policy if exists "Authenticated users can read price history" on public.card_price_history;
create policy "Authenticated users can read price history"
  on public.card_price_history for select to authenticated
  using (true);

drop policy if exists "Authenticated users can insert price history" on public.card_price_history;
create policy "Authenticated users can insert price history"
  on public.card_price_history for insert to authenticated
  with check (true);

drop policy if exists "Authenticated users can update price history" on public.card_price_history;
create policy "Authenticated users can update price history"
  on public.card_price_history for update to authenticated
  using (true) with check (true);
