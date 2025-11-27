import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Globe, Users, Eye, ArrowLeftRight, Loader2, Clock, History, UserPlus, UserMinus, Check, X, Send, Settings, Save, ChevronLeft, RefreshCw, Plus, Minus } from 'lucide-react';
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
import { getUserCollectionPaginated, getCardsByIds, getCollectionTotalValue } from '../services/api';
import { Card } from '../types';
import TradeCreator from './TradeCreator';
import TradeDetail from './TradeDetail';
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

const PAGE_SIZE = 50;

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
  const [isLoadingMoreUserCards, setIsLoadingMoreUserCards] = useState(false);
  const [hasMoreUserCards, setHasMoreUserCards] = useState(false);
  const [userCollectionOffset, setUserCollectionOffset] = useState(0);
  const [userCollectionTotalCount, setUserCollectionTotalCount] = useState(0);
  const [userCollectionTotalValue, setUserCollectionTotalValue] = useState<number>(0);
  const [isLoadingUserTotalValue, setIsLoadingUserTotalValue] = useState(true);
  const [showTradeCreator, setShowTradeCreator] = useState(false);
  const [userCollectionSearch, setUserCollectionSearch] = useState('');
  const [hoveredUserCard, setHoveredUserCard] = useState<Card | null>(null);
  const [selectedUserCard, setSelectedUserCard] = useState<CollectionItem | null>(null);
  const [userCardFaceIndex, setUserCardFaceIndex] = useState<Map<string, number>>(new Map());
  const userCollectionObserverTarget = useRef<HTMLDivElement>(null);

  // Friends state
  const [friendsSubTab, setFriendsSubTab] = useState<FriendsSubTab>('list');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<{ id: string; username: string | null }[]>([]);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [friendListFilter, setFriendListFilter] = useState('');
  const [requestsFilter, setRequestsFilter] = useState('');

  // Trades state
  const [tradesSubTab, setTradesSubTab] = useState<TradesSubTab>('pending');
  const [pendingTrades, setPendingTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [tradeCardDetails, setTradeCardDetails] = useState<Map<string, Card>>(new Map());
  const [processingTradeId, setProcessingTradeId] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

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

  // ============ REALTIME SUBSCRIPTIONS ============
  // Subscribe to trade changes
  useEffect(() => {
    if (!user) return;

    const tradesChannel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        (payload: any) => {
          // Filter for trades involving this user
          const newData = payload.new || payload.old;
          if (newData && (newData.user1_id === user.id || newData.user2_id === user.id)) {
            console.log('Trade change:', payload);
            loadTradesData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
    };
  }, [user]);

  // Subscribe to friendship changes
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
        (payload: any) => {
          // Filter for friendships involving this user
          const newData = payload.new || payload.old;
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

  // Subscribe to profile changes (for visibility updates)
  useEffect(() => {
    if (!user) return;

    const profilesChannel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload: any) => {
          console.log('Profile change:', payload);
          // Reload public users if a profile's visibility changed
          if (payload.new && payload.old && payload.new.collection_visibility !== payload.old.collection_visibility) {
            loadPublicUsers();
          }
          // Reload own profile if it's the current user
          if (payload.new && payload.new.id === user.id) {
            loadProfile();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
    };
  }, [user]);

  // Subscribe to collection changes when viewing someone's collection
  useEffect(() => {
    if (!user || !selectedUser) return;

    const collectionsChannel = supabase
      .channel(`collections-${selectedUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collections',
        },
        (payload: any) => {
          // Filter for the selected user's collections
          const data = payload.new || payload.old;
          if (data && data.user_id === selectedUser.id) {
            console.log('Collection change for viewed user:', payload);
            loadUserCollection(selectedUser.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(collectionsChannel);
    };
  }, [user, selectedUser]);

  // Helper function to check if a card has an actual back face
  const isDoubleFaced = (card: Card) => {
    const backFaceLayouts = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];
    return card.card_faces && card.card_faces.length > 1 && backFaceLayouts.includes(card.layout);
  };

  // Helper function to get the current face index for a card
  const getCurrentFaceIndex = (cardId: string) => {
    return userCardFaceIndex.get(cardId) || 0;
  };

  // Helper function to get the image URI for a card
  const getCardImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.normal || card.card_faces[faceIndex]?.image_uris?.small;
    }
    return card.image_uris?.normal || card.image_uris?.small;
  };

  // Helper function to get the large image URI for hover preview
  const getCardLargeImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.large || card.image_uris?.normal;
  };

  // Toggle card face
  const toggleCardFace = (cardId: string, totalFaces: number) => {
    setUserCardFaceIndex(prev => {
      const newMap = new Map(prev);
      const currentIndex = prev.get(cardId) || 0;
      const nextIndex = (currentIndex + 1) % totalFaces;
      newMap.set(cardId, nextIndex);
      return newMap;
    });
  };

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
    setIsLoadingUserTotalValue(true);
    setSelectedUserCollection([]);
    setUserCollectionOffset(0);

    try {
      // Load paginated collection for display
      const result = await getUserCollectionPaginated(userId, PAGE_SIZE, 0);
      setUserCollectionTotalCount(result.totalCount);
      setHasMoreUserCards(result.hasMore);

      if (result.items.size === 0) {
        setSelectedUserCollection([]);
        setUserCollectionTotalValue(0);
        setIsLoadingUserTotalValue(false);
        return;
      }

      const cardIds = Array.from(result.items.keys());
      const cards = await getCardsByIds(cardIds);
      setSelectedUserCollection(cards.map((card) => ({
        card,
        quantity: result.items.get(card.id) || 0,
      })));
      setUserCollectionOffset(PAGE_SIZE);

      // Calculate total value (lightweight query from database)
      const totalValue = await getCollectionTotalValue(userId);
      setUserCollectionTotalValue(totalValue);
    } catch (error) {
      console.error('Error loading collection:', error);
      setSelectedUserCollection([]);
      setUserCollectionTotalValue(0);
    } finally {
      setLoadingCollection(false);
      setIsLoadingUserTotalValue(false);
    }
  };

  // Load more cards for infinite scroll in user collection view
  const loadMoreUserCards = useCallback(async () => {
    if (!selectedUser || isLoadingMoreUserCards || !hasMoreUserCards) return;

    try {
      setIsLoadingMoreUserCards(true);

      const result = await getUserCollectionPaginated(
        selectedUser.id,
        PAGE_SIZE,
        userCollectionOffset
      );
      setHasMoreUserCards(result.hasMore);

      if (result.items.size === 0) {
        return;
      }

      const cardIds = Array.from(result.items.keys());
      const cards = await getCardsByIds(cardIds);

      const newCards = cards.map(card => ({
        card,
        quantity: result.items.get(card.id) || 0,
      }));

      setSelectedUserCollection(prev => [...prev, ...newCards]);
      setUserCollectionOffset(prev => prev + PAGE_SIZE);
    } catch (error) {
      console.error('Error loading more cards:', error);
    } finally {
      setIsLoadingMoreUserCards(false);
    }
  }, [selectedUser, userCollectionOffset, hasMoreUserCards, isLoadingMoreUserCards]);

  // Intersection Observer for infinite scroll in user collection view
  useEffect(() => {
    if (!selectedUser) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreUserCards && !isLoadingMoreUserCards) {
          loadMoreUserCards();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = userCollectionObserverTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [selectedUser, hasMoreUserCards, isLoadingMoreUserCards, loadMoreUserCards]);

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
  const calculateTradeItemsPrice = (items: TradeItem[] | undefined, ownerId: string): number => {
    const ownerItems = items?.filter((i) => i.owner_id === ownerId) || [];
    return ownerItems.reduce((total, item) => {
      const card = tradeCardDetails.get(item.card_id);
      const price = card?.prices?.usd ? parseFloat(card.prices.usd) : 0;
      return total + (price * item.quantity);
    }, 0);
  };

  const renderTradeItems = (items: TradeItem[] | undefined, ownerId: string, label: string) => {
    const ownerItems = items?.filter((i) => i.owner_id === ownerId) || [];
    const totalPrice = calculateTradeItemsPrice(items, ownerId);

    if (ownerItems.length === 0) {
      return (
        <div>
          <p className="text-gray-400 text-xs mb-1">{label}:</p>
          <p className="text-gray-500 text-xs">Gift</p>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-gray-400 text-xs">{label}:</p>
          <p className="text-green-400 text-xs font-semibold">${totalPrice.toFixed(2)}</p>
        </div>
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
      <div className="relative bg-gray-900 text-white min-h-screen">
        <div className="max-w-7xl mx-auto p-3 sm:p-6">
          {/* Header with Back and Trade buttons */}
          <div className="flex items-center justify-between gap-2 mb-4 md:mb-6">
            <button
              onClick={() => {
                setSelectedUser(null);
                setSelectedUserCollection([]);
                setUserCollectionSearch('');
                setSelectedUserCard(null);
                setHoveredUserCard(null);
              }}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
            >
              <ChevronLeft size={20} />
              <span>Back</span>
            </button>
            <h1 className="text-2xl md:text-3xl font-bold truncate flex-1 text-center">{selectedUser.username}'s Collection</h1>
            <button
              onClick={() => setShowTradeCreator(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm whitespace-nowrap"
            >
              <ArrowLeftRight size={16} />
              <span className="hidden sm:inline">Propose Trade</span>
              <span className="sm:hidden">Trade</span>
            </button>
          </div>

          {/* Search input */}
          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={userCollectionSearch}
                onChange={(e) => setUserCollectionSearch(e.target.value)}
                placeholder="Search cards by name, type, or text..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Collection */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h2 className="text-xl font-semibold">
                {userCollectionSearch
                  ? `Found ${filteredUserCollection.length} card(s)`
                  : `Cards (${selectedUserCollection.length} unique, ${selectedUserCollection.reduce((acc, c) => acc + c.quantity, 0)} total)`
                }
              </h2>
              {/* Collection Value Summary */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
                <div className="text-xs text-gray-400 mb-0.5">
                  {userCollectionSearch ? 'Filtered Value' : 'Total Collection Value'}
                </div>
                <div className="text-lg font-bold text-green-400">
                  {isLoadingUserTotalValue ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : userCollectionSearch ? (
                    // For search results, calculate from filtered collection
                    `$${filteredUserCollection.reduce((total, { card, quantity }) => {
                      const price = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
                      return total + (price * quantity);
                    }, 0).toFixed(2)}`
                  ) : (
                    // For full collection, use pre-calculated total
                    `$${userCollectionTotalValue.toFixed(2)}`
                  )}
                </div>
              </div>
            </div>

            {loadingCollection ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-blue-500" size={48} />
              </div>
            ) : selectedUserCollection.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">Empty collection</p>
              </div>
            ) : filteredUserCollection.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg mb-2">No cards found</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5 sm:gap-2">
                {filteredUserCollection.map(({ card, quantity }) => {
                  const currentFaceIndex = getCurrentFaceIndex(card.id);
                  const isMultiFaced = isDoubleFaced(card);
                  const displayName = isMultiFaced && card.card_faces
                    ? card.card_faces[currentFaceIndex]?.name || card.name
                    : card.name;

                  return (
                    <div
                      key={card.id}
                      className="relative group cursor-pointer"
                      onMouseEnter={() => setHoveredUserCard(card)}
                      onMouseLeave={() => setHoveredUserCard(null)}
                      onClick={() => setSelectedUserCard({ card, quantity })}
                    >
                      {/* Card thumbnail */}
                      <div className="relative rounded-lg overflow-hidden shadow-lg transition-all group-hover:ring-2 group-hover:ring-blue-500">
                        <img
                          src={getCardImageUri(card, currentFaceIndex)}
                          alt={displayName}
                          className="w-full h-auto"
                        />
                        {/* Quantity badge */}
                        <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs sm:text-sm font-bold px-2 py-1 rounded-full shadow-lg">
                          x{quantity}
                        </div>
                        {/* Price badge */}
                        {card.prices?.usd && (
                          <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow-lg">
                            ${card.prices.usd}
                          </div>
                        )}
                        {/* Flip button for double-faced cards */}
                        {isMultiFaced && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCardFace(card.id, card.card_faces!.length);
                            }}
                            className="absolute bottom-1 right-1 bg-purple-600 hover:bg-purple-700 text-white p-1 rounded-full shadow-lg transition-all"
                            title="Flip card"
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                      </div>

                      {/* Card name below thumbnail */}
                      <div className="mt-1 text-xs text-center truncate px-1">
                        {displayName}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Infinite scroll loading indicator */}
            {!userCollectionSearch && isLoadingMoreUserCards && (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-blue-500" size={32} />
              </div>
            )}

            {/* Observer target for infinite scroll */}
            {!userCollectionSearch && hasMoreUserCards && !isLoadingMoreUserCards && (
              <div ref={userCollectionObserverTarget} className="h-20" />
            )}

            {/* End of collection indicator */}
            {!userCollectionSearch && !hasMoreUserCards && selectedUserCollection.length > 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                End of collection • {userCollectionTotalCount} total cards
              </div>
            )}
          </div>
        </div>

        {/* Hover Card Preview - desktop only, only show if no card is selected */}
        {hoveredUserCard && !selectedUserCard && (() => {
          const currentFaceIndex = getCurrentFaceIndex(hoveredUserCard.id);
          const isMultiFaced = isDoubleFaced(hoveredUserCard);
          const currentFace = isMultiFaced && hoveredUserCard.card_faces
            ? hoveredUserCard.card_faces[currentFaceIndex]
            : null;

          const displayName = currentFace?.name || hoveredUserCard.name;
          const displayTypeLine = currentFace?.type_line || hoveredUserCard.type_line;
          const displayOracleText = currentFace?.oracle_text || hoveredUserCard.oracle_text;

          return (
            <div className="hidden lg:block fixed top-1/2 right-8 transform -translate-y-1/2 z-30 pointer-events-none">
              <div className="bg-gray-800 rounded-lg shadow-2xl p-4 max-w-md">
                <div className="relative">
                  <img
                    src={getCardLargeImageUri(hoveredUserCard, currentFaceIndex)}
                    alt={displayName}
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                  {isMultiFaced && (
                    <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                      Face {currentFaceIndex + 1}/{hoveredUserCard.card_faces!.length}
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  <h3 className="text-xl font-bold">{displayName}</h3>
                  <p className="text-sm text-gray-400">{displayTypeLine}</p>
                  {displayOracleText && (
                    <p className="text-sm text-gray-300 border-t border-gray-700 pt-2">
                      {displayOracleText}
                    </p>
                  )}
                  {hoveredUserCard.prices?.usd && (
                    <div className="text-sm text-green-400 font-semibold border-t border-gray-700 pt-2">
                      ${hoveredUserCard.prices.usd}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Card Detail Panel - slides in from right */}
        {selectedUserCard && (() => {
          const currentFaceIndex = getCurrentFaceIndex(selectedUserCard.card.id);
          const isMultiFaced = isDoubleFaced(selectedUserCard.card);
          const currentFace = isMultiFaced && selectedUserCard.card.card_faces
            ? selectedUserCard.card.card_faces[currentFaceIndex]
            : null;

          const displayName = currentFace?.name || selectedUserCard.card.name;
          const displayTypeLine = currentFace?.type_line || selectedUserCard.card.type_line;
          const displayOracleText = currentFace?.oracle_text || selectedUserCard.card.oracle_text;

          return (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-[110] transition-opacity duration-300"
                onClick={() => setSelectedUserCard(null)}
              />

              {/* Sliding Panel */}
              <div className="fixed top-0 right-0 h-full w-full md:w-96 bg-gray-800 shadow-2xl z-[120] overflow-y-auto animate-slide-in-right">
                {/* Close button */}
                <button
                  onClick={() => setSelectedUserCard(null)}
                  className="fixed top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white p-2 md:p-1.5 rounded-full transition-colors z-[130] shadow-lg"
                  aria-label="Close"
                >
                  <X size={24} className="md:w-5 md:h-5" />
                </button>

                <div className="p-4 sm:p-6">
                  {/* Card Image */}
                  <div className="relative mb-4 max-w-sm mx-auto">
                    <img
                      src={getCardLargeImageUri(selectedUserCard.card, currentFaceIndex)}
                      alt={displayName}
                      className="w-full h-auto rounded-lg shadow-lg"
                    />
                    {isMultiFaced && (
                      <>
                        <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                          Face {currentFaceIndex + 1}/{selectedUserCard.card.card_faces!.length}
                        </div>
                        <button
                          onClick={() => toggleCardFace(selectedUserCard.card.id, selectedUserCard.card.card_faces!.length)}
                          className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                          title="Flip card"
                        >
                          <RefreshCw size={20} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Card Info */}
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{displayName}</h2>
                      <p className="text-xs sm:text-sm text-gray-400">{displayTypeLine}</p>
                    </div>

                    {displayOracleText && (
                      <div className="border-t border-gray-700 pt-3">
                        <p className="text-sm text-gray-300">{displayOracleText}</p>
                      </div>
                    )}

                    {selectedUserCard.card.prices?.usd && (
                      <div className="border-t border-gray-700 pt-3">
                        <div className="text-lg text-green-400 font-semibold">
                          ${selectedUserCard.card.prices.usd} each
                        </div>
                        <div className="text-sm text-gray-400">
                          Total value: ${(parseFloat(selectedUserCard.card.prices.usd) * selectedUserCard.quantity).toFixed(2)}
                        </div>
                      </div>
                    )}

                    {/* Quantity Display */}
                    <div className="border-t border-gray-700 pt-3">
                      <h3 className="text-lg font-semibold mb-3">Quantity in Collection</h3>
                      <div className="flex items-center justify-center bg-gray-900 rounded-lg p-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold">{selectedUserCard.quantity}</div>
                          <div className="text-xs text-gray-400">copies</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}

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
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Community</h1>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4 md:mb-6">
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
                  const isUser1 = trade.user1_id === user?.id;
                  const myUserId = user?.id || '';
                  const otherUserId = isUser1 ? trade.user2_id : trade.user1_id;
                  const otherUser = isUser1 ? trade.user2 : trade.user1;
                  const statusColors: Record<string, string> = {
                    accepted: 'text-green-400',
                    declined: 'text-red-400',
                    cancelled: 'text-gray-400',
                    pending: 'text-yellow-400',
                  };

                  // Both users can view details for pending trades
                  const canViewDetails = trade.status === 'pending';

                  return (
                    <div
                      key={trade.id}
                      className={`bg-gray-800 rounded-lg p-3 space-y-2 ${
                        canViewDetails ? 'cursor-pointer hover:bg-gray-750 transition-colors' : ''
                      }`}
                      onClick={() => canViewDetails && setSelectedTrade(trade)}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <ArrowLeftRight size={16} className="text-blue-400 flex-shrink-0" />
                          <span className="text-sm truncate">
                            With: <strong>{otherUser?.username}</strong>
                          </span>
                        </div>
                        <span className={`text-xs capitalize ${statusColors[trade.status]}`}>
                          {trade.status}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {renderTradeItems(trade.items, myUserId, 'You Give')}
                        {renderTradeItems(trade.items, otherUserId, 'You Get')}
                      </div>

                      {canViewDetails && (
                        <p className="text-xs text-blue-400 text-center pt-1">
                          Tap to view details
                        </p>
                      )}

                      {/* Actions - Allow any user to cancel pending trade */}
                      {tradesSubTab === 'pending' && (
                        <div className="flex gap-2 pt-2 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleCancelTrade(trade.id)}
                            disabled={processingTradeId === trade.id}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-700 rounded-lg text-sm"
                          >
                            <X size={14} /> Cancel
                          </button>
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

        {/* Trade Detail Modal */}
        {selectedTrade && (
          <TradeDetail
            trade={selectedTrade}
            onClose={() => setSelectedTrade(null)}
            onAccept={handleAcceptTrade}
            onDecline={handleDeclineTrade}
            onTradeUpdated={() => {
              setSelectedTrade(null);
              loadTradesData();
            }}
          />
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
    </div>
  );
}
