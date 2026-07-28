import { describe, it, expect } from 'vitest';
import { buildDeckExport, DECK_CSV_HEADER } from './deckExport';
import { Card } from '../types';

const card = (over: { name?: string; set?: string; collector_number?: string } = {}): Card => ({
  id: over.name ?? 'x',
  rawId: over.name ?? 'x',
  game: 'mtg',
  providerId: 'test',
  name: over.name ?? 'x',
  setCode: over.set,
  collectorNumber: over.collector_number,
});

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

  it('appends a Sideboard section after a blank line (plain)', () => {
    const out = buildDeckExport([
      { card: card({ name: 'Island' }), quantity: 10 },
      { card: card({ name: 'Negate' }), quantity: 2, is_sideboard: true },
      { card: card({ name: 'Duress' }), quantity: 1, is_sideboard: true },
    ]);
    expect(out).toBe('10 Island\n\nSideboard\n2 Negate\n1 Duress');
  });

  it('appends a Sideboard section in arena format with set/collector', () => {
    const out = buildDeckExport(
      [
        { card: card({ name: 'Lightning Bolt', set: 'm10', collector_number: '146' }), quantity: 4 },
        { card: card({ name: 'Negate', set: 'mom', collector_number: '58' }), quantity: 2, is_sideboard: true },
      ],
      'arena',
    );
    expect(out).toBe('4 Lightning Bolt (M10) 146\n\nSideboard\n2 Negate (MOM) 58');
  });

  it('omits the Sideboard header when there are no sideboard entries', () => {
    const out = buildDeckExport([{ card: card({ name: 'Island' }), quantity: 10 }]);
    expect(out).toBe('10 Island');
  });
});

describe('buildDeckExport — csv', () => {
  it('emits the header row and one row per entry', () => {
    const out = buildDeckExport(
      [{ card: card({ name: 'Lightning Bolt', set: 'm10', collector_number: '146' }), quantity: 4 }],
      'csv',
    );
    expect(out).toBe(`${DECK_CSV_HEADER}\n4,Lightning Bolt,m10,146,false,false`);
  });

  it('marks commanders and lists them first', () => {
    const out = buildDeckExport(
      [
        { card: card({ name: 'Forest' }), quantity: 5 },
        { card: card({ name: 'Atraxa', set: 'one', collector_number: '196' }), quantity: 1, is_commander: true },
      ],
      'csv',
    );
    expect(out).toBe(`${DECK_CSV_HEADER}\n1,Atraxa,one,196,true,false\n5,Forest,,,false,false`);
  });

  it('quotes names containing commas', () => {
    const out = buildDeckExport([{ card: card({ name: 'Who, What, When' }), quantity: 1 }], 'csv');
    expect(out).toBe(`${DECK_CSV_HEADER}\n1,"Who, What, When",,,false,false`);
  });

  it('leaves set/collector empty when unknown', () => {
    const out = buildDeckExport([{ card: card({ name: 'Sol Ring' }), quantity: 1 }], 'csv');
    expect(out).toBe(`${DECK_CSV_HEADER}\n1,Sol Ring,,,false,false`);
  });

  it('marks sideboard entries in the is_sideboard column, after the mainboard', () => {
    const out = buildDeckExport(
      [
        { card: card({ name: 'Island' }), quantity: 5 },
        { card: card({ name: 'Negate' }), quantity: 2, is_sideboard: true },
      ],
      'csv',
    );
    expect(out).toBe(`${DECK_CSV_HEADER}\n5,Island,,,false,false\n2,Negate,,,false,true`);
  });
});

describe('buildDeckExport — mtgo (.dek)', () => {
  it('produces a minimal valid .dek XML document', () => {
    const out = buildDeckExport([{ card: card({ name: 'Lightning Bolt' }), quantity: 4 }], 'mtgo');
    expect(out).toBe(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '  <NetDeckID>0</NetDeckID>',
        '  <PreconstructedDeckID>0</PreconstructedDeckID>',
        '  <Cards Quantity="4" Sideboard="false" Name="Lightning Bolt" />',
        '</Deck>',
      ].join('\n'),
    );
  });

  it('escapes XML special characters in card names', () => {
    const out = buildDeckExport([{ card: card({ name: 'Sword of "War" & <Peace>' }), quantity: 1 }], 'mtgo');
    expect(out).toContain('Name="Sword of &quot;War&quot; &amp; &lt;Peace&gt;"');
  });

  it('lists commanders first and skips zero-quantity entries', () => {
    const out = buildDeckExport(
      [
        { card: card({ name: 'Forest' }), quantity: 5 },
        { card: card({ name: 'Atraxa' }), quantity: 1, is_commander: true },
        { card: card({ name: 'Gone' }), quantity: 0 },
      ],
      'mtgo',
    );
    const atraxa = out.indexOf('Name="Atraxa"');
    const forest = out.indexOf('Name="Forest"');
    expect(atraxa).toBeGreaterThan(-1);
    expect(forest).toBeGreaterThan(atraxa);
    expect(out).not.toContain('Gone');
  });

  it('flags sideboard entries with Sideboard="true" and lists them last', () => {
    const out = buildDeckExport(
      [
        { card: card({ name: 'Island' }), quantity: 10 },
        { card: card({ name: 'Negate' }), quantity: 2, is_sideboard: true },
      ],
      'mtgo',
    );
    expect(out).toContain('<Cards Quantity="10" Sideboard="false" Name="Island" />');
    expect(out).toContain('<Cards Quantity="2" Sideboard="true" Name="Negate" />');
    expect(out.indexOf('Name="Negate"')).toBeGreaterThan(out.indexOf('Name="Island"'));
  });
});
