/**
 * MTG card service — the app-facing Scryfall API.
 *
 * Thin mapping layer over the raw client
 * (`src/cards/infra/adapters/scryfall/scryfallHttp.ts`): same function names and
 * signatures as before, but every result is now a game-neutral `UnifiedCard`.
 * Consumers read cards through the domain accessors, not raw Scryfall fields.
 */

import { UnifiedCard } from '../cards/domain/UnifiedCard';
import { scryfallToUnified } from '../cards/infra/adapters/scryfall/scryfallMapper';
import { ScryfallCard } from '../cards/infra/adapters/scryfall/scryfallTypes';
import * as http from '../cards/infra/adapters/scryfall/scryfallHttp';

export { ScryfallHttpError, setNumberKey } from '../cards/infra/adapters/scryfall/scryfallHttp';

// Memoize the mapping per raw object. The raw client returns the same cached
// ScryfallCard reference for a given id, so this yields a stable UnifiedCard
// reference across lookups (referential equality for React + caching).
const unifiedCache = new WeakMap<ScryfallCard, UnifiedCard>();
const map = (card: ScryfallCard): UnifiedCard => {
  const cached = unifiedCache.get(card);
  if (cached) return cached;
  const unified = scryfallToUnified(card);
  unifiedCache.set(card, unified);
  return unified;
};

const mapNamed = (byName: Map<string, ScryfallCard>): Map<string, UnifiedCard> =>
  new Map([...byName].map(([key, card]) => [key, map(card)]));

export const searchCards = async (query: string, signal?: AbortSignal): Promise<UnifiedCard[]> =>
  (await http.searchCards(query, signal)).map(map);

export const getRandomCards = async (count = 10, signal?: AbortSignal): Promise<UnifiedCard[]> =>
  (await http.getRandomCards(count, signal)).map(map);

export const getCardById = async (cardId: string, signal?: AbortSignal): Promise<UnifiedCard> =>
  map(await http.getCardById(cardId, signal));

export const getCardsByIds = async (cardIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]> =>
  (await http.getCardsByIds(cardIds, signal)).map(map);

export const getCardsByNames = async (
  names: string[],
  signal?: AbortSignal,
): Promise<Map<string, UnifiedCard>> => mapNamed(await http.getCardsByNames(names, signal));

export const getCardByFuzzyName = async (
  name: string,
  signal?: AbortSignal,
): Promise<UnifiedCard | null> => {
  const card = await http.getCardByFuzzyName(name, signal);
  return card ? map(card) : null;
};

export const resolveCardsByNames = async (
  names: string[],
  signal?: AbortSignal,
): Promise<Map<string, UnifiedCard>> => mapNamed(await http.resolveCardsByNames(names, signal));

export const getCardsBySetNumber = async (
  identifiers: { set: string; collector_number: string }[],
  signal?: AbortSignal,
): Promise<Map<string, UnifiedCard>> => mapNamed(await http.getCardsBySetNumber(identifiers, signal));

export const getCardPrintings = async (
  card: UnifiedCard,
  signal?: AbortSignal,
): Promise<UnifiedCard[]> => {
  const seed: Pick<ScryfallCard, 'name' | 'prints_search_uri'> = {
    name: card.name,
    prints_search_uri: card.mtg?.printsSearchUri,
  };
  return (await http.getCardPrintings(seed, signal)).map(map);
};
