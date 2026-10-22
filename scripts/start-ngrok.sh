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

if [[ -z "${NGROK_URL:-}" ]]; then
  echo "NGROK_URL is required to preserve browser encryption identities." >&2
  echo "Set it to your stable ngrok HTTPS URL, for example:" >&2
  echo "export NGROK_URL=https://your-static-domain.ngrok-free.app" >&2
  echo "Do not switch between localhost and ngrok for the same account." >&2
  exit 1
fi

if [[ "$NGROK_URL" != https://* ]]; then
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

if ! curl -fsS http://localhost:3000 >/dev/null; then
  echo "React frontend is not running. Start it with: npm run start:pqc" >&2
  exit 1
fi

echo "Opening $NGROK_URL for the frontend and proxied Python API..."
exec "$ngrok_bin" http 3000 --url "$NGROK_URL"
