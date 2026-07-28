/**
 * Pokémon energy types are returned by the API in the card's language ("Feu",
 * "Fire", "Fuego"…). We canonicalize the localized name to an energy key, then
 * map that to a color so energies can render as colored pips (the Pokémon
 * counterpart to MTG mana symbols), regardless of the display language.
 */

export type EnergyKey =
  | 'Fire' | 'Water' | 'Grass' | 'Lightning' | 'Psychic' | 'Fighting'
  | 'Darkness' | 'Metal' | 'Fairy' | 'Dragon' | 'Colorless';

const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// localized name (normalized) -> canonical energy key. Covers the locales the
// app serves best (en/fr) plus common es/de/it/pt/ja terms; unknowns fall back
// to a neutral pip so nothing breaks.
const CANON: Record<string, EnergyKey> = {};
const add = (key: EnergyKey, ...names: string[]) => {
  for (const n of names) CANON[normalize(n)] = key;
};
add('Fire', 'fire', 'feu', 'fuego', 'feuer', 'fuoco', 'fogo', 'ほのお', '炎');
add('Water', 'water', 'eau', 'agua', 'wasser', 'acqua', 'agua', 'みず', '水');
add('Grass', 'grass', 'plante', 'planta', 'pflanze', 'erba', 'planta', 'くさ', '草');
add('Lightning', 'lightning', 'electric', 'electrique', 'foudre', 'rayo', 'elektro', 'lampo', 'raio', 'かみなり', '雷');
add('Psychic', 'psychic', 'psy', 'psiquico', 'psycho', 'psico', 'psiquico', 'エスパー', '超');
add('Fighting', 'fighting', 'combat', 'lucha', 'kampf', 'lotta', 'luta', 'かくとう', '闘');
add('Darkness', 'darkness', 'dark', 'obscurite', 'tenebres', 'oscuridad', 'finsternis', 'oscurita', 'escuridao', 'あく', '悪');
add('Metal', 'metal', 'metall', 'metallo', 'はがね', '鋼');
add('Fairy', 'fairy', 'fee', 'hada', 'fata', 'fada', 'フェアリー');
add('Dragon', 'dragon', 'drache', 'drago', 'dragao', 'ドラゴン', '竜');
add('Colorless', 'colorless', 'incolore', 'incoloro', 'farblos', 'normale', 'ノーマル', '無');

export const ENERGY_COLOR: Record<EnergyKey, string> = {
  Fire: '#EF7D34',
  Water: '#3B9CD9',
  Grass: '#5FBB47',
  Lightning: '#F2CB30',
  Psychic: '#A24C9E',
  Fighting: '#C0603A',
  Darkness: '#2F3A47',
  Metal: '#9AA6B2',
  Fairy: '#E27EA6',
  Dragon: '#C9A227',
  Colorless: '#CFC9BC',
};

export const canonicalEnergy = (name: string): EnergyKey | null => CANON[normalize(name)] ?? null;

/** Color for a (possibly localized) energy name; neutral gray when unknown. */
export const energyColor = (name: string): string => {
  const key = canonicalEnergy(name);
  return key ? ENERGY_COLOR[key] : '#6B7280';
};
