import React, { useState, useEffect, useRef, useReducer } from 'react';
import { RefreshCw, PackagePlus, Loader2, CheckCircle, Star } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  searchCards,
  getUserCollection,
  addCardToCollection,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from '../services/api';
import { Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isDoubleFaced, getCardImageUri, getCardArtCrop } from '../utils/cardFaces';
import { buildScryfallQuery } from '../utils/scryfallQuery';
import { useCardFaces } from '../hooks/useCardFaces';
import MagicCard from './MagicCard';
import { getManaIconPath } from './ManaCost';

type ColorKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

interface SearchForm {
  cardName: string;
  text: string;
  rulesText: string;
  typeLine: string;
  typeMatch: string;
  typeInclude: boolean;
  colors: Record<ColorKey, boolean>;
  colorMode: string;
  commanderColors: Record<ColorKey, boolean>;
  manaCost: Record<ColorKey, number>;
  manaValue: string;
  manaValueComparison: string;
  games: { paper: boolean; arena: boolean; mtgo: boolean };
  format: string;
  formatStatus: string;
  set: string;
  block: string;
  rarity: { common: boolean; uncommon: boolean; rare: boolean; mythic: boolean };
  criteria: string;
  criteriaMatch: string;
  criteriaInclude: boolean;
  price: string;
  currency: string;
  priceComparison: string;
  artist: string;
  flavorText: string;
  loreFinder: string;
  language: string;
  displayImages: boolean;
  order: string;
  showAllPrints: boolean;
  includeExtras: boolean;
}

const initialSearchForm: SearchForm = {
  cardName: '',
  text: '',
  rulesText: '',
  typeLine: '',
  typeMatch: 'partial',
  typeInclude: true,
  colors: { W: false, U: false, B: false, R: false, G: false, C: false },
  colorMode: 'exactly',
  commanderColors: { W: false, U: false, B: false, R: false, G: false, C: false },
  manaCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  manaValue: '',
  manaValueComparison: '=',
  games: { paper: false, arena: false, mtgo: false },
  format: '',
  formatStatus: '',
  set: '',
  block: '',
  rarity: { common: false, uncommon: false, rare: false, mythic: false },
  criteria: '',
  criteriaMatch: 'partial',
  criteriaInclude: true,
  price: '',
  currency: 'usd',
  priceComparison: '=',
  artist: '',
  flavorText: '',
  loreFinder: '',
  language: 'en',
  displayImages: false,
  order: 'name',
  showAllPrints: false,
  includeExtras: false,
};

type SearchFormAction =
  | { type: 'set'; field: keyof SearchForm; value: SearchForm[keyof SearchForm] }
  | { type: 'reset' };

function searchFormReducer(state: SearchForm, action: SearchFormAction): SearchForm {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'reset':
      return initialSearchForm;
    default:
      return state;
  }
}

