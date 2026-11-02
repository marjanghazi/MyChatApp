#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_dir="$project_root/py_backend"

if [[ -x "$project_root/.venv/bin/python" ]]; then
  python_bin="$project_root/.venv/bin/python"
elif [[ -x "$backend_dir/.venv/bin/python" ]]; then
  python_bin="$backend_dir/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  python_bin="$(command -v python3)"
else
  echo "Python 3 was not found. Install Python 3 and py_backend/requirements.txt." >&2
  exit 1
fi

if ! "$python_bin" -c 'import fastapi, uvicorn, psycopg2' >/dev/null 2>&1; then
  echo "Python backend dependencies are missing." >&2
  echo "Run: $python_bin -m pip install -r $backend_dir/requirements.txt" >&2
  exit 1
fi

if ! PYTHONPATH="$backend_dir" "$python_bin" -c \
  'from app.config import load_env; load_env(); from app.db import db_healthcheck; db_healthcheck()' \
  >/dev/null 2>&1; then
  echo "PostgreSQL is unavailable or py_backend/.env has incorrect database settings." >&2
  echo "On Debian/Ubuntu, start it with: sudo systemctl start postgresql" >&2
  echo "Start PostgreSQL, then verify: pg_isready -h localhost -p 5432" >&2
  echo "Backend configuration: $backend_dir/.env" >&2
  exit 1
fi

cd "$backend_dir"
exec "$python_bin" -m uvicorn app.main:app \
  --host "${BACKEND_HOST:-0.0.0.0}" \
  --port "${PORT:-4000}" \
  --reload
