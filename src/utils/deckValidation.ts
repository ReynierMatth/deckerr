import { Deck } from '../types';

interface DeckValidation {
  isValid: boolean;
  errors: string[];
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
  console.log("deck in validator", deck);
  const rules = FORMAT_RULES[deck.format as keyof typeof FORMAT_RULES];
  const errors: string[] = [];
  
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
    console.log("card", card);
    const currentCount = cardCounts.get(card.id) || 0;
    cardCounts.set(card.id, currentCount + quantity);
  }
  
  cardCounts.forEach((count, cardName) => {
    const card = deck.cards.find(c => c.card.id === cardName)?.card;
    const isBasicLand = card?.name === 'Plains' || card?.name === 'Island' || card?.name === 'Swamp' || card?.name === 'Mountain' || card?.name === 'Forest';

    if (!isBasicLand && count > rules.maxCopies) {
      errors.push(`${cardName} has too many copies (max ${rules.maxCopies})`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
