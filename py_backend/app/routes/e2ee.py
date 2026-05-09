from __future__ import annotations

from fastapi import APIRouter
from firebase_admin import firestore

from app.e2ee import ALLOWED_ENCRYPTION_ALGORITHMS
from app.errors import must
from app.firebase_client import db_client
from app.e2ee.verify import verify_signed_prekey

router = APIRouter(prefix='/api/e2ee', tags=['e2ee'])


@router.post('/keys/publish')
def publish_keys(body: dict):
    uid = body.get('uid')
    device_id = body.get('deviceId')
    key_bundle = body.get('keyBundle') or {}
    must(uid, 'uid')
    must(device_id, 'deviceId')
    must(key_bundle.get('identityKey'), 'keyBundle.identityKey')
    must(key_bundle.get('signedPreKey'), 'keyBundle.signedPreKey')
    must(key_bundle.get('signingPublicKey'), 'keyBundle.signingPublicKey')
    must(key_bundle.get('signedPreKeySignature'), 'keyBundle.signedPreKeySignature')


    if not verify_signed_prekey(
        key_bundle.get('signingPublicKey'),
        key_bundle.get('signedPreKey'),
        key_bundle.get('signedPreKeySignature'),
    ):
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail='Invalid signed pre-key signature')
    one_time_pre_keys = key_bundle.get('oneTimePreKeys') or []
    if not isinstance(one_time_pre_keys, list):
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail='keyBundle.oneTimePreKeys must be a list')

    suite = key_bundle.get('suite') or {}
    algorithm = key_bundle.get('algorithm') or (f"{suite.get('kem')}+{suite.get('aead')}" if suite else 'X25519+AES-256-GCM')
    if algorithm not in ALLOWED_ENCRYPTION_ALGORITHMS and algorithm != 'ECDH-P256+AES-256-GCM':
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail='Unsupported key bundle algorithm')

    ref = db_client().collection('e2eeKeyBundles').document(f'{uid}:{device_id}')
    ref.set(
        {
            'uid': uid,
            'deviceId': device_id,
            'algorithm': 'P256+AES-256-GCM' if algorithm == 'ECDH-P256+AES-256-GCM' else algorithm,
            'suite': suite or None,
            'identityKey': key_bundle.get('identityKey'),
            'signedPreKey': key_bundle.get('signedPreKey'),
            'signingPublicKey': key_bundle.get('signingPublicKey'),
            'signedPreKeySignature': key_bundle.get('signedPreKeySignature'),
            'oneTimePreKeys': one_time_pre_keys,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'createdAt': firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    return {'ok': True}


@router.get('/keys/{uid}')
def get_user_key_bundles(uid: str):
    must(uid, 'uid')
    snapshot = db_client().collection('e2eeKeyBundles').where('uid', '==', uid).stream()
    bundles = [{'id': entry.id, **(entry.to_dict() or {})} for entry in snapshot]
    return {'bundles': bundles}


@router.post('/sessions/upsert')
def upsert_session(body: dict):
    session_id = body.get('sessionId')
    participant_uids = body.get('participantUids') or []
    ratchet_state = body.get('ratchetState') or {}
    must(session_id, 'sessionId')
    if not isinstance(participant_uids, list) or len(participant_uids) < 2:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail='participantUids must include both session participants')
    must(ratchet_state.get('rootKeyRef'), 'ratchetState.rootKeyRef')
    must(ratchet_state.get('chainKeyRef'), 'ratchetState.chainKeyRef')

    db_client().collection('e2eeSessions').document(session_id).set(
        {
            'participantUids': participant_uids,
            'ratchetState': ratchet_state,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'createdAt': firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    return {'ok': True}
