import { useState, useEffect } from 'react';
import { X, ArrowLeftRight, ArrowRight, ArrowLeft, Minus, Send, Gift, Loader2, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getUserCollection, getCardsByIds } from '../services/api';
import { createTrade, updateTrade } from '../services/tradesService';
import { Card } from '../types';

interface CollectionItem {
  card: Card;
  quantity: number;
}

interface SelectedCard {
  card: Card;
  quantity: number;
  maxQuantity: number;
}

// ============ MOVED OUTSIDE TO PREVENT RE-RENDER ============

interface CollectionGridProps {
  items: CollectionItem[];
  selectedCards: Map<string, SelectedCard>;
  onAdd: (card: Card, maxQty: number) => void;
  onRemove: (cardId: string) => void;
  emptyMessage: string;
  selectionColor: 'green' | 'blue';
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
}

function CollectionGrid({
  items,
  selectedCards,
  onAdd,
  onRemove,
  emptyMessage,
  selectionColor,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: CollectionGridProps) {
  const ringColor = selectionColor === 'green' ? 'ring-green-500' : 'ring-blue-500';
  const badgeColor = selectionColor === 'green' ? 'bg-green-600' : 'bg-blue-500';

  const filteredItems = items.filter(({ card }) =>
    card.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-gray-400 text-center py-8">{emptyMessage}</p>
      ) : filteredItems.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No cards match "{searchValue}"</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {filteredItems.map(({ card, quantity }) => {
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
                {card.prices?.usd && (
                  <div className="absolute top-1 left-1 bg-gray-900/80 text-green-400 text-[10px] px-1 py-0.5 rounded font-semibold">
                    ${card.prices.usd}
                  </div>
                )}
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
      )}
    </div>
  );
}

interface SelectedCardsSummaryProps {
  cards: Map<string, SelectedCard>;
  onRemove: (cardId: string) => void;
  label: string;
  emptyLabel: string;
  color: 'green' | 'blue';
}

function SelectedCardsSummary({ cards, onRemove, label, emptyLabel, color }: SelectedCardsSummaryProps) {
  const bgColor = color === 'green' ? 'bg-green-900/50' : 'bg-blue-900/50';
  const textColor = color === 'green' ? 'text-green-400' : 'text-blue-400';

  // Calculate total price
  const totalPrice = Array.from(cards.values()).reduce((total, item) => {
    const price = item.card.prices?.usd ? parseFloat(item.card.prices.usd) : 0;
    return total + (price * item.quantity);
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className={`text-xs font-semibold ${textColor}`}>{label}:</h4>
        {cards.size > 0 && (
          <span className={`text-xs font-semibold ${textColor}`}>
            ${totalPrice.toFixed(2)}
          </span>
        )}
      </div>
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
}

const sumSideValue = (cards: Map<string, SelectedCard>): number =>
  Array.from(cards.values()).reduce(
    (total, item) => total + (item.card.prices?.usd ? parseFloat(item.card.prices.usd) : 0) * item.quantity,
    0,
  );

function TradeBalance({ give, want }: { give: Map<string, SelectedCard>; want: Map<string, SelectedCard> }) {
  const giveTotal = sumSideValue(give);
  const wantTotal = sumSideValue(want);
  const diff = giveTotal - wantTotal;
  const even = Math.abs(diff) < 0.01;
  return (
    <div className="border-t border-gray-700 pt-2 mt-1 space-y-1 text-xs">
      <div className="flex justify-between">
        <span className="text-gray-400">You give</span>
        <span className="text-green-400 font-semibold">${giveTotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">You get</span>
        <span className="text-blue-400 font-semibold">${wantTotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span className="text-gray-300">Balance</span>
        <span className={even ? 'text-gray-300' : diff > 0 ? 'text-red-400' : 'text-green-400'}>
          {even ? 'Even' : diff > 0 ? `You give $${diff.toFixed(2)} more` : `In your favor by $${(-diff).toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

interface TradeCreatorProps {
  receiverId: string;
  receiverUsername: string;
  receiverCollection: CollectionItem[];
  onClose: () => void;
  onTradeCreated: () => void;
  editMode?: boolean;
  existingTradeId?: string;
  initialSenderCards?: Card[];
  initialReceiverCards?: Card[];
  initialMessage?: string;
}

type MobileStep = 'want' | 'give' | 'review';

export default function TradeCreator({
  receiverId,
  receiverUsername,
  receiverCollection,
  onClose,
  onTradeCreated,
  editMode = false,
  existingTradeId,
  initialSenderCards = [],
  initialReceiverCards = [],
  initialMessage = '',
}: TradeCreatorProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [myCollection, setMyCollection] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  const [isGiftMode, setIsGiftMode] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>('want');

  const [myOfferedCards, setMyOfferedCards] = useState<Map<string, SelectedCard>>(new Map());
  const [wantedCards, setWantedCards] = useState<Map<string, SelectedCard>>(new Map());

  const [myCollectionSearch, setMyCollectionSearch] = useState('');
  const [theirCollectionSearch, setTheirCollectionSearch] = useState('');

  useEffect(() => {
    loadMyCollection();
  }, [user]);

  useEffect(() => {
    if (isGiftMode) {
      setWantedCards(new Map());
      setMobileStep('give');
    } else {
      setMobileStep('want');
    }
  }, [isGiftMode]);

  // Pre-populate cards in edit mode
  useEffect(() => {
    if (!editMode || !myCollection.length || !receiverCollection.length) return;
    if (initialSenderCards.length === 0 && initialReceiverCards.length === 0) return;

    console.log('Pre-populating cards', {
      initialSenderCards: initialSenderCards.length,
      initialReceiverCards: initialReceiverCards.length,
      myCollection: myCollection.length,
      receiverCollection: receiverCollection.length
    });

    // Pre-populate sender cards with their quantities
    const senderMap = new Map<string, SelectedCard>();
    initialSenderCards.forEach(card => {
      const collectionItem = myCollection.find(c => c.card.id === card.id);
      if (collectionItem) {
        // Find the quantity from trade items if card has quantity property
        const quantity = (card as Card & { quantity?: number }).quantity || 1;
        console.log('Adding sender card:', card.name, 'qty:', quantity);
        senderMap.set(card.id, {
          card: card,
          quantity: quantity,
          maxQuantity: collectionItem.quantity,
        });
      } else {
        console.log('Card not found in my collection:', card.name, card.id);
      }
    });
    setMyOfferedCards(senderMap);

    // Pre-populate receiver cards with their quantities
    const receiverMap = new Map<string, SelectedCard>();
    initialReceiverCards.forEach(card => {
      const collectionItem = receiverCollection.find(c => c.card.id === card.id);
      if (collectionItem) {
        // Find the quantity from trade items if card has quantity property
        const quantity = (card as Card & { quantity?: number }).quantity || 1;
        console.log('Adding receiver card:', card.name, 'qty:', quantity);
        receiverMap.set(card.id, {
          card: card,
          quantity: quantity,
          maxQuantity: collectionItem.quantity,
        });
      } else {
        console.log('Card not found in their collection:', card.name, card.id);
      }
    });
    setWantedCards(receiverMap);
  }, [editMode, myCollection, receiverCollection, initialSenderCards, initialReceiverCards]);

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
      const myCards = Array.from(myOfferedCards.values()).map((item) => ({
        cardId: item.card.id,
        quantity: item.quantity,
      }));

      const theirCards = Array.from(wantedCards.values()).map((item) => ({
        cardId: item.card.id,
        quantity: item.quantity,
      }));

      if (editMode && existingTradeId) {
        // Update existing trade
        await updateTrade({
          tradeId: existingTradeId,
          editorId: user.id,
          message: message || undefined,
          myCards,
          theirCards,
        });
        toast.success('Trade updated!');
      } else {
        // Create new trade
        await createTrade({
          user1Id: user.id,
          user2Id: receiverId,
          message: message || undefined,
          user1Cards: myCards,
          user2Cards: theirCards,
        });
        toast.success('Trade offer sent!');
      }

      onTradeCreated();
    } catch (error) {
      console.error('Error with trade:', error);
      toast.error(editMode ? 'Failed to update trade' : 'Failed to create trade');
    } finally {
      setSubmitting(false);
    }
  };

  const isGift = myOfferedCards.size > 0 && wantedCards.size === 0;
  const isRequest = myOfferedCards.size === 0 && wantedCards.size > 0;

  const goToNextStep = () => {
    if (mobileStep === 'want') setMobileStep('give');
    else if (mobileStep === 'give') setMobileStep('review');
  };

  const goToPrevStep = () => {
    if (mobileStep === 'review') setMobileStep('give');
    else if (mobileStep === 'give' && !isGiftMode) setMobileStep('want');
  };

  const canSubmit = myOfferedCards.size > 0 || wantedCards.size > 0;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-0 md:p-4">
      <div className="bg-gray-800 w-full h-full md:rounded-lg md:w-full md:max-w-6xl md:max-h-[90vh] overflow-hidden flex flex-col">

        {/* ============ MOBILE VIEW ============ */}
        <div className="flex flex-col h-full md:hidden">
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowLeftRight size={20} className="text-blue-400 flex-shrink-0" />
              <h2 className="font-bold truncate">Trade with {receiverUsername}</h2>
            </div>
            <button onClick={onClose} className="p-2 -mr-2 active:bg-gray-700 rounded-lg">
              <X size={20} />
            </button>
          </div>

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
                <span className={`text-sm ${isGiftMode ? 'text-purple-400' : 'text-gray-400'}`}>
                  Gift (I don't want anything back)
                </span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-center gap-2 p-2 bg-gray-900/50">
            {!isGiftMode && (
              <>
                <div className={`w-2 h-2 rounded-full ${mobileStep === 'want' ? 'bg-blue-500' : 'bg-gray-600'}`} />
                <span className={`text-xs ${mobileStep === 'want' ? 'text-blue-400' : 'text-gray-500'}`}>I Want</span>
                <ArrowRight size={14} className="text-gray-500" />
              </>
            )}
            <div className={`w-2 h-2 rounded-full ${mobileStep === 'give' ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className={`text-xs ${mobileStep === 'give' ? 'text-green-400' : 'text-gray-500'}`}>I Give</span>
            <ArrowRight size={14} className="text-gray-500" />
            <div className={`w-2 h-2 rounded-full ${mobileStep === 'review' ? 'bg-purple-500' : 'bg-gray-600'}`} />
            <span className={`text-xs ${mobileStep === 'review' ? 'text-purple-400' : 'text-gray-500'}`}>Review</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
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
                  searchValue={theirCollectionSearch}
                  onSearchChange={setTheirCollectionSearch}
                  searchPlaceholder="Search their cards..."
                />
              </div>
            )}

            {mobileStep === 'give' && (
              <div>
                <h3 className="text-sm font-semibold text-green-400 mb-3">
                  Select cards to {isGiftMode ? 'gift' : 'offer'}
                </h3>
                <CollectionGrid
                  items={myCollection}
                  selectedCards={myOfferedCards}
                  onAdd={addToOffer}
                  onRemove={removeFromOffer}
                  emptyMessage="Your collection is empty"
                  selectionColor="green"
                  searchValue={myCollectionSearch}
                  onSearchChange={setMyCollectionSearch}
                  searchPlaceholder="Search my cards..."
                />
              </div>
            )}

            {mobileStep === 'review' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-purple-400">Review Trade</h3>
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
                  {!isGiftMode && <TradeBalance give={myOfferedCards} want={wantedCards} />}
                </div>
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

          <div className="border-t border-gray-700 p-3 flex gap-2">
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
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <ArrowLeftRight size={24} className="text-blue-400" />
              <h2 className="text-xl font-bold">{editMode ? 'Edit Trade' : `Trade with ${receiverUsername}`}</h2>
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
                <span className={`text-sm ${isGiftMode ? 'text-purple-400' : 'text-gray-400'}`}>Gift mode</span>
              </label>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 p-4 border-r border-gray-700 overflow-y-auto">
              <h3 className="text-lg font-semibold mb-3 text-green-400">My Collection (I give)</h3>
              <CollectionGrid
                items={myCollection}
                selectedCards={myOfferedCards}
                onAdd={addToOffer}
                onRemove={removeFromOffer}
                emptyMessage="Your collection is empty"
                selectionColor="green"
                searchValue={myCollectionSearch}
                onSearchChange={setMyCollectionSearch}
                searchPlaceholder="Search my cards..."
              />
            </div>

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
                  searchValue={theirCollectionSearch}
                  onSearchChange={setTheirCollectionSearch}
                  searchPlaceholder="Search their cards..."
                />
              </div>
            )}
          </div>

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

            {!isGiftMode && (
              <div className="mb-4 max-w-xs">
                <TradeBalance give={myOfferedCards} want={wantedCards} />
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
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
