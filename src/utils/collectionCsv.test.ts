import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, isManaBoxCsv, parseManaBoxCsv, CSV_HEADER, CollectionCsvRow } from './collectionCsv';

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

const MANABOX_HEADER =
  'Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency';

describe('isManaBoxCsv', () => {
  it('detects a full ManaBox export header', () => {
    expect(isManaBoxCsv(`${MANABOX_HEADER}\nBinder,binder,Lightning Bolt,m10,Magic 2010,146,normal,common,4,1,x,0,false,false,near_mint,en,EUR`)).toBe(true);
  });

  it('detects a minimal Name+Quantity header regardless of case', () => {
    expect(isManaBoxCsv('NAME,QUANTITY\nSol Ring,1')).toBe(true);
    expect(isManaBoxCsv('Card name,Quantity\nSol Ring,1')).toBe(true);
  });

  it('rejects the Deckerr-native header (card_id column)', () => {
    expect(isManaBoxCsv(`${CSV_HEADER}\nLightning Bolt,abc-123,4,true,LP,2.50`)).toBe(false);
  });

  it('rejects headers missing a required column, and empty text', () => {
    expect(isManaBoxCsv('Name,Foil\nSol Ring,foil')).toBe(false);
    expect(isManaBoxCsv('Set code,Quantity\nm10,1')).toBe(false);
    expect(isManaBoxCsv('')).toBe(false);
  });
});

describe('parseManaBoxCsv', () => {
  it('maps a full ManaBox row (columns located by header name)', () => {
    const text = `${MANABOX_HEADER}\nBinder,binder,Lightning Bolt,M10,Magic 2010,146,foil,common,4,1,x,0,false,false,near_mint,en,EUR`;
    expect(parseManaBoxCsv(text)).toEqual([
      { name: 'Lightning Bolt', set: 'm10', collector_number: '146', quantity: 4, is_foil: true, condition: 'NM' },
    ]);
  });

  it('treats "normal" as non-foil and "etched" as foil', () => {
    const text = 'Name,Set code,Collector number,Foil,Quantity\nA,one,1,normal,1\nB,one,2,etched,1';
    const rows = parseManaBoxCsv(text);
    expect(rows[0].is_foil).toBe(false);
    expect(rows[1].is_foil).toBe(true);
  });

  it('maps ManaBox conditions onto Deckerr conditions', () => {
    const text = [
      'Name,Quantity,Condition',
      'A,1,near_mint',
      'B,1,excellent',
      'C,1,good',
      'D,1,played',
      'E,1,heavily_played',
      'F,1,poor',
      'G,1,unknown_value',
    ].join('\n');
    expect(parseManaBoxCsv(text).map((r) => r.condition)).toEqual(['NM', 'LP', 'MP', 'MP', 'HP', 'DMG', '']);
  });

  it('tolerates missing optional columns (set/collector/foil/condition)', () => {
    const text = 'Card name,Quantity\nSol Ring,3';
    expect(parseManaBoxCsv(text)).toEqual([
      { name: 'Sol Ring', set: '', collector_number: '', quantity: 3, is_foil: false, condition: '' },
    ]);
  });

  it('skips blank and malformed lines (missing name, bad/zero quantity)', () => {
    const text = [
      'Name,Set code,Collector number,Foil,Quantity',
      ',one,1,normal,2',
      'Bad Qty,one,2,normal,zero',
      'Zero,one,3,normal,0',
      '',
      'Good,one,4,normal,2',
    ].join('\n');
    expect(parseManaBoxCsv(text)).toEqual([
      { name: 'Good', set: 'one', collector_number: '4', quantity: 2, is_foil: false, condition: '' },
    ]);
  });

  it('handles quoted names with embedded commas', () => {
    const text = 'Name,Set code,Collector number,Foil,Quantity\n"Who, What, When",unh,120,normal,1';
    expect(parseManaBoxCsv(text)[0].name).toBe('Who, What, When');
  });

  it('returns [] for non-ManaBox text (Deckerr-native or garbage)', () => {
    expect(parseManaBoxCsv(`${CSV_HEADER}\nLightning Bolt,abc-123,4,true,LP,2.50`)).toEqual([]);
    expect(parseManaBoxCsv('not,a,manabox,file')).toEqual([]);
  });
});
