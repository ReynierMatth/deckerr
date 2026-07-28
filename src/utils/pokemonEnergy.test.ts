import { describe, it, expect } from 'vitest';
import { canonicalEnergy, energyColor, ENERGY_COLOR } from './pokemonEnergy';

describe('canonicalEnergy', () => {
  it('maps English names', () => {
    expect(canonicalEnergy('Fire')).toBe('Fire');
    expect(canonicalEnergy('Colorless')).toBe('Colorless');
    expect(canonicalEnergy('Lightning')).toBe('Lightning');
  });

  it('maps French (accented) names case-insensitively', () => {
    expect(canonicalEnergy('Feu')).toBe('Fire');
    expect(canonicalEnergy('Eau')).toBe('Water');
    expect(canonicalEnergy('Incolore')).toBe('Colorless');
    expect(canonicalEnergy('Électrique')).toBe('Lightning');
    expect(canonicalEnergy('Ténèbres')).toBe('Darkness');
    expect(canonicalEnergy('MÉTAL')).toBe('Metal');
  });

  it('returns null for unknown names', () => {
    expect(canonicalEnergy('Frobnicate')).toBeNull();
  });
});

describe('energyColor', () => {
  it('returns the canonical color for a known (localized) name', () => {
    expect(energyColor('Feu')).toBe(ENERGY_COLOR.Fire);
  });
  it('falls back to a neutral gray for unknown names', () => {
    expect(energyColor('Frobnicate')).toBe('#6B7280');
  });
});
