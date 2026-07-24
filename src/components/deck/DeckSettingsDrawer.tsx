import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Card } from '../../types';
import { ManaSymbol } from '../ManaCost';
import Modal from '../Modal';

interface DeckCardEntry {
  card: Card;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
}

interface DeckSettingsDrawerProps {
  deckFormat: string;
  setDeckFormat: React.Dispatch<React.SetStateAction<string>>;
  tags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  commander: Card | null;
  setCommander: React.Dispatch<React.SetStateAction<Card | null>>;
  commanderColors: string[];
  selectedCards: DeckCardEntry[];
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isImporting: boolean;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Deck settings" drawer: format, tags, commander selection, and decklist
 * import. Presentational — all state lives in DeckManager and is passed in.
 */
export default function DeckSettingsDrawer({
  deckFormat,
  setDeckFormat,
  tags,
  addTag,
  removeTag,
  commander,
  setCommander,
  commanderColors,
  selectedCards,
  handleFileUpload,
  isImporting,
  isOpen,
  onClose,
}: DeckSettingsDrawerProps) {
  const [tagInput, setTagInput] = useState('');

  const commitTag = () => {
    addTag(tagInput);
    setTagInput('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy="deck-settings-title">
      <div className="p-3 space-y-4">
        <h2 id="deck-settings-title" className="text-lg font-semibold text-white pr-8">
          Deck settings
        </h2>

        <select
          value={deckFormat}
          onChange={e => setDeckFormat(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
        >
          <option value="commander">Commander</option>
          <option value="standard">Standard</option>
          <option value="modern">Modern</option>
          <option value="pioneer">Pioneer</option>
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
                  !c.is_sideboard && c.card.type_line?.toLowerCase().includes('legendary')
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
      </div>
    </Modal>
  );
}