const CardSearch = () => {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { getCurrentFaceIndex, toggleCardFace } = useCardFaces();

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
  const setField = <K extends keyof SearchForm>(field: K, value: SearchForm[K]) =>
    dispatch({ type: 'set', field, value });
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collection state
  const [userCollection, setUserCollection] = useState<Map<string, number>>(new Map());
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  // Load user collection
  useEffect(() => {
    const loadUserCollection = async () => {
      if (!user) return;
      try {
        const collection = await getUserCollection(user.id);
        setUserCollection(collection);
      } catch (error) {
        console.error('Error loading user collection:', error);
      }
    };
    loadUserCollection();
  }, [user]);

  // Add card to collection
  const handleAddCardToCollection = async (cardId: string) => {
    if (!user) {
      toast.error('Please log in to add cards to your collection');
      return;
    }

    try {
      setAddingCardId(cardId);
      const card = searchResults.find(c => c.id === cardId);
      const priceUsd = card?.prices?.usd ? Number(card.prices.usd) : 0;
      await addCardToCollection(user.id, cardId, 1, priceUsd, card?.name);

      setUserCollection(prev => {
        const newMap = new Map(prev);
        const currentQty = newMap.get(cardId) || 0;
        newMap.set(cardId, currentQty + 1);
        return newMap;
      });

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

    const query = buildScryfallQuery(form);

    try {
      const cards = await searchCards(query, controller.signal);
      setSearchResults(cards || []);
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
        <form onSubmit={handleSearch} className="mb-8 space-y-4">
          {/* Card Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={form.cardName}
              onChange={(e) => setField('cardName', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Card Name"
            />
            <input
              type="text"
              value={form.text}
              onChange={(e) => setField('text', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Text"
            />
            <input
              type="text"
              value={form.rulesText}
              onChange={(e) => setField('rulesText', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Rules Text (~ for card name)"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={form.typeLine}
                onChange={(e) => setField('typeLine', e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                placeholder="Type Line"
              />
              <select
                value={form.typeMatch}
                onChange={(e) => setField('typeMatch', e.target.value)}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="partial">Partial</option>
                <option value="exact">Exact</option>
              </select>
              <select
                value={String(form.typeInclude)}
                onChange={(e) => setField('typeInclude', e.target.value === 'true')}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="true">Include</option>
                <option value="false">Exclude</option>
              </select>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-bold mb-2">Card Colors</h4>
              <div className="flex gap-2">
                {Object.entries(form.colors).map(([color, active]) => (
                  <label key={color} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => setField('colors', { ...form.colors, [color]: !active })}
                      className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {getManaIconPath(color) ? (
                      <img src={getManaIconPath(color)!} alt={color} className="w-6 h-6" />
                    ) : (
                      <span className="w-6 h-6 flex items-center justify-center bg-gray-500 text-white font-bold rounded-full text-sm">{color}</span>
                    )}
                  </label>
                ))}
              </div>
              <select
                value={form.colorMode}
                onChange={(e) => setField('colorMode', e.target.value)}
                className="mt-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="exactly">Exactly these colors</option>
                <option value="atmost">At most these colors</option>
              </select>
            </div>
            <div>
              <h4 className="font-bold mb-2">Commander Colors</h4>
              <div className="flex gap-2">
                {Object.entries(form.commanderColors).map(([color, active]) => (
                  <label key={color} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => setField('commanderColors', { ...form.commanderColors, [color]: !active })}
                      className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {getManaIconPath(color) ? (
                      <img src={getManaIconPath(color)!} alt={color} className="w-6 h-6" />
                    ) : (
                      <span className="w-6 h-6 flex items-center justify-center bg-gray-500 text-white font-bold rounded-full text-sm">{color}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Mana Cost */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {Object.entries(form.manaCost).map(([color, count]) => {
              const iconPath = getManaIconPath(color);
              return (
                <div key={color} className="flex items-center space-x-2">
                  {iconPath ? (
                    <img src={iconPath} alt={color} className="w-6 h-6 md:w-8 md:h-8" />
                  ) : (
                    <span className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gray-500 text-white font-bold rounded-full text-sm">
                      {color}
                    </span>
                  )}
                  <input
                    type="number"
                    value={count}
                    onChange={(e) => setField('manaCost', { ...form.manaCost, [color]: parseInt(e.target.value) })}
                    className="w-14 sm:w-16 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                    min="0"
                  />
                </div>
              );
            })}
          </div>

          {/* Stats */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={form.manaValueComparison}
              onChange={(e) => setField('manaValueComparison', e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="=">Equal to</option>
              <option value="<">Less than</option>
              <option value=">">Greater than</option>
              <option value="<=">Less than or equal to</option>
              <option value=">=">Greater than or equal to</option>
              <option value="!=">Not equal to</option>
            </select>
            <input
              type="number"
              value={form.manaValue}
              onChange={(e) => setField('manaValue', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Mana Value"
            />
          </div>

          {/* Games */}
          <div>
            <h4 className="font-bold mb-2">Games</h4>
            <div className="flex gap-2">
              {['paper', 'arena', 'mtgo'].map((game) => (
                <label key={game} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={form.games[game as keyof typeof form.games]}
                    onChange={() => setField('games', { ...form.games, [game]: !form.games[game as keyof typeof form.games] })}
                    className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span>{game}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Formats */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={form.format}
              onChange={(e) => setField('format', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="">Select Format</option>
              <option value="standard">Standard</option>
              <option value="future">Future Standard</option>
              <option value="historic">Historic</option>
              <option value="timeless">Timeless</option>
              <option value="gladiator">Gladiator</option>
              <option value="pioneer">Pioneer</option>
              <option value="explorer">Explorer</option>
              <option value="modern">Modern</option>
              <option value="legacy">Legacy</option>
              <option value="pauper">Pauper</option>
              <option value="vintage">Vintage</option>
              <option value="penny">Penny Dreadful</option>
              <option value="commander">Commander</option>
              <option value="oathbreaker">Oathbreaker</option>
              <option value="standardbrawl">Standard Brawl</option>
              <option value="brawl">Brawl</option>
              <option value="alchemy">Alchemy</option>
              <option value="paupercommander">Pauper Commander</option>
              <option value="duel">Duel Commander</option>
              <option value="oldschool">Old School 93/94</option>
              <option value="premodern">Premodern</option>
              <option value="predh">PreDH</option>
            </select>
            <select
              value={form.formatStatus}
              onChange={(e) => setField('formatStatus', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="">Select Status</option>
              <option value="banned">Banned</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>

          {/* Sets */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={form.set}
              onChange={(e) => setField('set', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Set Code"
            />
            <input
              type="text"
              value={form.block}
              onChange={(e) => setField('block', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Block Code"
            />
          </div>

          {/* Rarity */}
          <div>
            <h4 className="font-bold mb-2">Rarity</h4>
            <div className="flex gap-2">
              {['common', 'uncommon', 'rare', 'mythic'].map((r) => (
                <label key={r} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={form.rarity[r as keyof typeof form.rarity]}
                    onChange={() => setField('rarity', { ...form.rarity, [r]: !form.rarity[r as keyof typeof form.rarity] })}
                    className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Criteria */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={form.criteria}
              onChange={(e) => setField('criteria', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Criteria"
            />
            <select
              value={form.criteriaMatch}
              onChange={(e) => setField('criteriaMatch', e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="partial">Partial</option>
              <option value="exact">Exact</option>
            </select>
            <select
              value={String(form.criteriaInclude)}
              onChange={(e) => setField('criteriaInclude', e.target.value === 'true')}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="true">Include</option>
              <option value="false">Exclude</option>
            </select>
          </div>

          {/* Prices */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={form.currency}
              onChange={(e) => setField('currency', e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="tix">TIX</option>
            </select>
            <select
              value={form.priceComparison}
              onChange={(e) => setField('priceComparison', e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="=">Equal to</option>
              <option value="<">Less than</option>
              <option value=">">Greater than</option>
              <option value="<=">Less than or equal to</option>
              <option value=">=">Greater than or equal to</option>
              <option value="!=">Not equal to</option>
            </select>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Price"
            />
          </div>

          {/* Additional Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={form.artist}
              onChange={(e) => setField('artist', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Artist"
            />
            <input
              type="text"
              value={form.flavorText}
              onChange={(e) => setField('flavorText', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Flavor Text"
            />
            <input
              type="text"
              value={form.loreFinder}
              onChange={(e) => setField('loreFinder', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Lore Finder™"
            />
            <select
              value={form.language}
              onChange={(e) => setField('language', e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="ru">Russian</option>
              <option value="zhs">Simplified Chinese</option>
              <option value="zht">Traditional Chinese</option>
            </select>
          </div>

          {/* Preferences */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={form.displayImages}
                onChange={() => setField('displayImages', !form.displayImages)}
                className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span>Display as Images</span>
            </label>
            <select
              value={form.order}
              onChange={(e) => setField('order', e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="name">Name</option>
              <option value="cmc">CMC</option>
              <option value="power">Power</option>
              <option value="toughness">Toughness</option>
              <option value="set">Set</option>
              <option value="usd">USD Price</option>
              <option value="eur">EUR Price</option>
              <option value="tix">TIX Price</option>
              <option value="rarity">Rarity</option>
              <option value="color">Color</option>
              <option value="released">Released</option>
              <option value="spoiled">Spoiled</option>
              <option value="edhrec">EDHREC</option>
              <option value="penny">Penny</option>
              <option value="review">Review</option>
            </select>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={form.showAllPrints}
                onChange={() => setField('showAllPrints', !form.showAllPrints)}
                className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span>Show All Prints</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={form.includeExtras}
                onChange={() => setField('includeExtras', !form.includeExtras)}
                className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span>Include Extra Cards</span>
            </label>
          </div>

          <button
            type="submit"
            className="mt-4 w-full sm:w-auto min-h-[44px] px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-base"
          >
            Search
          </button>
        </form>

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
          <>
            {/* Mobile: Horizontal list layout */}
            <div className="flex flex-col gap-2 sm:hidden">
              {searchResults.map((card) => {
                const currentFaceIndex = getCurrentFaceIndex(card.id);
                const isMultiFaced = isDoubleFaced(card);
                const inCollection = userCollection.get(card.id) || 0;
                const isAddingThisCard = addingCardId === card.id;

                const displayName = isMultiFaced && card.card_faces
                  ? card.card_faces[currentFaceIndex]?.name || card.name
                  : card.name;

                return (
                  <div key={card.id} className="flex bg-gray-800 rounded-lg overflow-hidden">
                    {/* Card art crop */}
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <img
                        src={getCardArtCrop(card, currentFaceIndex)}
                        alt={displayName}
                        className="w-full h-full object-cover rounded-l-lg"
                      />
                      {isMultiFaced && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCardFace(card.id, card.card_faces!.length);
                          }}
                          className="absolute bottom-0.5 right-0.5 bg-purple-600 text-white p-0.5 rounded-full"
                        >
                          <RefreshCw size={10} />
                        </button>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                      <h3 className="font-bold text-sm truncate">{displayName}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {card.prices?.usd && <span>${card.prices.usd}</span>}
                        {inCollection > 0 && (
                          <span className="text-green-400 flex items-center gap-0.5">
                            <CheckCircle size={10} />
                            x{inCollection}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 p-2">
                      <button
                        onClick={() => handleToggleWishlist(card.id)}
                        className={`p-2.5 rounded-lg ${
                          wishlist?.includes(card.id)
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-700 text-gray-300 active:bg-gray-600'
                        }`}
                        title={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                        aria-label={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                      >
                        <Star size={18} fill={wishlist?.includes(card.id) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => handleAddCardToCollection(card.id)}
                        disabled={isAddingThisCard}
                        className="p-2.5 bg-green-600 active:bg-green-700 disabled:bg-gray-600 rounded-lg"
                        title="Add to collection"
                      >
                        {isAddingThisCard ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <PackagePlus size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Grid layout */}
            <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {searchResults.map((card) => {
                const currentFaceIndex = getCurrentFaceIndex(card.id);
                const isMultiFaced = isDoubleFaced(card);
                const inCollection = userCollection.get(card.id) || 0;
                const isAddingThisCard = addingCardId === card.id;

                const displayName = isMultiFaced && card.card_faces
                  ? card.card_faces[currentFaceIndex]?.name || card.name
                  : card.name;

                return (
                  <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all">
                    <div className="relative">
                      {getCardImageUri(card, currentFaceIndex) ? (
                        <img
                          src={getCardImageUri(card, currentFaceIndex)}
                          alt={displayName}
                          className="w-full h-auto"
                        />
                      ) : (
                        <MagicCard card={card} />
                      )}
                      {isMultiFaced && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCardFace(card.id, card.card_faces!.length);
                          }}
                          className="absolute bottom-2 right-2 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full shadow-lg transition-all"
                          title="Flip card"
                        >
                          <RefreshCw size={16} />
                        </button>
                      )}
                      {inCollection > 0 && (
                        <span className="absolute top-1 right-1 text-xs bg-green-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle size={12} />
                          x{inCollection}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleWishlist(card.id);
                        }}
                        className={`absolute top-1 left-1 p-2 rounded-full shadow-lg transition-all ${
                          wishlist?.includes(card.id)
                            ? 'bg-yellow-500/90 text-white'
                            : 'bg-gray-900/70 text-gray-200 hover:bg-gray-900'
                        }`}
                        title={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                        aria-label={wishlist?.includes(card.id) ? 'Remove from wishlist' : 'Add to wishlist'}
                      >
                        <Star size={16} fill={wishlist?.includes(card.id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="p-3">
                      <h3 className="font-bold text-sm truncate mb-1">{displayName}</h3>
                      <p className="text-gray-400 text-xs truncate mb-2">
                        {isMultiFaced && card.card_faces
                          ? card.card_faces[currentFaceIndex]?.type_line || card.type_line
                          : card.type_line}
                      </p>
                      {card.prices?.usd && (
                        <div className="text-xs text-gray-400 mb-2">${card.prices.usd}</div>
                      )}
                      <button
                        onClick={() => handleAddCardToCollection(card.id)}
                        disabled={isAddingThisCard}
                        className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center gap-2 text-sm"
                        title="Add to collection"
                      >
                        {isAddingThisCard ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <>
                            <PackagePlus size={16} />
                            Add
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CardSearch;
