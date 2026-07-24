import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { addCardToCollection, addMultipleCardsToCollection, addCardsToWishlist } from '../services/api';
import { useCollectionCounts } from './useCollectionCounts';

/**
 * Collection/wishlist actions for the deck builder: which deck cards are
 * missing from the user's collection, and the "add one / add all missing /
 * wishlist missing" flows with their optimistic cache updates.
 */
export function useDeckCollectionActions(
  selectedCards: { card: Card; quantity: number; is_commander: boolean; is_sideboard: boolean }[],
) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  // User's collection (card_id -> quantity), cached under the same key as
  // CardSearch so both screens share one fetch.
  const { data: collectionCounts, isPending: isLoadingCollection } = useCollectionCounts(user?.id);
  const userCollection = collectionCounts ?? {};

  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [isAddingToWishlist, setIsAddingToWishlist] = useState(false);

  // Bump the cached counts right away (instant feedback), then invalidate the
  // collection caches so every consumer refetches the server truth.
  const applyCollectionAdds = (added: { cardId: string; quantity: number }[]) => {
    if (!user) return;
    queryClient.setQueryData<Record<string, number>>(
      ['collection', user.id, 'counts'],
      (prev) => {
        const next = { ...(prev ?? {}) };
        added.forEach(({ cardId, quantity }) => {
          next[cardId] = (next[cardId] ?? 0) + quantity;
        });
        return next;
      },
    );
    queryClient.invalidateQueries({ queryKey: ['collection'] });
    queryClient.invalidateQueries({ queryKey: ['myCollection'] });
  };

  // Helper function to check if a card is in the collection
  const isCardInCollection = (cardId: string, requiredQuantity: number = 1): boolean => {
    const ownedQuantity = userCollection[cardId] ?? 0;
    return ownedQuantity >= requiredQuantity;
  };

  // Helper function to get missing cards
  const getMissingCards = () => {
    return selectedCards.filter(({ card, quantity }) => {
      return !isCardInCollection(card.id, quantity);
    });
  };

  // Add single card to collection
  const handleAddCardToCollection = async (cardId: string, quantity: number) => {
    if (!user) return;

    try {
      setAddingCardId(cardId);
      const card = selectedCards.find(c => c.card.id === cardId)?.card;
      const priceUsd = card?.prices?.usd ? Number(card.prices.usd) : 0;
      await addCardToCollection(user.id, cardId, quantity, priceUsd, card?.name);

      applyCollectionAdds([{ cardId, quantity }]);

      toast.success('Card added to collection!');
    } catch (error) {
      console.error('Error adding card to collection:', error);
      toast.error('Failed to add card to collection');
    } finally {
      setAddingCardId(null);
    }
  };

  // Add all missing cards to collection
  const handleAddAllMissingCards = async () => {
    if (!user) return;

    const missingCards = getMissingCards();
    if (missingCards.length === 0) {
      toast.success('All cards are already in your collection!');
      return;
    }

    try {
      setIsAddingAll(true);

      const cardsToAdd = missingCards.map(({ card, quantity }) => {
        const ownedQuantity = userCollection[card.id] ?? 0;
        const neededQuantity = Math.max(0, quantity - ownedQuantity);
        return {
          cardId: card.id,
          quantity: neededQuantity,
          priceUsd: card.prices?.usd ? Number(card.prices.usd) : 0,
          cardName: card.name,
        };
      }).filter(c => c.quantity > 0);

      await addMultipleCardsToCollection(user.id, cardsToAdd);

      applyCollectionAdds(cardsToAdd);

      toast.success(`Successfully added ${cardsToAdd.length} card(s) to collection!`);
    } catch (error) {
      console.error('Error adding cards to collection:', error);
      toast.error('Failed to add cards to collection');
    } finally {
      setIsAddingAll(false);
    }
  };

  const handleAddMissingToWishlist = async () => {
    if (!user) return;
    const missing = getMissingCards();
    if (missing.length === 0) {
      toast.success('You already own every card in this deck!');
      return;
    }
    try {
      setIsAddingToWishlist(true);
      await addCardsToWishlist(user.id, missing.map((m) => m.card.id));
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success(`Added ${missing.length} missing card(s) to your wishlist`);
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      toast.error('Failed to add to wishlist');
    } finally {
      setIsAddingToWishlist(false);
    }
  };

  return {
    userCollection,
    isLoadingCollection,
    addingCardId,
    isAddingAll,
    isAddingToWishlist,
    getMissingCards,
    handleAddCardToCollection,
    handleAddAllMissingCards,
    handleAddMissingToWishlist,
  };
}
