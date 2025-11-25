import React, { useState, useEffect } from 'react';
import { Search, Globe, Users, Eye, ArrowLeftRight, Loader2, Clock, History, UserPlus, UserMinus, Check, X, Send, Settings, Save, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
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
import {
  getTrades,
  getTradeHistory,
  acceptTrade,
  declineTrade,
  cancelTrade,
  Trade,
  TradeItem,
} from '../services/tradesService';
import { getUserCollection, getCardsByIds } from '../services/api';
import { Card } from '../types';
import TradeCreator from './TradeCreator';
import ConfirmModal from './ConfirmModal';

interface UserProfile {
  id: string;
  username: string | null;
  collection_visibility: 'public' | 'friends' | 'private' | null;
}

interface CollectionItem {
  card: Card;
  quantity: number;
}

type Tab = 'browse' | 'friends' | 'trades' | 'profile';
type FriendsSubTab = 'list' | 'requests' | 'search';
type TradesSubTab = 'pending' | 'history';

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', description: 'Anyone can view' },
  { value: 'friends', label: 'Friends', description: 'Friends only' },
  { value: 'private', label: 'Private', description: 'Only you' },
] as const;

export default function Community() {
  const { user } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [loading, setLoading] = useState(true);

  // Browse state
  const [browseSearch, setBrowseSearch] = useState('');
  const [publicUsers, setPublicUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserCollection, setSelectedUserCollection] = useState<CollectionItem[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [showTradeCreator, setShowTradeCreator] = useState(false);
  const [userCollectionSearch, setUserCollectionSearch] = useState('');

  // Friends state
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('list');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<{ id: string; username: string | null }[]>([]);
  const [searchingFriends, setSearchingFriends] = useState(false);

  // Trades state
  const [tradesSubTab, setTradesSubTab] = useState<TradesSubTab>('pending');
  const [pendingTrades, setPendingTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [tradeCardDetails, setTradeCardDetails] = useState<Map<string, Card>>(new Map());
  const [processingTradeId, setProcessingTradeId] = useState<string | null>(null);

  // Profile state
  const [username, setUsername] = useState('');
  const [collectionVisibility, setCollectionVisibility] = useState<'public' | 'friends' | 'private'>('private');
  const [savingProfile, setSavingProfile] = useState(false);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info' | 'success';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, variant: 'danger' });

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user]);

  const loadAllData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await Promise.all([
        loadPublicUsers(),
        loadFriendsData(),
        loadTradesData(),
        loadProfile(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============ BROWSE FUNCTIONS ============
  const loadPublicUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, collection_visibility')
      .eq('collection_visibility', 'public')
      .neq('id', user?.id)
      .order('username');

    if (!error && data) {
      setPublicUsers(data);
    }
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
      setSelectedUserCollection(cards.map((card) => ({
        card,
        quantity: collectionMap.get(card.id) || 0,
      })));
    } catch (error) {
      console.error('Error loading collection:', error);
      setSelectedUserCollection([]);
    } finally {
      setLoadingCollection(false);
    }
  };

  // ============ FRIENDS FUNCTIONS ============
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
    } catch (error) {
      toast.error('Failed to send friend request');
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    try {
      await acceptFriendRequest(friendshipId);
      await loadFriendsData();
      toast.success('Friend request accepted!');
    } catch (error) {
      toast.error('Failed to accept request');
    }
  };

  const handleDeclineRequest = async (friendshipId: string) => {
    try {
      await declineFriendRequest(friendshipId);
      await loadFriendsData();
      toast.info('Friend request declined');
    } catch (error) {
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
        } catch (error) {
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

  // ============ TRADES FUNCTIONS ============
  const loadTradesData = async () => {
    if (!user) return;
    const [pending, history] = await Promise.all([
      getTrades(user.id).then((trades) => trades.filter((t) => t.status === 'pending')),
      getTradeHistory(user.id),
    ]);

    const allCardIds = new Set<string>();
    [...pending, ...history].forEach((trade) => {
      trade.items?.forEach((item) => allCardIds.add(item.card_id));
    });

    if (allCardIds.size > 0) {
      const cards = await getCardsByIds(Array.from(allCardIds));
      const cardMap = new Map<string, Card>();
      cards.forEach((card) => cardMap.set(card.id, card));
      setTradeCardDetails(cardMap);
    }

    setPendingTrades(pending);
    setTradeHistory(history);
  };

  const handleAcceptTrade = async (tradeId: string) => {
    setProcessingTradeId(tradeId);
    try {
      const success = await acceptTrade(tradeId);
      if (success) {
        await loadTradesData();
        toast.success('Trade accepted! Cards exchanged.');
      } else {
        toast.error('Failed. Check your collection.');
      }
    } catch (error) {
      toast.error('Error accepting trade');
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleDeclineTrade = async (tradeId: string) => {
    setProcessingTradeId(tradeId);
    try {
      await declineTrade(tradeId);
      await loadTradesData();
      toast.info('Trade declined');
    } catch (error) {
      toast.error('Error declining trade');
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleCancelTrade = (tradeId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Trade',
      message: 'Cancel this trade offer?',
      variant: 'warning',
      onConfirm: async () => {
        setProcessingTradeId(tradeId);
        try {
          await cancelTrade(tradeId);
          await loadTradesData();
          toast.info('Trade cancelled');
        } catch (error) {
          toast.error('Error cancelling trade');
        } finally {
          setProcessingTradeId(null);
        }
      },
    });
  };

  // ============ PROFILE FUNCTIONS ============
  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('username, collection_visibility')
      .eq('id', user.id)
      .single();

    if (data) {
      setUsername(data.username || '');
      setCollectionVisibility(data.collection_visibility || 'private');
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username,
          collection_visibility: collectionVisibility,
          updated_at: new Date(),
        });

      if (error) throw error;
      toast.success('Profile updated!');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  // ============ RENDER HELPERS ============
  const renderTradeItems = (items: TradeItem[] | undefined, ownerId: string, label: string) => {
    const ownerItems = items?.filter((i) => i.owner_id === ownerId) || [];
    if (ownerItems.length === 0) {
      return <p className="text-gray-500 text-xs">{label}: Gift</p>;
    }

    return (
      <div>
        <p className="text-gray-400 text-xs mb-1">{label}:</p>
        <div className="flex flex-wrap gap-1">
          {ownerItems.map((item) => {
            const card = tradeCardDetails.get(item.card_id);
            return (
              <div key={item.id} className="flex items-center gap-1 bg-gray-700 px-2 py-0.5 rounded text-xs">
                <span className="truncate max-w-[100px]">{card?.name || 'Card'}</span>
                {item.quantity > 1 && <span className="text-gray-400">x{item.quantity}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
    const filteredUserCollection = selectedUserCollection.filter(({ card }) =>
      card.name.toLowerCase().includes(userCollectionSearch.toLowerCase())
    );

    return (
      <div className="bg-gray-900 text-white min-h-screen">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 p-3 z-10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <button
              onClick={() => { setSelectedUser(null); setSelectedUserCollection([]); setUserCollectionSearch(''); }}
              className="flex items-center gap-1 text-blue-400 text-sm min-w-0"
            >
              <ChevronLeft size={20} />
              <span className="hidden sm:inline">Back</span>
            </button>
            <h1 className="text-lg font-bold truncate flex-1 text-center">{selectedUser.username}</h1>
            <button
              onClick={() => setShowTradeCreator(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm whitespace-nowrap"
            >
              <ArrowLeftRight size={16} />
              <span className="hidden sm:inline">Trade</span>
            </button>
          </div>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={userCollectionSearch}
              onChange={(e) => setUserCollectionSearch(e.target.value)}
              placeholder="Search cards..."
              className="w-full pl-9 pr-8 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {userCollectionSearch && (
              <button
                onClick={() => setUserCollectionSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Collection Grid */}
        <div className="p-3">
          {loadingCollection ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          ) : selectedUserCollection.length === 0 ? (
            <p className="text-gray-400 text-center py-12">Empty collection</p>
          ) : filteredUserCollection.length === 0 ? (
            <p className="text-gray-400 text-center py-12">No cards match "{userCollectionSearch}"</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {filteredUserCollection.map(({ card, quantity }) => (
                <div key={card.id} className="relative">
                  <img
                    src={card.image_uris?.small || card.image_uris?.normal}
                    alt={card.name}
                    className="w-full h-auto rounded-lg"
                  />
                  <span className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    x{quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showTradeCreator && (
          <TradeCreator
            receiverId={selectedUser.id}
            receiverUsername={selectedUser.username || 'Unknown'}
            receiverCollection={selectedUserCollection}
            onClose={() => setShowTradeCreator(false)}
            onTradeCreated={() => {
              setShowTradeCreator(false);
              loadTradesData();
              toast.success('Trade proposal sent!');
            }}
          />
        )}
      </div>
    );
  }

  const filteredPublicUsers = publicUsers.filter(
    (u) => !browseSearch || u.username?.toLowerCase().includes(browseSearch.toLowerCase())
  );

  // ============ MAIN VIEW ============
  return (
    <div className="relative bg-gray-900 text-white md:min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 p-3 z-10">
        <h1 className="text-xl font-bold mb-3">Community</h1>

        {/* Tabs - Scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
          {[
            { id: 'browse' as Tab, label: 'Browse', icon: Globe },
            { id: 'friends' as Tab, label: `Friends`, count: friends.length, icon: Users },
            { id: 'trades' as Tab, label: `Trades`, count: pendingTrades.length, icon: ArrowLeftRight },
            { id: 'profile' as Tab, label: 'Profile', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 active:bg-gray-700'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
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
                    onClick={() => { setSelectedUser(userProfile); loadUserCollection(userProfile.id); }}
                    className="w-full flex items-center justify-between bg-gray-800 p-3 rounded-lg active:bg-gray-700 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe size={18} className="text-green-400 flex-shrink-0" />
                      <span className="font-medium truncate">{userProfile.username || 'Unknown'}</span>
                    </div>
                    <Eye size={18} className="text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Friends shortcut */}
            {friends.length > 0 && (
              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">Your friends</p>
                <div className="space-y-2">
                  {friends.slice(0, 3).map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => {
                        setSelectedUser({ id: friend.id, username: friend.username, collection_visibility: 'friends' });
                        loadUserCollection(friend.id);
                      }}
                      className="w-full flex items-center justify-between bg-gray-800 p-3 rounded-lg active:bg-gray-700 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users size={18} className="text-blue-400 flex-shrink-0" />
                        <span className="font-medium truncate">{friend.username || 'Unknown'}</span>
                      </div>
                      <Eye size={18} className="text-gray-400 flex-shrink-0" />
                    </button>
                  ))}
                  {friends.length > 3 && (
                    <button
                      onClick={() => setActiveTab('friends')}
                      className="w-full text-center text-blue-400 text-sm py-2"
                    >
                      View all {friends.length} friends
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ FRIENDS TAB ============ */}
        {activeTab === 'friends' && (
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
              friends.length === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">No friends yet</p>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                      <span className="font-medium truncate">{friend.username || 'Unknown'}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setSelectedUser({ id: friend.id, username: friend.username, collection_visibility: 'friends' });
                            loadUserCollection(friend.id);
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
              )
            )}

            {/* Requests */}
            {friendsSubTab === 'requests' && (
              <div className="space-y-4">
                {pendingRequests.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Received</p>
                    <div className="space-y-2">
                      {pendingRequests.map((req) => (
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

                {sentRequests.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Sent</p>
                    <div className="space-y-2">
                      {sentRequests.map((req) => (
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
          </div>
        )}

        {/* ============ TRADES TAB ============ */}
        {activeTab === 'trades' && (
          <div className="space-y-3">
            {/* Sub tabs */}
            <div className="flex gap-1">
              <button
                onClick={() => setTradesSubTab('pending')}
                className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
                  tradesSubTab === 'pending' ? 'bg-blue-600' : 'bg-gray-800'
                }`}
              >
                <Clock size={14} />
                Pending ({pendingTrades.length})
              </button>
              <button
                onClick={() => setTradesSubTab('history')}
                className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
                  tradesSubTab === 'history' ? 'bg-blue-600' : 'bg-gray-800'
                }`}
              >
                <History size={14} />
                History
              </button>
            </div>

            {/* Trades List */}
            {(tradesSubTab === 'pending' ? pendingTrades : tradeHistory).length === 0 ? (
              <p className="text-gray-400 text-center py-8 text-sm">
                {tradesSubTab === 'pending' ? 'No pending trades' : 'No history'}
              </p>
            ) : (
              <div className="space-y-3">
                {(tradesSubTab === 'pending' ? pendingTrades : tradeHistory).map((trade) => {
                  const isSender = trade.sender_id === user?.id;
                  const otherUser = isSender ? trade.receiver : trade.sender;
                  const statusColors: Record<string, string> = {
                    accepted: 'text-green-400',
                    declined: 'text-red-400',
                    cancelled: 'text-gray-400',
                    pending: 'text-yellow-400',
                  };

                  return (
                    <div key={trade.id} className="bg-gray-800 rounded-lg p-3 space-y-2">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <ArrowLeftRight size={16} className="text-blue-400 flex-shrink-0" />
                          <span className="text-sm truncate">
                            {isSender ? 'To' : 'From'}: <strong>{otherUser?.username}</strong>
                          </span>
                        </div>
                        <span className={`text-xs capitalize ${statusColors[trade.status]}`}>
                          {trade.status}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {renderTradeItems(trade.items, trade.sender_id, isSender ? 'Give' : 'Receive')}
                        {renderTradeItems(trade.items, trade.receiver_id, isSender ? 'Get' : 'Send')}
                      </div>

                      {/* Actions */}
                      {tradesSubTab === 'pending' && (
                        <div className="flex gap-2 pt-2 border-t border-gray-700">
                          {isSender ? (
                            <button
                              onClick={() => handleCancelTrade(trade.id)}
                              disabled={processingTradeId === trade.id}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-700 rounded-lg text-sm"
                            >
                              <X size={14} /> Cancel
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleAcceptTrade(trade.id)}
                                disabled={processingTradeId === trade.id}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 rounded-lg text-sm"
                              >
                                {processingTradeId === trade.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                                Accept
                              </button>
                              <button
                                onClick={() => handleDeclineTrade(trade.id)}
                                disabled={processingTradeId === trade.id}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 rounded-lg text-sm"
                              >
                                <X size={14} /> Decline
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ PROFILE TAB ============ */}
        {activeTab === 'profile' && (
          <div className="space-y-4 max-w-md">
            {/* Username */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                placeholder="Your username"
              />
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Collection Visibility</label>
              <div className="grid grid-cols-3 gap-2">
                {VISIBILITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCollectionVisibility(option.value)}
                    className={`p-3 rounded-lg border-2 transition text-center ${
                      collectionVisibility === option.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 bg-gray-800 active:border-gray-600'
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-3 rounded-lg font-medium"
            >
              {savingProfile ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> Save</>}
            </button>
          </div>
        )}
      </div>

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
