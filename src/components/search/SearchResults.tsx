import { RefreshCw, PackagePlus, Loader2, CheckCircle, Heart } from 'lucide-react';
import { Card } from '../../types';
import { isDoubleFaced } from '../../utils/cardFaces';
import MagicCard from '../MagicCard';
import CardRow from '../card/CardRow';
import CardTile from '../card/CardTile';

interface SearchResultsProps {
  results: Card[];
  wishlist: string[] | undefined;
  userCollection: Record<string, number>;
  addingCardId: string | null;
  onToggleWishlist: (cardId: string) => void;
  onAddToCollection: (cardId: string) => void;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
  /** Open the card's detail view (tap on the row/tile body). */
  onCardClick?: (card: Card) => void;
}

/** Search results: horizontal list on mobile, card grid on desktop. */
export default function SearchResults({
  results,
  wishlist,
  userCollection,
  addingCardId,
  onToggleWishlist,
  onAddToCollection,
  getCurrentFaceIndex,
  toggleCardFace,
  onCardClick,
}: SearchResultsProps) {
  return (
    <>
      {/* Mobile: Horizontal list layout */}
      <div className="flex flex-col gap-2 sm:hidden">
        {results.map((card) => {
          const currentFaceIndex = getCurrentFaceIndex(card.id);
          const isMultiFaced = isDoubleFaced(card);
          const inCollection = userCollection[card.id] ?? 0;
          const isAddingThisCard = addingCardId === card.id;

          return (
            <CardRow
              key={card.id}
              card={card}
              faceIndex={currentFaceIndex}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              className={onCardClick ? 'cursor-pointer active:bg-gray-700' : undefined}
              imageOverlay={
                isMultiFaced && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCardFace(card.id, card.card_faces!.length);
                    }}
                    className="absolute bottom-0.5 right-0.5 bg-purple-600 text-white p-2 rounded-full"
                    aria-label="Flip card"
                  >
                    <RefreshCw size={12} />
                  </button>
                )
              }
              badges={
                inCollection > 0 && (
                  <span className="text-green-400 flex items-center gap-0.5">
                    <CheckCircle size={10} />
                    x{inCollection}
                  </span>
                )
              }
              actions={
                <>
                  <button
                    onClick={() => onToggleWishlist(card.id)}
                    className={`p-2.5 rounded-lg ${
                      wishlist?.includes(card.id)
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-gray-700 text-gray-300 active:bg-gray-600'
                    }`}
                    title={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                    aria-label={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart size={18} fill={wishlist?.includes(card.id) ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={() => onAddToCollection(card.id)}
                    disabled={isAddingThisCard}
                    className="p-2.5 bg-green-600 active:bg-green-700 disabled:bg-gray-600 rounded-lg"
                    title="Add to collection"
                  >
                    {isAddingThisCard ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <PackagePlus size={18} />
                    )}
                  </button>
                </>
              }
            />
          );
        })}
      </div>

      {/* Desktop: Grid layout */}
      <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {results.map((card) => {
          const currentFaceIndex = getCurrentFaceIndex(card.id);
          const isMultiFaced = isDoubleFaced(card);
          const inCollection = userCollection[card.id] ?? 0;
          const isAddingThisCard = addingCardId === card.id;

          const displayName = isMultiFaced && card.card_faces
            ? card.card_faces[currentFaceIndex]?.name || card.name
            : card.name;

          return (
            <CardTile
              key={card.id}
              card={card}
              faceIndex={currentFaceIndex}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              className={`bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all${onCardClick ? ' cursor-pointer' : ''}`}
              fallback={<MagicCard card={card} />}
              topLeft={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWishlist(card.id);
                  }}
                  className={`absolute top-1 left-1 p-2 rounded-full shadow-lg transition-all ${
                    wishlist?.includes(card.id)
                      ? 'bg-rose-500/90 text-white'
                      : 'bg-gray-900/70 text-gray-200 hover:bg-gray-900'
                  }`}
                  title={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                  aria-label={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart size={16} fill={wishlist?.includes(card.id) ? 'currentColor' : 'none'} />
                </button>
              }
              topRight={
                inCollection > 0 && (
                  <span className="absolute top-1 right-1 text-xs bg-green-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle size={12} />
                    x{inCollection}
                  </span>
                )
              }
              bottomRight={
                isMultiFaced && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCardFace(card.id, card.card_faces!.length);
                    }}
                    className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                    title="Flip card"
                    aria-label="Flip card"
                  >
                    <RefreshCw size={16} />
                  </button>
                )
              }
              footer={
                <div className="p-3">
                  <h3 className="font-bold text-sm truncate mb-1">{displayName}</h3>
                  <p className="text-gray-400 text-xs truncate mb-2">
                    {isMultiFaced && card.card_faces
                      ? card.card_faces[currentFaceIndex]?.type_line || card.type_line
                      : card.type_line}
                  </p>
                  {card.prices?.usd && (
                    <div className="text-xs text-gray-400 mb-2">${card.prices.usd}</div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToCollection(card.id);
                    }}
                    disabled={isAddingThisCard}
                    className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm"
                    title="Add to collection"
                  >
                    {isAddingThisCard ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        <PackagePlus size={16} />
                        Add
                      </>
                    )}
                  </button>
                </div>
              }
            />
          );
        })}
      </div>
    </>
  );
}
