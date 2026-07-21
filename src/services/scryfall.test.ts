import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchCards, getCardById, getCardsByIds } from './scryfall';

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const errJson = (status: number, details: string) => ({
  ok: false,
  status,
  json: async () => ({ object: 'error', status, details }),
});

describe('scryfall client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('URL-encodes the search query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchCards('c:rg t:"legendary creature"');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/cards/search?q=');
    expect(calledUrl).not.toContain(' '); // spaces must be percent-encoded
    expect(calledUrl).toContain(encodeURIComponent('c:rg t:"legendary creature"'));
  });

  it('returns [] when Scryfall answers 404 (no cards matched)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errJson(404, 'no cards found')));
    await expect(searchCards('bogus-nonsense-query')).resolves.toEqual([]);
  });

  it('throws on non-404 errors, surfacing Scryfall details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errJson(422, 'malformed query')));
    await expect(searchCards('bad')).rejects.toThrow('malformed query');
  });

  it('caches a card by id and serves the second lookup without a network call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ id: 'cache-1', name: 'Cached Card' }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getCardById('cache-1');
    const second = await getCardById('cache-1');

    expect(first.name).toBe('Cached Card');
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getCardsByIds dedupes ids and reuses the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ data: [{ id: 'batch-a', name: 'A' }, { id: 'batch-b', name: 'B' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCardsByIds(['batch-a', 'batch-b', 'batch-a']);

    expect(result.map((c) => c.id)).toEqual(['batch-a', 'batch-b', 'batch-a']);
    expect(fetchMock).toHaveBeenCalledTimes(1); // single /cards/collection chunk

    // Both ids are now cached — a second call makes no request.
    await getCardsByIds(['batch-a', 'batch-b']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
