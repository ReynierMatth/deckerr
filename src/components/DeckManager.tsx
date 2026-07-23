import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Card, Deck } from '../types';
import { searchCards, resolveCardsByNames } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getCardLargeImageUri } from '../utils/cardFaces';
import { useCardFaces } from '../hooks/useCardFaces';
import { useDeckSave } from '../hooks/useDeckSave';
import { useDeckCollectionActions } from '../hooks/useDeckCollectionActions';
import { validateDeck } from '../utils/deckValidation';
import { parseDeckList } from '../utils/parseDeckList';
import { suggestLandCountAndDistribution, getCommanderColors, isCardValidForCommander } from '../utils/deckSuggestions';
import CardDetailPanel from './deck/CardDetailPanel';
import HoverCardPreview from './card/HoverCardPreview';
import DeckExportModal from './deck/DeckExportModal';
import DeckSearchPanel from './deck/DeckSearchPanel';
import DeckCardList from './deck/DeckCardList';
import DeckStats from './deck/DeckStats';
import SampleHand from './deck/SampleHand';
import DeckActionBar from './deck/DeckActionBar';

interface DeckManagerProps {
  initialDeck?: Deck;
  onSave?: () => void;
}

export default function DeckManager({ initialDeck, onSave }: DeckManagerProps) {
  const toast = useToast();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCards, setSelectedCards] = useState<{
    card: Card;
    quantity: number;
    is_commander: boolean;
  }[]>(initialDeck?.cards || []);
  const [deckName, setDeckName] = useState(initialDeck?.name || '');
  const [deckFormat, setDeckFormat] = useState(initialDeck?.format || 'standard');
  const [tags, setTags] = useState<string[]>(initialDeck?.tags ?? []);
  const [commander, setCommander] = useState<Card | null>(
      initialDeck?.cards.find(card =>
          card.is_commander
      )?.card  || null
  );

  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [hoverSource, setHoverSource] = useState<'search' | 'deck' | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Deck persistence: current deck id, public flag and the save/update flow.
  const { currentDeckId, isPublic, setIsPublicPersisted, isSaving, saveDeck } = useDeckSave({
    initialDeck,
    onSave,
    deckName,
    deckFormat,
    selectedCards,
    tags,
    commander,
  });

  // Collection state + "add missing" flows (shared cache key with CardSearch).
  const {
    userCollection,
    isLoadingCollection,
    addingCardId,
    isAddingAll,
    isAddingToWishlist,
    getMissingCards,
    handleAddCardToCollection,
    handleAddAllMissingCards,
    handleAddMissingToWishlist,
  } = useDeckCollectionActions(selectedCards);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const cards = await searchCards(searchQuery);
      setSearchResults(cards || []);
    } catch (error) {
      console.error('Failed to search cards:', error);
      setSearchResults([]);
      toast.error('Failed to search cards');
    } finally {
      setIsSearching(false);
    }
  };

  const addCardToDeck = (card: Card) => {
    setSelectedCards(prev => {
      const existing = prev.find(c => c.card.id === card.id);
      if (existing) {
        // No hard cap: format copy limits are surfaced as warnings, not blockers.
        return prev.map(c =>
          c.card.id === card.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { card, quantity: 1, is_commander: false }];
    });
  };

  const removeCardFromDeck = (cardId: string) =>
    setSelectedCards(prev => prev.filter(c => c.card.id !== cardId));

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setTags(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const removeTag = (tag: string) =>
    setTags(prev => prev.filter(t => t !== tag));

  const updateCardQuantity = (cardId: string, quantity: number) => {
    setSelectedCards(prev => {
      return prev.map(c => {
        if (c.card.id === cardId) {
          return { ...c, quantity: quantity };
        }
        return c;
      });
    });
  };

  const currentDeck: Deck = {
    id: initialDeck?.id || '',
    name: deckName,
    format: deckFormat,
    cards: selectedCards,
    userId: user?.id || '',
    createdAt: initialDeck?.createdAt || new Date(),
    updatedAt: new Date(),
  };

  const validation = validateDeck(currentDeck);

  // Commander color identity validation (for land suggestions)
  const commanderColors = deckFormat === 'commander' ? getCommanderColors(commander) : [];

  const deckSize = selectedCards.reduce((acc, curr) => acc + curr.quantity, 0);
  const {
    landCount: suggestedLandCountValue,
    landDistribution: suggestedLands,
  } = suggestLandCountAndDistribution(selectedCards, deckFormat, commanderColors);

  const totalPrice = selectedCards.reduce((acc, { card, quantity }) => {
    const isBasicLand =
      card.name === 'Plains' ||
      card.name === 'Island' ||
      card.name === 'Swamp' ||
      card.name === 'Mountain' ||
      card.name === 'Forest';
    const price = isBasicLand ? 0 : card.prices?.usd ? parseFloat(card.prices.usd) : 0;
    return acc + price * quantity;
  }, 0);

  const addSuggestedLandsToDeck = async () => {
    const basicLandCards = {
      W: { name: 'Plains', set: 'unh' },
      U: { name: 'Island', set: 'unh' },
      B: { name: 'Swamp', set: 'unh' },
      R: { name: 'Mountain', set: 'unh' },
      G: { name: 'Forest', set: 'unh' },
    };

    for (const color in suggestedLands) {
      const landCount = suggestedLands[color];
      if (landCount > 0) {
        const landName = basicLandCards[color as keyof typeof basicLandCards]?.name;
        const landSet = basicLandCards[color as keyof typeof basicLandCards]?.set;

        if (landName && landSet) {
          try {
            const cards = await searchCards(`${landName} set:${landSet}`);
            if (cards && cards.length > 0) {
              const landCard = cards[0]; // Take the first matching card
              for (let i = 0; i < landCount; i++) {
                addCardToDeck(landCard);
              }
            }
          } catch (error) {
            console.error(`Failed to add ${landName}:`, error);
          }
        }
      }
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async e => {
        const text = e.target?.result as string;

        // Parse the decklist (handles "4"/"4x", set codes, foil markers, headers).
        const requests = parseDeckList(text);

        const cardsToAdd: { card: Card; quantity: number }[] = [];
        try {
          // Batched exact lookup, with a fuzzy fallback for flavor/alternate names.
          const cardsByName = await resolveCardsByNames(requests.map(r => r.name));
          for (const { name, quantity } of requests) {
            const card = cardsByName.get(name.toLowerCase());
            if (card) {
              cardsToAdd.push({ card, quantity });
            } else {
              console.warn(`Card not found: ${name}`);
              toast.error(`Card not found: ${name}`);
            }
          }
        } catch (error) {
          console.error('Failed to import deck:', error);
          toast.error('Failed to import deck');
          return;
        }

        setSelectedCards(prev => {
          const updatedCards = [...prev];
          for (const { card, quantity } of cardsToAdd) {
            const existingCardIndex = updatedCards.findIndex(
              c => c.card.id === card.id
            );
            if (existingCardIndex !== -1) {
              updatedCards[existingCardIndex].quantity += quantity;
            } else {
              updatedCards.push({ card, quantity, is_commander: false });
            }
          }
          return updatedCards;
        });
      };

      reader.readAsText(file);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 pt-6 pb-44 md:pt-20 md:pb-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl mx-auto">
          {/* Open the card-search drawer/modal */}
          <button
            onClick={() => setShowSearch(true)}
            className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors"
          >
            <Search size={18} /> Add cards
          </button>

          {/* Deck Builder Section */}
          <DeckCardList
            deckName={deckName}
            setDeckName={setDeckName}
            deckFormat={deckFormat}
            setDeckFormat={setDeckFormat}
            tags={tags}
            addTag={addTag}
            removeTag={removeTag}
            isPublic={isPublic}
            setIsPublic={setIsPublicPersisted}
            deckId={currentDeckId}
            commander={commander}
            setCommander={setCommander}
            selectedCards={selectedCards}
            commanderColors={commanderColors}
            isCardValidForCommander={isCardValidForCommander}
            handleFileUpload={handleFileUpload}
            isImporting={isImporting}
            validation={validation}
            updateCardQuantity={updateCardQuantity}
            removeCardFromDeck={removeCardFromDeck}
            handleAddCardToCollection={handleAddCardToCollection}
            addingCardId={addingCardId}
            userCollection={userCollection}
            setHoveredCard={setHoveredCard}
            setHoverSource={setHoverSource}
            setSelectedCard={setSelectedCard}
            deckSize={deckSize}
            suggestedLandCountValue={suggestedLandCountValue}
            suggestedLands={suggestedLands}
            addSuggestedLandsToDeck={addSuggestedLandsToDeck}
          />

          {/* Deck Stats */}
          <div className="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-3">Deck Stats</h2>
            <DeckStats cards={selectedCards} />
          </div>

          {/* Sample Hand */}
          <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white mb-3">Sample Hand</h2>
            <SampleHand cards={selectedCards} />
          </div>
        </div>
      </div>

      {/* Fixed Footer with Price and Actions - Mobile First */}
      <DeckActionBar
        totalPrice={totalPrice}
        showMissingActions={!isLoadingCollection && getMissingCards().length > 0}
        isAddingAll={isAddingAll}
        isAddingToWishlist={isAddingToWishlist}
        onAddAllMissing={handleAddAllMissingCards}
        onAddMissingToWishlist={handleAddMissingToWishlist}
        exportDisabled={selectedCards.length === 0}
        onExport={() => setShowExport(true)}
        saveDisabled={!deckName.trim() || selectedCards.length === 0 || isSaving}
        isSaving={isSaving}
        isUpdate={Boolean(initialDeck)}
        onSave={saveDeck}
      />

      {/* Card search — bottom drawer on mobile, centered modal on desktop */}
      {showSearch && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearch(false)} />
          <div className="relative w-full md:max-w-3xl bg-gray-900 border border-gray-700 rounded-t-2xl md:rounded-xl max-h-[90vh] md:max-h-[85vh] flex flex-col shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between p-3 border-b border-gray-700 bg-gray-900 rounded-t-2xl md:rounded-t-xl">
              <h2 className="text-lg font-semibold text-white">Add cards</h2>
              <button onClick={() => setShowSearch(false)} className="p-1 text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-3">
              <DeckSearchPanel
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                setSearchResults={setSearchResults}
                handleSearch={handleSearch}
                isSearching={isSearching}
                searchResults={searchResults}
                selectedCards={selectedCards}
                userCollection={userCollection}
                addingCardId={addingCardId}
                deckFormat={deckFormat}
                commander={commander}
                commanderColors={commanderColors}
                isCardValidForCommander={isCardValidForCommander}
                getCurrentFaceIndex={getCurrentFaceIndex}
                toggleCardFace={toggleCardFace}
                addCardToDeck={addCardToDeck}
                removeCardFromDeck={removeCardFromDeck}
                updateCardQuantity={updateCardQuantity}
                handleAddCardToCollection={handleAddCardToCollection}
                setHoveredCard={setHoveredCard}
                setHoverSource={setHoverSource}
                setSelectedCard={setSelectedCard}
              />
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <DeckExportModal cards={selectedCards} onClose={() => setShowExport(false)} />
      )}

      {/* Hover Card Preview - only show if no card is selected */}
      {hoveredCard && !selectedCard && (
        <HoverCardPreview
          card={hoveredCard}
          hoverSource={hoverSource}
          getCurrentFaceIndex={getCurrentFaceIndex}
        />
      )}

      {/* Card Detail Panel - slides in from right */}
      {selectedCard && (
        <CardDetailPanel
          card={selectedCard}
          quantityInDeck={selectedCards.find(c => c.card.id === selectedCard.id)?.quantity || 0}
          inDeck={Boolean(selectedCards.find(c => c.card.id === selectedCard.id))}
          collectionQuantity={userCollection[selectedCard.id]}
          getCurrentFaceIndex={getCurrentFaceIndex}
          toggleCardFace={toggleCardFace}
          getLargeImageUri={getCardLargeImageUri}
          onClose={() => setSelectedCard(null)}
          onIncrement={() => addCardToDeck(selectedCard)}
          onDecrement={() => {
            const cardInDeck = selectedCards.find(c => c.card.id === selectedCard.id);
            const currentQuantity = cardInDeck?.quantity || 0;
            if (currentQuantity === 1) {
              removeCardFromDeck(selectedCard.id);
            } else if (currentQuantity > 1) {
              updateCardQuantity(selectedCard.id, currentQuantity - 1);
            }
          }}
        />
      )}
    </div>
  );
}
