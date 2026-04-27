from __future__ import annotations

import base64
import time
import re
import os
from pathlib import Path
from urllib.parse import quote, unquote

from fastapi import APIRouter, HTTPException, Request
from google.api_core.exceptions import NotFound as GcsNotFound
from fastapi.responses import FileResponse

from app.errors import must
from app.firebase_client import storage_bucket

router = APIRouter(prefix='/api/media', tags=['media'])

STORAGE_PATH_RULES = [
    re.compile(r'^attachments/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^avatars/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^logos/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^direct/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^group/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^channel/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^group-attachments/[A-Za-z0-9_-]+/.+$'),
    re.compile(r'^channel-attachments/[A-Za-z0-9_-]+/.+$'),
]

LOCAL_MEDIA_ROOT = Path(os.getenv('LOCAL_MEDIA_ROOT', str(Path(__file__).resolve().parents[2] / 'local_media')))


def assert_allowed(path: str) -> None:
    if not any(rule.match(path) for rule in STORAGE_PATH_RULES):
        raise HTTPException(status_code=403, detail=f'storagePath not allowed: {path}')


def signed_url(path: str) -> str:
    blob = storage_bucket().blob(path)
    return blob.generate_signed_url(version='v4', expiration=60 * 60 * 24 * 365 * 400, method='GET')


def _resolve_local_file(storage_path: str) -> Path:
    clean_path = storage_path.strip().lstrip('/')
    assert_allowed(clean_path)
    file_path = (LOCAL_MEDIA_ROOT / clean_path).resolve()
    root = LOCAL_MEDIA_ROOT.resolve()
    if not str(file_path).startswith(str(root)):
        raise HTTPException(status_code=403, detail='Invalid storage path.')
    return file_path


def _local_url_for(request: Request, storage_path: str) -> str:
    encoded = quote(storage_path, safe='')
    return str(request.base_url) + f'api/media/local/{encoded}'


def _save_local(storage_path: str, content: bytes) -> None:
    file_path = _resolve_local_file(storage_path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)


def _upload_with_fallback(request: Request, storage_path: str, content_type: str, data: bytes) -> dict:
    try:
        bucket = storage_bucket()
        blob = bucket.blob(storage_path)
        blob.upload_from_string(data, content_type=content_type)
        return {'ok': True, 'url': signed_url(storage_path), 'path': storage_path, 'storage': 'firebase'}
    except Exception:  # noqa: BLE001
        _save_local(storage_path, data)
        return {'ok': True, 'url': _local_url_for(request, storage_path), 'path': storage_path, 'storage': 'local'}


@router.get('/local/{encoded_path:path}')
def get_local_file(encoded_path: str):
    storage_path = unquote(encoded_path)
    file_path = _resolve_local_file(storage_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail='File not found.')
    return FileResponse(file_path)


@router.post('/upload')
def upload(body: dict, request: Request):
    uid = body.get('uid')
    folder = body.get('folder')
    file_name = body.get('fileName')
    content_type = body.get('contentType')
    data_base64 = body.get('dataBase64')

    must(uid, 'uid')
    must(folder, 'folder')
    must(file_name, 'fileName')
    must(content_type, 'contentType')
    must(data_base64, 'dataBase64')

    safe_name = f"{int(time.time() * 1000)}_{file_name}"
    file_path = f'{folder}/{uid}/{safe_name}'
    assert_allowed(file_path)
    data = base64.b64decode(data_base64)
    return _upload_with_fallback(request, file_path, content_type, data)


@router.post('/upload-by-path')
def upload_by_path(body: dict, request: Request):
    storage_path = body.get('storagePath')
    content_type = body.get('contentType')
    data_base64 = body.get('dataBase64')

    must(storage_path, 'storagePath')
    must(content_type, 'contentType')
    must(data_base64, 'dataBase64')
    assert_allowed(storage_path)
    data = base64.b64decode(data_base64)
    return _upload_with_fallback(request, storage_path, content_type, data)


@router.post('/delete-by-path')
def delete_by_path(body: dict):
    storage_path = body.get('storagePath')
    must(storage_path, 'storagePath')
    assert_allowed(storage_path)

    deleted = False
    try:
        bucket = storage_bucket()
        blob = bucket.blob(storage_path)
        if blob.exists():
            blob.delete()
            deleted = True
    except Exception:  # noqa: BLE001
        pass

    file_path = _resolve_local_file(storage_path)
    if file_path.exists():
        file_path.unlink()
        deleted = True

    if not deleted:
        return {'ok': True, 'message': 'File already absent.'}
    return {'ok': True}
