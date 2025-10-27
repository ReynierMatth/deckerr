export interface User {
  id: string;
  email: string;
  username: string;
  themeColor: 'red' | 'green' | 'blue' | 'yellow' | 'grey' | 'purple';
}

export interface Card {
  id: string;
  name: string;
  image_uris?: {
    normal: string;
    art_crop: string;
  };
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
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
  cards: { card: Card; quantity: number, is_commander: boolean }[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardEntity {
  id: string;
  deck_id: string;
  card_id: string;
  quantity: number;
  is_commander: boolean;
}
