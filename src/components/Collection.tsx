import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '../types';
import { GameId } from '../cards/domain/game';
import { useActiveGames } from '../contexts/PriceSourceContext';
import { getCollectionTotalValue, refreshCollectionPrices, getCollectionValueHistory, runPriceAlertCheck, addMultipleCardsToCollection, getCardsBySetNumber, resolveCardsByNames, setNumberKey } from '../services/api';
import { toCsv, parseCsv, isManaBoxCsv, parseManaBoxCsv, CollectionCsvRow, ManaBoxCsvRow } from '../utils/collectionCsv';
import CollectionValueChart from './CollectionValueChart';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCardFaces } from '../hooks/useCardFaces';
import { useBackDismiss } from '../hooks/useBackDismiss';
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
import { getPrice } from '../cards/domain/accessors/price';

interface ProfileTotalValueRow {
  collection_total_value: number;
}

export default function Collection() {
  const { user } = useAuth();
  const toast = useToast();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [gameFilter, setGameFilter] = useState<GameId | 'all'>('all');
  const activeGames = useActiveGames();
  // Search term backing the currently-loaded pages: trails searchQuery by
  // ~300ms so the (server-filtered) pages aren't refetched on every keystroke.
  // Starts as '' (matching searchQuery) so the initial mount loads immediately.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<CollectionItem | null>(null);
  useBackDismiss(!!selectedCard, () => setSelectedCard(null));
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
  } = useMyCollection(user?.id, debouncedSearch, gameFilter === 'all' ? undefined : gameFilter);

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
    return getPrice(card, 'tcgplayer', { foil: isFoil });
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

  // Swap a collection entry to another printing of the same card. The
  // collections table enforces collections_user_card_unique (user_id, card_id),
  // so when the user already owns the target printing we MERGE quantities into
  // that row (keeping its foil/condition) and delete the old row; otherwise a
  // single UPDATE rewrites card_id in place. card_name is unchanged (same card).
  const changePrinting = async (item: CollectionItem, printing: Card) => {
    if (!user || printing.id === item.card.id) return;

    try {
      setIsUpdating(true);

      const { data: existing, error: fetchError } = await supabase
        .from('collections')
        .select('quantity, is_foil, condition')
        .eq('user_id', user.id)
        .eq('card_id', printing.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        // Merge into the row the user already owns for the target printing.
        const isFoil = existing.is_foil ?? false;
        const condition = existing.condition ?? '';
        const mergedQuantity = (existing.quantity ?? 0) + item.quantity;

        const { error: updateError } = await supabase
          .from('collections')
          .update({
            quantity: mergedQuantity,
            price_usd: priceForVariant(printing, isFoil),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('card_id', printing.id);

        if (updateError) throw updateError;

        const { error: deleteError } = await supabase
          .from('collections')
          .delete()
          .eq('user_id', user.id)
          .eq('card_id', item.card.id);

        if (deleteError) throw deleteError;

        updateCachedItems(cached => {
          if (cached.card.id === item.card.id) return null;
          if (cached.card.id === printing.id) return { ...cached, quantity: mergedQuantity };
          return cached;
        });
        setSelectedCard({ card: printing, quantity: mergedQuantity, isFoil, condition });
        toast.success('Merged with the copies you already own');
      } else {
        // No row for the target printing: rewrite card_id in place.
        const { error } = await supabase
          .from('collections')
          .update({
            card_id: printing.id,
            price_usd: priceForVariant(printing, item.isFoil),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('card_id', item.card.id);

        if (error) throw error;

        updateCachedItems(cached =>
          cached.card.id === item.card.id ? { ...cached, card: printing } : cached
        );
        setSelectedCard(prev =>
          prev && prev.card.id === item.card.id ? { ...prev, card: printing } : prev
        );
        toast.success('Printing updated');
      }

      invalidateCollectionCaches();
    } catch (error) {
      console.error('Error changing printing:', error);
      toast.error('Failed to change printing');
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

  // Import a ManaBox-style CSV: resolve each row to an exact Scryfall printing
  // via set + collector number (batched), falling back to name-based fuzzy
  // resolution for rows missing that info (or that Scryfall couldn't match).
  const importManaBoxRows = async (userId: string, rows: ManaBoxCsvRow[]): Promise<boolean> => {
    if (rows.length === 0) {
      toast.error('No valid rows found in CSV');
      return false;
    }

    const withPrinting = rows.filter(row => row.set && row.collector_number);
    const byPrinting = withPrinting.length
      ? await getCardsBySetNumber(
          withPrinting.map(row => ({ set: row.set, collector_number: row.collector_number })),
        )
      : new Map<string, Card>();

    const resolved: { row: ManaBoxCsvRow; card: Card }[] = [];
    const unresolved: ManaBoxCsvRow[] = [];
    for (const row of rows) {
      const card =
        row.set && row.collector_number
          ? byPrinting.get(setNumberKey(row.set, row.collector_number))
          : undefined;
      if (card) resolved.push({ row, card });
      else unresolved.push(row);
    }

    if (unresolved.length > 0) {
      const byName = await resolveCardsByNames(unresolved.map(row => row.name));
      for (const row of unresolved) {
        const card = byName.get(row.name.trim().toLowerCase());
        if (card) resolved.push({ row, card });
      }
    }

    if (resolved.length === 0) {
      toast.error('Could not match any cards from the CSV');
      return false;
    }

    await addMultipleCardsToCollection(
      userId,
      resolved.map(({ row, card }) => ({
        cardId: card.id,
        quantity: row.quantity,
        priceUsd: priceForVariant(card, row.is_foil),
        cardName: card.name,
      })),
    );

    const totalAdded = resolved.reduce((sum, { row }) => sum + row.quantity, 0);
    const skipped = rows.length - resolved.length;
    toast.success(`Imported ${totalAdded} card(s)${skipped > 0 ? ` — ${skipped} row(s) not matched` : ''}`);
    return true;
  };

  // Import a Deckerr-native CSV (rows already carry Scryfall card ids).
  const importNativeRows = async (userId: string, rows: CollectionCsvRow[]): Promise<boolean> => {
    if (rows.length === 0) {
      toast.error('No valid rows found in CSV');
      return false;
    }

    await addMultipleCardsToCollection(
      userId,
      rows.map(row => ({ cardId: row.card_id, quantity: row.quantity, priceUsd: row.price_usd })),
    );

    const totalAdded = rows.reduce((sum, row) => sum + row.quantity, 0);
    toast.success(`Imported ${totalAdded} card(s)`);
    return true;
  };

  // Import cards from a CSV file selected by the user (Deckerr or ManaBox export).
  const handleImportCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file || !user) return;

    try {
      setIsImporting(true);
      const text = await file.text();

      const imported = isManaBoxCsv(text)
        ? await importManaBoxRows(user.id, parseManaBoxCsv(text))
        : await importNativeRows(user.id, parseCsv(text));

      if (imported) invalidateCollectionCaches();
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

        {/* Per-game filter */}
        {activeGames.length > 1 && (
          <div className="flex gap-2 mb-4">
            {[{ id: 'all' as const, label: 'All' }, ...activeGames].map((g) => (
              <button
                key={g.id}
                onClick={() => setGameFilter(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  gameFilter === g.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

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
          onChangePrinting={(printing) => changePrinting(selectedCard, printing)}
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
