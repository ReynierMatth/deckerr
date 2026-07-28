/*
  # Multi-TCG game discriminator (Phase 1)

  Adds a `game` column to every card-scoped table so each row knows which TCG it
  belongs to (mtg | pokemon | lorcana | onepiece). Existing rows backfill to
  'mtg' via the column default.

  ## Why the existing uniques are kept unchanged (Phase 1)
  The card-scoped uniques — collections(user_id, card_id),
  wishlists(user_id, card_id), price_alerts(user_id, card_id, direction) and
  card_price_history PK (card_id, recorded_at) — are deliberately NOT recomposed
  to include `game` yet:
    - They are referenced by `ON CONFLICT (user_id, card_id)` clauses inside the
      execute_trade / confirm-physical RPCs; recomposing them would force a
      rewrite of those stored procedures.
    - In Phase 1 (MTG + Pokémon) card ids never collide across games — MTG ids
      are Scryfall UUIDs, Pokémon ids are slugs like `base1-4` — so per-user
      uniqueness on card_id alone stays correct.
  Recomposing the uniques to `(user_id, game, card_id)` (and updating the RPCs)
  is deferred to Phase 2 (Lorcana / One Piece), where ids could collide.

  Also adds profiles.preferred_price_source for the per-user price-source choice.
*/

-- 1. game discriminator on every card-scoped table --------------------------
alter table public.collections       add column if not exists game text not null default 'mtg';
alter table public.deck_cards         add column if not exists game text not null default 'mtg';
alter table public.decks              add column if not exists game text not null default 'mtg';
alter table public.wishlists          add column if not exists game text not null default 'mtg';
alter table public.price_alerts       add column if not exists game text not null default 'mtg';
alter table public.trade_items        add column if not exists game text not null default 'mtg';
alter table public.card_price_history add column if not exists game text not null default 'mtg';

-- 2. constrain to known games -----------------------------------------------
alter table public.collections       drop constraint if exists collections_game_check;
alter table public.collections       add  constraint collections_game_check       check (game in ('mtg','pokemon','lorcana','onepiece'));
alter table public.deck_cards         drop constraint if exists deck_cards_game_check;
alter table public.deck_cards         add  constraint deck_cards_game_check        check (game in ('mtg','pokemon','lorcana','onepiece'));
alter table public.decks              drop constraint if exists decks_game_check;
alter table public.decks              add  constraint decks_game_check             check (game in ('mtg','pokemon','lorcana','onepiece'));
alter table public.wishlists          drop constraint if exists wishlists_game_check;
alter table public.wishlists          add  constraint wishlists_game_check         check (game in ('mtg','pokemon','lorcana','onepiece'));
alter table public.price_alerts       drop constraint if exists price_alerts_game_check;
alter table public.price_alerts       add  constraint price_alerts_game_check      check (game in ('mtg','pokemon','lorcana','onepiece'));
alter table public.trade_items        drop constraint if exists trade_items_game_check;
alter table public.trade_items        add  constraint trade_items_game_check       check (game in ('mtg','pokemon','lorcana','onepiece'));
alter table public.card_price_history drop constraint if exists card_price_history_game_check;
alter table public.card_price_history add  constraint card_price_history_game_check check (game in ('mtg','pokemon','lorcana','onepiece'));

-- 3. per-game filtering indexes (collection / wishlist views) ---------------
create index if not exists idx_collections_user_game on public.collections(user_id, game);
create index if not exists idx_wishlists_user_game   on public.wishlists(user_id, game);

-- 4. per-user preferred price source ----------------------------------------
alter table public.profiles add column if not exists preferred_price_source text not null default 'tcgplayer';
alter table public.profiles drop constraint if exists profiles_preferred_price_source_check;
alter table public.profiles add  constraint profiles_preferred_price_source_check check (preferred_price_source in ('tcgplayer','cardmarket'));
