/**
 * `cardData` — the app's single entry point for card data.
 *
 * ID-based methods take game-qualified ids (`${game}:${rawId}`), group them by
 * game, and route each group to the right provider; name/query methods take an
 * explicit game. This is what the persistence layer and UI call — never a
 * concrete provider.
 */

import { GameId } from '../domain/game';
import { parseCardRef, qualifyId } from '../domain/accessors/identity';
import { UnifiedCard } from '../domain/UnifiedCard';
import { SearchQuery, SearchResult } from '../domain/ports/SearchQuery';
import { SetNumberRef } from '../domain/ports/CardProvider';
import { getProvider } from './registry';

const groupByGame = (qualifiedIds: string[]): Map<GameId, string[]> => {
  const byGame = new Map<GameId, string[]>();
  for (const id of qualifiedIds) {
    const { game, rawId } = parseCardRef(id);
    const list = byGame.get(game);
    if (list) list.push(rawId);
    else byGame.set(game, [rawId]);
  }
  return byGame;
};

export const cardData = {
  async getCardById(qualifiedId: string, signal?: AbortSignal): Promise<UnifiedCard | null> {
    const { game, rawId } = parseCardRef(qualifiedId);
    return getProvider(game).getCardById(rawId, signal);
  },

  /** Fetch many cards by qualified id, preserving requested order. */
  async getCardsByIds(qualifiedIds: string[], signal?: AbortSignal): Promise<UnifiedCard[]> {
    const byGame = groupByGame(qualifiedIds);
    const results = await Promise.all(
      [...byGame].map(([game, rawIds]) => getProvider(game).getCardsByIds(rawIds, signal)),
    );
    const byQualified = new Map<string, UnifiedCard>();
    for (const cards of results) for (const c of cards) byQualified.set(c.id, c);
    return qualifiedIds
      .map((id) => {
        const { game, rawId } = parseCardRef(id);
        return byQualified.get(qualifyId(game, rawId));
      })
      .filter((c): c is UnifiedCard => Boolean(c));
  },

  search(game: GameId, query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    return getProvider(game).search(query, signal);
  },

  resolveCardsByNames(
    game: GameId,
    names: string[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    return getProvider(game).resolveCardsByNames(names, signal);
  },

  getCardsByNames(
    game: GameId,
    names: string[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    return getProvider(game).getCardsByNames(names, signal);
  },

  getPrintings(card: UnifiedCard, signal?: AbortSignal): Promise<UnifiedCard[]> {
    return getProvider(card.game).getPrintings(card, signal);
  },

  async autocomplete(game: GameId, prefix: string, signal?: AbortSignal): Promise<string[]> {
    const provider = getProvider(game);
    return provider.autocomplete ? provider.autocomplete(prefix, signal) : [];
  },

  getCardsBySetNumber(
    game: GameId,
    refs: SetNumberRef[],
    signal?: AbortSignal,
  ): Promise<Map<string, UnifiedCard>> {
    const provider = getProvider(game);
    return provider.getCardsBySetNumber ? provider.getCardsBySetNumber(refs, signal) : Promise.resolve(new Map());
  },
};
