import React from 'react';
import { Plus, Minus, Image as ImageIcon } from 'lucide-react';

interface PlayerLifeCounterProps {
  id: number;
  name: string;
  life: number;
  backgroundImage?: string;
  onLifeChange: (change: number) => void;
  onChangeName: () => void;
  onChangeBackground: () => void;
}

export default function PlayerLifeCounter({
  name,
  life,
  backgroundImage,
  onLifeChange,
  onChangeName,
  onChangeBackground,
}: PlayerLifeCounterProps) {
  return (
    <div className="relative h-full rounded-lg overflow-hidden shadow-lg">
      {/* Background Image */}
      {backgroundImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70"></div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900"></div>
      )}

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-between p-4 md:p-6">
        {/* Player Name */}
        <button
          onClick={onChangeName}
          className="text-white font-bold text-lg md:text-xl hover:text-blue-300 transition-colors px-4 py-2 rounded-lg hover:bg-white/10"
        >
          {name}
        </button>

        {/* Life Total */}
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold text-white drop-shadow-2xl">
            {life}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 w-full">
          {/* Life Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={() => onLifeChange(-1)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 md:py-4 px-4 font-bold text-xl transition-colors active:scale-95 flex items-center justify-center gap-2"
            >
              <Minus size={24} />
              <span className="hidden sm:inline">-1</span>
            </button>
            <button
              onClick={() => onLifeChange(1)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 md:py-4 px-4 font-bold text-xl transition-colors active:scale-95 flex items-center justify-center gap-2"
            >
              <Plus size={24} />
              <span className="hidden sm:inline">+1</span>
            </button>
          </div>

          {/* Background Button */}
          <button
            onClick={onChangeBackground}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 px-4 text-sm transition-colors flex items-center justify-center gap-2"
          >
            <ImageIcon size={16} />
            Change Background
          </button>
        </div>
      </div>
    </div>
  );
}
