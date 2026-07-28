/**
 * Image accessors over UnifiedCard — the game-neutral replacement for
 * `src/utils/cardFaces.ts`. `faces` carries >1 entry only for genuinely
 * double-faced cards (mapper contract), so `isDoubleFaced` relies on its length.
 */

import { UnifiedCard, UnifiedImages } from '../UnifiedCard';

/** True when a card has a real, toggleable back face. */
export const isDoubleFaced = (card: UnifiedCard): boolean =>
  Boolean(card.faces && card.faces.length > 1);

/** All faces to render (front-only cards yield an empty list). */
export const facesOf = (card: UnifiedCard) => card.faces ?? [];

const faceImages = (card: UnifiedCard, faceIndex: number): UnifiedImages | undefined =>
  isDoubleFaced(card) ? card.faces?.[faceIndex]?.images : undefined;

/** Normal-size image URI for the given face (falls back gracefully). */
export const getImage = (card: UnifiedCard, faceIndex = 0): string | undefined => {
  const f = faceImages(card, faceIndex);
  if (f) return f.normal ?? f.small;
  return card.images?.normal ?? card.images?.small ?? card.faces?.[0]?.images?.normal;
};

/** Small (thumbnail) image URI for dense grids (falls back gracefully). */
export const getImageSmall = (card: UnifiedCard, faceIndex = 0): string | undefined => {
  const f = faceImages(card, faceIndex);
  if (f) return f.small ?? f.normal;
  return card.images?.small ?? card.images?.normal ?? card.faces?.[0]?.images?.small;
};

/** Large image URI for hover previews and detail panels (falls back gracefully). */
export const getLargeImage = (card: UnifiedCard, faceIndex = 0): string | undefined => {
  const f = faceImages(card, faceIndex);
  if (f) return f.large || f.normal;
  return card.images?.large || card.images?.normal;
};

/** Art-crop image URI for the given face (falls back gracefully). */
export const getArtCrop = (card: UnifiedCard, faceIndex = 0): string | undefined => {
  const f = faceImages(card, faceIndex);
  if (f) return f.artCrop ?? f.normal;
  return card.images?.artCrop ?? card.images?.normal ?? card.faces?.[0]?.images?.artCrop;
};
