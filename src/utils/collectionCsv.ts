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
