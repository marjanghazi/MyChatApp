from __future__ import annotations

import os
import firebase_admin
from firebase_admin import credentials, firestore, storage


def _normalize_bucket_name(raw: str) -> str:
    value = (raw or '').strip()
    if not value:
        return ''
    if value.startswith('gs://'):
        value = value[5:]
    if value.endswith('/'):
        value = value[:-1]
    if value.endswith('.firebasestorage.app'):
        project = value.removesuffix('.firebasestorage.app')
        if project:
            return f'{project}.appspot.com'
    return value


def resolve_storage_bucket_name() -> str:
    explicit = (
        os.getenv('FIREBASE_STORAGE_BUCKET')
        or os.getenv('REACT_APP_FIREBASE_STORAGE_BUCKET')
        or ''
    )
    normalized = _normalize_bucket_name(explicit)
    if normalized:
        return normalized
    project_id = (os.getenv('FIREBASE_PROJECT_ID') or os.getenv('REACT_APP_FIREBASE_PROJECT_ID') or '').strip()
    if project_id:
        return f'{project_id}.appspot.com'
    return ''


def init_firebase() -> None:
    if firebase_admin._apps:
        return

    project_id = os.getenv('FIREBASE_PROJECT_ID')
    client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
    private_key = (os.getenv('FIREBASE_PRIVATE_KEY') or '').replace('\\n', '\n')
    storage_bucket_name = resolve_storage_bucket_name() or None

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
