import { Card } from '../../types';
import { computeBuylist } from '../../utils/buylist';

interface BuyListProps {
  cards: { card: Card; quantity: number }[];
  owned: Map<string, number>;
}

export default function BuyList({ cards, owned }: BuyListProps) {
  const { items, totalMissing, totalCost } = computeBuylist(cards, owned);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">You own every card in this deck. 🎉</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{totalMissing} card(s) missing</span>
        <span className="text-lg font-bold text-green-400">${totalCost.toFixed(2)}</span>
      </div>

      <ul className="divide-y divide-gray-700/60">
        {items.map(({ card, missing, unitPrice, lineTotal }) => (
          <li key={card.id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="w-8 shrink-0 text-gray-400 tabular-nums">{missing}×</span>
            <span className="flex-1 truncate text-gray-200">{card.name}</span>
            <span className="shrink-0 text-gray-500 tabular-nums text-xs">${unitPrice.toFixed(2)}</span>
            <span className="w-16 shrink-0 text-right text-gray-300 tabular-nums">${lineTotal.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
