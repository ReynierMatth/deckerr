import { useEffect, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Card } from '../../types';
import { isDoubleFaced } from '../../utils/cardFaces';
import CardTile from '../card/CardTile';
import WishlistButton from '../WishlistButton';
import { CollectionItem } from './types';

interface CollectionGridProps {
  items: CollectionItem[];
  isLoading: boolean;
  searchQuery: string;
  totalCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onHoverCard: (card: Card | null) => void;
  onSelectCard: (item: CollectionItem) => void;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
}

/** The CardTile grid with its loading/empty states and infinite-scroll sentinel. */
export default function CollectionGrid({
  items,
  isLoading,
  searchQuery,
  totalCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onHoverCard,
  onSelectCard,
  getCurrentFaceIndex,
  toggleCardFace,
}: CollectionGridProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-blue-500" size={48} />
        </div>
      ) : items.length === 0 ? (
        searchQuery.trim() ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">No cards found</p>
            <p className="text-sm">Try a different search term</p>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">Your collection is empty</p>
            <p className="text-sm">Add cards from the Deck Manager to build your collection</p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-2">
          {items.map((item) => {
            const { card, quantity, isFoil } = item;
            const currentFaceIndex = getCurrentFaceIndex(card.id);
            const isMultiFaced = isDoubleFaced(card);
            const displayName = isMultiFaced && card.card_faces
              ? card.card_faces[currentFaceIndex]?.name || card.name
              : card.name;

            return (
              <CardTile
                key={card.id}
                card={card}
                faceIndex={currentFaceIndex}
                imageSize="small"
                className="relative group cursor-pointer"
                imageWrapperClassName="rounded-lg overflow-hidden shadow-lg transition-all group-hover:ring-2 group-hover:ring-blue-500"
                onMouseEnter={() => onHoverCard(card)}
                onMouseLeave={() => onHoverCard(null)}
                onClick={() => onSelectCard(item)}
                topLeft={<WishlistButton cardId={card.id} className="absolute top-1 left-1" size={16} />}
                topRight={
                  <>
                    {/* Quantity badge */}
                    <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded-full shadow-lg">
                      x{quantity}
                    </div>
                    {/* Foil badge */}
                    {isFoil && (
                      <div className="absolute top-8 right-1 bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg">
                        FOIL
                      </div>
                    )}
                  </>
                }
                bottomLeft={
                  card.prices?.usd && (
                    <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow-lg">
                      ${card.prices.usd}
                    </div>
                  )
                }
                bottomRight={
                  isMultiFaced && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCardFace(card.id, card.card_faces!.length);
                      }}
                      className="absolute bottom-1 right-1 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                      title="Flip card"
                      aria-label="Flip card"
                    >
                      <RefreshCw size={12} />
                    </button>
                  )
                }
                footer={
                  <div className="mt-1 text-xs text-center truncate px-1">
                    {displayName}
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {/* Infinite scroll loading indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      )}

      {/* Observer target for infinite scroll */}
      {hasMore && !isLoadingMore && (
        <div ref={observerTarget} className="h-20" />
      )}

      {/* End of collection indicator */}
      {!hasMore && items.length > 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? `End of results • ${totalCount} matching card(s)` : `End of collection • ${totalCount} total cards`}
        </div>
      )}
    </>
  );
}
