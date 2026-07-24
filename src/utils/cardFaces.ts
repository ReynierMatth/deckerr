import { Card } from '../types';

// Scryfall layouts that actually have a distinct, flippable back face.
const BACK_FACE_LAYOUTS = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];

/** True when a card has a real, toggleable back face. */
export const isDoubleFaced = (card: Card): boolean =>
  Boolean(card.card_faces && card.card_faces.length > 1 && BACK_FACE_LAYOUTS.includes(card.layout ?? ''));

/** Normal-size image URI for the given face (falls back gracefully). */
export const getCardImageUri = (card: Card, faceIndex = 0): string | undefined => {
  if (isDoubleFaced(card) && card.card_faces) {
    return card.card_faces[faceIndex]?.image_uris?.normal ?? card.card_faces[faceIndex]?.image_uris?.small;
  }
  return card.image_uris?.normal ?? card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.normal;
};

/** Small (146px) image URI for dense thumbnail grids (falls back gracefully). */
export const getCardImageSmall = (card: Card, faceIndex = 0): string | undefined => {
  if (isDoubleFaced(card) && card.card_faces) {
    return card.card_faces[faceIndex]?.image_uris?.small ?? card.card_faces[faceIndex]?.image_uris?.normal;
  }
  return card.image_uris?.small ?? card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.small;
};

/** Large image URI for hover previews and detail panels (falls back gracefully). */
export const getCardLargeImageUri = (card: Card, faceIndex = 0): string | undefined => {
  if (isDoubleFaced(card) && card.card_faces) {
    return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
  }
  return card.image_uris?.large || card.image_uris?.normal;
};

/** Art-crop image URI for the given face (falls back gracefully). */
export const getCardArtCrop = (card: Card, faceIndex = 0): string | undefined => {
  if (isDoubleFaced(card) && card.card_faces) {
    return card.card_faces[faceIndex]?.image_uris?.art_crop ?? card.card_faces[faceIndex]?.image_uris?.normal;
  }
  return card.image_uris?.art_crop ?? card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.art_crop;
};
