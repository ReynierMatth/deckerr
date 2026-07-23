import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '../types';
import { getCollectionTotalValue, refreshCollectionPrices, getCollectionValueHistory, runPriceAlertCheck, addMultipleCardsToCollection } from '../services/api';
import { toCsv, parseCsv, CollectionCsvRow } from '../utils/collectionCsv';
import CollectionValueChart from './CollectionValueChart';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCardFaces } from '../hooks/useCardFaces';
import { useMyCollection } from '../hooks/useMyCollection';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import ConfirmModal from './ConfirmModal';
import HoverCardPreview from './card/HoverCardPreview';
import CollectionToolbar from './collection/CollectionToolbar';
import CollectionHeader from './collection/CollectionHeader';
import CollectionGrid from './collection/CollectionGrid';
import CardDetailModal from './collection/CardDetailModal';
import { CollectionItem } from './collection/types';

interface ProfileTotalValueRow {
  collection_total_value: number;
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
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    cardId: string;
    cardName: string;
  }>({ isOpen: false, cardId: '', cardName: '' });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

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

  // User's own collection, paginated (and server-side filtered by the
  // debounced search term) for infinite scroll.
  const {
    collection,
    totalCount,
    isPending: isCollectionPending,
    isError: isCollectionError,
    hasMore,
    isLoadingMore,
    fetchNextPage,
    updateCachedItems,
  } = useMyCollection(user?.id, debouncedSearch);

  const isLoadingCollection = !!user && isCollectionPending;

  useEffect(() => {
    if (isCollectionError) toast.error('Failed to load collection');
  }, [isCollectionError, toast]);

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
        <CollectionToolbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

        {/* Collection */}
        <div>
          <CollectionHeader
            searchQuery={searchQuery}
            items={collection}
            totalCount={totalCount}
            totalCollectionValue={totalCollectionValue}
            isLoadingTotalValue={isLoadingTotalValue}
            isRefreshingPrices={isRefreshingPrices}
            isImporting={isImporting}
            onRefreshPrices={() => handleRefreshPrices()}
            onExportCsv={handleExportCsv}
            onImportCsv={handleImportCsv}
          />

          {valueHistory.length >= 2 && !searchQuery && (
            <div className="mb-4 bg-gray-800 border border-gray-700 rounded-lg p-3">
              <CollectionValueChart history={valueHistory} />
            </div>
          )}

          <CollectionGrid
            items={collection}
            isLoading={isLoadingCollection}
            searchQuery={searchQuery}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={fetchNextPage}
            onHoverCard={setHoveredCard}
            onSelectCard={setSelectedCard}
            getCurrentFaceIndex={getCurrentFaceIndex}
            toggleCardFace={toggleCardFace}
          />
        </div>
      </div>

      {/* Hover Card Preview - only show if no card is selected */}
      {hoveredCard && !selectedCard && (
        <HoverCardPreview
          card={hoveredCard}
          hoverSource={null}
          getCurrentFaceIndex={getCurrentFaceIndex}
        />
      )}

      {/* Card Detail Panel - slides in from right */}
      {selectedCard && (
        <CardDetailModal
          item={selectedCard}
          isUpdating={isUpdating}
          onClose={() => setSelectedCard(null)}
          onUpdateVariant={updateCardVariant}
          onIncrementQuantity={incrementQuantity}
          onDecrementQuantity={decrementQuantity}
          onRequestRemove={(cardId, cardName) => setConfirmModal({ isOpen: true, cardId, cardName })}
          getCurrentFaceIndex={getCurrentFaceIndex}
          toggleCardFace={toggleCardFace}
        />
      )}

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
