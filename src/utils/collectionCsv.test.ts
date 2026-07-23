import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, CSV_HEADER, CollectionCsvRow } from './collectionCsv';

const row = (over: Partial<CollectionCsvRow>): CollectionCsvRow => ({
  name: 'Lightning Bolt',
  card_id: 'abc-123',
  quantity: 1,
  is_foil: false,
  condition: 'NM',
  price_usd: 1.5,
  ...over,
});

describe('toCsv', () => {
  it('emits the header row first', () => {
    expect(toCsv([]).trim()).toBe(CSV_HEADER);
  });

  it('serializes a row in header order with 2-decimal price and boolean foil', () => {
    const out = toCsv([row({})]);
    expect(out).toBe(`${CSV_HEADER}\nLightning Bolt,abc-123,1,false,NM,1.50`);
  });

  it('quotes fields containing commas or quotes', () => {
    const out = toCsv([row({ name: 'Fire // Ice, split', card_id: 'x"y', condition: '' })]);
    expect(out).toBe(`${CSV_HEADER}\n"Fire // Ice, split","x""y",1,false,,1.50`);
  });

  it('writes foil as true', () => {
    const out = toCsv([row({ is_foil: true, price_usd: 10 })]);
    expect(out).toBe(`${CSV_HEADER}\nLightning Bolt,abc-123,1,true,NM,10.00`);
  });
});

describe('parseCsv', () => {
  it('ignores the header and parses data rows', () => {
    const text = `${CSV_HEADER}\nLightning Bolt,abc-123,4,true,LP,2.50`;
    expect(parseCsv(text)).toEqual([
      { name: 'Lightning Bolt', card_id: 'abc-123', quantity: 4, is_foil: true, condition: 'LP', price_usd: 2.5 },
    ]);
  });

  it('round-trips with toCsv', () => {
    const rows = [row({}), row({ card_id: 'def-456', is_foil: true, condition: 'MP', price_usd: 3 })];
    expect(parseCsv(toCsv(rows))).toEqual(rows.map((r) => ({ ...r, price_usd: Number(r.price_usd.toFixed(2)) })));
  });

  it('skips malformed lines (missing id, bad/zero quantity, blank)', () => {
    const text = [
      CSV_HEADER,
      'No Id,,2,false,NM,1',
      'Bad Qty,id-1,notanumber,false,NM,1',
      'Zero,id-2,0,false,NM,1',
      '',
      'Good,id-3,3,false,NM,1',
    ].join('\n');
    expect(parseCsv(text)).toEqual([
      { name: 'Good', card_id: 'id-3', quantity: 3, is_foil: false, condition: 'NM', price_usd: 1 },
    ]);
  });

  it('normalizes unknown conditions to empty and tolerates missing columns', () => {
    const text = 'name,card_id,quantity\nSol Ring,id-9,2';
    expect(parseCsv(text)).toEqual([
      { name: 'Sol Ring', card_id: 'id-9', quantity: 2, is_foil: false, condition: '', price_usd: 0 },
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    const text = `${CSV_HEADER}\n"Fire, Ice",id-x,1,yes,dmg,4.25`;
    expect(parseCsv(text)).toEqual([
      { name: 'Fire, Ice', card_id: 'id-x', quantity: 1, is_foil: true, condition: 'DMG', price_usd: 4.25 },
    ]);
  });
});
