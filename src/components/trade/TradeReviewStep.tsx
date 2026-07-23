import SelectedCardsSummary from './SelectedCardsSummary';
import TradeBalance from './TradeBalance';
import { SelectedCard } from './types';

interface TradeReviewStepProps {
  myOfferedCards: Map<string, SelectedCard>;
  wantedCards: Map<string, SelectedCard>;
  onRemoveFromOffer: (cardId: string) => void;
  onRemoveFromWanted: (cardId: string) => void;
  isGiftMode: boolean;
  message: string;
  onMessageChange: (value: string) => void;
}

/** Mobile review step: both offer sides, balance and the optional message. */
export default function TradeReviewStep({
  myOfferedCards,
  wantedCards,
  onRemoveFromOffer,
  onRemoveFromWanted,
  isGiftMode,
  message,
  onMessageChange,
}: TradeReviewStepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-purple-400">Review Trade</h3>
      <div className="bg-gray-900/50 rounded-lg p-3 space-y-3">
        <SelectedCardsSummary
          cards={myOfferedCards}
          onRemove={onRemoveFromOffer}
          label="I Give"
          emptyLabel="Nothing (requesting cards)"
          color="green"
        />
        {!isGiftMode && (
          <SelectedCardsSummary
            cards={wantedCards}
            onRemove={onRemoveFromWanted}
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
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Add a message..."
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
