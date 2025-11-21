import { supabase } from '../lib/supabase';

/**
 * Collection Service
 * Handles all backend operations related to user card collections
 */

export interface CollectionCard {
  id: string;
  user_id: string;
  card_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface MissingCardInfo {
  card_id: string;
  quantity_needed: number;
  quantity_in_collection: number;
}

export interface CardOwnershipInfo {
  card_id: string;
  owned: boolean;
  quantity_in_collection: number;
  quantity_in_deck: number;
  quantity_needed: number;
}

/**
 * Get the current authenticated user's ID
 * @throws Error if user is not authenticated
 */
const getCurrentUserId = async (): Promise<string> => {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('User not authenticated');
  }

  return user.id;
};

/**
 * Get all cards in the user's collection
 * @returns Array of collection cards with user's ownership info
 */
export const getUserCollection = async (): Promise<CollectionCard[]> => {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to fetch collection: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserCollection:', error);
    throw error;
  }
};

/**
 * Check if a single card exists in the user's collection
 * @param cardId - The Scryfall card ID
 * @returns CollectionCard or null if not found
 */
export const getCardInCollection = async (cardId: string): Promise<CollectionCard | null> => {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId)
      .eq('card_id', cardId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check card ownership: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error in getCardInCollection:', error);
    throw error;
  }
};

/**
 * Check ownership status for multiple cards
 * @param cardIds - Array of Scryfall card IDs
 * @returns Map of card_id to quantity owned
 */
export const checkCardsOwnership = async (
  cardIds: string[]
): Promise<Map<string, number>> => {
  try {
    const userId = await getCurrentUserId();

    // Remove duplicates
    const uniqueCardIds = [...new Set(cardIds)];

    if (uniqueCardIds.length === 0) {
      return new Map();
    }

    const { data, error } = await supabase
      .from('collections')
      .select('card_id, quantity')
      .eq('user_id', userId)
      .in('card_id', uniqueCardIds);

    if (error) {
      throw new Error(`Failed to check cards ownership: ${error.message}`);
    }

    const ownershipMap = new Map<string, number>();

    if (data) {
      data.forEach(item => {
        ownershipMap.set(item.card_id, item.quantity || 0);
      });
    }

    return ownershipMap;
  } catch (error) {
    console.error('Error in checkCardsOwnership:', error);
    throw error;
  }
};

/**
 * Get detailed card ownership information for a deck
 * @param deckId - The deck ID to check
 * @returns Array of CardOwnershipInfo for each card in the deck
 */
export const getDeckCardOwnership = async (
  deckId: string
): Promise<CardOwnershipInfo[]> => {
  try {
    const userId = await getCurrentUserId();

    // First verify the user owns this deck
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, user_id')
      .eq('id', deckId)
      .eq('user_id', userId)
      .single();

    if (deckError || !deck) {
      throw new Error('Deck not found or access denied');
    }

    // Get all cards in the deck
    const { data: deckCards, error: deckCardsError } = await supabase
      .from('deck_cards')
      .select('card_id, quantity')
      .eq('deck_id', deckId);

    if (deckCardsError) {
      throw new Error(`Failed to fetch deck cards: ${deckCardsError.message}`);
    }

    if (!deckCards || deckCards.length === 0) {
      return [];
    }

    // Create a map of card quantities in deck
    const deckCardMap = new Map<string, number>();
    deckCards.forEach(card => {
      const currentQty = deckCardMap.get(card.card_id) || 0;
      deckCardMap.set(card.card_id, currentQty + (card.quantity || 1));
    });

    // Get ownership info for all cards
    const cardIds = Array.from(deckCardMap.keys());
    const ownershipMap = await checkCardsOwnership(cardIds);

    // Build the result
    const ownershipInfo: CardOwnershipInfo[] = [];

    deckCardMap.forEach((quantityInDeck, cardId) => {
      const quantityInCollection = ownershipMap.get(cardId) || 0;
      const quantityNeeded = Math.max(0, quantityInDeck - quantityInCollection);

      ownershipInfo.push({
        card_id: cardId,
        owned: quantityInCollection >= quantityInDeck,
        quantity_in_collection: quantityInCollection,
        quantity_in_deck: quantityInDeck,
        quantity_needed: quantityNeeded,
      });
    });

    return ownershipInfo;
  } catch (error) {
    console.error('Error in getDeckCardOwnership:', error);
    throw error;
  }
};

/**
 * Get list of missing cards from a deck
 * @param deckId - The deck ID to check
 * @returns Array of missing cards with quantity needed
 */
export const getMissingCardsFromDeck = async (
  deckId: string
): Promise<MissingCardInfo[]> => {
  try {
    const ownershipInfo = await getDeckCardOwnership(deckId);

    return ownershipInfo
      .filter(info => !info.owned)
      .map(info => ({
        card_id: info.card_id,
        quantity_needed: info.quantity_needed,
        quantity_in_collection: info.quantity_in_collection,
      }));
  } catch (error) {
    console.error('Error in getMissingCardsFromDeck:', error);
    throw error;
  }
};

/**
 * Add a single card to the user's collection
 * If the card already exists, increment its quantity
 * @param cardId - The Scryfall card ID
 * @param quantity - The quantity to add (default: 1)
 * @returns The updated or created collection card
 */
export const addCardToCollection = async (
  cardId: string,
  quantity: number = 1
): Promise<CollectionCard> => {
  try {
    if (!cardId || cardId.trim() === '') {
      throw new Error('Invalid card ID');
    }

    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    const userId = await getCurrentUserId();

    // Check if card already exists in collection
    const existingCard = await getCardInCollection(cardId);

    if (existingCard) {
      // Update existing card quantity
      const newQuantity = existingCard.quantity + quantity;

      const { data, error } = await supabase
        .from('collections')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCard.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update card quantity: ${error.message}`);
      }

      return data;
    } else {
      // Insert new card
      const { data, error } = await supabase
        .from('collections')
        .insert({
          user_id: userId,
          card_id: cardId,
          quantity: quantity,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add card to collection: ${error.message}`);
      }

      return data;
    }
  } catch (error) {
    console.error('Error in addCardToCollection:', error);
    throw error;
  }
};

