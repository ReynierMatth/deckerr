import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ArrowLeftRight, ArrowRight, Gift, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getUserCollection, getCardsByIds } from '../services/api';
import { createTrade, updateTrade } from '../services/tradesService';
import { Card } from '../types';
import CollectionGrid from './trade/CollectionGrid';
import TradeOfferPanel from './trade/TradeOfferPanel';
import TradeReviewStep from './trade/TradeReviewStep';
import TradeMobileFooter from './trade/TradeMobileFooter';
import { CollectionItem, SelectedCard } from './trade/types';

const EMPTY_COLLECTION: CollectionItem[] = [];

type SelectionSetter = React.Dispatch<React.SetStateAction<Map<string, SelectedCard>>>;

// The offered and wanted sides share identical add/remove semantics; only the
// underlying state setter differs.
const addCardToSelection = (setSelection: SelectionSetter) => (card: Card, maxQuantity: number) => {
  setSelection((prev) => {
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

const removeCardFromSelection = (setSelection: SelectionSetter) => (cardId: string) => {
  setSelection((prev) => {
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
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  const [isGiftMode, setIsGiftMode] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>('want');

  const [myOfferedCards, setMyOfferedCards] = useState<Map<string, SelectedCard>>(new Map());
  const [wantedCards, setWantedCards] = useState<Map<string, SelectedCard>>(new Map());

  const [myCollectionSearch, setMyCollectionSearch] = useState('');
  const [theirCollectionSearch, setTheirCollectionSearch] = useState('');

  // My full collection joined with card data (never returns Map/Set: arrays only).
  const { data: myCollectionData, isPending: loading } = useQuery({
    queryKey: ['collection', user?.id, 'full'],
    enabled: !!user,
    queryFn: async (): Promise<CollectionItem[]> => {
      const collectionMap = await getUserCollection(user!.id);
      if (collectionMap.size === 0) return [];

      const cardIds = Array.from(collectionMap.keys());
      const cards = await getCardsByIds(cardIds);

      return cards.map((card) => ({
        card,
        quantity: collectionMap.get(card.id) || 0,
      }));
    },
  });
  const myCollection = myCollectionData ?? EMPTY_COLLECTION;

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

  const addToOffer = addCardToSelection(setMyOfferedCards);
  const removeFromOffer = removeCardFromSelection(setMyOfferedCards);
  const addToWanted = addCardToSelection(setWantedCards);
  const removeFromWanted = removeCardFromSelection(setWantedCards);

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

      // Realtime also covers these, but invalidate eagerly so lists/badges
      // update even if the websocket is flaky.
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['communityPendingTrades'] });

      onTradeCreated();
    } catch (error) {
      console.error('Error with trade:', error);
      toast.error(editMode ? 'Failed to update trade' : 'Failed to create trade');
    } finally {
      setSubmitting(false);
    }
  };

  const goToNextStep = () => {
    if (mobileStep === 'want') setMobileStep('give');
    else if (mobileStep === 'give') setMobileStep('review');
  };

  const goToPrevStep = () => {
    if (mobileStep === 'review') setMobileStep('give');
    else if (mobileStep === 'give' && !isGiftMode) setMobileStep('want');
  };

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
              <TradeReviewStep
                myOfferedCards={myOfferedCards}
                wantedCards={wantedCards}
                onRemoveFromOffer={removeFromOffer}
                onRemoveFromWanted={removeFromWanted}
                isGiftMode={isGiftMode}
                message={message}
                onMessageChange={setMessage}
              />
            )}
          </div>

          <TradeMobileFooter
            mobileStep={mobileStep}
            isGiftMode={isGiftMode}
            myOfferedCards={myOfferedCards}
            wantedCards={wantedCards}
            submitting={submitting}
            onPrevStep={goToPrevStep}
            onNextStep={goToNextStep}
            onClose={onClose}
            onSubmit={handleSubmit}
          />
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

          <TradeOfferPanel
            myOfferedCards={myOfferedCards}
            wantedCards={wantedCards}
            onRemoveFromOffer={removeFromOffer}
            onRemoveFromWanted={removeFromWanted}
            isGiftMode={isGiftMode}
            message={message}
            onMessageChange={setMessage}
            onClose={onClose}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}
