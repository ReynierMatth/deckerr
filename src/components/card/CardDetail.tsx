import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Card } from '../../types';
import Modal from '../Modal';
import { isDoubleFaced, getCardLargeImageUri } from '../../utils/cardFaces';
import { getPrice, hasPrice } from '../../cards/domain/accessors/price';
import { isPokemon } from '../../cards/domain/UnifiedCard';
import { usePriceSource } from '../../contexts/PriceSourceContext';
import PokemonCardInfo from './PokemonCardInfo';

interface CardDetailProps {
  /** Card to show; null closes the drawer. */
  card: Card | null;
  onClose: () => void;
}

/**
 * Generic read-only card detail, shown in the shared Modal (bottom-sheet drawer
 * on mobile, dialog on desktop — so it gets swipe-to-close and Back-to-close for
 * free). Reachable from search results and the scanner basket. For a plain Card,
 * not a collection/deck item; the richer collection/deck panels stay as-is.
 */
export default function CardDetail({ card, onClose }: CardDetailProps) {
  const [faceIndex, setFaceIndex] = useState(0);
  const { source } = usePriceSource();

  // Reset the shown face whenever the card changes.
  useEffect(() => {
    setFaceIndex(0);
  }, [card?.id]);

  const isMultiFaced = card ? isDoubleFaced(card) : false;
  const face = isMultiFaced && card?.faces ? card.faces[faceIndex] : null;
  const name = face?.name || card?.name || '';
  const typeLine = face?.typeLine || card?.mtg?.typeLine;
  const oracle = face?.text || card?.mtg?.oracleText;

  return (
    <Modal isOpen={card !== null} onClose={onClose} size="md" labelledBy="card-detail-title">
      {card && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="relative max-w-xs mx-auto">
            <img
              src={getCardLargeImageUri(card, faceIndex)}
              alt={name}
              className="w-full h-auto rounded-xl shadow-lg"
            />
            {isMultiFaced && card.faces && (
              <>
                <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  Face {faceIndex + 1}/{card.faces.length}
                </div>
                <button
                  onClick={() => setFaceIndex((i) => (i + 1) % card.faces!.length)}
                  className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg"
                  title="Retourner la carte"
                  aria-label="Retourner la carte"
                >
                  <RefreshCw size={20} />
                </button>
              </>
            )}
          </div>

          <div>
            <h2 id="card-detail-title" className="text-xl font-bold text-white">{name}</h2>
            {typeLine && <p className="text-sm text-gray-400">{typeLine}</p>}
            {(card.setName || card.setCode) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {card.setName}
                {card.setCode ? ` · ${card.setCode.toUpperCase()}` : ''}
                {card.collectorNumber ? ` · #${card.collectorNumber}` : ''}
              </p>
            )}
          </div>

          {oracle && (
            <p className="text-sm text-gray-300 whitespace-pre-line border-t border-gray-700 pt-3">{oracle}</p>
          )}

          {isPokemon(card) && (
            <div className="border-t border-gray-700 pt-3">
              <PokemonCardInfo card={card} />
            </div>
          )}

          {(hasPrice(card, source) || hasPrice(card, 'cardmarket')) && (
            <div className="flex gap-4 border-t border-gray-700 pt-3 text-sm">
              {hasPrice(card, source) && <span className="text-green-400 font-semibold">${getPrice(card, source).toFixed(2)}</span>}
              {hasPrice(card, 'cardmarket') && <span className="text-green-400 font-semibold">{getPrice(card, 'cardmarket').toFixed(2)} €</span>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
