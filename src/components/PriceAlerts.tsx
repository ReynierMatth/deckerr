import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Loader2, Trash2, Search, X } from 'lucide-react';
import { getPriceAlerts, removePriceAlert, PriceAlert, searchCards, addPriceAlert } from '../services/api';
import { Card } from '../types';
import { getCardImageUri } from '../utils/cardFaces';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const formatLastTriggered = (value: string | null): string => {
  if (!value) return 'Not triggered yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not triggered yet';
  return `Last triggered ${date.toLocaleDateString()}`;
};

export default function PriceAlerts() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery<PriceAlert[]>({
    queryKey: ['priceAlerts', user?.id],
    enabled: !!user,
    queryFn: () => getPriceAlerts(user!.id),
  });

  // --- create-alert search state ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [direction, setDirection] = useState<'above' | 'below'>('below');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await searchCards(query.trim()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleCreate = async () => {
    const t = parseFloat(target);
    if (!user || !selected || Number.isNaN(t) || t <= 0) return;
    setSaving(true);
    try {
      await addPriceAlert(user.id, selected.id, selected.name, t, direction);
      await queryClient.invalidateQueries({ queryKey: ['priceAlerts'] });
      toast.success(`Alert set for ${selected.name}`);
      setSelected(null);
      setTarget('');
      setQuery('');
      setResults([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set alert');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removePriceAlert(id);
      await queryClient.invalidateQueries({ queryKey: ['priceAlerts'] });
      toast.success('Alert removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove alert');
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-3xl mx-auto">
        <h1 className="flex items-center gap-2 text-2xl md:text-3xl font-bold mb-4 md:mb-6">
          <Bell size={26} />
          Price Alerts ({alerts.length})
        </h1>

        {/* New alert */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">New alert</h2>

          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {getCardImageUri(selected) && (
                  <img src={getCardImageUri(selected)} alt={selected.name} className="w-12 rounded" />
                )}
                <span className="flex-1 font-medium truncate">{selected.name}</span>
                <button onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-white" aria-label="Clear">
                  <X size={18} />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('below')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${direction === 'below' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Below
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('above')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${direction === 'above' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Above
                </button>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="Target price"
                    className="w-full bg-gray-900 text-white text-sm rounded-lg pl-7 pr-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving || !target.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : 'Add alert'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a card…"
                  className="flex-1 bg-gray-900 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <button type="submit" disabled={searching} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg">
                  {searching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                </button>
              </form>
              {results.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                  {results.slice(0, 24).map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelected(card)}
                      className="rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition"
                      title={card.name}
                    >
                      {getCardImageUri(card) ? (
                        <img src={getCardImageUri(card)} alt={card.name} className="w-full h-auto" loading="lazy" />
                      ) : (
                        <div className="aspect-[5/7] bg-gray-700 flex items-center justify-center p-1 text-[10px] text-center text-gray-300">
                          {card.name}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bell size={40} className="mx-auto mb-3 text-gray-600" />
            <p className="text-lg mb-2">No price alerts yet</p>
            <p className="text-sm">Search a card above to set your first alert.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-3 bg-gray-800 rounded-lg p-4 shadow"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{alert.card_name ?? 'Unknown card'}</p>
                  <p className="text-sm text-gray-300">
                    when price is {alert.direction} ${alert.target_price.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{formatLastTriggered(alert.last_triggered_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(alert.id)}
                  aria-label="Delete alert"
                  className="shrink-0 text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
