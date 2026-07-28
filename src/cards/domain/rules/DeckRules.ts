/**
 * Deck-rules port. Each game supplies a concrete implementation (MTG format
 * rules, Pokémon 60-card/4-copy rules, …) selected by `game`. Concrete rules
 * live in `src/cards/infra/rules/`.
 */

import { GameId } from '../game';
import { UnifiedCard } from '../UnifiedCard';

export interface DeckCardEntry {
  card: UnifiedCard;
  quantity: number;
  isCommander?: boolean;
  isSideboard?: boolean;
}

export interface DeckFormat {
  id: string;
  label: string;
}

export interface DeckValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface DeckRules {
  readonly game: GameId;
  /** Formats this game offers (e.g. Commander, Standard). */
  formats(): DeckFormat[];
  validate(format: string, cards: DeckCardEntry[]): DeckValidationResult;
}
