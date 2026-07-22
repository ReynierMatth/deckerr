/*
  # Deck columns used by the app but never versioned

  The app writes cover_card_id / validation_errors / is_valid / card_count on
  `decks` (see DeckManager.saveDeck, DeckList mapping), but no migration ever
  created them — they existed only on the old production DB. Add them so a
  fresh, migration-only rebuild matches what the code expects.
*/

alter table public.decks
  add column if not exists cover_card_id text,
  add column if not exists validation_errors jsonb default '[]'::jsonb,
  add column if not exists is_valid boolean default true,
  add column if not exists card_count integer default 0;
