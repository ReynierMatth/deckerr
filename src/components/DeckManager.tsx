import React, { useState, useEffect } from 'react';
import { Plus, Search, Save, Trash2 } from 'lucide-react';
import { Card, Deck } from '../types';
import { searchCards } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { validateDeck } from '../utils/deckValidation';

interface DeckManagerProps {
  initialDeck?: Deck;
  onSave?: () => void;
}

export default function DeckManager({ initialDeck, onSave }: DeckManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<{ card: Card; quantity: number }[]>(
    initialDeck?.cards || []
  );
  const [deckName, setDeckName] = useState(initialDeck?.name || '');
  const [deckFormat, setDeckFormat] = useState(initialDeck?.format || 'standard');
  const { user } = useAuth();

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
      const existing = prev.find(c => c.card.id === card.id);
      if (existing) {
        return prev.map(c =>
          c.card.id === card.id
            ? { ...c, quantity: Math.min(c.quantity + 1, 4) }
            : c
        );
      }
      return [...prev, { card, quantity: 1 }];
    });
  };

  const removeCardFromDeck = (cardId: string) => {
    setSelectedCards(prev => prev.filter(c => c.card.id !== cardId));
  };

  const updateCardQuantity = (cardId: string, quantity: number) => {
    setSelectedCards(prev =>
      prev.map(c =>
        c.card.id === cardId
          ? { ...c, quantity: Math.max(1, Math.min(quantity, 4)) }
          : c
      )
    );
  };

  const saveDeck = async () => {
    if (!deckName.trim() || selectedCards.length === 0 || !user) return;

    const deckToSave: Deck = {
      id: initialDeck?.id || crypto.randomUUID(),
      name: deckName,
      format: deckFormat,
      cards: selectedCards,
      userId: user.id,
      createdAt: initialDeck?.createdAt || new Date(),
      updatedAt: new Date()
    };

    const validation = validateDeck(deckToSave);
    if (!validation.isValid) {
      alert(`Deck validation failed: ${validation.errors.join(', ')}`);
      return;
    }

    try {
      const deckData = {
        id: deckToSave.id,
        name: deckToSave.name,
        format: deckToSave.format,
        user_id: deckToSave.userId,
        created_at: deckToSave.createdAt,
        updated_at: deckToSave.updatedAt
      };

      // Save or update the deck
      const { error: deckError } = await supabase
        .from('decks')
        .upsert([deckData])
        .select();

      if (deckError) throw deckError;

      // Delete existing cards if updating
      if (initialDeck) {
        await supabase
          .from('deck_cards')
          .delete()
          .eq('deck_id', initialDeck.id);
      }

      // Save the deck cards
      const deckCards = selectedCards.map(card => ({
        deck_id: deckToSave.id,
        card_id: card.card.id,
        quantity: card.quantity,
        is_commander: card.card.type_line?.toLowerCase().includes('legendary creature') || false
      }));

      const { error: cardsError } = await supabase
        .from('deck_cards')
        .insert(deckCards);

      if (cardsError) throw cardsError;

      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving deck:', error);
      alert('Failed to save deck');
    }
  };

  const currentDeck: Deck = {
    id: initialDeck?.id || '',
    name: deckName,
    format: deckFormat,
    cards: selectedCards,
    userId: user?.id || '',
    createdAt: initialDeck?.createdAt || new Date(),
    updatedAt: new Date()
  };

  const validation = validateDeck(currentDeck);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Search Section */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                  {card.image_uris?.normal && (
                    <img
                      src={card.image_uris.normal}
                      alt={card.name}
                      className="w-full h-auto"
                    />
                  )}
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
                onChange={(e) => setDeckName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                placeholder="Deck Name"
              />

              <select
                value={deckFormat}
                onChange={(e) => setDeckFormat(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="standard">Standard</option>
                <option value="modern">Modern</option>
                <option value="commander">Commander</option>
                <option value="legacy">Legacy</option>
                <option value="vintage">Vintage</option>
                <option value="pauper">Pauper</option>
              </select>

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
                  <div key={card.id} className="flex items-center gap-4 bg-gray-700 p-2 rounded-lg">
                    <img
                      src={card.image_uris?.art_crop}
                      alt={card.name}
                      className="w-12 h-12 rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium">{card.name}</h4>
                    </div>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => updateCardQuantity(card.id, parseInt(e.target.value))}
                      min="1"
                      max="4"
                      className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-center"
                    />
                    <button
                      onClick={() => removeCardFromDeck(card.id)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Trash2 size={20}/>
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={saveDeck}
                disabled={!deckName.trim() || selectedCards.length === 0 || !validation.isValid}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2"
              >
                <Save size={20} />
                {initialDeck ? 'Update Deck' : 'Save Deck'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
