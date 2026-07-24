/*
  # Sideboard support

  A deck card now belongs to the mainboard or the sideboard. Same card_id can
  appear in both (main + side), so uniqueness is per (deck_id, card_id, board)
  rather than per card. is_sideboard defaults false (existing rows = mainboard).
*/

alter table public.deck_cards add column if not exists is_sideboard boolean not null default false;
