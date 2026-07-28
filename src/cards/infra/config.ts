/**
 * Card-layer runtime config. Mirrors `src/lib/supabase.ts`: reads the
 * container-injected `window.__DECKERR_CONFIG__`, falling back to Vite `.env`
 * (`VITE_*`) in dev. Lets an operator swap a game's provider or set the default
 * price source without rebuilding the image.
 */

import { GameId } from '../domain/game';
import { PriceSource } from '../domain/prices';

export interface ProviderChoice {
  primary: string;
  fallback?: string;
}

export interface CardsConfig {
  providers: Record<GameId, ProviderChoice>;
  /** Optional pokemontcg.io key (keyless works at 1k/day). */
  pokemonTcgApiKey?: string;
  /** App default before the user's stored preference is loaded. */
  defaultPriceSource: PriceSource;
}

const runtime =
  typeof window !== 'undefined'
    ? (window as unknown as { __DECKERR_CONFIG__?: Record<string, string | undefined> })
        .__DECKERR_CONFIG__
    : undefined;

const env = import.meta.env as Record<string, string | undefined>;

const pick = (key: string): string | undefined => runtime?.[key] || env[key];

const asPriceSource = (v: string | undefined): PriceSource =>
  v === 'cardmarket' ? 'cardmarket' : 'tcgplayer';

export const cardsConfig: CardsConfig = {
  providers: {
    mtg: { primary: 'scryfall' },
    pokemon: {
      primary: pick('VITE_CARDS_POKEMON_PRIMARY') || 'pokemontcg',
      fallback: pick('VITE_CARDS_POKEMON_FALLBACK') || 'tcgdex',
    },
    lorcana: { primary: pick('VITE_CARDS_LORCANA_PRIMARY') || 'lorcast' },
    onepiece: {
      primary: pick('VITE_CARDS_ONEPIECE_PRIMARY') || 'apitcg',
      fallback: pick('VITE_CARDS_ONEPIECE_FALLBACK') || 'optcgapi',
    },
  },
  pokemonTcgApiKey: pick('VITE_POKEMONTCG_API_KEY'),
  defaultPriceSource: asPriceSource(pick('VITE_DEFAULT_PRICE_SOURCE')),
};
