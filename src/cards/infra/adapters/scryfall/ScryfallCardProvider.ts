/**
 * MTG card provider — adapts the Scryfall client to the CardProvider port.
 *
 * Step 2 reuses the existing hardened client in `src/services/scryfall.ts`
 * (throttle, caches, chunking) and maps its raw output to UnifiedCard. When the
 * app's domain type flips to UnifiedCard (step 5) the raw client moves under
 * this adapter and the legacy module is retired.
 */

import { CardProvider, SetNumberRef } from '../../../domain/ports/CardProvider';
import { SearchQuery, SearchResult } from '../../../domain/ports/SearchQuery';
import { UnifiedCard } from '../../../domain/UnifiedCard';
import {
  searchCards,
  getCardById,
  getCardsByIds,
  getCardsByNames,
  resolveCardsByNames,
  getCardPrintings,
  getCardsBySetNumber,
  setNumberKey,
  ScryfallHttpError,
} from './scryfallHttp';
import { scryfallToUnified, SCRYFALL_PROVIDER_ID } from './scryfallMapper';
import { ScryfallCard } from './scryfallTypes';

const toUnified = (card: ScryfallCard): UnifiedCard => scryfallToUnified(card);

/** Build a Scryfall query string from the neutral query (MTG forms pass the
 *  full query via `raw.scryfall`; the simple bar passes `text`). */
const toScryfallQuery = (query: SearchQuery): string => {
  const raw = query.raw?.scryfall;
  if (typeof raw === 'string' && raw.trim()) return raw;
  let q = query.text?.trim() ?? '';
  if (query.set) q += ` set:${query.set}`;
  return q.trim();
};

export class ScryfallCardProvider implements CardProvider {
  readonly game = 'mtg' as const;
  readonly id = SCRYFALL_PROVIDER_ID;

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    const q = toScryfallQuery(query);
    if (!q) return { cards: [], hasMore: false };
    const cards = await searchCards(q, signal);
    return { cards: cards.map(toUnified), hasMore: false };
  }

  async getCardById(rawId: string, signal?: AbortSignal): Promise<UnifiedCard | null> {
    try {
      const card = await getCardById(rawId, signal);
      return toUnified(card);
    } catch (error) {
      if (error instanceof ScryfallHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async getCardsByIds(rawIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]> {
    const cards = await getCardsByIds(rawIds, signal);
    return cards.map(toUnified);
  }

  async getCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    const byName = await getCardsByNames(names, signal);
    return new Map([...byName].map(([k, v]) => [k, toUnified(v)]));
  }

  async resolveCardsByNames(names: string[], signal?: AbortSignal): Promise<Map<string, UnifiedCard>> {
    const byName = await resolveCardsByNames(names, signal);
    return new Map([...byName].map(([k, v]) => [k, toUnified(v)]));
  }

  async getPrintings(card: UnifiedCard, signal?: AbortSignal): Promise<UnifiedCard[]> {
    // getCardPrintings only reads `name` and `prints_search_uri`.
    const seed = {
      id: card.rawId,
      name: card.name,
      prints_search_uri: card.mtg?.printsSearchUri,
    } as ScryfallCard;
    const printings = await getCardPrintings(seed, signal);
    return printings.map(toUnified);
  }

  async getCardsBySetNumber(
    refs: SetNumberRef[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    const byKey = await getCardsBySetNumber(
      refs.map((r) => ({ set: r.set, collector_number: r.collectorNumber })),
      signal,
    );
    return new Map([...byKey].map(([k, v]) => [k, toUnified(v)]));
  }
}

export { setNumberKey };
