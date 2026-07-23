import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Card } from '../../types';
import { getCardImageUri } from '../../utils/cardFaces';
import { drawSampleHand } from '../../utils/sampleHand';

interface SampleHandProps {
  cards: { card: Card; quantity: number }[];
}

export default function SampleHand({ cards }: SampleHandProps) {
  const [hand, setHand] = useState<Card[] | null>(null);
  const total = cards.reduce((acc, c) => acc + c.quantity, 0);

  const draw = () => setHand(drawSampleHand(cards, 7));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={draw}
          disabled={total === 0}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Shuffle size={16} />
          {hand ? 'Mulligan' : 'Draw sample hand'}
        </button>
        {hand && <span className="text-xs text-gray-500">7 cards from {total}</span>}
      </div>

      {hand && (
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {hand.map((card, i) => (
            <div key={`${card.id}-${i}`} className="aspect-[5/7] rounded overflow-hidden bg-gray-900">
              {getCardImageUri(card) ? (
                <img src={getCardImageUri(card)} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-1 text-[10px] text-gray-400 text-center">
                  {card.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
