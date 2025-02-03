import React, { useState } from 'react';
    import { searchCards } from '../services/api';
    import { Card } from '../types';

    const CardSearch = () => {
      const [cardName, setCardName] = useState('');
      const [text, setText] = useState('');
      const [rulesText, setRulesText] = useState('');
      const [typeLine, setTypeLine] = useState('');
      const [typeMatch, setTypeMatch] = useState('partial');
      const [typeInclude, setTypeInclude] = useState(true);
      const [colors, setColors] = useState({ W: false, U: false, B: false, R: false, G: false, C: false });
      const [colorMode, setColorMode] = useState('exactly');
      const [commanderColors, setCommanderColors] = useState({ W: false, U: false, B: false, R: false, G: false, C: false });
      const [manaCost, setManaCost] = useState('');
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

      const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
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
        if (manaCost) query += `m:${manaCost} `;
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
          const cards = await searchCards(query.trim());
          setSearchResults(cards || []);
        } catch (err) {
          setError('Failed to fetch cards.');
          console.error('Error fetching cards:', err);
        } finally {
          setLoading(false);
        }
      };

      return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Card Search</h1>
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
                <div className="flex gap-2">
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
                    {['W', 'U', 'B', 'R', 'G', 'C'].map((color) => (
                      <label key={color} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={colors[color as keyof typeof colors]}
                          onChange={() => setColors({ ...colors, [color]: !colors[color as keyof typeof colors] })}
                          className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <span>{color}</span>
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
                    {['W', 'U', 'B', 'R', 'G', 'C'].map((color) => (
                      <label key={color} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={commanderColors[color as keyof typeof commanderColors]}
                          onChange={() => setCommanderColors({ ...commanderColors, [color]: !commanderColors[color as keyof typeof commanderColors] })}
                          className="rounded border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <span>{color}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mana Cost */}
              <input
                type="text"
                value={manaCost}
                onChange={(e) => setManaCost(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                placeholder="Mana Cost (e.g., {W}{W})"
              />

              {/* Stats */}
              <div className="flex gap-2">
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
              <div className="flex gap-2">
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
              <div className="flex gap-2">
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
              <div className="flex gap-2">
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
              <div className="flex gap-2">
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
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {searchResults.map((card) => (
                  <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden">
                    {card.image_uris?.normal && (
                      <img
                        src={card.image_uris.normal}
                        alt={card.name}
                        className="w-full h-auto"
                      />
                    )}
                    <div className="p-4">
                      <h3 className="font-bold mb-2">{card.name}</h3>
                      <p className="text-gray-400 text-sm">{card.type_line}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    };

    export default CardSearch;
