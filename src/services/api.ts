import { Card } from '../types';

const SCRYFALL_API = 'https://api.scryfall.com';

export const searchCards = async (query: string): Promise<Card[]> => {
  const response = await fetch(`${SCRYFALL_API}/cards/search?q=${query}`);
  const data = await response.json();
  return data.data;
};

export const getRandomCards = async (count: number = 10): Promise<Card[]> => {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const response = await fetch(`${SCRYFALL_API}/cards/random`);
    const card = await response.json();
    cards.push(card);
  }
  return cards;
};

export const getCardById = async (cardId: string): Promise<Card> => {
  const response = await fetch(`${SCRYFALL_API}/cards/${cardId}`);
  return await response.json();
};

export const getCardsByIds = async (cardIds: string[]): Promise<Card[]> => {
  const response = await fetch(`${SCRYFALL_API}/cards/collection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifiers: cardIds.map((id) => ({ id })),
    }),
  });

  const data = await response.json();
  return data.data;
};
