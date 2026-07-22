/*
  # Opt-in shareable decks: a deck flagged is_public can be viewed (read-only)
  by any signed-in user via its link.
*/
alter table public.decks add column if not exists is_public boolean not null default false;

drop policy if exists "Anyone can view public decks" on public.decks;
create policy "Anyone can view public decks"
  on public.decks for select to authenticated
  using (is_public = true);

drop policy if exists "Anyone can view cards of public decks" on public.deck_cards;
create policy "Anyone can view cards of public decks"
  on public.deck_cards for select to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_cards.deck_id and d.is_public = true));
