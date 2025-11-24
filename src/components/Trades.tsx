import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, Check, X, Clock, History, Plus, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getTrades,
  getTradeHistory,
  acceptTrade,
  declineTrade,
  cancelTrade,
  Trade,
  TradeItem,
} from '../services/tradesService';
import { getCardsByIds } from '../services/api';
import { Card } from '../types';

type Tab = 'pending' | 'history';

interface TradeWithCards extends Trade {
  cardDetails?: Map<string, Card>;
}

export default function Trades() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [pendingTrades, setPendingTrades] = useState<TradeWithCards[]>([]);
  const [tradeHistory, setTradeHistory] = useState<TradeWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingTradeId, setProcessingTradeId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadTrades();
    }
  }, [user]);

  const loadTrades = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pending, history] = await Promise.all([
        getTrades(user.id).then((trades) => trades.filter((t) => t.status === 'pending')),
        getTradeHistory(user.id),
      ]);

      // Load card details for all trades
      const allCardIds = new Set<string>();
      [...pending, ...history].forEach((trade) => {
        trade.items?.forEach((item) => allCardIds.add(item.card_id));
      });

      let cardDetails = new Map<string, Card>();
      if (allCardIds.size > 0) {
        const cards = await getCardsByIds(Array.from(allCardIds));
        cards.forEach((card) => cardDetails.set(card.id, card));
      }

      setPendingTrades(pending.map((t) => ({ ...t, cardDetails })));
      setTradeHistory(history.map((t) => ({ ...t, cardDetails })));
    } catch (error) {
      console.error('Error loading trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (tradeId: string) => {
    setProcessingTradeId(tradeId);
    try {
      const success = await acceptTrade(tradeId);
      if (success) {
        await loadTrades();
      } else {
        alert('Failed to execute trade. Please check your collection.');
      }
    } catch (error) {
      console.error('Error accepting trade:', error);
      alert('Error accepting trade');
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleDecline = async (tradeId: string) => {
    setProcessingTradeId(tradeId);
    try {
      await declineTrade(tradeId);
      await loadTrades();
    } catch (error) {
      console.error('Error declining trade:', error);
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleCancel = async (tradeId: string) => {
    if (!confirm('Cancel this trade offer?')) return;
    setProcessingTradeId(tradeId);
    try {
      await cancelTrade(tradeId);
      await loadTrades();
    } catch (error) {
      console.error('Error cancelling trade:', error);
    } finally {
      setProcessingTradeId(null);
    }
  };

  const getStatusColor = (status: Trade['status']) => {
    switch (status) {
      case 'accepted':
        return 'text-green-400';
      case 'declined':
        return 'text-red-400';
      case 'cancelled':
        return 'text-gray-400';
      default:
        return 'text-yellow-400';
    }
  };

  const renderTradeItems = (
    items: TradeItem[] | undefined,
    ownerId: string,
    cardDetails: Map<string, Card> | undefined,
    label: string
  ) => {
    const ownerItems = items?.filter((i) => i.owner_id === ownerId) || [];
    if (ownerItems.length === 0) {
      return (
        <div className="text-gray-500 text-sm italic">
          {label}: Nothing (gift)
        </div>
      );
    }

    return (
      <div>
        <div className="text-gray-400 text-sm mb-1">{label}:</div>
        <div className="flex flex-wrap gap-2">
          {ownerItems.map((item) => {
            const card = cardDetails?.get(item.card_id);
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 bg-gray-700 px-2 py-1 rounded text-sm"
              >
                {card?.image_uris?.small && (
                  <img
                    src={card.image_uris.small}
                    alt={card.name}
                    className="w-8 h-11 rounded"
                  />
                )}
                <span>{card?.name || item.card_id}</span>
                {item.quantity > 1 && (
                  <span className="text-gray-400">x{item.quantity}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTrade = (trade: TradeWithCards, showActions: boolean) => {
    const isSender = trade.sender_id === user?.id;
    const otherUser = isSender ? trade.receiver : trade.sender;

    return (
      <div key={trade.id} className="bg-gray-800 rounded-lg p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-blue-400" />
            <span className="font-medium">
              {isSender ? `To: ${otherUser?.username}` : `From: ${otherUser?.username}`}
            </span>
          </div>
          <span className={`text-sm capitalize ${getStatusColor(trade.status)}`}>
            {trade.status}
          </span>
        </div>

        {/* Trade Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderTradeItems(
            trade.items,
            trade.sender_id,
            trade.cardDetails,
            isSender ? 'You give' : 'They give'
          )}
          {renderTradeItems(
            trade.items,
            trade.receiver_id,
            trade.cardDetails,
            isSender ? 'You receive' : 'They receive'
          )}
        </div>

        {/* Message */}
        {trade.message && (
          <div className="text-gray-400 text-sm">
            <span className="text-gray-500">Message:</span> {trade.message}
          </div>
        )}

        {/* Actions */}
        {showActions && trade.status === 'pending' && (
          <div className="flex gap-2 pt-2 border-t border-gray-700">
            {isSender ? (
              <button
                onClick={() => handleCancel(trade.id)}
                disabled={processingTradeId === trade.id}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
              >
                <X size={16} />
                Cancel
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleAccept(trade.id)}
                  disabled={processingTradeId === trade.id}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition text-sm"
                >
                  {processingTradeId === trade.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <Check size={16} />
                  )}
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(trade.id)}
                  disabled={processingTradeId === trade.id}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition text-sm"
                >
                  <X size={16} />
                  Decline
                </button>
              </>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="text-gray-500 text-xs">
          {new Date(trade.created_at || '').toLocaleDateString()}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Trades</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'pending'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Clock size={18} />
            Pending ({pendingTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <History size={18} />
            History
          </button>
        </div>

        {/* Pending Trades */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            {pendingTrades.length === 0 ? (
              <div className="text-center py-12">
                <Package size={48} className="mx-auto text-gray-600 mb-4" />
                <p className="text-gray-400">No pending trades</p>
                <p className="text-gray-500 text-sm mt-2">
                  Visit a friend's collection to propose a trade
                </p>
              </div>
            ) : (
              pendingTrades.map((trade) => renderTrade(trade, true))
            )}
          </div>
        )}

        {/* Trade History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {tradeHistory.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No trade history yet</p>
            ) : (
              tradeHistory.map((trade) => renderTrade(trade, false))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
