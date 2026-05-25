"""E2EE key-management API routes.

The backend never decrypts message content here.
It stores/retrieves device bundles, prekeys, session state, and replay markers
so clients can perform end-to-end cryptography locally.
"""

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
    # Register/update a device key bundle used by peers for session bootstrap.
    user_id = body.get('userId')
    device_id = body.get('deviceId') or secrets.token_hex(8)
    must(user_id, 'userId')

    identity_pub = body.get('identityPublicKeyB64')
    signed_prekey_pub = body.get('signedPrekeyPublicKeyB64')
    signed_prekey_sig = body.get('signedPrekeySignatureB64')
    identity_sign_pub = body.get('identitySignPublicKeyB64')

    must(identity_pub, 'identityPublicKeyB64')
    must(signed_prekey_pub, 'signedPrekeyPublicKeyB64')
    must(signed_prekey_sig, 'signedPrekeySignatureB64')

    q(
        'INSERT INTO user_devices(device_id,user_id,kex_algorithm,identity_public_key_b64,signed_prekey_public_key_b64,signed_prekey_signature_b64,identity_sign_public_key_b64) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(device_id) DO UPDATE SET kex_algorithm=EXCLUDED.kex_algorithm, identity_public_key_b64=EXCLUDED.identity_public_key_b64, signed_prekey_public_key_b64=EXCLUDED.signed_prekey_public_key_b64, signed_prekey_signature_b64=EXCLUDED.signed_prekey_signature_b64, identity_sign_public_key_b64=EXCLUDED.identity_sign_public_key_b64, updated_at=now()',
        (device_id, user_id, svc.kex_algorithm, identity_pub, signed_prekey_pub, signed_prekey_sig, identity_sign_pub),
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
        'identity_sign_public_key_b64': row.get('identity_sign_public_key_b64'),
    }


@router.post('/demo/generate-x25519')
def generate_demo_keypair():
    pair = svc.suite.kex.generate_keypair()
    return {'privateKeyB64': _b64(pair.private_key), 'publicKeyB64': _b64(pair.public_key), 'kexAlgorithm': svc.kex_algorithm}


@router.post('/prekeys/upload')
def upload_prekeys(body: dict):
    user_id = body.get('userId')
    device_id = body.get('deviceId')
    prekeys = body.get('prekeys') or []
    must(user_id, 'userId')
    must(device_id, 'deviceId')
    if not isinstance(prekeys, list) or not prekeys:
        raise HTTPException(status_code=400, detail='prekeys must be a non-empty list')

    inserted = 0
    for item in prekeys:
        prekey_id = item.get('prekeyId')
        pub = item.get('publicKeyB64')
        if not prekey_id or not pub:
            continue
        q(
            'INSERT INTO one_time_prekeys(user_id,device_id,prekey_id,prekey_public_key_b64) VALUES (%s,%s,%s,%s) ON CONFLICT(device_id,prekey_id) DO NOTHING',
            (user_id, device_id, prekey_id, pub),
        )
        inserted += 1
    return {'ok': True, 'inserted': inserted}


@router.post('/prekeys/consume')
def consume_prekey(body: dict):
    user_id = body.get('userId')
    device_id = body.get('deviceId')
    must(user_id, 'userId')
    must(device_id, 'deviceId')

    row = q(
        'SELECT id, prekey_id, prekey_public_key_b64 FROM one_time_prekeys WHERE user_id=%s AND device_id=%s AND consumed_at IS NULL ORDER BY created_at LIMIT 1',
        (user_id, device_id),
        fetch='one',
    )
    if not row:
        raise HTTPException(status_code=404, detail='No one-time prekey available')

    q('UPDATE one_time_prekeys SET consumed_at=now() WHERE id=%s', (row['id'],))
    return {
        'ok': True,
        'prekeyId': row['prekey_id'],
        'publicKeyB64': row['prekey_public_key_b64'],
    }


