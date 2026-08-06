/**
 * Instance-config resolution for the Jellyfin-style "enter your instance URL"
 * flow. When the app is wrapped in Capacitor (Android) nothing is baked at
 * build time — the end user points the app at their own Deckerr instance and we
 * discover its Supabase URL + anon key at runtime.
 *
 * Two ways to obtain a config:
 *  - `resolveInstanceFromUrl(url)`: fetch `<url>/config.js` (every Deckerr
 *    self-host serves it, exposing `window.__DECKERR_CONFIG__`) and read the
 *    Supabase URL + anon key out of it.
 *  - `buildManualConfig(url, key)`: advanced fallback — the user pastes the
 *    Supabase project URL and anon key directly.
 *
 * The URL parsing / validation here is deliberately pure (no DOM, no network)
 * so it can be unit-tested; only `resolveInstanceFromUrl` touches `fetch`, and
 * that is injectable.
 */

export interface InstanceConfig {
  /** Supabase project URL (e.g. https://xyz.supabase.co). */
  url: string;
  /** Supabase anon / publishable key. */
  anonKey: string;
}

export type InstanceErrorCode =
  | 'empty'
  | 'invalid-url'
  | 'insecure'
  | 'unreachable'
  | 'not-deckerr'
  | 'incomplete';

/** A validation / resolution failure carrying a machine-readable `code`. */
export class InstanceConfigError extends Error {
  readonly code: InstanceErrorCode;
  constructor(code: InstanceErrorCode, message: string) {
    super(message);
    this.name = 'InstanceConfigError';
    this.code = code;
  }
}

// http:// is tolerated only for these loopback hosts (local dev / emulator);
// everything else must be https so credentials never travel in the clear.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Parse + validate an https URL, tolerating a missing scheme (defaults to
 * https) and stripping any query/hash. Returns a normalised string without a
 * trailing slash. `label` tailors the error messages.
 */
function parseHttpsUrl(input: string, label: 'instance URL' | 'Supabase URL'): URL {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    throw new InstanceConfigError('empty', `Please enter the ${label}.`);
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new InstanceConfigError('invalid-url', `That doesn't look like a valid ${label}.`);
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new InstanceConfigError('insecure', `The ${label} must use https://.`);
  }
  url.search = '';
  url.hash = '';
  return url;
}

/** Normalise a Deckerr instance base URL (origin + path, no trailing slash). */
export function normalizeInstanceUrl(input: string): string {
  const url = parseHttpsUrl(input, 'instance URL');
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Normalise a Supabase project URL to its origin. */
export function normalizeSupabaseUrl(input: string): string {
  return parseHttpsUrl(input, 'Supabase URL').origin;
}

/**
 * Pull the Supabase URL + anon key out of a Deckerr `config.js` payload of the
 * form `window.__DECKERR_CONFIG__ = { SUPABASE_URL: "…", SUPABASE_ANON_KEY: "…" }`.
 * A string-scan (rather than `eval`) keeps us from executing remote code from a
 * URL the user typed. Returns `null` when the file isn't a Deckerr config.
 */
export function extractDeckerrConfig(
  scriptText: string,
): { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string } | null {
  if (!scriptText || !scriptText.includes('__DECKERR_CONFIG__')) return null;
  const grab = (key: string): string | undefined => {
    // key: "value" | 'value' | `value`, tolerating escaped quotes inside.
    const re = new RegExp(`${key}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`);
    const m = scriptText.match(re);
    return m?.[2];
  };
  return {
    SUPABASE_URL: grab('SUPABASE_URL'),
    SUPABASE_ANON_KEY: grab('SUPABASE_ANON_KEY'),
  };
}

/** Validate a manually-entered Supabase URL + anon key into an InstanceConfig. */
export function buildManualConfig(supabaseUrl: string, anonKey: string): InstanceConfig {
  const url = normalizeSupabaseUrl(supabaseUrl);
  const key = (anonKey ?? '').trim();
  if (!key) {
    throw new InstanceConfigError('incomplete', 'Please enter the Supabase anon key.');
  }
  return { url, anonKey: key };
}

/**
 * Discover an instance's Supabase config from its base URL by fetching
 * `<url>/config.js`. `fetchImpl` is injectable for tests.
 */
export async function resolveInstanceFromUrl(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstanceConfig> {
  const base = normalizeInstanceUrl(input);
  let res: Response;
  try {
    res = await fetchImpl(`${base}/config.js`, {
      headers: { Accept: 'application/javascript, text/javascript, */*' },
      cache: 'no-store',
    });
  } catch {
    throw new InstanceConfigError(
      'unreachable',
      "Couldn't reach that instance. Check the URL and your connection.",
    );
  }
  if (!res.ok) {
    throw new InstanceConfigError(
      'not-deckerr',
      "That doesn't look like a Deckerr instance (no config found).",
    );
  }
  const text = await res.text();
  const cfg = extractDeckerrConfig(text);
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    throw new InstanceConfigError(
      'incomplete',
      "That Deckerr instance isn't configured with a Supabase URL and key yet.",
    );
  }
  return buildManualConfig(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}
