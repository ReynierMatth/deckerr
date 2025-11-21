import { Card } from '../types';
import { supabase } from '../lib/supabase';

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

// Collection API functions
export const getUserCollection = async (userId: string): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from('collections')
    .select('card_id, quantity')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user collection:', error);
    throw error;
  }

  // Create a map of card_id to quantity for easy lookup
  const collectionMap = new Map<string, number>();
  data?.forEach((item) => {
    collectionMap.set(item.card_id, item.quantity);
  });

  return collectionMap;
};

export const addCardToCollection = async (
  userId: string,
  cardId: string,
  quantity: number = 1
): Promise<void> => {
  // Check if card already exists in collection
  const { data: existing, error: fetchError } = await supabase
    .from('collections')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 is "not found" error, which is expected for new cards
    throw fetchError;
  }

  if (existing) {
    // Update existing card quantity
    const { error: updateError } = await supabase
      .from('collections')
      .update({
        quantity: existing.quantity + quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (updateError) throw updateError;
  } else {
    // Insert new card
    const { error: insertError } = await supabase
      .from('collections')
      .insert({
        user_id: userId,
        card_id: cardId,
        quantity: quantity,
      });

    if (insertError) throw insertError;
  }
};

export const addMultipleCardsToCollection = async (
  userId: string,
  cards: { cardId: string; quantity: number }[]
): Promise<void> => {
  // Fetch existing cards in collection
  const cardIds = cards.map(c => c.cardId);
  const { data: existingCards, error: fetchError } = await supabase
    .from('collections')
    .select('card_id, quantity, id')
    .eq('user_id', userId)
    .in('card_id', cardIds);

  if (fetchError) throw fetchError;

  const existingMap = new Map<string, { id: string; quantity: number }>();
  existingCards?.forEach((item) => {
    existingMap.set(item.card_id, { id: item.id, quantity: item.quantity });
  });

  const toInsert = [];
  const toUpdate = [];

  for (const card of cards) {
    const existing = existingMap.get(card.cardId);
    if (existing) {
      toUpdate.push({
        id: existing.id,
        quantity: existing.quantity + card.quantity,
        updated_at: new Date().toISOString(),
      });
    } else {
      toInsert.push({
        user_id: userId,
        card_id: card.cardId,
        quantity: card.quantity,
      });
    }
  }

  // Perform bulk operations
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('collections')
      .insert(toInsert);

    if (insertError) throw insertError;
  }

  if (toUpdate.length > 0) {
    for (const update of toUpdate) {
      const { error: updateError } = await supabase
        .from('collections')
        .update({ quantity: update.quantity, updated_at: update.updated_at })
        .eq('id', update.id);

      if (updateError) throw updateError;
    }
  }
};
