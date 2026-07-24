import {
  Plus, Trash2, Loader2, AlertCircle, PackagePlus, CheckCircle,
  Swords, Sparkles, Zap, Flame, Cog, Gem, Shield, Mountain, Layers,
  ArrowRightLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { Card } from '../../types';
import { ManaSymbol } from '../ManaCost';
import WishlistButton from '../WishlistButton';
import CardRow from '../card/CardRow';
import { groupCardsByType } from '../../utils/deckStats';

/** Icon + accent colour per card-type section, Moxfield-style. */
const TYPE_STYLES: Record<string, { icon: LucideIcon; color: string }> = {
  Creature: { icon: Swords, color: 'text-green-400' },
  Planeswalker: { icon: Sparkles, color: 'text-pink-400' },
  Instant: { icon: Zap, color: 'text-cyan-400' },
  Sorcery: { icon: Flame, color: 'text-orange-400' },
  Artifact: { icon: Cog, color: 'text-slate-300' },
  Enchantment: { icon: Gem, color: 'text-purple-400' },
  Battle: { icon: Shield, color: 'text-red-400' },
  Land: { icon: Mountain, color: 'text-amber-400' },
  Other: { icon: Layers, color: 'text-gray-400' },
};

interface DeckCardEntry {
  card: Card;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
}

interface DeckValidation {
  isValid: boolean;
  errors: string[];
}

interface DeckCardListProps {
  deckFormat: string;
  commander: Card | null;
  selectedCards: DeckCardEntry[];
  commanderColors: string[];
  isCardValidForCommander: (card: Card, commanderColors: string[]) => boolean;
  validation: DeckValidation;
  updateCardQuantity: (cardId: string, quantity: number, isSideboard: boolean) => void;
  removeCardFromDeck: (cardId: string, isSideboard: boolean) => void;
  moveCardBoard: (cardId: string, fromSideboard: boolean) => void;
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
 * Presentational deck card list: validation warnings, the mainboard grouped by
 * type, a separate sideboard section, and the suggested-lands helper. All state
 * lives in the parent (DeckManager); this component receives data and delegates
 * mutations back through callbacks. Entries are keyed by (card.id,
 * is_sideboard), so every mutation is told which board it targets.
 */
export default function DeckCardList({
  deckFormat,
  commander,
  selectedCards,
  commanderColors,
  isCardValidForCommander,
  validation,
  updateCardQuantity,
  removeCardFromDeck,
  moveCardBoard,
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
  const mainboard = selectedCards.filter((c) => !c.is_sideboard);
  const sideboard = selectedCards.filter((c) => c.is_sideboard);
  const sideboardCount = sideboard.reduce((acc, c) => acc + c.quantity, 0);

  // Shared row renderer for a single deck entry. Commander color-validity only
  // applies to the mainboard; the sideboard carries no rules.
  const renderRow = ({ card, quantity, is_sideboard }: DeckCardEntry) => {
    const isValidForCommander =
      is_sideboard || deckFormat !== 'commander' || !commander || isCardValidForCommander(card, commanderColors);
    const inCollection = userCollection[card.id] ?? 0;

    return (
      <CardRow
        key={`${card.id}-${is_sideboard ? 'sb' : 'mb'}`}
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
              onChange={(e) => updateCardQuantity(card.id, parseInt(e.target.value), is_sideboard)}
              min="1"
              className="w-12 px-1 py-2 bg-gray-700 border border-gray-600 rounded-lg text-center text-sm"
            />
            <button
              onClick={() => moveCardBoard(card.id, is_sideboard)}
              title={is_sideboard ? 'Move to mainboard' : 'Move to sideboard'}
              aria-label={is_sideboard ? 'Move to mainboard' : 'Move to sideboard'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1 p-2.5 bg-gray-700 text-blue-300 active:bg-gray-600 rounded-lg text-xs"
            >
              <ArrowRightLeft size={16} />
              <span className="hidden sm:inline">{is_sideboard ? 'Main' : 'Side'}</span>
            </button>
            <button
              onClick={() => removeCardFromDeck(card.id, is_sideboard)}
              title="Remove from deck"
              aria-label="Remove from deck"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 bg-gray-700 text-red-400 active:bg-gray-600 rounded-lg"
            >
              <Trash2 size={18} />
            </button>
            <WishlistButton cardId={card.id} variant="button" size={18} />
            <button
              onClick={() => handleAddCardToCollection(card.id, 1)}
              disabled={addingCardId === card.id}
              title="Add to collection"
              aria-label="Add to collection"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 bg-green-600 active:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg"
            >
              {addingCardId === card.id ? <Loader2 className="animate-spin" size={18} /> : <PackagePlus size={18} />}
            </button>
          </>
        }
      />
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="space-y-4">
        {!validation.isValid && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
            <ul className="list-disc list-inside text-red-400 text-sm">
              {validation.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xl">
              Cards ({mainboard.reduce((acc, curr) => acc + curr.quantity, 0)})
            </h3>
          </div>

          {groupCardsByType(mainboard).map(({ type, count, entries }) => {
            const { icon: TypeIcon, color } = TYPE_STYLES[type] ?? TYPE_STYLES.Other;
            return (
              <section key={type} className="space-y-2">
                <div className="flex items-center gap-2 border-b border-gray-700 pb-1.5">
                  <TypeIcon size={16} className={color} />
                  <h4 className={`text-sm font-bold uppercase tracking-wide ${color}`}>{type}</h4>
                  <span className="text-xs text-gray-500">({count})</span>
                </div>

                {entries.map((entry) => renderRow(entry))}
              </section>
            );
          })}
        </div>

        {/* Sideboard — a flat list below the mainboard. No format rules apply. */}
        {sideboard.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-b border-gray-700 pb-1.5">
              <Layers size={16} className="text-gray-400" />
              <h4 className="text-sm font-bold uppercase tracking-wide text-gray-400">Sideboard</h4>
              <span className="text-xs text-gray-500">({sideboardCount})</span>
            </div>
            {sideboard.map((entry) => renderRow(entry))}
          </div>
        )}

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
