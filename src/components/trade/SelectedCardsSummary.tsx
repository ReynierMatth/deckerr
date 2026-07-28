import { Minus } from 'lucide-react';
import { SelectedCard } from './types';
import { getPrice } from '../../cards/domain/accessors/price';

interface SelectedCardsSummaryProps {
  cards: Map<string, SelectedCard>;
  onRemove: (cardId: string) => void;
  label: string;
  emptyLabel: string;
  color: 'green' | 'blue';
}

/** Compact chip list of one side of the offer, with its running total. */
export default function SelectedCardsSummary({ cards, onRemove, label, emptyLabel, color }: SelectedCardsSummaryProps) {
  const bgColor = color === 'green' ? 'bg-green-900/50' : 'bg-blue-900/50';
  const textColor = color === 'green' ? 'text-green-400' : 'text-blue-400';

  // Calculate total price
  const totalPrice = Array.from(cards.values()).reduce((total, item) => {
    const price = getPrice(item.card, 'tcgplayer');
    return total + (price * item.quantity);
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className={`text-xs font-semibold ${textColor}`}>{label}:</h4>
        {cards.size > 0 && (
          <span className={`text-xs font-semibold ${textColor}`}>
            ${totalPrice.toFixed(2)}
          </span>
        )}
      </div>
      {cards.size === 0 ? (
        <p className="text-gray-500 text-xs">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {Array.from(cards.values()).map((item) => (
            <div
              key={item.card.id}
              className={`flex items-center gap-1 ${bgColor} px-1.5 py-0.5 rounded text-xs`}
            >
              <span className="truncate max-w-[80px]">{item.card.name}</span>
              <span className={textColor}>x{item.quantity}</span>
              <button
                onClick={() => onRemove(item.card.id)}
                className="text-red-400 active:text-red-300"
              >
                <Minus size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
