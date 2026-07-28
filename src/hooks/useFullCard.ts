import { useEffect, useState } from 'react';
import { Card } from '../types';
import { getCardById } from '../services/api';

/**
 * Some providers (e.g. TCGdex) return "brief" cards from search — id, name and
 * image only, without gameplay fields. When such a card is shown in a detail
 * view we lazily fetch the full card by id so attacks/abilities/prices appear.
 * MTG search already returns full cards, so those are never re-fetched.
 */
const needsHydration = (card: Card | null): boolean => {
  if (!card || card.game === 'mtg') return false;
  const p = card.pokemon;
  return (
    !p ||
    (!p.supertype &&
      p.hp == null &&
      !(p.types && p.types.length) &&
      !(p.attacks && p.attacks.length) &&
      !(p.abilities && p.abilities.length))
  );
};

export function useFullCard(card: Card | null): Card | null {
  const [full, setFull] = useState<Card | null>(card);

  useEffect(() => {
    setFull(card);
    if (!needsHydration(card)) return;
    let cancelled = false;
    getCardById(card!.id)
      .then((c) => {
        if (!cancelled && c) setFull(c);
      })
      .catch(() => {
        /* keep the brief on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [card]);

  return full;
}
