import React, { useState, useEffect } from 'react';
import { Search, Globe, Users, Eye, ArrowLeftRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getFriends, Friend } from '../services/friendsService';
import { getUserCollection, getCardsByIds } from '../services/api';
import { Card } from '../types';
import TradeCreator from './TradeCreator';

interface UserProfile {
  id: string;
  username: string | null;
  collection_visibility: 'public' | 'friends' | 'private' | null;
}

interface CollectionItem {
  card: Card;
  quantity: number;
}

type Tab = 'public' | 'friends';

export default function Community() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('public');
  const [searchQuery, setSearchQuery] = useState('');
  const [publicUsers, setPublicUsers] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserCollection, setSelectedUserCollection] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [showTradeCreator, setShowTradeCreator] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [publicData, friendsData] = await Promise.all([
        loadPublicUsers(),
        getFriends(user.id),
      ]);
      setPublicUsers(publicData);
      setFriends(friendsData);
    } catch (error) {
      console.error('Error loading community data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPublicUsers = async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, collection_visibility')
      .eq('collection_visibility', 'public')
      .neq('id', user?.id)
      .order('username');

    if (error) throw error;
    return data || [];
  };

  const loadUserCollection = async (userId: string) => {
    setLoadingCollection(true);
    try {
      const collectionMap = await getUserCollection(userId);

      if (collectionMap.size === 0) {
        setSelectedUserCollection([]);
        return;
      }

      const cardIds = Array.from(collectionMap.keys());
      const cards = await getCardsByIds(cardIds);

      const collectionWithCards = cards.map((card) => ({
        card,
        quantity: collectionMap.get(card.id) || 0,
      }));

      setSelectedUserCollection(collectionWithCards);
    } catch (error) {
      console.error('Error loading collection:', error);
      setSelectedUserCollection([]);
    } finally {
      setLoadingCollection(false);
    }
  };

  const handleViewCollection = async (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    await loadUserCollection(userProfile.id);
  };

  const filteredPublicUsers = publicUsers.filter(
    (u) => !searchQuery || u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const friendProfiles: UserProfile[] = friends.map((f) => ({
    id: f.id,
    username: f.username,
    collection_visibility: 'friends' as const,
  }));

  const filteredFriends = friendProfiles.filter(
    (f) => !searchQuery || f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // If viewing a user's collection
  if (selectedUser) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setSelectedUserCollection([]);
                }}
                className="text-blue-400 hover:text-blue-300 mb-2"
              >
                ← Back to Community
              </button>
              <h1 className="text-3xl font-bold">{selectedUser.username}'s Collection</h1>
            </div>
            <button
              onClick={() => setShowTradeCreator(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              <ArrowLeftRight size={20} />
              Propose Trade
            </button>
          </div>

          {/* Collection Grid */}
          {loadingCollection ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={48} />
            </div>
          ) : selectedUserCollection.length === 0 ? (
            <p className="text-gray-400 text-center py-12">This collection is empty</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2 sm:gap-3">
              {selectedUserCollection.map(({ card, quantity }) => (
                <div key={card.id} className="relative group">
                  <div className="rounded-lg overflow-hidden shadow-lg">
                    <img
                      src={card.image_uris?.normal || card.image_uris?.small}
                      alt={card.name}
                      className="w-full h-auto"
                    />
                    <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                      x{quantity}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-center truncate px-1">{card.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* Trade Creator Modal */}
          {showTradeCreator && (
            <TradeCreator
              receiverId={selectedUser.id}
              receiverUsername={selectedUser.username || 'Unknown'}
              receiverCollection={selectedUserCollection}
              onClose={() => setShowTradeCreator(false)}
              onTradeCreated={() => {
                setShowTradeCreator(false);
                alert('Trade proposal sent!');
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Community</h1>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('public')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'public'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Globe size={18} />
            Public Collections ({filteredPublicUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeTab === 'friends'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Users size={18} />
            Friends ({filteredFriends.length})
          </button>
        </div>

        {/* User List */}
        <div className="space-y-3">
          {activeTab === 'public' && (
            <>
              {filteredPublicUsers.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  No public collections found
                </p>
              ) : (
                filteredPublicUsers.map((userProfile) => (
                  <div
                    key={userProfile.id}
                    className="flex items-center justify-between bg-gray-800 p-4 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={20} className="text-green-400" />
                      <span className="font-medium">{userProfile.username || 'Unknown'}</span>
                    </div>
                    <button
                      onClick={() => handleViewCollection(userProfile)}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
                    >
                      <Eye size={16} />
                      View Collection
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'friends' && (
            <>
              {filteredFriends.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  {friends.length === 0
                    ? 'Add friends to see their collections'
                    : 'No friends match your search'}
                </p>
              ) : (
                filteredFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between bg-gray-800 p-4 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Users size={20} className="text-blue-400" />
                      <span className="font-medium">{friend.username || 'Unknown'}</span>
                    </div>
                    <button
                      onClick={() => handleViewCollection(friend)}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
                    >
                      <Eye size={16} />
                      View Collection
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
