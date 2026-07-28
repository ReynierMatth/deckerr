/**
 * Back-compat re-export. The face/image logic now lives in the game-neutral
 * domain accessors (`src/cards/domain/accessors/image.ts`); this module keeps
 * the historical names so existing imports keep working.
 */

export {
  isDoubleFaced,
  facesOf,
  getImage as getCardImageUri,
  getImageSmall as getCardImageSmall,
  getLargeImage as getCardLargeImageUri,
  getArtCrop as getCardArtCrop,
} from '../cards/domain/accessors/image';
