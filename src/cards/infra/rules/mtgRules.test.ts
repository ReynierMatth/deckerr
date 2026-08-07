import { describe, it, expect } from 'vitest';
import { mtgDeckRules } from './mtgRules';
import type { UnifiedCard } from '../../domain/UnifiedCard';

const card = (name: string, colors: string[], colorIdentity?: string[]): UnifiedCard =>
  ({ id: `mtg:${name}`, game: 'mtg', name, mtg: { colors, colorIdentity } } as unknown as UnifiedCard);

const COLOR_ERR = "Some cards don't match commander's color identity";

describe('mtgRules — commander colour identity (deck-level banner)', () => {
  // Najeela: mana cost {2}{R} (colors=R) but ability text {W}{U}{B}{R}{G}
  // → 5-colour identity commander.
  const najeela = card('Najeela', ['R'], ['W', 'U', 'B', 'R', 'G']);

  it('does NOT flag off-mana-cost cards under a 5-colour-identity commander', () => {
    const { errors } = mtgDeckRules.validate('commander', [
      { card: najeela, quantity: 1, isCommander: true },
      { card: card('Birds of Paradise', ['G'], ['G']), quantity: 1 },
      { card: card('Esper Sentinel', ['W'], ['W']), quantity: 1 },
    ]);
    expect(errors).not.toContain(COLOR_ERR);
  });

  it('still flags a card outside a mono-red commander identity', () => {
    const monoRed = card('Mono Red Cmdr', ['R'], ['R']);
    const { errors } = mtgDeckRules.validate('commander', [
      { card: monoRed, quantity: 1, isCommander: true },
      { card: card('Green Card', ['G'], ['G']), quantity: 1 },
    ]);
    expect(errors).toContain(COLOR_ERR);
  });
});
