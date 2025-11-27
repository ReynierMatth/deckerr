import { supabase } from '../lib/supabase';

export interface TradeItem {
  id: string;
  trade_id: string;
  owner_id: string;
  card_id: string;
  quantity: number;
}

export interface Trade {
  id: string;
  user1_id: string;
  user2_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
  editor_id: string | null;
  is_valid: boolean;
  user1?: { username: string | null };
  user2?: { username: string | null };
  items?: TradeItem[];
}

export interface TradeHistoryEntry {
  id: string;
  trade_id: string;
  version: number;
  editor_id: string;
  message: string | null;
  created_at: string;
  editor?: { username: string | null };
  items?: TradeHistoryItem[];
}

export interface TradeHistoryItem {
  id: string;
  history_id: string;
  owner_id: string;
  card_id: string;
  quantity: number;
}

export interface CreateTradeParams {
  user1Id: string;
  user2Id: string;
  message?: string;
  user1Cards: { cardId: string; quantity: number }[];
  user2Cards: { cardId: string; quantity: number }[];
}

export interface UpdateTradeParams {
  tradeId: string;
  editorId: string;
  message?: string;
  myCards: { cardId: string; quantity: number }[];
  theirCards: { cardId: string; quantity: number }[];
}

// Get all trades for a user
export async function getTrades(userId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      user1:profiles!trades_user1_id_fkey(username),
      user2:profiles!trades_user2_id_fkey(username),
      items:trade_items(*)
    `)
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Trade[];
}

// Get pending trades for a user
export async function getPendingTrades(userId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      user1:profiles!trades_user1_id_fkey(username),
      user2:profiles!trades_user2_id_fkey(username),
      items:trade_items(*)
    `)
    .eq('status', 'pending')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Trade[];
}

// Get trade by ID
export async function getTradeById(tradeId: string): Promise<Trade | null> {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      user1:profiles!trades_user1_id_fkey(username),
      user2:profiles!trades_user2_id_fkey(username),
      items:trade_items(*)
    `)
    .eq('id', tradeId)
    .single();

  if (error) throw error;
  return data as Trade;
}

// Create a new trade with items
export async function createTrade(params: CreateTradeParams): Promise<Trade> {
  const { user1Id, user2Id, message, user1Cards, user2Cards } = params;

  // Create the trade
  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .insert({
      user1_id: user1Id,
      user2_id: user2Id,
      message,
      status: 'pending',
      // editor_id starts as null - gets set when someone edits the trade
    })
    .select()
    .single();

  if (tradeError) throw tradeError;

  // Add user1's cards
  const user1Items = user1Cards.map((card) => ({
    trade_id: trade.id,
    owner_id: user1Id,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  // Add user2's cards
  const user2Items = user2Cards.map((card) => ({
    trade_id: trade.id,
    owner_id: user2Id,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  const allItems = [...user1Items, ...user2Items];

  if (allItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('trade_items')
      .insert(allItems);

    if (itemsError) throw itemsError;
  }

  return trade;
}

// Accept a trade (executes the card transfer)
export async function acceptTrade(tradeId: string): Promise<boolean> {
  // First check if the trade is valid
  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .select('is_valid, status')
    .eq('id', tradeId)
    .single();

  if (tradeError) throw tradeError;

  // Prevent accepting invalid trades
  if (!trade.is_valid) {
    throw new Error('This trade is no longer valid. One or more cards are no longer available in the required quantities.');
  }

  // Prevent accepting non-pending trades
  if (trade.status !== 'pending') {
    throw new Error('This trade has already been processed.');
  }

  const { data, error } = await supabase.rpc('execute_trade', {
    trade_id: tradeId,
  });

  if (error) throw error;
  return data as boolean;
}

// Decline a trade
export async function declineTrade(tradeId: string): Promise<Trade> {
  const { data, error } = await supabase
    .from('trades')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', tradeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Cancel a trade (sender only)
export async function cancelTrade(tradeId: string): Promise<Trade> {
  const { data, error } = await supabase
    .from('trades')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', tradeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get trade history (completed/cancelled/declined trades)
export async function getTradeHistory(userId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      user1:profiles!trades_user1_id_fkey(username),
      user2:profiles!trades_user2_id_fkey(username),
      items:trade_items(*)
    `)
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .in('status', ['accepted', 'declined', 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data as Trade[];
}

// Update an existing trade (for edits and counter-offers)
export async function updateTrade(params: UpdateTradeParams): Promise<Trade> {
  const { tradeId, editorId, message, myCards, theirCards } = params;

  // Get current trade info
  const { data: currentTrade, error: tradeError } = await supabase
    .from('trades')
    .select('version, user1_id, user2_id')
    .eq('id', tradeId)
    .single();

  if (tradeError) throw tradeError;

  const newVersion = (currentTrade.version || 1) + 1;

  // Determine the other user's ID
  const otherUserId = currentTrade.user1_id === editorId
    ? currentTrade.user2_id
    : currentTrade.user1_id;

  // Save current state to history before updating
  const { data: historyEntry, error: historyError } = await supabase
    .from('trade_history')
    .insert({
      trade_id: tradeId,
      version: currentTrade.version || 1,
      editor_id: editorId,
      message: message || null,
    })
    .select()
    .single();

  if (historyError) throw historyError;

  // Save current items to history
  const { data: currentItems } = await supabase
    .from('trade_items')
    .select('*')
    .eq('trade_id', tradeId);

  if (currentItems && currentItems.length > 0) {
    const historyItems = currentItems.map(item => ({
      history_id: historyEntry.id,
      owner_id: item.owner_id,
      card_id: item.card_id,
      quantity: item.quantity,
    }));

    await supabase.from('trade_history_items').insert(historyItems);
  }

  // Update the trade
  const { data: updatedTrade, error: updateError } = await supabase
    .from('trades')
    .update({
      message,
      version: newVersion,
      editor_id: editorId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tradeId)
    .select()
    .single();

  if (updateError) throw updateError;

  // Delete existing items
  await supabase.from('trade_items').delete().eq('trade_id', tradeId);

  // Add new items (myCards belong to editor, theirCards belong to other user)
  const myItems = myCards.map((card) => ({
    trade_id: tradeId,
    owner_id: editorId,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  const theirItems = theirCards.map((card) => ({
    trade_id: tradeId,
    owner_id: otherUserId,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  const allItems = [...myItems, ...theirItems];

  if (allItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('trade_items')
      .insert(allItems);

    if (itemsError) throw itemsError;
  }

  return updatedTrade;
}

// Get version history for a trade
export async function getTradeVersionHistory(tradeId: string): Promise<TradeHistoryEntry[]> {
  const { data, error } = await supabase
    .from('trade_history')
    .select(`
      *,
      editor:profiles!trade_history_editor_id_fkey(username),
      items:trade_history_items(*)
    `)
    .eq('trade_id', tradeId)
    .order('version', { ascending: true });

  if (error) throw error;
  return data as TradeHistoryEntry[];
}
