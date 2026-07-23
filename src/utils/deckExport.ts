import { Card } from '../types';

export type ExportFormat = 'plain' | 'arena';

/**
 * Serialize a deck to a text decklist.
 * - 'plain'  -> "4 Lightning Bolt"        (Moxfield / MTGO / generic)
 * - 'arena'  -> "4 Lightning Bolt (M10) 146" when set/collector are known,
 *               falling back to the plain line otherwise.
 * Commander(s) are listed first.
 */
export function buildDeckExport(
  cards: { card: Card; quantity: number; is_commander?: boolean }[],
  format: ExportFormat = 'plain',
): string {
  const line = ({ card, quantity }: { card: Card; quantity: number }): string => {
    if (format === 'arena' && card.set && card.collector_number) {
      return `${quantity} ${card.name} (${card.set.toUpperCase()}) ${card.collector_number}`;
    }
    return `${quantity} ${card.name}`;
  };

  const entries = cards.filter((c) => c.quantity > 0);
  const commanders = entries.filter((c) => c.is_commander);
  const rest = entries.filter((c) => !c.is_commander);

  return [...commanders, ...rest].map(line).join('\n');
}
