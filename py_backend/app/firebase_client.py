from __future__ import annotations

import os
from functools import lru_cache
import firebase_admin
from firebase_admin import credentials, firestore, storage


def _sanitize_bucket_name(raw: str) -> str:
    value = (raw or '').strip()
    if not value:
        return ''
    if value.startswith('gs://'):
        value = value[5:]
    if value.endswith('/'):
        value = value[:-1]
    return value


def _storage_bucket_candidates() -> list[str]:
    candidates: list[str] = []
    explicit_backend = _sanitize_bucket_name(os.getenv('FIREBASE_STORAGE_BUCKET') or '')
    explicit_frontend = _sanitize_bucket_name(os.getenv('REACT_APP_FIREBASE_STORAGE_BUCKET') or '')

    if explicit_backend:
        candidates.append(explicit_backend)
    if explicit_frontend and explicit_frontend not in candidates:
        candidates.append(explicit_frontend)

    project_id = (os.getenv('FIREBASE_PROJECT_ID') or os.getenv('REACT_APP_FIREBASE_PROJECT_ID') or '').strip()
    if project_id:
        for inferred in (f'{project_id}.firebasestorage.app', f'{project_id}.appspot.com'):
            if inferred not in candidates:
                candidates.append(inferred)
    return candidates


@lru_cache(maxsize=1)
def resolve_storage_bucket_name() -> str:
    candidates = _storage_bucket_candidates()
    if not candidates:
        return ''

    last_error = None
    for name in candidates:
        try:
            bucket = storage.bucket(name)
            if bucket.exists():
                return name
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue

    # Fall back to first candidate even if exists() could not be confirmed.
    # Upload route will raise a descriptive error with details if it fails.
    if last_error:
        return candidates[0]
    return candidates[0]


def resolve_configured_bucket_name() -> str:
    candidates = _storage_bucket_candidates()
    return candidates[0] if candidates else ''


def init_firebase() -> None:
    if firebase_admin._apps:
        return

    project_id = os.getenv('FIREBASE_PROJECT_ID')
    client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
    private_key = (os.getenv('FIREBASE_PRIVATE_KEY') or '').replace('\\n', '\n')
    storage_bucket_name = resolve_configured_bucket_name() or None

    options = {'storageBucket': storage_bucket_name} if storage_bucket_name else None

    if project_id and client_email and private_key:
        cred = credentials.Certificate(
            {
                'type': 'service_account',
                'project_id': project_id,
                'client_email': client_email,
                'private_key': private_key,
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        )
        if options:
            firebase_admin.initialize_app(cred, options)
        else:
            firebase_admin.initialize_app(cred)
    else:
        if options:
            firebase_admin.initialize_app(options=options)
        else:
            firebase_admin.initialize_app()


def db_client() -> firestore.Client:
    return firestore.client()


def storage_bucket():
    bucket_name = resolve_storage_bucket_name()
    return storage.bucket(bucket_name or None)
