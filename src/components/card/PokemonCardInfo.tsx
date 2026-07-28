import { UnifiedCard } from '../../cards/domain/UnifiedCard';

/**
 * Pokémon-specific card details (HP, types, abilities, attacks, weaknesses /
 * resistances / retreat, flavor) — the Pokémon counterpart to MTG's mana cost /
 * oracle text. Renders nothing for non-Pokémon cards.
 */
export default function PokemonCardInfo({ card }: { card: UnifiedCard }) {
  const p = card.pokemon;
  if (!p) return null;

  const hasCombat =
    (p.weaknesses?.length ?? 0) > 0 ||
    (p.resistances?.length ?? 0) > 0 ||
    p.retreatCost != null;

  return (
    <div className="space-y-3 text-sm">
      {/* HP · types · stage · evolves-from */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-300">
        {p.hp != null && (
          <span className="font-semibold">
            <span className="text-gray-500 font-normal">HP</span> {p.hp}
          </span>
        )}
        {p.types && p.types.length > 0 && <span>{p.types.join(' / ')}</span>}
        {p.stage && <span className="text-gray-400">{p.stage}</span>}
        {p.evolvesFrom && <span className="text-gray-400">← {p.evolvesFrom}</span>}
      </div>

      {p.abilities?.map((a, i) => (
        <div key={`ab-${i}`} className="rounded-lg bg-gray-800/60 p-2">
          <div className="font-semibold text-purple-300">
            {a.type || 'Ability'} · {a.name}
          </div>
          {a.text && <p className="mt-0.5 text-gray-400">{a.text}</p>}
        </div>
      ))}

      {p.attacks?.map((a, i) => (
        <div key={`at-${i}`} className="rounded-lg bg-gray-800/60 p-2">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-white">
              {a.cost && a.cost.length > 0 && (
                <span className="mr-1.5 text-xs text-gray-400">{a.cost.join(' · ')}</span>
              )}
              {a.name}
            </span>
            {a.damage && <span className="font-bold text-white shrink-0">{a.damage}</span>}
          </div>
          {a.text && <p className="mt-0.5 text-gray-400">{a.text}</p>}
        </div>
      ))}

      {hasCombat && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-400">
          {p.weaknesses && p.weaknesses.length > 0 && (
            <span>Weakness: {p.weaknesses.map((w) => `${w.type} ${w.value}`).join(', ')}</span>
          )}
          {p.resistances && p.resistances.length > 0 && (
            <span>Resistance: {p.resistances.map((r) => `${r.type} ${r.value}`).join(', ')}</span>
          )}
          {p.retreatCost != null && <span>Retreat: {p.retreatCost}</span>}
        </div>
      )}

      {p.rules?.map((r, i) => (
        <p key={`rule-${i}`} className="text-gray-400 italic">{r}</p>
      ))}
      {p.flavorText && <p className="text-gray-500 italic">{p.flavorText}</p>}
    </div>
  );
}
