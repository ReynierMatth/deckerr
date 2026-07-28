import { Deck } from '../types';
import { getDeckRules } from '../cards/infra/rules';
import { DeckValidationResult } from '../cards/domain/rules/DeckRules';

/**
 * Validate a deck against its game's rules. Delegates to the per-game DeckRules
 * (MTG format rules, Pokémon 60-card/4-copy rules, …) selected by `deck.game`.
 */
export function validateDeck(deck: Deck): DeckValidationResult {
  return getDeckRules(deck.game).validate(
    deck.format,
    deck.cards.map((c) => ({
      card: c.card,
      quantity: c.quantity,
      isCommander: c.is_commander,
      isSideboard: c.is_sideboard,
    })),
  );
}
