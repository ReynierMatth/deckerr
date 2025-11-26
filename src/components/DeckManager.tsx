import React, { useState, useEffect } from 'react';
import { Plus, Minus, Search, Save, Trash2, Loader2, CheckCircle, XCircle, AlertCircle, PackagePlus, RefreshCw, X } from 'lucide-react';
import { Card, Deck } from '../types';
import { searchCards, getUserCollection, addCardToCollection, addMultipleCardsToCollection } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { validateDeck } from '../utils/deckValidation';
import MagicCard from './MagicCard';
import { ManaCost, ManaSymbol } from './ManaCost';

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
  cards: { card; quantity: number }[],
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
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(initialDeck?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCards, setSelectedCards] = useState<{
    card: Card;
    quantity: number;
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
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Collection management state
  const [userCollection, setUserCollection] = useState<Map<string, number>>(new Map());
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [cardFaceIndex, setCardFaceIndex] = useState<Map<string, number>>(new Map());
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
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
        setSnackbar({ message: 'Failed to load collection', type: 'error' });
      } finally {
        setIsLoadingCollection(false);
      }
    };

    loadUserCollection();
  }, [user]);

  // Helper functions for double-faced cards
  const isDoubleFaced = (card: Card) => {
    const backFaceLayouts = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];
    return card.card_faces && card.card_faces.length > 1 && backFaceLayouts.includes(card.layout);
  };

  const getCurrentFaceIndex = (cardId: string) => {
    return cardFaceIndex.get(cardId) || 0;
  };

  const toggleCardFace = (cardId: string, totalFaces: number) => {
    setCardFaceIndex(prev => {
      const newMap = new Map(prev);
      const currentIndex = prev.get(cardId) || 0;
      const nextIndex = (currentIndex + 1) % totalFaces;
      newMap.set(cardId, nextIndex);
      return newMap;
    });
  };

  const getCardImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.normal || card.card_faces[faceIndex]?.image_uris?.small;
    }
    return card.image_uris?.normal || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.normal;
  };

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
      await addCardToCollection(user.id, cardId, quantity);

      // Update local collection state
      setUserCollection(prev => {
        const newMap = new Map(prev);
        const currentQty = newMap.get(cardId) || 0;
        newMap.set(cardId, currentQty + quantity);
        return newMap;
      });

      setSnackbar({ message: 'Card added to collection!', type: 'success' });
    } catch (error) {
      console.error('Error adding card to collection:', error);
      setSnackbar({ message: 'Failed to add card to collection', type: 'error' });
    } finally {
      setAddingCardId(null);
      setTimeout(() => setSnackbar(null), 3000);
    }
  };

  // Add all missing cards to collection
  const handleAddAllMissingCards = async () => {
    if (!user) return;

    const missingCards = getMissingCards();
    if (missingCards.length === 0) {
      setSnackbar({ message: 'All cards are already in your collection!', type: 'success' });
      setTimeout(() => setSnackbar(null), 3000);
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

      setSnackbar({
        message: `Successfully added ${cardsToAdd.length} card(s) to collection!`,
        type: 'success'
      });
    } catch (error) {
      console.error('Error adding cards to collection:', error);
      setSnackbar({ message: 'Failed to add cards to collection', type: 'error' });
    } finally {
      setIsAddingAll(false);
      setTimeout(() => setSnackbar(null), 3000);
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
      setSnackbar({ message: 'Failed to search cards', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const addCardToDeck = (card: Card) => {
    setSelectedCards(prev => {
      const isBasicLand =
        card.name === 'Plains' ||
        card.name === 'Island' ||
        card.name === 'Swamp' ||
        card.name === 'Mountain' ||
        card.name === 'Forest';
      const existing = prev.find(c => c.card.id === card.id);
      if (existing) {
        return prev.map(c =>
          c.card.id === card.id
            ? {
                ...c,
                quantity: isBasicLand ? c.quantity + 1 : Math.min(c.quantity + 1, 4),
              }
            : c
        );
      }
      return [...prev, { card, quantity: 1 }];
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

      setSnackbar({ message: 'Deck saved successfully!', type: 'success' });
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving deck:', error);
      setSnackbar({ message: 'Failed to save deck.', type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSnackbar(null), 3000); // Clear snackbar after 3 seconds
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
        const landName = basicLandCards[color]?.name;
        const landSet = basicLandCards[color]?.set;

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
        const lines = text.split('\n');
        const cardsToAdd: { card: Card; quantity: number }[] = [];

        for (const line of lines) {
          const parts = line.trim().split(' ');
          const quantity = parseInt(parts[0]);
          const cardName = parts.slice(1).join(' ');

          if (isNaN(quantity) || quantity <= 0 || !cardName) continue;

          try {
            const searchResults = await searchCards(cardName);
            if (searchResults && searchResults.length > 0) {
              const card = searchResults[0];
              cardsToAdd.push({ card, quantity });
            } else {
              console.warn(`Card not found: ${cardName}`);
              setSnackbar({ message: `Card not found: ${cardName}`, type: 'error' });
            }
          } catch (error) {
            console.error(`Failed to search card ${cardName}:`, error);
            setSnackbar({ message: `Failed to import card: ${cardName}`, type: 'error' });
          }
        }

        setSelectedCards(prev => {
          const updatedCards = [...prev];
          for (const { card, quantity } of cardsToAdd) {
            const existingCardIndex = updatedCards.findIndex(
              c => c.card.id === card.id
            );
            if (existingCardIndex !== -1) {
              updatedCards[existingCardIndex].quantity = Math.min(
                updatedCards[existingCardIndex].quantity + quantity,
                4
              );
            } else {
              updatedCards.push({ card, quantity });
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
                    onMouseEnter={() => setHoveredCard(card)}
                    onMouseLeave={() => setHoveredCard(null)}
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

          {/* Deck Builder Section */}
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
                      onMouseEnter={() => setHoveredCard(card)}
                      onMouseLeave={() => setHoveredCard(null)}
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
      {hoveredCard && !selectedCard && (() => {
        const currentFaceIndex = getCurrentFaceIndex(hoveredCard.id);
        const isMultiFaced = isDoubleFaced(hoveredCard);
        const currentFace = isMultiFaced && hoveredCard.card_faces
          ? hoveredCard.card_faces[currentFaceIndex]
          : null;

        const displayName = currentFace?.name || hoveredCard.name;
        const displayTypeLine = currentFace?.type_line || hoveredCard.type_line;
        const displayOracleText = currentFace?.oracle_text || hoveredCard.oracle_text;

        return (
          <div className="hidden lg:block fixed top-1/2 right-8 transform -translate-y-1/2 z-30 pointer-events-none">
            <div className="bg-gray-800 rounded-lg shadow-2xl p-4 max-w-md">
              <div className="relative">
                <img
                  src={getCardLargeImageUri(hoveredCard, currentFaceIndex)}
                  alt={displayName}
                  className="w-full h-auto rounded-lg shadow-lg"
                />
                {isMultiFaced && (
                  <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                    Face {currentFaceIndex + 1}/{hoveredCard.card_faces!.length}
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-2">
                <h3 className="text-xl font-bold">{displayName}</h3>
                <p className="text-sm text-gray-400">{displayTypeLine}</p>
                {displayOracleText && (
                  <p className="text-sm text-gray-300 border-t border-gray-700 pt-2">
                    {displayOracleText}
                  </p>
                )}
                {hoveredCard.prices?.usd && (
                  <div className="text-sm text-green-400 font-semibold border-t border-gray-700 pt-2">
                    ${hoveredCard.prices.usd}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Card Detail Panel - slides in from right */}
      {selectedCard && (() => {
        const currentFaceIndex = getCurrentFaceIndex(selectedCard.id);
        const isMultiFaced = isDoubleFaced(selectedCard);
        const currentFace = isMultiFaced && selectedCard.card_faces
          ? selectedCard.card_faces[currentFaceIndex]
          : null;

        const displayName = currentFace?.name || selectedCard.name;
        const displayTypeLine = currentFace?.type_line || selectedCard.type_line;
        const displayOracleText = currentFace?.oracle_text || selectedCard.oracle_text;

        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-[110] transition-opacity duration-300"
              onClick={() => setSelectedCard(null)}
            />

            {/* Sliding Panel */}
            <div className="fixed top-0 right-0 h-full w-full md:w-96 bg-gray-800 shadow-2xl z-[120] overflow-y-auto animate-slide-in-right">
              {/* Close button */}
              <button
                onClick={() => setSelectedCard(null)}
                className="fixed top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white p-2 md:p-1.5 rounded-full transition-colors z-[130] shadow-lg"
                aria-label="Close"
              >
                <X size={24} className="md:w-5 md:h-5" />
              </button>

              <div className="p-4 sm:p-6">
                {/* Card Image */}
                <div className="relative mb-4 max-w-sm mx-auto">
                  <img
                    src={getCardLargeImageUri(selectedCard, currentFaceIndex)}
                    alt={displayName}
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                  {isMultiFaced && (
                    <>
                      <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                        Face {currentFaceIndex + 1}/{selectedCard.card_faces!.length}
                      </div>
                      <button
                        onClick={() => toggleCardFace(selectedCard.id, selectedCard.card_faces!.length)}
                        className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                        title="Flip card"
                      >
                        <RefreshCw size={20} />
                      </button>
                    </>
                  )}
                </div>

                {/* Card Info */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{displayName}</h2>
                    <p className="text-xs sm:text-sm text-gray-400">{displayTypeLine}</p>
                  </div>

                  {displayOracleText && (
                    <div className="border-t border-gray-700 pt-3">
                      <p className="text-sm text-gray-300">{displayOracleText}</p>
                    </div>
                  )}

                  {selectedCard.prices?.usd && (
                    <div className="border-t border-gray-700 pt-3">
                      <div className="text-lg text-green-400 font-semibold">
                        ${selectedCard.prices.usd} each
                      </div>
                    </div>
                  )}

                  {/* Collection Status */}
                  {userCollection.has(selectedCard.id) && (
                    <div className="border-t border-gray-700 pt-3">
                      <div className="text-sm text-green-400">
                        <CheckCircle size={16} className="inline mr-1" />
                        x{userCollection.get(selectedCard.id)} in your collection
                      </div>
                    </div>
                  )}

                  {/* Deck Quantity Management */}
                  <div className="border-t border-gray-700 pt-3">
                    <h3 className="text-lg font-semibold mb-3">Quantity in Deck</h3>
                    <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
                      <button
                        onClick={() => {
                          const cardInDeck = selectedCards.find(c => c.card.id === selectedCard.id);
                          const currentQuantity = cardInDeck?.quantity || 0;
                          if (currentQuantity === 1) {
                            removeCardFromDeck(selectedCard.id);
                          } else if (currentQuantity > 1) {
                            updateCardQuantity(selectedCard.id, currentQuantity - 1);
                          }
                        }}
                        disabled={!selectedCards.find(c => c.card.id === selectedCard.id)}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                      >
                        <Minus size={20} />
                      </button>

                      <div className="text-center">
                        <div className="text-3xl font-bold">
                          {selectedCards.find(c => c.card.id === selectedCard.id)?.quantity || 0}
                        </div>
                        <div className="text-xs text-gray-400">copies</div>
                      </div>

                      <button
                        onClick={() => addCardToDeck(selectedCard)}
                        className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg transition-colors"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {snackbar && (
        <div
          className={`fixed bottom-4 right-4 text-white p-4 rounded-lg shadow-lg transition-all duration-300 z-[140] ${
            snackbar.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {snackbar.type === 'success' ? (
                <CheckCircle className="mr-2" size={20} />
              ) : (
                <XCircle className="mr-2" size={20} />
              )}
              <span>{snackbar.message}</span>
            </div>
            <button onClick={() => setSnackbar(null)} className="ml-4 text-gray-200 hover:text-white focus:outline-none">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
