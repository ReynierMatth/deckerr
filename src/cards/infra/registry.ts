/**
 * Provider registry — resolves the configured CardProvider for a game.
 *
 * Swapping a game's provider is a config change (see `config.ts`); adding a new
 * adapter is a single line in FACTORIES. When a fallback is configured the
 * primary is wrapped so failures/empty results transparently retry it.
 */

import { GameId } from '../domain/game';
import { CardProvider } from '../domain/ports/CardProvider';
import { cardsConfig, CardsConfig } from './config';
import { ScryfallCardProvider } from './adapters/scryfall/ScryfallCardProvider';
import { PokemonTcgProvider } from './adapters/pokemontcg/PokemonTcgProvider';
import { TcgdexProvider } from './adapters/tcgdex/TcgdexProvider';
import { FallbackCardProvider } from './adapters/FallbackCardProvider';

type ProviderFactory = (game: GameId, cfg: CardsConfig) => CardProvider;

// Adapter id -> factory. Lorcana / One-Piece adapters register here in Phase 2.
const FACTORIES: Record<string, ProviderFactory> = {
  scryfall: () => new ScryfallCardProvider(),
  pokemontcg: (_game, cfg) => new PokemonTcgProvider(cfg.pokemonTcgApiKey),
  tcgdex: () => new TcgdexProvider(),
};

const cache = new Map<GameId, CardProvider>();

const build = (id: string, game: GameId, cfg: CardsConfig): CardProvider => {
  const factory = FACTORIES[id];
  if (!factory) {
    throw new Error(`No card provider registered for "${id}" (game: ${game})`);
  }
  return factory(game, cfg);
};

export const getProvider = (game: GameId): CardProvider => {
  const cached = cache.get(game);
  if (cached) return cached;

  const choice = cardsConfig.providers[game];
  if (!choice) throw new Error(`No provider configured for game "${game}"`);

  const primary = build(choice.primary, game, cardsConfig);
  const provider = choice.fallback
    ? new FallbackCardProvider(primary, build(choice.fallback, game, cardsConfig))
    : primary;

  cache.set(game, provider);
  return provider;
};

/** Test hook: drop cached provider instances. */
export const resetProviderCache = (): void => cache.clear();
