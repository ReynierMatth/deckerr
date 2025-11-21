import React from 'react';
import { AlertTriangle, Check, Edit } from 'lucide-react';
import { Deck } from '../types';
import { validateDeck } from '../utils/deckValidation';

interface DeckCardProps {
  deck: Deck;
  onEdit?: (deckId: string) => void;
}

export default function DeckCard({ deck, onEdit }: DeckCardProps) {

  if(deck.id === "410ed539-a8f4-4bc4-91f1-6c113b9b7e25"){
    console.log("deck", deck.name);
    console.log("cardEntities", deck.cards);
  }

  const validation = validateDeck(deck);
  const commander = deck.format === 'commander' ? deck.cards.find(card => 
    card.is_commander
  )?.card : null;

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all cursor-pointer group"
      onClick={() => onEdit?.(deck.id)}
    >
      {/* Full Card Art */}
      <div className="relative aspect-[5/7] overflow-hidden">
        <img
          src={commander?.image_uris?.normal || deck.cards[0]?.card.image_uris?.normal}
          alt={commander?.name || deck.cards[0]?.card.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

        {/* Deck info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2 flex-1">{deck.name}</h3>
            {validation.isValid ? (
              <Check size={16} className="text-green-400 ml-2 flex-shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-yellow-400 ml-2 flex-shrink-0" title={validation.errors.join(', ')} />
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-300 mb-2">
            <span className="capitalize">{deck.format}</span>
            <span>{deck.cards.reduce((acc, curr) => acc + curr.quantity, 0)} cards</span>
          </div>

          {commander && (
            <div className="text-xs text-blue-300 mb-2 truncate">
              <span className="font-semibold">Commander:</span> {commander.name}
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(deck.id);
            }}
            className="w-full min-h-[36px] px-3 py-2 bg-blue-600/90 hover:bg-blue-600 rounded-md flex items-center justify-center gap-2 text-white text-sm font-medium transition-colors backdrop-blur-sm"
          >
            <Edit size={16} />
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
