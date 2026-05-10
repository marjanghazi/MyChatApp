from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Any


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


_CACHE: dict[str, _CacheEntry] = {}
_LOCK = Lock()


def get_cache(key: str):
    now = monotonic()
    with _LOCK:
        entry = _CACHE.get(key)
        if not entry:
            return None
        if entry.expires_at <= now:
            _CACHE.pop(key, None)
            return None
        return entry.value


def set_cache(key: str, value: Any, ttl_seconds: float) -> Any:
    expires_at = monotonic() + max(0.0, ttl_seconds)
    with _LOCK:
        _CACHE[key] = _CacheEntry(value=value, expires_at=expires_at)
    return value


def cached(key: str, ttl_seconds: float, loader):
    hit = get_cache(key)
    if hit is not None:
        return hit
    value = loader()
    return set_cache(key, value, ttl_seconds)


def invalidate_cache(*, key: str | None = None, prefix: str | None = None) -> None:
    with _LOCK:
        if key is not None:
            _CACHE.pop(key, None)
            return
        if prefix is None:
            _CACHE.clear()
            return
        stale_keys = [k for k in _CACHE.keys() if k.startswith(prefix)]
        for stale_key in stale_keys:
            _CACHE.pop(stale_key, None)
