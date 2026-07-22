/*
  # Deck tags (freeform folders/labels)
*/
alter table public.decks add column if not exists tags text[] default '{}';
