import { describe, it, expect } from 'vitest';
import { computeBuylist } from './buylist';
import { Card } from '../types';

const card = (id: string, usd?: string): Card => ({ id, name: id, prices: usd ? { usd } : undefined });

describe('computeBuylist', () => {
  it('lists only missing cards with the missing quantity', () => {
    const owned = new Map([['a', 1]]);
    const bl = computeBuylist(
      [
        { card: card('a', '2.00'), quantity: 3 }, // own 1, need 3 -> missing 2
        { card: card('b', '1.00'), quantity: 1 }, // own 0 -> missing 1
        { card: card('c', '5.00'), quantity: 2 }, // fully owned below
      ],
      new Map([['a', 1], ['c', 2]]),
    );
    void owned;
    const ids = bl.items.map((i) => i.card.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('c'); // fully owned
  });

  it('sums total missing count and cost', () => {
    const bl = computeBuylist(
      [
        { card: card('a', '2.00'), quantity: 3 },
        { card: card('b', '1.50'), quantity: 2 },
      ],
      new Map([['a', 1]]),
    );
    expect(bl.totalMissing).toBe(2 + 2); // 2 of a + 2 of b
    expect(bl.totalCost).toBeCloseTo(2 * 2.0 + 2 * 1.5); // 4 + 3 = 7
  });

  it('treats a missing price as 0', () => {
    const bl = computeBuylist([{ card: card('a'), quantity: 1 }], new Map());
    expect(bl.totalCost).toBe(0);
    expect(bl.items[0].missing).toBe(1);
  });
});
