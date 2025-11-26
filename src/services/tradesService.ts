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
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
  editor_id: string | null;
  sender?: { username: string | null };
  receiver?: { username: string | null };
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
  senderId: string;
  receiverId: string;
  message?: string;
  senderCards: { cardId: string; quantity: number }[];
  receiverCards: { cardId: string; quantity: number }[];
}

export interface UpdateTradeParams {
  tradeId: string;
  editorId: string;
  message?: string;
  senderCards: { cardId: string; quantity: number }[];
  receiverCards: { cardId: string; quantity: number }[];
}

// Get all trades for a user
export async function getTrades(userId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      *,
      sender:profiles!trades_sender_id_fkey(username),
      receiver:profiles!trades_receiver_id_fkey(username),
      items:trade_items(*)
    `)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
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
      sender:profiles!trades_sender_id_fkey(username),
      receiver:profiles!trades_receiver_id_fkey(username),
      items:trade_items(*)
    `)
    .eq('status', 'pending')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
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
      sender:profiles!trades_sender_id_fkey(username),
      receiver:profiles!trades_receiver_id_fkey(username),
      items:trade_items(*)
    `)
    .eq('id', tradeId)
    .single();

  if (error) throw error;
  return data as Trade;
}

// Create a new trade with items
export async function createTrade(params: CreateTradeParams): Promise<Trade> {
  const { senderId, receiverId, message, senderCards, receiverCards } = params;

  // Create the trade
  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      message,
      status: 'pending',
    })
    .select()
    .single();

  if (tradeError) throw tradeError;

  // Add sender's cards
  const senderItems = senderCards.map((card) => ({
    trade_id: trade.id,
    owner_id: senderId,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  // Add receiver's cards (what sender wants)
  const receiverItems = receiverCards.map((card) => ({
    trade_id: trade.id,
    owner_id: receiverId,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  const allItems = [...senderItems, ...receiverItems];

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
      sender:profiles!trades_sender_id_fkey(username),
      receiver:profiles!trades_receiver_id_fkey(username),
      items:trade_items(*)
    `)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .in('status', ['accepted', 'declined', 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data as Trade[];
}

// Update an existing trade (for edits and counter-offers)
export async function updateTrade(params: UpdateTradeParams): Promise<Trade> {
  const { tradeId, editorId, message, senderCards, receiverCards } = params;

  // Get current trade info
  const { data: currentTrade, error: tradeError } = await supabase
    .from('trades')
    .select('version, sender_id, receiver_id')
    .eq('id', tradeId)
    .single();

  if (tradeError) throw tradeError;

  const newVersion = (currentTrade.version || 1) + 1;

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

  // Add new items
  const senderItems = senderCards.map((card) => ({
    trade_id: tradeId,
    owner_id: currentTrade.sender_id,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  const receiverItems = receiverCards.map((card) => ({
    trade_id: tradeId,
    owner_id: currentTrade.receiver_id,
    card_id: card.cardId,
    quantity: card.quantity,
  }));

  const allItems = [...senderItems, ...receiverItems];

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
