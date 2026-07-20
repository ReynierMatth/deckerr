import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, PackagePlus, Loader2, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { searchCards, getUserCollection, addCardToCollection } from '../services/api';
import { Card } from '../types';
import { useAuth } from '../contexts/AuthContext';
import MagicCard from './MagicCard';
import { getManaIconPath } from './ManaCost';

const CardSearch = () => {
  const { user } = useAuth();
  const [cardName, setCardName] = useState('');
  const [text, setText] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [typeLine, setTypeLine] = useState('');
  const [typeMatch, setTypeMatch] = useState('partial');
  const [typeInclude, setTypeInclude] = useState(true);
  const [colors, setColors] = useState({ W: false, U: false, B: false, R: false, G: false, C: false });
  const [colorMode, setColorMode] = useState('exactly');
  const [commanderColors, setCommanderColors] = useState({ W: false, U: false, B: false, R: false, G: false, C: false });
  const [manaCost, setManaCost] = useState({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  const [manaValue, setManaValue] = useState('');
  const [manaValueComparison, setManaValueComparison] = useState('=');
  const [games, setGames] = useState({ paper: false, arena: false, mtgo: false });
  const [format, setFormat] = useState('');
  const [formatStatus, setFormatStatus] = useState('');
  const [set, setSet] = useState('');
  const [block, setBlock] = useState('');
  const [rarity, setRarity] = useState({ common: false, uncommon: false, rare: false, mythic: false });
  const [criteria, setCriteria] = useState('');
  const [criteriaMatch, setCriteriaMatch] = useState('partial');
  const [criteriaInclude, setCriteriaInclude] = useState(true);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('usd');
  const [priceComparison, setPriceComparison] = useState('=');
  const [artist, setArtist] = useState('');
  const [flavorText, setFlavorText] = useState('');
  const [loreFinder, setLoreFinder] = useState('');
  const [language, setLanguage] = useState('en');
  const [displayImages, setDisplayImages] = useState(false);
  const [order, setOrder] = useState('name');
  const [showAllPrints, setShowAllPrints] = useState(false);
  const [includeExtras, setIncludeExtras] = useState(false);
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collection state
  const [userCollection, setUserCollection] = useState<Map<string, number>>(new Map());
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
  const [cardFaceIndex, setCardFaceIndex] = useState<Map<string, number>>(new Map());
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  // Helper function to check if a card has an actual back face
  const isDoubleFaced = (card: Card) => {
    const backFaceLayouts = ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'];
    return card.card_faces && card.card_faces.length > 1 && backFaceLayouts.includes(card.layout);
  };

  // Get current face index for a card
  const getCurrentFaceIndex = (cardId: string) => {
    return cardFaceIndex.get(cardId) || 0;
  };

  // Toggle card face
  const toggleCardFace = (cardId: string, totalFaces: number) => {
    setCardFaceIndex(prev => {
      const newMap = new Map(prev);
      const currentIndex = prev.get(cardId) || 0;
      const nextIndex = (currentIndex + 1) % totalFaces;
      newMap.set(cardId, nextIndex);
      return newMap;
    });
  };

  // Get card image for current face
  const getCardImageUri = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.normal || card.card_faces[faceIndex]?.image_uris?.small;
    }
    return card.image_uris?.normal || card.image_uris?.small || card.card_faces?.[0]?.image_uris?.normal;
  };

  // Get card art crop for current face
  const getCardArtCrop = (card: Card, faceIndex: number = 0) => {
    if (isDoubleFaced(card) && card.card_faces) {
      return card.card_faces[faceIndex]?.image_uris?.art_crop || card.card_faces[faceIndex]?.image_uris?.normal;
    }
    return card.image_uris?.art_crop || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.art_crop;
  };

  // Add card to collection
  const handleAddCardToCollection = async (cardId: string) => {
    if (!user) {
      setSnackbar({ message: 'Please log in to add cards to your collection', type: 'error' });
      setTimeout(() => setSnackbar(null), 3000);
      return;
    }

    try {
      setAddingCardId(cardId);
      await addCardToCollection(user.id, cardId, 1);

      setUserCollection(prev => {
        const newMap = new Map(prev);
        const currentQty = newMap.get(cardId) || 0;
        newMap.set(cardId, currentQty + 1);
        return newMap;
      });

      setSnackbar({ message: 'Card added to collection!', type: 'success' });
    } catch (error) {
      console.error('Error adding card to collection:', error);
      setSnackbar({ message: 'Failed to add card to collection', type: 'error' });
    } finally {
      setAddingCardId(null);
      setTimeout(() => setSnackbar(null), 3000);
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

    let query = '';

    if (cardName) query += `name:${cardName} `;
    if (text) query += `o:${text} `;
    if (rulesText) query += `o:"${rulesText.replace('~', cardName)}" `;
    if (typeLine) {
      const typeQuery = typeMatch === 'partial' ? typeLine : `"${typeLine}"`;
      query += `${typeInclude ? '' : '-'}t:${typeQuery} `;
    }
    if (Object.values(colors).some(Boolean)) {
      const activeColors = Object.keys(colors).filter((key) => colors[key as keyof typeof colors]).join('');
      const colorQuery = colorMode === 'exactly' ? `c:${activeColors}` : `color<=${activeColors}`;
      query += `${colorQuery} `;
    }
    if (Object.values(commanderColors).some(Boolean)) {
      const activeColors = Object.keys(commanderColors).filter((key) => commanderColors[key as keyof typeof commanderColors]).join('');
      query += `id:${activeColors} `;
    }

    const manaCostString = Object.entries(manaCost)
      .filter(([, count]) => count > 0)
      .map(([color, count]) => `{${color}}`.repeat(count))
      .join('');

    if (manaCostString) query += `m:${manaCostString} `;

    if (manaValue) query += `mv${manaValueComparison}${manaValue} `;
    if (Object.values(games).some(Boolean)) {
      const activeGames = Object.keys(games).filter((key) => games[key as keyof typeof games]).join(',');
      query += `game:${activeGames} `;
    }
    if (format) query += `f:${format} `;
    if (formatStatus) query += `${formatStatus}:${format} `;
    if (set) query += `e:${set} `;
    if (block) query += `b:${block} `;
    if (Object.values(rarity).some(Boolean)) {
      const activeRarities = Object.keys(rarity).filter((key) => rarity[key as keyof typeof rarity]).join(',');
      query += `r:${activeRarities} `;
    }
    if (criteria) {
      const criteriaQuery = criteriaMatch === 'partial' ? criteria : `"${criteria}"`;
      query += `${criteriaInclude ? '' : '-'}o:${criteriaQuery} `;
    }
    if (price) query += `${currency}${priceComparison}${price} `;
    if (artist) query += `a:${artist} `;
    if (flavorText) query += `ft:${flavorText} `;
    if (loreFinder) query += `${loreFinder} `;
    if (language) query += `lang:${language} `;
    if (displayImages) query += `display:grid `;
    if (order) query += `order:${order} `;
    if (showAllPrints) query += `unique:prints `;
    if (includeExtras) query += `include:extras `;

    try {
      const cards = await searchCards(query.trim(), controller.signal);
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
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Card Name"
            />
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Text"
            />
            <input
              type="text"
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Rules Text (~ for card name)"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={typeLine}
                onChange={(e) => setTypeLine(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                placeholder="Type Line"
              />
              <select
                value={typeMatch}
                onChange={(e) => setTypeMatch(e.target.value)}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="partial">Partial</option>
                <option value="exact">Exact</option>
              </select>
              <select
                value={typeInclude}
                onChange={(e) => setTypeInclude(e.target.value === 'true')}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value={true}>Include</option>
                <option value={false}>Exclude</option>
              </select>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-bold mb-2">Card Colors</h4>
              <div className="flex gap-2">
                {Object.entries(colors).map(([color, active]) => (
                  <label key={color} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => setColors({ ...colors, [color]: !active })}
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
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value)}
                className="mt-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="exactly">Exactly these colors</option>
                <option value="atmost">At most these colors</option>
              </select>
            </div>
            <div>
              <h4 className="font-bold mb-2">Commander Colors</h4>
              <div className="flex gap-2">
                {Object.entries(commanderColors).map(([color, active]) => (
                  <label key={color} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => setCommanderColors({ ...commanderColors, [color]: !active })}
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
            {Object.entries(manaCost).map(([color, count]) => {
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
                    onChange={(e) => setManaCost({ ...manaCost, [color]: parseInt(e.target.value) })}
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
              value={manaValueComparison}
              onChange={(e) => setManaValueComparison(e.target.value)}
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
              value={manaValue}
              onChange={(e) => setManaValue(e.target.value)}
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
                    checked={games[game as keyof typeof games]}
                    onChange={() => setGames({ ...games, [game]: !games[game as keyof typeof games] })}
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
              value={format}
              onChange={(e) => setFormat(e.target.value)}
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
              value={formatStatus}
              onChange={(e) => setFormatStatus(e.target.value)}
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
              value={set}
              onChange={(e) => setSet(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Set Code"
            />
            <input
              type="text"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
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
                    checked={rarity[r as keyof typeof rarity]}
                    onChange={() => setRarity({ ...rarity, [r]: !rarity[r as keyof typeof rarity] })}
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
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Criteria"
            />
            <select
              value={criteriaMatch}
              onChange={(e) => setCriteriaMatch(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="partial">Partial</option>
              <option value="exact">Exact</option>
            </select>
            <select
              value={criteriaInclude}
              onChange={(e) => setCriteriaInclude(e.target.value === 'true')}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value={true}>Include</option>
              <option value={false}>Exclude</option>
            </select>
          </div>

          {/* Prices */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="tix">TIX</option>
            </select>
            <select
              value={priceComparison}
              onChange={(e) => setPriceComparison(e.target.value)}
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
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Price"
            />
          </div>

          {/* Additional Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Artist"
            />
            <input
              type="text"
              value={flavorText}
              onChange={(e) => setFlavorText(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Flavor Text"
            />
            <input
              type="text"
              value={loreFinder}
              onChange={(e) => setLoreFinder(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              placeholder="Lore Finder™"
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
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
                checked={displayImages}
                onChange={() => setDisplayImages(!displayImages)}
                className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span>Display as Images</span>
            </label>
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value)}
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
                checked={showAllPrints}
                onChange={() => setShowAllPrints(!showAllPrints)}
                className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span>Show All Prints</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={includeExtras}
                onChange={() => setIncludeExtras(!includeExtras)}
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
                    {/* Action button */}
                    <div className="flex items-center p-2">
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

      {/* Snackbar */}
      {snackbar && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            snackbar.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white z-[140]`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {snackbar.type === 'success' ? (
                <CheckCircle className="mr-2" size={20} />
              ) : (
                <XCircle className="mr-2" size={20} />
              )}
              <span>{snackbar.message}</span>
            </div>
            <button onClick={() => setSnackbar(null)} className="ml-4 text-gray-200 hover:text-white focus:outline-none">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardSearch;
