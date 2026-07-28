/*
  # Qualify card ids (Phase 1, step 6)

  The app now identifies cards by a game-qualified id (`${game}:${rawId}`). Every
  existing `card_id` is a bare Scryfall id (all pre-existing data is MTG), so we
  prefix it with `mtg:` to match the in-memory `UnifiedCard.id`. Card fetches go
  through the facade, which decomposes the qualified id back to the raw provider
  id per game.

  Idempotent: only rows whose `card_id` has no ':' are touched. Scryfall ids are
  UUIDs (no colon); already-qualified ids contain one, so re-running is a no-op.
  The `game` column added in the previous migration already backfilled to 'mtg',
  so it stays consistent with the prefix.
*/

update public.collections       set card_id = 'mtg:' || card_id where position(':' in card_id) = 0;
update public.deck_cards         set card_id = 'mtg:' || card_id where position(':' in card_id) = 0;
update public.wishlists          set card_id = 'mtg:' || card_id where position(':' in card_id) = 0;
update public.price_alerts       set card_id = 'mtg:' || card_id where position(':' in card_id) = 0;
update public.trade_items        set card_id = 'mtg:' || card_id where position(':' in card_id) = 0;
update public.card_price_history set card_id = 'mtg:' || card_id where position(':' in card_id) = 0;
