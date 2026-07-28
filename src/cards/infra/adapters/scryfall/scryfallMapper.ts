/**
 * Scryfall raw JSON -> UnifiedCard.
 *
 * Enforces the `faces` contract: only genuinely flippable double-faced cards get
 * a multi-entry `faces` array (matching the old `isDoubleFaced` layout check),
 * so the neutral image accessors can rely on `faces.length > 1`.
 */

import { qualifyId } from '../../../domain/accessors/identity';
import { UnifiedCard, UnifiedFace, UnifiedImages } from '../../../domain/UnifiedCard';
import { CardPrices } from '../../../domain/prices';
import { ScryfallCard, ScryfallCardFace, ScryfallImageUris } from './scryfallTypes';

export const SCRYFALL_PROVIDER_ID = 'scryfall';

// Scryfall layouts that actually have a distinct, flippable back face.
const BACK_FACE_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];

const mapImages = (u?: ScryfallImageUris): UnifiedImages | undefined => {
  if (!u) return undefined;
  return {
    small: u.small,
    normal: u.normal,
    large: u.large,
    artCrop: u.art_crop,
    borderCrop: u.border_crop,
  };
};

const mapFace = (f: ScryfallCardFace): UnifiedFace => ({
  name: f.name ?? '',
  text: f.oracle_text,
  typeLine: f.type_line,
  images: mapImages(f.image_uris),
});

const toNumber = (s?: string): number | undefined => {
  if (s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const mapPrices = (p?: ScryfallCard['prices']): CardPrices | undefined => {
  if (!p) return undefined;
  const tcgMarket = toNumber(p.usd);
  const tcgFoil = toNumber(p.usd_foil);
  const cmMarket = toNumber(p.eur);
  const cmFoil = toNumber(p.eur_foil);
  const prices: CardPrices = {};
  if (tcgMarket != null || tcgFoil != null) prices.tcgplayer = { market: tcgMarket, foil: tcgFoil };
  if (cmMarket != null || cmFoil != null) prices.cardmarket = { market: cmMarket, foil: cmFoil };
  return Object.keys(prices).length ? prices : undefined;
};

export const scryfallToUnified = (raw: ScryfallCard): UnifiedCard => {
  const isDoubleFaced =
    Boolean(raw.card_faces && raw.card_faces.length > 1 && BACK_FACE_LAYOUTS.includes(raw.layout ?? ''));

  return {
    // Game-qualified app identity. The DB stores this same qualified value in
    // `card_id` (existing rows were backfilled to `mtg:<id>`), so in-memory
    // keys and persisted ids line up; card fetches route through the facade,
    // which decomposes the id back to the raw provider id per game.
    id: qualifyId('mtg', raw.id),
    rawId: raw.id,
    game: 'mtg',
    providerId: SCRYFALL_PROVIDER_ID,
    name: raw.name,
    setCode: raw.set,
    setName: raw.set_name,
    collectorNumber: raw.collector_number,
    rarity: raw.rarity,
    lang: raw.lang,
    artist: raw.artist,
    images: mapImages(raw.image_uris),
    faces: isDoubleFaced ? raw.card_faces!.map(mapFace) : undefined,
    prices: mapPrices(raw.prices),
    mtg: {
      manaCost: raw.mana_cost,
      cmc: raw.cmc,
      typeLine: raw.type_line,
      oracleText: raw.oracle_text,
      flavorText: raw.flavor_text,
      colors: raw.colors,
      colorIdentity: raw.color_identity,
      layout: raw.layout,
      printsSearchUri: raw.prints_search_uri,
    },
  };
};
