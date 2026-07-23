import { describe, it, expect } from 'vitest';
import { buildDeckExport } from './deckExport';
import { Card } from '../types';

const card = (over: Partial<Card>): Card => ({ id: over.name ?? 'x', name: over.name ?? 'x', ...over });

describe('buildDeckExport', () => {
  it('produces plain "<qty> <name>" lines', () => {
    const out = buildDeckExport([
      { card: card({ name: 'Lightning Bolt' }), quantity: 4 },
      { card: card({ name: 'Island' }), quantity: 10 },
    ]);
    expect(out).toBe('4 Lightning Bolt\n10 Island');
  });

  it('adds set + collector number in arena format when known', () => {
    const out = buildDeckExport(
      [{ card: card({ name: 'Lightning Bolt', set: 'm10', collector_number: '146' }), quantity: 4 }],
      'arena',
    );
    expect(out).toBe('4 Lightning Bolt (M10) 146');
  });

  it('falls back to plain line in arena format when set/collector are missing', () => {
    const out = buildDeckExport([{ card: card({ name: 'Sol Ring' }), quantity: 1 }], 'arena');
    expect(out).toBe('1 Sol Ring');
  });

  it('lists commanders first and skips zero-quantity entries', () => {
    const out = buildDeckExport([
      { card: card({ name: 'Forest' }), quantity: 5 },
      { card: card({ name: 'Atraxa' }), quantity: 1, is_commander: true },
      { card: card({ name: 'Gone' }), quantity: 0 },
    ]);
    expect(out).toBe('1 Atraxa\n5 Forest');
  });
});
