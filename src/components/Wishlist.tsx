import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Star, Trash2 } from 'lucide-react';
import { Card } from '../types';
import { getWishlist, getCardsByIds, removeFromWishlist } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getCardImageUri } from '../utils/cardFaces';

export default function Wishlist() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: cards = [], isLoading } = useQuery<Card[]>({
    queryKey: ['wishlist', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const ids = [...(await getWishlist(user!.id))];
      return ids.length ? await getCardsByIds(ids) : [];
    },
  });

  const handleRemove = async (cardId: string) => {
    if (!user) return;
    try {
      await removeFromWishlist(user.id, cardId);
      await queryClient.invalidateQueries({ queryKey: ['wishlist', user.id] });
      toast.success('Removed from wishlist');
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      toast.error('Failed to remove from wishlist');
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">
          My Wishlist ({cards.length})
        </h1>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Star size={40} className="mx-auto mb-3 text-gray-600" />
            <p className="text-lg mb-2">Your wishlist is empty</p>
            <p className="text-sm">Tap the star on a card in Search to add it here</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {cards.map((card) => {
              const imageUri = getCardImageUri(card);
              return (
                <div
                  key={card.id}
                  className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg"
                >
                  {imageUri ? (
                    <img src={imageUri} alt={card.name} className="w-full h-auto" />
                  ) : (
                    <div className="aspect-[5/7] flex items-center justify-center p-2 text-center text-sm text-gray-300">
                      {card.name}
                    </div>
                  )}

                  {card.prices?.usd && (
                    <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow-lg">
                      ${card.prices.usd}
                    </div>
                  )}

                  <button
                    onClick={() => handleRemove(card.id)}
                    title="Remove from wishlist"
                    aria-label="Remove from wishlist"
                    className="absolute top-1 right-1 p-2 bg-gray-900/70 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
