// Runtime config placeholder.
// In the Docker image this file is OVERWRITTEN at container start (see
// docker/40-deckerr-config.sh) with values from the SUPABASE_URL /
// SUPABASE_ANON_KEY env vars. In local dev it stays empty and the app falls
// back to Vite's .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
window.__DECKERR_CONFIG__ = {};
