import { describe, it, expect } from 'vitest';
import { getPrice, hasPrice } from './price';
import { UnifiedCard } from '../UnifiedCard';

const card = (prices: UnifiedCard['prices']): UnifiedCard => ({
  id: 'mtg:x',
  rawId: 'x',
  game: 'mtg',
  providerId: 'test',
  name: 'X',
  prices,
});

describe('getPrice', () => {
  it('returns the preferred source when present', () => {
    const c = card({ tcgplayer: { market: 5 }, cardmarket: { market: 3 } });
    expect(getPrice(c, 'tcgplayer')).toBe(5);
    expect(getPrice(c, 'cardmarket')).toBe(3);
  });

  it('falls back to the other source when the preferred one is absent', () => {
    const c = card({ tcgplayer: { market: 5 } });
    expect(getPrice(c, 'cardmarket')).toBe(5);
  });

  it('uses the foil price when requested, falling back to market', () => {
    expect(getPrice(card({ tcgplayer: { market: 5, foil: 12 } }), 'tcgplayer', { foil: true })).toBe(12);
    expect(getPrice(card({ tcgplayer: { market: 5 } }), 'tcgplayer', { foil: true })).toBe(5);
  });

  it('returns 0 when no price is known', () => {
    expect(getPrice(card(undefined), 'tcgplayer')).toBe(0);
    expect(getPrice(card({}), 'tcgplayer')).toBe(0);
  });
});

describe('hasPrice', () => {
  it('detects presence per source', () => {
    const c = card({ tcgplayer: { market: 5 } });
    expect(hasPrice(c, 'tcgplayer')).toBe(true);
    expect(hasPrice(c, 'cardmarket')).toBe(false);
  });
});
