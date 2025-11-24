import React, { useState, useEffect } from 'react';
import { Search, Globe, Users, Eye, ArrowLeftRight, Loader2, Clock, History, UserPlus, UserMinus, Check, X, Send, Settings, Save } from 'lucide-react';
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
  { value: 'public', label: 'Public', description: 'Anyone can view your collection' },
  { value: 'friends', label: 'Friends Only', description: 'Only friends can view' },
  { value: 'private', label: 'Private', description: 'Only you can view' },
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
      message: `Are you sure you want to remove ${friendName} from your friends?`,
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
        toast.success('Trade accepted! Cards have been exchanged.');
      } else {
        toast.error('Failed to execute trade. Check your collection.');
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
      message: 'Are you sure you want to cancel this trade offer?',
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
      return <div className="text-gray-500 text-sm italic">{label}: Nothing (gift)</div>;
    }

    return (
      <div>
        <div className="text-gray-400 text-sm mb-1">{label}:</div>
        <div className="flex flex-wrap gap-2">
          {ownerItems.map((item) => {
            const card = tradeCardDetails.get(item.card_id);
            return (
              <div key={item.id} className="flex items-center gap-2 bg-gray-700 px-2 py-1 rounded text-sm">
                {card?.image_uris?.small && (
                  <img src={card.image_uris.small} alt={card.name} className="w-8 h-11 rounded" />
                )}
                <span>{card?.name || item.card_id}</span>
                {item.quantity > 1 && <span className="text-gray-400">x{item.quantity}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Viewing a user's collection
  if (selectedUser) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <button
                onClick={() => { setSelectedUser(null); setSelectedUserCollection([]); }}
                className="text-blue-400 hover:text-blue-300 mb-2"
              >
                ← Back
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

          {loadingCollection ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-500" size={48} />
            </div>
          ) : selectedUserCollection.length === 0 ? (
            <p className="text-gray-400 text-center py-12">This collection is empty</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2 sm:gap-3">
              {selectedUserCollection.map(({ card, quantity }) => (
                <div key={card.id} className="relative">
                  <div className="rounded-lg overflow-hidden shadow-lg">
                    <img src={card.image_uris?.normal || card.image_uris?.small} alt={card.name} className="w-full h-auto" />
                    <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">x{quantity}</div>
                  </div>
                  <div className="mt-1 text-xs text-center truncate px-1">{card.name}</div>
                </div>
              ))}
            </div>
          )}

          {showTradeCreator && (
            <TradeCreator
              receiverId={selectedUser.id}
              receiverUsername={selectedUser.username || 'Unknown'}
              receiverCollection={selectedUserCollection}
              onClose={() => setShowTradeCreator(false)}
              onTradeCreated={() => {
                setShowTradeCreator(false);
                toast.success('Trade proposal sent!');
              }}
            />
          )}
        </div>
      </div>
    );
  }

  const filteredPublicUsers = publicUsers.filter(
    (u) => !browseSearch || u.username?.toLowerCase().includes(browseSearch.toLowerCase())
  );

  const friendProfiles: UserProfile[] = friends.map((f) => ({
    id: f.id,
    username: f.username,
    collection_visibility: 'friends',
  }));

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Community</h1>

        {/* Main Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'browse' as Tab, label: 'Browse', icon: Globe },
            { id: 'friends' as Tab, label: `Friends (${friends.length})`, icon: Users },
            { id: 'trades' as Tab, label: `Trades (${pendingTrades.length})`, icon: ArrowLeftRight },
            { id: 'profile' as Tab, label: 'Profile', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ============ BROWSE TAB ============ */}
        {activeTab === 'browse' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                placeholder="Search public collections..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 mb-4">
              <button className="px-3 py-1 bg-blue-600 rounded-lg text-sm">Public ({filteredPublicUsers.length})</button>
              <button
                onClick={() => setActiveTab('friends')}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Friends ({friendProfiles.length})
              </button>
            </div>

            {filteredPublicUsers.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No public collections found</p>
            ) : (
              <div className="space-y-3">
                {filteredPublicUsers.map((userProfile) => (
                  <div key={userProfile.id} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Globe size={20} className="text-green-400" />
                      <span className="font-medium">{userProfile.username || 'Unknown'}</span>
                    </div>
                    <button
                      onClick={() => { setSelectedUser(userProfile); loadUserCollection(userProfile.id); }}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
                    >
                      <Eye size={16} />
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ FRIENDS TAB ============ */}
        {activeTab === 'friends' && (
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              {(['list', 'requests', 'search'] as FriendsSubTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFriendsSubTab(tab)}
                  className={`px-3 py-1 rounded-lg text-sm capitalize ${
                    friendsSubTab === tab ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {tab === 'requests' ? `Requests (${pendingRequests.length})` : tab}
                </button>
              ))}
            </div>

            {friendsSubTab === 'list' && (
              <div className="space-y-3">
                {friends.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No friends yet. Search for users to add them!</p>
                ) : (
                  friends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                      <span className="font-medium">{friend.username || 'Unknown'}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setSelectedUser({ id: friend.id, username: friend.username, collection_visibility: 'friends' }); loadUserCollection(friend.id); }}
                          className="p-2 text-blue-400 hover:bg-blue-400/20 rounded-lg transition"
                          title="View collection"
                        >
                          <Eye size={20} />
                        </button>
                        <button
                          onClick={() => handleRemoveFriend(friend.friendshipId, friend.username || 'this user')}
                          className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition"
                          title="Remove friend"
                        >
                          <UserMinus size={20} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {friendsSubTab === 'requests' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-300">Received</h3>
                  {pendingRequests.length === 0 ? (
                    <p className="text-gray-500 text-sm">No pending requests</p>
                  ) : (
                    <div className="space-y-3">
                      {pendingRequests.map((req) => (
                        <div key={req.id} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                          <span className="font-medium">{req.username || 'Unknown'}</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleAcceptRequest(req.friendshipId)} className="p-2 text-green-400 hover:bg-green-400/20 rounded-lg"><Check size={20} /></button>
                            <button onClick={() => handleDeclineRequest(req.friendshipId)} className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg"><X size={20} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-300">Sent</h3>
                  {sentRequests.length === 0 ? (
                    <p className="text-gray-500 text-sm">No sent requests</p>
                  ) : (
                    <div className="space-y-3">
                      {sentRequests.map((req) => (
                        <div key={req.id} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Send size={16} className="text-gray-500" />
                            <span className="font-medium">{req.username || 'Unknown'}</span>
                          </div>
                          <span className="text-sm text-yellow-500">Pending</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {friendsSubTab === 'search' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchFriends()}
                    placeholder="Search by username..."
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSearchFriends}
                    disabled={searchingFriends || friendSearch.trim().length < 2}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg"
                  >
                    {searchingFriends ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                  </button>
                </div>
                {friendSearchResults.length > 0 && (
                  <div className="space-y-3">
                    {friendSearchResults.map((result) => (
                      <div key={result.id} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                        <span className="font-medium">{result.username || 'Unknown'}</span>
                        {isAlreadyFriendOrPending(result.id) ? (
                          <span className="text-sm text-gray-500">Already connected</span>
                        ) : (
                          <button onClick={() => handleSendRequest(result.id)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm">
                            <UserPlus size={16} />
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
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTradesSubTab('pending')}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm ${tradesSubTab === 'pending' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                <Clock size={16} />
                Pending ({pendingTrades.length})
              </button>
              <button
                onClick={() => setTradesSubTab('history')}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm ${tradesSubTab === 'history' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                <History size={16} />
                History
              </button>
            </div>

            {(tradesSubTab === 'pending' ? pendingTrades : tradeHistory).length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                {tradesSubTab === 'pending' ? 'No pending trades' : 'No trade history'}
              </p>
            ) : (
              <div className="space-y-4">
                {(tradesSubTab === 'pending' ? pendingTrades : tradeHistory).map((trade) => {
                  const isSender = trade.sender_id === user?.id;
                  const otherUser = isSender ? trade.receiver : trade.sender;
                  const statusColor = trade.status === 'accepted' ? 'text-green-400' : trade.status === 'declined' ? 'text-red-400' : trade.status === 'cancelled' ? 'text-gray-400' : 'text-yellow-400';

                  return (
                    <div key={trade.id} className="bg-gray-800 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ArrowLeftRight size={18} className="text-blue-400" />
                          <span className="font-medium">{isSender ? `To: ${otherUser?.username}` : `From: ${otherUser?.username}`}</span>
                        </div>
                        <span className={`text-sm capitalize ${statusColor}`}>{trade.status}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderTradeItems(trade.items, trade.sender_id, isSender ? 'You give' : 'They give')}
                        {renderTradeItems(trade.items, trade.receiver_id, isSender ? 'You receive' : 'They receive')}
                      </div>

                      {trade.message && <div className="text-gray-400 text-sm"><span className="text-gray-500">Message:</span> {trade.message}</div>}

                      {tradesSubTab === 'pending' && (
                        <div className="flex gap-2 pt-2 border-t border-gray-700">
                          {isSender ? (
                            <button onClick={() => handleCancelTrade(trade.id)} disabled={processingTradeId === trade.id} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                              <X size={16} />
                              Cancel
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleAcceptTrade(trade.id)} disabled={processingTradeId === trade.id} className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm">
                                {processingTradeId === trade.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                                Accept
                              </button>
                              <button onClick={() => handleDeclineTrade(trade.id)} disabled={processingTradeId === trade.id} className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm">
                                <X size={16} />
                                Decline
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className="text-gray-500 text-xs">{new Date(trade.created_at || '').toLocaleDateString()}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ PROFILE TAB ============ */}
        {activeTab === 'profile' && (
          <div className="max-w-md space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Collection Visibility</label>
              <div className="space-y-2">
                {VISIBILITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCollectionVisibility(option.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      collectionVisibility === option.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-gray-400">{option.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              {savingProfile ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> Save Changes</>}
            </button>
          </div>
        )}
      </div>

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
