import React, { useState, useEffect } from 'react';
import { Save, Loader2, PackagePlus } from 'lucide-react';
import { Card, Deck } from '../types';
import { searchCards, resolveCardsByNames, getUserCollection, addCardToCollection, addMultipleCardsToCollection } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isDoubleFaced } from '../utils/cardFaces';
import { useCardFaces } from '../hooks/useCardFaces';
import { supabase } from '../lib/supabase';
import { validateDeck } from '../utils/deckValidation';
import { parseDeckList } from '../utils/parseDeckList';
import CardDetailPanel from './deck/CardDetailPanel';
import HoverCardPreview from './deck/HoverCardPreview';
import DeckSearchPanel from './deck/DeckSearchPanel';
import DeckCardList from './deck/DeckCardList';
import DeckStats from './deck/DeckStats';

interface DeckManagerProps {
  initialDeck?: Deck;
  onSave?: () => void;
}

// const calculateManaCurve = (cards: { card; quantity: number }[]) => {
//   const manaValues = cards.map(({ card }) => {
//     if (!card.mana_cost) return 0;
//     // Basic heuristic: count mana symbols
//     return (card.mana_cost.match(/\{WUBRG0-9]\}/g) || []).length;
//   });

//   const averageManaValue = manaValues.reduce((a, b) => a + b, 0) / manaValues.length;
//   return averageManaValue;
// };

const suggestLandCountAndDistribution = (
  cards: { card: Card; quantity: number }[],
  format: string,
  commanderColors: string[] = []
) => {
  const formatRules = {
    standard: { minCards: 60 },
    modern: { minCards: 60 },
    commander: { minCards: 100 },
    legacy: { minCards: 60 },
    vintage: { minCards: 60 },
    pauper: { minCards: 60 },
  };

  const { minCards } =
    formatRules[format as keyof typeof formatRules] || formatRules.standard;
  const deckSize = cards.reduce((acc, { quantity }) => acc + quantity, 0);
  const landsToAdd = Math.max(0, minCards - deckSize);

  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let totalColorSymbols = 0;

  cards.forEach(({ card, quantity }) => {
    if (card.mana_cost) {
      const wMatches = (card.mana_cost.match(/\{W\}/g) || []).length;
      const uMatches = (card.mana_cost.match(/\{U\}/g) || []).length;
      const bMatches = (card.mana_cost.match(/\{B\}/g) || []).length;
      const rMatches = (card.mana_cost.match(/\{R\}/g) || []).length;
      const gMatches = (card.mana_cost.match(/\{G\}/g) || []).length;

      colorCounts.W += wMatches * quantity;
      colorCounts.U += uMatches * quantity;
      colorCounts.B += bMatches * quantity;
      colorCounts.R += rMatches * quantity;
      colorCounts.G += gMatches * quantity;

      totalColorSymbols +=
        (wMatches + uMatches + bMatches + rMatches + gMatches) * quantity;
    }
  });

  // For commander, filter out colors not in commander's color identity
  if (format === 'commander' && commanderColors.length > 0) {
    for (const color in colorCounts) {
      if (!commanderColors.includes(color)) {
        totalColorSymbols -= colorCounts[color as keyof typeof colorCounts];
        colorCounts[color as keyof typeof colorCounts] = 0;
      }
    }
  }

  const landDistribution: { [key: string]: number } = {};
  for (const color in colorCounts) {
    const proportion =
      totalColorSymbols > 0
        ? colorCounts[color as keyof typeof colorCounts] / totalColorSymbols
        : 0;
    landDistribution[color] = Math.round(landsToAdd * proportion);
  }

  const totalDistributed = Object.values(landDistribution).reduce(
    (acc, count) => acc + count,
    0
  );

  if (totalDistributed > landsToAdd) {
    // Find the color with the most lands
    let maxColor = '';
    let maxCount = 0;
    for (const color in landDistribution) {
      if (landDistribution[color] > maxCount) {
        maxColor = color;
        maxCount = landDistribution[color];
      }
    }

    // Reduce the land count of that color
    landDistribution[maxColor] = maxCount - 1;
  }

  return { landCount: landsToAdd, landDistribution };
};

