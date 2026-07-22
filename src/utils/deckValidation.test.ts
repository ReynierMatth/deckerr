import { describe, it, expect } from 'vitest';
import { validateDeck } from './deckValidation';
import { Card, Deck } from '../types';

const card = (id: string, overrides: Partial<Card> = {}): Card => ({
  id,
  name: id,
  ...overrides,
});

const deck = (overrides: Partial<Deck>): Deck => ({
  id: 'd1',
  name: 'Test',
  format: 'standard',
  cards: [],
  userId: 'u1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const entry = (c: Card, quantity: number, is_commander = false) => ({ card: c, quantity, is_commander });

describe('validateDeck — standard', () => {
  it('accepts a 60-card deck with <= 4 copies each', () => {
    const cards = Array.from({ length: 15 }, (_, i) => entry(card(`c${i}`), 4));
    const result = validateDeck(deck({ format: 'standard', cards }));
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a deck below the minimum card count', () => {
    const result = validateDeck(deck({ format: 'standard', cards: [entry(card('c1'), 10)] }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Deck must contain at least 60 cards');
  });

  it('rejects more than 4 copies of a non-basic card', () => {
    const cards = [entry(card('big'), 5), ...Array.from({ length: 11 }, (_, i) => entry(card(`c${i}`), 5))];
    const result = validateDeck(deck({ format: 'standard', cards }));
    expect(result.errors.some((e) => e.includes('too many copies'))).toBe(true);
  });

  it('allows any number of "any number of cards named" exception cards', () => {
    const rats = card('rats', { name: 'Relentless Rats', oracle_text: 'A deck can have any number of cards named Relentless Rats.' });
    const cards = [entry(rats, 30), ...Array.from({ length: 8 }, (_, i) => entry(card(`c${i}`), 4))];
    const result = validateDeck(deck({ format: 'standard', cards }));
    expect(result.errors.some((e) => e.includes('too many copies'))).toBe(false);
  });

  it('honors an "up to nine" per-card limit (Nazgûl)', () => {
    const nazgul = card('naz', { name: 'Nazgûl', oracle_text: 'A deck can have up to nine cards named Nazgûl.' });
    const nine = validateDeck(deck({ format: 'standard', cards: [entry(nazgul, 9), ...Array.from({ length: 13 }, (_, i) => entry(card(`c${i}`), 4))] }));
    expect(nine.errors.some((e) => e.includes('too many copies'))).toBe(false);
    const ten = validateDeck(deck({ format: 'standard', cards: [entry(nazgul, 10), ...Array.from({ length: 13 }, (_, i) => entry(card(`c${i}`), 4))] }));
    expect(ten.errors).toContain('Nazgûl has too many copies (max 9)');
  });

  it('exempts basic lands from the max-copies rule', () => {
    // 40 Plains (basic, exempt) + 5 distinct non-basics at the 4-copy limit = 60.
    const cards = [
      entry(card('plains', { name: 'Plains' }), 40),
      ...Array.from({ length: 5 }, (_, i) => entry(card(`c${i}`), 4)),
    ];
    const result = validateDeck(deck({ format: 'standard', cards }));
    expect(result.errors.some((e) => e.includes('too many copies'))).toBe(false);
  });
});

describe('validateDeck — commander', () => {
  const filler = (n: number, colors?: string[]) =>
    Array.from({ length: n }, (_, i) => entry(card(`f${i}`, colors ? { colors } : {}), 1));

  it('requires a commander', () => {
    const result = validateDeck(deck({ format: 'commander', cards: filler(100) }));
    expect(result.errors).toContain('Commander deck must have a commander');
  });

  it('enforces the 100-card size', () => {
    const cards = [entry(card('cmd', { colors: ['G'] }), 1, true), ...filler(100, ['G'])];
    const result = validateDeck(deck({ format: 'commander', cards }));
    expect(result.errors).toContain('Deck must not contain more than 100 cards');
  });

  it('flags cards outside the commander color identity', () => {
    const cards = [
      entry(card('cmd', { colors: ['G'] }), 1, true),
      entry(card('offcolor', { colors: ['R'] }), 1),
      ...filler(98, ['G']),
    ];
    const result = validateDeck(deck({ format: 'commander', cards }));
    expect(result.errors).toContain("Some cards don't match commander's color identity");
  });

  it('accepts a legal mono-green commander deck', () => {
    const cards = [entry(card('cmd', { colors: ['G'] }), 1, true), ...filler(99, ['G'])];
    const result = validateDeck(deck({ format: 'commander', cards }));
    expect(result.isValid).toBe(true);
  });
});
