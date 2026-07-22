import { supabase } from '../lib/supabase';

export interface Friend {
  id: string;
  friendshipId: string;
  username: string | null;
  status: 'pending' | 'accepted' | 'declined';
  isRequester: boolean;
  created_at: string | null;
}

interface FriendshipRequestRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string | null;
  requester?: { username: string | null } | null;
  addressee?: { username: string | null } | null;
}

export interface FriendshipWithProfile {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string | null;
  requester: { username: string | null };
  addressee: { username: string | null };
}

// Get all friends (accepted friendships)
export async function getFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      requester:profiles!friendships_requester_id_fkey(username),
      addressee:profiles!friendships_addressee_id_fkey(username)
    `)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw error;

  return (data as unknown as FriendshipWithProfile[]).map((f) => {
    const isRequester = f.requester_id === userId;
    return {
      id: isRequester ? f.addressee_id : f.requester_id,
      friendshipId: f.id,
      username: isRequester ? f.addressee?.username : f.requester?.username,
      status: f.status,
      isRequester,
      created_at: f.created_at,
    };
  });
}

// Get pending friend requests (received)
export async function getPendingRequests(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      requester:profiles!friendships_requester_id_fkey(username)
    `)
    .eq('status', 'pending')
    .eq('addressee_id', userId)
    .returns<FriendshipRequestRow[]>();

  if (error) throw error;

  return data.map((f) => ({
    id: f.requester_id,
    friendshipId: f.id,
    username: f.requester?.username ?? null,
    status: f.status,
    isRequester: false,
    created_at: f.created_at,
  }));
}

// Get sent friend requests (pending)
export async function getSentRequests(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      addressee:profiles!friendships_addressee_id_fkey(username)
    `)
    .eq('status', 'pending')
    .eq('requester_id', userId)
    .returns<FriendshipRequestRow[]>();

  if (error) throw error;

  return data.map((f) => ({
    id: f.addressee_id,
    friendshipId: f.id,
    username: f.addressee?.username ?? null,
    status: f.status,
    isRequester: true,
    created_at: f.created_at,
  }));
}

// Search users by username
export async function searchUsers(query: string, currentUserId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', `%${query}%`)
    .neq('id', currentUserId)
    .limit(10);

  if (error) throw error;
  return data;
}

// Send friend request
export async function sendFriendRequest(requesterId: string, addresseeId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Accept friend request
export async function acceptFriendRequest(friendshipId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Decline friend request
export async function declineFriendRequest(friendshipId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Remove friend (delete friendship)
export async function removeFriend(friendshipId: string) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

// Check if two users are friends
export async function areFriends(userId1: string, userId2: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

// Get friendship status between two users
export async function getFriendshipStatus(userId1: string, userId2: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(`and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`)
    .maybeSingle();

  if (error) throw error;

  if (!data) return { status: 'none' as const, friendshipId: null, isRequester: false };

  return {
    status: data.status as 'pending' | 'accepted' | 'declined',
    friendshipId: data.id,
    isRequester: data.requester_id === userId1,
  };
}
