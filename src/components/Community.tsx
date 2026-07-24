import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Globe, Users, Eye, Loader2 } from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { useCardFaces } from '../hooks/useCardFaces';
import { supabase } from '../lib/supabase';
import ProfileSettings from './community/ProfileSettings';
import FriendsTab from './community/FriendsTab';
import TradesTab from './community/TradesTab';
import TradeSuggestions from './community/TradeSuggestions';
import CommunityTabBar, { CommunityTab } from './community/CommunityTabBar';
import UserCollectionViewer, { UserProfile } from './community/UserCollectionViewer';
import { getFriends } from '../services/friendsService';
import { getPendingTrades } from '../services/tradesService';
import { profileDisplayName, profileHandleLabel } from '../utils/profileName';

interface ProfileRealtimeRow {
  id: string;
  collection_visibility: string | null;
  collection_total_value: number;
}

interface FriendshipRealtimeRow {
  requester_id: string;
  addressee_id: string;
}

interface TradeRealtimeRow {
  user1_id: string;
  user2_id: string;
}

const EMPTY_PROFILES: UserProfile[] = [];

export default function Community() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const [activeTab, setActiveTab] = useState<CommunityTab>('browse');

  // Browse state (local UI only — server data lives in queries below)
  const [browseSearch, setBrowseSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Friends list + pending trades owned by Community so the tab badges are
  // correct on arrival and stay fresh even when those tabs aren't open.
  const { data: friendsList = [] } = useQuery({
    queryKey: ['communityFriends', user?.id],
    enabled: !!user,
    queryFn: () => getFriends(user!.id),
  });

  const { data: pendingTrades = [] } = useQuery({
    queryKey: ['communityPendingTrades', user?.id],
    enabled: !!user,
    queryFn: () => getPendingTrades(user!.id),
  });

  // Public profiles for the Browse tab.
  const { data: publicUsersData, isLoading: loading } = useQuery({
    queryKey: ['publicUsers', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserProfile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, handle, collection_visibility')
        .eq('collection_visibility', 'public')
        .neq('id', user!.id)
        .order('username');
      if (error) throw error;
      return data ?? [];
    },
  });
  const publicUsers = publicUsersData ?? EMPTY_PROFILES;

  // ============ REALTIME SUBSCRIPTIONS ============
  // One channel for the page-level listeners (profiles visibility, friendships,
  // trades); they share the same lifetime so separate channels bought nothing.
  useEffect(() => {
    if (!user) return;

    const communityChannel = supabase
      .channel('community-changes')
      // Profile visibility changes affect the Browse tab's public users list.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload: RealtimePostgresChangesPayload<ProfileRealtimeRow>) => {
          console.log('Profile change:', payload);
          const newProfile = payload.new as Partial<ProfileRealtimeRow>;
          const oldProfile = payload.old as Partial<ProfileRealtimeRow>;
          if (newProfile && oldProfile && newProfile.collection_visibility !== oldProfile.collection_visibility) {
            queryClient.invalidateQueries({ queryKey: ['publicUsers'] });
          }
        }
      )
      // Keep the Friends tab badge + Browse shortcut fresh even when the tab is closed.
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        (payload: RealtimePostgresChangesPayload<FriendshipRealtimeRow>) => {
          const data = (payload.new || payload.old) as Partial<FriendshipRealtimeRow>;
          if (data && (data.requester_id === user.id || data.addressee_id === user.id)) {
            queryClient.invalidateQueries({ queryKey: ['communityFriends'] });
          }
        }
      )
      // Keep the Trades tab badge fresh even when the tab is closed.
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        (payload: RealtimePostgresChangesPayload<TradeRealtimeRow>) => {
          const data = (payload.new || payload.old) as Partial<TradeRealtimeRow>;
          if (data && (data.user1_id === user.id || data.user2_id === user.id)) {
            queryClient.invalidateQueries({ queryKey: ['communityPendingTrades'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(communityChannel);
    };
  }, [user, queryClient]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  // ============ USER COLLECTION VIEW ============
  if (selectedUser) {
    return (
      <UserCollectionViewer
        selectedUser={selectedUser}
        onBack={() => setSelectedUser(null)}
        getCurrentFaceIndex={getCurrentFaceIndex}
        toggleCardFace={toggleCardFace}
      />
    );
  }

  const filteredPublicUsers = publicUsers.filter((u) => {
    if (!browseSearch) return true;
    const q = browseSearch.toLowerCase();
    return (
      profileDisplayName(u).toLowerCase().includes(q) ||
      Boolean(u.handle?.toLowerCase().includes(q)) ||
      Boolean(u.username?.toLowerCase().includes(q))
    );
  });

  // ============ MAIN VIEW ============
  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Community</h1>

        {/* Tabs */}
        <CommunityTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          friendsCount={friendsList.length}
          pendingTradesCount={pendingTrades.length}
        />

        {/* ============ BROWSE TAB ============ */}
        {activeTab === 'browse' && (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Users List */}
            {filteredPublicUsers.length === 0 ? (
              <p className="text-gray-400 text-center py-8 text-sm">No public collections</p>
            ) : (
              <div className="space-y-2">
                {filteredPublicUsers.map((userProfile) => (
                  <button
                    key={userProfile.id}
                    onClick={() => setSelectedUser(userProfile)}
                    className="w-full flex items-center justify-between bg-gray-800 p-3 rounded-lg active:bg-gray-700 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe size={18} className="text-green-400 flex-shrink-0" />
                      <div className="min-w-0 text-left">
                        <div className="font-medium truncate">{profileDisplayName(userProfile)}</div>
                        {profileHandleLabel(userProfile) && (
                          <div className="text-xs text-gray-400 truncate">{profileHandleLabel(userProfile)}</div>
                        )}
                      </div>
                    </div>
                    <Eye size={18} className="text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Friends shortcut */}
            {friendsList.length > 0 && (
              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">Your friends</p>
                <div className="space-y-2">
                  {friendsList.slice(0, 3).map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => {
                        setSelectedUser({
                          id: friend.id,
                          username: friend.username,
                          display_name: friend.display_name,
                          handle: friend.handle,
                          collection_visibility: 'friends',
                        });
                      }}
                      className="w-full flex items-center justify-between bg-gray-800 p-3 rounded-lg active:bg-gray-700 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users size={18} className="text-blue-400 flex-shrink-0" />
                        <div className="min-w-0 text-left">
                          <div className="font-medium truncate">{profileDisplayName(friend)}</div>
                          {profileHandleLabel(friend) && (
                            <div className="text-xs text-gray-400 truncate">{profileHandleLabel(friend)}</div>
                          )}
                        </div>
                      </div>
                      <Eye size={18} className="text-gray-400 flex-shrink-0" />
                    </button>
                  ))}
                  {friendsList.length > 3 && (
                    <button
                      onClick={() => setActiveTab('friends')}
                      className="w-full text-center text-blue-400 text-sm py-2"
                    >
                      View all {friendsList.length} friends
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ FRIENDS TAB ============ */}
        {activeTab === 'friends' && (
          <FriendsTab onViewCollection={(u) => setSelectedUser(u)} />
        )}

        {/* ============ TRADES TAB ============ */}
        {activeTab === 'trades' && <TradesTab />}

        {/* ============ SUGGESTIONS TAB ============ */}
        {activeTab === 'suggestions' && <TradeSuggestions />}

        {/* ============ PROFILE TAB ============ */}
        {activeTab === 'profile' && <ProfileSettings />}
      </div>
    </div>
  );
}
