import { AlertTriangle, Check, Edit, Trash2 } from 'lucide-react';
import { Deck } from '../types';

interface DeckCardProps {
  deck: Deck;
  onEdit?: (deckId: string) => void;
  onDelete?: (deck: Deck) => void;
}

export default function DeckCard({ deck, onEdit, onDelete }: DeckCardProps) {
  // Use pre-calculated validation data
  const isValid = deck.isValid ?? true;
  const validationErrors = deck.validationErrors || [];

  // Use cover card (already loaded)
  const coverImage = deck.coverCard?.images?.normal;

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all cursor-pointer group"
      onClick={() => onEdit?.(deck.id)}
    >
      {/* Full Card Art */}
      <div className="relative aspect-[5/7] overflow-hidden">
        {coverImage ? (
          <img
            src={coverImage}
            alt={deck.coverCard?.name || deck.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-500">
            No Cover
          </div>
        )}
        {/* Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(deck);
            }}
            aria-label={`Delete ${deck.name}`}
            title="Delete deck"
            className="absolute top-2 right-2 p-2 rounded-full bg-gray-900/70 text-gray-200 hover:bg-red-600 hover:text-white transition-colors backdrop-blur-sm"
          >
            <Trash2 size={16} />
          </button>
        )}

        {/* Deck info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2 flex-1">{deck.name}</h3>
            {isValid ? (
              <Check size={16} className="text-green-400 ml-2 flex-shrink-0" />
            ) : (
              <span title={validationErrors.join(', ')} className="ml-2 flex-shrink-0">
                <AlertTriangle size={16} className="text-yellow-400" />
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-300 mb-2">
            <span className="capitalize">{deck.format}</span>
            <span>{deck.cardCount || 0} cards</span>
          </div>

          {deck.format === 'commander' && deck.coverCard && (
            <div className="text-xs text-blue-300 mb-2 truncate">
              <span className="font-semibold">Commander:</span> {deck.coverCard.name}
            </div>
          )}

          {deck.tags && deck.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {deck.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 bg-blue-600/30 text-blue-200 rounded text-[10px] leading-tight"
                >
                  {tag}
                </span>
              ))}
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
