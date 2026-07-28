/**
 * Game-neutral card model.
 *
 * The common path (grids, tiles, image resolution, collection maths) reads only
 * the shared fields, so it stays game-agnostic. Game-specific screens (mana
 * curve, Pokémon type breakdown) narrow to a typed extension (`mtg` / `pokemon`)
 * via the `isMtg` / `isPokemon` guards below — we deliberately use typed
 * extensions rather than a discriminated union to avoid forcing a
 * `switch (card.game)` at every access site.
 */

import { GameId } from './game';
import { CardPrices } from './prices';

export interface UnifiedImages {
  small?: string;
  normal?: string;
  large?: string;
  artCrop?: string;
  borderCrop?: string;
}

export interface UnifiedFace {
  name: string;
  text?: string;
  typeLine?: string;
  images?: UnifiedImages;
}

/** MTG-specific fields, present iff `game === 'mtg'`. */
export interface MtgCardData {
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  oracleText?: string;
  flavorText?: string;
  colors?: string[];
  colorIdentity?: string[];
  layout?: string;
  /** Scryfall search URI listing every printing of this card. */
  printsSearchUri?: string;
}

/** Pokémon-specific fields, present iff `game === 'pokemon'`. */
export interface PokemonCardData {
  supertype?: 'Pokémon' | 'Trainer' | 'Energy';
  subtypes?: string[];
  hp?: number;
  types?: string[];
  evolvesFrom?: string;
  regulationMark?: string;
  nationalPokedexNumbers?: number[];
}

export interface UnifiedCard {
  /** Game-qualified identity `${game}:${rawId}` — unique across all games. */
  id: string;
  /** Provider id (what the DB stores in `card_id`). */
  rawId: string;
  game: GameId;
  /** Which adapter produced this card ('scryfall' | 'pokemontcg' | 'tcgdex' …). */
  providerId: string;

  name: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  rarity?: string;
  lang?: string;
  artist?: string;

  images?: UnifiedImages;
  /**
   * Populated with >1 entry ONLY when the card has a real, flippable back face.
   * Mappers must enforce this so `isDoubleFaced` can rely on `faces.length > 1`.
   */
  faces?: UnifiedFace[];
  prices?: CardPrices;

  mtg?: MtgCardData;
  pokemon?: PokemonCardData;
}

export const isMtg = (c: UnifiedCard): c is UnifiedCard & { mtg: MtgCardData } => c.game === 'mtg';

export const isPokemon = (c: UnifiedCard): c is UnifiedCard & { pokemon: PokemonCardData } =>
  c.game === 'pokemon';
