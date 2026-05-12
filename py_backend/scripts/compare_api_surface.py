#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def extract_js_routes() -> set[tuple[str, str]]:
    routes = set()
    for fp in Path('backend/src/routes').glob('*.js'):
        for line in fp.read_text().splitlines():
            match = re.search(r'router\.(get|post|patch|delete)\("([^"]+)"', line)
            if match:
                method = match.group(1).upper()
                path = re.sub(r':[A-Za-z_][A-Za-z0-9_]*', '{}', match.group(2))
                routes.add((method, path))
    return routes


def extract_py_routes() -> set[tuple[str, str]]:
    routes = set()
    for fp in Path('py_backend/app/routes').glob('*.py'):
        for line in fp.read_text().splitlines():
            match = re.search(r"@router\.(get|post|patch|delete)\('([^']+)'", line)
            if match:
                method = match.group(1).upper()
                path = re.sub(r'\{[^}]+\}', '{}', match.group(2))
                routes.add((method, path))
    return routes


if __name__ == '__main__':
    js_routes = extract_js_routes()
    py_routes = extract_py_routes()

    missing = sorted(js_routes - py_routes)
    extra = sorted(py_routes - js_routes)

    if missing or extra:
        print('❌ API surface mismatch')
        if missing:
            print('Missing in py_backend:')
            for route in missing:
                print('  ', route)
        if extra:
            print('Extra in py_backend:')
            for route in extra:
                print('  ', route)
        raise SystemExit(1)

    print(f'✅ API route parity verified ({len(js_routes)} routes).')
