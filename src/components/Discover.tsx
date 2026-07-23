import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Compass, Layers, Search as SearchIcon, User as UserIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCardsByIds } from '../services/api';
import { getCardArtCrop } from '../utils/cardFaces';
import { useAuth } from '../contexts/AuthContext';

const PAGE_SIZE = 20;

const FORMATS = ['standard', 'modern', 'pioneer', 'commander', 'brawl', 'oathbreaker', 'legacy', 'vintage', 'pauper'] as const;

interface DiscoverDeck {
  id: string;
  name: string;
  format: string;
  cardCount: number;
  userId: string | null;
  ownerUsername: string | null;
  coverArt: string | null;
}

interface DiscoverPage {
  decks: DiscoverDeck[];
  hasMore: boolean;
  nextOffset: number;
}

/**
 * One page of public decks, newest first. Search and format filtering happen
 * SERVER-SIDE (ilike / eq on the query) — never on the client — so pagination
 * stays correct whatever the filter.
 */
const fetchDiscoverPage = async (
  offset: number,
  search: string,
  format: string
): Promise<DiscoverPage> => {
  let query = supabase
    .from('decks')
    .select('id, name, format, card_count, cover_card_id, user_id', { count: 'exact' })
    .eq('is_public', true);
  if (search) query = query.ilike('name', `%${search}%`);
  if (format) query = query.eq('format', format);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;

  const rows = data ?? [];
  const coverIds = [
    ...new Set(
      rows
        .map((row) => row.cover_card_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const userIds = [
    ...new Set(
      rows.map((row) => row.user_id as string | null).filter((id): id is string => Boolean(id))
    ),
  ];

  // Batch the page's cover art (one Scryfall call) and owner usernames (one
  // profiles query) instead of per-deck requests.
  const [coverCards, profilesResult] = await Promise.all([
    coverIds.length > 0 ? getCardsByIds(coverIds) : Promise.resolve([]),
    userIds.length > 0
      ? supabase.from('profiles').select('id, username').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw profilesResult.error;

  const artByCardId = new Map(coverCards.map((card) => [card.id, getCardArtCrop(card) ?? null]));
  const usernameById = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id as string,
      (profile.username as string | null) ?? null,
    ])
  );

  const decks: DiscoverDeck[] = rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    format: row.format as string,
    cardCount: (row.card_count as number | null) ?? 0,
    userId: (row.user_id as string | null) ?? null,
    ownerUsername: row.user_id ? usernameById.get(row.user_id as string) ?? null : null,
    coverArt: row.cover_card_id ? artByCardId.get(row.cover_card_id as string) ?? null : null,
  }));

  return {
    decks,
    hasMore: offset + PAGE_SIZE < (count ?? 0),
    nextOffset: offset + PAGE_SIZE,
  };
};

export default function Discover() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  // Trails searchQuery by ~300ms so the server-filtered pages aren't refetched
  // on every keystroke (same pattern as Collection).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState('');
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['discoverDecks', debouncedSearch, formatFilter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchDiscoverPage(pageParam, debouncedSearch, formatFilter),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
  });

  // Infinite scroll: load the next page when the sentinel becomes visible.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);
    return () => {
      if (currentTarget) observer.unobserve(currentTarget);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten pages, deduplicating by deck id (a deck can reappear across pages
  // when new public decks land between fetches).
  const seen = new Set<string>();
  const decks: DiscoverDeck[] = [];
  for (const page of data?.pages ?? []) {
    for (const deck of page.decks) {
      if (seen.has(deck.id)) continue;
      seen.add(deck.id);
      decks.push(deck);
    }
  }

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 animate-fade-in md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 flex items-center gap-2 animate-slide-in-left">
          <Compass size={28} className="text-blue-500" />
          Discover
        </h1>

        {/* Filters: server-side name search + format */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <SearchIcon
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search public decks..."
              className="w-full min-h-[44px] pl-10 pr-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            aria-label="Filter by format"
            className="min-h-[44px] px-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 capitalize sm:w-44"
          >
            <option value="">All formats</option>
            {FORMATS.map((format) => (
              <option key={format} value={format} className="capitalize">
                {format}
              </option>
            ))}
          </select>
        </div>

        {isPending && (
          <div className="flex items-center justify-center h-64">
            <div className="loading-spinner h-16 w-16"></div>
          </div>
        )}

        {isError && (
          <p className="mt-6 text-center text-gray-400">
            Couldn't load public decks. Please try again.
          </p>
        )}

        {!isPending && !isError && decks.length === 0 && (
          <p className="mt-6 text-center text-gray-400">
            No public decks found{debouncedSearch || formatFilter ? ' for these filters' : ' yet'}.
          </p>
        )}

        {/* Single column rows on mobile, grid at sm+ */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {decks.map((deck) => (
            <button
              key={deck.id}
              onClick={() => navigate({ to: '/decks/$deckId/view', params: { deckId: deck.id } })}
              className="flex bg-gray-800 rounded-lg overflow-hidden text-left min-h-[64px] hover:bg-gray-700 transition-colors"
            >
              {/* Cover art, CardRow-style: art crop on the left */}
              <div className="relative w-16 flex-shrink-0 self-stretch">
                {deck.coverArt ? (
                  <img
                    src={deck.coverArt}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
                    <Layers size={20} className="text-gray-500" />
                  </div>
                )}
              </div>

              <div className="flex-1 p-2.5 flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-bold text-sm truncate">{deck.name}</h3>
                  {user && deck.userId === user.id && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-blue-600/30 border border-blue-500/40 text-blue-200 rounded">
                      Yours
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
                  <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 capitalize">
                    {deck.format}
                  </span>
                  <span>{deck.cardCount} cards</span>
                  {deck.ownerUsername && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <UserIcon size={12} className="flex-shrink-0" />
                      <span className="truncate">{deck.ownerUsername}</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={observerTarget} className="h-4" />

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <div className="loading-spinner h-8 w-8"></div>
          </div>
        )}
      </div>
    </div>
  );
}