// Get commander color identity
const getCommanderColors = (commander: Card | null): string[] => {
  if (!commander) return [];
  return commander.colors || [];
};

// Check if a card's colors are valid for the commander
const isCardValidForCommander = (card: Card, commanderColors: string[]): boolean => {
  if (commanderColors.length === 0) return true; // No commander restriction
  const cardColors = card.colors || [];
  // Every color in the card must be in the commander's colors
  return cardColors.every(color => commanderColors.includes(color));
};

export default function DeckManager({ initialDeck, onSave }: DeckManagerProps) {
  const toast = useToast();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(initialDeck?.id || null);
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
  const [commander, setCommander] = useState<Card | null>(
      initialDeck?.cards.find(card =>
          card.is_commander
      )?.card  || null
  );

  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Collection management state
  const [userCollection, setUserCollection] = useState<Map<string, number>>(new Map());
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [hoverSource, setHoverSource] = useState<'search' | 'deck' | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Load user collection on component mount
  useEffect(() => {
    const loadUserCollection = async () => {
      if (!user) return;

      try {
        setIsLoadingCollection(true);
        const collection = await getUserCollection(user.id);
        setUserCollection(collection);
      } catch (error) {
        console.error('Error loading user collection:', error);
        toast.error('Failed to load collection');
      } finally {
        setIsLoadingCollection(false);
      }
    };

    loadUserCollection();
  }, [user]);

  // Helper functions for double-faced cards
  const getCardLargeImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.large || card.image_uris?.normal;
  };

  // Helper function to check if a card is in the collection
  const isCardInCollection = (cardId: string, requiredQuantity: number = 1): boolean => {
    const ownedQuantity = userCollection.get(cardId) || 0;
    return ownedQuantity >= requiredQuantity;
  };

  // Helper function to get missing cards
  const getMissingCards = () => {
    return selectedCards.filter(({ card, quantity }) => {
      return !isCardInCollection(card.id, quantity);
    });
  };

  // Add single card to collection
  const handleAddCardToCollection = async (cardId: string, quantity: number) => {
    if (!user) return;

    try {
      setAddingCardId(cardId);
      const card = selectedCards.find(c => c.card.id === cardId)?.card;
      const priceUsd = card?.prices?.usd ? Number(card.prices.usd) : 0;
      await addCardToCollection(user.id, cardId, quantity, priceUsd);

      // Update local collection state
      setUserCollection(prev => {
        const newMap = new Map(prev);
        const currentQty = newMap.get(cardId) || 0;
        newMap.set(cardId, currentQty + quantity);
        return newMap;
      });

      toast.success('Card added to collection!');
    } catch (error) {
      console.error('Error adding card to collection:', error);
      toast.error('Failed to add card to collection');
    } finally {
      setAddingCardId(null);
    }
  };

  // Add all missing cards to collection
  const handleAddAllMissingCards = async () => {
    if (!user) return;

    const missingCards = getMissingCards();
    if (missingCards.length === 0) {
      toast.success('All cards are already in your collection!');
      return;
    }

    try {
      setIsAddingAll(true);

      const cardsToAdd = missingCards.map(({ card, quantity }) => {
        const ownedQuantity = userCollection.get(card.id) || 0;
        const neededQuantity = Math.max(0, quantity - ownedQuantity);
        return {
          cardId: card.id,
          quantity: neededQuantity,
          priceUsd: card.prices?.usd ? Number(card.prices.usd) : 0,
        };
      }).filter(c => c.quantity > 0);

      await addMultipleCardsToCollection(user.id, cardsToAdd);

      // Update local collection state
      setUserCollection(prev => {
        const newMap = new Map(prev);
        cardsToAdd.forEach(({ cardId, quantity }) => {
          const currentQty = newMap.get(cardId) || 0;
          newMap.set(cardId, currentQty + quantity);
        });
        return newMap;
      });

      toast.success(`Successfully added ${cardsToAdd.length} card(s) to collection!`);
    } catch (error) {
      console.error('Error adding cards to collection:', error);
      toast.error('Failed to add cards to collection');
    } finally {
      setIsAddingAll(false);
    }
  };

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

  const saveDeck = async () => {
    if (!deckName.trim() || selectedCards.length === 0 || !user) return;

    setIsSaving(true);
    try {
      const deckId = currentDeckId || crypto.randomUUID();
      const deckToSave: Deck = {
        id: deckId,
        name: deckName,
        format: deckFormat,
        cards: selectedCards,
        userId: user.id,
        createdAt: initialDeck?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      // Calculate validation for storage
      const validation = validateDeck(deckToSave);

      // Determine cover card (commander or first card)
      const commanderCard = deckFormat === 'commander' ? selectedCards.find(c => c.card.id === commander?.id) : null;
      const coverCard = commanderCard?.card || selectedCards[0]?.card;
      const coverCardId = coverCard?.id || null;

      // Calculate total card count
      const totalCardCount = selectedCards.reduce((acc, curr) => acc + curr.quantity, 0);

      const deckData = {
        id: deckToSave.id,
        name: deckToSave.name,
        format: deckToSave.format,
        user_id: deckToSave.userId,
        created_at: deckToSave.createdAt,
        updated_at: deckToSave.updatedAt,
        cover_card_id: coverCardId,
        validation_errors: validation.errors,
        is_valid: validation.isValid,
        card_count: totalCardCount,
      };

      // Save or update the deck
      const { error: deckError } = await supabase
        .from('decks')
        .upsert([deckData])
        .select();

      if (deckError) throw deckError;

      // Update current deck ID if this was a new deck
      if (!currentDeckId) {
        setCurrentDeckId(deckId);
      }

      // Delete existing cards if updating
      if (currentDeckId) {
        await supabase.from('deck_cards').delete().eq('deck_id', currentDeckId);
      }

      // Save the deck cards
      const deckCards = selectedCards.map(card => ({
        deck_id: deckToSave.id,
        card_id: card.card.id,
        quantity: card.quantity,
        is_commander: card.card.id === commander?.id,
      }));

      const { error: cardsError } = await supabase
        .from('deck_cards')
        .insert(deckCards);

      if (cardsError) throw cardsError;

      toast.success('Deck saved successfully!');
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving deck:', error);
      toast.error('Failed to save deck.');
    } finally {
      setIsSaving(false);
    }
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Card Search Section */}
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

          {/* Deck Builder Section */}
          <DeckCardList
            deckName={deckName}
            setDeckName={setDeckName}
            deckFormat={deckFormat}
            setDeckFormat={setDeckFormat}
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
        </div>
      </div>

      {/* Fixed Footer with Price and Actions - Mobile First */}
      <div className="fixed bottom-16 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-80 z-20 bg-gray-800 border-t border-gray-700 md:border md:rounded-lg shadow-2xl">
        <div className="p-3 space-y-3">
          {/* Total Price */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">Total Price</span>
            <span className="text-xl font-bold text-green-400">${totalPrice.toFixed(2)}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {!isLoadingCollection && getMissingCards().length > 0 && (
              <button
                onClick={handleAddAllMissingCards}
                disabled={isAddingAll}
                className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                title="Add missing cards to collection"
              >
                {isAddingAll ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <PackagePlus size={18} />
                    <span className="hidden sm:inline">Add Missing</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={saveDeck}
              disabled={
                !deckName.trim() || selectedCards.length === 0 || isSaving
              }
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm font-medium relative transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin text-white" size={18} />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>{initialDeck ? 'Update' : 'Save'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hover Card Preview - only show if no card is selected */}
      {hoveredCard && !selectedCard && (
        <HoverCardPreview
          card={hoveredCard}
          hoverSource={hoverSource}
          getCurrentFaceIndex={getCurrentFaceIndex}
          getLargeImageUri={getCardLargeImageUri}
        />
      )}

      {/* Card Detail Panel - slides in from right */}
      {selectedCard && (
        <CardDetailPanel
          card={selectedCard}
          quantityInDeck={selectedCards.find(c => c.card.id === selectedCard.id)?.quantity || 0}
          inDeck={Boolean(selectedCards.find(c => c.card.id === selectedCard.id))}
          collectionQuantity={userCollection.has(selectedCard.id) ? userCollection.get(selectedCard.id) : undefined}
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
