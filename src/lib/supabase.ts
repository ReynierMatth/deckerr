import { createClient } from "@supabase/supabase-js";

/**
 * Runtime config injected by the container at startup: the Docker entrypoint
 * writes /config.js -> window.__DECKERR_CONFIG__ from SUPABASE_URL /
 * SUPABASE_ANON_KEY env vars. This keeps the published image generic — one
 * image, each instance points at its own Supabase, nothing baked at build time.
 * In dev (no container) config.js is empty, so we fall back to Vite's .env.
 */
declare global {
  interface Window {
    __DECKERR_CONFIG__?: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
  }
}

const runtime = typeof window !== 'undefined' ? window.__DECKERR_CONFIG__ : undefined;

const supabaseUrl = runtime?.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtime?.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase config (set SUPABASE_URL / SUPABASE_ANON_KEY on the container, or VITE_ equivalents in dev)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
