/**
 * TCGdex raw JSON -> UnifiedCard. Handles both brief (id/name/image) and full
 * cards. Carries both price sources when the full card includes `pricing`.
 */

import { qualifyId } from '../../../domain/accessors/identity';
import { UnifiedCard, UnifiedImages } from '../../../domain/UnifiedCard';
import { CardPrices, PriceEntry } from '../../../domain/prices';
import { TcgdexCard, TcgdexPricing, TcgdexTcgplayerVariant } from './tcgdexTypes';

export const TCGDEX_PROVIDER_ID = 'tcgdex';

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

// TCGdex serves images from a base URL; the client appends quality + extension.
const mapImages = (base?: string): UnifiedImages | undefined => {
  if (!base) return undefined;
  return { small: `${base}/low.webp`, normal: `${base}/high.webp`, large: `${base}/high.webp` };
};

const isVariant = (v: unknown): v is TcgdexTcgplayerVariant =>
  typeof v === 'object' && v !== null;

const mapTcgplayer = (tp?: TcgdexPricing['tcgplayer']): PriceEntry | undefined => {
  if (!tp) return undefined;
  const variants: Record<string, TcgdexTcgplayerVariant> = {};
  for (const [k, v] of Object.entries(tp)) {
    if (k === 'unit' || k === 'updated') continue;
    if (isVariant(v)) variants[k] = v;
  }
  const first = Object.values(variants)[0];
  const nonFoil = variants.normal ?? first;
  const foilBlock = variants.holofoil ?? variants.reverseHolofoil;
  const market = num(nonFoil?.marketPrice) ?? num(foilBlock?.marketPrice) ?? num(first?.marketPrice);
  const low = num(nonFoil?.lowPrice) ?? num(foilBlock?.lowPrice) ?? num(first?.lowPrice);
  const foil = num(foilBlock?.marketPrice);
  if (market == null && low == null && foil == null) return undefined;
  return { market, low, foil };
};

const mapCardmarket = (cm?: TcgdexPricing['cardmarket']): PriceEntry | undefined => {
  if (!cm) return undefined;
  const market = num(cm.avg) ?? num(cm.trend);
  const low = num(cm.low);
  const foil = num(cm['trend-holo']) ?? num(cm['avg-holo']);
  if (market == null && low == null && foil == null) return undefined;
  return { market, low, foil };
};

const mapPrices = (raw: TcgdexCard): CardPrices | undefined => {
  const tcgplayer = mapTcgplayer(raw.pricing?.tcgplayer);
  const cardmarket = mapCardmarket(raw.pricing?.cardmarket);
  if (!tcgplayer && !cardmarket) return undefined;
  const prices: CardPrices = {};
  if (tcgplayer) prices.tcgplayer = tcgplayer;
  if (cardmarket) prices.cardmarket = cardmarket;
  prices.updatedAt =
    (raw.pricing?.tcgplayer?.updated as string | undefined) ??
    (raw.pricing?.cardmarket?.updated as string | undefined);
  return prices;
};

const asSupertype = (c?: string): 'Pokémon' | 'Trainer' | 'Energy' | undefined => {
  if (c === 'Pokemon') return 'Pokémon';
  if (c === 'Trainer') return 'Trainer';
  if (c === 'Energy') return 'Energy';
  return undefined;
};

export const tcgdexToUnified = (raw: TcgdexCard): UnifiedCard => ({
  id: qualifyId('pokemon', raw.id),
  rawId: raw.id,
  game: 'pokemon',
  providerId: TCGDEX_PROVIDER_ID,
  name: raw.name,
  setCode: raw.set?.id,
  setName: raw.set?.name,
  collectorNumber: raw.localId != null ? String(raw.localId) : undefined,
  rarity: raw.rarity,
  lang: 'en',
  artist: raw.illustrator,
  images: mapImages(raw.image),
  prices: mapPrices(raw),
  pokemon: {
    supertype: asSupertype(raw.category),
    hp: num(raw.hp),
    types: raw.types,
    regulationMark: raw.regulationMark,
  },
});
