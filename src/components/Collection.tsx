import React, { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Card } from '../types';
import { searchCards } from '../services/api';

export default function Collection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [collection, setCollection] = useState<{ card: Card; quantity: number }[]>([]);

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

  const addToCollection = (card: Card) => {
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
              {searchResults.map(card => (
                <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden">
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
                      onClick={() => addToCollection(card)}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2"
                    >
                      <Plus size={20} />
                      Add to Collection
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collection */}
        <div>
          <h2 className="text-xl font-semibold mb-4">My Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {collection.map(({ card, quantity }) => (
              <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden">
                {card.image_uris?.normal && (
                  <img
                    src={card.image_uris.normal}
                    alt={card.name}
                    className="w-full h-auto"
                  />
                )}
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold">{card.name}</h3>
                    <span className="text-sm bg-blue-600 px-2 py-1 rounded">
                      x{quantity}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
