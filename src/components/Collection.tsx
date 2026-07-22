import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, Trash2, RefreshCw, Plus, Minus, X } from 'lucide-react';
import { Card } from '../types';
import { getUserCollectionPaginated, getCardsByIds, getCollectionTotalValue, refreshCollectionPrices, getCollectionValueHistory, ValueHistoryPoint, runPriceAlertCheck } from '../services/api';
import CollectionValueChart from './CollectionValueChart';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isDoubleFaced, getCardImageUri } from '../utils/cardFaces';
import { useCardFaces } from '../hooks/useCardFaces';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import ConfirmModal from './ConfirmModal';
import WishlistButton from './WishlistButton';

const PAGE_SIZE = 50;

interface ProfileTotalValueRow {
  collection_total_value: number;
}

export default function Collection() {
  const { user } = useAuth();
  const toast = useToast();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const [searchQuery, setSearchQuery] = useState('');
  const [collection, setCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [filteredCollection, setFilteredCollection] = useState<{ card: Card; quantity: number }[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCollectionValue, setTotalCollectionValue] = useState<number>(0);
  const [isLoadingTotalValue, setIsLoadingTotalValue] = useState(true);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [valueHistory, setValueHistory] = useState<ValueHistoryPoint[]>([]);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<{ card: Card; quantity: number } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    cardId: string;
    cardName: string;
  }>({ isOpen: false, cardId: '', cardName: '' });
  const observerTarget = useRef<HTMLDivElement>(null);

  // Helper function to get the large image URI for hover preview
  const getCardLargeImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.large || card.image_uris?.normal;
  };

  // Calculate total collection value (lightweight query from database)
  useEffect(() => {
    const calculateTotalValue = async () => {
      if (!user) {
        setIsLoadingTotalValue(false);
        return;
      }

      try {
        setIsLoadingTotalValue(true);
        // Get total value directly from database (no need to fetch all cards!)
        const totalValue = await getCollectionTotalValue(user.id);
        setTotalCollectionValue(totalValue);
        setValueHistory(await getCollectionValueHistory(user.id));
      } catch (error) {
        console.error('Error calculating total collection value:', error);
        setTotalCollectionValue(0);
      } finally {
        setIsLoadingTotalValue(false);
      }
    };

    calculateTotalValue();
  }, [user]);

  // Re-fetch Scryfall prices for the whole collection and persist them; the DB
  // trigger recomputes the total (which also arrives via realtime below).
  const handleRefreshPrices = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user) return;
      try {
        setIsRefreshingPrices(true);
        await refreshCollectionPrices(user.id);
        setTotalCollectionValue(await getCollectionTotalValue(user.id));
        setValueHistory(await getCollectionValueHistory(user.id));
        runPriceAlertCheck(user.id).catch(() => { /* alerts are best-effort */ });
        try {
          localStorage.setItem(`deckerr:pricesRefreshedAt:${user.id}`, String(Date.now()));
        } catch { /* localStorage unavailable — ignore */ }
        if (!opts?.silent) toast.success('Prices refreshed');
      } catch (error) {
        console.error('Error refreshing prices:', error);
        if (!opts?.silent) toast.error('Failed to refresh prices');
      } finally {
        setIsRefreshingPrices(false);
      }
    },
    [user, toast],
  );

  // Auto-refresh prices at most once per day (per device) when the page opens.
  useEffect(() => {
    if (!user) return;
    let stale = true;
    try {
      const last = Number(localStorage.getItem(`deckerr:pricesRefreshedAt:${user.id}`) || 0);
      stale = !last || Date.now() - last > 24 * 60 * 60 * 1000;
    } catch { /* localStorage unavailable — treat as stale */ }
    if (stale) handleRefreshPrices({ silent: true });
  }, [user, handleRefreshPrices]);

  // Subscribe to realtime updates for collection total value
  useEffect(() => {
    if (!user) return;

    const profileChannel = supabase
      .channel('profile-total-value-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<ProfileTotalValueRow>) => {
          const newProfile = payload.new as Partial<ProfileTotalValueRow>;
          if (newProfile?.collection_total_value !== undefined) {
            console.log('Collection total value updated:', newProfile.collection_total_value);
            setTotalCollectionValue(newProfile.collection_total_value);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user]);

  // Load user's collection from Supabase on mount
  useEffect(() => {
    const loadCollection = async () => {
      if (!user) {
        setIsLoadingCollection(false);
        return;
      }

      try {
        setIsLoadingCollection(true);
        setOffset(0);
        setCollection([]);

        // Get paginated collection from Supabase
        const result = await getUserCollectionPaginated(user.id, PAGE_SIZE, 0);
        setTotalCount(result.totalCount);
        setHasMore(result.hasMore);

        if (result.items.size === 0) {
          setCollection([]);
          setFilteredCollection([]);
          return;
        }

        // Get the actual card data from Scryfall for all cards in this page
        const cardIds = Array.from(result.items.keys());
        const cards = await getCardsByIds(cardIds);

        // Combine card data with quantities
        const collectionWithCards = cards.map(card => ({
          card,
          quantity: result.items.get(card.id) || 0,
        }));

        setCollection(collectionWithCards);
        setFilteredCollection(collectionWithCards);
        setOffset(PAGE_SIZE);
      } catch (error) {
        console.error('Error loading collection:', error);
        toast.error('Failed to load collection');
      } finally {
        setIsLoadingCollection(false);
      }
    };

    loadCollection();
  }, [user]);

  // Load more cards for infinite scroll
  const loadMoreCards = useCallback(async () => {
    if (!user || isLoadingMore || !hasMore) return;

    try {
      setIsLoadingMore(true);

      // Get next page of collection
      const result = await getUserCollectionPaginated(user.id, PAGE_SIZE, offset);
      setHasMore(result.hasMore);

      if (result.items.size === 0) {
        return;
      }

      // Get card data from Scryfall
      const cardIds = Array.from(result.items.keys());
      const cards = await getCardsByIds(cardIds);

      // Combine card data with quantities
      const newCards = cards.map(card => ({
        card,
        quantity: result.items.get(card.id) || 0,
      }));

      // Deduplicate: only add cards that aren't already in the collection
      setCollection(prev => {
        const existingIds = new Set(prev.map(item => item.card.id));
        const uniqueNewCards = newCards.filter(item => !existingIds.has(item.card.id));
        return [...prev, ...uniqueNewCards];
      });

      setOffset(prev => prev + PAGE_SIZE);
    } catch (error) {
      console.error('Error loading more cards:', error);
      toast.error('Failed to load more cards');
    } finally {
      setIsLoadingMore(false);
    }
  }, [user, offset, hasMore, isLoadingMore]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMoreCards();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoadingMore, loadMoreCards]);

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
        toast.success('Card removed from collection');
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

        toast.success('Quantity updated');
      }
    } catch (error) {
      console.error('Error updating card quantity:', error);
      toast.error('Failed to update quantity');
    } finally {
      setIsUpdating(false);
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
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-xl font-semibold">
              {searchQuery ? `Found ${filteredCollection.length} card(s)` : `My Cards (${collection.length} unique, ${collection.reduce((acc, c) => acc + c.quantity, 0)} total)`}
            </h2>
            {/* Collection Value Summary */}
            <div className="flex items-center gap-2">
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
                <div className="text-xs text-gray-400 mb-0.5">
                  {searchQuery ? 'Filtered Value' : 'Total Collection Value'}
                </div>
                <div className="text-lg font-bold text-green-400">
                  {isLoadingTotalValue ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : searchQuery ? (
                    // For search results, calculate from filtered collection
                    `$${filteredCollection.reduce((total, { card, quantity }) => {
                      const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                      return total + (price * quantity);
                    }, 0).toFixed(2)}`
                  ) : (
                    // For full collection, use pre-calculated total
                    `$${totalCollectionValue.toFixed(2)}`
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRefreshPrices()}
                disabled={isRefreshingPrices}
                title="Refresh card prices"
                className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={18} className={isRefreshingPrices ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {valueHistory.length >= 2 && !searchQuery && (
            <div className="mb-4 bg-gray-800 border border-gray-700 rounded-lg p-3">
              <CollectionValueChart history={valueHistory} />
            </div>
          )}

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
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-2">
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
                      <WishlistButton cardId={card.id} className="absolute top-1 left-1" size={16} />
                      {/* Quantity badge */}
                      <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded-full shadow-lg">
                        x{quantity}
                      </div>
                      {/* Price badge */}
                      {card.prices?.usd && (
                        <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow-lg">
                          ${card.prices.usd}
                        </div>
                      )}
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

          {/* Infinite scroll loading indicator */}
          {!searchQuery && isLoadingMore && (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          )}

          {/* Observer target for infinite scroll */}
          {!searchQuery && hasMore && !isLoadingMore && (
            <div ref={observerTarget} className="h-20" />
          )}

          {/* End of collection indicator */}
          {!searchQuery && !hasMore && collection.length > 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              End of collection • {totalCount} total cards
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
              className="fixed inset-0 bg-black bg-opacity-50 z-[110] transition-opacity duration-300"
              onClick={() => setSelectedCard(null)}
            />

            {/* Sliding Panel */}
            <div className="fixed top-0 right-0 h-full w-full md:w-96 bg-gray-800 shadow-2xl z-[120] overflow-y-auto animate-slide-in-right">
              {/* Close button - fixed position, stays visible when scrolling */}
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
    </div>
  );
}
