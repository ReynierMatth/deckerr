import { describe, it, expect } from 'vitest';
import { computeDeckStats, groupCardsByType } from './deckStats';
import { Card } from '../types';

const card = (over: { name?: string; type_line?: string; cmc?: number; colors?: string[] } = {}): Card => ({
  id: over.name ?? 'x',
  rawId: over.name ?? 'x',
  game: 'mtg',
  providerId: 'test',
  name: over.name ?? 'x',
  mtg: { typeLine: over.type_line, cmc: over.cmc, colors: over.colors },
});
const entry = (c: Card, quantity: number) => ({ card: c, quantity });

describe('computeDeckStats', () => {
  it('counts totals, lands and non-lands', () => {
    const stats = computeDeckStats([
      entry(card({ name: 'Forest', type_line: 'Basic Land — Forest' }), 24),
      entry(card({ name: 'Bear', type_line: 'Creature — Bear', cmc: 2, colors: ['G'] }), 4),
    ]);
    expect(stats.totalCards).toBe(28);
    expect(stats.landCount).toBe(24);
    expect(stats.nonLandCount).toBe(4);
  });

  it('buckets the mana curve and clamps 7+', () => {
    const stats = computeDeckStats([
      entry(card({ name: 'a', type_line: 'Instant', cmc: 1, colors: ['U'] }), 2),
      entry(card({ name: 'b', type_line: 'Sorcery', cmc: 3, colors: ['U'] }), 1),
      entry(card({ name: 'c', type_line: 'Creature', cmc: 9, colors: ['U'] }), 1),
    ]);
    const byCmc = Object.fromEntries(stats.manaCurve.map((b) => [b.cmc, b.count]));
    expect(byCmc[1]).toBe(2);
    expect(byCmc[3]).toBe(1);
    expect(byCmc[7]).toBe(1); // cmc 9 clamps into the "7+" bucket
    expect(stats.manaCurve.find((b) => b.cmc === 7)?.label).toBe('7+');
  });

  it('excludes lands from the average CMC', () => {
    const stats = computeDeckStats([
      entry(card({ name: 'Island', type_line: 'Basic Land — Island' }), 10),
      entry(card({ name: 'a', type_line: 'Instant', cmc: 2, colors: ['U'] }), 1),
      entry(card({ name: 'b', type_line: 'Instant', cmc: 4, colors: ['U'] }), 1),
    ]);
    expect(stats.averageCmc).toBe(3);
  });

  it('counts multicolour cards in each colour and colourless as C', () => {
    const stats = computeDeckStats([
      entry(card({ name: 'gold', type_line: 'Creature', cmc: 3, colors: ['W', 'U'] }), 2),
      entry(card({ name: 'rock', type_line: 'Artifact', cmc: 2, colors: [] }), 1),
    ]);
    expect(stats.colorCounts.W).toBe(2);
    expect(stats.colorCounts.U).toBe(2);
    expect(stats.colorCounts.C).toBe(1);
  });

  it('categorises by primary type (land wins over creature)', () => {
    const stats = computeDeckStats([
      entry(card({ name: 'dryad', type_line: 'Land Creature — Dryad', cmc: 0 }), 1),
      entry(card({ name: 'bear', type_line: 'Creature — Bear', cmc: 2, colors: ['G'] }), 3),
    ]);
    const byType = Object.fromEntries(stats.typeCounts.map((t) => [t.type, t.count]));
    expect(byType.Land).toBe(1);
    expect(byType.Creature).toBe(3);
  });
});

describe('groupCardsByType', () => {
  it('groups entries by primary type in display order (spells before lands)', () => {
    const groups = groupCardsByType([
      entry(card({ name: 'Forest', type_line: 'Basic Land — Forest' }), 10),
      entry(card({ name: 'Bolt', type_line: 'Instant', colors: ['R'] }), 4),
      entry(card({ name: 'Bear', type_line: 'Creature — Bear', colors: ['G'] }), 2),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['Creature', 'Instant', 'Land']);
    expect(groups.map((g) => g.count)).toEqual([2, 4, 10]);
  });

  it('sums quantities and keeps entry order within a group', () => {
    const groups = groupCardsByType([
      entry(card({ name: 'Bear', type_line: 'Creature — Bear' }), 2),
      entry(card({ name: 'Elf', type_line: 'Creature — Elf' }), 3),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: 'Creature', count: 5 });
    expect(groups[0].entries.map((e) => e.card.name)).toEqual(['Bear', 'Elf']);
  });

  it('skips zero-quantity entries', () => {
    const groups = groupCardsByType([
      entry(card({ name: 'Bear', type_line: 'Creature' }), 0),
      entry(card({ name: 'Bolt', type_line: 'Instant' }), 1),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['Instant']);
  });
});
