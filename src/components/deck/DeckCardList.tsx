import React, { useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, X, Share2, Copy, Check, PackagePlus, CheckCircle } from 'lucide-react';
import { Card } from '../../types';
import { ManaSymbol } from '../ManaCost';
import WishlistButton from '../WishlistButton';
import CardRow from '../card/CardRow';

interface DeckCardEntry {
  card: Card;
  quantity: number;
  is_commander: boolean;
}

interface DeckValidation {
  isValid: boolean;
  errors: string[];
}

interface DeckCardListProps {
  deckName: string;
  setDeckName: React.Dispatch<React.SetStateAction<string>>;
  deckFormat: string;
  setDeckFormat: React.Dispatch<React.SetStateAction<string>>;
  tags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  isPublic: boolean;
  setIsPublic: React.Dispatch<React.SetStateAction<boolean>>;
  deckId: string | null;
  commander: Card | null;
  setCommander: React.Dispatch<React.SetStateAction<Card | null>>;
  selectedCards: DeckCardEntry[];
  commanderColors: string[];
  isCardValidForCommander: (card: Card, commanderColors: string[]) => boolean;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isImporting: boolean;
  validation: DeckValidation;
  updateCardQuantity: (cardId: string, quantity: number) => void;
  removeCardFromDeck: (cardId: string) => void;
  handleAddCardToCollection: (cardId: string, quantity: number) => void;
  addingCardId: string | null;
  userCollection: Record<string, number>;
  setHoveredCard: React.Dispatch<React.SetStateAction<Card | null>>;
  setHoverSource: React.Dispatch<React.SetStateAction<'search' | 'deck' | null>>;
  setSelectedCard: React.Dispatch<React.SetStateAction<Card | null>>;
  deckSize: number;
  suggestedLandCountValue: number;
  suggestedLands: { [key: string]: number };
  addSuggestedLandsToDeck: () => void;
}

/**
 * Presentational deck-builder panel: deck name/format/commander controls, the
 * decklist import, validation warnings, the list of cards currently in the deck,
 * and the suggested-lands helper. All state lives in the parent (DeckManager);
 * this component receives data and delegates mutations back through callbacks.
 */
