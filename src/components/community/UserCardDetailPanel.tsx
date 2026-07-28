import { X, RefreshCw } from 'lucide-react';
import { Card } from '../../types';
import { isDoubleFaced, getCardLargeImageUri } from '../../utils/cardFaces';
import { getPrice, hasPrice } from '../../cards/domain/accessors/price';
import { usePriceSource } from '../../contexts/PriceSourceContext';

interface UserCardDetailPanelProps {
  card: Card;
  quantity: number;
  onClose: () => void;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
}

/** Read-only sliding detail panel for a card in someone else's collection. */
export default function UserCardDetailPanel({
  card,
  quantity,
  onClose,
  getCurrentFaceIndex,
  toggleCardFace,
}: UserCardDetailPanelProps) {
  const { source } = usePriceSource();
  const currentFaceIndex = getCurrentFaceIndex(card.id);
  const isMultiFaced = isDoubleFaced(card);
  const currentFace = isMultiFaced && card.faces
    ? card.faces[currentFaceIndex]
    : null;

  const displayName = currentFace?.name || card.name;
  const displayTypeLine = currentFace?.typeLine || card.mtg?.typeLine;
  const displayOracleText = currentFace?.text || card.mtg?.oracleText;

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
              src={getCardLargeImageUri(card, currentFaceIndex)}
              alt={displayName}
              className="w-full h-auto rounded-lg shadow-lg"
            />
            {isMultiFaced && (
              <>
                <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  Face {currentFaceIndex + 1}/{card.faces!.length}
                </div>
                <button
                  onClick={() => toggleCardFace(card.id, card.faces!.length)}
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

            {hasPrice(card, source) && (
              <div className="border-t border-gray-700 pt-3">
                <div className="text-lg text-green-400 font-semibold">
                  ${getPrice(card, source)} each
                </div>
                <div className="text-sm text-gray-400">
                  Total value: ${(getPrice(card, source) * quantity).toFixed(2)}
                </div>
              </div>
            )}

            {/* Quantity Display */}
            <div className="border-t border-gray-700 pt-3">
              <h3 className="text-lg font-semibold mb-3">Quantity in Collection</h3>
              <div className="flex items-center justify-center bg-gray-900 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">{quantity}</div>
                  <div className="text-xs text-gray-400">copies</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
