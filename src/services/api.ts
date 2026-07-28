import { supabase } from '../lib/supabase';
import { UnifiedCard } from '../cards/domain/UnifiedCard';
import { getPrice } from '../cards/domain/accessors/price';
import { cardData } from '../cards/infra/facade';
import { parseCardRef } from '../cards/domain/accessors/identity';
import { GameId } from '../cards/domain/game';

// Name/query-based MTG helpers are still served by the Scryfall service. The
// id-based lookups below go through the facade so game-qualified ids route to
// the right provider.
export {
  searchCards,
  getRandomCards,
  getCardsByNames,
  getCardsBySetNumber,
  setNumberKey,
  getCardByFuzzyName,
  resolveCardsByNames,
  ScryfallHttpError,
} from './scryfall';

/** Fetch cards by game-qualified id (`${game}:${rawId}`), routed per game. */
export const getCardsByIds = (ids: string[], signal?: AbortSignal): Promise<UnifiedCard[]> =>
  cardData.getCardsByIds(ids, signal);

/** Fetch a single card by game-qualified id. */
export const getCardById = (id: string, signal?: AbortSignal): Promise<UnifiedCard | null> =>
  cardData.getCardById(id, signal);

const fetchCardsByIds = (ids: string[], signal?: AbortSignal): Promise<UnifiedCard[]> =>
  cardData.getCardsByIds(ids, signal);

// Collection value is stored canonically in USD (TCGPlayer) in Phase 1; the
// user's preferred source only affects display. See the multi-TCG plan.
const priceFromCard = (card: UnifiedCard, foil = false): number =>
  getPrice(card, 'tcgplayer', { foil });

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
  search: string = '',
  game?: GameId
): Promise<PaginatedCollectionResult> => {
  const term = search.trim();

  // First, get the total count (server-side name + game filters when set)
  let countQuery = supabase
    .from('collections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (term) countQuery = countQuery.ilike('card_name', `%${term}%`);
  if (game) countQuery = countQuery.eq('game', game);
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
  if (game) dataQuery = dataQuery.eq('game', game);
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
        game: parseCardRef(cardId).game,
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
    game: parseCardRef(cardId).game,
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
    // foil entries are valued at the foil price
    const price = card ? priceFromCard(card, i.is_foil) : 0;
    return {
      user_id: userId,
      card_id: i.card_id,
      game: parseCardRef(i.card_id).game,
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

  // Record today's per-card price point (one row per card per day) for the
  // card price-history chart. Single batched upsert across all fetched cards.
  const today = now.slice(0, 10);
  const historyRows = cards.map((card) => ({
    card_id: card.id,
    game: card.game,
    recorded_at: today,
    price_usd: card.prices?.tcgplayer?.market ?? null,
    price_usd_foil: card.prices?.tcgplayer?.foil ?? null,
  }));
  const { error: historyError } = await supabase
    .from('card_price_history')
    .upsert(historyRows, { onConflict: 'card_id,recorded_at' });
  if (historyError) throw historyError;

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

// ---- Per-card price history ----
export interface CardPriceHistoryPoint {
  date: string;
  usd: number | null;
  usdFoil: number | null;
}

/** Last 90 days of recorded prices for one card, oldest first. */
export const getCardPriceHistory = async (cardId: string): Promise<CardPriceHistoryPoint[]> => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('card_price_history')
    .select('recorded_at, price_usd, price_usd_foil')
    .eq('card_id', cardId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.recorded_at as string,
    usd: r.price_usd === null ? null : Number(r.price_usd),
    usdFoil: r.price_usd_foil === null ? null : Number(r.price_usd_foil),
  }));
};

// ---- Wishlist ----
// Returns a plain array (not a Set) because TanStack Query's structural
// sharing does not preserve Set/Map instances.
export const getWishlist = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase.from('wishlists').select('card_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.card_id);
};

export type WishlistPriority = 'high' | 'medium' | 'low';

export interface WishlistEntry {
  cardId: string;
  quantity: number;
  priority: WishlistPriority;
}

