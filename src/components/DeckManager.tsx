import React, { useState, useEffect } from 'react';
import { Plus, Search, Save, Trash2, Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, Deck } from '../types';
import { searchCards } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { validateDeck } from '../utils/deckValidation';
import MagicCard from './MagicCard';

interface DeckManagerProps {
  initialDeck?: Deck;
  onSave?: () => void;
}

const calculateManaCurve = (cards: { card; quantity: number }[]) => {
  const manaValues = cards.map(({ card }) => {
    if (!card.mana_cost) return 0;
    // Basic heuristic: count mana symbols
    return (card.mana_cost.match(/\{WUBRG0-9]\}/g) || []).length;
  });

  const averageManaValue = manaValues.reduce((a, b) => a + b, 0) / manaValues.length;
  return averageManaValue;
};

const suggestLandCountAndDistribution = (
  cards: { card; quantity: number }[],
  format: string
) => {
  const formatRules = {
    standard: { minCards: 60, targetLands: 24.5 },
    modern: { minCards: 60, targetLands: 24.5 },
    commander: { minCards: 100, targetLands: 36.5 },
    legacy: { minCards: 60, targetLands: 24.5 },
    vintage: { minCards: 60, targetLands: 24.5 },
    pauper: { minCards: 60, targetLands: 24.5 },
  };

  const { minCards, targetLands } =
    formatRules[format as keyof typeof formatRules] || formatRules.standard;
  const deckSize = cards.reduce((acc, { quantity }) => acc + quantity, 0);
  const nonLandCards = cards.reduce(
    (acc, { card, quantity }) =>
      card.type_line?.toLowerCase().includes('land') ? acc : acc + quantity,
    0
  );
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

  const landDistribution: { [key: string]: number } = {};
  for (const color in colorCounts) {
    const proportion =
      totalColorSymbols > 0
        ? colorCounts[color as keyof typeof colorCounts] / totalColorSymbols
        : 0;
    landDistribution[color] = Math.round(landsToAdd * proportion);
  }

  let totalDistributed = Object.values(landDistribution).reduce(
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

export default function DeckManager({ initialDeck, onSave }: DeckManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<{
    card: Card;
    quantity: number;
  }[]>(initialDeck?.cards || []);
  const [deckName, setDeckName] = useState(initialDeck?.name || '');
  const [deckFormat, setDeckFormat] = useState(initialDeck?.format || 'standard');
  const [commander, setCommander] = useState<Card | null>(
    initialDeck?.cards.find(c =>
      c.card.type_line?.toLowerCase().includes('legendary creature')
    )?.card || null
  );
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const cards = await searchCards(searchQuery);
      setSearchResults(cards);
    } catch (error) {
      console.error('Failed to search cards:', error);
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
          const isBasicLand =
            c.card.name === 'Plains' ||
            c.card.name === 'Island' ||
            c.card.name === 'Swamp' ||
            c.card.name === 'Mountain' ||
            c.card.name === 'Forest';
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
      const deckToSave: Deck = {
        id: initialDeck?.id || crypto.randomUUID(),
        name: deckName,
        format: deckFormat,
        cards: selectedCards,
        userId: user.id,
        createdAt: initialDeck?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      const validation = validateDeck(deckToSave);

      const deckData = {
        id: deckToSave.id,
        name: deckToSave.name,
        format: deckToSave.format,
        user_id: deckToSave.userId,
        created_at: deckToSave.createdAt,
        updated_at: deckToSave.updatedAt,
      };

      // Save or update the deck
      const { error: deckError } = await supabase
        .from('decks')
        .upsert([deckData])
        .select();

      if (deckError) throw deckError;

      // Delete existing cards if updating
      if (initialDeck) {
        await supabase.from('deck_cards').delete().eq('deck_id', initialDeck.id);
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

  const deckSize = selectedCards.reduce((acc, curr) => acc + curr.quantity, 0);
  const {
    landCount: suggestedLandCountValue,
    landDistribution: suggestedLands,
  } = suggestLandCountAndDistribution(selectedCards, deckFormat);

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
              alert(`Card not found: ${cardName}`);
            }
          } catch (error) {
            console.error(`Failed to search card ${cardName}:`, error);
            alert(`Failed to search card ${cardName}: ${error}`);
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
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Search Section */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  placeholder="Search for cards..."
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2"
              >
                <Search size={20} />
                Search
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {searchResults.map(card => (
                <div
                  key={card.id}
                  className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  <MagicCard card={card} />
                  <div className="p-4">
                    <h3 className="font-bold mb-2">{card.name}</h3>
                    <button
                      onClick={() => addCardToDeck(card)}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2"
                    >
                      <Plus size={20} />
                      Add to Deck
                    </button>
                  </div>
                </div>
              ))}
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
                      c.card.type_line?.toLowerCase().includes('legendary creature')
                    )
                    .map(({ card }) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
                    ))}
                </select>
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
                <h3 className="font-bold text-xl mb-4">
                  Cards ({selectedCards.reduce((acc, curr) => acc + curr.quantity, 0)})
                </h3>
                {selectedCards.map(({ card, quantity }) => (
                  <div
                    key={card.id}
                    className="flex items-center gap-4 bg-gray-700 p-2 rounded-lg"
                  >
                    <img
                      src={card.image_uris?.art_crop}
                      alt={card.name}
                      className="w-12 h-12 rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">{card.name}</h4>
                      {card.prices?.usd && (
                        <div className="text-sm text-gray-400">${card.prices.usd}</div>
                      )}
                    </div>
                    <input
                      type="number"
                      value={quantity}
                      onChange={e =>
                        updateCardQuantity(card.id, parseInt(e.target.value))
                      }
                      min="1"
                      className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-center"
                    />
                    <button
                      onClick={() => removeCardFromDeck(card.id)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="font-bold text-xl">
                Total Price: ${totalPrice.toFixed(2)}
              </div>

              {deckSize > 0 && (
                <div className="text-gray-400">
                  Suggested Land Count: {suggestedLandCountValue}
                  {Object.entries(suggestedLands).map(([landType, count]) => (
                    <div key={landType}>
                      {landType}: {count}
                    </div>
                  ))}
                </div>
              )}

              {deckSize > 0 && (
                <button
                  onClick={addSuggestedLandsToDeck}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  Add Suggested Lands
                </button>
              )}

              <button
                onClick={saveDeck}
                disabled={
                  !deckName.trim() || selectedCards.length === 0 || isSaving
                }
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 relative"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin text-white absolute left-2 top-1/2 -translate-y-1/2" size={20} />
                    <span className="opacity-0">Save Deck</span>
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    <span>{initialDeck ? 'Update Deck' : 'Save Deck'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      {snackbar && (
        <div
          className={`fixed bottom-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg transition-all duration-300 ${
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
