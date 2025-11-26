import React, { useState, useEffect } from 'react';
import { X, Check, ArrowLeftRight, DollarSign, Loader2, Edit, RefreshCcw, History } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Trade, TradeHistoryEntry, getTradeVersionHistory } from '../services/tradesService';
import { getUserCollection, getCardsByIds } from '../services/api';
import { Card } from '../types';
import TradeCreator from './TradeCreator';

interface TradeDetailProps {
  trade: Trade;
  onClose: () => void;
  onAccept: (tradeId: string) => Promise<void>;
  onDecline: (tradeId: string) => Promise<void>;
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

function calculateTotalPrice(items: TradeCardItem[]): number {
  return items.reduce((total, { card, quantity }) => {
    const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
    return total + (price * quantity);
  }, 0);
}

export default function TradeDetail({
  trade,
  onClose,
  onAccept,
  onDecline,
  onTradeUpdated,
}: TradeDetailProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [senderCards, setSenderCards] = useState<TradeCardItem[]>([]);
  const [receiverCards, setReceiverCards] = useState<TradeCardItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<TradeHistoryEntry[]>([]);
  const [showEditMode, setShowEditMode] = useState(false);
  const [editReceiverCollection, setEditReceiverCollection] = useState<CollectionItem[]>([]);

  const isSender = trade.sender_id === user?.id;
  const isReceiver = trade.receiver_id === user?.id;
  const otherUser = isSender ? trade.receiver : trade.sender;

  useEffect(() => {
    loadTradeCards();
    loadTradeHistory();
  }, [trade]);

  const loadTradeCards = async () => {
    setLoading(true);
    try {
      const allCardIds = trade.items?.map(item => item.card_id) || [];
      if (allCardIds.length === 0) {
        setSenderCards([]);
        setReceiverCards([]);
        return;
      }

      const cards = await getCardsByIds(allCardIds);
      const cardMap = new Map<string, Card>();
      cards.forEach(card => cardMap.set(card.id, card));

      const senderItems: TradeCardItem[] = [];
      const receiverItems: TradeCardItem[] = [];

      trade.items?.forEach(item => {
        const card = cardMap.get(item.card_id);
        if (!card) return;

        if (item.owner_id === trade.sender_id) {
          senderItems.push({ card, quantity: item.quantity });
        } else {
          receiverItems.push({ card, quantity: item.quantity });
        }
      });

      setSenderCards(senderItems);
      setReceiverCards(receiverItems);
    } catch (error) {
      console.error('Error loading trade cards:', error);
      toast.error('Failed to load trade details');
    } finally {
      setLoading(false);
    }
  };

  const loadTradeHistory = async () => {
    try {
      const historyData = await getTradeVersionHistory(trade.id);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading trade history:', error);
    }
  };

  const handleAccept = async () => {
    setProcessing(true);
    try {
      await onAccept(trade.id);
      onClose();
    } catch (error) {
      console.error('Error accepting trade:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      await onDecline(trade.id);
      onClose();
    } catch (error) {
      console.error('Error declining trade:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleEdit = async () => {
    try {
      // Load the other user's collection for editing
      const otherUserId = isSender ? trade.receiver_id : trade.sender_id;
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

  const handleCounterOffer = async () => {
    try {
      // For counter-offer, load sender's collection and swap the cards
      const collectionMap = await getUserCollection(trade.sender_id);
      const cardIds = Array.from(collectionMap.keys());
      const cards = await getCardsByIds(cardIds);
      const collection = cards.map((card) => ({
        card,
        quantity: collectionMap.get(card.id) || 0,
      }));

      setEditReceiverCollection(collection);
      setShowEditMode('counter');
    } catch (error) {
      console.error('Error loading collection for counter-offer:', error);
      toast.error('Failed to load collection');
    }
  };

  const senderPrice = calculateTotalPrice(senderCards);
  const receiverPrice = calculateTotalPrice(receiverCards);

  const yourCards = isSender ? senderCards : receiverCards;
  const theirCards = isSender ? receiverCards : senderCards;
  const yourPrice = isSender ? senderPrice : receiverPrice;
  const theirPrice = isSender ? receiverPrice : senderPrice;

  // For edit mode, determine initial cards based on mode
  // Include quantity in the card object so TradeCreator can preserve it
  const isCounterOffer = showEditMode === 'counter';
  const editInitialSenderCards = isCounterOffer
    ? theirCards.map(c => ({ ...c.card, quantity: c.quantity }))
    : yourCards.map(c => ({ ...c.card, quantity: c.quantity }));
  const editInitialReceiverCards = isCounterOffer
    ? yourCards.map(c => ({ ...c.card, quantity: c.quantity }))
    : theirCards.map(c => ({ ...c.card, quantity: c.quantity }));

  if (showEditMode) {
    return (
      <TradeCreator
        receiverId={isSender ? trade.receiver_id : trade.sender_id}
        receiverUsername={otherUser?.username || 'User'}
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
                {isSender ? 'To' : 'From'}: {otherUser?.username}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Your Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-400">
                      {isSender ? 'You Give' : 'You Receive'}
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
                        <div key={idx} className="relative rounded-lg overflow-hidden">
                          <img
                            src={item.card.image_uris?.small || item.card.image_uris?.normal}
                            alt={item.card.name}
                            className="w-full h-auto"
                          />
                          {item.quantity > 1 && (
                            <div className="absolute top-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded font-semibold">
                              x{item.quantity}
                            </div>
                          )}
                          {item.card.prices?.usd && (
                            <div className="absolute bottom-1 left-1 bg-gray-900/90 text-white text-[10px] px-1 py-0.5 rounded">
                              ${item.card.prices.usd}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Their Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-blue-400">
                      {isSender ? 'You Receive' : 'They Give'}
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
                        <div key={idx} className="relative rounded-lg overflow-hidden">
                          <img
                            src={item.card.image_uris?.small || item.card.image_uris?.normal}
                            alt={item.card.name}
                            className="w-full h-auto"
                          />
                          {item.quantity > 1 && (
                            <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-semibold">
                              x{item.quantity}
                            </div>
                          )}
                          {item.card.prices?.usd && (
                            <div className="absolute bottom-1 left-1 bg-gray-900/90 text-white text-[10px] px-1 py-0.5 rounded">
                              ${item.card.prices.usd}
                            </div>
                          )}
                        </div>
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
              {!loading && (senderPrice > 0 || receiverPrice > 0) && (
                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Value Difference:</span>
                    <span className={Math.abs(senderPrice - receiverPrice) > 5 ? 'text-yellow-400' : 'text-gray-300'}>
                      ${Math.abs(senderPrice - receiverPrice).toFixed(2)}
                      {senderPrice > receiverPrice ? ' in sender favor' : senderPrice < receiverPrice ? ' in receiver favor' : ' (balanced)'}
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
                              Edited by {entry.editor?.username} • {new Date(entry.created_at).toLocaleDateString()}
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

        {/* Actions - Only for pending trades */}
        {trade.status === 'pending' && !loading && (
          <div className="border-t border-gray-800 p-4 space-y-2">
            {/* Only the user who DIDN'T make the last edit can respond */}
            {trade.editor_id && trade.editor_id !== user?.id ? (
              /* User receives the last edit - can accept/decline/counter */
              <>
                <div className="flex gap-2">
                  <button
                    onClick={handleAccept}
                    disabled={processing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                  >
                    {processing ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <Check size={18} />
                        Accept Trade
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDecline}
                    disabled={processing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                  >
                    <X size={18} />
                    Decline
                  </button>
                </div>
                <button
                  onClick={handleCounterOffer}
                  disabled={processing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                >
                  <RefreshCcw size={18} />
                  Make Counter Offer
                </button>
              </>
            ) : trade.editor_id === user?.id ? (
              /* User made the last edit - waiting for response */
              <p className="text-center text-gray-400 text-sm py-2">
                Waiting for {otherUser?.username} to respond...
              </p>
            ) : (
              /* No editor yet (version 1) - original flow */
              <>
                {isSender ? (
                  <button
                    onClick={handleEdit}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                  >
                    <Edit size={18} />
                    Edit Trade Offer
                  </button>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAccept}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                      >
                        {processing ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <>
                            <Check size={18} />
                            Accept Trade
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleDecline}
                        disabled={processing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                      >
                        <X size={18} />
                        Decline
                      </button>
                    </div>
                    <button
                      onClick={handleCounterOffer}
                      disabled={processing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                    >
                      <RefreshCcw size={18} />
                      Make Counter Offer
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
