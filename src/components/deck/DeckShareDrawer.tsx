import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { DeckVisibility } from '../../types';
import Modal from '../Modal';

interface DeckShareDrawerProps {
  visibility: DeckVisibility;
  setVisibility: (v: DeckVisibility) => void;
  deckId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const VISIBILITY_OPTIONS: { value: DeckVisibility; label: string; description: string }[] = [
  { value: 'private', label: 'Private', description: 'Only you can see this deck.' },
  {
    value: 'unlisted',
    label: 'Unlisted',
    description: 'Anyone with the link can view it. Not shown in Discover.',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone with the link can view it, and it appears in Discover.',
  },
];

/**
 * "Share deck" drawer: a 3-level visibility selector plus the shareable link
 * (shown once the deck is saved and not private).
 */
export default function DeckShareDrawer({
  visibility,
  setVisibility,
  deckId,
  isOpen,
  onClose,
}: DeckShareDrawerProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = deckId ? `${window.location.origin}/decks/${deckId}/view` : '';

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy="deck-share-title">
      <div className="p-3 space-y-4">
        <h2 id="deck-share-title" className="text-lg font-semibold text-white pr-8">
          Share deck
        </h2>

        <div className="space-y-2" role="radiogroup" aria-label="Deck visibility">
          {VISIBILITY_OPTIONS.map(option => {
            const selected = visibility === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setVisibility(option.value)}
                className={`w-full min-h-[44px] flex items-start gap-3 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selected
                    ? 'bg-blue-600/20 border-blue-500'
                    : 'bg-gray-700/60 border-gray-600 hover:bg-gray-700'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-blue-500' : 'border-gray-500'
                  }`}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{option.label}</span>
                  <span className="block text-xs text-gray-400">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        {visibility !== 'private' && (
          deckId ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                onFocus={e => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-300"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy link'}</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-yellow-400">
              Save the deck first to get a shareable link.
            </p>
          )
        )}
      </div>
    </Modal>
  );
}
