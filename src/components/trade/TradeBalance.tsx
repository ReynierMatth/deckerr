import { SelectedCard } from './types';

const sumSideValue = (cards: Map<string, SelectedCard>): number =>
  Array.from(cards.values()).reduce(
    (total, item) => total + (item.card.prices?.usd ? parseFloat(item.card.prices.usd) : 0) * item.quantity,
    0,
  );

/** Give/get totals and whether the trade is balanced or one-sided. */
export default function TradeBalance({ give, want }: { give: Map<string, SelectedCard>; want: Map<string, SelectedCard> }) {
  const giveTotal = sumSideValue(give);
  const wantTotal = sumSideValue(want);
  const diff = giveTotal - wantTotal;
  const even = Math.abs(diff) < 0.01;
  return (
    <div className="border-t border-gray-700 pt-2 mt-1 space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-gray-400">You give</span>
        <span className="text-green-400 font-semibold">${giveTotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">You get</span>
        <span className="text-blue-400 font-semibold">${wantTotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span className="text-gray-300">Balance</span>
        <span className={even ? 'text-gray-300' : diff > 0 ? 'text-red-400' : 'text-green-400'}>
          {even ? 'Even' : diff > 0 ? `You give $${diff.toFixed(2)} more` : `In your favor by $${(-diff).toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}
