import { useReducer, useState } from 'react';
import {
  Plus,
  Minus,
  Skull,
  Droplet,
  Crown,
  Dices,
  Coins,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Swords,
  Users,
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

type StartingLife = 20 | 30 | 40;

interface Player {
  id: number;
  name: string;
  life: number;
  poison: number;
  /** Commander damage received, keyed by the source player's id. */
  commanderDamage: Record<number, number>;
}

interface GameState {
  players: Player[];
  startingLife: StartingLife;
  activePlayerId: number | null;
}

const MAX_COMMANDER_DAMAGE = 21;
const MAX_POISON = 10;

interface ColorTheme {
  label: string;
  border: string;
  ring: string;
  text: string;
  dot: string;
}

const PLAYER_COLORS: ColorTheme[] = [
  { label: 'Red', border: 'border-red-500', ring: 'ring-red-500', text: 'text-red-400', dot: 'bg-red-500' },
  { label: 'Blue', border: 'border-blue-500', ring: 'ring-blue-500', text: 'text-blue-400', dot: 'bg-blue-500' },
  { label: 'Green', border: 'border-green-500', ring: 'ring-green-500', text: 'text-green-400', dot: 'bg-green-500' },
  { label: 'Amber', border: 'border-amber-500', ring: 'ring-amber-500', text: 'text-amber-400', dot: 'bg-amber-500' },
  { label: 'Purple', border: 'border-purple-500', ring: 'ring-purple-500', text: 'text-purple-400', dot: 'bg-purple-500' },
  { label: 'Cyan', border: 'border-cyan-500', ring: 'ring-cyan-500', text: 'text-cyan-400', dot: 'bg-cyan-500' },
];

function colorFor(index: number): ColorTheme {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makePlayers(count: number, startingLife: StartingLife): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Player ${i + 1}`,
    life: startingLife,
    poison: 0,
    commanderDamage: {},
  }));
}

type Action =
  | { type: 'newGame'; count: number; startingLife: StartingLife }
  | { type: 'reset' }
  | { type: 'life'; playerId: number; delta: number }
  | { type: 'poison'; playerId: number; delta: number }
  | { type: 'commanderDamage'; playerId: number; sourceId: number; delta: number }
  | { type: 'rename'; playerId: number; name: string }
  | { type: 'setActive'; playerId: number }
  | { type: 'setStartingLife'; startingLife: StartingLife };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'newGame':
      return {
        players: makePlayers(action.count, action.startingLife),
        startingLife: action.startingLife,
        activePlayerId: null,
      };
    case 'reset':
      return {
        ...state,
        players: makePlayers(state.players.length, state.startingLife),
        activePlayerId: null,
      };
    case 'setStartingLife':
      return {
        ...state,
        startingLife: action.startingLife,
        players: state.players.map((p) => ({ ...p, life: action.startingLife })),
      };
    case 'life':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, life: p.life + action.delta } : p
        ),
      };
    case 'poison':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, poison: clamp(p.poison + action.delta, 0, MAX_POISON) }
            : p
        ),
      };
    case 'commanderDamage':
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.id !== action.playerId) return p;
          const current = p.commanderDamage[action.sourceId] ?? 0;
          return {
            ...p,
            commanderDamage: {
              ...p.commanderDamage,
              [action.sourceId]: clamp(current + action.delta, 0, MAX_COMMANDER_DAMAGE),
            },
          };
        }),
      };
    case 'rename':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, name: action.name } : p
        ),
      };
    case 'setActive':
      return { ...state, activePlayerId: action.playerId };
    default:
      return state;
  }
}

function isDead(player: Player): boolean {
  if (player.life <= 0) return true;
  if (player.poison >= MAX_POISON) return true;
  return Object.values(player.commanderDamage).some((d) => d >= MAX_COMMANDER_DAMAGE);
}

interface StepButtonProps {
  onClick: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}

function StepButton({ onClick, label, className, children }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex items-center justify-center rounded-xl font-bold select-none transition-colors active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

interface PlayerPanelProps {
  player: Player;
  index: number;
  others: Player[];
  isActive: boolean;
  onLife: (delta: number) => void;
  onPoison: (delta: number) => void;
  onCommanderDamage: (sourceId: number, delta: number) => void;
  onRename: (name: string) => void;
  onSetActive: () => void;
}

function PlayerPanel({
  player,
  index,
  others,
  isActive,
  onLife,
  onPoison,
  onCommanderDamage,
  onRename,
  onSetActive,
}: PlayerPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const theme = colorFor(index);
  const dead = isDead(player);

  return (
    <div
      className={`relative flex flex-col rounded-2xl bg-gray-800 border-2 p-3 min-h-0 overflow-hidden transition-colors ${
        isActive ? `${theme.border} ring-2 ${theme.ring}` : 'border-gray-700'
      } ${dead ? 'opacity-70' : ''}`}
    >
      {/* Header: color dot, name, active toggle */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-3 w-3 rounded-full shrink-0 ${theme.dot}`} aria-hidden />
        <input
          type="text"
          value={player.name}
          onChange={(e) => onRename(e.target.value)}
          aria-label={`Name for player ${player.id}`}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none focus:bg-gray-900/60 rounded px-1 py-0.5"
        />
        <button
          type="button"
          aria-label={`Set player ${player.id} as active`}
          onClick={onSetActive}
          className={`shrink-0 rounded-lg p-1.5 transition-colors ${
            isActive ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Crown size={18} />
        </button>
      </div>

      {/* Life controls */}
      <div className="flex flex-1 items-center justify-between gap-2 min-h-0">
        <div className="flex flex-col gap-1">
          <StepButton
            onClick={() => onLife(-1)}
            label={`${player.name} minus 1 life`}
            className="h-12 w-12 bg-gray-700 text-white hover:bg-gray-600"
          >
            <Minus size={22} />
          </StepButton>
          <StepButton
            onClick={() => onLife(-5)}
            label={`${player.name} minus 5 life`}
            className="h-9 w-12 bg-gray-700/70 text-xs text-gray-200 hover:bg-gray-600"
          >
            −5
          </StepButton>
        </div>

        <div className="flex flex-col items-center leading-none">
          {dead ? (
            <Skull className="text-red-500 mb-1" size={28} />
          ) : null}
          <span className={`font-extrabold tabular-nums ${dead ? 'text-red-400' : 'text-white'} text-5xl`}>
            {player.life}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <StepButton
            onClick={() => onLife(1)}
            label={`${player.name} plus 1 life`}
            className="h-12 w-12 bg-green-600 text-white hover:bg-green-500"
          >
            <Plus size={22} />
          </StepButton>
          <StepButton
            onClick={() => onLife(5)}
            label={`${player.name} plus 5 life`}
            className="h-9 w-12 bg-green-600/70 text-xs text-white hover:bg-green-500"
          >
            +5
          </StepButton>
        </div>
      </div>

      {/* Status badges + expand toggle */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {player.poison > 0 ? (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
                player.poison >= MAX_POISON
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              <Droplet size={12} />
              {player.poison}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`Toggle counters for ${player.name}`}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200"
        >
          <Swords size={14} />
          Counters
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expandable: poison + commander damage */}
      {expanded ? (
        <div className="mt-2 space-y-3 border-t border-gray-700 pt-2">
          {/* Poison */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-medium text-gray-300">
              <Droplet size={14} /> Poison
            </span>
            <div className="flex items-center gap-2">
              <StepButton
                onClick={() => onPoison(-1)}
                label={`${player.name} poison minus 1`}
                className="h-8 w-8 bg-gray-700 text-white hover:bg-gray-600"
              >
                <Minus size={16} />
              </StepButton>
              <span
                className={`w-8 text-center text-sm font-bold tabular-nums ${
                  player.poison >= MAX_POISON ? 'text-green-400' : 'text-white'
                }`}
              >
                {player.poison}
              </span>
              <StepButton
                onClick={() => onPoison(1)}
                label={`${player.name} poison plus 1`}
                className="h-8 w-8 bg-gray-700 text-white hover:bg-gray-600"
              >
                <Plus size={16} />
              </StepButton>
            </div>
          </div>

          {/* Commander damage */}
          <div>
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-300">
              <Swords size={14} /> Commander damage
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {others.map((src) => {
                const dmg = player.commanderDamage[src.id] ?? 0;
                const lethal = dmg >= MAX_COMMANDER_DAMAGE;
                const srcTheme = colorFor(src.id - 1);
                return (
                  <div
                    key={src.id}
                    className="flex items-center gap-2 rounded-lg bg-gray-900/60 px-2 py-1"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${srcTheme.dot}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-300">
                      {src.name}
                    </span>
                    <StepButton
                      onClick={() => onCommanderDamage(src.id, -1)}
                      label={`${player.name} commander damage from ${src.name} minus 1`}
                      className="h-7 w-7 bg-gray-700 text-white hover:bg-gray-600"
                    >
                      <Minus size={14} />
                    </StepButton>
                    <span
                      className={`w-6 text-center text-sm font-bold tabular-nums ${
                        lethal ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {dmg}
                    </span>
                    <StepButton
                      onClick={() => onCommanderDamage(src.id, 1)}
                      label={`${player.name} commander damage from ${src.name} plus 1`}
                      className="h-7 w-7 bg-red-600 text-white hover:bg-red-500"
                    >
                      <Plus size={14} />
                    </StepButton>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const STARTING_LIFE_OPTIONS: StartingLife[] = [20, 30, 40];
const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6];

export default function LifeCounter() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    players: makePlayers(4, 40),
    startingLife: 40 as StartingLife,
    activePlayerId: null,
  }));
  const [started, setStarted] = useState(false);
  const [setupCount, setSetupCount] = useState(4);
  const [setupLife, setSetupLife] = useState<StartingLife>(40);
  const [diceResult, setDiceResult] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const startGame = () => {
    dispatch({ type: 'newGame', count: setupCount, startingLife: setupLife });
    setDiceResult(null);
    setStarted(true);
  };

  const flipCoin = () => {
    setDiceResult(Math.random() < 0.5 ? 'Coin: Heads' : 'Coin: Tails');
  };

  const rollDie = (sides: number) => {
    setDiceResult(`d${sides}: ${Math.floor(Math.random() * sides) + 1}`);
  };

  const randomFirstPlayer = () => {
    const pick = state.players[Math.floor(Math.random() * state.players.length)];
    dispatch({ type: 'setActive', playerId: pick.id });
    setDiceResult(`First player: ${pick.name}`);
  };

  const gridClass =
    state.players.length === 2
      ? 'grid-cols-1'
      : state.players.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2';

  if (!started) {
    return (
      <div className="min-h-screen bg-gray-900 px-6 py-8 text-white">
        <div className="mx-auto max-w-md">
          <h1 className="mb-6 flex items-center gap-2 text-3xl font-bold">
            <Users className="text-blue-400" /> Life Counter
          </h1>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Players</label>
              <div className="grid grid-cols-5 gap-2">
                {PLAYER_COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSetupCount(n)}
                    className={`rounded-xl py-3 text-lg font-bold transition-colors ${
                      setupCount === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Starting life</label>
              <div className="grid grid-cols-3 gap-2">
                {STARTING_LIFE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSetupLife(n)}
                    className={`rounded-xl py-3 text-lg font-bold transition-colors ${
                      setupLife === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={startGame}
              className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white transition-colors hover:bg-green-500"
            >
              Start Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-gray-800 bg-gray-900/95 px-3 py-2">
        <button
          type="button"
          onClick={flipCoin}
          className="flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium hover:bg-gray-700"
        >
          <Coins size={16} /> Flip
        </button>
        <button
          type="button"
          onClick={() => rollDie(6)}
          className="flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium hover:bg-gray-700"
        >
          <Dices size={16} /> d6
        </button>
        <button
          type="button"
          onClick={() => rollDie(20)}
          className="flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium hover:bg-gray-700"
        >
          <Dices size={16} /> d20
        </button>
        <button
          type="button"
          onClick={randomFirstPlayer}
          className="flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium hover:bg-gray-700"
        >
          <Crown size={16} /> First
        </button>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="flex items-center gap-1 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-red-400 hover:bg-gray-700"
        >
          <RotateCcw size={16} /> Reset
        </button>
        {diceResult ? (
          <span className="ml-1 rounded-lg bg-blue-600/20 px-3 py-2 text-sm font-semibold text-blue-300">
            {diceResult}
          </span>
        ) : null}
      </div>

      {/* Player grid */}
      <div className={`grid flex-1 gap-2 p-2 ${gridClass}`}>
        {state.players.map((player, index) => (
          <PlayerPanel
            key={player.id}
            player={player}
            index={index}
            others={state.players.filter((p) => p.id !== player.id)}
            isActive={state.activePlayerId === player.id}
            onLife={(delta) => dispatch({ type: 'life', playerId: player.id, delta })}
            onPoison={(delta) => dispatch({ type: 'poison', playerId: player.id, delta })}
            onCommanderDamage={(sourceId, delta) =>
              dispatch({ type: 'commanderDamage', playerId: player.id, sourceId, delta })
            }
            onRename={(name) => dispatch({ type: 'rename', playerId: player.id, name })}
            onSetActive={() => dispatch({ type: 'setActive', playerId: player.id })}
          />
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: 'reset' });
          setDiceResult(null);
        }}
        title="Reset game?"
        message="This restores starting life and clears all poison and commander damage counters."
        confirmText="Reset"
        variant="warning"
      />
    </div>
  );
}
