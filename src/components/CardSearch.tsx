import React, { useState, useRef, useReducer } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCardToCollection,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from '../services/api';
import { Card } from '../types';
import { GameId, enabledGames } from '../cards/domain/game';
import { cardData } from '../cards/infra/facade';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { buildScryfallQuery } from '../utils/scryfallQuery';
import { useCardFaces } from '../hooks/useCardFaces';
import { useCollectionCounts } from '../hooks/useCollectionCounts';
import SearchForm from './search/SearchForm';
import SearchResults from './search/SearchResults';
import CardDetail from './card/CardDetail';
import { SearchFormState, initialSearchForm, searchFormReducer } from './search/searchFormState';
import { getPrice } from '../cards/domain/accessors/price';

const CardSearch = () => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();
  const [detailCard, setDetailCard] = useState<Card | null>(null);

  // Wishlist membership (Set of card ids)
  const { data: wishlist } = useQuery<string[]>({
    queryKey: ['wishlist', user?.id],
    enabled: !!user,
    queryFn: () => getWishlist(user!.id),
  });

  const handleToggleWishlist = async (cardId: string) => {
    if (!user) {
      toast.error('Please log in to use your wishlist');
      return;
    }
    const inWishlist = wishlist?.includes(cardId) ?? false;
    try {
      if (inWishlist) {
        await removeFromWishlist(user.id, cardId);
        toast.success('Removed from wishlist');
      } else {
        await addToWishlist(user.id, cardId);
        toast.success('Added to wishlist');
      }
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    } catch (error) {
      console.error('Error updating wishlist:', error);
      toast.error('Failed to update wishlist');
    }
  };
  const [form, dispatch] = useReducer(searchFormReducer, initialSearchForm);
  const setField = <K extends keyof SearchFormState>(field: K, value: SearchFormState[K]) =>
    dispatch({ type: 'set', field, value });
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Search targets one game at a time (each has its own provider/syntax).
  const [game, setGame] = useState<GameId>('mtg');
  const [pokemonQuery, setPokemonQuery] = useState('');
  const games = enabledGames();

  // Collection state (card_id -> quantity), same cache entry as DeckManager.
  const { data: collectionCounts } = useCollectionCounts(user?.id);
  const userCollection = collectionCounts ?? {};
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  // Add card to collection
  const handleAddCardToCollection = async (cardId: string) => {
    if (!user) {
      toast.error('Please log in to add cards to your collection');
      return;
    }

    try {
      setAddingCardId(cardId);
      const card = searchResults.find(c => c.id === cardId);
      const priceUsd = card ? getPrice(card, 'tcgplayer') : 0;
      await addCardToCollection(user.id, cardId, 1, priceUsd, card?.name);

      // Bump the cached count right away (instant feedback), then invalidate
      // the collection caches so every consumer refetches the server truth.
      queryClient.setQueryData<Record<string, number>>(
        ['collection', user.id, 'counts'],
        (prev) => ({ ...(prev ?? {}), [cardId]: (prev?.[cardId] ?? 0) + 1 }),
      );
      queryClient.invalidateQueries({ queryKey: ['collection'] });
      queryClient.invalidateQueries({ queryKey: ['myCollection'] });

      toast.success('Card added to collection!');
    } catch (error) {
      console.error('Error adding card to collection:', error);
      toast.error('Failed to add card to collection');
    } finally {
      setAddingCardId(null);
    }
  };

  const searchAbortRef = useRef<AbortController | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    // Cancel any in-flight search so the latest submit always wins.
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);
    setError(null);

    const query =
      game === 'mtg'
        ? { raw: { scryfall: buildScryfallQuery(form) } }
        : { text: pokemonQuery };

    try {
      const result = await cardData.search(game, query, controller.signal);
      setSearchResults(result.cards || []);
    } catch (err) {
      // A newer search aborted this one — ignore, the newer one owns the UI.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch cards.');
      console.error('Error fetching cards:', err);
    } finally {
      if (searchAbortRef.current === controller) setLoading(false);
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Card Search</h1>

        {games.length > 1 && (
          <div className="flex gap-2 mb-4">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setGame(g.id);
                  setSearchResults([]);
                  setError(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  game === g.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {game === 'mtg' ? (
          <SearchForm form={form} setField={setField} onSubmit={handleSearch} />
        ) : (
          <form onSubmit={handleSearch} className="mb-6 flex gap-2">
            <input
              type="text"
              value={pokemonQuery}
              onChange={(e) => setPokemonQuery(e.target.value)}
              placeholder="Search Pokémon cards by name…"
              className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
            />
            <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium">
              Search
            </button>
          </form>
        )}

        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {searchResults && searchResults.length > 0 && (
          <SearchResults
            results={searchResults}
            wishlist={wishlist}
            userCollection={userCollection}
            addingCardId={addingCardId}
            onToggleWishlist={handleToggleWishlist}
            onAddToCollection={handleAddCardToCollection}
            getCurrentFaceIndex={getCurrentFaceIndex}
            toggleCardFace={toggleCardFace}
            onCardClick={setDetailCard}
          />
        )}
      </div>

      <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
    </div>
  );
};

export default CardSearch;
