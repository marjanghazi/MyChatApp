from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv


def load_env() -> None:
    base = Path(__file__).resolve()
    env_paths = [
        base.parents[2] / '.env',
        base.parents[3] / '.env',
        base.parents[3] / 'frontend' / '.env',
    ]
    for p in env_paths:
        if p.exists():
            load_dotenv(p, override=False)


def cors_origins() -> list[str]:
    raw = os.getenv('CORS_ORIGINS', '')
    return [origin.strip() for origin in raw.split(',') if origin.strip()]


def port() -> int:
    return int(os.getenv('PORT', '4000'))
