/**
 * Builds a Scryfall search-syntax string from the CardSearch form state.
 * Pure and side-effect free so it can be unit tested in isolation.
 */
export interface CardSearchParams {
  cardName: string;
  text: string;
  rulesText: string;
  typeLine: string;
  typeMatch: string;
  typeInclude: boolean;
  colors: Record<string, boolean>;
  colorMode: string;
  commanderColors: Record<string, boolean>;
  manaCost: Record<string, number>;
  manaValue: string;
  manaValueComparison: string;
  games: Record<string, boolean>;
  format: string;
  formatStatus: string;
  set: string;
  block: string;
  rarity: Record<string, boolean>;
  criteria: string;
  criteriaMatch: string;
  criteriaInclude: boolean;
  price: string;
  currency: string;
  priceComparison: string;
  artist: string;
  flavorText: string;
  loreFinder: string;
  language: string;
  displayImages: boolean;
  order: string;
  showAllPrints: boolean;
  includeExtras: boolean;
}

const activeKeys = (record: Record<string, boolean>): string[] =>
  Object.keys(record).filter((key) => record[key]);

export function buildScryfallQuery(p: CardSearchParams): string {
  let query = '';

  if (p.cardName) query += `name:${p.cardName} `;
  if (p.text) query += `o:${p.text} `;
  if (p.rulesText) query += `o:"${p.rulesText.replace('~', p.cardName)}" `;
  if (p.typeLine) {
    const typeQuery = p.typeMatch === 'partial' ? p.typeLine : `"${p.typeLine}"`;
    query += `${p.typeInclude ? '' : '-'}t:${typeQuery} `;
  }
  if (activeKeys(p.colors).length > 0) {
    const active = activeKeys(p.colors).join('');
    query += `${p.colorMode === 'exactly' ? `c:${active}` : `color<=${active}`} `;
  }
  if (activeKeys(p.commanderColors).length > 0) {
    query += `id:${activeKeys(p.commanderColors).join('')} `;
  }

  const manaCostString = Object.entries(p.manaCost)
    .filter(([, count]) => count > 0)
    .map(([color, count]) => `{${color}}`.repeat(count))
    .join('');
  if (manaCostString) query += `m:${manaCostString} `;

  if (p.manaValue) query += `mv${p.manaValueComparison}${p.manaValue} `;
  if (activeKeys(p.games).length > 0) query += `game:${activeKeys(p.games).join(',')} `;
  if (p.format) query += `f:${p.format} `;
  if (p.formatStatus) query += `${p.formatStatus}:${p.format} `;
  if (p.set) query += `e:${p.set} `;
  if (p.block) query += `b:${p.block} `;
  if (activeKeys(p.rarity).length > 0) query += `r:${activeKeys(p.rarity).join(',')} `;
  if (p.criteria) {
    const criteriaQuery = p.criteriaMatch === 'partial' ? p.criteria : `"${p.criteria}"`;
    query += `${p.criteriaInclude ? '' : '-'}o:${criteriaQuery} `;
  }
  if (p.price) query += `${p.currency}${p.priceComparison}${p.price} `;
  if (p.artist) query += `a:${p.artist} `;
  if (p.flavorText) query += `ft:${p.flavorText} `;
  if (p.loreFinder) query += `${p.loreFinder} `;
  if (p.language) query += `lang:${p.language} `;
  if (p.displayImages) query += `display:grid `;
  if (p.order) query += `order:${p.order} `;
  if (p.showAllPrints) query += `unique:prints `;
  if (p.includeExtras) query += `include:extras `;

  return query.trim();
}
