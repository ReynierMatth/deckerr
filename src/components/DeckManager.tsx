import React, { useState } from 'react';
import { Search, SlidersHorizontal, Share2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Deck } from '../types';
import { searchCards, resolveCardsByNames, deleteDeck } from '../services/api';
import { GameId } from '../cards/domain/game';
import { cardData } from '../cards/infra/facade';
import { getDeckRules } from '../cards/infra/rules';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from './ConfirmModal';
import { getCardLargeImageUri } from '../utils/cardFaces';
import { getPrice } from '../cards/domain/accessors/price';
import { useCardFaces } from '../hooks/useCardFaces';
import { useBackDismiss } from '../hooks/useBackDismiss';
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
import DeckSettingsDrawer from './deck/DeckSettingsDrawer';
import DeckShareDrawer from './deck/DeckShareDrawer';
import DeckStats from './deck/DeckStats';
import SampleHand from './deck/SampleHand';
import DeckActionBar from './deck/DeckActionBar';
import Modal from './Modal';

interface DeckManagerProps {
  initialDeck?: Deck;
  /** Game for a NEW deck (from the create flow). Ignored when editing. */
  newDeckGame?: GameId;
  onSave?: () => void;
}

export default function DeckManager({ initialDeck, newDeckGame, onSave }: DeckManagerProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A deck belongs to one game, fixed at creation and immutable while editing.
  const game: GameId = initialDeck?.game ?? newDeckGame ?? 'mtg';
  const rules = getDeckRules(game);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCards, setSelectedCards] = useState<{
    card: Card;
    quantity: number;
    is_commander: boolean;
    is_sideboard: boolean;
  }[]>(initialDeck?.cards || []);
  const [deckName, setDeckName] = useState(initialDeck?.name || '');
  const [deckFormat, setDeckFormat] = useState(initialDeck?.format || rules.formats()[0]?.id || 'standard');
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
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [hoverSource, setHoverSource] = useState<'search' | 'deck' | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Back / back-gesture closes the ad-hoc overlays (the Modal-based drawers —
  // settings, share, add-cards — already handle this via the shared Modal).
  useBackDismiss(!!selectedCard, () => setSelectedCard(null));
  useBackDismiss(showExport, () => setShowExport(false));

  // Deck persistence: current deck id, visibility and the save/update flow.
  const { currentDeckId, visibility, setVisibilityPersisted, isSaving, saveDeck } = useDeckSave({
    initialDeck,
    onSave,
    game,
    deckName,
    deckFormat,
    selectedCards,
    tags,
    commander,
  });

  const confirmDeleteDeck = async () => {
    if (!currentDeckId) return;
    setIsDeleting(true);
    try {
      await deleteDeck(currentDeckId);
      await queryClient.invalidateQueries({ queryKey: ['decks', user?.id] });
      toast.success('Deck supprimé');
      navigate({ to: '/' });
    } catch (err) {
      console.error('delete deck failed:', err);
      toast.error('Échec de la suppression du deck');
      setIsDeleting(false);
    }
  };

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
      const result = await cardData.search(
        game,
        game === 'mtg' ? { raw: { scryfall: searchQuery } } : { text: searchQuery },
      );
      const cards = result.cards;
      setSearchResults(cards || []);
    } catch (error) {
      console.error('Failed to search cards:', error);
      setSearchResults([]);
      toast.error('Failed to search cards');
    } finally {
      setIsSearching(false);
    }
  };

  // Entries are keyed by (card.id, is_sideboard): a card can be in both boards
  // at once, so every find/update/remove matches on both.
  const addCardToDeck = (card: Card) => {
    setSelectedCards(prev => {
      const existing = prev.find(c => c.card.id === card.id && !c.is_sideboard);
      if (existing) {
        // No hard cap: format copy limits are surfaced as warnings, not blockers.
        return prev.map(c =>
          c.card.id === card.id && !c.is_sideboard ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { card, quantity: 1, is_commander: false, is_sideboard: false }];
    });
  };

  const removeCardFromDeck = (cardId: string, isSideboard: boolean) =>
    setSelectedCards(prev =>
      prev.filter(c => !(c.card.id === cardId && c.is_sideboard === isSideboard))
    );

  // Flip a card between mainboard and sideboard. If the target board already
  // holds that card id, merge quantities and drop the source entry.
  const moveCardBoard = (cardId: string, fromSideboard: boolean) => {
    setSelectedCards(prev => {
      const source = prev.find(c => c.card.id === cardId && c.is_sideboard === fromSideboard);
      if (!source) return prev;
      const target = prev.find(c => c.card.id === cardId && c.is_sideboard === !fromSideboard);

      if (target) {
        return prev
          .filter(c => !(c.card.id === cardId && c.is_sideboard === fromSideboard))
          .map(c =>
            c.card.id === cardId && c.is_sideboard === !fromSideboard
              ? { ...c, quantity: c.quantity + source.quantity }
              : c
          );
      }

      // Moving a card into the sideboard clears its commander flag (commanders
      // live on the mainboard only).
      return prev.map(c =>
        c.card.id === cardId && c.is_sideboard === fromSideboard
          ? { ...c, is_sideboard: !fromSideboard, is_commander: !fromSideboard ? false : c.is_commander }
          : c
      );
    });
    if (fromSideboard === false && commander?.id === cardId) setCommander(null);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setTags(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const removeTag = (tag: string) =>
    setTags(prev => prev.filter(t => t !== tag));

  // Swap a deck entry to another printing of the same card. Local state only —
  // the deck save flow rewrites deck_cards on Save. Keeps quantity and
  // is_commander; if the target printing is already in the deck, merge
  // quantities so the list never holds two entries for the same card id.
  const changeCardPrinting = (oldCardId: string, printing: Card, isSideboard: boolean) => {
    if (printing.id === oldCardId) return;

    setSelectedCards(prev => {
      const oldEntry = prev.find(c => c.card.id === oldCardId && c.is_sideboard === isSideboard);
      if (!oldEntry) return prev;

      const target = prev.find(c => c.card.id === printing.id && c.is_sideboard === isSideboard);
      if (target) {
        return prev
          .filter(c => !(c.card.id === oldCardId && c.is_sideboard === isSideboard))
          .map(c =>
            c.card.id === printing.id && c.is_sideboard === isSideboard
              ? {
                  ...c,
                  quantity: c.quantity + oldEntry.quantity,
                  is_commander: c.is_commander || oldEntry.is_commander,
                }
              : c
          );
      }

      return prev.map(c =>
        c.card.id === oldCardId && c.is_sideboard === isSideboard ? { ...c, card: printing } : c
      );
    });

    if (!isSideboard && commander?.id === oldCardId) setCommander(printing);
    setSelectedCard(prev => (prev && prev.id === oldCardId ? printing : prev));
  };

  const updateCardQuantity = (cardId: string, quantity: number, isSideboard: boolean) => {
    setSelectedCards(prev => {
      return prev.map(c => {
        if (c.card.id === cardId && c.is_sideboard === isSideboard) {
          return { ...c, quantity: quantity };
        }
        return c;
      });
    });
  };

  // Mainboard vs sideboard views: stats, sample hand, land suggestions and
  // validation are all about the main deck; the sideboard carries no rules.
  const mainboardCards = selectedCards.filter(c => !c.is_sideboard);

  const currentDeck: Deck = {
    id: initialDeck?.id || '',
    name: deckName,
    game,
    format: deckFormat,
    cards: selectedCards,
    userId: user?.id || '',
    createdAt: initialDeck?.createdAt || new Date(),
    updatedAt: new Date(),
  };

  const validation = validateDeck(currentDeck);

  // Commander color identity validation (for land suggestions)
  const commanderColors = deckFormat === 'commander' ? getCommanderColors(commander) : [];

  const deckSize = mainboardCards.reduce((acc, curr) => acc + curr.quantity, 0);
  // Land suggestions are MTG-only (mana/colour based).
  const {
    landCount: suggestedLandCountValue,
    landDistribution: suggestedLands,
  } = game === 'mtg'
    ? suggestLandCountAndDistribution(mainboardCards, deckFormat, commanderColors)
    : { landCount: 0, landDistribution: {} as Record<string, number> };

  const totalPrice = selectedCards.reduce((acc, { card, quantity }) => {
    const isBasicLand =
      card.name === 'Plains' ||
      card.name === 'Island' ||
      card.name === 'Swamp' ||
      card.name === 'Mountain' ||
      card.name === 'Forest';
    const price = isBasicLand ? 0 : getPrice(card, 'tcgplayer');
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

        // Parse the decklist (mainboard / sideboard / commander, "4"/"4x", set
        // codes, foil markers, headers, duplicate-line aggregation).
        const requests = parseDeckList(text);

        const cardsToAdd: {
          card: Card;
          quantity: number;
          is_sideboard: boolean;
          is_commander: boolean;
        }[] = [];
        let importedCommander: Card | null = null;
        try {
          // Batched exact lookup, with a fuzzy fallback for flavor/alternate names.
          const cardsByName = await resolveCardsByNames(requests.map(r => r.name));
          for (const { name, quantity, is_sideboard, is_commander } of requests) {
            const card = cardsByName.get(name.toLowerCase());
            if (card) {
              cardsToAdd.push({ card, quantity, is_sideboard, is_commander });
              if (is_commander && !importedCommander) importedCommander = card;
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
          for (const { card, quantity, is_sideboard, is_commander } of cardsToAdd) {
            // Merge on (card.id, is_sideboard) so a card can live in both boards.
            const existingCardIndex = updatedCards.findIndex(
              c => c.card.id === card.id && c.is_sideboard === is_sideboard
            );
            if (existingCardIndex !== -1) {
              updatedCards[existingCardIndex] = {
                ...updatedCards[existingCardIndex],
                quantity: updatedCards[existingCardIndex].quantity + quantity,
                is_commander: updatedCards[existingCardIndex].is_commander || is_commander,
              };
            } else {
              updatedCards.push({ card, quantity, is_commander, is_sideboard });
            }
          }
          return updatedCards;
        });

        // A detected commander defaults the deck to the commander format.
        if (importedCommander) {
          setCommander(importedCommander);
          setDeckFormat('commander');
        }
      };

      reader.readAsText(file);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 pt-6 pb-44 md:pt-20 md:pb-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl lg:max-w-none mx-auto">
          {/* Cards-first header: inline-editable deck name, meta line, drawers */}
          <div className="mb-4 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={deckName}
                onChange={e => setDeckName(e.target.value)}
                className="w-full bg-transparent text-2xl font-bold text-white placeholder-gray-500 border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none px-0 py-1"
                placeholder="Untitled deck"
                aria-label="Deck name"
              />
              <p className="mt-1 text-sm text-gray-400 capitalize">
                {deckFormat} · {deckSize} {deckSize === 1 ? 'card' : 'cards'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                aria-label="Deck settings"
                className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white active:bg-gray-700 hover:bg-gray-700 transition-colors"
              >
                <SlidersHorizontal size={18} />
                <span className="hidden sm:inline">Settings</span>
              </button>
              <button
                onClick={() => setShowShare(true)}
                aria-label="Share deck"
                className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white active:bg-gray-700 hover:bg-gray-700 transition-colors"
              >
                <Share2 size={18} />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </div>

          {/* Open the card-search drawer/modal (desktop; mobile uses the FAB) */}
          <button
            onClick={() => setShowSearch(true)}
            className="hidden md:flex w-full mb-4 items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors"
          >
            <Search size={18} /> Add cards
          </button>

          {/* Deck Builder Section */}
          <DeckCardList
            deckFormat={deckFormat}
            commander={commander}
            selectedCards={selectedCards}
            commanderColors={commanderColors}
            isCardValidForCommander={isCardValidForCommander}
            validation={validation}
            updateCardQuantity={updateCardQuantity}
            removeCardFromDeck={removeCardFromDeck}
            moveCardBoard={moveCardBoard}
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

          {/* Stats + sample hand: stacked on mobile, side by side on desktop */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Deck Stats are MTG-specific (mana curve / colours). */}
            {game === 'mtg' && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-white mb-3">Deck Stats</h2>
                <DeckStats cards={mainboardCards} />
              </div>
            )}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-white mb-3">Sample Hand</h2>
              <SampleHand cards={mainboardCards} />
            </div>
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

      {/* Mobile floating search button — opens the add-cards drawer, sits above the action bar */}
      <button
        onClick={() => setShowSearch(true)}
        aria-label="Add cards"
        className="md:hidden fixed right-4 bottom-48 z-30 w-14 h-14 flex items-center justify-center rounded-full bg-blue-600 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30"
      >
        <Search size={24} />
      </button>

      {/* Card search — bottom drawer on mobile, wide two-pane modal on desktop
          (results on the left, hover preview on the right, inside the modal). */}
      <Modal isOpen={showSearch} onClose={() => setShowSearch(false)} size="xl" labelledBy="add-cards-title">
        <div className="p-3">
          <h2 id="add-cards-title" className="text-lg font-semibold text-white mb-3 pr-8">Add cards</h2>
          <div className="lg:flex lg:gap-4">
            <div className="lg:flex-1 lg:min-w-0">
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
            {/* Hover preview — desktop only, lives inside the modal */}
            <div className="hidden lg:block lg:w-60 shrink-0">
              <div className="sticky top-0">
                {hoveredCard && getCardLargeImageUri(hoveredCard, getCurrentFaceIndex(hoveredCard.id)) ? (
                  <img
                    src={getCardLargeImageUri(hoveredCard, getCurrentFaceIndex(hoveredCard.id))}
                    alt={hoveredCard.name}
                    className="w-full rounded-xl shadow-lg"
                  />
                ) : (
                  <div className="aspect-[5/7] w-full rounded-xl border border-dashed border-gray-600 flex items-center justify-center p-4 text-center text-sm text-gray-500">
                    Survole une carte pour l'aperçu
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Deck settings — format, tags, commander, decklist import */}
      <DeckSettingsDrawer
        game={game}
        deckFormat={deckFormat}
        setDeckFormat={setDeckFormat}
        tags={tags}
        addTag={addTag}
        removeTag={removeTag}
        commander={commander}
        setCommander={setCommander}
        commanderColors={commanderColors}
        selectedCards={selectedCards}
        handleFileUpload={handleFileUpload}
        isImporting={isImporting}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onDeleteDeck={currentDeckId ? () => { setShowSettings(false); setShowDeleteConfirm(true); } : undefined}
      />

      {/* Share deck — 3-level visibility + shareable link */}
      <DeckShareDrawer
        visibility={visibility}
        setVisibility={setVisibilityPersisted}
        deckId={currentDeckId}
        isOpen={showShare}
        onClose={() => setShowShare(false)}
      />

      {showExport && (
        <DeckExportModal cards={selectedCards} deckName={deckName} onClose={() => setShowExport(false)} />
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteDeck}
        title="Supprimer le deck ?"
        message={`« ${deckName || 'Ce deck'} » sera définitivement supprimé.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Floating hover preview for the deck list. Suppressed while the search
          modal is open — that has its own in-modal preview pane. */}
      {hoveredCard && !selectedCard && !showSearch && (
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
          quantityInDeck={selectedCards.find(c => c.card.id === selectedCard.id && !c.is_sideboard)?.quantity || 0}
          inDeck={Boolean(selectedCards.find(c => c.card.id === selectedCard.id && !c.is_sideboard))}
          collectionQuantity={userCollection[selectedCard.id]}
          getCurrentFaceIndex={getCurrentFaceIndex}
          toggleCardFace={toggleCardFace}
          getLargeImageUri={getCardLargeImageUri}
          onClose={() => setSelectedCard(null)}
          onChangePrinting={(printing) => changeCardPrinting(selectedCard.id, printing, false)}
          onIncrement={() => addCardToDeck(selectedCard)}
          onDecrement={() => {
            const cardInDeck = selectedCards.find(c => c.card.id === selectedCard.id && !c.is_sideboard);
            const currentQuantity = cardInDeck?.quantity || 0;
            if (currentQuantity === 1) {
              removeCardFromDeck(selectedCard.id, false);
            } else if (currentQuantity > 1) {
              updateCardQuantity(selectedCard.id, currentQuantity - 1, false);
            }
          }}
        />
      )}
    </div>
  );
}
