import React, { useState, useEffect } from 'react';
import { Search, Loader2, Trash2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Card } from '../types';
import { getUserCollection, getCardsByIds } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Collection() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [collection, setCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [filteredCollection, setFilteredCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [cardFaceIndex, setCardFaceIndex] = useState<Map<string, number>>(new Map());
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Helper function to check if a card has an actual back face (not adventure/split/etc)
  const isDoubleFaced = (card: Card) => {
    // Only show flip for cards with physical back sides
    const backFaceLayouts = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];
    return card.card_faces && card.card_faces.length > 1 && backFaceLayouts.includes(card.layout);
  };

  // Helper function to get the current face index for a card
  const getCurrentFaceIndex = (cardId: string) => {
    return cardFaceIndex.get(cardId) || 0;
  };

  // Helper function to get the image URI for a card (handling both single and double-faced)
  const getCardImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.normal || card.card_faces[faceIndex]?.image_uris?.small;
    }
    return card.image_uris?.normal || card.image_uris?.small;
  };

  // Helper function to get the large image URI for hover preview
  const getCardLargeImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.large || card.image_uris?.normal;
  };

  // Toggle card face
  const toggleCardFace = (cardId: string, totalFaces: number) => {
    setCardFaceIndex(prev => {
      const newMap = new Map(prev);
      const currentIndex = prev.get(cardId) || 0;
      const nextIndex = (currentIndex + 1) % totalFaces;
      newMap.set(cardId, nextIndex);
      return newMap;
    });
  };

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
        setFilteredCollection(collectionWithCards);
      } catch (error) {
        console.error('Error loading collection:', error);
        setSnackbar({ message: 'Failed to load collection', type: 'error' });
      } finally {
        setIsLoadingCollection(false);
      }
    };

    loadCollection();
  }, [user]);

  // Filter collection based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCollection(collection);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = collection.filter(({ card }) => {
      return (
        card.name.toLowerCase().includes(query) ||
        card.type_line?.toLowerCase().includes(query) ||
        card.oracle_text?.toLowerCase().includes(query) ||
        card.colors?.some(color => color.toLowerCase().includes(query))
      );
    });

    setFilteredCollection(filtered);
  }, [searchQuery, collection]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Collection</h1>

        {/* Search within collection */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search your collection by name, type, or text..."
            />
          </div>
        </div>

        {/* Collection */}
        <div>
          <h2 className="text-xl font-semibold mb-4">
            {searchQuery ? `Found ${filteredCollection.length} card(s)` : `My Cards (${collection.length} unique, ${collection.reduce((acc, c) => acc + c.quantity, 0)} total)`}
          </h2>

          {isLoadingCollection ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={48} />
            </div>
          ) : collection.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-2">Your collection is empty</p>
              <p className="text-sm">Add cards from the Deck Manager to build your collection</p>
            </div>
          ) : filteredCollection.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-2">No cards found</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {filteredCollection.map(({ card, quantity }) => {
                const currentFaceIndex = getCurrentFaceIndex(card.id);
                const isMultiFaced = isDoubleFaced(card);
                const displayName = isMultiFaced && card.card_faces
                  ? card.card_faces[currentFaceIndex]?.name || card.name
                  : card.name;

                return (
                  <div
                    key={card.id}
                    className="relative group cursor-pointer"
                    onMouseEnter={() => setHoveredCard(card)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    {/* Small card thumbnail */}
                    <div className="relative rounded-lg overflow-hidden shadow-lg transition-all group-hover:ring-2 group-hover:ring-blue-500">
                      <img
                        src={getCardImageUri(card, currentFaceIndex)}
                        alt={displayName}
                        className="w-full h-auto"
                      />
                      {/* Quantity badge */}
                      <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                        x{quantity}
                      </div>
                      {/* Flip button for double-faced cards */}
                      {isMultiFaced && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCardFace(card.id, card.card_faces!.length);
                          }}
                          className="absolute bottom-1 right-1 bg-purple-600 hover:bg-purple-700 text-white p-1 rounded-full shadow-lg transition-all"
                          title="Flip card"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                    </div>

                    {/* Card name below thumbnail */}
                    <div className="mt-1 text-xs text-center truncate px-1">
                      {displayName}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hover Card Preview */}
      {hoveredCard && (() => {
        const currentFaceIndex = getCurrentFaceIndex(hoveredCard.id);
        const isMultiFaced = isDoubleFaced(hoveredCard);
        const currentFace = isMultiFaced && hoveredCard.card_faces
          ? hoveredCard.card_faces[currentFaceIndex]
          : null;

        const displayName = currentFace?.name || hoveredCard.name;
        const displayTypeLine = currentFace?.type_line || hoveredCard.type_line;
        const displayOracleText = currentFace?.oracle_text || hoveredCard.oracle_text;

        return (
          <div className="fixed top-1/2 right-8 transform -translate-y-1/2 z-50 pointer-events-none">
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

      {/* Snackbar */}
      {snackbar && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            snackbar.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white z-50`}
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
