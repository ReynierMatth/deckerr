import { Card } from '../types';

/** Expand (card, quantity) entries into a flat pool of individual cards. */
export function expandDeck(cards: { card: Card; quantity: number }[]): Card[] {
  const pool: Card[] = [];
  for (const { card, quantity } of cards) {
    for (let i = 0; i < Math.max(0, quantity); i++) pool.push(card);
  }
  return pool;
}

/**
 * Draw a random opening hand of `count` cards from the deck.
 * `rng` is injectable (defaults to Math.random) so it can be tested deterministically.
 */
export function drawSampleHand(
  cards: { card: Card; quantity: number }[],
  count = 7,
  rng: () => number = Math.random,
): Card[] {
  const pool = expandDeck(cards);
  // Fisher–Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
