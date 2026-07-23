/*
  # Denormalize card_name onto collections so the collection can be searched
  server-side (ILIKE, paginated) instead of only over already-loaded pages.
*/
alter table public.collections add column if not exists card_name text;
create index if not exists collections_user_name_idx on public.collections (user_id, card_name);
