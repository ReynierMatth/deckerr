import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, ArrowRight, ArrowLeft, Minus, Send, Gift, Loader2, Check } from 'lucide-react';
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

type MobileStep = 'want' | 'give' | 'review';

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

  // Mobile step state
  const [isGiftMode, setIsGiftMode] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>('want');

  // Cards I'm offering (from my collection)
  const [myOfferedCards, setMyOfferedCards] = useState<Map<string, SelectedCard>>(new Map());
  // Cards I want (from their collection)
  const [wantedCards, setWantedCards] = useState<Map<string, SelectedCard>>(new Map());

  useEffect(() => {
    loadMyCollection();
  }, [user]);

  // When gift mode is toggled, adjust mobile step
  useEffect(() => {
    if (isGiftMode) {
      setWantedCards(new Map());
      setMobileStep('give');
    } else {
      setMobileStep('want');
    }
  }, [isGiftMode]);

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

  // Mobile navigation
  const goToNextStep = () => {
    if (mobileStep === 'want') setMobileStep('give');
    else if (mobileStep === 'give') setMobileStep('review');
  };

  const goToPrevStep = () => {
    if (mobileStep === 'review') setMobileStep('give');
    else if (mobileStep === 'give' && !isGiftMode) setMobileStep('want');
  };

  const canGoNext = () => {
    if (mobileStep === 'want') return true; // Can skip wanting cards (request nothing)
    if (mobileStep === 'give') return true; // Can skip giving cards (gift request)
    return false;
  };

  const canSubmit = myOfferedCards.size > 0 || wantedCards.size > 0;

  // Collection grid component
  const CollectionGrid = ({
    items,
    selectedCards,
    onAdd,
    onRemove,
    emptyMessage,
    selectionColor,
  }: {
    items: CollectionItem[];
    selectedCards: Map<string, SelectedCard>;
    onAdd: (card: Card, maxQty: number) => void;
    onRemove: (cardId: string) => void;
    emptyMessage: string;
    selectionColor: 'green' | 'blue';
  }) => {
    if (items.length === 0) {
      return <p className="text-gray-400 text-center py-8">{emptyMessage}</p>;
    }

    const ringColor = selectionColor === 'green' ? 'ring-green-500' : 'ring-blue-500';
    const badgeColor = selectionColor === 'green' ? 'bg-green-600' : 'bg-blue-500';

    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {items.map(({ card, quantity }) => {
          const selected = selectedCards.get(card.id);
          const remainingQty = quantity - (selected?.quantity || 0);
          return (
            <div
              key={card.id}
              className={`relative cursor-pointer rounded-lg overflow-hidden transition active:scale-95 ${
                selected ? `ring-2 ${ringColor}` : 'active:ring-2 active:ring-gray-500'
              }`}
              onClick={() => remainingQty > 0 && onAdd(card, quantity)}
            >
              <img
                src={card.image_uris?.small || card.image_uris?.normal}
                alt={card.name}
                className={`w-full h-auto ${remainingQty === 0 ? 'opacity-50' : ''}`}
              />
              <div className="absolute top-1 right-1 bg-gray-900/80 text-white text-[10px] px-1 py-0.5 rounded">
                {remainingQty}/{quantity}
              </div>
              {selected && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(card.id);
                  }}
                  className={`absolute bottom-1 left-1 ${badgeColor} text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5`}
                >
                  +{selected.quantity}
                  <Minus size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Selected cards summary component
  const SelectedCardsSummary = ({
    cards,
    onRemove,
    label,
    emptyLabel,
    color,
  }: {
    cards: Map<string, SelectedCard>;
    onRemove: (cardId: string) => void;
    label: string;
    emptyLabel: string;
    color: 'green' | 'blue';
  }) => {
    const bgColor = color === 'green' ? 'bg-green-900/50' : 'bg-blue-900/50';
    const textColor = color === 'green' ? 'text-green-400' : 'text-blue-400';

    return (
      <div>
        <h4 className={`text-xs font-semibold ${textColor} mb-1`}>{label}:</h4>
        {cards.size === 0 ? (
          <p className="text-gray-500 text-xs">{emptyLabel}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {Array.from(cards.values()).map((item) => (
              <div
                key={item.card.id}
                className={`flex items-center gap-1 ${bgColor} px-1.5 py-0.5 rounded text-xs`}
              >
                <span className="truncate max-w-[80px]">{item.card.name}</span>
                <span className={textColor}>x{item.quantity}</span>
                <button
                  onClick={() => onRemove(item.card.id)}
                  className="text-red-400 active:text-red-300"
                >
                  <Minus size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-0 md:p-4">
      <div className="bg-gray-800 w-full h-full md:rounded-lg md:w-full md:max-w-6xl md:max-h-[90vh] overflow-hidden flex flex-col">

        {/* ============ MOBILE VIEW ============ */}
        <div className="flex flex-col h-full md:hidden">
          {/* Mobile Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowLeftRight size={20} className="text-blue-400 flex-shrink-0" />
              <h2 className="font-bold truncate">Trade with {receiverUsername}</h2>
            </div>
            <button onClick={onClose} className="p-2 -mr-2 active:bg-gray-700 rounded-lg">
              <X size={20} />
            </button>
          </div>

          {/* Gift Toggle */}
          <div className="p-3 border-b border-gray-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isGiftMode ? 'bg-purple-600' : 'bg-gray-600'
                }`}
                onClick={() => setIsGiftMode(!isGiftMode)}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    isGiftMode ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <Gift size={18} className={isGiftMode ? 'text-purple-400' : 'text-gray-400'} />
                <span className={isGiftMode ? 'text-purple-400' : 'text-gray-400'}>
                  This is a gift (I don't want anything back)
                </span>
              </div>
            </label>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 p-2 bg-gray-900/50">
            {!isGiftMode && (
              <>
                <div
                  className={`w-2 h-2 rounded-full ${mobileStep === 'want' ? 'bg-blue-500' : 'bg-gray-600'}`}
                />
                <span className={`text-xs ${mobileStep === 'want' ? 'text-blue-400' : 'text-gray-500'}`}>
                  I Want
                </span>
                <ArrowRight size={14} className="text-gray-500" />
              </>
            )}
            <div
              className={`w-2 h-2 rounded-full ${mobileStep === 'give' ? 'bg-green-500' : 'bg-gray-600'}`}
            />
            <span className={`text-xs ${mobileStep === 'give' ? 'text-green-400' : 'text-gray-500'}`}>
              I Give
            </span>
            <ArrowRight size={14} className="text-gray-500" />
            <div
              className={`w-2 h-2 rounded-full ${mobileStep === 'review' ? 'bg-purple-500' : 'bg-gray-600'}`}
            />
            <span className={`text-xs ${mobileStep === 'review' ? 'text-purple-400' : 'text-gray-500'}`}>
              Review
            </span>
          </div>

          {/* Mobile Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Step: Want (their collection) */}
            {mobileStep === 'want' && !isGiftMode && (
              <div>
                <h3 className="text-sm font-semibold text-blue-400 mb-3">
                  Select cards from {receiverUsername}'s collection
                </h3>
                <CollectionGrid
                  items={receiverCollection}
                  selectedCards={wantedCards}
                  onAdd={addToWanted}
                  onRemove={removeFromWanted}
                  emptyMessage="Their collection is empty"
                  selectionColor="blue"
                />
              </div>
            )}

            {/* Step: Give (my collection) */}
            {mobileStep === 'give' && (
              <div>
                <h3 className="text-sm font-semibold text-green-400 mb-3">
                  Select cards to {isGiftMode ? 'gift' : 'offer'}
                </h3>
                {myCollection.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Your collection is empty</p>
                ) : (
                  <CollectionGrid
                    items={myCollection}
                    selectedCards={myOfferedCards}
                    onAdd={addToOffer}
                    onRemove={removeFromOffer}
                    emptyMessage="Your collection is empty"
                    selectionColor="green"
                  />
                )}
              </div>
            )}

            {/* Step: Review */}
            {mobileStep === 'review' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-purple-400">Review Trade</h3>

                {/* Summary */}
                <div className="bg-gray-900/50 rounded-lg p-3 space-y-3">
                  <SelectedCardsSummary
                    cards={myOfferedCards}
                    onRemove={removeFromOffer}
                    label="I Give"
                    emptyLabel="Nothing (requesting cards)"
                    color="green"
                  />
                  {!isGiftMode && (
                    <SelectedCardsSummary
                      cards={wantedCards}
                      onRemove={removeFromWanted}
                      label="I Want"
                      emptyLabel="Nothing (sending gift)"
                      color="blue"
                    />
                  )}
                </div>

                {/* Message */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Message (optional)</label>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Add a message..."
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Mobile Footer */}
          <div className="border-t border-gray-700 p-3 flex gap-2">
            {/* Back button */}
            {(mobileStep !== 'want' && !isGiftMode) || (mobileStep !== 'give' && isGiftMode) ? (
              <button
                onClick={goToPrevStep}
                disabled={mobileStep === 'give' && isGiftMode}
                className="flex items-center justify-center gap-1 px-4 py-2.5 bg-gray-700 active:bg-gray-600 disabled:opacity-50 rounded-lg flex-1"
              >
                <ArrowLeft size={18} />
                Back
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex items-center justify-center gap-1 px-4 py-2.5 bg-gray-700 active:bg-gray-600 rounded-lg flex-1"
              >
                Cancel
              </button>
            )}

            {/* Next/Submit button */}
            {mobileStep === 'review' ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 active:bg-blue-700 disabled:bg-gray-600 rounded-lg flex-1"
              >
                {submitting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : isGift ? (
                  <>
                    <Gift size={18} />
                    Send Gift
                  </>
                ) : isRequest ? (
                  <>
                    <Send size={18} />
                    Request
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Send Trade
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={goToNextStep}
                className="flex items-center justify-center gap-1 px-4 py-2.5 bg-blue-600 active:bg-blue-700 rounded-lg flex-1"
              >
                Next
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>

        {/* ============ DESKTOP VIEW ============ */}
        <div className="hidden md:flex md:flex-col h-full">
          {/* Desktop Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <ArrowLeftRight size={24} className="text-blue-400" />
              <h2 className="text-xl font-bold">Trade with {receiverUsername}</h2>
              <label className="flex items-center gap-2 ml-4 cursor-pointer">
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    isGiftMode ? 'bg-purple-600' : 'bg-gray-600'
                  }`}
                  onClick={() => setIsGiftMode(!isGiftMode)}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      isGiftMode ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                <Gift size={16} className={isGiftMode ? 'text-purple-400' : 'text-gray-400'} />
                <span className={`text-sm ${isGiftMode ? 'text-purple-400' : 'text-gray-400'}`}>
                  Gift mode
                </span>
              </label>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition">
              <X size={24} />
            </button>
          </div>

          {/* Desktop Content */}
          <div className="flex-1 overflow-hidden flex">
            {/* My Collection (Left) */}
            <div className="flex-1 p-4 border-r border-gray-700 overflow-y-auto">
              <h3 className="text-lg font-semibold mb-3 text-green-400">
                My Collection (I give)
              </h3>
              <CollectionGrid
                items={myCollection}
                selectedCards={myOfferedCards}
                onAdd={addToOffer}
                onRemove={removeFromOffer}
                emptyMessage="Your collection is empty"
                selectionColor="green"
              />
            </div>

            {/* Their Collection (Right) */}
            {!isGiftMode && (
              <div className="flex-1 p-4 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-3 text-blue-400">
                  {receiverUsername}'s Collection (I want)
                </h3>
                <CollectionGrid
                  items={receiverCollection}
                  selectedCards={wantedCards}
                  onAdd={addToWanted}
                  onRemove={removeFromWanted}
                  emptyMessage="Their collection is empty"
                  selectionColor="blue"
                />
              </div>
            )}
          </div>

          {/* Desktop Footer */}
          <div className="border-t border-gray-700 p-4">
            <div className="flex gap-6 mb-4">
              <SelectedCardsSummary
                cards={myOfferedCards}
                onRemove={removeFromOffer}
                label="I Give"
                emptyLabel="Nothing selected (gift request)"
                color="green"
              />
              {!isGiftMode && (
                <SelectedCardsSummary
                  cards={wantedCards}
                  onRemove={removeFromWanted}
                  label="I Want"
                  emptyLabel="Nothing selected (gift)"
                  color="blue"
                />
              )}
            </div>

            <div className="flex items-center gap-4">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message (optional)"
                className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition"
              >
                {submitting ? (
                  <Loader2 className="animate-spin" size={20} />
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
    </div>
  );
}
