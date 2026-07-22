import { Card, Deck } from '../types';

interface DeckValidation {
  isValid: boolean;
  errors: string[];
}

// Helper function to get commander color identity
function getCommanderColors(commander: Card | null): string[] {
  if (!commander) return [];
  return commander.colors || [];
}

// Helper function to check if a card's colors are valid for the commander
function isCardValidForCommander(card: Card, commanderColors: string[]): boolean {
  if (commanderColors.length === 0) return true;
  const cardColors = card.colors || [];
  return cardColors.every(color => commanderColors.includes(color));
}

const BASIC_LAND_NAMES = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const oracleTextOf = (card: Card): string =>
  (card.oracle_text || card.card_faces?.[0]?.oracle_text || '').toLowerCase();

/**
 * How many copies of a card a deck may hold before it's worth warning about.
 * Basic lands and the "A deck can have any number of cards named ..." cards are
 * unlimited; cards like Seven Dwarves / Nazgûl carry their own "up to N" limit
 * in their rules text. Everything else falls back to the format's max.
 */
function copyLimitFor(card: Card, formatMax: number): number {
  if (BASIC_LAND_NAMES.has((card.name || '').toLowerCase())) return Infinity;
  const text = oracleTextOf(card);
  if (/a deck can have any number of cards named/.test(text)) return Infinity;
  const upTo = text.match(/a deck can have up to (\w+) cards named/);
  if (upTo && NUMBER_WORDS[upTo[1]] != null) return NUMBER_WORDS[upTo[1]];
  return formatMax;
}

const FORMAT_RULES = {
  standard: {
    minCards: 60,
    maxCards: undefined,
    maxCopies: 4,
  },
  modern: {
    minCards: 60,
    maxCards: undefined,
    maxCopies: 4,
  },
  commander: {
    minCards: 100,
    maxCards: 100,
    maxCopies: 1,
    requiresCommander: true,
  },
  legacy: {
    minCards: 60,
    maxCards: undefined,
    maxCopies: 4,
  },
  vintage: {
    minCards: 60,
    maxCards: undefined,
    maxCopies: 4,
  },
  pauper: {
    minCards: 60,
    maxCards: undefined,
    maxCopies: 4,
  },
};

export function validateDeck(deck: Deck): DeckValidation {
  const rules = FORMAT_RULES[deck.format as keyof typeof FORMAT_RULES];
  const errors: string[] = [];

  // Unknown/freeform format: nothing to warn about.
  if (!rules) {
    return { isValid: true, errors };
  }

  // Count total cards
  const totalCards = deck.cards.reduce((acc, curr) => acc + curr.quantity, 0);

  // Check minimum cards
  if (totalCards < rules.minCards) {
    errors.push(`Deck must contain at least ${rules.minCards} cards`);
  }

  // Check maximum cards
  if (rules.maxCards && totalCards > rules.maxCards) {
    errors.push(`Deck must not contain more than ${rules.maxCards} cards`);
  }

  // Check card copies
  const cardCounts = new Map<string, number>();
  for (const element of deck.cards) {
    const {card, quantity} = element;
    //console.log("card", card);
    const currentCount = cardCounts.get(card.id) || 0;
    cardCounts.set(card.id, currentCount + quantity);
  }

  cardCounts.forEach((count, cardId) => {
    const card = deck.cards.find(c => c.card.id === cardId)?.card;
    if (!card) return;

    const limit = copyLimitFor(card, rules.maxCopies);
    if (count > limit) {
      errors.push(`${card.name} has too many copies (max ${limit})`);
    }
  });

  // Commander-specific validations
  if (deck.format === 'commander') {
    const commander = deck.cards.find(card => card.is_commander)?.card;

    if (!commander) {
      errors.push('Commander deck must have a commander');
    } else {
      // Check commander color identity
      const commanderColors = getCommanderColors(commander);
      const invalidCards = deck.cards.filter(({ card, is_commander }) =>
        !is_commander && !isCardValidForCommander(card, commanderColors)
      );

      if (invalidCards.length > 0) {
        errors.push(`Some cards don't match commander's color identity`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
