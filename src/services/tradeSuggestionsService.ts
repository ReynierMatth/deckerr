import { supabase } from '../lib/supabase';
import { getFriends } from './friendsService';

export interface FriendTradeSuggestion {
  friendId: string;
  friendUsername: string | null;
  /** card_ids the friend owns that are in my wishlist */
  theyHaveIWant: string[];
  /** card_ids I own that are in the friend's wishlist */
  iHaveTheyWant: string[];
}

const cardIdSet = async (table: 'wishlists' | 'collections', userId: string): Promise<Set<string>> => {
  const { data, error } = await supabase.from(table).select('card_id').eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.card_id as string));
};

/**
 * Cross-match my wishlist/collection with each accepted friend's collection/
 * wishlist to surface possible trades. Only reads data RLS lets us see (a
 * friend's collection must be visible for its cards to appear).
 */
export const getTradeSuggestions = async (userId: string): Promise<FriendTradeSuggestion[]> => {
  const [myWant, myHave, friends] = await Promise.all([
    cardIdSet('wishlists', userId),
    cardIdSet('collections', userId),
    getFriends(userId),
  ]);

  const results = await Promise.all(
    friends.map(async (friend): Promise<FriendTradeSuggestion> => {
      const [theirHave, theirWant] = await Promise.all([
        cardIdSet('collections', friend.id),
        cardIdSet('wishlists', friend.id),
      ]);
      return {
        friendId: friend.id,
        friendUsername: friend.username,
        theyHaveIWant: [...theirHave].filter((id) => myWant.has(id)),
        iHaveTheyWant: [...theirWant].filter((id) => myHave.has(id)),
      };
    }),
  );

  return results.filter((r) => r.theyHaveIWant.length > 0 || r.iHaveTheyWant.length > 0);
};
