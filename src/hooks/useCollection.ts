import { useState, useCallback } from 'react';
import {
  getUserCollection,
  getCardInCollection,
  checkCardsOwnership,
  getDeckCardOwnership,
  getMissingCardsFromDeck,
  addCardToCollection,
  addCardsToCollectionBulk,
  addMissingDeckCardsToCollection,
  removeCardFromCollection,
  CollectionCard,
  CardOwnershipInfo,
  MissingCardInfo,
} from '../services/collectionService';

/**
 * Custom React hook for managing card collections
 * Provides state management and loading/error handling for collection operations
 */
export const useCollection = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Clear any existing error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Get user's entire collection
   */
  const getCollection = useCallback(async (): Promise<CollectionCard[] | null> => {
    setLoading(true);
    setError(null);
    try {
      const collection = await getUserCollection();
      return collection;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch collection';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Check if a single card is in the collection
   */
  const checkCardOwnership = useCallback(async (cardId: string): Promise<CollectionCard | null> => {
    setLoading(true);
    setError(null);
    try {
      const card = await getCardInCollection(cardId);
      return card;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check card ownership';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Check ownership for multiple cards
   */
  const checkMultipleCardsOwnership = useCallback(
    async (cardIds: string[]): Promise<Map<string, number> | null> => {
      setLoading(true);
      setError(null);
      try {
        const ownershipMap = await checkCardsOwnership(cardIds);
        return ownershipMap;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to check cards ownership';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get detailed ownership info for all cards in a deck
   */
  const getDeckOwnership = useCallback(
    async (deckId: string): Promise<CardOwnershipInfo[] | null> => {
      setLoading(true);
      setError(null);
      try {
        const ownershipInfo = await getDeckCardOwnership(deckId);
        return ownershipInfo;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get deck ownership info';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get list of missing cards from a deck
   */
  const getMissingCards = useCallback(
    async (deckId: string): Promise<MissingCardInfo[] | null> => {
      setLoading(true);
      setError(null);
      try {
        const missingCards = await getMissingCardsFromDeck(deckId);
        return missingCards;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get missing cards';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Add a single card to collection
   */
  const addCard = useCallback(
    async (cardId: string, quantity: number = 1): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await addCardToCollection(cardId, quantity);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to add card to collection';
        setError(errorMessage);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Add multiple cards to collection in bulk
   */
  const addCardsBulk = useCallback(
    async (
      cards: Array<{ card_id: string; quantity: number }>
    ): Promise<Array<{ card_id: string; success: boolean; error?: string }> | null> => {
      setLoading(true);
      setError(null);
      try {
        const results = await addCardsToCollectionBulk(cards);
        return results;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to add cards to collection';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Add all missing cards from a deck to collection
   */
  const addMissingDeckCards = useCallback(
    async (
      deckId: string
    ): Promise<Array<{ card_id: string; success: boolean; error?: string }> | null> => {
      setLoading(true);
      setError(null);
      try {
        const results = await addMissingDeckCardsToCollection(deckId);
        return results;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to add missing cards';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Remove a card from collection
   */
  const removeCard = useCallback(
    async (cardId: string, quantity?: number): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await removeCardFromCollection(cardId, quantity);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to remove card from collection';
        setError(errorMessage);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    clearError,
    getCollection,
    checkCardOwnership,
    checkMultipleCardsOwnership,
    getDeckOwnership,
    getMissingCards,
    addCard,
    addCardsBulk,
    addMissingDeckCards,
    removeCard,
  };
};
