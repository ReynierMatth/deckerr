/**
 * Wraps a primary provider with a fallback. Each call tries the primary; on
 * error or empty result it retries the fallback (e.g. pokemontcg.io -> tcgdex).
 * Aborts (caller-cancelled requests) are never retried.
 */

import { CardProvider, SetNumberRef } from '../../domain/ports/CardProvider';
import { SearchQuery, SearchResult } from '../../domain/ports/SearchQuery';
import { UnifiedCard } from '../../domain/UnifiedCard';

export class FallbackCardProvider implements CardProvider {
  constructor(
    private readonly primary: CardProvider,
    private readonly fallback: CardProvider,
  ) {}

  get game() {
    return this.primary.game;
  }
  get id() {
    return this.primary.id;
  }

  private async withFallback<T>(
    run: (p: CardProvider) => Promise<T>,
    isEmpty: (r: T) => boolean,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      const result = await run(this.primary);
      if (!isEmpty(result)) return result;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    return run(this.fallback);
  }

  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    return this.withFallback((p) => p.search(query, signal), (r) => r.cards.length === 0, signal);
  }

  getCardById(rawId: string, signal?: AbortSignal): Promise<UnifiedCard | null> {
    return this.withFallback((p) => p.getCardById(rawId, signal), (r) => r === null, signal);
  }

  getCardsByIds(rawIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]> {
    return this.withFallback((p) => p.getCardsByIds(rawIds, signal), (r) => r.length === 0, signal);
  }

  getCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    return this.withFallback((p) => p.getCardsByNames(names, signal), (r) => r.size === 0, signal);
  }

  resolveCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    return this.withFallback((p) => p.resolveCardsByNames(names, signal), (r) => r.size === 0, signal);
  }

  getPrintings(card: UnifiedCard, signal?: AbortSignal): Promise<UnifiedCard[]> {
    return this.withFallback((p) => p.getPrintings(card, signal), (r) => r.length === 0, signal);
  }

  async autocomplete(prefix: string, signal?: AbortSignal): Promise<string[]> {
    return this.withFallback(
      (p) => (p.autocomplete ? p.autocomplete(prefix, signal) : Promise.resolve([])),
      (r) => r.length === 0,
      signal,
    );
  }

  async getCardsBySetNumber(
    refs: SetNumberRef[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    return this.withFallback(
      (p) => (p.getCardsBySetNumber ? p.getCardsBySetNumber(refs, signal) : Promise.resolve(new Map())),
      (r) => r.size === 0,
      signal,
    );
  }
}
