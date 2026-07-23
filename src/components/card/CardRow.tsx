import { ReactNode } from 'react';
import { Card } from '../../types';
import { isDoubleFaced, getCardArtCrop } from '../../utils/cardFaces';

interface CardRowProps {
  card: Card;
  /** Which face to show for double-faced cards (art crop + name). */
  faceIndex?: number;
  /** Click on the row body (action buttons are isolated via stopPropagation). */
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Override the displayed name (defaults to the face-aware card name). */
  name?: string;
  /** Optional line under the name (type line, condition, etc.). */
  subtitle?: ReactNode;
  /** Inline items rendered next to the price (e.g. collection count badge). */
  badges?: ReactNode;
  /** Displayed as $price when set; defaults to card.prices?.usd. */
  price?: string | null;
  /** Right-hand action buttons (clicks don't bubble to the row). */
  actions?: ReactNode;
  /** Absolutely-positioned overlay on the art (flip button etc.). */
  imageOverlay?: ReactNode;
  /** Optional warning line content (rendered in yellow under the price row). */
  warning?: ReactNode;
  /** Extra classes on the row container (hover/cursor/ring variants). */
  className?: string;
}

/**
 * Shared horizontal card row: art crop on the left, name + price in the
 * middle, optional action buttons on the right. Used by the mobile search
 * results, the deck builder card list, and anywhere else a compact
 * one-card-per-line layout is needed.
 */
export default function CardRow({
  card,
  faceIndex = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
  name,
  subtitle,
  badges,
  price,
  actions,
  imageOverlay,
  warning,
  className,
}: CardRowProps) {
  const artCrop = getCardArtCrop(card, faceIndex);
  const displayName =
    name ??
    (isDoubleFaced(card) && card.card_faces
      ? card.card_faces[faceIndex]?.name || card.name
      : card.name);
  const displayPrice = price === undefined ? card.prices?.usd : price;

  return (
    <div
      className={`flex bg-gray-800 rounded-lg overflow-hidden${className ? ` ${className}` : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Card art crop */}
      <div className="relative w-16 h-16 flex-shrink-0">
        {artCrop ? (
          <img
            src={artCrop}
            alt={displayName}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover rounded-l-lg"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 rounded-l-lg" />
        )}
        {imageOverlay}
      </div>

      {/* Info */}
      <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
        <h3 className="font-bold text-sm truncate">{displayName}</h3>
        {subtitle}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {displayPrice && <span>${displayPrice}</span>}
          {badges}
        </div>
        {warning && (
          <div className="text-xs text-yellow-400 flex items-center gap-1 mt-0.5">
            {warning}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {actions && (
        <div className="flex items-center gap-1.5 p-2" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
