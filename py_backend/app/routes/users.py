from __future__ import annotations
from fastapi import APIRouter, HTTPException
from app.db import q
from app.errors import must, phone_variants

router = APIRouter(prefix='/api/users', tags=['users'])

@router.post('/check-phone')
def check_phone(body: dict):
    phone = body.get('phoneNumber'); must(phone,'phoneNumber')
    vars = phone_variants(phone)
    row = q("SELECT uid FROM users WHERE phone_number = ANY(%s) OR phone_lookup_keys && %s LIMIT 1", (vars, vars), fetch='one')
    return {'available': row is None, 'normalizedPhone': vars[0], 'phoneVariants': vars}

@router.post('/profile')
def upsert_profile(body: dict):
    uid = body.get('uid'); must(uid,'uid')
    q("""INSERT INTO users(uid,email,password_hash,display_name,phone_number,phone_lookup_keys,contacts,is_online,last_seen,active_at)
         VALUES (%s,%s,%s,%s,%s,%s,%s,true,now(),now())
         ON CONFLICT(uid) DO UPDATE SET display_name=EXCLUDED.display_name,email=EXCLUDED.email,phone_number=EXCLUDED.phone_number,phone_lookup_keys=EXCLUDED.phone_lookup_keys,updated_at=now()""",
      (uid, body.get('email',''), body.get('passwordHash','local'), body.get('displayName',''), body.get('phoneNumber',''), body.get('phoneLookupKeys',[]), []))
    return {'ok': True}

@router.get('/{uid}/profile')
def get_profile(uid: str):
    return {'profile': q('SELECT * FROM users WHERE uid=%s', (uid,), fetch='one')}

@router.post('/{uid}/presence')
def set_presence(uid: str, body: dict):
    q('UPDATE users SET is_online=%s,last_seen=now(),active_at=now() WHERE uid=%s', (bool(body.get('isOnline')), uid)); return {'ok':True}

@router.patch('/{uid}/profile')
def patch_profile(uid: str, body: dict):
    q('UPDATE users SET display_name=COALESCE(%s,display_name), photo_url=COALESCE(%s,photo_url), logo_url=COALESCE(%s,logo_url), updated_at=now() WHERE uid=%s', (body.get('displayName'), body.get('photoURL'), body.get('logoURL'), uid)); return {'ok':True}

@router.post('/{uid}/contacts')
def add_contact(uid: str, body: dict):
    phone=body.get('phoneNumber'); must(phone,'phoneNumber'); vars=phone_variants(phone)
    c=q('SELECT * FROM users WHERE phone_number = ANY(%s) OR phone_lookup_keys && %s LIMIT 1',(vars,vars), fetch='one')
    if not c: raise HTTPException(status_code=404, detail='No registered user found with that number.')
    if c['uid']==uid: raise HTTPException(status_code=400, detail='You cannot add your own number.')
    q('UPDATE users SET contacts = array_append(contacts,%s), updated_at=now() WHERE uid=%s AND NOT (%s = ANY(contacts))', (c['phone_number'],uid,c['phone_number']))
    return {'ok':True,'candidate':dict(c)}
