import { ReactNode } from 'react';
import { Card } from '../../types';
import { isDoubleFaced, getCardImageSmall, getCardImageUri } from '../../utils/cardFaces';

interface CardTileProps {
  card: Card;
  /** Which face to show for double-faced cards (image + name). */
  faceIndex?: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /**
   * Overlay slots rendered on top of the card image. Each node positions
   * itself (e.g. `absolute top-1 left-1 ...`) so consumers keep exact control
   * over offsets, stacking and hit areas.
   */
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  /** 'small' uses the 146px thumbnail, 'normal' (default) the full-size image. */
  imageSize?: 'small' | 'normal';
  /** Content rendered under the image (name line, buttons, ...). */
  footer?: ReactNode;
  /** Rendered instead of the image when no image URI exists. */
  fallback?: ReactNode;
  /** Classes on the outer container (bg, rounding, hover ring, cursor, ...). */
  className?: string;
  /** Extra classes on the relative image wrapper (rounding/shadow/ring). */
  imageWrapperClassName?: string;
}

/**
 * Shared grid tile: full card image with absolutely-positioned overlay badges
 * and an optional footer. Used by the collection grid, the desktop search
 * results, the wishlist, and trade card grids.
 */
export default function CardTile({
  card,
  faceIndex = 0,
  onClick,
  onMouseEnter,
  onMouseLeave,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  imageSize = 'normal',
  footer,
  fallback,
  className,
  imageWrapperClassName,
}: CardTileProps) {
  const imageUri =
    imageSize === 'small' ? getCardImageSmall(card, faceIndex) : getCardImageUri(card, faceIndex);
  const displayName =
    isDoubleFaced(card) && card.card_faces
      ? card.card_faces[faceIndex]?.name || card.name
      : card.name;

  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={`relative${imageWrapperClassName ? ` ${imageWrapperClassName}` : ''}`}>
        {imageUri ? (
          <img
            src={imageUri}
            alt={displayName}
            loading="lazy"
            decoding="async"
            className="w-full h-auto"
          />
        ) : (
          fallback ?? (
            <div className="aspect-[5/7] bg-gray-700 flex items-center justify-center p-2 text-center text-sm text-gray-300">
              {displayName}
            </div>
          )
        )}
        {topLeft}
        {topRight}
        {bottomLeft}
        {bottomRight}
      </div>
      {footer}
    </div>
  );
}
