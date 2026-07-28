import { ScryfallCard } from './scryfallTypes';

/**
 * Scryfall API client (raw). Returns raw Scryfall JSON (`ScryfallCard`); the
 * mapper turns it into UnifiedCard. Moved here from `src/services/scryfall.ts`
 * so the adapter owns the transport; the legacy module now maps this output.
 *
 * Hardened wrapper around https://scryfall.com/docs/api:
 * - encodes query params
 * - sets the Accept header (User-Agent is a forbidden header in browsers)
 * - checks response.ok and surfaces Scryfall's error `details`
 * - throttles requests to respect Scryfall's ~10 req/s guidance
 * - caches card-by-id lookups in memory (card data is effectively immutable)
 */

const SCRYFALL_API = 'https://api.scryfall.com';
const MIN_REQUEST_INTERVAL_MS = 100; // Scryfall asks for 50–100ms between requests
const COLLECTION_CHUNK_SIZE = 75; // max identifiers per /cards/collection call

export class ScryfallHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ScryfallHttpError';
  }
}

// Serialize requests through a promise chain and enforce a minimum interval
// between them. This rate-limits every caller globally, not per-call.
let requestChain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

const throttle = (): Promise<void> => {
  const next = requestChain.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();
  });
  // Keep the chain alive even if a caller rejects downstream.
  requestChain = next.catch(() => {});
  return next;
};

interface ScryfallErrorBody {
  object?: string;
  status?: number;
  details?: string;
}

// Fetch an absolute Scryfall URL (pagination `next_page` links are absolute).
async function scryfallFetchUrl<T>(url: string, init?: RequestInit): Promise<T> {
  await throttle();
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const body = data as ScryfallErrorBody | null;
    throw new ScryfallHttpError(
      body?.details ?? `Scryfall request failed (${response.status})`,
      response.status,
    );
  }

  return data as T;
}

async function scryfallFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return scryfallFetchUrl<T>(`${SCRYFALL_API}${path}`, init);
}

// --- in-memory card cache (card data is immutable for a given id) ---
const cardCache = new Map<string, ScryfallCard>();

const cacheCard = (card: ScryfallCard | undefined | null): void => {
  if (card?.id) cardCache.set(card.id, card);
};

interface ScryfallList<T> {
  data: T[];
  has_more?: boolean;
  next_page?: string;
}

/**
 * Search cards using Scryfall query syntax. Returns [] when nothing matches
 * (Scryfall answers 404 for an empty result set — that is not an error here).
 */
export const searchCards = async (query: string, signal?: AbortSignal): Promise<ScryfallCard[]> => {
  try {
    const result = await scryfallFetch<ScryfallList<ScryfallCard>>(
      `/cards/search?q=${encodeURIComponent(query)}`,
      { signal },
    );
    result.data?.forEach(cacheCard);
    return result.data ?? [];
  } catch (error) {
    if (error instanceof ScryfallHttpError && error.status === 404) {
      return [];
    }
    throw error;
  }
};

export const getRandomCards = async (count = 10, signal?: AbortSignal): Promise<ScryfallCard[]> => {
  const cards: ScryfallCard[] = [];
  for (let i = 0; i < count; i++) {
    const card = await scryfallFetch<ScryfallCard>('/cards/random', { signal });
    cacheCard(card);
    cards.push(card);
  }
  return cards;
};

export const getCardById = async (cardId: string, signal?: AbortSignal): Promise<ScryfallCard> => {
  const cached = cardCache.get(cardId);
  if (cached) return cached;

  const card = await scryfallFetch<ScryfallCard>(`/cards/${cardId}`, { signal });
  cacheCard(card);
  return card;
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Batch-fetch cards by exact name via POST /cards/collection, chunked at 75.
 * Returns a lookup keyed by lower-cased name — indexed by both the full name
 * and, for double-faced cards, the front-face name.
 */
export const getCardsByNames = async (
  names: string[],
  signal?: AbortSignal,
): Promise<Map<string, ScryfallCard>> => {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const byName = new Map<string, ScryfallCard>();

  for (const chunk of chunkArray(unique, COLLECTION_CHUNK_SIZE)) {
    const result = await scryfallFetch<ScryfallList<ScryfallCard>>('/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
      signal,
    });
    result.data?.forEach((card) => {
      cacheCard(card);
      byName.set(card.name.toLowerCase(), card);
      const frontFace = card.card_faces?.[0]?.name;
      if (frontFace) byName.set(frontFace.toLowerCase(), card);
    });
  }

  return byName;
};

/**
 * Fuzzy single-card lookup via GET /cards/named. Resolves flavor / alternate
 * printed names that the exact /cards/collection endpoint misses. Returns null
 * when unmatched.
 */
export const getCardByFuzzyName = async (
  name: string,
  signal?: AbortSignal,
): Promise<ScryfallCard | null> => {
  try {
    const card = await scryfallFetch<ScryfallCard>(`/cards/named?fuzzy=${encodeURIComponent(name)}`, { signal });
    cacheCard(card);
    return card;
  } catch (error) {
    if (error instanceof ScryfallHttpError && error.status === 404) return null;
    throw error;
  }
};

