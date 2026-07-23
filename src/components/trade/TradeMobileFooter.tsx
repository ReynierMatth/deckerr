import { ArrowRight, ArrowLeft, Send, Gift, Loader2 } from 'lucide-react';
import { SelectedCard } from './types';

type MobileStep = 'want' | 'give' | 'review';

interface TradeMobileFooterProps {
  mobileStep: MobileStep;
  isGiftMode: boolean;
  myOfferedCards: Map<string, SelectedCard>;
  wantedCards: Map<string, SelectedCard>;
  submitting: boolean;
  onPrevStep: () => void;
  onNextStep: () => void;
  onClose: () => void;
  onSubmit: () => void;
}

/** Mobile step navigation: back/cancel on the left, next/submit on the right. */
export default function TradeMobileFooter({
  mobileStep,
  isGiftMode,
  myOfferedCards,
  wantedCards,
  submitting,
  onPrevStep,
  onNextStep,
  onClose,
  onSubmit,
}: TradeMobileFooterProps) {
  const isGift = myOfferedCards.size > 0 && wantedCards.size === 0;
  const isRequest = myOfferedCards.size === 0 && wantedCards.size > 0;
  const canSubmit = myOfferedCards.size > 0 || wantedCards.size > 0;

  return (
    <div className="border-t border-gray-700 p-3 flex gap-2">
      {(mobileStep !== 'want' && !isGiftMode) || (mobileStep !== 'give' && isGiftMode) ? (
        <button
          onClick={onPrevStep}
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
          onClick={onSubmit}
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
          onClick={onNextStep}
          className="flex items-center justify-center gap-1 px-4 py-2.5 bg-blue-600 active:bg-blue-700 rounded-lg flex-1"
        >
          Next
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
