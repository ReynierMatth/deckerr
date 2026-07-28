export interface User {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  handle?: string | null;
  themeColor: 'red' | 'green' | 'blue' | 'yellow' | 'grey' | 'purple';
}

// The app's card model is now the game-neutral `UnifiedCard`. `Card` is kept as
// an alias so existing imports keep working; read cards through the domain
// accessors (`src/cards/domain/accessors/*`), not raw provider fields.
import type { UnifiedCard } from '../cards/domain/UnifiedCard';
import type { GameId } from '../cards/domain/game';
export type { UnifiedCard } from '../cards/domain/UnifiedCard';
export type { GameId } from '../cards/domain/game';
export type Card = UnifiedCard;

export interface Collection {
  id: string;
  user_id: string;
  card_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  name: string;
  /** Which TCG this deck belongs to (a deck is single-game). */
  game: GameId;
  format: string;
  cards: { card: Card; quantity: number, is_commander: boolean, is_sideboard: boolean }[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  coverCardId?: string;
  coverCard?: Card | null;
  validationErrors?: string[];
  isValid?: boolean;
  cardCount?: number;
  tags?: string[];
  /** private = owner only; unlisted = link only; public = link + Discover. */
  visibility?: DeckVisibility;
  /** Derived (visibility != 'private'); kept for the link/anon RLS. */
  isPublic?: boolean;
}

export type DeckVisibility = 'private' | 'unlisted' | 'public';

export interface CardEntity {
  id: string;
  deck_id: string;
  card_id: string;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
}
