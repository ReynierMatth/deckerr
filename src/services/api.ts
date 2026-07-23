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
  offset: number = 0,
  search: string = ''
): Promise<PaginatedCollectionResult> => {
  const term = search.trim();

  // First, get the total count (server-side name filter when searching)
  let countQuery = supabase
    .from('collections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (term) countQuery = countQuery.ilike('card_name', `%${term}%`);
  const { count: totalCount, error: countError } = await countQuery;

  if (countError) {
    console.error('Error counting user collection:', countError);
    throw countError;
  }

  // Then get the paginated (and filtered) data
  let dataQuery = supabase
    .from('collections')
    .select('card_id, quantity')
    .eq('user_id', userId);
  if (term) dataQuery = dataQuery.ilike('card_name', `%${term}%`);
  const { data, error } = await dataQuery
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
  priceUsd: number = 0,
  cardName?: string
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
        ...(cardName ? { card_name: cardName } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,card_id' }
    );

  if (error) throw error;
};

export const addMultipleCardsToCollection = async (
  userId: string,
  cards: { cardId: string; quantity: number; priceUsd?: number; cardName?: string }[]
): Promise<void> => {
  if (cards.length === 0) return;

  // Aggregate duplicate cardIds from the input so the upsert never targets the
  // same (user_id, card_id) row twice (Postgres rejects that in one statement).
  const requested = new Map<string, { quantity: number; priceUsd: number; cardName?: string }>();
  for (const card of cards) {
    const prev = requested.get(card.cardId);
    requested.set(card.cardId, {
      quantity: (prev?.quantity ?? 0) + card.quantity,
      priceUsd: card.priceUsd ?? prev?.priceUsd ?? 0,
      cardName: card.cardName ?? prev?.cardName,
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
  const rows = [...requested.entries()].map(([cardId, { quantity, priceUsd, cardName }]) => ({
    user_id: userId,
    card_id: cardId,
    quantity: (existingQty.get(cardId) ?? 0) + quantity,
    price_usd: priceUsd,
    ...(cardName ? { card_name: cardName } : {}),
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
  const { data: items, error: readError } = await supabase
    .from('collections')
    .select('card_id, quantity, is_foil')
    .eq('user_id', userId);
  if (readError) throw readError;
  if (!items || items.length === 0) return;

  const cards = await fetchCardsByIds([...new Set(items.map((i) => i.card_id))]);
  const byId = new Map(cards.map((c) => [c.id, c]));

  const now = new Date().toISOString();
  const rows = items.map((i) => {
    const card = byId.get(i.card_id);
    const prices = card?.prices;
    // foil entries are valued at the foil price (Scryfall's usd_foil)
    const price = i.is_foil
      ? Number(prices?.usd_foil ?? prices?.usd ?? 0)
      : Number(prices?.usd ?? prices?.usd_foil ?? 0);
    return {
      user_id: userId,
      card_id: i.card_id,
      quantity: i.quantity,
      is_foil: i.is_foil,
      price_usd: price,
      ...(card?.name ? { card_name: card.name } : {}),
      updated_at: now,
    };
  });

  const { error } = await supabase
    .from('collections')
    .upsert(rows, { onConflict: 'user_id,card_id' });

  if (error) throw error;

  await snapshotCollectionValue(userId);
};

// ---- Collection value history ----
export interface ValueHistoryPoint {
  date: string;
  value: number;
}

/** Record today's total collection value (one point per day) for the chart. */
export const snapshotCollectionValue = async (userId: string): Promise<void> => {
  const value = await getCollectionTotalValue(userId);
  const snapshot_date = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('collection_value_history')
    .upsert({ user_id: userId, snapshot_date, value }, { onConflict: 'user_id,snapshot_date' });
  if (error) throw error;
};

export const getCollectionValueHistory = async (userId: string): Promise<ValueHistoryPoint[]> => {
  const { data, error } = await supabase
    .from('collection_value_history')
    .select('snapshot_date, value')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.snapshot_date as string, value: Number(r.value) }));
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

/** Add several cards to the wishlist at once (deduplicated). */
export const addCardsToWishlist = async (userId: string, cardIds: string[]): Promise<void> => {
  const unique = [...new Set(cardIds)];
  if (unique.length === 0) return;
  const rows = unique.map((cardId) => ({ user_id: userId, card_id: cardId }));
  const { error } = await supabase.from('wishlists').upsert(rows, { onConflict: 'user_id,card_id' });
  if (error) throw error;
};

// ---- Notifications ----
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_id: string | null;
  read: boolean;
  created_at: string;
}

export const getNotifications = async (userId: string): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, related_id, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    related_id: n.related_id ?? null,
    read: Boolean(n.read),
    created_at: n.created_at,
  }));
};

export const markNotificationRead = async (id: string): Promise<void> => {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
};

// ---- Price alerts ----
export interface PriceAlert {
  id: string;
  card_id: string;
  card_name: string | null;
  target_price: number;
  direction: 'above' | 'below';
  last_triggered_at: string | null;
}

export const getPriceAlerts = async (userId: string): Promise<PriceAlert[]> => {
  const { data, error } = await supabase
    .from('price_alerts')
    .select('id, card_id, card_name, target_price, direction, last_triggered_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    card_id: a.card_id,
    card_name: a.card_name ?? null,
    target_price: Number(a.target_price),
    direction: a.direction === 'below' ? 'below' : 'above',
    last_triggered_at: a.last_triggered_at ?? null,
  }));
};

export const addPriceAlert = async (
  userId: string,
  cardId: string,
  cardName: string,
  targetPrice: number,
  direction: 'above' | 'below',
): Promise<void> => {
  const { error } = await supabase
    .from('price_alerts')
    .upsert(
      { user_id: userId, card_id: cardId, card_name: cardName, target_price: targetPrice, direction },
      { onConflict: 'user_id,card_id,direction' },
    );
  if (error) throw error;
};

export const removePriceAlert = async (id: string): Promise<void> => {
  const { error } = await supabase.from('price_alerts').delete().eq('id', id);
  if (error) throw error;
};

/** Fetch current prices for the user's alert cards and let the DB fire crossings. */
export const runPriceAlertCheck = async (userId: string): Promise<void> => {
  const alerts = await getPriceAlerts(userId);
  if (alerts.length === 0) return;
  const cards = await fetchCardsByIds([...new Set(alerts.map((a) => a.card_id))]);
  const prices: Record<string, number> = {};
  cards.forEach((c) => {
    prices[c.id] = priceFromCard(c.prices);
  });
  const { error } = await supabase.rpc('check_price_alerts', { prices });
  if (error) throw error;
};
