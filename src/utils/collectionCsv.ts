/**
 * CSV serialization/parsing for the Collection page.
 *
 * CSV shape (header row required on export, tolerated/ignored on import):
 *   name,card_id,quantity,is_foil,condition,price_usd
 *
 * Both functions are pure so they can be unit-tested in isolation.
 */

export const CARD_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type CardCondition = (typeof CARD_CONDITIONS)[number];

export interface CollectionCsvRow {
  name: string;
  card_id: string;
  quantity: number;
  is_foil: boolean;
  /** One of CARD_CONDITIONS, or '' when unknown. */
  condition: string;
  price_usd: number;
}

export const CSV_HEADER = 'name,card_id,quantity,is_foil,condition,price_usd';

/** Escape a single CSV field, quoting only when needed. */
function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string (including the header row) from collection rows. */
export function toCsv(rows: CollectionCsvRow[]): string {
  const lines = rows.map((row) =>
    [
      escapeField(row.name),
      escapeField(row.card_id),
      String(row.quantity),
      row.is_foil ? 'true' : 'false',
      escapeField(row.condition),
      row.price_usd.toFixed(2),
    ].join(','),
  );
  return [CSV_HEADER, ...lines].join('\n');
}

/** Split a single CSV line into fields, honouring double-quoted values. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function normalizeCondition(value: string): string {
  const upper = value.trim().toUpperCase();
  return (CARD_CONDITIONS as readonly string[]).includes(upper) ? upper : '';
}

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'foil';
}

// ---- ManaBox import support ----

/** A row parsed from a ManaBox-style export (no Scryfall id — printing info instead). */
export interface ManaBoxCsvRow {
  name: string;
  /** Set code, lower-cased ('' when the export lacks it). */
  set: string;
  /** Collector number within the set ('' when the export lacks it). */
  collector_number: string;
  quantity: number;
  is_foil: boolean;
  /** One of CARD_CONDITIONS, or '' when unknown. */
  condition: string;
}

// Accepted (lower-cased) header names per logical column. ManaBox exports vary
// slightly between versions, so each column tolerates a few spellings.
const MANABOX_COLUMNS = {
  name: ['name', 'card name'],
  quantity: ['quantity', 'qty'],
  set: ['set code', 'set'],
  collector_number: ['collector number', 'collector_number', 'card number'],
  foil: ['foil'],
  condition: ['condition'],
} as const;

type ManaBoxColumn = keyof typeof MANABOX_COLUMNS;

function manaBoxHeaderIndexes(headerFields: string[]): Partial<Record<ManaBoxColumn, number>> {
  const normalized = headerFields.map((f) => f.trim().toLowerCase());
  const indexes: Partial<Record<ManaBoxColumn, number>> = {};
  for (const column of Object.keys(MANABOX_COLUMNS) as ManaBoxColumn[]) {
    const idx = normalized.findIndex((field) =>
      (MANABOX_COLUMNS[column] as readonly string[]).includes(field),
    );
    if (idx !== -1) indexes[column] = idx;
  }
  return indexes;
}

function firstNonBlankLine(text: string): string {
  return text.split(/\r\n|\r|\n/).find((line) => line.trim()) ?? '';
}

/**
 * Detect a ManaBox-style export by its header: it must name a card column
 * (Name / Card name) and a Quantity column, and must NOT be the Deckerr-native
 * format (which is identified by its card_id column). Case-insensitive.
 */
export function isManaBoxCsv(text: string): boolean {
  const header = firstNonBlankLine(text);
  if (!header) return false;
  const fields = splitCsvLine(header).map((f) => f.trim().toLowerCase());
  if (fields.includes('card_id')) return false; // Deckerr-native export
  const indexes = manaBoxHeaderIndexes(fields);
  return indexes.name !== undefined && indexes.quantity !== undefined;
}

// ManaBox condition values -> Deckerr's CARD_CONDITIONS.
const MANABOX_CONDITIONS: Record<string, CardCondition> = {
  mint: 'NM',
  near_mint: 'NM',
  excellent: 'LP',
  light_played: 'LP',
  lightly_played: 'LP',
  good: 'MP',
  played: 'MP',
  moderately_played: 'MP',
  heavily_played: 'HP',
  poor: 'DMG',
  damaged: 'DMG',
};

function normalizeManaBoxCondition(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MANABOX_CONDITIONS[key] ?? normalizeCondition(value);
}

/**
 * Parse a ManaBox-style CSV into rows. Columns are located by header name
 * (case-insensitive); Name and Quantity are required, everything else is
 * optional. Blank and malformed lines are skipped. Returns [] when the text
 * is not a ManaBox-style export.
 */
export function parseManaBoxCsv(text: string): ManaBoxCsvRow[] {
  if (!isManaBoxCsv(text)) return [];

  const lines = text.split(/\r\n|\r|\n/);
  const headerIdx = lines.findIndex((line) => line.trim());
  const indexes = manaBoxHeaderIndexes(splitCsvLine(lines[headerIdx]));
  const nameIdx = indexes.name;
  const quantityIdx = indexes.quantity;
  if (nameIdx === undefined || quantityIdx === undefined) return [];

  const field = (fields: string[], idx: number | undefined): string =>
    idx === undefined ? '' : (fields[idx] ?? '').trim();

  const rows: ManaBoxCsvRow[] = [];
  for (const raw of lines.slice(headerIdx + 1)) {
    if (!raw.trim()) continue;

    const fields = splitCsvLine(raw);
    const name = field(fields, nameIdx);
    if (!name) continue;

    const quantity = Math.floor(Number(field(fields, quantityIdx)));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const foilValue = field(fields, indexes.foil).toLowerCase();
    rows.push({
      name,
      set: field(fields, indexes.set).toLowerCase(),
      collector_number: field(fields, indexes.collector_number),
      quantity,
      // ManaBox writes normal/foil/etched; etched foils count as foils.
      is_foil: foilValue === 'etched' || parseBoolean(foilValue),
      condition: normalizeManaBoxCondition(field(fields, indexes.condition)),
    });
  }

  return rows;
}

/**
 * Parse CSV text into collection rows. Tolerant by design:
 * - the header row (or any row whose card_id column reads "card_id") is ignored,
 * - blank and malformed lines (missing card_id or non-positive quantity) are skipped.
 */
export function parseCsv(text: string): CollectionCsvRow[] {
  const rows: CollectionCsvRow[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const fields = splitCsvLine(raw);
    const name = (fields[0] ?? '').trim();
    const cardId = (fields[1] ?? '').trim();
    if (!cardId || cardId.toLowerCase() === 'card_id') continue;

    const quantity = Math.floor(Number(fields[2]));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const priceRaw = Number(fields[5]);
    const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;

    rows.push({
      name,
      card_id: cardId,
      quantity,
      is_foil: parseBoolean(fields[3] ?? ''),
      condition: normalizeCondition(fields[4] ?? ''),
      price_usd: price,
    });
  }

  return rows;
}
