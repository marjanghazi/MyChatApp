from __future__ import annotations

from pathlib import Path
import os
from dotenv import load_dotenv


def _candidate_env_paths() -> list[Path]:
    """Match backend/src/config/loadEnv.js precedence for Python backend.

    Order mirrors JS backend behavior:
    1) py_backend/.env
    2) repository-root .env
    3) repository-root frontend/.env
    """

    base = Path(__file__).resolve()
    py_backend_dir = base.parents[1]
    repo_root = base.parents[2]

    return [
        py_backend_dir / '.env',
        repo_root / 'backend' / '.env',
        repo_root / '.env',
        repo_root / 'frontend' / '.env',
    ]


def load_env() -> None:
    for path in _candidate_env_paths():
        if path.exists():
            load_dotenv(path, override=False)


def cors_origins() -> list[str]:
    raw = os.getenv('CORS_ORIGINS', '')
    return [origin.strip() for origin in raw.split(',') if origin.strip()]


def port() -> int:
    return int(os.getenv('PORT', '4000'))
