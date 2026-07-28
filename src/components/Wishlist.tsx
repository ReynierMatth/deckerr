import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Heart, Trash2, Search, Minus, Plus } from 'lucide-react';
import { Card } from '../types';
import {
  getWishlistDetailed,
  getCardsByIds,
  removeFromWishlist,
  searchCards,
  addToWishlist,
  updateWishlistItem,
  WishlistPriority,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getCardImageUri } from '../utils/cardFaces';
import { getPrice, hasPrice } from '../cards/domain/accessors/price';
import CardTile from './card/CardTile';

interface WishlistItem {
  card: Card;
  quantity: number;
  priority: WishlistPriority;
}

const PRIORITY_ORDER: Record<WishlistPriority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_OPTIONS: { value: WishlistPriority; label: string; activeClass: string }[] = [
  { value: 'high', label: 'High', activeClass: 'bg-rose-600 text-white' },
  { value: 'medium', label: 'Med', activeClass: 'bg-amber-500 text-gray-900' },
  { value: 'low', label: 'Low', activeClass: 'bg-gray-500 text-white' },
];

export default function Wishlist() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<WishlistItem[]>({
    // distinct from the ['wishlist', id] membership query (different shape)
    queryKey: ['wishlist', 'cards', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const entries = await getWishlistDetailed(user!.id);
      if (entries.length === 0) return [];
      const cards = await getCardsByIds(entries.map((e) => e.cardId));
      const byId = new Map(cards.map((c) => [c.id, c]));
      return entries.flatMap((e) => {
        const card = byId.get(e.cardId);
        return card ? [{ card, quantity: e.quantity, priority: e.priority }] : [];
      });
    },
  });

  // High -> Medium -> Low, then alphabetical within each priority.
  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          a.card.name.localeCompare(b.card.name),
      ),
    [items],
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);

  const invalidateWishlist = () => queryClient.invalidateQueries({ queryKey: ['wishlist'] });

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

  const handleAdd = async (card: Card) => {
    if (!user) return;
    try {
      await addToWishlist(user.id, card.id);
      await invalidateWishlist();
      toast.success(`Added ${card.name} to wishlist`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to wishlist');
    }
  };

  const handleRemove = async (cardId: string) => {
    if (!user) return;
    try {
      await removeFromWishlist(user.id, cardId);
      await invalidateWishlist();
      toast.success('Removed from wishlist');
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      toast.error('Failed to remove from wishlist');
    }
  };

  const handleQuantityChange = async (cardId: string, quantity: number) => {
    if (!user || quantity < 1) return;
    try {
      await updateWishlistItem(user.id, cardId, { quantity });
      await invalidateWishlist();
    } catch (error) {
      console.error('Error updating wishlist quantity:', error);
      toast.error('Failed to update quantity');
    }
  };

  const handlePriorityChange = async (cardId: string, priority: WishlistPriority) => {
    if (!user) return;
    try {
      await updateWishlistItem(user.id, cardId, { priority });
      await invalidateWishlist();
    } catch (error) {
      console.error('Error updating wishlist priority:', error);
      toast.error('Failed to update priority');
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">
          My Wishlist ({items.length})
        </h1>

        {/* Add to wishlist */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Add a card</h2>
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
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-72 overflow-y-auto">
              {results.slice(0, 32).map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleAdd(card)}
                  className="rounded overflow-hidden hover:ring-2 hover:ring-yellow-400 transition"
                  title={`Add ${card.name}`}
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
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Heart size={40} className="mx-auto mb-3 text-gray-600" />
            <p className="text-lg mb-2">Your wishlist is empty</p>
            <p className="text-sm">Tap the star on a card in Search to add it here</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedItems.map(({ card, quantity, priority }) => (
              <CardTile
                key={card.id}
                card={card}
                className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg"
                fallback={
                  <div className="aspect-[5/7] flex items-center justify-center p-2 text-center text-sm text-gray-300">
                    {card.name}
                  </div>
                }
                bottomLeft={
                  hasPrice(card, 'tcgplayer') && (
                    <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow-lg">
                      ${getPrice(card, 'tcgplayer')}
                    </div>
                  )
                }
                topRight={
                  <button
                    onClick={() => handleRemove(card.id)}
                    title="Remove from wishlist"
                    aria-label="Remove from wishlist"
                    className="absolute top-1 right-1 p-2 bg-gray-900/70 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                }
                footer={
                  <div className="p-2 space-y-2">
                    {/* Quantity stepper */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(card.id, quantity - 1)}
                        disabled={quantity <= 1}
                        aria-label={`Decrease wanted copies of ${card.name}`}
                        className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700 text-white transition-colors"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="min-w-[2.5rem] text-center text-sm font-semibold text-white" aria-live="polite">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(card.id, quantity + 1)}
                        aria-label={`Increase wanted copies of ${card.name}`}
                        className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    {/* Priority pills */}
                    <div className="flex gap-1" role="group" aria-label={`Priority for ${card.name}`}>
                      {PRIORITY_OPTIONS.map(({ value, label, activeClass }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handlePriorityChange(card.id, value)}
                          aria-pressed={priority === value}
                          className={`flex-1 min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
                            priority === value ? activeClass : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
