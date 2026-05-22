from fastapi import APIRouter
from app.db import q
from app.errors import must
router = APIRouter(prefix='/api/thread', tags=['thread'])

@router.get('/users')
def users(excludeUid: str | None = None):
    rows=q('SELECT * FROM users', fetch='all') or []
    return {'users':[r for r in rows if r['uid']!=excludeUid]}

@router.get('/conversations')
def conv(uid: str):
    must(uid,'uid'); rows=q('SELECT * FROM conversations WHERE %s = ANY(participants)', (uid,), fetch='all') or []
    return {'conversations': {r['id']: dict(r) for r in rows}}

@router.patch('/conversations/{conversation_id}/delivered')
def d(conversation_id: str):
    q("UPDATE conversations SET last_message_status='delivered',updated_at=now() WHERE id=%s", (conversation_id,)); return {'ok':True}

@router.get('/groups')
def groups(uid: str):
    must(uid,'uid'); rows=q('SELECT * FROM groups WHERE %s = ANY(member_ids) ORDER BY name',(uid,), fetch='all') or []
    return {'groups':[{'id':str(r['id']), **dict(r)} for r in rows]}

@router.get('/channels')
def channels():
    rows=q('SELECT * FROM channels', fetch='all') or []
    return {'channels':[{'id':str(r['id']), **dict(r)} for r in rows]}
