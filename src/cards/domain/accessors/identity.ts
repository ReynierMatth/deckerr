/**
 * Card identity helpers.
 *
 * The app-level id is game-qualified (`${game}:${rawId}`) so a single string
 * keeps flowing through query keys, Maps and `getCardsByIds`. The DB stores the
 * bare `rawId` in `card_id` plus a `game` column; persistence composes/decomposes
 * with these helpers.
 */

import { GameId, isGameId } from '../game';

export interface CardRef {
  game: GameId;
  rawId: string;
}

export const qualifyId = (game: GameId, rawId: string): string => `${game}:${rawId}`;

/**
 * Decompose a qualified id back into `{ game, rawId }`. Unqualified ids (and ids
 * whose prefix is not a known game) are treated as legacy MTG raw ids — the
 * compatibility shim that lets pre-migration data keep resolving until IDs are
 * qualified end-to-end.
 */
export const parseCardRef = (id: string): CardRef => {
  const i = id.indexOf(':');
  if (i > 0) {
    const prefix = id.slice(0, i);
    if (isGameId(prefix)) return { game: prefix, rawId: id.slice(i + 1) };
  }
  return { game: 'mtg', rawId: id };
};
