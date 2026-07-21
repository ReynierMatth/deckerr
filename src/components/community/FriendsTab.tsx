import { useState, useEffect } from 'react';
import { Search, Loader2, UserPlus, UserMinus, Check, X, Send, Eye } from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import {
  getFriends,
  getPendingRequests,
  getSentRequests,
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  Friend,
} from '../../services/friendsService';
import ConfirmModal from '../ConfirmModal';

type FriendsSubTab = 'list' | 'requests' | 'search';

interface FriendshipRealtimeRow {
  requester_id: string;
  addressee_id: string;
}

interface ViewableUser {
  id: string;
  username: string | null;
  collection_visibility: 'public' | 'friends' | 'private' | null;
}

interface FriendsTabProps {
  /** View a friend's collection (owned by the Browse view in Community). */
  onViewCollection: (user: ViewableUser) => void;
  /** Report the current friends list up so Community can show the tab badge + Browse shortcut. */
  onFriendsChange?: (friends: Friend[]) => void;
}

/** Friends tab: list, requests, and add. Self-contained. */
export default function FriendsTab({ onViewCollection, onFriendsChange }: FriendsTabProps) {
  const { user } = useAuth();
  const toast = useToast();

  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('list');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<{ id: string; username: string | null }[]>([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [friendListFilter, setFriendListFilter] = useState('');
  const [requestsFilter, setRequestsFilter] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info' | 'success';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, variant: 'danger' });

  const loadFriendsData = async () => {
    if (!user) return;
    const [friendsData, pendingData, sentData] = await Promise.all([
      getFriends(user.id),
      getPendingRequests(user.id),
      getSentRequests(user.id),
    ]);
    setFriends(friendsData);
    setPendingRequests(pendingData);
    setSentRequests(sentData);
  };

  // Load friends on mount (when a user is set).
  useEffect(() => {
    if (user) {
      loadFriendsData();
    }
  }, [user]);

  // Report friends list up to Community for the tab badge + Browse shortcut.
  useEffect(() => {
    onFriendsChange?.(friends);
  }, [friends, onFriendsChange]);

  // Subscribe to friendship changes.
  useEffect(() => {
    if (!user) return;

    const friendshipsChannel = supabase
      .channel('friendships-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        (payload: RealtimePostgresChangesPayload<FriendshipRealtimeRow>) => {
          // Filter for friendships involving this user
          const newData = (payload.new || payload.old) as Partial<FriendshipRealtimeRow>;
          if (newData && (newData.requester_id === user.id || newData.addressee_id === user.id)) {
            console.log('Friendship change:', payload);
            loadFriendsData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(friendshipsChannel);
    };
  }, [user]);

  const handleSearchFriends = async () => {
    if (!user || friendSearch.trim().length < 2) return;
    setSearchingFriends(true);
    try {
      const results = await searchUsers(friendSearch, user.id);
      setFriendSearchResults(results || []);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingFriends(false);
    }
  };

  const handleSendRequest = async (addresseeId: string) => {
    if (!user) return;
    try {
      await sendFriendRequest(user.id, addresseeId);
      setFriendSearchResults((prev) => prev.filter((u) => u.id !== addresseeId));
      await loadFriendsData();
      toast.success('Friend request sent!');
    } catch {
      toast.error('Failed to send friend request');
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      await loadFriendsData();
      toast.success('Friend request accepted!');
    } catch {
      toast.error('Failed to accept request');
    }
  };

  const handleDeclineRequest = async (friendshipId: string) => {
    try {
      await declineFriendRequest(friendshipId);
      await loadFriendsData();
      toast.info('Friend request declined');
    } catch {
      toast.error('Failed to decline request');
    }
  };

  const handleRemoveFriend = (friendshipId: string, friendName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Friend',
      message: `Remove ${friendName} from your friends?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await removeFriend(friendshipId);
          await loadFriendsData();
          toast.success('Friend removed');
        } catch {
          toast.error('Failed to remove friend');
        }
      },
    });
  };

  const isAlreadyFriendOrPending = (userId: string) => {
    return friends.some((f) => f.id === userId) ||
           pendingRequests.some((f) => f.id === userId) ||
           sentRequests.some((f) => f.id === userId);
  };

  return (
    <div className="space-y-3">
      {/* Sub tabs */}
      <div className="flex gap-1">
        {[
          { id: 'list' as FriendsSubTab, label: 'List' },
          { id: 'requests' as FriendsSubTab, label: 'Requests', count: pendingRequests.length },
          { id: 'search' as FriendsSubTab, label: 'Add' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFriendsSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm flex-1 ${
              friendsSubTab === tab.id ? 'bg-blue-600' : 'bg-gray-800 active:bg-gray-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-xs">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Friends List */}
      {friendsSubTab === 'list' && (
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={friendListFilter}
              onChange={(e) => setFriendListFilter(e.target.value)}
              placeholder="Search friends..."
              className="w-full pl-9 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {friendListFilter && (
              <button
                onClick={() => setFriendListFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {friends.length === 0 ? (
            <p className="text-gray-400 text-center py-8 text-sm">No friends yet</p>
          ) : friends.filter((f) =>
              !friendListFilter || f.username?.toLowerCase().includes(friendListFilter.toLowerCase())
            ).length === 0 ? (
            <p className="text-gray-400 text-center py-8 text-sm">No friends match "{friendListFilter}"</p>
          ) : (
            <div className="space-y-2">
              {friends
                .filter((f) => !friendListFilter || f.username?.toLowerCase().includes(friendListFilter.toLowerCase()))
                .map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                    <span className="font-medium truncate">{friend.username || 'Unknown'}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          onViewCollection({ id: friend.id, username: friend.username, collection_visibility: 'friends' });
                        }}
                        className="p-2 text-blue-400 active:bg-blue-400/20 rounded-lg"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(friend.friendshipId, friend.username || 'user')}
                        className="p-2 text-red-400 active:bg-red-400/20 rounded-lg"
                      >
                        <UserMinus size={18} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Requests */}
      {friendsSubTab === 'requests' && (
        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={requestsFilter}
              onChange={(e) => setRequestsFilter(e.target.value)}
              placeholder="Search requests..."
              className="w-full pl-9 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {requestsFilter && (
              <button
                onClick={() => setRequestsFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {(() => {
            const filteredPending = pendingRequests.filter((r) =>
              !requestsFilter || r.username?.toLowerCase().includes(requestsFilter.toLowerCase())
            );
            const filteredSent = sentRequests.filter((r) =>
              !requestsFilter || r.username?.toLowerCase().includes(requestsFilter.toLowerCase())
            );

            return (
              <>
                {filteredPending.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Received</p>
                    <div className="space-y-2">
                      {filteredPending.map((req) => (
                        <div key={req.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                          <span className="font-medium truncate">{req.username || 'Unknown'}</span>
                          <div className="flex gap-1">
                            <button onClick={() => handleAcceptRequest(req.friendshipId)} className="p-2 text-green-400 active:bg-green-400/20 rounded-lg">
                              <Check size={18} />
                            </button>
                            <button onClick={() => handleDeclineRequest(req.friendshipId)} className="p-2 text-red-400 active:bg-red-400/20 rounded-lg">
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSent.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Sent</p>
                    <div className="space-y-2">
                      {filteredSent.map((req) => (
                        <div key={req.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Send size={14} className="text-gray-500" />
                            <span className="font-medium truncate">{req.username || 'Unknown'}</span>
                          </div>
                          <span className="text-xs text-yellow-500">Pending</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingRequests.length === 0 && sentRequests.length === 0 && (
                  <p className="text-gray-400 text-center py-8 text-sm">No requests</p>
                )}

                {(pendingRequests.length > 0 || sentRequests.length > 0) &&
                 filteredPending.length === 0 && filteredSent.length === 0 && (
                  <p className="text-gray-400 text-center py-8 text-sm">No requests match "{requestsFilter}"</p>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Search/Add */}
      {friendsSubTab === 'search' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchFriends()}
              placeholder="Username..."
              className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
            />
            <button
              onClick={handleSearchFriends}
              disabled={searchingFriends || friendSearch.trim().length < 2}
              className="px-4 py-2.5 bg-blue-600 disabled:bg-gray-600 rounded-lg"
            >
              {searchingFriends ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            </button>
          </div>

          {friendSearchResults.length > 0 && (
            <div className="space-y-2">
              {friendSearchResults.map((result) => (
                <div key={result.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                  <span className="font-medium truncate">{result.username || 'Unknown'}</span>
                  {isAlreadyFriendOrPending(result.id) ? (
                    <span className="text-xs text-gray-500">Connected</span>
                  ) : (
                    <button
                      onClick={() => handleSendRequest(result.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 rounded-lg text-sm"
                    >
                      <UserPlus size={14} />
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
}
