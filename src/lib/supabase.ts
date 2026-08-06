import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { InstanceConfig } from './instanceConfig';

export type { InstanceConfig } from './instanceConfig';

/**
 * Supabase client with lazy, reconfigurable initialisation.
 *
 * Historically this module created the client at import time and threw if no
 * config was present. That doesn't work for the Capacitor/Android build, where
 * the end user picks their instance at runtime (Jellyfin-style). So the client
 * is now created on first use, from whichever config is available:
 *
 *   1. Baked config — `window.__DECKERR_CONFIG__` (Docker self-host writes it)
 *      or Vite `VITE_*` env (local dev). When present the instance is "locked":
 *      the URL-entry screen is skipped and can't be changed from the UI.
 *   2. Stored config — an instance the user connected to at runtime, persisted
 *      in localStorage so it survives reloads (the Android case).
 *
 * Every call site keeps doing `import { supabase } from '.../lib/supabase'` and
 * using it directly; the exported `supabase` is a Proxy that resolves to the
 * lazily-created client on each access and throws a clear error only if used
 * before any instance is configured.
 */

declare global {
  interface Window {
    __DECKERR_CONFIG__?: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
  }
}

const STORAGE_KEY = 'deckerr.instance';

// PKCE is required for the native (Capacitor) OAuth deep-link flow — the app
// gets a short-lived `?code=` back and exchanges it via exchangeCodeForSession,
// instead of the implicit flow leaking tokens in the URL. It's also the more
// secure default on web. persist/autoRefresh/detectSessionInUrl keep the
// browser OAuth return working.
const AUTH_OPTIONS = {
  auth: {
    flowType: 'pkce' as const,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
};

let client: SupabaseClient | null = null;
let activeConfig: InstanceConfig | null = null;

/** Config injected at build/deploy time (Docker or dev env). */
function readBakedConfig(): InstanceConfig | null {
  const runtime = typeof window !== 'undefined' ? window.__DECKERR_CONFIG__ : undefined;
  const url = runtime?.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const anonKey = runtime?.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey };
  return null;
}

/** Config the user connected to at runtime, persisted across reloads. */
function readStoredConfig(): InstanceConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InstanceConfig>;
    if (parsed && typeof parsed.url === 'string' && typeof parsed.anonKey === 'string') {
      return { url: parsed.url, anonKey: parsed.anonKey };
    }
  } catch {
    // Corrupt/inaccessible storage — treat as "no stored config".
  }
  return null;
}

/** Create + memoise the client from the first available config source. */
function ensureClient(): SupabaseClient | null {
  if (client) return client;
  const config = readBakedConfig() ?? readStoredConfig();
  if (!config) return null;
  activeConfig = config;
  client = createClient(config.url, config.anonKey, AUTH_OPTIONS);
  return client;
}

/** True when a baked config exists — the instance is fixed and can't be changed from the UI. */
export function isInstanceLocked(): boolean {
  return readBakedConfig() !== null;
}

/** True once an instance (baked or stored) is available. */
export function isInstanceConfigured(): boolean {
  return ensureClient() !== null;
}

/** The active instance config, if any (used to show the current instance in the UI). */
export function getInstanceConfig(): InstanceConfig | null {
  ensureClient();
  return activeConfig;
}

/** Persist + activate a runtime-chosen instance, (re)creating the client. */
export function setInstanceConfig(config: InstanceConfig): void {
  activeConfig = config;
  client = createClient(config.url, config.anonKey, AUTH_OPTIONS);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Persistence is best-effort; the in-memory client still works this session.
    }
  }
}

/** Forget the stored instance and tear down the client (the "change instance" flow). */
export function clearInstanceConfig(): void {
  activeConfig = null;
  client = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — nothing more we can do.
    }
  }
}

function getClient(): SupabaseClient {
  const c = ensureClient();
  if (!c) {
    throw new Error(
      'Deckerr is not connected to an instance yet. Enter your instance URL to continue.',
    );
  }
  return c;
}

/**
 * A stand-in for the real client. Property access resolves the lazily-created
 * client and forwards to it (methods stay bound to the real client), so the
 * many `supabase.xxx(...)` call sites need no changes.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const value = Reflect.get(getClient(), prop) as unknown;
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(getClient()) : value;
  },
});
