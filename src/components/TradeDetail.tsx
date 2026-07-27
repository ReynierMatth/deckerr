import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Check, ArrowLeftRight, DollarSign, Loader2, Edit, RefreshCcw, History, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBackDismiss } from '../hooks/useBackDismiss';
import {
  Trade,
  TradeHistoryEntry,
  getTradeVersionHistory,
  confirmTrade,
  declineTrade,
  cancelTrade,
} from '../services/tradesService';
import { getUserCollection, getCardsByIds } from '../services/api';
import { Card } from '../types';
import { profileDisplayName, profileHandleLabel } from '../utils/profileName';
import TradeCreator from './TradeCreator';
import CardTile from './card/CardTile';

interface TradeDetailProps {
  trade: Trade;
  onClose: () => void;
  onTradeUpdated: () => void;
}

interface TradeCardItem {
  card: Card;
  quantity: number;
}

interface CollectionItem {
  card: Card;
  quantity: number;
}

interface TradeCards {
  myItems: TradeCardItem[];
  theirItems: TradeCardItem[];
}

const EMPTY_HISTORY: TradeHistoryEntry[] = [];
const EMPTY_TRADE_ITEMS: TradeCardItem[] = [];

function calculateTotalPrice(items: TradeCardItem[]): number {
  return items.reduce((total, { card, quantity }) => {
    const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
    return total + (price * quantity);
  }, 0);
}

