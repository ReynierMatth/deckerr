import { ValueHistoryPoint } from '../services/api';

interface CollectionValueChartProps {
  history: ValueHistoryPoint[];
}

const W = 320;
const H = 120;
const PAD = { top: 12, right: 8, bottom: 18, left: 8 };

export default function CollectionValueChart({ history }: CollectionValueChartProps) {
  if (history.length < 2) {
    return (
      <p className="text-xs text-gray-500">
        Value is tracked once a day — the chart appears after a couple of days of history.
      </p>
    );
  }

  const values = history.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (history.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  const linePath = history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(history.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Collection value over time">
        <path d={areaPath} fill="#3B82F6" fillOpacity={0.15} />
        <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {history.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={2.5} fill="#3B82F6">
            <title>{`${p.date}: $${p.value.toFixed(2)}`}</title>
          </circle>
        ))}
        {/* endpoint labels */}
        <text x={PAD.left} y={H - 4} className="fill-gray-500" fontSize={9}>{first.date.slice(5)}</text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-gray-500" fontSize={9}>{last.date.slice(5)}</text>
      </svg>
    </div>
  );
}
