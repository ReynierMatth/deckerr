import React, { useState, useEffect } from 'react';
import { Search, Plus, Loader2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Card } from '../types';
import { searchCards, getUserCollection, addCardToCollection, getCardsByIds } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import MagicCard from './MagicCard';

export default function Collection() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [collection, setCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);
  const [isAddingCard, setIsAddingCard] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load user's collection from Supabase on mount
  useEffect(() => {
    const loadCollection = async () => {
      if (!user) {
        setIsLoadingCollection(false);
        return;
      }

      try {
        setIsLoadingCollection(true);
        // Get collection from Supabase (returns Map<card_id, quantity>)
        const collectionMap = await getUserCollection(user.id);

        if (collectionMap.size === 0) {
          setCollection([]);
          return;
        }

        // Get the actual card data from Scryfall for all cards in collection
        const cardIds = Array.from(collectionMap.keys());
        const cards = await getCardsByIds(cardIds);

        // Combine card data with quantities
        const collectionWithCards = cards.map(card => ({
          card,
          quantity: collectionMap.get(card.id) || 0,
        }));

        setCollection(collectionWithCards);
      } catch (error) {
        console.error('Error loading collection:', error);
        setSnackbar({ message: 'Failed to load collection', type: 'error' });
      } finally {
        setIsLoadingCollection(false);
      }
    };

    loadCollection();
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const cards = await searchCards(searchQuery);
      setSearchResults(cards);
    } catch (error) {
      console.error('Failed to search cards:', error);
      setSnackbar({ message: 'Failed to search cards', type: 'error' });
    }
  };

  const addToCollection = async (card: Card) => {
    if (!user) {
      setSnackbar({ message: 'Please log in to add cards to your collection', type: 'error' });
      return;
    }

    try {
      setIsAddingCard(card.id);

      // Add card to Supabase
      await addCardToCollection(user.id, card.id, 1);

      // Update local state
      setCollection(prev => {
        const existing = prev.find(c => c.card.id === card.id);
        if (existing) {
          return prev.map(c =>
            c.card.id === card.id
              ? { ...c, quantity: c.quantity + 1 }
              : c
          );
        }
        return [...prev, { card, quantity: 1 }];
      });

      setSnackbar({ message: 'Card added to collection!', type: 'success' });
    } catch (error) {
      console.error('Error adding card to collection:', error);
      setSnackbar({ message: 'Failed to add card to collection', type: 'error' });
    } finally {
      setIsAddingCard(null);
      setTimeout(() => setSnackbar(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Collection</h1>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search cards to add..."
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

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Search Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {searchResults.map(card => {
                const inCollection = collection.find(c => c.card.id === card.id);

                return (
                  <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all">
                    <MagicCard card={card} />
                    <div className="p-4">
                      <h3 className="font-bold mb-2">{card.name}</h3>
                      {inCollection && (
                        <div className="text-sm text-green-400 mb-2 flex items-center gap-1">
                          <CheckCircle size={16} />
                          In collection (x{inCollection.quantity})
                        </div>
                      )}
                      {card.prices?.usd && (
                        <div className="text-sm text-gray-400 mb-2">${card.prices.usd}</div>
                      )}
                      <button
                        onClick={() => addToCollection(card)}
                        disabled={isAddingCard === card.id}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2"
                      >
                        {isAddingCard === card.id ? (
                          <>
                            <Loader2 className="animate-spin" size={20} />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus size={20} />
                            Add to Collection
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collection */}
        <div>
          <h2 className="text-xl font-semibold mb-4">
            My Cards ({collection.length} unique cards, {collection.reduce((acc, c) => acc + c.quantity, 0)} total)
          </h2>

          {isLoadingCollection ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={48} />
            </div>
          ) : collection.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-2">Your collection is empty</p>
              <p className="text-sm">Search for cards above to add them to your collection</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {collection.map(({ card, quantity }) => (
                <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all">
                  <MagicCard card={card} />
                  <div className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold">{card.name}</h3>
                      <span className="text-sm bg-blue-600 px-2 py-1 rounded font-semibold">
                        x{quantity}
                      </span>
                    </div>
                    {card.prices?.usd && (
                      <div className="text-sm text-gray-400">
                        ${card.prices.usd} each
                        <span className="text-xs ml-2">
                          (${(parseFloat(card.prices.usd) * quantity).toFixed(2)} total)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Snackbar */}
      {snackbar && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            snackbar.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white`}
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
