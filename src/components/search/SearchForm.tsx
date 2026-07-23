import React from 'react';
import { getManaIconPath } from '../ManaCost';
import { SearchFormState } from './searchFormState';

interface SearchFormProps {
  form: SearchFormState;
  setField: <K extends keyof SearchFormState>(field: K, value: SearchFormState[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
}

/** The big advanced-filters form (Scryfall search syntax builder inputs). */
export default function SearchForm({ form, setField, onSubmit }: SearchFormProps) {
  return (
    <form onSubmit={onSubmit} className="mb-8 space-y-4">
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
  );
}
