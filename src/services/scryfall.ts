import { Card } from '../types';

/**
 * Scryfall API client.
 *
 * Hardened wrapper around https://scryfall.com/docs/api:
 * - encodes query params
 * - sets the Accept header (User-Agent is a forbidden header in browsers, so it
 *   cannot be set from fetch — the browser sends its own)
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

async function scryfallFetch<T>(path: string, init?: RequestInit): Promise<T> {
  await throttle();
  const response = await fetch(`${SCRYFALL_API}${path}`, {
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

// --- in-memory card cache (card data is immutable for a given id) ---
const cardCache = new Map<string, Card>();

const cacheCard = (card: Card | undefined | null): void => {
  if (card?.id) cardCache.set(card.id, card);
};

interface ScryfallList<T> {
  data: T[];
}

/**
 * Search cards using Scryfall query syntax. Returns [] when nothing matches
 * (Scryfall answers 404 for an empty result set — that is not an error here).
 */
export const searchCards = async (query: string, signal?: AbortSignal): Promise<Card[]> => {
  try {
    const result = await scryfallFetch<ScryfallList<Card>>(
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

export const getRandomCards = async (count = 10, signal?: AbortSignal): Promise<Card[]> => {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = await scryfallFetch<Card>('/cards/random', { signal });
    cacheCard(card);
    cards.push(card);
  }
  return cards;
};

export const getCardById = async (cardId: string, signal?: AbortSignal): Promise<Card> => {
  const cached = cardCache.get(cardId);
  if (cached) return cached;

  const card = await scryfallFetch<Card>(`/cards/${cardId}`, { signal });
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
 * Batch-fetch cards by exact name via POST /cards/collection, chunked at 75
 * (instead of one /cards/search per card). Returns a lookup keyed by
 * lower-cased name — indexed by both the full name and, for double-faced
 * cards, the front-face name — so callers can resolve each requested name.
 */
export const getCardsByNames = async (
  names: string[],
  signal?: AbortSignal,
): Promise<Map<string, Card>> => {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const byName = new Map<string, Card>();

  for (const chunk of chunkArray(unique, COLLECTION_CHUNK_SIZE)) {
    const result = await scryfallFetch<ScryfallList<Card>>('/cards/collection', {
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
 * Batch-fetch cards by id via POST /cards/collection, chunked at 75.
 * Ids already in the in-memory cache are served without a network call;
 * the result preserves the requested order.
 */
export const getCardsByIds = async (cardIds: string[], signal?: AbortSignal): Promise<Card[]> => {
  const missing = [...new Set(cardIds)].filter((id) => !cardCache.has(id));

  for (const chunk of chunkArray(missing, COLLECTION_CHUNK_SIZE)) {
    const result = await scryfallFetch<ScryfallList<Card>>('/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
      signal,
    });
    result.data?.forEach(cacheCard);
  }

  return cardIds
    .map((id) => cardCache.get(id))
    .filter((card): card is Card => Boolean(card));
};
