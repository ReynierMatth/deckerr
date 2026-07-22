import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Globe, Users, Eye, ArrowLeftRight, Loader2, X, Settings, ChevronLeft, RefreshCw, Sparkles } from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isDoubleFaced, getCardImageUri } from '../utils/cardFaces';
import WishlistButton from './WishlistButton';
import { useCardFaces } from '../hooks/useCardFaces';
import { supabase } from '../lib/supabase';
import ProfileSettings from './community/ProfileSettings';
import FriendsTab from './community/FriendsTab';
import TradesTab from './community/TradesTab';
import TradeSuggestions from './community/TradeSuggestions';
import { getFriends } from '../services/friendsService';
import { getPendingTrades } from '../services/tradesService';
import { getUserCollectionPaginated, getCardsByIds, getCollectionTotalValue } from '../services/api';
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

interface ProfileRealtimeRow {
  id: string;
  collection_visibility: string | null;
  collection_total_value: number;
}

interface CollectionRealtimeRow {
  user_id: string;
}

interface FriendshipRealtimeRow {
  requester_id: string;
  addressee_id: string;
}

interface TradeRealtimeRow {
  user1_id: string;
  user2_id: string;
}

type Tab = 'browse' | 'friends' | 'trades' | 'suggestions' | 'profile';

const PAGE_SIZE = 50;

export default function Community() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
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
  const userCollectionObserverTarget = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user]);

  // ============ REALTIME SUBSCRIPTIONS ============
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
        (payload: RealtimePostgresChangesPayload<ProfileRealtimeRow>) => {
          console.log('Profile change:', payload);
          const newProfile = payload.new as Partial<ProfileRealtimeRow>;
          const oldProfile = payload.old as Partial<ProfileRealtimeRow>;
          // Reload public users if a profile's visibility changed
          if (newProfile && oldProfile && newProfile.collection_visibility !== oldProfile.collection_visibility) {
            loadPublicUsers();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
    };
  }, [user]);

  // Keep the Friends tab badge + Browse shortcut fresh even when the tab is closed.
  useEffect(() => {
    if (!user) return;

    const friendshipsChannel = supabase
      .channel('community-friendships-changes')
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
      .subscribe();

    return () => {
      supabase.removeChannel(friendshipsChannel);
    };
  }, [user, queryClient]);

  // Keep the Trades tab badge fresh even when the tab is closed.
  useEffect(() => {
    if (!user) return;

    const tradesChannel = supabase
      .channel('community-trades-changes')
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
      supabase.removeChannel(tradesChannel);
    };
  }, [user, queryClient]);

  // Subscribe to collection changes when viewing someone's collection
  // Auto-price trigger is disabled, so no more infinite loops!
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
        (payload: RealtimePostgresChangesPayload<CollectionRealtimeRow>) => {
          const data = (payload.new || payload.old) as Partial<CollectionRealtimeRow>;
          if (data && data.user_id === selectedUser.id) {
            console.log('Collection change for viewed user:', payload.eventType);
            // Reload on any change (INSERT/UPDATE/DELETE)
            // No more infinite loops since auto-price trigger is disabled
            loadUserCollection(selectedUser.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(collectionsChannel);
    };
  }, [user, selectedUser]);

  // Helper function to get the large image URI for hover preview
  const getCardLargeImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.large || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.large || card.image_uris?.normal;
  };

  const loadAllData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await Promise.all([
        loadPublicUsers(),
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

      // Deduplicate: only add cards that aren't already in the collection
      setSelectedUserCollection(prev => {
        const existingIds = new Set(prev.map(item => item.card.id));
        const uniqueNewCards = newCards.filter(item => !existingIds.has(item.card.id));
        return [...prev, ...uniqueNewCards];
      });

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

  // Subscribe to realtime updates for selected user's collection total value
  useEffect(() => {
    if (!selectedUser) return;

    const userProfileChannel = supabase
      .channel(`user-profile-value-${selectedUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${selectedUser.id}`,
        },
        (payload: RealtimePostgresChangesPayload<ProfileRealtimeRow>) => {
          const newProfile = payload.new as Partial<ProfileRealtimeRow>;
          if (newProfile?.collection_total_value !== undefined) {
            console.log(`User ${selectedUser.username}'s collection total value updated:`, newProfile.collection_total_value);
            setUserCollectionTotalValue(newProfile.collection_total_value);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userProfileChannel);
    };
  }, [selectedUser]);

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
                        <WishlistButton cardId={card.id} className="absolute top-1 left-1" size={16} />
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
            { id: 'friends' as Tab, label: `Friends`, count: friendsList.length, icon: Users },
            { id: 'trades' as Tab, label: `Trades`, count: pendingTrades.length, icon: ArrowLeftRight },
            { id: 'suggestions' as Tab, label: 'Suggestions', icon: Sparkles },
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
            {friendsList.length > 0 && (
              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">Your friends</p>
                <div className="space-y-2">
                  {friendsList.slice(0, 3).map((friend) => (
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
          <FriendsTab
            onViewCollection={(u) => { setSelectedUser(u); loadUserCollection(u.id); }}
          />
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
