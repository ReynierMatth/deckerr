import { Card } from '../types';

export interface BuylistItem {
  card: Card;
  needed: number;
  owned: number;
  missing: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Buylist {
  items: BuylistItem[];
  totalMissing: number;
  totalCost: number;
}

const priceOf = (card: Card): number => (card.prices?.usd ? Number(card.prices.usd) : 0);

/**
 * Compute the cards missing from the collection to build a deck, plus the cost
 * to complete it. `owned` maps card_id -> quantity already in the collection.
 */
export function computeBuylist(
  cards: { card: Card; quantity: number }[],
  owned: Map<string, number>,
): Buylist {
  const items: BuylistItem[] = [];
  let totalMissing = 0;
  let totalCost = 0;

  for (const { card, quantity } of cards) {
    const have = owned.get(card.id) ?? 0;
    const missing = Math.max(0, quantity - have);
    if (missing === 0) continue;

    const unitPrice = priceOf(card);
    const lineTotal = unitPrice * missing;
    totalMissing += missing;
    totalCost += lineTotal;
    items.push({ card, needed: quantity, owned: have, missing, unitPrice, lineTotal });
  }

  items.sort((a, b) => b.lineTotal - a.lineTotal);
  return { items, totalMissing, totalCost };
}
