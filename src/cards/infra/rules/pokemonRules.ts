/**
 * Pokémon TCG deck rules: exactly 60 cards, at most 4 copies of any card with
 * the same name — except Basic Energy, which is unlimited.
 */

import { DeckRules, DeckCardEntry, DeckFormat, DeckValidationResult } from '../../domain/rules/DeckRules';
import { UnifiedCard } from '../../domain/UnifiedCard';

const FORMATS: DeckFormat[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'expanded', label: 'Expanded' },
  { id: 'unlimited', label: 'Unlimited' },
];

const isBasicEnergy = (card: UnifiedCard): boolean =>
  card.pokemon?.supertype === 'Energy' &&
  ((card.pokemon?.subtypes ?? []).some((s) => s.toLowerCase() === 'basic') ||
    /^basic\b.*energy$/i.test(card.name));

export const pokemonDeckRules: DeckRules = {
  game: 'pokemon',

  formats(): DeckFormat[] {
    return FORMATS;
  },

  validate(_format: string, cards: DeckCardEntry[]): DeckValidationResult {
    const errors: string[] = [];
    const main = cards.filter((c) => !c.isSideboard);
    const total = main.reduce((acc, c) => acc + c.quantity, 0);

    if (total !== 60) errors.push('A Pokémon deck must contain exactly 60 cards');

    // 4-copy limit per card name; Basic Energy is exempt.
    const byName = new Map<string, { count: number; basicEnergy: boolean }>();
    for (const { card, quantity } of main) {
      const key = card.name.toLowerCase();
      const prev = byName.get(key);
      byName.set(key, {
        count: (prev?.count ?? 0) + quantity,
        basicEnergy: (prev?.basicEnergy ?? false) || isBasicEnergy(card),
      });
    }
    byName.forEach((v, name) => {
      if (!v.basicEnergy && v.count > 4) errors.push(`${name} has too many copies (max 4)`);
    });

    return { isValid: errors.length === 0, errors };
  },
};
