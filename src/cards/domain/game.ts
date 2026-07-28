/**
 * Game (TCG) identity — the discriminator that makes deckerr multi-TCG.
 *
 * Pure domain module: no I/O, no provider knowledge. Phase 1 enables MTG and
 * Pokémon; Lorcana and One Piece are declared but disabled until Phase 2.
 */

export type GameId = 'mtg' | 'pokemon' | 'lorcana' | 'onepiece';

export interface GameMeta {
  id: GameId;
  label: string;
  /** Whether the game is exposed in the UI (Phase 1: mtg + pokemon). */
  enabled: boolean;
}

export const GAMES: Record<GameId, GameMeta> = {
  mtg: { id: 'mtg', label: 'Magic', enabled: true },
  pokemon: { id: 'pokemon', label: 'Pokémon', enabled: true },
  lorcana: { id: 'lorcana', label: 'Lorcana', enabled: false },
  onepiece: { id: 'onepiece', label: 'One Piece', enabled: false },
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];

/** Runtime guard: is `value` one of the known game ids? */
export const isGameId = (value: unknown): value is GameId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(GAMES, value);

/** Games currently available in the UI. */
export const enabledGames = (): GameMeta[] => GAME_IDS.map((id) => GAMES[id]).filter((g) => g.enabled);
