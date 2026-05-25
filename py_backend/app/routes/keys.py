from __future__ import annotations

import base64
import secrets

from fastapi import APIRouter, HTTPException

from app.db import q
from app.errors import must
from app.services.e2ee_service import E2EEService

router = APIRouter(prefix='/api/keys', tags=['keys'])
svc = E2EEService()


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


@router.post('/devices/register')
def register_device(body: dict):
    user_id = body.get('userId')
    device_id = body.get('deviceId') or secrets.token_hex(8)
    must(user_id, 'userId')

    identity_pub = body.get('identityPublicKeyB64')
    signed_prekey_pub = body.get('signedPrekeyPublicKeyB64')
    signed_prekey_sig = body.get('signedPrekeySignatureB64')

    must(identity_pub, 'identityPublicKeyB64')
    must(signed_prekey_pub, 'signedPrekeyPublicKeyB64')
    must(signed_prekey_sig, 'signedPrekeySignatureB64')

    q(
        'INSERT INTO user_devices(device_id,user_id,kex_algorithm,identity_public_key_b64,signed_prekey_public_key_b64,signed_prekey_signature_b64) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(device_id) DO UPDATE SET kex_algorithm=EXCLUDED.kex_algorithm, identity_public_key_b64=EXCLUDED.identity_public_key_b64, signed_prekey_public_key_b64=EXCLUDED.signed_prekey_public_key_b64, signed_prekey_signature_b64=EXCLUDED.signed_prekey_signature_b64, updated_at=now()',
        (device_id, user_id, svc.kex_algorithm, identity_pub, signed_prekey_pub, signed_prekey_sig),
    )
    return {'ok': True, 'deviceId': device_id, 'kexAlgorithm': svc.kex_algorithm}


@router.get('/bundle/{user_id}/{device_id}')
def key_bundle(user_id: str, device_id: str):
    row = q('SELECT * FROM user_devices WHERE user_id=%s AND device_id=%s', (user_id, device_id), fetch='one')
    if not row:
        raise HTTPException(status_code=404, detail='Device key bundle not found')
    return {
        'user_id': row['user_id'],
        'device_id': row['device_id'],
        'kex_algorithm': row['kex_algorithm'],
        'identity_public_key_b64': row['identity_public_key_b64'],
        'signed_prekey_public_key_b64': row['signed_prekey_public_key_b64'],
        'signed_prekey_signature_b64': row['signed_prekey_signature_b64'],
    }


@router.post('/demo/generate-x25519')
def generate_demo_keypair():
    pair = svc.suite.kex.generate_keypair()
    return {'privateKeyB64': _b64(pair.private_key), 'publicKeyB64': _b64(pair.public_key), 'kexAlgorithm': svc.kex_algorithm}
