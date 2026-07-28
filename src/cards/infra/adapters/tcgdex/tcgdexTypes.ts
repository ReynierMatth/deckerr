/**
 * Raw TCGdex v2 JSON shapes (subset of https://tcgdex.dev). Grounded on a live
 * `/v2/en/cards/base1-4` response. Brief list items carry only id/name/image;
 * a full card fetch adds details + `pricing`.
 */

export interface TcgdexTcgplayerVariant {
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  directLowPrice?: number | null;
}

export interface TcgdexPricing {
  tcgplayer?: {
    unit?: string;
    updated?: string;
    [variant: string]: TcgdexTcgplayerVariant | string | undefined;
  };
  cardmarket?: {
    unit?: string;
    updated?: string;
    avg?: number | null;
    low?: number | null;
    trend?: number | null;
    ['trend-holo']?: number | null;
    ['avg-holo']?: number | null;
    [k: string]: number | null | string | undefined;
  };
}

export interface TcgdexAttack {
  cost?: string[];
  name?: string;
  effect?: string;
  damage?: number | string;
}

export interface TcgdexAbility {
  type?: string;
  name?: string;
  effect?: string;
}

export interface TcgdexTypeModifier {
  type?: string;
  value?: string;
}

export interface TcgdexCard {
  id: string;
  localId?: string | number;
  name: string;
  image?: string; // base URL; append `/<quality>.<ext>` e.g. `/high.webp`
  rarity?: string;
  category?: string; // 'Pokemon' | 'Trainer' | 'Energy'
  hp?: number;
  types?: string[];
  stage?: string;
  evolveFrom?: string;
  abilities?: TcgdexAbility[];
  attacks?: TcgdexAttack[];
  weaknesses?: TcgdexTypeModifier[];
  resistances?: TcgdexTypeModifier[];
  retreat?: number;
  description?: string;
  dexId?: number[];
  regulationMark?: string;
  illustrator?: string;
  set?: { id?: string; name?: string };
  pricing?: TcgdexPricing;
}

export type TcgdexBrief = Pick<TcgdexCard, 'id' | 'localId' | 'name' | 'image'>;
