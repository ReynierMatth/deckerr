import { useEffect, useState } from 'react';
import { Card } from '../../types';
import { isDoubleFaced, getCardLargeImageUri } from '../../utils/cardFaces';

interface HoverCardPreviewProps {
  card: Card;
  /** Kept for API compatibility; positioning now follows the cursor. */
  hoverSource: 'search' | 'deck' | null;
  getCurrentFaceIndex: (cardId: string) => number;
}

// Rough preview size for edge-flipping / clamping (px). The card image is ~5:7.
const PREVIEW_W = 260;
const PREVIEW_H = 480;

/**
 * Presentational hover preview. Follows the cursor and flips to the opposite
 * side near a screen edge, so it never covers the row you're pointing at (the
 * deck view is now full-width, so a fixed left/right rail would overlap a
 * column). pointer-events-none so it never blocks the list underneath.
 */
export default function HoverCardPreview({
  card,
  getCurrentFaceIndex,
}: HoverCardPreviewProps) {
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  }));

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const currentFaceIndex = getCurrentFaceIndex(card.id);
  const isMultiFaced = isDoubleFaced(card);
  const currentFace = isMultiFaced && card.card_faces ? card.card_faces[currentFaceIndex] : null;

  const displayName = currentFace?.name || card.name;
  const displayTypeLine = currentFace?.type_line || card.type_line;
  const displayOracleText = currentFace?.oracle_text || card.oracle_text;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // Prefer the right of the cursor; flip left when it would run off-screen.
  const placeLeft = pos.x + 24 + PREVIEW_W > vw;
  const left = placeLeft ? Math.max(8, pos.x - 24 - PREVIEW_W) : pos.x + 24;
  const top = Math.min(Math.max(8, pos.y - PREVIEW_H / 2), Math.max(8, vh - PREVIEW_H - 8));

  return (
    <div
      className="hidden lg:block fixed z-40 pointer-events-none"
      style={{ left, top, width: PREVIEW_W }}
    >
      <div className="bg-gray-800 rounded-lg shadow-2xl p-3">
        <div className="relative">
          <img
            src={getCardLargeImageUri(card, currentFaceIndex)}
            alt={displayName}
            className="w-full h-auto rounded-lg shadow-lg"
          />
          {isMultiFaced && (
            <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
              Face {currentFaceIndex + 1}/{card.card_faces!.length}
            </div>
          )}
        </div>
        <div className="mt-2 space-y-1.5">
          <h3 className="text-base font-bold leading-tight">{displayName}</h3>
          <p className="text-xs text-gray-400">{displayTypeLine}</p>
          {displayOracleText && (
            <p className="text-xs text-gray-300 border-t border-gray-700 pt-1.5 line-clamp-6">
              {displayOracleText}
            </p>
          )}
          {card.prices?.usd && (
            <div className="text-xs text-green-400 font-semibold border-t border-gray-700 pt-1.5">
              ${card.prices.usd}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
