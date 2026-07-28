import { describe, it, expect } from 'vitest';
import { qualifyId, parseCardRef } from './identity';

describe('qualifyId / parseCardRef', () => {
  it('round-trips a qualified id', () => {
    const id = qualifyId('pokemon', 'base1-4');
    expect(id).toBe('pokemon:base1-4');
    expect(parseCardRef(id)).toEqual({ game: 'pokemon', rawId: 'base1-4' });
  });

  it('keeps rawIds that themselves contain a colon', () => {
    expect(parseCardRef('mtg:sv:123')).toEqual({ game: 'mtg', rawId: 'sv:123' });
  });

  it('treats an unqualified id as a legacy MTG raw id', () => {
    const scryfallUuid = '0000579f-7b35-4ed3-b44c-db2a538066fe';
    expect(parseCardRef(scryfallUuid)).toEqual({ game: 'mtg', rawId: scryfallUuid });
  });

  it('treats an unknown prefix as part of a legacy MTG raw id', () => {
    expect(parseCardRef('foo:bar')).toEqual({ game: 'mtg', rawId: 'foo:bar' });
  });
});
