/**
 * Normalized price model.
 *
 * A card can expose prices from more than one marketplace. We normalize every
 * provider onto two sources: TCGPlayer (USD, the US market) and Cardmarket
 * (EUR, the EU market). A source is only populated where the provider gives it
 * away for free — MTG (Scryfall `eur`) and Pokémon (pokemontcg.io / tcgdex
 * `cardmarket` object) carry Cardmarket; Lorcana / One Piece (Phase 2) will not.
 */

export type PriceSource = 'tcgplayer' | 'cardmarket';

export const PRICE_SOURCES: readonly PriceSource[] = ['tcgplayer', 'cardmarket'] as const;

/** Currency each source reports in. */
export const PRICE_SOURCE_CURRENCY: Record<PriceSource, 'USD' | 'EUR'> = {
  tcgplayer: 'USD',
  cardmarket: 'EUR',
};

export interface PriceEntry {
  /** Market / mid price for the non-foil printing. */
  market?: number;
  /** Lowest available price. */
  low?: number;
  /** Market price for the foil printing, when the source distinguishes it. */
  foil?: number;
}

export interface CardPrices {
  tcgplayer?: PriceEntry; // USD
  cardmarket?: PriceEntry; // EUR
  /** ISO date the source last refreshed these prices. */
  updatedAt?: string;
}
