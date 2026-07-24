import { useQuery } from '@tanstack/react-query';
import { getUserCollection } from '../services/api';

/**
 * The signed-in user's collection as a card_id -> quantity record.
 *
 * Shared by DeckManager and CardSearch under the exact same key so they read
 * from (and invalidate) one cache entry. Returns a plain Record rather than a
 * Map because TanStack Query's structural sharing does not preserve Map
 * instances.
 */
export function useCollectionCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['collection', userId, 'counts'],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, number>> =>
      Object.fromEntries(await getUserCollection(userId!)),
  });
}
