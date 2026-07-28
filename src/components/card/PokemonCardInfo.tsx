import { useState } from 'react';
import { UnifiedCard } from '../../cards/domain/UnifiedCard';
import { canonicalEnergy, energyColor } from '../../utils/pokemonEnergy';

/**
 * A single energy symbol: a colored disc (the energy's color) with the white
 * pictogram from /energy/<key>.svg on top. If the icon is missing the disc
 * alone stands in. The localized name is kept as a tooltip.
 */
function EnergyPip({ name, size = 16 }: { name: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const key = canonicalEnergy(name);

  return (
    <span
      title={name}
      aria-label={name}
      className="inline-flex items-center justify-center rounded-full align-middle border border-black/20"
      style={{ width: size, height: size, backgroundColor: energyColor(name) }}
    >
      {key && !imgFailed && (
        <img
          src={`/energy/${key.toLowerCase()}.svg`}
          alt=""
          aria-hidden
          style={{ width: size * 0.68, height: size * 0.68 }}
          onError={() => setImgFailed(true)}
        />
      )}
    </span>
  );
}

/**
 * Pokémon-specific card details (HP, types, abilities, attacks, weaknesses /
 * resistances / retreat, flavor) — the Pokémon counterpart to MTG's mana cost /
 * oracle text. Energy types render as colored pips (localized names as
 * tooltips). Renders nothing for non-Pokémon cards.
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
        {p.types && p.types.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {p.types.map((t) => (
              <EnergyPip key={t} name={t} />
            ))}
            {p.types.join(' / ')}
          </span>
        )}
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
                <span className="mr-1.5 inline-flex items-center gap-0.5 align-middle">
                  {a.cost.map((c, ci) => (
                    <EnergyPip key={ci} name={c} />
                  ))}
                </span>
              )}
              {a.name}
            </span>
            {a.damage && <span className="font-bold text-white shrink-0">{a.damage}</span>}
          </div>
          {a.text && <p className="mt-0.5 text-gray-400">{a.text}</p>}
        </div>
      ))}

      {hasCombat && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-400">
          {p.weaknesses && p.weaknesses.length > 0 && (
            <span className="inline-flex items-center gap-1">
              Weakness:
              {p.weaknesses.map((w, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <EnergyPip name={w.type} size={12} />
                  {w.value}
                </span>
              ))}
            </span>
          )}
          {p.resistances && p.resistances.length > 0 && (
            <span className="inline-flex items-center gap-1">
              Resistance:
              {p.resistances.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <EnergyPip name={r.type} size={12} />
                  {r.value}
                </span>
              ))}
            </span>
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
