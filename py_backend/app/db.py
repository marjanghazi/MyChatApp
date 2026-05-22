from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool


_POOL: SimpleConnectionPool | None = None


def _dsn() -> str:
    host = os.getenv('POSTGRES_HOST', 'localhost')
    port = os.getenv('POSTGRES_PORT', '5432')
    db = os.getenv('POSTGRES_DB', 'quantx_db')
    user = os.getenv('POSTGRES_USER', 'postgres')
    password = os.getenv('POSTGRES_PASSWORD', '')
    return f"host={host} port={port} dbname={db} user={user} password={password}"


def _pool() -> SimpleConnectionPool:
    global _POOL
    if _POOL is None:
        min_conn = int(os.getenv('POSTGRES_POOL_MIN', '1'))
        max_conn = int(os.getenv('POSTGRES_POOL_MAX', '12'))
        _POOL = SimpleConnectionPool(min_conn, max_conn, dsn=_dsn())
    return _POOL


@contextmanager
def get_conn():
    pool = _pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)


def init_db() -> None:
    schema = open(os.path.join(os.path.dirname(__file__), 'schema.sql'), 'r', encoding='utf-8').read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(schema)
        conn.commit()


def _adapt_param(value):
    if isinstance(value, dict):
        return psycopg2.extras.Json(value)
    return value


def _adapt_params(params: tuple) -> tuple:
    return tuple(_adapt_param(v) for v in params)


def q(query: str, params: tuple = (), fetch: str | None = None):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, _adapt_params(params))
            rows = None
            if fetch == 'one':
                rows = cur.fetchone()
            elif fetch == 'all':
                rows = cur.fetchall()
        conn.commit()
    return rows
