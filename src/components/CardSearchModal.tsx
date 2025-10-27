import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { searchCards } from '../services/api';
import { Card } from '../types';

interface CardSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCard: (card: Card) => void;
}

export default function CardSearchModal({ isOpen, onClose, onSelectCard }: CardSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const cards = await searchCards(`name:${searchQuery}`);
      setSearchResults(cards || []);
    } catch (err) {
      setError('Failed to fetch cards. Please try again.');
      console.error('Error fetching cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCard = (card: Card) => {
    onSelectCard(card);
    onClose();
    setSearchQuery('');
    setSearchResults([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Search Card for Background</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search Form */}
        <div className="p-4 border-b border-gray-700">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Search for a card by name..."
              autoFocus
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white flex items-center gap-2 transition-colors"
            >
              <Search size={20} />
              Search
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && searchResults.length === 0 && searchQuery && (
            <div className="text-center text-gray-400 py-8">
              No cards found. Try a different search term.
            </div>
          )}

          {!loading && !error && searchResults.length === 0 && !searchQuery && (
            <div className="text-center text-gray-400 py-8">
              Search for a card to use as background
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {searchResults.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleSelectCard(card)}
                  className="bg-gray-700 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all transform hover:scale-105"
                >
                  {card.image_uris?.art_crop ? (
                    <img
                      src={card.image_uris.art_crop}
                      alt={card.name}
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="w-full h-32 bg-gray-600 flex items-center justify-center">
                      <span className="text-gray-400 text-xs text-center px-2">No Image</span>
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-white text-sm font-medium truncate">{card.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
