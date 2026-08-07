import { describe, it, expect } from 'vitest';
import { getCommanderColors, isCardValidForCommander } from './deckSuggestions';
import type { Card } from '../types';

// Minimal card factory — the color helpers only read card.mtg.{colors,colorIdentity}.
const card = (colors: string[], colorIdentity?: string[]): Card =>
  ({ mtg: { colors, colorIdentity } } as unknown as Card);

describe('commander colour identity', () => {
  // Najeela: mana cost {2}{R} (colors = R) but ability text {W}{U}{B}{R}{G}
  // makes her a 5-colour COMMANDER by identity.
  const najeela = card(['R'], ['W', 'U', 'B', 'R', 'G']);

  it('uses colour IDENTITY, not mana-cost colours, for the commander', () => {
    expect(getCommanderColors(najeela)).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  it('allows any single-colour card under a 5-colour identity commander', () => {
    const colors = getCommanderColors(najeela);
    expect(isCardValidForCommander(card(['G'], ['G']), colors)).toBe(true);
    expect(isCardValidForCommander(card(['W'], ['W']), colors)).toBe(true);
  });

  it('checks the card by its identity too (off-colour ability makes it illegal)', () => {
    const monoRed = getCommanderColors(card(['R'], ['R']));
    // A card that costs only {W} but whose identity is [W] is illegal under mono-R.
    expect(isCardValidForCommander(card(['W'], ['W']), monoRed)).toBe(false);
    // A red card with a green symbol in its text (identity [R,G]) is illegal under mono-R.
    expect(isCardValidForCommander(card(['R'], ['R', 'G']), monoRed)).toBe(false);
    // A plain red card is fine.
    expect(isCardValidForCommander(card(['R'], ['R']), monoRed)).toBe(true);
  });

  it('falls back to mana-cost colours when identity is absent', () => {
    expect(getCommanderColors(card(['R']))).toEqual(['R']);
  });

  it('treats an empty commander identity as no restriction', () => {
    expect(isCardValidForCommander(card(['W'], ['W']), [])).toBe(true);
  });
});
