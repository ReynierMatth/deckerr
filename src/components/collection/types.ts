import { Card } from '../../types';

export interface CollectionItem {
  card: Card;
  quantity: number;
  isFoil: boolean;
  /** One of CARD_CONDITIONS, or '' when unset. */
  condition: string;
}