const WISHLIST_PRIORITIES: readonly WishlistPriority[] = ['high', 'medium', 'low'];

const asWishlistPriority = (value: unknown): WishlistPriority =>
  WISHLIST_PRIORITIES.includes(value as WishlistPriority) ? (value as WishlistPriority) : 'medium';

/** Full wishlist rows (quantity + priority), unlike getWishlist's id-only membership list. */
export const getWishlistDetailed = async (userId: string): Promise<WishlistEntry[]> => {
  const { data, error } = await supabase
    .from('wishlists')
    .select('card_id, quantity, priority')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    cardId: r.card_id,
    quantity: Math.max(1, Number(r.quantity) || 1),
    priority: asWishlistPriority(r.priority),
  }));
};

export const updateWishlistItem = async (
  userId: string,
  cardId: string,
  updates: { quantity?: number; priority?: WishlistPriority },
): Promise<void> => {
  const payload: { quantity?: number; priority?: WishlistPriority } = {};
  if (updates.quantity !== undefined) payload.quantity = Math.max(1, Math.floor(updates.quantity));
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from('wishlists')
    .update(payload)
    .eq('user_id', userId)
    .eq('card_id', cardId);
  if (error) throw error;
};

export const addToWishlist = async (userId: string, cardId: string): Promise<void> => {
  const { error } = await supabase
    .from('wishlists')
    .upsert(
      { user_id: userId, card_id: cardId, game: parseCardRef(cardId).game },
      { onConflict: 'user_id,card_id' },
    );
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
  const rows = unique.map((cardId) => ({
    user_id: userId,
    card_id: cardId,
    game: parseCardRef(cardId).game,
  }));
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
      {
        user_id: userId,
        card_id: cardId,
        game: parseCardRef(cardId).game,
        card_name: cardName,
        target_price: targetPrice,
        direction,
      },
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
    prices[c.id] = priceFromCard(c);
  });
  const { error } = await supabase.rpc('check_price_alerts', { prices });
  if (error) throw error;
};

/**
 * Create a new deck from a flat list of cards (e.g. a scanner basket). Mirrors
 * PublicDeck's clone: one `decks` row + a `deck_cards` row per entry, with a
 * best-effort rollback if the card insert fails. Cards go in as maindeck
 * non-commander; the user refines commander/sideboard in the editor. Returns
 * the new deck id.
 */
export const createDeckFromCards = async (
  userId: string,
  name: string,
  format: string,
  cards: { cardId: string; quantity: number }[]
): Promise<string> => {
  const newDeckId = crypto.randomUUID();
  const now = new Date().toISOString();
  const cardCount = cards.reduce((n, c) => n + c.quantity, 0);

  const deckGame = cards.length ? parseCardRef(cards[0].cardId).game : 'mtg';
  const { error: deckError } = await supabase.from('decks').insert({
    id: newDeckId,
    name,
    format,
    game: deckGame,
    user_id: userId,
    created_at: now,
    updated_at: now,
    card_count: cardCount,
    is_public: false,
  });
  if (deckError) throw deckError;

  if (cards.length > 0) {
    const rows = cards.map(({ cardId, quantity }) => ({
      deck_id: newDeckId,
      card_id: cardId,
      game: parseCardRef(cardId).game,
      quantity,
      is_commander: false,
      is_sideboard: false,
    }));
    const { error: cardsError } = await supabase.from('deck_cards').insert(rows);
    if (cardsError) {
      await supabase.from('decks').delete().eq('id', newDeckId);
      throw cardsError;
    }
  }

  return newDeckId;
};

/**
 * Delete a deck and its cards. Removes deck_cards first (explicit, in case the
 * FK isn't ON DELETE CASCADE), then the deck row itself.
 */
export const deleteDeck = async (deckId: string): Promise<void> => {
  const { error: cardsError } = await supabase.from('deck_cards').delete().eq('deck_id', deckId);
  if (cardsError) throw cardsError;
  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  if (error) throw error;
};
