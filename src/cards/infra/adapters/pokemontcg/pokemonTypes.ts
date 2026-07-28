/**
 * Raw pokemontcg.io v2 JSON shapes (subset of https://docs.pokemontcg.io).
 * Grounded on a live `/v2/cards/base1-4` response.
 */

export interface PokemonTcgPriceBlock {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
}

export interface PokemonTcgAttack {
  name?: string;
  cost?: string[];
  convertedEnergyCost?: number;
  damage?: string;
  text?: string;
}

export interface PokemonTcgAbility {
  name?: string;
  type?: string;
  text?: string;
}

export interface PokemonTcgTypeModifier {
  type?: string;
  value?: string;
}

export interface PokemonTcgCard {
  id: string;
  name: string;
  supertype?: string; // 'Pokémon' | 'Trainer' | 'Energy'
  subtypes?: string[];
  hp?: string; // string in the API, e.g. "120"
  types?: string[];
  evolvesFrom?: string;
  abilities?: PokemonTcgAbility[];
  attacks?: PokemonTcgAttack[];
  weaknesses?: PokemonTcgTypeModifier[];
  resistances?: PokemonTcgTypeModifier[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  flavorText?: string;
  rules?: string[];
  regulationMark?: string;
  nationalPokedexNumbers?: number[];
  number?: string;
  rarity?: string;
  artist?: string;
  set?: { id?: string; name?: string; ptcgoCode?: string; series?: string };
  images?: { small?: string; large?: string };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    // variant -> price block (holofoil / reverseHolofoil / normal / 1stEdition… )
    prices?: Record<string, PokemonTcgPriceBlock | null>;
  };
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: {
      averageSellPrice?: number | null;
      lowPrice?: number | null;
      trendPrice?: number | null;
      avg1?: number | null;
      avg7?: number | null;
      avg30?: number | null;
      [k: string]: number | null | undefined;
    };
  };
}

export interface PokemonTcgList {
  data: PokemonTcgCard[];
  page?: number;
  pageSize?: number;
  count?: number;
  totalCount?: number;
}
