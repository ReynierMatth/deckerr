import React, { useState, useEffect } from 'react';
import { X, Check, ArrowLeftRight, DollarSign, Loader2, RefreshCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Trade, TradeItem } from '../services/tradesService';
import { Card } from '../types';
import { getCardsByIds } from '../services/api';

interface TradeDetailProps {
  trade: Trade;
  onClose: () => void;
  onAccept: (tradeId: string) => Promise<void>;
  onDecline: (tradeId: string) => Promise<void>;
  onCounterOffer: (trade: Trade, senderCards: Card[], receiverCards: Card[]) => void;
}

interface TradeCardItem {
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
  onCounterOffer,
}: TradeDetailProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [senderCards, setSenderCards] = useState<TradeCardItem[]>([]);
  const [receiverCards, setReceiverCards] = useState<TradeCardItem[]>([]);

  const isSender = trade.sender_id === user?.id;
  const isReceiver = trade.receiver_id === user?.id;
  const otherUser = isSender ? trade.receiver : trade.sender;

  useEffect(() => {
    loadTradeCards();
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

  const handleCounterOffer = () => {
    const senderCardsList = senderCards.map(item => item.card);
    const receiverCardsList = receiverCards.map(item => item.card);
    onCounterOffer(trade, senderCardsList, receiverCardsList);
    onClose();
  };

  const senderPrice = calculateTotalPrice(senderCards);
  const receiverPrice = calculateTotalPrice(receiverCards);

  const yourCards = isSender ? senderCards : receiverCards;
  const theirCards = isSender ? receiverCards : senderCards;
  const yourPrice = isSender ? senderPrice : receiverPrice;
  const theirPrice = isSender ? receiverPrice : senderPrice;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-gray-900 w-full md:max-w-4xl md:rounded-2xl flex flex-col max-h-screen md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-blue-400" />
            <div>
              <h2 className="text-lg font-bold">Trade Details</h2>
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
          )}

          {/* Message */}
          {trade.message && (
            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Message:</p>
              <p className="text-sm">{trade.message}</p>
            </div>
          )}

          {/* Price Difference */}
          {!loading && (senderPrice > 0 || receiverPrice > 0) && (
            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Value Difference:</span>
                <span className={Math.abs(senderPrice - receiverPrice) > 5 ? 'text-yellow-400' : 'text-gray-300'}>
                  ${Math.abs(senderPrice - receiverPrice).toFixed(2)}
                  {senderPrice > receiverPrice ? ' in your favor' : senderPrice < receiverPrice ? ' in their favor' : ' (balanced)'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions - Only for pending trades */}
        {trade.status === 'pending' && !loading && (
          <div className="border-t border-gray-800 p-4 space-y-2">
            {isReceiver ? (
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition"
                >
                  <RefreshCcw size={18} />
                  Make Counter Offer
                </button>
              </>
            ) : (
              <p className="text-center text-gray-400 text-sm py-2">
                Waiting for {otherUser?.username} to respond...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
