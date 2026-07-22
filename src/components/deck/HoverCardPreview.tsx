import { Card } from '../../types';
import { isDoubleFaced } from '../../utils/cardFaces';

interface HoverCardPreviewProps {
  card: Card;
  hoverSource: 'search' | 'deck' | null;
  getCurrentFaceIndex: (cardId: string) => number;
  getLargeImageUri: (card: Card, faceIndex?: number) => string | undefined;
}

/**
 * Presentational hover preview shown next to the search/deck lists. Rendering is
 * gated by the parent ("only show if no card is selected"); this component just
 * draws the hovered card.
 */
export default function HoverCardPreview({
  card,
  hoverSource,
  getCurrentFaceIndex,
  getLargeImageUri,
}: HoverCardPreviewProps) {
  const currentFaceIndex = getCurrentFaceIndex(card.id);
  const isMultiFaced = isDoubleFaced(card);
  const currentFace = isMultiFaced && card.card_faces
    ? card.card_faces[currentFaceIndex]
    : null;

  const displayName = currentFace?.name || card.name;
  const displayTypeLine = currentFace?.type_line || card.type_line;
  const displayOracleText = currentFace?.oracle_text || card.oracle_text;

  // Position preview based on hover source
  const positionClass = hoverSource === 'deck' ? 'left-8' : 'right-8';

  return (
    <div className={`hidden lg:block fixed top-1/2 ${positionClass} transform -translate-y-1/2 z-30 pointer-events-none`}>
      <div className="bg-gray-800 rounded-lg shadow-2xl p-4 max-w-md">
        <div className="relative">
          <img
            src={getLargeImageUri(card, currentFaceIndex)}
            alt={displayName}
            className="w-full h-auto rounded-lg shadow-lg"
          />
          {isMultiFaced && (
            <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
              Face {currentFaceIndex + 1}/{card.card_faces!.length}
            </div>
          )}
        </div>
        <div className="mt-3 space-y-2">
          <h3 className="text-xl font-bold">{displayName}</h3>
          <p className="text-sm text-gray-400">{displayTypeLine}</p>
          {displayOracleText && (
            <p className="text-sm text-gray-300 border-t border-gray-700 pt-2">
              {displayOracleText}
            </p>
          )}
          {card.prices?.usd && (
            <div className="text-sm text-green-400 font-semibold border-t border-gray-700 pt-2">
              ${card.prices.usd}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
