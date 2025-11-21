/**
 * EXAMPLE FILE - Collection Integration Examples
 *
 * This file demonstrates how to integrate the collection service
 * into your components. These are complete, working examples that
 * can be used as templates for implementing the collection features.
 *
 * DO NOT DELETE - Reference for frontend integration
 */

import React, { useState, useEffect } from 'react';
import { useCollection } from '../hooks/useCollection';
import { CardOwnershipInfo, MissingCardInfo } from '../services/collectionService';
import { Card } from '../types';
import { Plus, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Example 1: Display Missing Cards Badge
 * Shows a badge indicating how many cards are missing from collection
 */
export function MissingCardsBadge({ deckId }: { deckId: string }) {
  const { getMissingCards, loading } = useCollection();
  const [missingCount, setMissingCount] = useState(0);

  useEffect(() => {
    const fetchMissing = async () => {
      const missing = await getMissingCards(deckId);
      if (missing) {
        setMissingCount(missing.length);
      }
    };
    fetchMissing();
  }, [deckId, getMissingCards]);

  if (loading) return <span className="text-gray-400">...</span>;

  return missingCount > 0 ? (
    <span className="bg-red-500 text-white px-2 py-1 rounded text-sm">
      {missingCount} cards missing
    </span>
  ) : (
    <span className="bg-green-500 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
      <CheckCircle size={16} />
      Complete
    </span>
  );
}

/**
 * Example 2: Card Ownership Indicator
 * Shows whether a specific card is owned and in what quantity
 */
interface CardOwnershipIndicatorProps {
  cardId: string;
  quantityNeeded: number;
}

export function CardOwnershipIndicator({ cardId, quantityNeeded }: CardOwnershipIndicatorProps) {
  const { checkCardOwnership } = useCollection();
  const [owned, setOwned] = useState(0);

  useEffect(() => {
    const check = async () => {
      const card = await checkCardOwnership(cardId);
      setOwned(card?.quantity || 0);
    };
    check();
  }, [cardId, checkCardOwnership]);

  const hasEnough = owned >= quantityNeeded;

  return (
    <div className={`flex items-center gap-2 ${hasEnough ? 'text-green-500' : 'text-red-500'}`}>
      {hasEnough ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      <span>
        {owned} / {quantityNeeded} owned
      </span>
    </div>
  );
}

/**
 * Example 3: Add Single Card Button
 * Button to add a specific card to collection
 */
interface AddCardButtonProps {
  cardId: string;
  cardName: string;
  quantity?: number;
  onSuccess?: () => void;
}

export function AddCardButton({ cardId, cardName, quantity = 1, onSuccess }: AddCardButtonProps) {
  const { addCard, loading, error, clearError } = useCollection();

  const handleAdd = async () => {
    clearError();
    const success = await addCard(cardId, quantity);
    if (success) {
      alert(`Added ${quantity}x ${cardName} to collection!`);
      onSuccess?.();
    }
  };

  return (
    <div>
      <button
        onClick={handleAdd}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
      >
        <Plus size={16} />
        {loading ? 'Adding...' : `Add ${quantity > 1 ? `${quantity}x ` : ''}to Collection`}
      </button>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}

/**
 * Example 4: Add All Missing Cards Button
 * Button to add all missing cards from a deck to collection
 */
export function AddAllMissingCardsButton({ deckId, onSuccess }: { deckId: string; onSuccess?: () => void }) {
  const { addMissingDeckCards, loading, error, clearError } = useCollection();
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleAddAll = async () => {
    clearError();
    setLastResult(null);

    const results = await addMissingDeckCards(deckId);

    if (results) {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      let message = `Added ${successCount} cards to collection`;
      if (failCount > 0) {
        message += `, ${failCount} failed`;
      }

      setLastResult(message);

      if (successCount > 0) {
        onSuccess?.();
      }
    }
  };

  return (
    <div>
      <button
        onClick={handleAddAll}
        disabled={loading}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center gap-2 font-semibold"
      >
        {loading ? 'Adding Cards...' : 'Add All Missing Cards to Collection'}
      </button>
      {lastResult && <p className="text-green-400 text-sm mt-2">{lastResult}</p>}
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}

/**
 * Example 5: Deck Card List with Collection Status
 * Shows all cards in a deck with their collection status
 */
interface DeckCardWithStatusProps {
  deckId: string;
  cards: Array<{ card: Card; quantity: number }>;
}

export function DeckCardListWithStatus({ deckId, cards }: DeckCardWithStatusProps) {
  const { getDeckOwnership, loading } = useCollection();
  const [ownership, setOwnership] = useState<CardOwnershipInfo[]>([]);

  useEffect(() => {
    const fetchOwnership = async () => {
      const data = await getDeckOwnership(deckId);
      if (data) setOwnership(data);
    };
    fetchOwnership();
  }, [deckId, getDeckOwnership]);

  if (loading) {
    return <div className="text-gray-400">Loading collection status...</div>;
  }

  const ownershipMap = new Map(ownership.map(o => [o.card_id, o]));

  return (
    <div className="space-y-2">
      {cards.map(({ card, quantity }) => {
        const status = ownershipMap.get(card.id);
        const isOwned = status?.owned || false;
        const quantityOwned = status?.quantity_in_collection || 0;
        const quantityNeeded = status?.quantity_needed || 0;

        return (
          <div key={card.id} className="flex items-center gap-4 bg-gray-800 p-4 rounded-lg">
            <img
              src={card.image_uris?.art_crop}
              alt={card.name}
              className="w-16 h-16 rounded object-cover"
            />

            <div className="flex-1">
              <h3 className="font-semibold">{card.name}</h3>
              <p className="text-sm text-gray-400">
                Need: {quantity} | Owned: {quantityOwned}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isOwned ? (
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle size={20} />
                  Complete
                </span>
              ) : (
                <>
                  <span className="text-red-500 flex items-center gap-1">
                    <AlertCircle size={20} />
                    Need {quantityNeeded} more
                  </span>
                  <AddCardButton
                    cardId={card.id}
                    cardName={card.name}
                    quantity={quantityNeeded}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Example 6: Bulk Add with Preview
 * Shows missing cards and allows bulk add with preview
 */
export function BulkAddWithPreview({ deckId }: { deckId: string }) {
  const { getMissingCards, addCardsBulk, loading, error } = useCollection();
  const [missingCards, setMissingCards] = useState<MissingCardInfo[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const fetchMissing = async () => {
      const missing = await getMissingCards(deckId);
      if (missing) setMissingCards(missing);
    };
    fetchMissing();
  }, [deckId, getMissingCards]);

  const handleBulkAdd = async () => {
    const cardsToAdd = missingCards.map(card => ({
      card_id: card.card_id,
      quantity: card.quantity_needed,
    }));

    const results = await addCardsBulk(cardsToAdd);

    if (results) {
      const successCount = results.filter(r => r.success).length;
      alert(`Successfully added ${successCount} cards to collection!`);
      setMissingCards([]);
      setShowPreview(false);
    }
  };

  if (missingCards.length === 0) {
    return (
      <div className="bg-green-500/10 border border-green-500 rounded-lg p-4 text-green-400">
        All cards from this deck are in your collection!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Missing Cards: {missingCards.length}</h3>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-blue-400 hover:text-blue-300"
        >
          {showPreview ? 'Hide' : 'Show'} Preview
        </button>
      </div>

      {showPreview && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          {missingCards.map(card => (
            <div key={card.card_id} className="flex justify-between text-sm">
              <span>{card.card_id}</span>
              <span className="text-gray-400">
                Need {card.quantity_needed} (have {card.quantity_in_collection})
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleBulkAdd}
        disabled={loading}
        className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold"
      >
        {loading ? 'Adding...' : `Add All ${missingCards.length} Missing Cards`}
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Example 7: Complete Deck Editor Integration
 * Full example of a deck editor with collection integration
 */
interface CompleteDeckEditorExampleProps {
  deckId: string;
  deckName: string;
  cards: Array<{ card: Card; quantity: number }>;
}

export function CompleteDeckEditorExample({ deckId, deckName, cards }: CompleteDeckEditorExampleProps) {
  const { getDeckOwnership, addMissingDeckCards, loading } = useCollection();
  const [ownership, setOwnership] = useState<CardOwnershipInfo[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchOwnership = async () => {
      const data = await getDeckOwnership(deckId);
      if (data) setOwnership(data);
    };
    fetchOwnership();
  }, [deckId, getDeckOwnership, refreshKey]);

  const handleRefresh = () => setRefreshKey(prev => prev + 1);

  const missingCount = ownership.filter(o => !o.owned).length;
  const totalCards = cards.length;
  const ownedCount = totalCards - missingCount;
  const completionPercent = totalCards > 0 ? Math.round((ownedCount / totalCards) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header with stats */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h1 className="text-3xl font-bold mb-4">{deckName}</h1>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-700 rounded p-3">
            <div className="text-sm text-gray-400">Total Cards</div>
            <div className="text-2xl font-bold">{totalCards}</div>
          </div>
          <div className="bg-gray-700 rounded p-3">
            <div className="text-sm text-gray-400">Owned</div>
            <div className="text-2xl font-bold text-green-500">{ownedCount}</div>
          </div>
          <div className="bg-gray-700 rounded p-3">
            <div className="text-sm text-gray-400">Missing</div>
            <div className="text-2xl font-bold text-red-500">{missingCount}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-700 rounded-full h-4 mb-4">
          <div
            className="bg-green-500 h-4 rounded-full transition-all"
            style={{ width: `${completionPercent}%` }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          {missingCount > 0 && (
            <button
              onClick={async () => {
                await addMissingDeckCards(deckId);
                handleRefresh();
              }}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-semibold"
            >
              {loading ? 'Adding...' : `Add All ${missingCount} Missing Cards`}
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Card list */}
      <DeckCardListWithStatus deckId={deckId} cards={cards} />
    </div>
  );
}
