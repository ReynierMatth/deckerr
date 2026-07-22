import { CheckCircle, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { Card } from '../../types';
import { isDoubleFaced } from '../../utils/cardFaces';

interface CardDetailPanelProps {
  card: Card;
  quantityInDeck: number;
  inDeck: boolean;
  collectionQuantity: number | undefined;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
  getLargeImageUri: (card: Card, faceIndex?: number) => string | undefined;
  onClose: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * Presentational slide-in detail panel for a single card. Rendering is gated by
 * the parent (only mounted when a card is selected); this component draws the
 * backdrop + sliding panel and delegates all mutations back through callbacks.
 */
export default function CardDetailPanel({
  card,
  quantityInDeck,
  inDeck,
  collectionQuantity,
  getCurrentFaceIndex,
  toggleCardFace,
  getLargeImageUri,
  onClose,
  onIncrement,
  onDecrement,
}: CardDetailPanelProps) {
  const currentFaceIndex = getCurrentFaceIndex(card.id);
  const isMultiFaced = isDoubleFaced(card);
  const currentFace = isMultiFaced && card.card_faces
    ? card.card_faces[currentFaceIndex]
    : null;

  const displayName = currentFace?.name || card.name;
  const displayTypeLine = currentFace?.type_line || card.type_line;
  const displayOracleText = currentFace?.oracle_text || card.oracle_text;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[110] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sliding Panel */}
      <div className="fixed top-0 right-0 h-full w-full md:w-96 bg-gray-800 shadow-2xl z-[120] overflow-y-auto animate-slide-in-right">
        {/* Close button */}
        <button
          onClick={onClose}
          className="fixed top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white p-2 md:p-1.5 rounded-full transition-colors z-[130] shadow-lg"
          aria-label="Close"
        >
          <X size={24} className="md:w-5 md:h-5" />
        </button>

        <div className="p-4 sm:p-6">
          {/* Card Image */}
          <div className="relative mb-4 max-w-sm mx-auto">
            <img
              src={getLargeImageUri(card, currentFaceIndex)}
              alt={displayName}
              className="w-full h-auto rounded-lg shadow-lg"
            />
            {isMultiFaced && (
              <>
                <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  Face {currentFaceIndex + 1}/{card.card_faces!.length}
                </div>
                <button
                  onClick={() => toggleCardFace(card.id, card.card_faces!.length)}
                  className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                  title="Flip card"
                >
                  <RefreshCw size={20} />
                </button>
              </>
            )}
          </div>

          {/* Card Info */}
          <div className="space-y-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{displayName}</h2>
              <p className="text-xs sm:text-sm text-gray-400">{displayTypeLine}</p>
            </div>

            {displayOracleText && (
              <div className="border-t border-gray-700 pt-3">
                <p className="text-sm text-gray-300">{displayOracleText}</p>
              </div>
            )}

            {card.prices?.usd && (
              <div className="border-t border-gray-700 pt-3">
                <div className="text-lg text-green-400 font-semibold">
                  ${card.prices.usd} each
                </div>
              </div>
            )}

            {/* Collection Status */}
            {collectionQuantity !== undefined && (
              <div className="border-t border-gray-700 pt-3">
                <div className="text-sm text-green-400">
                  <CheckCircle size={16} className="inline mr-1" />
                  x{collectionQuantity} in your collection
                </div>
              </div>
            )}

            {/* Deck Quantity Management */}
            <div className="border-t border-gray-700 pt-3">
              <h3 className="text-lg font-semibold mb-3">Quantity in Deck</h3>
              <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
                <button
                  onClick={onDecrement}
                  disabled={!inDeck}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                >
                  <Minus size={20} />
                </button>

                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {quantityInDeck}
                  </div>
                  <div className="text-xs text-gray-400">copies</div>
                </div>

                <button
                  onClick={onIncrement}
                  className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
