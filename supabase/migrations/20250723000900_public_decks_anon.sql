/*
  # Public deck links work for signed-out visitors too.

  The share toggle promises "Anyone with the link can view this deck", but the
  select policies were restricted to `authenticated`. Extend them to `anon`,
  and let anonymous visitors read the username of a public deck's owner
  (needed for the byline on the public deck page) — nothing else.
*/

drop policy if exists "Anyone can view public decks" on public.decks;
create policy "Anyone can view public decks"
  on public.decks for select to anon, authenticated
  using (is_public = true);

drop policy if exists "Anyone can view cards of public decks" on public.deck_cards;
create policy "Anyone can view cards of public decks"
  on public.deck_cards for select to anon, authenticated
  using (exists (select 1 from public.decks d where d.id = deck_cards.deck_id and d.is_public = true));

drop policy if exists "Anon can view public deck owners" on public.profiles;
create policy "Anon can view public deck owners"
  on public.profiles for select to anon
  using (exists (select 1 from public.decks d where d.user_id = profiles.id and d.is_public = true));
