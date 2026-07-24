#!/bin/sh
# Runtime config injection. The official nginx image runs every executable
# script in /docker-entrypoint.d/ before starting nginx, so this writes the
# app's /config.js from the container's env vars — making the same image work
# for any instance without rebuilding.
set -e

cat > /usr/share/nginx/html/config.js <<EOF
window.__DECKERR_CONFIG__ = {
  SUPABASE_URL: "${SUPABASE_URL:-}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY:-}"
};
EOF

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "deckerr: WARNING — SUPABASE_URL / SUPABASE_ANON_KEY not set; the app will fail to start." >&2
else
  echo "deckerr: runtime config written (SUPABASE_URL=${SUPABASE_URL})"
fi
