import React from 'react';
import { Plus, Minus, Search, Loader2, CheckCircle, XCircle, AlertCircle, PackagePlus, RefreshCw } from 'lucide-react';
import { Card } from '../../types';
import { isDoubleFaced, getCardImageUri } from '../../utils/cardFaces';
import WishlistButton from '../WishlistButton';
import { ManaCost } from '../ManaCost';

interface DeckCardEntry {
  card: Card;
  quantity: number;
  is_commander: boolean;
}

interface DeckSearchPanelProps {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setSearchResults: React.Dispatch<React.SetStateAction<Card[]>>;
  handleSearch: (e: React.FormEvent) => void;
  isSearching: boolean;
  searchResults: Card[];
  selectedCards: DeckCardEntry[];
  userCollection: Map<string, number>;
  addingCardId: string | null;
  deckFormat: string;
  commander: Card | null;
  commanderColors: string[];
  isCardValidForCommander: (card: Card, commanderColors: string[]) => boolean;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
  addCardToDeck: (card: Card) => void;
  removeCardFromDeck: (cardId: string) => void;
  updateCardQuantity: (cardId: string, quantity: number) => void;
  handleAddCardToCollection: (cardId: string, quantity: number) => void;
  setHoveredCard: React.Dispatch<React.SetStateAction<Card | null>>;
  setHoverSource: React.Dispatch<React.SetStateAction<'search' | 'deck' | null>>;
  setSelectedCard: React.Dispatch<React.SetStateAction<Card | null>>;
}

/**
 * Presentational card-search panel: the search bar plus the search-results list
 * with its add-to-deck / add-to-collection controls. All state lives in the
 * parent (DeckManager); this component receives data and delegates mutations
 * back through callbacks.
 */
export default function DeckSearchPanel({
  searchQuery,
  setSearchQuery,
  setSearchResults,
  handleSearch,
  isSearching,
  searchResults,
  selectedCards,
  userCollection,
  addingCardId,
  deckFormat,
  commander,
  commanderColors,
  isCardValidForCommander,
  getCurrentFaceIndex,
  toggleCardFace,
  addCardToDeck,
  removeCardFromDeck,
  updateCardQuantity,
  handleAddCardToCollection,
  setHoveredCard,
  setHoverSource,
  setSelectedCard,
}: DeckSearchPanelProps) {
  return (
    <div className="lg:col-span-2 space-y-6">
      {/* Mobile-First Search Bar */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-24 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
          placeholder="Rechercher une carte..."
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSearchResults([]);
            }}
            className="absolute right-14 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <XCircle size={20} />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 rounded-md"
        >
          <Search size={20} />
        </button>
      </form>

      {/* Vertical Card List for Mobile */}
      <div className="space-y-2">
        {isSearching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        ) : searchResults.length === 0 && searchQuery ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">No cards found</p>
            <p className="text-sm">Try a different search term</p>
          </div>
        ) : (
          searchResults.map(card => {
          const currentFaceIndex = getCurrentFaceIndex(card.id);
          const isMultiFaced = isDoubleFaced(card);
          const inCollection = userCollection.get(card.id) || 0;
          const isAddingThisCard = addingCardId === card.id;
          const cardInDeck = selectedCards.find(c => c.card.id === card.id);
          const quantityInDeck = cardInDeck?.quantity || 0;

          const displayName = isMultiFaced && card.card_faces
            ? card.card_faces[currentFaceIndex]?.name || card.name
            : card.name;

          const isValidForCommander = deckFormat !== 'commander' || !commander || isCardValidForCommander(card, commanderColors);

          return (
            <div
              key={card.id}
              className={`bg-gray-800 rounded-lg p-3 flex items-center gap-3 hover:bg-gray-750 transition-colors cursor-pointer ${
                !isValidForCommander ? 'border border-yellow-500/50' : ''
              }`}
              onMouseEnter={() => {
                setHoveredCard(card);
                setHoverSource('search');
              }}
              onMouseLeave={() => {
                setHoveredCard(null);
                setHoverSource(null);
              }}
              onClick={() => setSelectedCard(card)}
            >
              {/* Card Thumbnail */}
              <div className="relative flex-shrink-0 w-16 h-22 rounded overflow-hidden"
                   onClick={(e) => e.stopPropagation()}>
                {getCardImageUri(card, currentFaceIndex) ? (
                  <img
                    src={getCardImageUri(card, currentFaceIndex)}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700" />
                )}
                <WishlistButton cardId={card.id} className="absolute top-0.5 left-0.5" size={13} />
                {isMultiFaced && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCardFace(card.id, card.card_faces!.length);
                    }}
                    className="absolute bottom-0 right-0 bg-purple-600 text-white p-1 rounded-tl"
                  >
                    <RefreshCw size={10} />
                  </button>
                )}
              </div>

              {/* Card Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{displayName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {card.mana_cost && (
                    <ManaCost cost={card.mana_cost} size={14} />
                  )}
                  {card.prices?.usd && (
                    <div className="text-xs text-gray-400">${card.prices.usd}</div>
                  )}
                </div>
                {inCollection > 0 && (
                  <div className="text-xs text-green-400 mt-1">
                    <CheckCircle size={12} className="inline mr-1" />
                    x{inCollection} in collection
                  </div>
                )}
                {!isValidForCommander && (
                  <div className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Not in commander colors
                  </div>
                )}
              </div>

              {/* Add/Quantity Controls */}
              {quantityInDeck > 0 ? (
                <div className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      if (quantityInDeck === 1) {
                        removeCardFromDeck(card.id);
                      } else {
                        updateCardQuantity(card.id, quantityInDeck - 1);
                      }
                    }}
                    className="w-8 h-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{quantityInDeck}</span>
                  <button
                    onClick={() => addCardToDeck(card)}
                    className="w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addCardToDeck(card);
                  }}
                  className="flex-shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors"
                >
                  <Plus size={20} />
                </button>
              )}

              {/* Add to Collection Button (hidden on mobile by default) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddCardToCollection(card.id, 1);
                }}
                disabled={isAddingThisCard}
                className="hidden sm:flex flex-shrink-0 w-10 h-10 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full items-center justify-center transition-colors"
                title="Add to collection"
              >
                {isAddingThisCard ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <PackagePlus size={20} />
                )}
              </button>
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}
