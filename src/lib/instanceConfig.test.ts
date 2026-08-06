import { describe, it, expect } from 'vitest';
import {
  normalizeInstanceUrl,
  normalizeSupabaseUrl,
  extractDeckerrConfig,
  buildManualConfig,
  resolveInstanceFromUrl,
  InstanceConfigError,
} from './instanceConfig';

describe('normalizeInstanceUrl', () => {
  it('defaults a bare host to https and strips trailing slash', () => {
    expect(normalizeInstanceUrl('deckerr.example.com/')).toBe('https://deckerr.example.com');
  });

  it('keeps a sub-path but drops query/hash', () => {
    expect(normalizeInstanceUrl('https://host.tld/deckerr/?x=1#y')).toBe('https://host.tld/deckerr');
  });

  it('allows http only for loopback hosts', () => {
    expect(normalizeInstanceUrl('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('rejects http for non-local hosts', () => {
    expect(() => normalizeInstanceUrl('http://deckerr.example.com')).toThrowError(
      /must use https/i,
    );
  });

  it('rejects an empty value', () => {
    expect(() => normalizeInstanceUrl('   ')).toThrowError(InstanceConfigError);
  });

  it('tags the error with a code', () => {
    try {
      normalizeInstanceUrl('http://deckerr.example.com');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InstanceConfigError);
      expect((e as InstanceConfigError).code).toBe('insecure');
    }
  });
});

describe('normalizeSupabaseUrl', () => {
  it('reduces to the origin', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1')).toBe('https://abc.supabase.co');
  });
});

describe('extractDeckerrConfig', () => {
  it('reads double-quoted values', () => {
    const js = 'window.__DECKERR_CONFIG__ = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon.key.123" };';
    expect(extractDeckerrConfig(js)).toEqual({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_ANON_KEY: 'anon.key.123',
    });
  });

  it('reads single-quoted values', () => {
    const js = "window.__DECKERR_CONFIG__ = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }";
    expect(extractDeckerrConfig(js)).toEqual({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_ANON_KEY: 'k',
    });
  });

  it('returns empty fields for the placeholder (empty) config', () => {
    expect(extractDeckerrConfig('window.__DECKERR_CONFIG__ = {};')).toEqual({
      SUPABASE_URL: undefined,
      SUPABASE_ANON_KEY: undefined,
    });
  });

  it('returns null when it is not a Deckerr config file', () => {
    expect(extractDeckerrConfig('<!doctype html><title>Not here</title>')).toBeNull();
  });
});

describe('buildManualConfig', () => {
  it('validates and returns the config', () => {
    expect(buildManualConfig('https://abc.supabase.co', '  anon-key ')).toEqual({
      url: 'https://abc.supabase.co',
      anonKey: 'anon-key',
    });
  });

  it('rejects a missing anon key', () => {
    expect(() => buildManualConfig('https://abc.supabase.co', '')).toThrowError(/anon key/i);
  });
});

describe('resolveInstanceFromUrl', () => {
  const okConfig = 'window.__DECKERR_CONFIG__ = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon.key" };';

  const fakeFetch = (status: number, body: string): typeof fetch =>
    (async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
      }) as Response) as unknown as typeof fetch;

  it('fetches <url>/config.js and returns the resolved config', async () => {
    const calls: string[] = [];
    const spyFetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return { ok: true, status: 200, text: async () => okConfig } as Response;
    }) as unknown as typeof fetch;

    const cfg = await resolveInstanceFromUrl('deckerr.example.com', spyFetch);
    expect(cfg).toEqual({ url: 'https://abc.supabase.co', anonKey: 'anon.key' });
    expect(calls[0]).toBe('https://deckerr.example.com/config.js');
  });

  it('errors when the instance is unreachable', async () => {
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(resolveInstanceFromUrl('https://x.example.com', failing)).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('errors when config.js is missing (404)', async () => {
    await expect(
      resolveInstanceFromUrl('https://x.example.com', fakeFetch(404, 'Not found')),
    ).rejects.toMatchObject({ code: 'not-deckerr' });
  });

  it('errors when the instance config has no Supabase values', async () => {
    await expect(
      resolveInstanceFromUrl('https://x.example.com', fakeFetch(200, 'window.__DECKERR_CONFIG__ = {};')),
    ).rejects.toMatchObject({ code: 'incomplete' });
  });
});
