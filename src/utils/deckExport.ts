import { Card } from '../types';

export type ExportFormat = 'plain' | 'arena' | 'csv' | 'mtgo';

type DeckEntry = { card: Card; quantity: number; is_commander?: boolean; is_sideboard?: boolean };

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

/**
 * Split live entries into mainboard (commanders first) and sideboard. Zero-
 * quantity entries are dropped. Commanders always belong to the mainboard.
 */
function splitBoards(cards: DeckEntry[]): { mainboard: DeckEntry[]; sideboard: DeckEntry[] } {
  const entries = cards.filter((c) => c.quantity > 0);
  const main = entries.filter((c) => !c.is_sideboard);
  const sideboard = entries.filter((c) => c.is_sideboard);
  const commanders = main.filter((c) => c.is_commander);
  const rest = main.filter((c) => !c.is_commander);
  return { mainboard: [...commanders, ...rest], sideboard };
}

export const DECK_CSV_HEADER = 'quantity,name,set,collector_number,is_commander,is_sideboard';

function buildCsv(mainboard: DeckEntry[], sideboard: DeckEntry[]): string {
  const row = ({ card, quantity, is_commander, is_sideboard }: DeckEntry) =>
    [
      String(quantity),
      escapeCsvField(card.name),
      escapeCsvField(card.set ?? ''),
      escapeCsvField(card.collector_number ?? ''),
      is_commander ? 'true' : 'false',
      is_sideboard ? 'true' : 'false',
    ].join(',');
  return [DECK_CSV_HEADER, ...[...mainboard, ...sideboard].map(row)].join('\n');
}

function buildMtgoDek(mainboard: DeckEntry[], sideboard: DeckEntry[]): string {
  const cardLine = (sideboardFlag: boolean) => ({ card, quantity }: DeckEntry) =>
    `  <Cards Quantity="${quantity}" Sideboard="${sideboardFlag}" Name="${escapeXmlAttribute(card.name)}" />`;
  const cardLines = [
    ...mainboard.map(cardLine(false)),
    ...sideboard.map(cardLine(true)),
  ];
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
 * - 'csv'    -> quantity,name,set,collector_number,is_commander,is_sideboard rows.
 * - 'mtgo'   -> minimal MTGO .dek XML (<Cards Quantity=".." Sideboard=".." Name=".." />).
 * Commander(s) are listed first; the sideboard follows the mainboard (a blank
 * line + "Sideboard" header for the text formats).
 */
export function buildDeckExport(cards: DeckEntry[], format: ExportFormat = 'plain'): string {
  const { mainboard, sideboard } = splitBoards(cards);

  if (format === 'csv') return buildCsv(mainboard, sideboard);
  if (format === 'mtgo') return buildMtgoDek(mainboard, sideboard);

  const line = ({ card, quantity }: DeckEntry): string => {
    if (format === 'arena' && card.set && card.collector_number) {
      return `${quantity} ${card.name} (${card.set.toUpperCase()}) ${card.collector_number}`;
    }
    return `${quantity} ${card.name}`;
  };

  const lines = mainboard.map(line);
  if (sideboard.length > 0) {
    lines.push('', 'Sideboard', ...sideboard.map(line));
  }
  return lines.join('\n');
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
