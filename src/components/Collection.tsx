import React, { useState, useEffect } from 'react';
import { Search, Loader2, Trash2, CheckCircle, XCircle, RefreshCw, Plus, Minus, X } from 'lucide-react';
import { Card } from '../types';
import { getUserCollection, getCardsByIds, addCardToCollection } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import ConfirmModal from './ConfirmModal';

export default function Collection() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [collection, setCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [filteredCollection, setFilteredCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<{ card: Card; quantity: number } | null>(null);
  const [cardFaceIndex, setCardFaceIndex] = useState<Map<string, number>>(new Map());
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    cardId: string;
    cardName: string;
  }>({ isOpen: false, cardId: '', cardName: '' });

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

  // Update card quantity in collection
  const updateCardQuantity = async (cardId: string, newQuantity: number) => {
    if (!user || newQuantity < 0) return;

    try {
      setIsUpdating(true);

      if (newQuantity === 0) {
        // Remove card from collection
        const { error } = await supabase
          .from('collections')
          .delete()
          .eq('user_id', user.id)
          .eq('card_id', cardId);

        if (error) throw error;

        // Update local state
        setCollection(prev => prev.filter(item => item.card.id !== cardId));
        setSelectedCard(null);
        setSnackbar({ message: 'Card removed from collection', type: 'success' });
      } else {
        // Update quantity
        const { error } = await supabase
          .from('collections')
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('card_id', cardId);

        if (error) throw error;

        // Update local state
        setCollection(prev =>
          prev.map(item =>
            item.card.id === cardId ? { ...item, quantity: newQuantity } : item
          )
        );

        if (selectedCard && selectedCard.card.id === cardId) {
          setSelectedCard({ ...selectedCard, quantity: newQuantity });
        }

        setSnackbar({ message: 'Quantity updated', type: 'success' });
      }
    } catch (error) {
      console.error('Error updating card quantity:', error);
      setSnackbar({ message: 'Failed to update quantity', type: 'error' });
    } finally {
      setIsUpdating(false);
      setTimeout(() => setSnackbar(null), 3000);
    }
  };

  // Add one to quantity
  const incrementQuantity = async (cardId: string, currentQuantity: number) => {
    await updateCardQuantity(cardId, currentQuantity + 1);
  };

  // Remove one from quantity
  const decrementQuantity = async (cardId: string, currentQuantity: number) => {
    if (currentQuantity > 0) {
      await updateCardQuantity(cardId, currentQuantity - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-3 sm:p-6 md:pt-16 pb-16 md:pb-0">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">My Collection</h1>

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2 sm:gap-3">
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
                    onClick={() => setSelectedCard({ card, quantity })}
                  >
                    {/* Small card thumbnail */}
                    <div className="relative rounded-lg overflow-hidden shadow-lg transition-all group-hover:ring-2 group-hover:ring-blue-500">
                      <img
                        src={getCardImageUri(card, currentFaceIndex)}
                        alt={displayName}
                        className="w-full h-auto"
                      />
                      {/* Quantity badge */}
                      <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded-full shadow-lg">
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
          <div className="hidden lg:block fixed top-1/2 right-8 transform -translate-y-1/2 z-40 pointer-events-none">
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
        const currentFaceIndex = getCurrentFaceIndex(selectedCard.card.id);
        const isMultiFaced = isDoubleFaced(selectedCard.card);
        const currentFace = isMultiFaced && selectedCard.card.card_faces
          ? selectedCard.card.card_faces[currentFaceIndex]
          : null;

        const displayName = currentFace?.name || selectedCard.card.name;
        const displayTypeLine = currentFace?.type_line || selectedCard.card.type_line;
        const displayOracleText = currentFace?.oracle_text || selectedCard.card.oracle_text;

        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
              onClick={() => setSelectedCard(null)}
            />

            {/* Sliding Panel */}
            <div className="fixed top-0 right-0 h-full w-full md:w-96 bg-gray-800 shadow-2xl z-50 overflow-y-auto animate-slide-in-right">
              {/* Close button - fixed position, stays visible when scrolling */}
              <button
                onClick={() => setSelectedCard(null)}
                className="fixed top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white p-2 md:p-1.5 rounded-full transition-colors z-[60] shadow-lg"
                aria-label="Close"
              >
                <X size={24} className="md:w-5 md:h-5" />
              </button>

              <div className="p-4 sm:p-6">

                {/* Card Image */}
                <div className="relative mb-4">
                  <img
                    src={getCardLargeImageUri(selectedCard.card, currentFaceIndex)}
                    alt={displayName}
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                  {isMultiFaced && (
                    <>
                      <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                        Face {currentFaceIndex + 1}/{selectedCard.card.card_faces!.length}
                      </div>
                      <button
                        onClick={() => toggleCardFace(selectedCard.card.id, selectedCard.card.card_faces!.length)}
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

                  {selectedCard.card.prices?.usd && (
                    <div className="border-t border-gray-700 pt-3">
                      <div className="text-lg text-green-400 font-semibold">
                        ${selectedCard.card.prices.usd} each
                      </div>
                      <div className="text-sm text-gray-400">
                        Total value: ${(parseFloat(selectedCard.card.prices.usd) * selectedCard.quantity).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Quantity Management */}
                  <div className="border-t border-gray-700 pt-3">
                    <h3 className="text-lg font-semibold mb-3">Quantity in Collection</h3>
                    <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
                      <button
                        onClick={() => decrementQuantity(selectedCard.card.id, selectedCard.quantity)}
                        disabled={isUpdating || selectedCard.quantity === 0}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                      >
                        <Minus size={20} />
                      </button>

                      <div className="text-center">
                        <div className="text-3xl font-bold">{selectedCard.quantity}</div>
                        <div className="text-xs text-gray-400">copies</div>
                      </div>

                      <button
                        onClick={() => incrementQuantity(selectedCard.card.id, selectedCard.quantity)}
                        disabled={isUpdating}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                      >
                        <Plus size={20} />
                      </button>
                    </div>

                    {/* Remove from collection button */}
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          cardId: selectedCard.card.id,
                          cardName: displayName,
                        });
                      }}
                      disabled={isUpdating}
                      className="w-full mt-3 min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 size={20} />
                      Remove from Collection
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, cardId: '', cardName: '' })}
        onConfirm={() => {
          updateCardQuantity(confirmModal.cardId, 0);
          setConfirmModal({ isOpen: false, cardId: '', cardName: '' });
        }}
        title="Remove from Collection"
        message={`Are you sure you want to remove "${confirmModal.cardName}" from your collection? This action cannot be undone.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        isLoading={isUpdating}
      />

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