export default function TradeDetail({
  trade,
  onClose,
  onTradeUpdated,
}: TradeDetailProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEditMode, setShowEditMode] = useState(false);
  // Back exits edit mode back to the trade detail (not the whole page).
  useBackDismiss(showEditMode, () => setShowEditMode(false));
  const [editReceiverCollection, setEditReceiverCollection] = useState<CollectionItem[]>([]);

  const isUser1 = trade.user1_id === user?.id;
  const otherUser = isUser1 ? trade.user2 : trade.user1;
  const myUserId = user?.id || '';
  const otherUserId = isUser1 ? trade.user2_id : trade.user1_id;

  // Per-side confirmation of the physical exchange.
  const myConfirmed = isUser1 ? trade.user1_confirmed : trade.user2_confirmed;
  const theirConfirmed = isUser1 ? trade.user2_confirmed : trade.user1_confirmed;
  const someoneConfirmed = trade.user1_confirmed || trade.user2_confirmed;

  // Card details for both sides of the trade. Version is part of the key so an
  // edited trade (new items) refetches; myUserId keeps the you/them split right.
  const {
    data: tradeCards,
    isLoading: loading,
    isError: tradeCardsFailed,
  } = useQuery({
    queryKey: ['trade', trade.id, 'cards', trade.version, myUserId],
    queryFn: async (): Promise<TradeCards> => {
      const allCardIds = trade.items?.map(item => item.card_id) || [];
      if (allCardIds.length === 0) {
        return { myItems: [], theirItems: [] };
      }

      const cards = await getCardsByIds(allCardIds);
      const cardsById: Record<string, Card> = {};
      cards.forEach(card => {
        cardsById[card.id] = card;
      });

      const myItems: TradeCardItem[] = [];
      const theirItems: TradeCardItem[] = [];

      trade.items?.forEach(item => {
        const card = cardsById[item.card_id];
        if (!card) return;

        if (item.owner_id === myUserId) {
          myItems.push({ card, quantity: item.quantity });
        } else {
          theirItems.push({ card, quantity: item.quantity });
        }
      });

      return { myItems, theirItems };
    },
  });

  const senderCards = tradeCards?.myItems ?? EMPTY_TRADE_ITEMS;
  const receiverCards = tradeCards?.theirItems ?? EMPTY_TRADE_ITEMS;

  // Surface the load failure as a toast, exactly once per failure.
  const { error: showErrorToast } = toast;
  useEffect(() => {
    if (tradeCardsFailed) {
      showErrorToast('Failed to load trade details');
    }
  }, [tradeCardsFailed, showErrorToast]);

  const { data: historyData } = useQuery({
    queryKey: ['tradeHistory', trade.id],
    queryFn: () => getTradeVersionHistory(trade.id),
  });
  const history = historyData ?? EMPTY_HISTORY;

  // Trade list + community badge caches shared by both participants' views.
  const invalidateTradeLists = () => {
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['trade'] });
    queryClient.invalidateQueries({ queryKey: ['communityPendingTrades'] });
  };

  // "I did the exchange": update only the confirming user's own collection.
  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await confirmTrade(trade.id);
      invalidateTradeLists();
      // The confirming user's collection just changed (cards given/received).
      queryClient.invalidateQueries({ queryKey: ['myCollection'] });
      queryClient.invalidateQueries({ queryKey: ['collection'] });
      queryClient.invalidateQueries({ queryKey: ['collectionValue'] });
      toast.success('Exchange confirmed — your collection was updated');
      onClose();
    } catch (error) {
      console.error('Error confirming trade:', error);
      toast.error('Failed to confirm exchange');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      await declineTrade(trade.id);
      invalidateTradeLists();
      toast.info('Trade declined');
      onClose();
    } catch (error) {
      console.error('Error declining trade:', error);
      toast.error('Error declining trade');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    setProcessing(true);
    try {
      await cancelTrade(trade.id);
      invalidateTradeLists();
      toast.info('Trade cancelled');
      onClose();
    } catch (error) {
      console.error('Error cancelling trade:', error);
      toast.error('Error cancelling trade');
    } finally {
      setProcessing(false);
    }
  };

  const handleEdit = async () => {
    try {
      // Load the other user's collection for editing
      const collectionMap = await getUserCollection(otherUserId);
      const cardIds = Array.from(collectionMap.keys());
      const cards = await getCardsByIds(cardIds);
      const collection = cards.map((card) => ({
        card,
        quantity: collectionMap.get(card.id) || 0,
      }));

      setEditReceiverCollection(collection);
      setShowEditMode(true);
    } catch (error) {
      console.error('Error loading collection for edit:', error);
      toast.error('Failed to load collection');
    }
  };

  // In the symmetric model, counter-offer is the same as edit
  const handleCounterOffer = handleEdit;

  // senderCards = myCards, receiverCards = theirCards (already calculated correctly)
  const yourCards = senderCards;
  const theirCards = receiverCards;
  const yourPrice = calculateTotalPrice(yourCards);
  const theirPrice = calculateTotalPrice(theirCards);

  // For edit mode, pre-populate with current cards
  // In the symmetric model, both edit and counter-offer use the same perspective:
  // - Your cards (what you're offering)
  // - Their cards (what you want)
  // Include quantity in the card object so TradeCreator can preserve it
  const editInitialSenderCards = yourCards.map(c => ({ ...c.card, quantity: c.quantity }));
  const editInitialReceiverCards = theirCards.map(c => ({ ...c.card, quantity: c.quantity }));

  if (showEditMode) {
    return (
      <TradeCreator
        receiverId={otherUserId}
        receiverUsername={otherUser ? profileDisplayName(otherUser) : 'User'}
        receiverCollection={editReceiverCollection}
        onClose={() => {
          setShowEditMode(false);
          onClose();
        }}
        onTradeCreated={() => {
          setShowEditMode(false);
          onTradeUpdated();
          onClose();
        }}
        editMode={true}
        existingTradeId={trade.id}
        initialSenderCards={editInitialSenderCards}
        initialReceiverCards={editInitialReceiverCards}
        initialMessage={trade.message || ''}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-gray-900 w-full md:max-w-4xl md:rounded-2xl flex flex-col max-h-screen md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-blue-400" />
            <div>
              <h2 className="text-lg font-bold">Trade Details {trade.version > 1 && `(v${trade.version})`}</h2>
              <p className="text-sm text-gray-400">
                With: {otherUser ? profileDisplayName(otherUser) : ''}
                {otherUser && profileHandleLabel(otherUser) && (
                  <span className="text-gray-500"> {profileHandleLabel(otherUser)}</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={48} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Invalid Trade Warning */}
              {trade.status === 'pending' && !trade.is_valid && (
                <div className="bg-red-900/30 border border-red-600 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-400 text-sm">Trade No Longer Valid</h4>
                    <p className="text-red-200 text-xs mt-1">
                      One or more cards in this trade are no longer available in the required quantities. Quantities are clamped to what you own when you confirm.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Your Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-400">
                      You Give
                    </h3>
                    <div className="flex items-center gap-1 text-green-400 text-sm">
                      <DollarSign size={14} />
                      {yourPrice.toFixed(2)}
                    </div>
                  </div>

                  {yourCards.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Gift (no cards)</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {yourCards.map((item, idx) => (
                        <CardTile
                          key={idx}
                          card={item.card}
                          imageSize="small"
                          className="relative rounded-lg overflow-hidden"
                          topRight={
                            item.quantity > 1 && (
                              <div className="absolute top-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded font-semibold">
                                x{item.quantity}
                              </div>
                            )
                          }
                          bottomLeft={
                            item.card.prices?.usd && (
                              <div className="absolute bottom-1 left-1 bg-gray-900/90 text-white text-[10px] px-1 py-0.5 rounded">
                                ${item.card.prices.usd}
                              </div>
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Their Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-blue-400">
                      You Receive
                    </h3>
                    <div className="flex items-center gap-1 text-blue-400 text-sm">
                      <DollarSign size={14} />
                      {theirPrice.toFixed(2)}
                    </div>
                  </div>

                  {theirCards.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Gift (no cards)</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {theirCards.map((item, idx) => (
                        <CardTile
                          key={idx}
                          card={item.card}
                          imageSize="small"
                          className="relative rounded-lg overflow-hidden"
                          topRight={
                            item.quantity > 1 && (
                              <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-semibold">
                                x{item.quantity}
                              </div>
                            )
                          }
                          bottomLeft={
                            item.card.prices?.usd && (
                              <div className="absolute bottom-1 left-1 bg-gray-900/90 text-white text-[10px] px-1 py-0.5 rounded">
                                ${item.card.prices.usd}
                              </div>
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              {trade.message && (
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Message:</p>
                  <p className="text-sm">{trade.message}</p>
                </div>
              )}

              {/* Price Difference */}
              {!loading && (yourPrice > 0 || theirPrice > 0) && (
                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Value Difference:</span>
                    <span className={Math.abs(yourPrice - theirPrice) > 5 ? 'text-yellow-400' : 'text-gray-300'}>
                      ${Math.abs(yourPrice - theirPrice).toFixed(2)}
                      {yourPrice > theirPrice ? ' in your favor' : yourPrice < theirPrice ? ' in their favor' : ' (balanced)'}
                    </span>
                  </div>
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <History size={16} />
                    {showHistory ? 'Hide' : 'Show'} History ({history.length} {history.length === 1 ? 'version' : 'versions'})
                  </button>

                  {showHistory && (
                    <div className="mt-3 space-y-2">
                      {history.map((entry) => (
                        <div key={entry.id} className="p-3 bg-gray-800 rounded-lg text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-purple-400">Version {entry.version}</span>
                            <span className="text-gray-400 text-xs">
                              Edited by {entry.editor ? profileDisplayName(entry.editor) : 'someone'} • {new Date(entry.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {entry.message && (
                            <p className="text-gray-300 text-xs">{entry.message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Completed: no actions, just the outcome. */}
        {trade.status === 'completed' && !loading && (
          <div className="border-t border-gray-800 p-4">
            <div className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-green-900/30 text-green-400 rounded-lg font-medium">
              <Check size={18} />
              Trade completed
            </div>
          </div>
        )}

        {/* Actions - Only while pending (negotiating / awaiting confirmations) */}
        {trade.status === 'pending' && !loading && (
          <div className="border-t border-gray-800 p-4 space-y-3">
            {/* Per-side confirmation status */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`rounded-lg p-2 text-center text-sm ${
                  myConfirmed ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-400'
                }`}
              >
                You: {myConfirmed ? 'confirmed ✓' : 'to confirm'}
              </div>
              <div
                className={`rounded-lg p-2 text-center text-sm ${
                  theirConfirmed ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-400'
                }`}
              >
                Them: {theirConfirmed ? 'confirmed ✓' : 'waiting'}
              </div>
            </div>

            {/* "I did the exchange": updates only the confirming user's collection. */}
            {!myConfirmed && (
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium transition"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Check size={18} />
                    I did the exchange
                  </>
                )}
              </button>
            )}

            {someoneConfirmed ? (
              /* Terms lock once anyone confirms — negotiation is over. */
              <p className="text-center text-gray-500 text-xs">
                Terms are locked once someone confirms.
              </p>
            ) : (
              <>
                {/* Counter-offer / edit (turn-based). Same handler in the symmetric model. */}
                {trade.editor_id === user?.id ? (
                  <>
                    <p className="text-center text-gray-400 text-sm">
                      Waiting for {otherUser ? profileDisplayName(otherUser) : 'the other user'} to respond...
                    </p>
                    <button
                      onClick={handleEdit}
                      disabled={processing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                    >
                      <Edit size={18} />
                      Modify Your Offer
                    </button>
                  </>
                ) : !trade.editor_id && isUser1 ? (
                  <button
                    onClick={handleEdit}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                  >
                    <Edit size={18} />
                    Edit Trade Offer
                  </button>
                ) : (
                  <button
                    onClick={handleCounterOffer}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                  >
                    <RefreshCcw size={18} />
                    Make Counter Offer
                  </button>
                )}

                {/* Cancel (sender) / Decline (recipient) — only while neither side has confirmed. */}
                {isUser1 ? (
                  <button
                    onClick={handleCancel}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg font-medium transition"
                  >
                    <X size={18} />
                    Cancel Trade
                  </button>
                ) : (
                  <button
                    onClick={handleDecline}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                  >
                    <X size={18} />
                    Decline
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