/**
 * Add multiple cards to the user's collection in bulk
 * @param cards - Array of {card_id, quantity} objects
 * @returns Array of results with success/failure status for each card
 */
export const addCardsToCollectionBulk = async (
  cards: Array<{ card_id: string; quantity: number }>
): Promise<Array<{ card_id: string; success: boolean; error?: string }>> => {
  try {
    if (!cards || cards.length === 0) {
      throw new Error('No cards provided');
    }

    // Validate all cards first
    const validationErrors: string[] = [];
    cards.forEach((card, index) => {
      if (!card.card_id || card.card_id.trim() === '') {
        validationErrors.push(`Card at index ${index} has invalid ID`);
      }
      if (card.quantity < 1) {
        validationErrors.push(`Card at index ${index} has invalid quantity`);
      }
    });

    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    const userId = await getCurrentUserId();

    // Get current collection state for all cards
    const cardIds = cards.map(c => c.card_id);

    // Prepare updates and inserts
    const toUpdate: Array<{ id: string; card_id: string; quantity: number }> = [];
    const toInsert: Array<{ user_id: string; card_id: string; quantity: number }> = [];

    // First, get existing collection entries for update
    const { data: existingCards, error: fetchError } = await supabase
      .from('collections')
      .select('id, card_id, quantity')
      .eq('user_id', userId)
      .in('card_id', cardIds);

    if (fetchError) {
      throw new Error(`Failed to fetch existing cards: ${fetchError.message}`);
    }

    const existingCardsMap = new Map(
      (existingCards || []).map(card => [card.card_id, card])
    );

    // Categorize cards for update or insert
    cards.forEach(card => {
      const existing = existingCardsMap.get(card.card_id);

      if (existing) {
        toUpdate.push({
          id: existing.id,
          card_id: card.card_id,
          quantity: existing.quantity + card.quantity,
        });
      } else {
        toInsert.push({
          user_id: userId,
          card_id: card.card_id,
          quantity: card.quantity,
        });
      }
    });

    const results: Array<{ card_id: string; success: boolean; error?: string }> = [];

    // Process updates
    for (const updateCard of toUpdate) {
      try {
        const { error } = await supabase
          .from('collections')
          .update({
            quantity: updateCard.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', updateCard.id);

        if (error) {
          results.push({
            card_id: updateCard.card_id,
            success: false,
            error: error.message,
          });
        } else {
          results.push({
            card_id: updateCard.card_id,
            success: true,
          });
        }
      } catch (err) {
        results.push({
          card_id: updateCard.card_id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Process inserts in batches (Supabase recommends batches of 1000)
    const batchSize = 1000;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);

      try {
        const { error } = await supabase
          .from('collections')
          .insert(batch);

        if (error) {
          // If batch fails, mark all as failed
          batch.forEach(card => {
            results.push({
              card_id: card.card_id,
              success: false,
              error: error.message,
            });
          });
        } else {
          // Mark all as success
          batch.forEach(card => {
            results.push({
              card_id: card.card_id,
              success: true,
            });
          });
        }
      } catch (err) {
        // If batch fails with exception, mark all as failed
        batch.forEach(card => {
          results.push({
            card_id: card.card_id,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error in addCardsToCollectionBulk:', error);
    throw error;
  }
};

/**
 * Add all missing cards from a deck to the user's collection
 * @param deckId - The deck ID
 * @returns Array of results with success/failure status for each card
 */
export const addMissingDeckCardsToCollection = async (
  deckId: string
): Promise<Array<{ card_id: string; success: boolean; error?: string }>> => {
  try {
    const userId = await getCurrentUserId();

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id')
      .eq('id', deckId)
      .eq('user_id', userId)
      .single();

    if (deckError || !deck) {
      throw new Error('Deck not found or access denied');
    }

    // Get missing cards
    const missingCards = await getMissingCardsFromDeck(deckId);

    if (missingCards.length === 0) {
      return [];
    }

    // Convert to format for bulk add
    const cardsToAdd = missingCards.map(card => ({
      card_id: card.card_id,
      quantity: card.quantity_needed,
    }));

    return await addCardsToCollectionBulk(cardsToAdd);
  } catch (error) {
    console.error('Error in addMissingDeckCardsToCollection:', error);
    throw error;
  }
};

/**
 * Remove a card from the user's collection
 * @param cardId - The Scryfall card ID
 * @param quantity - The quantity to remove (default: all)
 * @returns true if successful
 */
export const removeCardFromCollection = async (
  cardId: string,
  quantity?: number
): Promise<boolean> => {
  try {
    const existingCard = await getCardInCollection(cardId);

    if (!existingCard) {
      throw new Error('Card not found in collection');
    }

    // If no quantity specified or quantity >= existing, delete the entry
    if (!quantity || quantity >= existingCard.quantity) {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', existingCard.id);

      if (error) {
        throw new Error(`Failed to remove card: ${error.message}`);
      }
    } else {
      // Otherwise, decrease the quantity
      const newQuantity = existingCard.quantity - quantity;

      const { error } = await supabase
        .from('collections')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCard.id);

      if (error) {
        throw new Error(`Failed to update card quantity: ${error.message}`);
      }
    }

    return true;
  } catch (error) {
    console.error('Error in removeCardFromCollection:', error);
    throw error;
  }
};
