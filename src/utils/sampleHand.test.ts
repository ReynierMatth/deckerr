import { describe, it, expect } from 'vitest';
import { expandDeck, drawSampleHand } from './sampleHand';
import { Card } from '../types';

const card = (name: string): Card => ({ id: name, name });

describe('expandDeck', () => {
  it('expands entries by quantity', () => {
    expect(expandDeck([{ card: card('a'), quantity: 3 }, { card: card('b'), quantity: 1 }])).toHaveLength(4);
  });
});

describe('drawSampleHand', () => {
  const deck = [{ card: card('a'), quantity: 40 }, { card: card('b'), quantity: 20 }];

  it('draws the requested number of cards', () => {
    expect(drawSampleHand(deck, 7, () => 0.5)).toHaveLength(7);
  });

  it('never draws more than the deck has', () => {
    const tiny = [{ card: card('x'), quantity: 3 }];
    expect(drawSampleHand(tiny, 7)).toHaveLength(3);
  });

  it('is deterministic given a fixed rng', () => {
    const a = drawSampleHand(deck, 7, () => 0.123).map((c) => c.name);
    const b = drawSampleHand(deck, 7, () => 0.123).map((c) => c.name);
    expect(a).toEqual(b);
  });
});
