import { Card } from '../../types';

export interface CollectionItem {
  card: Card;
  quantity: number;
}

export interface SelectedCard {
  card: Card;
  quantity: number;
  maxQuantity: number;
}
