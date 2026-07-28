import { GameId } from '../../domain/game';
import { DeckRules } from '../../domain/rules/DeckRules';
import { mtgDeckRules } from './mtgRules';
import { pokemonDeckRules } from './pokemonRules';

const RULES: Partial<Record<GameId, DeckRules>> = {
  mtg: mtgDeckRules,
  pokemon: pokemonDeckRules,
};

/** Deck rules for a game (falls back to MTG for games without dedicated rules). */
export const getDeckRules = (game: GameId): DeckRules => RULES[game] ?? mtgDeckRules;
