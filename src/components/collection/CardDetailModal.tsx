import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, RefreshCw, Minus, Plus, Trash2, Layers } from 'lucide-react';
import { Card } from '../../types';
import { getCardPriceHistory } from '../../services/api';
import { isDoubleFaced, getCardLargeImageUri } from '../../utils/cardFaces';
import { CARD_CONDITIONS } from '../../utils/collectionCsv';
import PrintingPickerModal from '../card/PrintingPickerModal';
import PriceLineChart from '../charts/PriceLineChart';
import { CollectionItem } from './types';

interface CardDetailModalProps {
  item: CollectionItem;
  isUpdating: boolean;
  onClose: () => void;
  onUpdateVariant: (card: Card, isFoil: boolean, condition: string) => void;
  onChangePrinting: (printing: Card) => void;
  onIncrementQuantity: (cardId: string, currentQuantity: number) => void;
  onDecrementQuantity: (cardId: string, currentQuantity: number) => void;
  onRequestRemove: (cardId: string, cardName: string) => void;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
}

/** Selected-card sliding panel with qty/foil/condition editing. */
export default function CardDetailModal({
  item,
  isUpdating,
  onClose,
  onUpdateVariant,
  onChangePrinting,
  onIncrementQuantity,
  onDecrementQuantity,
  onRequestRemove,
  getCurrentFaceIndex,
  toggleCardFace,
}: CardDetailModalProps) {
  const [showPrintingPicker, setShowPrintingPicker] = useState(false);

  // Only mounted while the panel is open, so this fetches on open. If the
  // table has no rows (or the query errors), the empty state renders instead.
  const { data: priceHistory } = useQuery({
    queryKey: ['cardPriceHistory', item.card.id],
    queryFn: () => getCardPriceHistory(item.card.id),
  });
  // Chart the series matching this copy's foil flag (foil falls back to
  // non-foil when Scryfall has no foil price for a given day).
  const pricePoints = (priceHistory ?? []).flatMap((p) => {
    const value = item.isFoil ? p.usdFoil ?? p.usd : p.usd;
    return value === null ? [] : [{ date: p.date, value }];
  });
  const priceDelta =
    pricePoints.length >= 2 ? pricePoints[pricePoints.length - 1].value - pricePoints[0].value : 0;

  const currentFaceIndex = getCurrentFaceIndex(item.card.id);
  const isMultiFaced = isDoubleFaced(item.card);
  const currentFace = isMultiFaced && item.card.card_faces
    ? item.card.card_faces[currentFaceIndex]
    : null;

  const displayName = currentFace?.name || item.card.name;
  const displayTypeLine = currentFace?.type_line || item.card.type_line;
  const displayOracleText = currentFace?.oracle_text || item.card.oracle_text;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[110] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sliding Panel */}
      <div className="fixed top-0 right-0 h-full w-full md:w-96 bg-gray-800 shadow-2xl z-[120] overflow-y-auto animate-slide-in-right">
        {/* Close button - fixed position, stays visible when scrolling
            (hidden while the printing picker is open so it can't float above it) */}
        {!showPrintingPicker && (
          <button
            onClick={onClose}
            className="fixed top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white p-2 md:p-1.5 rounded-full transition-colors z-[130] shadow-lg"
            aria-label="Close"
          >
            <X size={24} className="md:w-5 md:h-5" />
          </button>
        )}

        <div className="p-4 sm:p-6">

          {/* Card Image */}
          <div className="relative mb-4 max-w-sm mx-auto">
            <img
              src={getCardLargeImageUri(item.card, currentFaceIndex)}
              alt={displayName}
              className="w-full h-auto rounded-lg shadow-lg"
            />
            {isMultiFaced && (
              <>
                <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  Face {currentFaceIndex + 1}/{item.card.card_faces!.length}
                </div>
                <button
                  onClick={() => toggleCardFace(item.card.id, item.card.card_faces!.length)}
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

            {item.card.prices?.usd && (
              <div className="border-t border-gray-700 pt-3">
                <div className="text-lg text-green-400 font-semibold">
                  ${item.card.prices.usd} each
                </div>
                <div className="text-sm text-gray-400">
                  Total value: ${(parseFloat(item.card.prices.usd) * item.quantity).toFixed(2)}
                </div>
              </div>
            )}

            {/* Printing / edition */}
            <div className="border-t border-gray-700 pt-3">
              {item.card.set_name && (
                <div className="text-sm text-gray-400 mb-2">
                  {item.card.set_name}
                  {item.card.set && <span className="uppercase"> ({item.card.set})</span>}
                  {item.card.collector_number && <span> #{item.card.collector_number}</span>}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowPrintingPicker(true)}
                disabled={isUpdating}
                className="w-full min-h-[44px] px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Layers size={18} />
                Change printing
              </button>
            </div>

            {/* Price history */}
            <div className="border-t border-gray-700 pt-3">
              {pricePoints.length >= 2 ? (
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs text-gray-400">
                      Price history{item.isFoil ? ' (foil)' : ''}
                    </span>
                    <span className={`text-xs font-semibold ${priceDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {priceDelta >= 0 ? '+' : '−'}${Math.abs(priceDelta).toFixed(2)}
                    </span>
                  </div>
                  <PriceLineChart
                    points={pricePoints}
                    ariaLabel={`Price history for ${item.card.name}`}
                  />
                </div>
              ) : (
                <div>
                  <span className="text-xs text-gray-400 block mb-1">Price history</span>
                  <p className="text-xs text-gray-500">
                    No history yet — prices are recorded on each refresh.
                  </p>
                </div>
              )}
            </div>

            {/* Foil & Condition */}
            <div className="border-t border-gray-700 pt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Foil</div>
                  <div className="text-xs text-gray-400">
                    {item.isFoil ? 'This copy is foil' : 'This copy is non-foil'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.isFoil}
                  disabled={isUpdating}
                  onClick={() => onUpdateVariant(item.card, !item.isFoil, item.condition)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    item.isFoil ? 'bg-fuchsia-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      item.isFoil ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label htmlFor="collection-condition" className="block text-sm font-semibold text-white mb-1">
                  Condition
                </label>
                <select
                  id="collection-condition"
                  value={item.condition}
                  disabled={isUpdating}
                  onChange={(e) => onUpdateVariant(item.card, item.isFoil, e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                >
                  <option value="">—</option>
                  {CARD_CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantity Management */}
            <div className="border-t border-gray-700 pt-3">
              <h3 className="text-lg font-semibold mb-3">Quantity in Collection</h3>
              <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
                <button
                  onClick={() => onDecrementQuantity(item.card.id, item.quantity)}
                  disabled={isUpdating || item.quantity === 0}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                >
                  <Minus size={20} />
                </button>

                <div className="text-center">
                  <div className="text-3xl font-bold">{item.quantity}</div>
                  <div className="text-xs text-gray-400">copies</div>
                </div>

                <button
                  onClick={() => onIncrementQuantity(item.card.id, item.quantity)}
                  disabled={isUpdating}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* Remove from collection button */}
              <button
                onClick={() => onRequestRemove(item.card.id, displayName)}
                disabled={isUpdating}
                className="w-full mt-3 min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={20} />
                Remove from Collection
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printing/edition picker (drawer on mobile) */}
      <PrintingPickerModal
        card={item.card}
        isOpen={showPrintingPicker}
        onClose={() => setShowPrintingPicker(false)}
        onSelect={onChangePrinting}
      />
    </>
  );
}
