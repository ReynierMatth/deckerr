import { describe, it, expect } from 'vitest';
import { pokemonToUnified } from './pokemonTcgMapper';
import { PokemonTcgCard } from './pokemonTypes';

const base: PokemonTcgCard = {
  id: 'base1-4',
  name: 'Charizard',
  supertype: 'Pokémon',
  subtypes: ['Stage 2'],
  hp: '120',
  types: ['Fire'],
  evolvesFrom: 'Charmeleon',
  number: '4',
  rarity: 'Rare Holo',
  set: { id: 'base1', name: 'Base' },
  images: { small: 's.png', large: 'l.png' },
  tcgplayer: {
    updatedAt: '2026/07/28',
    prices: { holofoil: { low: 510, market: 800.43, high: 4590 } },
  },
  cardmarket: {
    updatedAt: '2026-07-28',
    prices: { averageSellPrice: 446.7, lowPrice: 105, trendPrice: 350.99 },
  },
};

describe('pokemonToUnified', () => {
  it('maps identity, pokemon fields and both price sources', () => {
    const u = pokemonToUnified(base);
    expect(u.id).toBe('pokemon:base1-4');
    expect(u.rawId).toBe('base1-4');
    expect(u.game).toBe('pokemon');
    expect(u.providerId).toBe('pokemontcg');
    expect(u.setCode).toBe('base1');
    expect(u.collectorNumber).toBe('4');
    expect(u.images).toEqual({ small: 's.png', normal: 'l.png', large: 'l.png' });
    expect(u.pokemon?.hp).toBe(120);
    expect(u.pokemon?.supertype).toBe('Pokémon');
    // holofoil-only card: market falls back to the foil variant, foil populated
    expect(u.prices?.tcgplayer).toEqual({ market: 800.43, low: 510, foil: 800.43 });
    expect(u.prices?.cardmarket).toEqual({ market: 446.7, low: 105 });
  });

  it('leaves prices undefined when the card carries none', () => {
    const u = pokemonToUnified({ id: 'x', name: 'No Price' });
    expect(u.prices).toBeUndefined();
    expect(u.faces).toBeUndefined();
  });
});
