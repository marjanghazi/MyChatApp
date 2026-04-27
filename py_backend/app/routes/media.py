from __future__ import annotations

import base64
import time
import re

from fastapi import APIRouter, HTTPException
from google.api_core.exceptions import NotFound as GcsNotFound

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


def assert_allowed(path: str) -> None:
    if not any(rule.match(path) for rule in STORAGE_PATH_RULES):
        raise HTTPException(status_code=403, detail=f'storagePath not allowed: {path}')


def signed_url(path: str) -> str:
    blob = storage_bucket().blob(path)
    return blob.generate_signed_url(version='v4', expiration=60 * 60 * 24 * 365 * 400, method='GET')


@router.post('/upload')
def upload(body: dict):
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

    try:
        bucket = storage_bucket()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f'Firebase Storage misconfigured: {exc}') from exc

    blob = bucket.blob(file_path)
    try:
        blob.upload_from_string(base64.b64decode(data_base64), content_type=content_type)
    except GcsNotFound as exc:
        raise HTTPException(
            status_code=500,
            detail='Firebase Storage bucket was not found. Check FIREBASE_STORAGE_BUCKET and bucket name in Firebase Console.',
        ) from exc
    return {'ok': True, 'url': signed_url(file_path), 'path': file_path}


@router.post('/upload-by-path')
def upload_by_path(body: dict):
    storage_path = body.get('storagePath')
    content_type = body.get('contentType')
    data_base64 = body.get('dataBase64')

    must(storage_path, 'storagePath')
    must(content_type, 'contentType')
    must(data_base64, 'dataBase64')
    assert_allowed(storage_path)

    try:
        bucket = storage_bucket()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f'Firebase Storage misconfigured: {exc}') from exc

    blob = bucket.blob(storage_path)
    try:
        blob.upload_from_string(base64.b64decode(data_base64), content_type=content_type)
    except GcsNotFound as exc:
        raise HTTPException(
            status_code=500,
            detail='Firebase Storage bucket was not found. Check FIREBASE_STORAGE_BUCKET and bucket name in Firebase Console.',
        ) from exc
    return {'ok': True, 'url': signed_url(storage_path), 'path': storage_path}


@router.post('/delete-by-path')
def delete_by_path(body: dict):
    storage_path = body.get('storagePath')
    must(storage_path, 'storagePath')
    assert_allowed(storage_path)

    try:
        bucket = storage_bucket()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f'Firebase Storage misconfigured: {exc}') from exc

    blob = bucket.blob(storage_path)
    if blob.exists():
        blob.delete()
    return {'ok': True}