@router.post('/sessions/upsert')
def upsert_session(body: dict):
    # Persist client-side ratchet/session state for cross-device/page continuity.
    thread_id = body.get('threadId')
    user_id = body.get('userId')
    peer_user_id = body.get('peerUserId')
    root_key_b64 = body.get('rootKeyB64')
    send_chain_key_b64 = body.get('sendChainKeyB64')
    recv_chain_key_b64 = body.get('recvChainKeyB64')
    must(thread_id, 'threadId')
    must(user_id, 'userId')
    must(peer_user_id, 'peerUserId')
    must(root_key_b64, 'rootKeyB64')
    must(send_chain_key_b64, 'sendChainKeyB64')
    must(recv_chain_key_b64, 'recvChainKeyB64')

    q(
        'INSERT INTO e2ee_sessions(thread_id,user_id,peer_user_id,root_key_b64,send_chain_key_b64,recv_chain_key_b64,send_counter,recv_counter) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(thread_id,user_id,peer_user_id) DO UPDATE SET root_key_b64=EXCLUDED.root_key_b64, send_chain_key_b64=EXCLUDED.send_chain_key_b64, recv_chain_key_b64=EXCLUDED.recv_chain_key_b64, send_counter=EXCLUDED.send_counter, recv_counter=EXCLUDED.recv_counter, updated_at=now()',
        (thread_id, user_id, peer_user_id, root_key_b64, send_chain_key_b64, recv_chain_key_b64, int(body.get('sendCounter') or 0), int(body.get('recvCounter') or 0)),
    )
    return {'ok': True}


@router.get('/sessions/{thread_id}/{user_id}/{peer_user_id}')
def get_session(thread_id: str, user_id: str, peer_user_id: str):
    row = q('SELECT * FROM e2ee_sessions WHERE thread_id=%s AND user_id=%s AND peer_user_id=%s', (thread_id, user_id, peer_user_id), fetch='one')
    if not row:
        raise HTTPException(status_code=404, detail='Session not found')
    return {
        'threadId': row['thread_id'],
        'userId': row['user_id'],
        'peerUserId': row['peer_user_id'],
        'rootKeyB64': row['root_key_b64'],
        'sendChainKeyB64': row['send_chain_key_b64'],
        'recvChainKeyB64': row['recv_chain_key_b64'],
        'sendCounter': row['send_counter'],
        'recvCounter': row['recv_counter'],
    }


@router.post('/sessions/reset')
def reset_session(body: dict):
    thread_id = body.get('threadId')
    user_id = body.get('userId')
    peer_user_id = body.get('peerUserId')
    must(thread_id, 'threadId')
    must(user_id, 'userId')
    must(peer_user_id, 'peerUserId')
    q('DELETE FROM e2ee_sessions WHERE thread_id=%s AND user_id=%s AND peer_user_id=%s', (thread_id, user_id, peer_user_id))
    return {'ok': True}


@router.post('/replay/check')
def replay_check(body: dict):
    # Replay guard lookup by (thread, recipient, sender, msg_counter).
    thread_id = body.get('threadId')
    recipient_user_id = body.get('recipientUserId')
    sender_user_id = body.get('senderUserId')
    msg_counter = int(body.get('msgCounter') or 0)
    must(thread_id, 'threadId')
    must(recipient_user_id, 'recipientUserId')
    must(sender_user_id, 'senderUserId')
    if msg_counter <= 0:
        raise HTTPException(status_code=400, detail='msgCounter must be > 0')

    row = q('SELECT id FROM e2ee_replay_index WHERE thread_id=%s AND recipient_user_id=%s AND sender_user_id=%s AND msg_counter=%s',
            (thread_id, recipient_user_id, sender_user_id, msg_counter), fetch='one')
    return {'ok': True, 'seen': bool(row)}


@router.post('/replay/mark')
def replay_mark(body: dict):
    # Mark a counter as consumed to detect duplicate/replayed envelopes.
    thread_id = body.get('threadId')
    recipient_user_id = body.get('recipientUserId')
    sender_user_id = body.get('senderUserId')
    msg_counter = int(body.get('msgCounter') or 0)
    must(thread_id, 'threadId')
    must(recipient_user_id, 'recipientUserId')
    must(sender_user_id, 'senderUserId')
    if msg_counter <= 0:
        raise HTTPException(status_code=400, detail='msgCounter must be > 0')

    q('INSERT INTO e2ee_replay_index(thread_id,recipient_user_id,sender_user_id,msg_counter) VALUES (%s,%s,%s,%s) ON CONFLICT(thread_id, recipient_user_id, sender_user_id, msg_counter) DO NOTHING',
      (thread_id, recipient_user_id, sender_user_id, msg_counter))
    return {'ok': True}
