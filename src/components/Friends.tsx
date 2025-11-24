import React, { useState, useEffect } from 'react';
import { Search, UserPlus, UserMinus, Check, X, Users, Clock, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
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
} from '../services/friendsService';

type Tab = 'friends' | 'requests' | 'search';

export default function Friends() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; username: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (user) {
      loadFriendsData();
    }
  }, [user]);

  const loadFriendsData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [friendsData, pendingData, sentData] = await Promise.all([
        getFriends(user.id),
        getPendingRequests(user.id),
        getSentRequests(user.id),
      ]);
      setFriends(friendsData);
      setPendingRequests(pendingData);
      setSentRequests(sentData);
    } catch (error) {
      console.error('Error loading friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!user || searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const results = await searchUsers(searchQuery, user.id);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (addresseeId: string) => {
    if (!user) return;
    try {
      await sendFriendRequest(user.id, addresseeId);
      setSearchResults((prev) => prev.filter((u) => u.id !== addresseeId));
      await loadFriendsData();
    } catch (error) {
      console.error('Error sending friend request:', error);
      alert('Failed to send friend request');
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      await loadFriendsData();
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const handleDeclineRequest = async (friendshipId: string) => {
    try {
      await declineFriendRequest(friendshipId);
      await loadFriendsData();
    } catch (error) {
      console.error('Error declining request:', error);
    }
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    if (!confirm('Remove this friend?')) return;
    try {
      await removeFriend(friendshipId);
      await loadFriendsData();
    } catch (error) {
      console.error('Error removing friend:', error);
    }
  };

  const isAlreadyFriendOrPending = (userId: string) => {
    return (
      friends.some((f) => f.id === userId) ||
      pendingRequests.some((f) => f.id === userId) ||
      sentRequests.some((f) => f.id === userId)
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Friends</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'friends'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Users size={18} />
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'requests'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Clock size={18} />
            Requests ({pendingRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'search'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Search size={18} />
            Search
          </button>
        </div>

        {/* Friends List */}
        {activeTab === 'friends' && (
          <div className="space-y-3">
            {friends.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No friends yet. Search for users to add them!
              </p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between bg-gray-800 p-4 rounded-lg"
                >
                  <span className="font-medium">{friend.username || 'Unknown'}</span>
                  <button
                    onClick={() => handleRemoveFriend(friend.friendshipId)}
                    className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition"
                    title="Remove friend"
                  >
                    <UserMinus size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            {/* Received Requests */}
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-300">Received Requests</h2>
              {pendingRequests.length === 0 ? (
                <p className="text-gray-500 text-sm">No pending requests</p>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between bg-gray-800 p-4 rounded-lg"
                    >
                      <span className="font-medium">{request.username || 'Unknown'}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptRequest(request.friendshipId)}
                          className="p-2 text-green-400 hover:bg-green-400/20 rounded-lg transition"
                          title="Accept"
                        >
                          <Check size={20} />
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(request.friendshipId)}
                          className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition"
                          title="Decline"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sent Requests */}
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-300">Sent Requests</h2>
              {sentRequests.length === 0 ? (
                <p className="text-gray-500 text-sm">No sent requests</p>
              ) : (
                <div className="space-y-3">
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between bg-gray-800 p-4 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Send size={16} className="text-gray-500" />
                        <span className="font-medium">{request.username || 'Unknown'}</span>
                      </div>
                      <span className="text-sm text-yellow-500">Pending</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by username..."
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                disabled={searching || searchQuery.trim().length < 2}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition"
              >
                {searching ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <Search size={20} />
                )}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-3">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between bg-gray-800 p-4 rounded-lg"
                  >
                    <span className="font-medium">{result.username || 'Unknown'}</span>
                    {isAlreadyFriendOrPending(result.id) ? (
                      <span className="text-sm text-gray-500">Already connected</span>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(result.id)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-sm"
                      >
                        <UserPlus size={16} />
                        Add Friend
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <p className="text-gray-400 text-center py-4">No users found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
