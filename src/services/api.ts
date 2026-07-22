import { supabase } from '../lib/supabase';
import { getCardsByIds as fetchCardsByIds } from './scryfall';

// Scryfall card API lives in its own module; re-exported here for backwards
// compatibility with existing `../services/api` imports.
export {
  searchCards,
  getRandomCards,
  getCardById,
  getCardsByIds,
  getCardsByNames,
  getCardByFuzzyName,
  resolveCardsByNames,
  ScryfallHttpError,
} from './scryfall';

const priceFromCard = (prices?: { usd?: string; usd_foil?: string }): number => {
  const usd = prices?.usd ?? prices?.usd_foil;
  return usd ? Number(usd) : 0;
};

// Collection API functions
export const getUserCollection = async (userId: string): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from('collections')
    .select('card_id, quantity')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user collection:', error);
    throw error;
  }

  // Create a map of card_id to quantity for easy lookup
  const collectionMap = new Map<string, number>();
  data?.forEach((item) => {
    collectionMap.set(item.card_id, item.quantity);
  });

  return collectionMap;
};

// Paginated collection API
export interface PaginatedCollectionResult {
  items: Map<string, number>; // card_id -> quantity
  totalCount: number;
  hasMore: boolean;
}

// Get total collection value from user profile (pre-calculated by triggers)
export const getCollectionTotalValue = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('collection_total_value')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching collection total value:', error);
    return 0;
  }

  return data?.collection_total_value || 0;
};

export const getUserCollectionPaginated = async (
  userId: string,
  pageSize: number = 50,
  offset: number = 0
): Promise<PaginatedCollectionResult> => {
  // First, get the total count
  const { count: totalCount, error: countError } = await supabase
    .from('collections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    console.error('Error counting user collection:', countError);
    throw countError;
  }

  // Then get the paginated data
  const { data, error } = await supabase
    .from('collections')
    .select('card_id, quantity')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Error fetching user collection:', error);
    throw error;
  }

  // Create a map of card_id to quantity for easy lookup
  const collectionMap = new Map<string, number>();
  data?.forEach((item) => {
    collectionMap.set(item.card_id, item.quantity);
  });

  return {
    items: collectionMap,
    totalCount: totalCount || 0,
    hasMore: offset + pageSize < (totalCount || 0),
  };
};

export const addCardToCollection = async (
  userId: string,
  cardId: string,
  quantity: number = 1,
  priceUsd: number = 0
): Promise<void> => {
  // Read the current quantity so we can add to it, then upsert the final value
  // in a single write (relies on the collections_user_card_unique constraint).
  const { data: existing, error: fetchError } = await supabase
    .from('collections')
    .select('quantity')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('collections')
    .upsert(
      {
        user_id: userId,
        card_id: cardId,
        quantity: (existing?.quantity ?? 0) + quantity,
        price_usd: priceUsd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,card_id' }
    );

  if (error) throw error;
};

export const addMultipleCardsToCollection = async (
  userId: string,
  cards: { cardId: string; quantity: number; priceUsd?: number }[]
): Promise<void> => {
  if (cards.length === 0) return;

  // Aggregate duplicate cardIds from the input so the upsert never targets the
  // same (user_id, card_id) row twice (Postgres rejects that in one statement).
  const requested = new Map<string, { quantity: number; priceUsd: number }>();
  for (const card of cards) {
    const prev = requested.get(card.cardId);
    requested.set(card.cardId, {
      quantity: (prev?.quantity ?? 0) + card.quantity,
      priceUsd: card.priceUsd ?? prev?.priceUsd ?? 0,
    });
  }

  // One query to read existing quantities...
  const { data: existingCards, error: fetchError } = await supabase
    .from('collections')
    .select('card_id, quantity')
    .eq('user_id', userId)
    .in('card_id', [...requested.keys()]);

  if (fetchError) throw fetchError;

  const existingQty = new Map<string, number>();
  existingCards?.forEach((item) => existingQty.set(item.card_id, item.quantity));

  // ...then a single bulk upsert instead of one UPDATE per card.
  const now = new Date().toISOString();
  const rows = [...requested.entries()].map(([cardId, { quantity, priceUsd }]) => ({
    user_id: userId,
    card_id: cardId,
    quantity: (existingQty.get(cardId) ?? 0) + quantity,
    price_usd: priceUsd,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('collections')
    .upsert(rows, { onConflict: 'user_id,card_id' });

  if (error) throw error;
};

/**
 * Re-fetch current Scryfall prices for every card in the user's collection and
 * persist them to collections.price_usd. The DB trigger then recomputes the
 * denormalized profiles.collection_total_value.
 */
export const refreshCollectionPrices = async (userId: string): Promise<void> => {
  const collection = await getUserCollection(userId); // Map<card_id, quantity>
  const cardIds = [...collection.keys()];
  if (cardIds.length === 0) return;

  const cards = await fetchCardsByIds(cardIds);
  const priceById = new Map(cards.map((c) => [c.id, priceFromCard(c.prices)]));

  const now = new Date().toISOString();
  const rows = cardIds.map((cardId) => ({
    user_id: userId,
    card_id: cardId,
    quantity: collection.get(cardId) ?? 0,
    price_usd: priceById.get(cardId) ?? 0,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('collections')
    .upsert(rows, { onConflict: 'user_id,card_id' });

  if (error) throw error;
};

// ---- Wishlist ----
// Returns a plain array (not a Set) because TanStack Query's structural
// sharing does not preserve Set/Map instances.
export const getWishlist = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase.from('wishlists').select('card_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.card_id);
};

export const addToWishlist = async (userId: string, cardId: string): Promise<void> => {
  const { error } = await supabase
    .from('wishlists')
    .upsert({ user_id: userId, card_id: cardId }, { onConflict: 'user_id,card_id' });
  if (error) throw error;
};

export const removeFromWishlist = async (userId: string, cardId: string): Promise<void> => {
  const { error } = await supabase.from('wishlists').delete().eq('user_id', userId).eq('card_id', cardId);
  if (error) throw error;
};
