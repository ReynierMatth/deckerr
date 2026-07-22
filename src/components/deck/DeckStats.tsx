import { Card } from '../../types';
import { computeDeckStats, DeckColorKey } from '../../utils/deckStats';

interface DeckStatsProps {
  cards: { card: Card; quantity: number }[];
}

// Canonical MTG colours, tuned for readability on the dark surface. Each is
// always paired with a text label + count, so identity is never colour-alone.
const COLOR_META: Record<DeckColorKey, { label: string; hex: string }> = {
  W: { label: 'White', hex: '#EADFC3' },
  U: { label: 'Blue', hex: '#3B82F6' },
  B: { label: 'Black', hex: '#9A8CB8' },
  R: { label: 'Red', hex: '#EF4444' },
  G: { label: 'Green', hex: '#22C55E' },
  C: { label: 'Colorless', hex: '#9CA3AF' },
};

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-center">
    <div className="text-lg font-bold text-white">{value}</div>
    <div className="text-xs text-gray-400">{label}</div>
  </div>
);

export default function DeckStats({ cards }: DeckStatsProps) {
  const stats = computeDeckStats(cards);

  if (stats.totalCards === 0) {
    return <p className="text-sm text-gray-500">Add cards to see deck stats.</p>;
  }

  const maxCurve = Math.max(1, ...stats.manaCurve.map((b) => b.count));
  const maxType = Math.max(1, ...stats.typeCounts.map((t) => t.count));
  const activeColors = (Object.keys(COLOR_META) as DeckColorKey[]).filter((k) => stats.colorCounts[k] > 0);
  const maxColor = Math.max(1, ...activeColors.map((k) => stats.colorCounts[k]));

  return (
    <div className="space-y-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Cards" value={stats.totalCards} />
        <Tile label="Lands" value={stats.landCount} />
        <Tile label="Nonland" value={stats.nonLandCount} />
        <Tile label="Avg CMC" value={stats.averageCmc.toFixed(2)} />
      </div>

      {/* Mana curve (single series) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Mana curve (nonland)</h3>
        <div className="flex items-end justify-between gap-1.5 h-32">
          {stats.manaCurve.map((b) => (
            <div key={b.cmc} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <span className="text-xs text-gray-400 tabular-nums">{b.count || ''}</span>
              <div
                className="w-full rounded-t bg-blue-500 min-h-[2px] transition-[height]"
                style={{ height: `${(b.count / maxCurve) * 100}%` }}
                title={`CMC ${b.label}: ${b.count}`}
              />
              <span className="text-xs text-gray-500 tabular-nums">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Colors */}
      {activeColors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Colors</h3>
          <div className="space-y-1.5">
            {activeColors.map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-gray-400">{COLOR_META[k].label}</span>
                <div className="flex-1 bg-gray-900/60 rounded h-4 overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(stats.colorCounts[k] / maxColor) * 100}%`, backgroundColor: COLOR_META[k].hex }}
                    title={`${COLOR_META[k].label}: ${stats.colorCounts[k]}`}
                  />
                </div>
                <span className="w-6 text-right text-gray-300 tabular-nums">{stats.colorCounts[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Types */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Card types</h3>
        <div className="space-y-1.5">
          {stats.typeCounts.map(({ type, count }) => (
            <div key={type} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-gray-400 truncate">{type}</span>
              <div className="flex-1 bg-gray-900/60 rounded h-4 overflow-hidden">
                <div
                  className="h-full rounded bg-purple-500"
                  style={{ width: `${(count / maxType) * 100}%` }}
                  title={`${type}: ${count}`}
                />
              </div>
              <span className="w-6 text-right text-gray-300 tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
