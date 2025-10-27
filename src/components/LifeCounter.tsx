import React, { useState } from 'react';
import { Users, RotateCcw, Settings } from 'lucide-react';
import PlayerLifeCounter from './PlayerLifeCounter';
import CardSearchModal from './CardSearchModal';
import { Card } from '../types';

interface Player {
  id: number;
  name: string;
  life: number;
  backgroundImage?: string;
}

const DEFAULT_STARTING_LIFE = 20;

export default function LifeCounter() {
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: 'Player 1', life: DEFAULT_STARTING_LIFE },
    { id: 2, name: 'Player 2', life: DEFAULT_STARTING_LIFE },
  ]);
  const [isCardSearchOpen, setIsCardSearchOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [startingLife, setStartingLife] = useState(DEFAULT_STARTING_LIFE);

  const updateLife = (playerId: number, change: number) => {
    setPlayers((prevPlayers) =>
      prevPlayers.map((player) =>
        player.id === playerId ? { ...player, life: Math.max(0, player.life + change) } : player
      )
    );
  };

  const changePlayerName = (playerId: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    const newName = prompt('Enter new player name:', player.name);
    if (newName && newName.trim()) {
      setPlayers((prevPlayers) =>
        prevPlayers.map((p) => (p.id === playerId ? { ...p, name: newName.trim() } : p))
      );
    }
  };

  const openBackgroundSelector = (playerId: number) => {
    setSelectedPlayerId(playerId);
    setIsCardSearchOpen(true);
  };

  const handleCardSelect = (card: Card) => {
    if (selectedPlayerId !== null && card.image_uris?.art_crop) {
      setPlayers((prevPlayers) =>
        prevPlayers.map((p) =>
          p.id === selectedPlayerId ? { ...p, backgroundImage: card.image_uris!.art_crop } : p
        )
      );
    }
    setSelectedPlayerId(null);
  };

  const changePlayerCount = (count: number) => {
    const currentCount = players.length;

    if (count > currentCount) {
      // Add players
      const newPlayers = Array.from({ length: count - currentCount }, (_, i) => ({
        id: currentCount + i + 1,
        name: `Player ${currentCount + i + 1}`,
        life: startingLife,
      }));
      setPlayers([...players, ...newPlayers]);
    } else if (count < currentCount) {
      // Remove players
      setPlayers(players.slice(0, count));
    }
  };

  const resetAllLife = () => {
    if (confirm(`Reset all players to ${startingLife} life?`)) {
      setPlayers((prevPlayers) =>
        prevPlayers.map((p) => ({ ...p, life: startingLife }))
      );
    }
  };

  const getGridClass = () => {
    const count = players.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    if (count === 4) return 'grid-cols-2 lg:grid-cols-2';
    if (count === 5) return 'grid-cols-2 lg:grid-cols-3';
    if (count === 6) return 'grid-cols-2 lg:grid-cols-3';
    if (count === 7 || count === 8) return 'grid-cols-2 lg:grid-cols-4';
    return 'grid-cols-2 lg:grid-cols-4';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Life Counter</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAllLife}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition-colors"
          >
            <RotateCcw size={18} />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition-colors"
          >
            <Settings size={18} />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-4 animate-fade-in">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Player Count */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Users size={16} className="inline mr-2" />
                Number of Players
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <button
                    key={count}
                    onClick={() => changePlayerCount(count)}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      players.length === count
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Starting Life */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Starting Life Total
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[20, 30, 40].map((life) => (
                  <button
                    key={life}
                    onClick={() => {
                      setStartingLife(life);
                      if (confirm(`Change starting life to ${life}? This will reset all players.`)) {
                        setPlayers((prevPlayers) =>
                          prevPlayers.map((p) => ({ ...p, life }))
                        );
                      }
                    }}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      startingLife === life
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {life}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Life Counter Grid */}
      <div className={`flex-1 grid ${getGridClass()} gap-2 md:gap-4 p-2 md:p-4`}>
        {players.map((player) => (
          <PlayerLifeCounter
            key={player.id}
            id={player.id}
            name={player.name}
            life={player.life}
            backgroundImage={player.backgroundImage}
            onLifeChange={(change) => updateLife(player.id, change)}
            onChangeName={() => changePlayerName(player.id)}
            onChangeBackground={() => openBackgroundSelector(player.id)}
          />
        ))}
      </div>

      {/* Card Search Modal */}
      <CardSearchModal
        isOpen={isCardSearchOpen}
        onClose={() => {
          setIsCardSearchOpen(false);
          setSelectedPlayerId(null);
        }}
        onSelectCard={handleCardSelect}
      />
    </div>
  );
}
