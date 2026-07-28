/**
 * Price accessors over UnifiedCard.
 *
 * `getPrice` returns a number in the chosen source's currency, falling back to
 * the other source when the preferred one is absent (so Lorcana / One Piece,
 * which only carry TCGPlayer, still render even if the user prefers Cardmarket).
 */

import { UnifiedCard } from '../UnifiedCard';
import { PriceSource } from '../prices';

export interface PriceOptions {
  foil?: boolean;
}

const otherSource = (s: PriceSource): PriceSource => (s === 'tcgplayer' ? 'cardmarket' : 'tcgplayer');

/** Preferred source first, the other as fallback. Returns 0 when unknown. */
export const getPrice = (card: UnifiedCard, source: PriceSource, opts: PriceOptions = {}): number => {
  for (const s of [source, otherSource(source)]) {
    const entry = card.prices?.[s];
    if (!entry) continue;
    const value = opts.foil ? entry.foil ?? entry.market : entry.market ?? entry.foil;
    if (value != null) return value;
  }
  return 0;
};

/** True when the card carries any price for the given source. */
export const hasPrice = (card: UnifiedCard, source: PriceSource): boolean => {
  const entry = card.prices?.[source];
  return Boolean(entry && (entry.market != null || entry.foil != null || entry.low != null));
};
