import { Search, X, Minus } from 'lucide-react';
import { Card } from '../../types';
import { CollectionItem, SelectedCard } from './types';
import { getPrice, hasPrice } from '../../cards/domain/accessors/price';

interface CollectionGridProps {
  items: CollectionItem[];
  selectedCards: Map<string, SelectedCard>;
  onAdd: (card: Card, maxQty: number) => void;
  onRemove: (cardId: string) => void;
  emptyMessage: string;
  selectionColor: 'green' | 'blue';
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
}

/** Searchable card-picker grid for one side of a trade (mine or theirs). */
export default function CollectionGrid({
  items,
  selectedCards,
  onAdd,
  onRemove,
  emptyMessage,
  selectionColor,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: CollectionGridProps) {
  const ringColor = selectionColor === 'green' ? 'ring-green-500' : 'ring-blue-500';
  const badgeColor = selectionColor === 'green' ? 'bg-green-600' : 'bg-blue-500';

  const filteredItems = items.filter(({ card }) =>
    card.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-gray-400 text-center py-8">{emptyMessage}</p>
      ) : filteredItems.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No cards match "{searchValue}"</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {filteredItems.map(({ card, quantity }) => {
            const selected = selectedCards.get(card.id);
            const remainingQty = quantity - (selected?.quantity || 0);
            return (
              <div
                key={card.id}
                className={`relative cursor-pointer rounded-lg overflow-hidden transition active:scale-95 ${
                  selected ? `ring-2 ${ringColor}` : 'active:ring-2 active:ring-gray-500'
                }`}
                onClick={() => remainingQty > 0 && onAdd(card, quantity)}
              >
                <img
                  src={card.images?.small || card.images?.normal}
                  alt={card.name}
                  className={`w-full h-auto ${remainingQty === 0 ? 'opacity-50' : ''}`}
                />
                <div className="absolute top-1 right-1 bg-gray-900/80 text-white text-[10px] px-1 py-0.5 rounded">
                  {remainingQty}/{quantity}
                </div>
                {hasPrice(card, 'tcgplayer') && (
                  <div className="absolute top-1 left-1 bg-gray-900/80 text-green-400 text-[10px] px-1 py-0.5 rounded font-semibold">
                    ${getPrice(card, 'tcgplayer')}
                  </div>
                )}
                {selected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(card.id);
                    }}
                    className={`absolute bottom-1 left-1 ${badgeColor} text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5`}
                  >
                    +{selected.quantity}
                    <Minus size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
