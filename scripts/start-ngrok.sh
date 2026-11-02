#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_ngrok="$project_root/scripts/bin/ngrok"

if [[ -x "$local_ngrok" ]]; then
  ngrok_bin="$local_ngrok"
elif command -v ngrok >/dev/null 2>&1; then
  ngrok_bin="$(command -v ngrok)"
else
  echo "ngrok is not installed. See https://ngrok.com/download/linux" >&2
  exit 1
fi

if ! "$ngrok_bin" config check >/dev/null 2>&1; then
  echo "ngrok is not authenticated." >&2
  echo "Run: $ngrok_bin config add-authtoken YOUR_NGROK_AUTHTOKEN" >&2
  exit 1
fi

if [[ -n "${NGROK_URL:-}" && "$NGROK_URL" != https://* ]]; then
  echo "NGROK_URL must be an HTTPS URL." >&2
  exit 1
fi

if ! curl -fsS http://localhost:4000/api/health >/dev/null; then
  echo "Python backend is not healthy. Start it with: npm run backend" >&2
  exit 1
fi

if ! curl -fsS http://localhost:4000/api/health/db >/dev/null; then
  echo "PostgreSQL is not healthy. Fix py_backend/.env and start PostgreSQL." >&2
  exit 1
fi

echo "Building the frontend with same-origin API requests..."
REACT_APP_API_BASE_URL= npm --prefix "$project_root/frontend" run build

if [[ ! -f "$project_root/frontend/build/index.html" ]]; then
  echo "Frontend build is missing." >&2
  exit 1
fi

if [[ -n "${NGROK_URL:-}" ]]; then
  tunnel_url="${NGROK_URL%/}"
  echo "Opening $tunnel_url for the frontend and Python API..."
  exec "$ngrok_bin" http 4000 --url "$tunnel_url"
fi

echo "ngrok will assign an HTTPS URL for the frontend and Python API."
echo "Use the same URL in each browser; changing it creates a different local encryption-key store."
exec "$ngrok_bin" http 4000
