"""Suite-aware public identity registry. Cryptographic verification happens on clients."""
from fastapi import APIRouter, Depends, HTTPException
from app.db import q, get_conn
from app.schemas.e2ee import RegisterBundles, SUITES
from app.security.request_auth import authenticated_user
from psycopg2.extras import Json

router = APIRouter(prefix='/api/keys/v2', tags=['public encryption identities'])

@router.post('/devices/register')
def register(body: RegisterBundles, user_id: str = Depends(authenticated_user)):
    if any(bundle.user_id != user_id for bundle in body.bundles):
        raise HTTPException(status_code=403, detail='Cannot register another user identity')
    with get_conn() as conn:
        with conn.cursor() as cur:
            for bundle in body.bundles:
                cur.execute('''INSERT INTO crypto_public_identities(user_id,suite_id,device_id,bundle)
                    VALUES (%s,%s,%s,%s) ON CONFLICT(user_id,suite_id) DO UPDATE
                    SET device_id=EXCLUDED.device_id,bundle=EXCLUDED.bundle,updated_at=now()''',
                    (user_id, bundle.suite_id, bundle.device_id, Json(bundle.model_dump())))
        conn.commit()
    return {'ok': True}

@router.get('/bundle/{user_id}/{suite_id}')
def bundle(user_id: str, suite_id: str, _viewer: str = Depends(authenticated_user)):
    if suite_id not in SUITES:
        raise HTTPException(status_code=400, detail='Unsupported cryptographic suite')
    row = q('SELECT bundle FROM crypto_public_identities WHERE user_id=%s AND suite_id=%s', (user_id, suite_id), fetch='one')
    if not row:
        raise HTTPException(status_code=404, detail='Contact must sign in with the updated app before encrypted messaging')
    return row['bundle']
