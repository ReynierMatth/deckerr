import { Card } from '../types';

export type ExportFormat = 'plain' | 'arena' | 'csv' | 'mtgo';

type DeckEntry = { card: Card; quantity: number; is_commander?: boolean };

/** Escape a single CSV field, quoting only when needed. */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Escape a value for use inside a double-quoted XML attribute. */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Commanders first, zero-quantity entries dropped. */
function orderedEntries(cards: DeckEntry[]): DeckEntry[] {
  const entries = cards.filter((c) => c.quantity > 0);
  const commanders = entries.filter((c) => c.is_commander);
  const rest = entries.filter((c) => !c.is_commander);
  return [...commanders, ...rest];
}

export const DECK_CSV_HEADER = 'quantity,name,set,collector_number,is_commander';

function buildCsv(entries: DeckEntry[]): string {
  const lines = entries.map(({ card, quantity, is_commander }) =>
    [
      String(quantity),
      escapeCsvField(card.name),
      escapeCsvField(card.set ?? ''),
      escapeCsvField(card.collector_number ?? ''),
      is_commander ? 'true' : 'false',
    ].join(','),
  );
  return [DECK_CSV_HEADER, ...lines].join('\n');
}

function buildMtgoDek(entries: DeckEntry[]): string {
  const cardLines = entries.map(
    ({ card, quantity }) =>
      `  <Cards Quantity="${quantity}" Sideboard="false" Name="${escapeXmlAttribute(card.name)}" />`,
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <NetDeckID>0</NetDeckID>',
    '  <PreconstructedDeckID>0</PreconstructedDeckID>',
    ...cardLines,
    '</Deck>',
  ].join('\n');
}

/**
 * Serialize a deck to an exportable string.
 * - 'plain'  -> "4 Lightning Bolt"        (Moxfield / generic)
 * - 'arena'  -> "4 Lightning Bolt (M10) 146" when set/collector are known,
 *               falling back to the plain line otherwise.
 * - 'csv'    -> quantity,name,set,collector_number,is_commander rows.
 * - 'mtgo'   -> minimal MTGO .dek XML (<Cards Quantity=".." Name=".." />).
 * Commander(s) are listed first.
 */
export function buildDeckExport(cards: DeckEntry[], format: ExportFormat = 'plain'): string {
  const entries = orderedEntries(cards);

  if (format === 'csv') return buildCsv(entries);
  if (format === 'mtgo') return buildMtgoDek(entries);

  const line = ({ card, quantity }: DeckEntry): string => {
    if (format === 'arena' && card.set && card.collector_number) {
      return `${quantity} ${card.name} (${card.set.toUpperCase()}) ${card.collector_number}`;
    }
    return `${quantity} ${card.name}`;
  };

  return entries.map(line).join('\n');
}

/** File extension (without dot) for a given export format. */
export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  plain: 'txt',
  arena: 'txt',
  csv: 'csv',
  mtgo: 'dek',
};

/** MIME type used when downloading a given export format. */
export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  plain: 'text/plain;charset=utf-8',
  arena: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  mtgo: 'application/xml;charset=utf-8',
};
