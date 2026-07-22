import React from 'react';
import { Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '../../types';
import { ManaSymbol } from '../ManaCost';

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
  setHoveredCard,
  setHoverSource,
  setSelectedCard,
  deckSize,
  suggestedLandCountValue,
  suggestedLands,
  addSuggestedLandsToDeck,
}: DeckCardListProps) {
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
          <option value="commander">Commander</option>
          <option value="legacy">Legacy</option>
          <option value="vintage">Vintage</option>
          <option value="pauper">Pauper</option>
        </select>

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

            return (
              <div
                key={card.id}
                className={`flex items-center gap-3 p-2 rounded-lg bg-gray-700 cursor-pointer hover:bg-gray-650 transition-colors ${
                  !isValidForCommander ? 'border border-yellow-500/50' : ''
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
              >
                <img
                  src={card.image_uris?.art_crop}
                  alt={card.name}
                  className="w-10 h-10 rounded"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{card.name}</h4>
                  {card.prices?.usd && (
                    <div className="text-xs text-gray-400">${card.prices.usd}</div>
                  )}
                  {!isValidForCommander && (
                    <div className="text-xs text-yellow-400 flex items-center gap-1 mt-0.5">
                      <AlertCircle size={10} />
                      <span>Not in commander colors</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    value={quantity}
                    onChange={e =>
                      updateCardQuantity(card.id, parseInt(e.target.value))
                    }
                    min="1"
                    className="w-14 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-center text-sm"
                  />
                  <button
                    onClick={() => removeCardFromDeck(card.id)}
                    className="text-red-500 hover:text-red-400"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
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
