import { useState, useEffect, useRef, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ArrowLeftRight, Loader2, ChevronLeft, RefreshCw } from 'lucide-react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { isDoubleFaced, getCardImageUri } from '../../utils/cardFaces';
import WishlistButton from '../WishlistButton';
import HoverCardPreview from '../card/HoverCardPreview';
import UserCardDetailPanel from './UserCardDetailPanel';
import { supabase } from '../../lib/supabase';
import { getUserCollectionPaginated, getCardsByIds, getCollectionTotalValue } from '../../services/api';
import { Card } from '../../types';
import { profileDisplayName } from '../../utils/profileName';
import TradeCreator from '../TradeCreator';

export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  handle: string | null;
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

/** One page of a viewed user's collection. Arrays/objects only — TanStack
 * Query structural sharing does not preserve Map/Set. */
interface UserCollectionPage {
  items: CollectionItem[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
}

const PAGE_SIZE = 50;

interface UserCollectionViewerProps {
  selectedUser: UserProfile;
  onBack: () => void;
  getCurrentFaceIndex: (cardId: string) => number;
  toggleCardFace: (cardId: string, totalFaces: number) => void;
}

/**
 * Full-screen view of another user's collection: paginated grid with infinite
 * scroll, live value, card detail panel and the trade-proposal entry point.
 * Owns the userCollection/collectionValue queries and the realtime channel
 * scoped to the viewed user.
 */
export default function UserCollectionViewer({
  selectedUser,
  onBack,
  getCurrentFaceIndex,
  toggleCardFace,
}: UserCollectionViewerProps) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showTradeCreator, setShowTradeCreator] = useState(false);
  const [userCollectionSearch, setUserCollectionSearch] = useState('');
  const [hoveredUserCard, setHoveredUserCard] = useState<Card | null>(null);
  const [selectedUserCard, setSelectedUserCard] = useState<CollectionItem | null>(null);
  const userCollectionObserverTarget = useRef<HTMLDivElement>(null);

  // Selected user's collection, paginated for infinite scroll.
  const selectedUserId = selectedUser.id;
  const {
    data: collectionPages,
    isLoading: loadingCollection,
    hasNextPage: hasMoreUserCards,
    isFetchingNextPage: isLoadingMoreUserCards,
    fetchNextPage: fetchMoreUserCards,
  } = useInfiniteQuery({
    queryKey: ['userCollection', selectedUserId],
    enabled: !!selectedUserId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<UserCollectionPage> => {
      const result = await getUserCollectionPaginated(selectedUserId, PAGE_SIZE, pageParam);

      let items: CollectionItem[] = [];
      if (result.items.size > 0) {
        const cardIds = Array.from(result.items.keys());
        const cards = await getCardsByIds(cardIds);
        items = cards.map((card) => ({
          card,
          quantity: result.items.get(card.id) || 0,
        }));
      }

      return {
        items,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        nextOffset: pageParam + PAGE_SIZE,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
  });

  // Flatten pages, deduplicating by card id (a card can reappear across pages
  // when the underlying collection shifts between fetches).
  const selectedUserCollection = useMemo(() => {
    const seen = new Set<string>();
    const items: CollectionItem[] = [];
    for (const page of collectionPages?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.card.id)) continue;
        seen.add(item.card.id);
        items.push(item);
      }
    }
    return items;
  }, [collectionPages]);

  const userCollectionTotalCount = collectionPages?.pages[0]?.totalCount ?? 0;

  // Pre-calculated total value of the selected user's collection.
  const { data: totalValueData, isLoading: isLoadingUserTotalValue } = useQuery({
    queryKey: ['collectionValue', selectedUserId],
    enabled: !!selectedUserId,
    queryFn: () => getCollectionTotalValue(selectedUserId),
  });
  const userCollectionTotalValue = totalValueData ?? 0;

  // One channel scoped to the currently viewed user: their collection rows and
  // their profile's pre-calculated total value. Both share the same lifetime.
  useEffect(() => {
    if (!user) return;

    const selectedUserChannel = supabase
      .channel(`community-user-${selectedUser.id}`)
      // Collection changes when viewing someone's collection.
      // Auto-price trigger is disabled, so no more infinite loops!
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
            // Refetch on any change (INSERT/UPDATE/DELETE)
            queryClient.invalidateQueries({ queryKey: ['userCollection', selectedUser.id] });
            queryClient.invalidateQueries({ queryKey: ['collectionValue', selectedUser.id] });
          }
        }
      )
      // Live updates for the viewed user's collection total value.
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
            queryClient.setQueryData(['collectionValue', selectedUser.id], newProfile.collection_total_value);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(selectedUserChannel);
    };
  }, [user, selectedUser, queryClient]);

  // Intersection Observer for infinite scroll in user collection view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreUserCards && !isLoadingMoreUserCards) {
          fetchMoreUserCards();
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
  }, [hasMoreUserCards, isLoadingMoreUserCards, fetchMoreUserCards]);

  const filteredUserCollection = selectedUserCollection.filter(({ card }) =>
    card.name.toLowerCase().includes(userCollectionSearch.toLowerCase())
  );

  return (
    <div className="relative bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto p-3 sm:p-6">
        {/* Header with Back and Trade buttons */}
        <div className="flex items-center justify-between gap-2 mb-4 md:mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
          >
            <ChevronLeft size={20} />
            <span>Back</span>
          </button>
          <h1 className="text-2xl md:text-3xl font-bold truncate flex-1 text-center">{profileDisplayName(selectedUser)}'s Collection</h1>
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
      {hoveredUserCard && !selectedUserCard && (
        <HoverCardPreview
          card={hoveredUserCard}
          hoverSource={null}
          getCurrentFaceIndex={getCurrentFaceIndex}
        />
      )}

      {/* Card Detail Panel - slides in from right */}
      {selectedUserCard && (
        <UserCardDetailPanel
          card={selectedUserCard.card}
          quantity={selectedUserCard.quantity}
          onClose={() => setSelectedUserCard(null)}
          getCurrentFaceIndex={getCurrentFaceIndex}
          toggleCardFace={toggleCardFace}
        />
      )}

      {showTradeCreator && (
        <TradeCreator
          receiverId={selectedUser.id}
          receiverUsername={profileDisplayName(selectedUser)}
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
