import { Star } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getWishlist, addToWishlist, removeFromWishlist } from '../services/api';

interface WishlistButtonProps {
  cardId: string;
  size?: number;
  className?: string;
}

/**
 * Star toggle to add/remove a card from the wishlist. Drop it anywhere a card
 * is shown (`cardId` is all it needs). Stays in sync everywhere via the shared
 * ['wishlist', userId] query. Owning a card does NOT prevent wishlisting it.
 */
export default function WishlistButton({ cardId, size = 18, className = '' }: WishlistButtonProps) {
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
      /* transient failure — the star simply won't toggle */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inWishlist}
      title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      className={`p-1 rounded-full bg-black/50 hover:bg-black/70 transition-colors ${className}`}
    >
      <Star size={size} className={inWishlist ? 'fill-yellow-400 text-yellow-400' : 'text-white'} />
    </button>
  );
}
