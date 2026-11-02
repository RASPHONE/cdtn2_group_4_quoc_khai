#!/bin/sh
# Runs at container start (nginx image executes /docker-entrypoint.d/*.sh).
# Writes the browser-safe settings from .env.local into env-config.js.
# Only these two public values are exposed - never the secret key.
set -eu

out=/usr/share/nginx/html/env-config.js
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

url="${VITE_SUPABASE_URL:-}"
key="${VITE_SUPABASE_ANON_KEY:-}"

cat > "$out" <<JS
window.__ENV__ = {
  VITE_SUPABASE_URL: "$(esc "$url")",
  VITE_SUPABASE_ANON_KEY: "$(esc "$key")"
};
JS

if [ -z "$url" ] || [ -z "$key" ]; then
  echo "env-config: WARNING - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing; check .env.local" >&2
else
  echo "env-config: app will use Supabase at $url"
fi
