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

const chunkArray = (array: string[], size: number): string[][] => {
  const chunkedArray: string[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArray.push(array.slice(i, i + size));
  }
  return chunkedArray;
};

export const getCardsByIds = async (cardIds: string[]): Promise<Card[]> => {
  const chunkedCardIds = chunkArray(cardIds, 75);
  let allCards: Card[] = [];

  for (const chunk of chunkedCardIds) {
    const response = await fetch(`${SCRYFALL_API}/cards/collection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifiers: chunk.map((id) => ({ id })),
      }),
    });

    const data = await response.json();
    allCards = allCards.concat(data.data);
  }

  return allCards;
};
