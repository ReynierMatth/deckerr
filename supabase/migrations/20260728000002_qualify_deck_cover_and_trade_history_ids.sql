/*
  # Qualify the two card-id columns missed by 20260728000001

  `decks.cover_card_id` (deck cover) and `trade_items` history table
  `trade_history_items.card_id` also hold card ids and must be game-qualified so
  they match the in-memory UnifiedCard.id (a bare cover id made MTG deck covers
  render as "No Cover"). Idempotent: only bare ids (no ':') are touched.
*/

update public.decks               set cover_card_id = 'mtg:' || cover_card_id
  where cover_card_id is not null and position(':' in cover_card_id) = 0;

update public.trade_history_items set card_id = 'mtg:' || card_id
  where position(':' in card_id) = 0;
