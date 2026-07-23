import { Heart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getWishlist, addToWishlist, removeFromWishlist } from '../services/api';

interface WishlistButtonProps {
  cardId: string;
  size?: number;
  className?: string;
  /**
   * 'overlay' (default): translucent pill meant to sit on top of card art.
   * 'button': solid square action button matching the search-result controls.
   */
  variant?: 'overlay' | 'button';
}

/**
 * Heart toggle to add/remove a card from the wishlist. Drop it anywhere a card
 * is shown (`cardId` is all it needs). Stays in sync everywhere via the shared
 * ['wishlist', userId] query. Owning a card does NOT prevent wishlisting it.
 */
export default function WishlistButton({ cardId, size = 18, className = '', variant = 'overlay' }: WishlistButtonProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: wishlist } = useQuery({
    queryKey: ['wishlist', user?.id],
    enabled: !!user,
    queryFn: () => getWishlist(user!.id),
  });

  if (!user) return null;

  const inWishlist = wishlist?.includes(cardId) ?? false;

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (inWishlist) await removeFromWishlist(user.id, cardId);
      else await addToWishlist(user.id, cardId);
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    } catch {
      /* transient failure — the heart simply won't toggle */
    }
  };

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={inWishlist}
        title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
        aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
        className={`p-2.5 rounded-lg transition-colors ${
          inWishlist ? 'bg-rose-500/20 text-rose-400' : 'bg-gray-700 text-gray-300 active:bg-gray-600'
        } ${className}`}
      >
        <Heart size={size} fill={inWishlist ? 'currentColor' : 'none'} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inWishlist}
      title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      className={`p-1 rounded-full bg-black/50 hover:bg-black/70 transition-colors ${className}`}
    >
      <Heart size={size} className={inWishlist ? 'fill-rose-500 text-rose-500' : 'text-white'} />
    </button>
  );
}
