import { Send, Gift, Loader2 } from 'lucide-react';
import SelectedCardsSummary from './SelectedCardsSummary';
import TradeBalance from './TradeBalance';
import { SelectedCard } from './types';

interface TradeOfferPanelProps {
  myOfferedCards: Map<string, SelectedCard>;
  wantedCards: Map<string, SelectedCard>;
  onRemoveFromOffer: (cardId: string) => void;
  onRemoveFromWanted: (cardId: string) => void;
  isGiftMode: boolean;
  message: string;
  onMessageChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

/** Desktop offer-summary footer: both sides, balance, message and submit. */
export default function TradeOfferPanel({
  myOfferedCards,
  wantedCards,
  onRemoveFromOffer,
  onRemoveFromWanted,
  isGiftMode,
  message,
  onMessageChange,
  onClose,
  onSubmit,
  submitting,
}: TradeOfferPanelProps) {
  const isGift = myOfferedCards.size > 0 && wantedCards.size === 0;
  const isRequest = myOfferedCards.size === 0 && wantedCards.size > 0;
  const canSubmit = myOfferedCards.size > 0 || wantedCards.size > 0;

  return (
    <div className="border-t border-gray-700 p-4">
      <div className="flex gap-6 mb-4">
        <SelectedCardsSummary
          cards={myOfferedCards}
          onRemove={onRemoveFromOffer}
          label="I Give"
          emptyLabel="Nothing selected (gift request)"
          color="green"
        />
        {!isGiftMode && (
          <SelectedCardsSummary
            cards={wantedCards}
            onRemove={onRemoveFromWanted}
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
          onChange={(e) => onMessageChange(e.target.value)}
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
          onClick={onSubmit}
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
  );
}
