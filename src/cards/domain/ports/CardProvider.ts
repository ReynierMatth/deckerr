/**
 * The port. A card-data provider for a single game.
 *
 * Providers deal exclusively in **raw provider ids** (`rawId`) — the facade
 * (infra) handles game-qualification and routing. `autocomplete` and
 * `getCardsBySetNumber` are optional capabilities: callers feature-detect them
 * so a provider (e.g. a Pokémon one) need not implement Scryfall-only features.
 */

import { GameId } from '../game';
import { UnifiedCard } from '../UnifiedCard';
import { SearchQuery, SearchResult } from './SearchQuery';

export interface SetNumberRef {
  set: string;
  collectorNumber: string;
}

export interface CardProvider {
  readonly game: GameId;
  /** Adapter id: 'scryfall' | 'pokemontcg' | 'tcgdex' … */
  readonly id: string;

  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult>;

  getCardById(rawId: string, signal?: AbortSignal): Promise<UnifiedCard | null>;
  getCardsByIds(rawIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]>;

  /** Batch resolve by exact name; keyed by lower-cased requested name. */
  getCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>>;
  /** Like `getCardsByNames` but with a fuzzy fallback for near-misses. */
  resolveCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>>;

  /** Every printing/edition of a card, release order. */
  getPrintings(card: UnifiedCard, signal?: AbortSignal): Promise<UnifiedCard[]>;

  /** Optional: name prefix autocomplete. */
  autocomplete?(prefix: string, signal?: AbortSignal): Promise<string[]>;

  /** Optional: resolve exact printings by set code + collector number. */
  getCardsBySetNumber?(
    refs: SetNumberRef[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>>;
}
