export interface User {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  handle?: string | null;
  themeColor: 'red' | 'green' | 'blue' | 'yellow' | 'grey' | 'purple';
}

export interface CardImageUris {
  small?: string;
  normal?: string;
  large?: string;
  art_crop?: string;
  border_crop?: string;
  png?: string;
}

export interface CardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  colors?: string[];
  image_uris?: CardImageUris;
}

export interface Card {
  id: string;
  name: string;
  layout?: string;
  image_uris?: CardImageUris;
  card_faces?: CardFace[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  colors?: string[];
  color_identity?: string[];
  set?: string;
  set_name?: string;
  rarity?: string;
  collector_number?: string;
  lang?: string;
  artist?: string;
  /** Scryfall search URI listing every printing of this card. */
  prints_search_uri?: string;
  prices?: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
  };
}

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
