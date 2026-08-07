/**
 * MTG deck rules — the concrete DeckRules for Magic. Ported from the original
 * `utils/deckValidation.ts` (format min/max, per-card copy limits with the
 * "any number of cards named…" / "up to N" exceptions, and commander colour
 * identity), now reading the MTG fields off `UnifiedCard.mtg`.
 */

import { DeckRules, DeckCardEntry, DeckFormat, DeckValidationResult } from '../../domain/rules/DeckRules';
import { UnifiedCard } from '../../domain/UnifiedCard';

const BASIC_LAND_NAMES = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const oracleTextOf = (card: UnifiedCard): string =>
  (card.mtg?.oracleText || card.faces?.[0]?.text || '').toLowerCase();

function copyLimitFor(card: UnifiedCard, formatMax: number): number {
  if (BASIC_LAND_NAMES.has((card.name || '').toLowerCase())) return Infinity;
  const text = oracleTextOf(card);
  if (/a deck can have any number of cards named/.test(text)) return Infinity;
  const upTo = text.match(/a deck can have up to (\w+) cards named/);
  if (upTo && NUMBER_WORDS[upTo[1]] != null) return NUMBER_WORDS[upTo[1]];
  return formatMax;
}

interface FormatRules {
  minCards: number;
  maxCards?: number;
  maxCopies: number;
  requiresCommander?: boolean;
}

const FORMAT_RULES: Record<string, FormatRules> = {
  standard: { minCards: 60, maxCopies: 4 },
  modern: { minCards: 60, maxCopies: 4 },
  pioneer: { minCards: 60, maxCopies: 4 },
  commander: { minCards: 100, maxCards: 100, maxCopies: 1, requiresCommander: true },
  brawl: { minCards: 60, maxCards: 60, maxCopies: 1, requiresCommander: true },
  oathbreaker: { minCards: 60, maxCards: 60, maxCopies: 1, requiresCommander: true },
  legacy: { minCards: 60, maxCopies: 4 },
  vintage: { minCards: 60, maxCopies: 4 },
  pauper: { minCards: 60, maxCopies: 4 },
};

const label = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

// Commander legality is based on COLOUR IDENTITY (coloured mana symbols in the
// cost AND rules text), not mana-cost colours — so e.g. Najeela (cost {2}{R},
// ability text {W}{U}{B}{R}{G}) is a 5-colour commander. Fall back to mana-cost
// colours only if identity is missing. (Mirrors deckSuggestions.ts — keep both
// in sync.)
const getCommanderColors = (commander: UnifiedCard | undefined): string[] =>
  commander?.mtg?.colorIdentity ?? commander?.mtg?.colors ?? [];

const isCardValidForCommander = (card: UnifiedCard, commanderColors: string[]): boolean => {
  if (commanderColors.length === 0) return true;
  return (card.mtg?.colorIdentity ?? card.mtg?.colors ?? []).every((color) => commanderColors.includes(color));
};

export const mtgDeckRules: DeckRules = {
  game: 'mtg',

  formats(): DeckFormat[] {
    return Object.keys(FORMAT_RULES).map((id) => ({ id, label: label(id) }));
  },

  validate(format: string, cards: DeckCardEntry[]): DeckValidationResult {
    const rules = FORMAT_RULES[format];
    const errors: string[] = [];
    if (!rules) return { isValid: true, errors }; // unknown/freeform format

    // The sideboard carries no rules: validate the mainboard only.
    const main = cards.filter((c) => !c.isSideboard);
    const totalCards = main.reduce((acc, c) => acc + c.quantity, 0);

    if (totalCards < rules.minCards) {
      errors.push(`Deck must contain at least ${rules.minCards} cards`);
    }
    if (rules.maxCards && totalCards > rules.maxCards) {
      errors.push(`Deck must not contain more than ${rules.maxCards} cards`);
    }

    const cardCounts = new Map<string, number>();
    for (const { card, quantity } of main) {
      cardCounts.set(card.id, (cardCounts.get(card.id) || 0) + quantity);
    }
    cardCounts.forEach((count, cardId) => {
      const card = main.find((c) => c.card.id === cardId)?.card;
      if (!card) return;
      const limit = copyLimitFor(card, rules.maxCopies);
      if (count > limit) errors.push(`${card.name} has too many copies (max ${limit})`);
    });

    if (rules.requiresCommander) {
      const commander = main.find((c) => c.isCommander)?.card;
      if (!commander) {
        errors.push(
          format === 'oathbreaker'
            ? 'Oathbreaker deck must have an oathbreaker'
            : format === 'brawl'
              ? 'Brawl deck must have a commander'
              : 'Commander deck must have a commander',
        );
      } else {
        const commanderColors = getCommanderColors(commander);
        const invalid = main.filter(
          ({ card, isCommander }) => !isCommander && !isCardValidForCommander(card, commanderColors),
        );
        if (invalid.length > 0) errors.push(`Some cards don't match commander's color identity`);
      }
    }

    return { isValid: errors.length === 0, errors };
  },
};