/**
 * Resolve a list of card names to cards, keyed by the requested (lower-cased)
 * name. Uses the fast batched exact lookup first, then falls back to a fuzzy
 * lookup for the few names it misses.
 */
export const resolveCardsByNames = async (
  names: string[],
  signal?: AbortSignal,
): Promise<Map<string, ScryfallCard>> => {
  const byRequested = new Map<string, ScryfallCard>();
  const batch = await getCardsByNames(names, signal);

  const misses: string[] = [];
  for (const raw of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    const hit = batch.get(raw.toLowerCase());
    if (hit) byRequested.set(raw.toLowerCase(), hit);
    else misses.push(raw);
  }

  for (const name of misses) {
    const card = await getCardByFuzzyName(name, signal);
    if (card) byRequested.set(name.toLowerCase(), card);
  }

  return byRequested;
};

/** Lookup key for a specific printing: lower-cased "set:collector_number". */
export const setNumberKey = (set: string, collectorNumber: string): string =>
  `${set.trim().toLowerCase()}:${collectorNumber.trim().toLowerCase()}`;

/**
 * Batch-fetch exact printings by set code + collector number via
 * POST /cards/collection, chunked at 75. Returns a lookup keyed by
 * setNumberKey(set, collector_number).
 */
export const getCardsBySetNumber = async (
  identifiers: { set: string; collector_number: string }[],
  signal?: AbortSignal,
): Promise<Map<string, ScryfallCard>> => {
  const seen = new Set<string>();
  const unique: { set: string; collector_number: string }[] = [];
  for (const { set, collector_number } of identifiers) {
    const normalizedSet = set.trim().toLowerCase();
    const normalizedNumber = collector_number.trim();
    if (!normalizedSet || !normalizedNumber) continue;
    const key = setNumberKey(normalizedSet, normalizedNumber);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ set: normalizedSet, collector_number: normalizedNumber });
  }

  const byKey = new Map<string, ScryfallCard>();
  for (const chunk of chunkArray(unique, COLLECTION_CHUNK_SIZE)) {
    const result = await scryfallFetch<ScryfallList<ScryfallCard>>('/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk }),
      signal,
    });
    result.data?.forEach((card) => {
      cacheCard(card);
      if (card.set && card.collector_number) {
        byKey.set(setNumberKey(card.set, card.collector_number), card);
      }
    });
  }

  return byKey;
};

/**
 * Batch-fetch cards by id via POST /cards/collection, chunked at 75.
 * Ids already in the in-memory cache are served without a network call;
 * the result preserves the requested order.
 */
export const getCardsByIds = async (
  cardIds: string[],
  signal?: AbortSignal,
): Promise<ScryfallCard[]> => {
  const missing = [...new Set(cardIds)].filter((id) => !cardCache.has(id));

  for (const chunk of chunkArray(missing, COLLECTION_CHUNK_SIZE)) {
    const result = await scryfallFetch<ScryfallList<ScryfallCard>>('/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
      signal,
    });
    result.data?.forEach(cacheCard);
  }

  return cardIds
    .map((id) => cardCache.get(id))
    .filter((card): card is ScryfallCard => Boolean(card));
};

// Printings are shared per card *name*, so cache them by lower-cased name.
const MAX_PRINTINGS = 120;
const printingsCache = new Map<string, ScryfallCard[]>();

/**
 * Fetch every printing/edition of a card (release order), following pagination
 * up to MAX_PRINTINGS. Uses the card's own `prints_search_uri` when present,
 * otherwise an exact-name prints search.
 */
export const getCardPrintings = async (
  card: Pick<ScryfallCard, 'name' | 'prints_search_uri'>,
  signal?: AbortSignal,
): Promise<ScryfallCard[]> => {
  const cacheKey = card.name.toLowerCase();
  const cached = printingsCache.get(cacheKey);
  if (cached) return cached;

  const firstPage =
    card.prints_search_uri ??
    `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(`!"${card.name}"`)}&unique=prints&order=released`;

  const printings: ScryfallCard[] = [];
  let nextUrl: string | undefined = firstPage;
  try {
    while (nextUrl && printings.length < MAX_PRINTINGS) {
      const page: ScryfallList<ScryfallCard> = await scryfallFetchUrl<ScryfallList<ScryfallCard>>(nextUrl, { signal });
      page.data?.forEach(cacheCard);
      printings.push(...(page.data ?? []));
      nextUrl = page.has_more ? page.next_page : undefined;
    }
  } catch (error) {
    // 404 = no result set (e.g. odd names); treat as "no other printings".
    if (!(error instanceof ScryfallHttpError && error.status === 404)) {
      throw error;
    }
  }

  const result = printings.slice(0, MAX_PRINTINGS);
  printingsCache.set(cacheKey, result);
  return result;
};
