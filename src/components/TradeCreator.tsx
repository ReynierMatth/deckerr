import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, Plus, Minus, Send, Gift, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getUserCollection, getCardsByIds } from '../services/api';
import { createTrade } from '../services/tradesService';
import { Card } from '../types';

interface CollectionItem {
  card: Card;
  quantity: number;
}

interface TradeCreatorProps {
  receiverId: string;
  receiverUsername: string;
  receiverCollection: CollectionItem[];
  onClose: () => void;
  onTradeCreated: () => void;
}

interface SelectedCard {
  card: Card;
  quantity: number;
  maxQuantity: number;
}

export default function TradeCreator({
  receiverId,
  receiverUsername,
  receiverCollection,
  onClose,
  onTradeCreated,
}: TradeCreatorProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [myCollection, setMyCollection] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Cards I'm offering (from my collection)
  const [myOfferedCards, setMyOfferedCards] = useState<Map<string, SelectedCard>>(new Map());
  // Cards I want (from their collection)
  const [wantedCards, setWantedCards] = useState<Map<string, SelectedCard>>(new Map());

  useEffect(() => {
    loadMyCollection();
  }, [user]);

  const loadMyCollection = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const collectionMap = await getUserCollection(user.id);
      if (collectionMap.size === 0) {
        setMyCollection([]);
        return;
      }

      const cardIds = Array.from(collectionMap.keys());
      const cards = await getCardsByIds(cardIds);

      const collectionWithCards = cards.map((card) => ({
        card,
        quantity: collectionMap.get(card.id) || 0,
      }));

      setMyCollection(collectionWithCards);
    } catch (error) {
      console.error('Error loading my collection:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToOffer = (card: Card, maxQuantity: number) => {
    setMyOfferedCards((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(card.id);
      if (existing) {
        if (existing.quantity < existing.maxQuantity) {
          newMap.set(card.id, { ...existing, quantity: existing.quantity + 1 });
        }
      } else {
        newMap.set(card.id, { card, quantity: 1, maxQuantity });
      }
      return newMap;
    });
  };

  const removeFromOffer = (cardId: string) => {
    setMyOfferedCards((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(cardId);
      if (existing && existing.quantity > 1) {
        newMap.set(cardId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        newMap.delete(cardId);
      }
      return newMap;
    });
  };

  const addToWanted = (card: Card, maxQuantity: number) => {
    setWantedCards((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(card.id);
      if (existing) {
        if (existing.quantity < existing.maxQuantity) {
          newMap.set(card.id, { ...existing, quantity: existing.quantity + 1 });
        }
      } else {
        newMap.set(card.id, { card, quantity: 1, maxQuantity });
      }
      return newMap;
    });
  };

  const removeFromWanted = (cardId: string) => {
    setWantedCards((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(cardId);
      if (existing && existing.quantity > 1) {
        newMap.set(cardId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        newMap.delete(cardId);
      }
      return newMap;
    });
  };

  const handleSubmit = async () => {
    if (!user) return;

    // At least one side should have cards (allowing gifts)
    if (myOfferedCards.size === 0 && wantedCards.size === 0) {
      toast.warning('Please select at least one card to trade or gift');
      return;
    }

    setSubmitting(true);
    try {
      const senderCards = Array.from(myOfferedCards.values()).map((item) => ({
        cardId: item.card.id,
        quantity: item.quantity,
      }));

      const receiverCards = Array.from(wantedCards.values()).map((item) => ({
        cardId: item.card.id,
        quantity: item.quantity,
      }));

      await createTrade({
        senderId: user.id,
        receiverId,
        message: message || undefined,
        senderCards,
        receiverCards,
      });

      onTradeCreated();
    } catch (error) {
      console.error('Error creating trade:', error);
      toast.error('Failed to create trade');
    } finally {
      setSubmitting(false);
    }
  };

  const isGift = myOfferedCards.size > 0 && wantedCards.size === 0;
  const isRequest = myOfferedCards.size === 0 && wantedCards.size > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={24} className="text-blue-400" />
            <h2 className="text-xl font-bold">Trade with {receiverUsername}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* My Collection (Left) */}
          <div className="flex-1 p-4 border-b md:border-b-0 md:border-r border-gray-700 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3 text-green-400">
              My Collection (I give)
            </h3>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : myCollection.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Your collection is empty</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {myCollection.map(({ card, quantity }) => {
                  const offered = myOfferedCards.get(card.id);
                  const remainingQty = quantity - (offered?.quantity || 0);
                  return (
                    <div
                      key={card.id}
                      className={`relative cursor-pointer rounded-lg overflow-hidden transition ${
                        offered ? 'ring-2 ring-green-500' : 'hover:ring-2 hover:ring-gray-500'
                      }`}
                      onClick={() => remainingQty > 0 && addToOffer(card, quantity)}
                    >
                      <img
                        src={card.image_uris?.small}
                        alt={card.name}
                        className={`w-full h-auto ${remainingQty === 0 ? 'opacity-50' : ''}`}
                      />
                      <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">
                        {remainingQty}/{quantity}
                      </div>
                      {offered && (
                        <div className="absolute bottom-1 left-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
                          +{offered.quantity}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Their Collection (Right) */}
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3 text-blue-400">
              {receiverUsername}'s Collection (I want)
            </h3>
            {receiverCollection.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Their collection is empty</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {receiverCollection.map(({ card, quantity }) => {
                  const wanted = wantedCards.get(card.id);
                  const remainingQty = quantity - (wanted?.quantity || 0);
                  return (
                    <div
                      key={card.id}
                      className={`relative cursor-pointer rounded-lg overflow-hidden transition ${
                        wanted ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-gray-500'
                      }`}
                      onClick={() => remainingQty > 0 && addToWanted(card, quantity)}
                    >
                      <img
                        src={card.image_uris?.small}
                        alt={card.name}
                        className={`w-full h-auto ${remainingQty === 0 ? 'opacity-50' : ''}`}
                      />
                      <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">
                        {remainingQty}/{quantity}
                      </div>
                      {wanted && (
                        <div className="absolute bottom-1 left-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
                          +{wanted.quantity}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Trade Summary */}
        <div className="border-t border-gray-700 p-4">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            {/* I Give */}
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-green-400 mb-2">I Give:</h4>
              {myOfferedCards.size === 0 ? (
                <p className="text-gray-500 text-sm">Nothing selected (gift request)</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Array.from(myOfferedCards.values()).map((item) => (
                    <div
                      key={item.card.id}
                      className="flex items-center gap-1 bg-green-900/50 px-2 py-1 rounded text-sm"
                    >
                      <span>{item.card.name}</span>
                      <span className="text-green-400">x{item.quantity}</span>
                      <button
                        onClick={() => removeFromOffer(item.card.id)}
                        className="ml-1 text-red-400 hover:text-red-300"
                      >
                        <Minus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* I Want */}
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-400 mb-2">I Want:</h4>
              {wantedCards.size === 0 ? (
                <p className="text-gray-500 text-sm">Nothing selected (gift)</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Array.from(wantedCards.values()).map((item) => (
                    <div
                      key={item.card.id}
                      className="flex items-center gap-1 bg-blue-900/50 px-2 py-1 rounded text-sm"
                    >
                      <span>{item.card.name}</span>
                      <span className="text-blue-400">x{item.quantity}</span>
                      <button
                        onClick={() => removeFromWanted(item.card.id)}
                        className="ml-1 text-red-400 hover:text-red-300"
                      >
                        <Minus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="mb-4">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (myOfferedCards.size === 0 && wantedCards.size === 0)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : isGift ? (
                <>
                  <Gift size={20} />
                  Send Gift
                </>
              ) : isRequest ? (
                <>
                  <Send size={20} />
                  Request Cards
                </>
              ) : (
                <>
                  <Send size={20} />
                  Propose Trade
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
