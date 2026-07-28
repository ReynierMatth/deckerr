import { Card } from '../types';

/**
 * Land-count/distribution suggestions and commander color-identity helpers for
 * the deck builder. Pure and side-effect free.
 */
export const suggestLandCountAndDistribution = (
  cards: { card: Card; quantity: number }[],
  format: string,
  commanderColors: string[] = []
) => {
  const formatRules = {
    standard: { minCards: 60 },
    modern: { minCards: 60 },
    pioneer: { minCards: 60 },
    commander: { minCards: 100 },
    brawl: { minCards: 60 },
    oathbreaker: { minCards: 60 },
    legacy: { minCards: 60 },
    vintage: { minCards: 60 },
    pauper: { minCards: 60 },
  };

  const { minCards } =
    formatRules[format as keyof typeof formatRules] || formatRules.standard;
  const deckSize = cards.reduce((acc, { quantity }) => acc + quantity, 0);
  const landsToAdd = Math.max(0, minCards - deckSize);

  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let totalColorSymbols = 0;

  cards.forEach(({ card, quantity }) => {
    const manaCost = card.mtg?.manaCost;
    if (manaCost) {
      const wMatches = (manaCost.match(/\{W\}/g) || []).length;
      const uMatches = (manaCost.match(/\{U\}/g) || []).length;
      const bMatches = (manaCost.match(/\{B\}/g) || []).length;
      const rMatches = (manaCost.match(/\{R\}/g) || []).length;
      const gMatches = (manaCost.match(/\{G\}/g) || []).length;

      colorCounts.W += wMatches * quantity;
      colorCounts.U += uMatches * quantity;
      colorCounts.B += bMatches * quantity;
      colorCounts.R += rMatches * quantity;
      colorCounts.G += gMatches * quantity;

      totalColorSymbols +=
        (wMatches + uMatches + bMatches + rMatches + gMatches) * quantity;
    }
  });

  // For commander, filter out colors not in commander's color identity
  if (format === 'commander' && commanderColors.length > 0) {
    for (const color in colorCounts) {
      if (!commanderColors.includes(color)) {
        totalColorSymbols -= colorCounts[color as keyof typeof colorCounts];
        colorCounts[color as keyof typeof colorCounts] = 0;
      }
    }
  }

  const landDistribution: { [key: string]: number } = {};
  for (const color in colorCounts) {
    const proportion =
      totalColorSymbols > 0
        ? colorCounts[color as keyof typeof colorCounts] / totalColorSymbols
        : 0;
    landDistribution[color] = Math.round(landsToAdd * proportion);
  }

  const totalDistributed = Object.values(landDistribution).reduce(
    (acc, count) => acc + count,
    0
  );

  if (totalDistributed > landsToAdd) {
    // Find the color with the most lands
    let maxColor = '';
    let maxCount = 0;
    for (const color in landDistribution) {
      if (landDistribution[color] > maxCount) {
        maxColor = color;
        maxCount = landDistribution[color];
      }
    }

    // Reduce the land count of that color
    landDistribution[maxColor] = maxCount - 1;
  }

  return { landCount: landsToAdd, landDistribution };
};

// Get commander color identity
export const getCommanderColors = (commander: Card | null): string[] => {
  if (!commander) return [];
  return commander.mtg?.colors || [];
};

// Check if a card's colors are valid for the commander
export const isCardValidForCommander = (card: Card, commanderColors: string[]): boolean => {
  if (commanderColors.length === 0) return true; // No commander restriction
  const cardColors = card.mtg?.colors || [];
  // Every color in the card must be in the commander's colors
  return cardColors.every(color => commanderColors.includes(color));
};
