import React from 'react';
import { AlertTriangle, Check, Edit } from 'lucide-react';
import { Deck } from '../types';
import { validateDeck } from '../utils/deckValidation';

interface DeckCardProps {
  deck: Deck;
  onEdit?: (deckId: string) => void;
}

export default function DeckCard({ deck, onEdit }: DeckCardProps) {
  const validation = validateDeck(deck);
  const commander = deck.format === 'commander' ? deck.cards.find(card => 
    card.card.type_line?.toLowerCase().includes('legendary creature')
  )?.card : null;

  return (
    <div 
      className="bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer"
      onClick={() => onEdit?.(deck.id)}
    >
      <div className="relative h-48 overflow-hidden">
        <img
          src={commander?.image_uris?.normal || deck.cards[0]?.card.image_uris?.normal}
          alt={commander?.name || deck.cards[0]?.card.name}
          className="w-full object-cover object-top transform translate-y-[-12%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
      </div>
      
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold text-white">{deck.name}</h3>
          {validation.isValid ? (
            <div className="flex items-center text-green-400">
              <Check size={16} className="mr-1" />
              <span className="text-sm">Legal</span>
            </div>
          ) : (
            <div className="flex items-center text-yellow-400" title={validation.errors.join(', ')}>
              <AlertTriangle size={16} className="mr-1" />
              <span className="text-sm">Issues</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span className="capitalize">{deck.format}</span>
          <span>{deck.cards.reduce((acc, curr) => acc + curr.quantity, 0)} cards</span>
        </div>
        
        {commander && (
          <div className="mt-2 text-sm text-gray-300">
            <span className="text-blue-400">Commander:</span> {commander.name}
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(deck.id);
          }}
          className="mt-4 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2 text-white"
        >
          <Edit size={20} />
          Edit Deck
        </button>
      </div>
    </div>
  );
}
