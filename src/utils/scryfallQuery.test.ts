import { describe, it, expect } from 'vitest';
import { buildScryfallQuery, CardSearchParams } from './scryfallQuery';

const base: CardSearchParams = {
  cardName: '', text: '', rulesText: '', typeLine: '', typeMatch: 'partial', typeInclude: true,
  colors: { W: false, U: false, B: false, R: false, G: false, C: false },
  colorMode: 'exactly',
  commanderColors: { W: false, U: false, B: false, R: false, G: false, C: false },
  manaCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  manaValue: '', manaValueComparison: '=',
  games: { paper: false, arena: false, mtgo: false },
  format: '', formatStatus: '', set: '', block: '',
  rarity: { common: false, uncommon: false, rare: false, mythic: false },
  criteria: '', criteriaMatch: 'partial', criteriaInclude: true,
  price: '', currency: 'usd', priceComparison: '=',
  artist: '', flavorText: '', loreFinder: '', language: 'en',
  displayImages: false, order: 'name', showAllPrints: false, includeExtras: false,
};

describe('buildScryfallQuery', () => {
  it('returns only the always-on defaults (language + order) for an empty form', () => {
    expect(buildScryfallQuery(base)).toBe('lang:en order:name');
  });

  it('adds name and oracle text', () => {
    const q = buildScryfallQuery({ ...base, cardName: 'Bolt', text: 'damage' });
    expect(q).toContain('name:Bolt');
    expect(q).toContain('o:damage');
  });

  it('substitutes ~ in rules text with the card name', () => {
    const q = buildScryfallQuery({ ...base, cardName: 'Bolt', rulesText: '~ deals 3' });
    expect(q).toContain('o:"Bolt deals 3"');
  });

  it('builds exact vs subset color queries', () => {
    const colors = { W: true, U: true, B: false, R: false, G: false, C: false };
    expect(buildScryfallQuery({ ...base, colors })).toContain('c:WU');
    expect(buildScryfallQuery({ ...base, colors, colorMode: 'atmost' })).toContain('color<=WU');
  });

  it('negates type and criteria when include is false', () => {
    expect(buildScryfallQuery({ ...base, typeLine: 'Goblin', typeInclude: false })).toContain('-t:Goblin');
    expect(buildScryfallQuery({ ...base, criteria: 'draw', criteriaInclude: false })).toContain('-o:draw');
  });

  it('encodes mana cost symbols by repetition', () => {
    const manaCost = { W: 2, U: 0, B: 0, R: 1, G: 0, C: 0 };
    expect(buildScryfallQuery({ ...base, manaCost })).toContain('m:{W}{W}{R}');
  });

  it('joins commander identity, games and rarity lists', () => {
    const q = buildScryfallQuery({
      ...base,
      commanderColors: { W: false, U: true, B: true, R: false, G: false, C: false },
      games: { paper: true, arena: false, mtgo: true },
      rarity: { common: false, uncommon: false, rare: true, mythic: true },
    });
    expect(q).toContain('id:UB');
    expect(q).toContain('game:paper,mtgo');
    expect(q).toContain('r:rare,mythic');
  });

  it('adds comparison-based mana value and price', () => {
    const q = buildScryfallQuery({
      ...base, manaValue: '3', manaValueComparison: '>=', price: '5', priceComparison: '<', currency: 'eur',
    });
    expect(q).toContain('mv>=3');
    expect(q).toContain('eur<5');
  });

  it('adds unique:prints and include:extras toggles', () => {
    const q = buildScryfallQuery({ ...base, showAllPrints: true, includeExtras: true });
    expect(q).toContain('unique:prints');
    expect(q).toContain('include:extras');
  });
});
