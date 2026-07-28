import { describe, it, expect } from 'vitest';
import { pokemonDeckRules } from './pokemonRules';
import { DeckCardEntry } from '../../domain/rules/DeckRules';
import { UnifiedCard } from '../../domain/UnifiedCard';

const card = (name: string, over: Partial<UnifiedCard['pokemon']> = {}): UnifiedCard => ({
  id: `pokemon:${name}`,
  rawId: name,
  game: 'pokemon',
  providerId: 'test',
  name,
  pokemon: { ...over },
});

const entry = (c: UnifiedCard, quantity: number): DeckCardEntry => ({ card: c, quantity });

describe('pokemonDeckRules', () => {
  it('requires exactly 60 cards', () => {
    const r = pokemonDeckRules.validate('standard', [entry(card('Pikachu'), 59)]);
    expect(r.isValid).toBe(false);
    expect(r.errors).toContain('A Pokémon deck must contain exactly 60 cards');
  });

  it('flags more than 4 copies of a non-energy card', () => {
    const r = pokemonDeckRules.validate('standard', [
      entry(card('Pikachu'), 5),
      entry(card('Filler'), 55),
    ]);
    expect(r.errors.some((e) => e.toLowerCase().includes('pikachu'))).toBe(true);
  });

  it('allows unlimited Basic Energy', () => {
    const energy = card('Fire Energy', { supertype: 'Energy', subtypes: ['Basic'] });
    const r = pokemonDeckRules.validate('standard', [entry(energy, 60)]);
    expect(r.isValid).toBe(true);
  });

  it('accepts a legal 60-card deck', () => {
    const r = pokemonDeckRules.validate('standard', [
      entry(card('Pikachu'), 4),
      entry(card('Fire Energy', { supertype: 'Energy', subtypes: ['Basic'] }), 56),
    ]);
    expect(r.isValid).toBe(true);
  });
});
