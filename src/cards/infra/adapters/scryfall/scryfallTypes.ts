/**
 * Raw Scryfall JSON shapes (a subset of https://scryfall.com/docs/api/cards).
 *
 * Kept standalone in the adapter — deliberately NOT `src/types` `Card` — so the
 * mapper's input type is stable when the app's domain `Card` becomes
 * `UnifiedCard` (Phase-1 step 5).
 */

export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  art_crop?: string;
  border_crop?: string;
  png?: string;
}

export interface ScryfallCardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  colors?: string[];
  image_uris?: ScryfallImageUris;
}

export interface ScryfallCard {
  id: string;
  name: string;
  layout?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  colors?: string[];
  color_identity?: string[];
  set?: string;
  set_name?: string;
  rarity?: string;
  collector_number?: string;
  lang?: string;
  artist?: string;
  prints_search_uri?: string;
  prices?: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
    eur_foil?: string;
  };
}
