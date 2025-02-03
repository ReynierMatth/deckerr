import React, { useState, useEffect } from 'react';
    import { Plus, Minus } from 'lucide-react';

    interface Player {
      id: number;
      name: string;
      life: number;
      color: string;
    }

    const COLORS = ['white', 'blue', 'black', 'red', 'green'];

    export default function LifeCounter() {
      const [numPlayers, setNumPlayers] = useState<number | null>(null);
      const [playerNames, setPlayerNames] = useState<string[]>([]);
      const [players, setPlayers] = useState<Player[]>([]);
      const [setupComplete, setSetupComplete] = useState(false);

      useEffect(() => {
        if (numPlayers !== null) {
          setPlayers(
            Array.from({ length: numPlayers }, (_, i) => ({
              id: i + 1,
              name: playerNames[i] || `Player ${i + 1}`,
              life: 20,
              color: COLORS[i % COLORS.length],
            }))
          );
        }
      }, [numPlayers, playerNames]);

      const handleNumPlayersChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newNumPlayers = parseInt(e.target.value, 10);
        setNumPlayers(newNumPlayers);
        setPlayerNames(Array(newNumPlayers).fill(''));
      };

      const handleNameChange = (index: number, newName: string) => {
        const updatedNames = [...playerNames];
        updatedNames[index] = newName;
        setPlayerNames(updatedNames);
      };

      const updateLife = (playerId: number, change: number) => {
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === playerId ? { ...player, life: player.life + change } : player
          )
        );
      };

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSetupComplete(true);
      };

      const renderSetupForm = () => (
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl font-bold mb-6">Setup Players</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Number of Players
              </label>
              <select
                value={numPlayers || ''}
                onChange={handleNumPlayersChange}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                required
              >
                <option value="" disabled>Select Number of Players</option>
                {[2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
            </div>

            {numPlayers !== null &&
              Array.from({ length: numPlayers }, (_, i) => (
                <div key={i}>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Player {i + 1} Name
                  </label>
                  <input
                    type="text"
                    value={playerNames[i] || ''}
                    onChange={(e) => handleNameChange(i, e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                    placeholder={`Player ${i + 1} Name`}
                  />
                </div>
              ))}

            {numPlayers !== null && (
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Start Game
              </button>
            )}
          </form>
        </div>
      );

      const renderLifeCounters = () => (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="relative w-full h-full">
            {players.map((player, index) => {
              const angle = (index / players.length) * 360;
              const rotation = 360 - angle;
              const x = 50 + 40 * Math.cos((angle - 90) * Math.PI / 180);
              const y = 50 + 40 * Math.sin((angle - 90) * Math.PI / 180);

              return (
                <div
                  key={player.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{
                    top: `${y}%`,
                    left: `${x}%`,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                >
                  <div
                    className="rounded-lg p-4 flex flex-col items-center"
                    style={{
                      backgroundColor: `var(--color-${player.color}-primary)`,
                      color: 'white',
                      transform: `rotate(${-rotation}deg)`,
                    }}
                  >
                    <h2 className="text-xl font-bold mb-4">{player.name}</h2>
                    <div className="text-4xl font-bold mb-4">{player.life}</div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => updateLife(player.id, 1)}
                        className="bg-green-600 hover:bg-green-700 rounded-full p-2"
                      >
                        <Plus size={24} />
                      </button>
                      <button
                        onClick={() => updateLife(player.id, -1)}
                        className="bg-red-600 hover:bg-red-700 rounded-full p-2"
                      >
                        <Minus size={24} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );

      return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Life Counter</h1>
            {!setupComplete ? renderSetupForm() : renderLifeCounters()}
          </div>
        </div>
      );
    }
