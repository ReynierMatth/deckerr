import { ValueHistoryPoint } from '../services/api';
import PriceLineChart from './charts/PriceLineChart';

interface CollectionValueChartProps {
  history: ValueHistoryPoint[];
}

export default function CollectionValueChart({ history }: CollectionValueChartProps) {
  if (history.length < 2) {
    return (
      <p className="text-xs text-gray-500">
        Value is tracked once a day — the chart appears after a couple of days of history.
      </p>
    );
  }

  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.value - first.value;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-gray-400">Value over time</span>
        <span className={`text-xs font-semibold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}
        </span>
      </div>
      <PriceLineChart points={history} ariaLabel="Collection value over time" />
    </div>
  );
}
