import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Loader2, Trash2, RefreshCw, Plus, Minus, X, Download, Upload } from 'lucide-react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { Card } from '../types';
import { getUserCollectionPaginated, getCardsByIds, getCollectionTotalValue, refreshCollectionPrices, getCollectionValueHistory, runPriceAlertCheck, addMultipleCardsToCollection } from '../services/api';
import { toCsv, parseCsv, CARD_CONDITIONS, CollectionCsvRow } from '../utils/collectionCsv';
import CollectionValueChart from './CollectionValueChart';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isDoubleFaced } from '../utils/cardFaces';
import CardTile from './card/CardTile';
import { useCardFaces } from '../hooks/useCardFaces';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import ConfirmModal from './ConfirmModal';
import WishlistButton from './WishlistButton';

const PAGE_SIZE = 50;

interface ProfileTotalValueRow {
  collection_total_value: number;
}

interface CollectionItem {
  card: Card;
  quantity: number;
  isFoil: boolean;
  /** One of CARD_CONDITIONS, or '' when unset. */
  condition: string;
}

interface CollectionMetaRow {
  card_id: string;
  is_foil: boolean | null;
  condition: string | null;
}

interface CollectionPage {
  items: CollectionItem[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
}

export default function Collection() {
  const { user } = useAuth();
  const toast = useToast();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  // Search term backing the currently-loaded pages: trails searchQuery by
  // ~300ms so the (server-filtered) pages aren't refetched on every keystroke.
  // Starts as '' (matching searchQuery) so the initial mount loads immediately.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<CollectionItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    cardId: string;
    cardName: string;
  }>({ isOpen: false, cardId: '', cardName: '' });
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Helper function to get the large image URI for hover preview
  const getCardLargeImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.large || card.image_uris?.normal;
  };

  // Total collection value (pre-calculated in the database) and its history.
  const { data: totalValueData, isPending: isTotalValuePending } = useQuery({
    queryKey: ['collectionValue', user?.id],
    enabled: !!user,
    queryFn: () => getCollectionTotalValue(user!.id),
  });
  const totalCollectionValue = totalValueData ?? 0;
  const isLoadingTotalValue = !!user && isTotalValuePending;

  const { data: valueHistoryData } = useQuery({
    queryKey: ['collectionValueHistory', user?.id],
    enabled: !!user,
    queryFn: () => getCollectionValueHistory(user!.id),
  });
  const valueHistory = valueHistoryData ?? [];

  // Every write path funnels through this: the paginated pages, the totals and
  // the ['collection'] prefix (DeckManager/CardSearch counts, TradeCreator's
  // full list) all read from caches that just went stale.
  const invalidateCollectionCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['myCollection'] });
    queryClient.invalidateQueries({ queryKey: ['collectionValue'] });
    queryClient.invalidateQueries({ queryKey: ['collectionValueHistory'] });
    queryClient.invalidateQueries({ queryKey: ['collection'] });
  }, [queryClient]);

  // Re-fetch Scryfall prices for the whole collection and persist them; the DB
  // trigger recomputes the total (which also arrives via realtime below).
  const { mutateAsync: refreshPricesAsync, isPending: isRefreshingPrices } = useMutation({
    mutationFn: (userId: string) => refreshCollectionPrices(userId),
    onSuccess: invalidateCollectionCaches,
  });

  const handleRefreshPrices = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user) return;
      try {
        await refreshPricesAsync(user.id);
        runPriceAlertCheck(user.id).catch(() => { /* alerts are best-effort */ });
        try {
          localStorage.setItem(`deckerr:pricesRefreshedAt:${user.id}`, String(Date.now()));
        } catch { /* localStorage unavailable — ignore */ }
        if (!opts?.silent) toast.success('Prices refreshed');
      } catch (error) {
        console.error('Error refreshing prices:', error);
        if (!opts?.silent) toast.error('Failed to refresh prices');
      }
    },
    [user, toast, refreshPricesAsync],
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
            queryClient.setQueryData(['collectionValue', user.id], newProfile.collection_total_value);
            queryClient.invalidateQueries({ queryKey: ['collectionValueHistory', user.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user, queryClient]);

  // Fetch per-entry foil/condition metadata (not returned by the paginated API)
  // for the given card ids and index it by card_id.
  const fetchCollectionMeta = useCallback(
    async (cardIds: string[]): Promise<Map<string, { isFoil: boolean; condition: string }>> => {
      const meta = new Map<string, { isFoil: boolean; condition: string }>();
      if (!user || cardIds.length === 0) return meta;

      const { data, error } = await supabase
        .from('collections')
        .select('card_id, is_foil, condition')
        .eq('user_id', user.id)
        .in('card_id', cardIds);

      if (error) {
        console.error('Error loading collection metadata:', error);
        return meta;
      }

      (data as CollectionMetaRow[] | null)?.forEach((row) => {
        meta.set(row.card_id, {
          isFoil: row.is_foil ?? false,
          condition: row.condition ?? '',
        });
      });
      return meta;
    },
    [user],
  );

  // User's own collection, paginated (and server-side filtered by the
  // debounced search term) for infinite scroll.
  const collectionKey = useMemo(
    () => ['myCollection', user?.id, debouncedSearch] as const,
    [user?.id, debouncedSearch],
  );
  const {
    data: collectionPages,
    isPending: isCollectionPending,
    isError: isCollectionError,
    hasNextPage: hasMore,
    isFetchingNextPage: isLoadingMore,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: collectionKey,
    enabled: !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CollectionPage> => {
      // Get paginated (and server-side filtered) collection from Supabase
      const result = await getUserCollectionPaginated(user!.id, PAGE_SIZE, pageParam, debouncedSearch);

      let items: CollectionItem[] = [];
      if (result.items.size > 0) {
        // Get the actual card data from Scryfall for all cards in this page
        const cardIds = Array.from(result.items.keys());
        const [cards, meta] = await Promise.all([getCardsByIds(cardIds), fetchCollectionMeta(cardIds)]);

        // Combine card data with quantities and per-entry metadata
        items = cards.map(card => ({
          card,
          quantity: result.items.get(card.id) || 0,
          isFoil: meta.get(card.id)?.isFoil ?? false,
          condition: meta.get(card.id)?.condition ?? '',
        }));
      }

      return {
        items,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        nextOffset: pageParam + PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
  });

  const isLoadingCollection = !!user && isCollectionPending;
  const totalCount = collectionPages?.pages[0]?.totalCount ?? 0;

  // Flatten pages, deduplicating by card id (a card can reappear across pages
  // when the underlying collection shifts between fetches).
  const collection = useMemo(() => {
    const seen = new Set<string>();
    const items: CollectionItem[] = [];
    for (const page of collectionPages?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.card.id)) continue;
        seen.add(item.card.id);
        items.push(item);
      }
    }
    return items;
  }, [collectionPages]);

  useEffect(() => {
    if (isCollectionError) toast.error('Failed to load collection');
  }, [isCollectionError, toast]);

  // Surgically update the loaded pages so edits show up instantly; the
  // follow-up invalidation refetches the server truth in the background.
  const updateCachedItems = useCallback(
    (updater: (item: CollectionItem) => CollectionItem | null) => {
      queryClient.setQueryData<InfiniteData<CollectionPage, number>>(
        collectionKey,
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.flatMap((item) => {
                const next = updater(item);
                return next ? [next] : [];
              }),
            })),
          };
        },
      );
    },
    [queryClient, collectionKey],
  );

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          fetchNextPage();
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
  }, [hasMore, isLoadingMore, fetchNextPage]);

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

        updateCachedItems(item => (item.card.id === cardId ? null : item));
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

        updateCachedItems(item =>
          item.card.id === cardId ? { ...item, quantity: newQuantity } : item
        );

        if (selectedCard && selectedCard.card.id === cardId) {
          setSelectedCard({ ...selectedCard, quantity: newQuantity });
        }

        toast.success('Quantity updated');
      }

      invalidateCollectionCaches();
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

  // Compute the per-copy price for a variant (foil uses usd_foil, else usd).
  const priceForVariant = (card: Card, isFoil: boolean): number => {
    const raw = isFoil ? card.prices?.usd_foil : card.prices?.usd;
    const parsed = raw ? parseFloat(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // Update the foil flag and/or condition of a collection entry.
  const updateCardVariant = async (card: Card, isFoil: boolean, condition: string) => {
    if (!user) return;

    try {
      setIsUpdating(true);
      const priceUsd = priceForVariant(card, isFoil);

      const { error } = await supabase
        .from('collections')
        .update({ is_foil: isFoil, condition, price_usd: priceUsd, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('card_id', card.id);

      if (error) throw error;

      // Reflect the change locally right away...
      updateCachedItems(item => (item.card.id === card.id ? { ...item, isFoil, condition } : item));
      setSelectedCard(prev => (prev && prev.card.id === card.id ? { ...prev, isFoil, condition } : prev));

      // ...then refetch the DB-computed totals (trigger recomputes on write).
      invalidateCollectionCaches();
      toast.success('Card updated');
    } catch (error) {
      console.error('Error updating card variant:', error);
      toast.error('Failed to update card');
    } finally {
      setIsUpdating(false);
    }
  };

  // Export the loaded collection to a downloadable CSV file.
  const handleExportCsv = () => {
    const rows: CollectionCsvRow[] = collection.map(({ card, quantity, isFoil, condition }) => ({
      name: card.name,
      card_id: card.id,
      quantity,
      is_foil: isFoil,
      condition,
      price_usd: priceForVariant(card, isFoil),
    }));

    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'collection.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import cards from a CSV file selected by the user.
  const handleImportCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file || !user) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length === 0) {
        toast.error('No valid rows found in CSV');
        return;
      }

      await addMultipleCardsToCollection(
        user.id,
        rows.map(row => ({ cardId: row.card_id, quantity: row.quantity, priceUsd: row.price_usd })),
      );

      const totalAdded = rows.reduce((sum, row) => sum + row.quantity, 0);
      toast.success(`Imported ${totalAdded} card(s)`);

      invalidateCollectionCaches();
    } catch (error) {
      console.error('Error importing collection CSV:', error);
      toast.error('Failed to import CSV');
    } finally {
      setIsImporting(false);
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
              {searchQuery ? `Found ${totalCount} card(s)` : `My Cards (${collection.length} unique, ${collection.reduce((acc, c) => acc + c.quantity, 0)} total)`}
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
                    // For search results, best-effort sum over currently-loaded results
                    `$${collection.reduce((total, { card, quantity }) => {
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
              <button
                onClick={handleExportCsv}
                disabled={collection.length === 0}
                title="Export collection to CSV"
                className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                <Download size={18} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                title="Import collection from CSV"
                className="p-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportCsv}
                className="hidden"
              />
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
            searchQuery.trim() ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg mb-2">No cards found</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg mb-2">Your collection is empty</p>
                <p className="text-sm">Add cards from the Deck Manager to build your collection</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-2">
              {collection.map((item) => {
                const { card, quantity, isFoil } = item;
                const currentFaceIndex = getCurrentFaceIndex(card.id);
                const isMultiFaced = isDoubleFaced(card);
                const displayName = isMultiFaced && card.card_faces
                  ? card.card_faces[currentFaceIndex]?.name || card.name
                  : card.name;

                return (
                  <CardTile
                    key={card.id}
                    card={card}
                    faceIndex={currentFaceIndex}
                    imageSize="small"
                    className="relative group cursor-pointer"
                    imageWrapperClassName="rounded-lg overflow-hidden shadow-lg transition-all group-hover:ring-2 group-hover:ring-blue-500"
                    onMouseEnter={() => setHoveredCard(card)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => setSelectedCard(item)}
                    topLeft={<WishlistButton cardId={card.id} className="absolute top-1 left-1" size={16} />}
                    topRight={
                      <>
                        {/* Quantity badge */}
                        <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded-full shadow-lg">
                          x{quantity}
                        </div>
                        {/* Foil badge */}
                        {isFoil && (
                          <div className="absolute top-8 right-1 bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg">
                            FOIL
                          </div>
                        )}
                      </>
                    }
                    bottomLeft={
                      card.prices?.usd && (
                        <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow-lg">
                          ${card.prices.usd}
                        </div>
                      )
                    }
                    bottomRight={
                      isMultiFaced && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCardFace(card.id, card.card_faces!.length);
                          }}
                          className="absolute bottom-1 right-1 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                          title="Flip card"
                          aria-label="Flip card"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )
                    }
                    footer={
                      <div className="mt-1 text-xs text-center truncate px-1">
                        {displayName}
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}

          {/* Infinite scroll loading indicator */}
          {isLoadingMore && (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          )}

          {/* Observer target for infinite scroll */}
          {hasMore && !isLoadingMore && (
            <div ref={observerTarget} className="h-20" />
          )}

          {/* End of collection indicator */}
          {!hasMore && collection.length > 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              {searchQuery ? `End of results • ${totalCount} matching card(s)` : `End of collection • ${totalCount} total cards`}
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

                  {/* Foil & Condition */}
                  <div className="border-t border-gray-700 pt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Foil</div>
                        <div className="text-xs text-gray-400">
                          {selectedCard.isFoil ? 'This copy is foil' : 'This copy is non-foil'}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={selectedCard.isFoil}
                        disabled={isUpdating}
                        onClick={() => updateCardVariant(selectedCard.card, !selectedCard.isFoil, selectedCard.condition)}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                          selectedCard.isFoil ? 'bg-fuchsia-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            selectedCard.isFoil ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label htmlFor="collection-condition" className="block text-sm font-semibold text-white mb-1">
                        Condition
                      </label>
                      <select
                        id="collection-condition"
                        value={selectedCard.condition}
                        disabled={isUpdating}
                        onChange={(e) => updateCardVariant(selectedCard.card, selectedCard.isFoil, e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {CARD_CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

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
