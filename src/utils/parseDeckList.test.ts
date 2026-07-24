import { describe, it, expect } from 'vitest';
import { parseDeckList } from './parseDeckList';

const main = (name: string, quantity: number) => ({ name, quantity, is_sideboard: false, is_commander: false });

describe('parseDeckList', () => {
  it('parses plain "<qty> <name>" lines', () => {
    expect(parseDeckList('4 Lightning Bolt')).toEqual([main('Lightning Bolt', 4)]);
  });

  it('accepts the "4x" quantity suffix', () => {
    expect(parseDeckList('4x Lightning Bolt')).toEqual([main('Lightning Bolt', 4)]);
  });

  it('strips set code + collector number', () => {
    expect(parseDeckList('1 Sauron, the Dark Lord (LTR) 224')).toEqual([main('Sauron, the Dark Lord', 1)]);
  });

  it('strips foil markers and collector suffixes', () => {
    expect(parseDeckList('1 Barad-dûr (PLTR) 253s *F*')).toEqual([main('Barad-dûr', 1)]);
  });

  it('keeps digits and commas that are part of the name', () => {
    expect(parseDeckList('1 Borrowing 100,000 Arrows')).toEqual([main('Borrowing 100,000 Arrows', 1)]);
  });

  it('ignores headers, comments and blank lines, and flags the sideboard', () => {
    const list = [
      'Deck',
      '',
      '4 Lightning Bolt',
      '// a comment',
      '# another',
      'Sideboard',
      '2 Negate (MOM) 58',
    ].join('\n');
    expect(parseDeckList(list)).toEqual([
      main('Lightning Bolt', 4),
      { name: 'Negate', quantity: 2, is_sideboard: true, is_commander: false },
    ]);
  });

  it('preserves double-faced names with //', () => {
    expect(parseDeckList('1 Fire // Ice (APC) 128')).toEqual([main('Fire // Ice', 1)]);
  });

  it('aggregates duplicate lines within the same board', () => {
    expect(parseDeckList('1 Nazgûl\n1 Nazgûl\n1 Nazgûl')).toEqual([main('Nazgûl', 3)]);
  });

  it('parses the MTGO Commander export (main / sideboard / trailing commander)', () => {
    const fixture = [
      '1 Arcane Signet',
      '1 Baral, Chief of Compliance',
      '1 Nazgûl',
      '1 Nazgûl',
      '1 Nazgûl',
      '7 Island',
      '1 Sol Ring',
      '',
      'SIDEBOARD:',
      '1 Counterbalance',
      '1 Flusterstorm',
      '',
      '1 Lord of the Nazgûl',
    ].join('\n');

    const result = parseDeckList(fixture);
    const byName = (name: string) => result.find((r) => r.name === name);

    // Mainboard
    expect(byName('Nazgûl')).toEqual({ name: 'Nazgûl', quantity: 3, is_sideboard: false, is_commander: false });
    expect(byName('Island')).toEqual({ name: 'Island', quantity: 7, is_sideboard: false, is_commander: false });
    for (const name of ['Arcane Signet', 'Baral, Chief of Compliance', 'Sol Ring']) {
      expect(byName(name)).toEqual({ name, quantity: 1, is_sideboard: false, is_commander: false });
    }

    // Sideboard
    expect(byName('Counterbalance')).toEqual({ name: 'Counterbalance', quantity: 1, is_sideboard: true, is_commander: false });
    expect(byName('Flusterstorm')).toEqual({ name: 'Flusterstorm', quantity: 1, is_sideboard: true, is_commander: false });

    // Commander (trailing block after the sideboard, no header)
    expect(byName('Lord of the Nazgûl')).toEqual({
      name: 'Lord of the Nazgûl',
      quantity: 1,
      is_sideboard: false,
      is_commander: true,
    });
  });

  it('treats a lone trailing block as the commander in a header-less list', () => {
    const list = ['1 Sol Ring', '7 Island', '', '1 Baral, Chief of Compliance'].join('\n');
    const result = parseDeckList(list);
    expect(result.find((r) => r.name === 'Baral, Chief of Compliance')?.is_commander).toBe(true);
    expect(result.find((r) => r.name === 'Sol Ring')?.is_commander).toBe(false);
  });
});
