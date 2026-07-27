import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Card } from '../../types';
import Modal from '../Modal';
import { isDoubleFaced, getCardLargeImageUri } from '../../utils/cardFaces';

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

  // Reset the shown face whenever the card changes.
  useEffect(() => {
    setFaceIndex(0);
  }, [card?.id]);

  const isMultiFaced = card ? isDoubleFaced(card) : false;
  const face = isMultiFaced && card?.card_faces ? card.card_faces[faceIndex] : null;
  const name = face?.name || card?.name || '';
  const typeLine = face?.type_line || card?.type_line;
  const oracle = face?.oracle_text || card?.oracle_text;

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
            {isMultiFaced && card.card_faces && (
              <>
                <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  Face {faceIndex + 1}/{card.card_faces.length}
                </div>
                <button
                  onClick={() => setFaceIndex((i) => (i + 1) % card.card_faces!.length)}
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
            {(card.set_name || card.set) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {card.set_name}
                {card.set ? ` · ${card.set.toUpperCase()}` : ''}
                {card.collector_number ? ` · #${card.collector_number}` : ''}
              </p>
            )}
          </div>

          {oracle && (
            <p className="text-sm text-gray-300 whitespace-pre-line border-t border-gray-700 pt-3">{oracle}</p>
          )}

          {(card.prices?.usd || card.prices?.eur) && (
            <div className="flex gap-4 border-t border-gray-700 pt-3 text-sm">
              {card.prices?.usd && <span className="text-green-400 font-semibold">${card.prices.usd}</span>}
              {card.prices?.eur && <span className="text-green-400 font-semibold">{card.prices.eur} €</span>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
