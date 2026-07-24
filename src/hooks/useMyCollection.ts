import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { getUserCollectionPaginated, getCardsByIds } from '../services/api';
import { supabase } from '../lib/supabase';
import { CollectionItem } from '../components/collection/types';

const PAGE_SIZE = 50;

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

/**
 * The signed-in user's own collection, paginated (and server-side filtered by
 * the debounced search term) for infinite scroll, joined with Scryfall card
 * data and per-entry foil/condition metadata.
 */
export function useMyCollection(userId: string | undefined, debouncedSearch: string) {
  const queryClient = useQueryClient();

  // Fetch per-entry foil/condition metadata (not returned by the paginated API)
  // for the given card ids and index it by card_id.
  const fetchCollectionMeta = useCallback(
    async (cardIds: string[]): Promise<Map<string, { isFoil: boolean; condition: string }>> => {
      const meta = new Map<string, { isFoil: boolean; condition: string }>();
      if (!userId || cardIds.length === 0) return meta;

      const { data, error } = await supabase
        .from('collections')
        .select('card_id, is_foil, condition')
        .eq('user_id', userId)
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
    [userId],
  );

  const collectionKey = useMemo(
    () => ['myCollection', userId, debouncedSearch] as const,
    [userId, debouncedSearch],
  );
  const {
    data: collectionPages,
    isPending,
    isError,
    hasNextPage: hasMore,
    isFetchingNextPage: isLoadingMore,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: collectionKey,
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CollectionPage> => {
      // Get paginated (and server-side filtered) collection from Supabase
      const result = await getUserCollectionPaginated(userId!, PAGE_SIZE, pageParam, debouncedSearch);

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

  return {
    collection,
    totalCount,
    isPending,
    isError,
    hasMore,
    isLoadingMore,
    fetchNextPage,
    updateCachedItems,
  };
}
