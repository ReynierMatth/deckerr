import { describe, it, expect } from 'vitest';
import { parseDeckList } from './parseDeckList';

describe('parseDeckList', () => {
  it('parses plain "<qty> <name>" lines', () => {
    expect(parseDeckList('4 Lightning Bolt')).toEqual([{ name: 'Lightning Bolt', quantity: 4 }]);
  });

  it('accepts the "4x" quantity suffix', () => {
    expect(parseDeckList('4x Lightning Bolt')).toEqual([{ name: 'Lightning Bolt', quantity: 4 }]);
  });

  it('strips set code + collector number', () => {
    expect(parseDeckList('1 Sauron, the Dark Lord (LTR) 224')).toEqual([
      { name: 'Sauron, the Dark Lord', quantity: 1 },
    ]);
  });

  it('strips foil markers and collector suffixes', () => {
    expect(parseDeckList('1 Barad-dûr (PLTR) 253s *F*')).toEqual([
      { name: 'Barad-dûr', quantity: 1 },
    ]);
  });

  it('keeps digits and commas that are part of the name', () => {
    expect(parseDeckList('1 Borrowing 100,000 Arrows')).toEqual([
      { name: 'Borrowing 100,000 Arrows', quantity: 1 },
    ]);
  });

  it('ignores headers, comments and blank lines', () => {
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
      { name: 'Lightning Bolt', quantity: 4 },
      { name: 'Negate', quantity: 2 },
    ]);
  });

  it('preserves double-faced names with //', () => {
    expect(parseDeckList('1 Fire // Ice (APC) 128')).toEqual([
      { name: 'Fire // Ice', quantity: 1 },
    ]);
  });
});
