/**
 * pokemontcg.io raw JSON -> UnifiedCard.
 *
 * Pokémon cards are single-faced (no `faces`). Both price sources are carried:
 * TCGPlayer (USD) is picked from the most representative variant, Cardmarket
 * (EUR) from the averageSell/trend prices.
 */

import { qualifyId } from '../../../domain/accessors/identity';
import { UnifiedCard, UnifiedImages } from '../../../domain/UnifiedCard';
import { CardPrices, PriceEntry } from '../../../domain/prices';
import { PokemonTcgCard, PokemonTcgPriceBlock } from './pokemonTypes';

export const POKEMONTCG_PROVIDER_ID = 'pokemontcg';

const num = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const mapImages = (i?: PokemonTcgCard['images']): UnifiedImages | undefined => {
  if (!i) return undefined;
  // Pokémon has no separate "normal"/"art_crop"; use large for both.
  return { small: i.small, normal: i.large ?? i.small, large: i.large ?? i.small };
};

const mapTcgplayer = (tp?: PokemonTcgCard['tcgplayer']): PriceEntry | undefined => {
  const variants = tp?.prices;
  if (!variants) return undefined;
  const pick = (name: string): PokemonTcgPriceBlock | undefined => variants[name] ?? undefined;
  const first = Object.values(variants).find(Boolean) ?? undefined;
  const nonFoil = pick('normal') ?? first;
  const foilBlock = pick('holofoil') ?? pick('reverseHolofoil');
  const market = num(nonFoil?.market) ?? num(foilBlock?.market) ?? num(first?.market);
  const low = num(nonFoil?.low) ?? num(foilBlock?.low) ?? num(first?.low);
  const foil = num(foilBlock?.market);
  if (market == null && low == null && foil == null) return undefined;
  return { market, low, foil };
};

const mapCardmarket = (cm?: PokemonTcgCard['cardmarket']): PriceEntry | undefined => {
  const p = cm?.prices;
  if (!p) return undefined;
  const market = num(p.averageSellPrice) ?? num(p.trendPrice);
  const low = num(p.lowPrice);
  if (market == null && low == null) return undefined;
  return { market, low };
};

const mapPrices = (raw: PokemonTcgCard): CardPrices | undefined => {
  const tcgplayer = mapTcgplayer(raw.tcgplayer);
  const cardmarket = mapCardmarket(raw.cardmarket);
  if (!tcgplayer && !cardmarket) return undefined;
  const prices: CardPrices = {};
  if (tcgplayer) prices.tcgplayer = tcgplayer;
  if (cardmarket) prices.cardmarket = cardmarket;
  prices.updatedAt = raw.tcgplayer?.updatedAt ?? raw.cardmarket?.updatedAt;
  return prices;
};

const asSupertype = (s?: string): 'Pokémon' | 'Trainer' | 'Energy' | undefined =>
  s === 'Pokémon' || s === 'Trainer' || s === 'Energy' ? s : undefined;

export const pokemonToUnified = (raw: PokemonTcgCard): UnifiedCard => ({
  id: qualifyId('pokemon', raw.id),
  rawId: raw.id,
  game: 'pokemon',
  providerId: POKEMONTCG_PROVIDER_ID,
  name: raw.name,
  setCode: raw.set?.id,
  setName: raw.set?.name,
  collectorNumber: raw.number,
  rarity: raw.rarity,
  lang: 'en',
  artist: raw.artist,
  images: mapImages(raw.images),
  prices: mapPrices(raw),
  pokemon: {
    supertype: asSupertype(raw.supertype),
    subtypes: raw.subtypes,
    hp: raw.hp != null && raw.hp !== '' ? Number(raw.hp) : undefined,
    types: raw.types,
    evolvesFrom: raw.evolvesFrom,
    regulationMark: raw.regulationMark,
    nationalPokedexNumbers: raw.nationalPokedexNumbers,
  },
});
