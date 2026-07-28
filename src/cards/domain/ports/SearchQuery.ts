/**
 * Neutral search query.
 *
 * A fully cross-game query grammar is a trap (Scryfall alone has ~40 operators
 * with no Pokémon equivalent). Instead we model the small neutral core every
 * game shares plus an opaque per-game `raw` escape hatch produced by that game's
 * advanced-search form and interpreted by that game's provider.
 */

import { UnifiedCard } from '../UnifiedCard';

export interface SearchQuery {
  /** Free text / name contains. */
  text?: string;
  set?: string;
  rarity?: string[];
  order?: 'name' | 'released' | 'set' | 'price' | 'rarity';
  unique?: 'cards' | 'prints' | 'art';
  page?: number;
  /**
   * Provider-specific advanced params. Each game's search form owns its shape
   * (e.g. `raw.scryfall` is a Scryfall query string, `raw.pokemon` a param map).
   */
  raw?: Record<string, unknown>;
}

export interface SearchResult {
  cards: UnifiedCard[];
  hasMore: boolean;
  /** Next page index to request, when `hasMore`. */
  nextPage?: number;
}
