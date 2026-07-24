import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Clock, History, X, AlertTriangle } from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import {
  getTrades,
  getTradeHistory,
  cancelTrade,
  Trade,
  TradeItem,
} from '../../services/tradesService';
import { getCardsByIds } from '../../services/api';
import { Card } from '../../types';
import { profileDisplayName } from '../../utils/profileName';
import TradeDetail from '../TradeDetail';
import ConfirmModal from '../ConfirmModal';

type TradesSubTab = 'pending' | 'history';

interface TradeRealtimeRow {
  user1_id: string;
  user2_id: string;
}

interface TradesData {
  pendingTrades: Trade[];
  tradeHistory: Trade[];
  // Plain object (not Map): TanStack Query structural sharing drops Map/Set.
  tradeCardDetails: Record<string, Card>;
}

const EMPTY_TRADES: Trade[] = [];
const EMPTY_CARD_DETAILS: Record<string, Card> = {};

/** Trades tab: pending trades + history. Self-contained. */
export default function TradesTab() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tradesSubTab, setTradesSubTab] = useState<TradesSubTab>('pending');
  const [processingTradeId, setProcessingTradeId] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info' | 'success';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, variant: 'danger' });

  const loadTradesData = async (): Promise<TradesData> => {
    if (!user) return { pendingTrades: [], tradeHistory: [], tradeCardDetails: {} };
    const [pending, history] = await Promise.all([
      getTrades(user.id).then((trades) => trades.filter((t) => t.status === 'pending')),
      getTradeHistory(user.id),
    ]);

    const allCardIds = new Set<string>();
    [...pending, ...history].forEach((trade) => {
      trade.items?.forEach((item) => allCardIds.add(item.card_id));
    });

    const cardDetails: Record<string, Card> = {};
    if (allCardIds.size > 0) {
      const cards = await getCardsByIds(Array.from(allCardIds));
      cards.forEach((card) => {
        cardDetails[card.id] = card;
      });
    }

    return { pendingTrades: pending, tradeHistory: history, tradeCardDetails: cardDetails };
  };

  const { data: tradesData } = useQuery({
    queryKey: ['trades', user?.id],
    queryFn: loadTradesData,
    enabled: !!user,
  });

  const pendingTrades = tradesData?.pendingTrades ?? EMPTY_TRADES;
  const tradeHistory = tradesData?.tradeHistory ?? EMPTY_TRADES;
  const tradeCardDetails = tradesData?.tradeCardDetails ?? EMPTY_CARD_DETAILS;

  // Subscribe to trade changes.
  useEffect(() => {
    if (!user) return;

    const tradesChannel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        (payload: RealtimePostgresChangesPayload<TradeRealtimeRow>) => {
          // Filter for trades involving this user
          const newData = (payload.new || payload.old) as Partial<TradeRealtimeRow>;
          if (newData && (newData.user1_id === user.id || newData.user2_id === user.id)) {
            console.log('Trade change:', payload);
            queryClient.invalidateQueries({ queryKey: ['trades', user.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
    };
  }, [user, queryClient]);

  const handleCancelTrade = (tradeId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Trade',
      message: 'Cancel this trade offer?',
      variant: 'warning',
      onConfirm: async () => {
        setProcessingTradeId(tradeId);
        try {
          await cancelTrade(tradeId);
          queryClient.invalidateQueries({ queryKey: ['trades', user?.id] });
          toast.info('Trade cancelled');
        } catch {
          toast.error('Error cancelling trade');
        } finally {
          setProcessingTradeId(null);
        }
      },
    });
  };

  // ============ RENDER HELPERS ============
  const calculateTradeItemsPrice = (items: TradeItem[] | undefined, ownerId: string): number => {
    const ownerItems = items?.filter((i) => i.owner_id === ownerId) || [];
    return ownerItems.reduce((total, item) => {
      const card = tradeCardDetails[item.card_id];
      const price = card?.prices?.usd ? parseFloat(card.prices.usd) : 0;
      return total + (price * item.quantity);
    }, 0);
  };

  const renderTradeItems = (items: TradeItem[] | undefined, ownerId: string, label: string) => {
    const ownerItems = items?.filter((i) => i.owner_id === ownerId) || [];
    const totalPrice = calculateTradeItemsPrice(items, ownerId);

    if (ownerItems.length === 0) {
      return (
        <div>
          <p className="text-gray-400 text-xs mb-1">{label}:</p>
          <p className="text-gray-500 text-xs">Gift</p>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-gray-400 text-xs">{label}:</p>
          <p className="text-green-400 text-xs font-semibold">${totalPrice.toFixed(2)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {ownerItems.map((item) => {
            const card = tradeCardDetails[item.card_id];
            return (
              <div key={item.id} className="flex items-center gap-1 bg-gray-700 px-2 py-0.5 rounded text-xs">
                <span className="truncate max-w-[100px]">{card?.name || 'Card'}</span>
                {item.quantity > 1 && <span className="text-gray-400">x{item.quantity}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Sub tabs */}
      <div className="flex gap-1">
        <button
          onClick={() => setTradesSubTab('pending')}
          className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
            tradesSubTab === 'pending' ? 'bg-blue-600' : 'bg-gray-800'
          }`}
        >
          <Clock size={14} />
          Pending ({pendingTrades.length})
        </button>
        <button
          onClick={() => setTradesSubTab('history')}
          className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
            tradesSubTab === 'history' ? 'bg-blue-600' : 'bg-gray-800'
          }`}
        >
          <History size={14} />
          History
        </button>
      </div>

      {/* Trades List */}
      {(tradesSubTab === 'pending' ? pendingTrades : tradeHistory).length === 0 ? (
        <p className="text-gray-400 text-center py-8 text-sm">
          {tradesSubTab === 'pending' ? 'No pending trades' : 'No history'}
        </p>
      ) : (
        <div className="space-y-3">
          {(tradesSubTab === 'pending' ? pendingTrades : tradeHistory).map((trade) => {
            const isUser1 = trade.user1_id === user?.id;
            const myUserId = user?.id || '';
            const otherUserId = isUser1 ? trade.user2_id : trade.user1_id;
            const otherUser = isUser1 ? trade.user2 : trade.user1;
            const myConfirmed = isUser1 ? trade.user1_confirmed : trade.user2_confirmed;
            const theirConfirmed = isUser1 ? trade.user2_confirmed : trade.user1_confirmed;
            const someoneConfirmed = trade.user1_confirmed || trade.user2_confirmed;
            const statusColors: Record<string, string> = {
              completed: 'text-green-400',
              declined: 'text-red-400',
              cancelled: 'text-gray-400',
              pending: 'text-yellow-400',
            };

            // Compact status + confirmation summary.
            let statusLabel: string = trade.status;
            if (trade.status === 'pending') {
              const marks = [
                myConfirmed ? 'you ✓' : null,
                theirConfirmed ? 'them ✓' : null,
              ].filter(Boolean);
              statusLabel = marks.length
                ? `Awaiting · ${marks.join(' ')}`
                : 'Awaiting confirmations';
            } else if (trade.status === 'completed') {
              statusLabel = 'Completed';
            }

            // Both users can view details for pending trades
            const canViewDetails = trade.status === 'pending';

            return (
              <div
                key={trade.id}
                className={`bg-gray-800 rounded-lg p-3 space-y-2 ${
                  canViewDetails ? 'cursor-pointer hover:bg-gray-750 transition-colors' : ''
                }`}
                onClick={() => canViewDetails && setSelectedTrade(trade)}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowLeftRight size={16} className="text-blue-400 flex-shrink-0" />
                    <span className="text-sm truncate">
                      With: <strong>{otherUser ? profileDisplayName(otherUser) : ''}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {trade.status === 'pending' && !trade.is_valid && (
                      <span title="Trade no longer valid">
                        <AlertTriangle size={14} className="text-red-400" />
                      </span>
                    )}
                    <span className={`text-xs ${statusColors[trade.status]}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {renderTradeItems(trade.items, myUserId, 'You Give')}
                  {renderTradeItems(trade.items, otherUserId, 'You Get')}
                </div>

                {canViewDetails && (
                  <p className="text-xs text-blue-400 text-center pt-1">
                    Tap to view details
                  </p>
                )}

                {/* Cancel only while neither side has confirmed — terms lock on first confirmation. */}
                {tradesSubTab === 'pending' && !someoneConfirmed && (
                  <div className="flex gap-2 pt-2 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleCancelTrade(trade.id)}
                      disabled={processingTradeId === trade.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] bg-gray-700 rounded-lg text-sm"
                    >
                      <X size={14} /> Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trade Detail Modal */}
      {selectedTrade && (
        <TradeDetail
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onTradeUpdated={() => {
            setSelectedTrade(null);
            queryClient.invalidateQueries({ queryKey: ['trades', user?.id] });
          }}
        />
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
}