export default function DeckCardList({
  deckName,
  setDeckName,
  deckFormat,
  setDeckFormat,
  tags,
  addTag,
  removeTag,
  isPublic,
  setIsPublic,
  deckId,
  commander,
  setCommander,
  selectedCards,
  commanderColors,
  isCardValidForCommander,
  handleFileUpload,
  isImporting,
  validation,
  updateCardQuantity,
  removeCardFromDeck,
  handleAddCardToCollection,
  addingCardId,
  userCollection,
  setHoveredCard,
  setHoverSource,
  setSelectedCard,
  deckSize,
  suggestedLandCountValue,
  suggestedLands,
  addSuggestedLandsToDeck,
}: DeckCardListProps) {
  const [tagInput, setTagInput] = useState('');
  const [copied, setCopied] = useState(false);

  const commitTag = () => {
    addTag(tagInput);
    setTagInput('');
  };

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
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="space-y-4">
        <input
          type="text"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
          placeholder="Deck Name"
        />

        <select
          value={deckFormat}
          onChange={e => setDeckFormat(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
        >
          <option value="standard">Standard</option>
          <option value="modern">Modern</option>
          <option value="pioneer">Pioneer</option>
          <option value="commander">Commander</option>
          <option value="brawl">Brawl</option>
          <option value="oathbreaker">Oathbreaker</option>
          <option value="legacy">Legacy</option>
          <option value="vintage">Vintage</option>
          <option value="pauper">Pauper</option>
        </select>

        {/* Tags editor: add on Enter, removable chips */}
        <div className="space-y-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTag();
              }
            }}
            onBlur={commitTag}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            placeholder="Add tag (press Enter)"
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 pl-3 pr-2 py-1 bg-blue-600/20 border border-blue-500/40 text-blue-200 rounded-full text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-blue-300 hover:text-white"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Public / share controls */}
        <div className="bg-gray-700/60 border border-gray-600 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Share2 size={18} className="text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Public deck</p>
                <p className="text-xs text-gray-400 truncate">
                  Anyone with the link can view this deck.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              aria-label="Make deck public"
              onClick={() => setIsPublic(prev => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                isPublic ? 'bg-blue-600' : 'bg-gray-500'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isPublic ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {isPublic && (
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

        {deckFormat === 'commander' && (
          <div className="space-y-2">
            <select
              value={commander?.id || ''}
              onChange={e => {
                const card =
                  selectedCards.find(c => c.card.id === e.target.value)?.card ||
                  null;
                setCommander(card);
              }}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="">Select Commander</option>
              {selectedCards
                .filter(c =>
                  c.card.type_line?.toLowerCase().includes('legendary')
                )
                .map(({ card }) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
            </select>
            {commander && commanderColors.length > 0 && (
              <div className="bg-gray-700 rounded px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">Commander Colors:</span>
                <div className="flex items-center gap-1">
                  {commanderColors.map(color => (
                    <ManaSymbol key={color} symbol={color} size={18} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <input
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            disabled={isImporting}
            className="w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-lg
          file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-500 file:text-white
          hover:file:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          />
          {isImporting && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50 rounded-lg">
              <Loader2 className="animate-spin text-white" size={48} />
            </div>
          )}
        </div>

        {!validation.isValid && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
            <ul className="list-disc list-inside text-red-400 text-sm">
              {validation.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xl">
              Cards ({selectedCards.reduce((acc, curr) => acc + curr.quantity, 0)})
            </h3>
          </div>

          {selectedCards.map(({ card, quantity }) => {
            const isValidForCommander = deckFormat !== 'commander' || !commander || isCardValidForCommander(card, commanderColors);
            const inCollection = userCollection[card.id] ?? 0;

            return (
              <CardRow
                key={card.id}
                card={card}
                name={card.name}
                className={`hover:bg-gray-750 transition-colors cursor-pointer ${
                  !isValidForCommander ? 'ring-1 ring-yellow-500/50' : ''
                }`}
                onMouseEnter={() => {
                  setHoveredCard(card);
                  setHoverSource('deck');
                }}
                onMouseLeave={() => {
                  setHoveredCard(null);
                  setHoverSource(null);
                }}
                onClick={() => setSelectedCard(card)}
                badges={
                  inCollection > 0 && (
                    <span className="text-green-400 flex items-center gap-0.5">
                      <CheckCircle size={10} />
                      x{inCollection}
                    </span>
                  )
                }
                warning={
                  !isValidForCommander && (
                    <>
                      <AlertCircle size={10} />
                      <span>Not in commander colors</span>
                    </>
                  )
                }
                actions={
                  <>
                    <input
                      type="number"
                      value={quantity}
                      onChange={e => updateCardQuantity(card.id, parseInt(e.target.value))}
                      min="1"
                      className="w-12 px-1 py-2 bg-gray-700 border border-gray-600 rounded-lg text-center text-sm"
                    />
                    <button
                      onClick={() => removeCardFromDeck(card.id)}
                      title="Remove from deck"
                      aria-label="Remove from deck"
                      className="p-2.5 bg-gray-700 text-red-400 active:bg-gray-600 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                    <WishlistButton cardId={card.id} variant="button" size={18} />
                    <button
                      onClick={() => handleAddCardToCollection(card.id, 1)}
                      disabled={addingCardId === card.id}
                      title="Add to collection"
                      aria-label="Add to collection"
                      className="p-2.5 bg-green-600 active:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg"
                    >
                      {addingCardId === card.id ? <Loader2 className="animate-spin" size={18} /> : <PackagePlus size={18} />}
                    </button>
                  </>
                }
              />
            );
          })}
        </div>

        {deckSize > 0 && suggestedLandCountValue > 0 && (
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-300">Suggested Lands</span>
              <span className="text-xs text-gray-400">{suggestedLandCountValue} total</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(suggestedLands).map(([landType, count]) =>
                count > 0 ? (
                  <div key={landType} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded">
                    <ManaSymbol symbol={landType} size={20} />
                    <span className="text-sm font-medium text-white">{count}</span>
                  </div>
                ) : null
              )}
            </div>
            <button
              onClick={addSuggestedLandsToDeck}
              className="w-full mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Add Suggested Lands
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
