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
  /** TCGdex locale for Pokémon (names/text/images), e.g. 'fr', 'en'. */
  pokemonLang: string;
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

// Locales TCGdex serves. We match the browser language against these so a
// French visitor searches/reads Pokémon cards in French out of the box.
const TCGDEX_LANGS = ['en', 'fr', 'es', 'it', 'pt', 'de', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh-tw', 'zh-cn', 'id', 'th'];

const browserPokemonLang = (): string => {
  if (typeof navigator === 'undefined') return 'en';
  const lang = (navigator.language || 'en').toLowerCase();
  if (TCGDEX_LANGS.includes(lang)) return lang; // exact (e.g. zh-tw)
  const base = lang.split('-')[0]; // 'fr-FR' -> 'fr'
  return TCGDEX_LANGS.includes(base) ? base : 'en';
};

export const cardsConfig: CardsConfig = {
  providers: {
    mtg: { primary: 'scryfall' },
    pokemon: {
      // TCGdex first: multilingual (matches the browser language), reliable,
      // carries both price sources. pokemontcg.io (English) is the fallback.
      primary: pick('VITE_CARDS_POKEMON_PRIMARY') || 'tcgdex',
      fallback: pick('VITE_CARDS_POKEMON_FALLBACK') || 'pokemontcg',
    },
    lorcana: { primary: pick('VITE_CARDS_LORCANA_PRIMARY') || 'lorcast' },
    onepiece: {
      primary: pick('VITE_CARDS_ONEPIECE_PRIMARY') || 'apitcg',
      fallback: pick('VITE_CARDS_ONEPIECE_FALLBACK') || 'optcgapi',
    },
  },
  pokemonTcgApiKey: pick('VITE_POKEMONTCG_API_KEY'),
  pokemonLang: pick('VITE_POKEMON_LANG') || browserPokemonLang(),
  defaultPriceSource: asPriceSource(pick('VITE_DEFAULT_PRICE_SOURCE')),
};
