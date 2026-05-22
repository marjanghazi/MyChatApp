from fastapi import APIRouter, HTTPException
from app.db import q
from app.errors import must
router = APIRouter(prefix='/api/community', tags=['community'])

@router.post('/groups', status_code=201)
def create_group(body: dict):
    must(body.get('name'),'name'); must(body.get('creatorId'),'creatorId')
    members=list(dict.fromkeys([body['creatorId'], *(body.get('memberIds') or [])]))
    row=q('INSERT INTO groups(name,description,photo_url,member_ids,admins,created_by) VALUES (%s,%s,%s,%s,%s,%s) RETURNING *', (body['name'].strip(), body.get('description','').strip(), body.get('photoURL','').strip(), members,[body['creatorId']],body['creatorId']), fetch='one')
    return {'id': str(row['id']), 'name': row['name'], 'memberIds': row['member_ids'], 'admins': row['admins']}

@router.post('/channels', status_code=201)
def create_channel(body: dict):
    must(body.get('name'),'name'); must(body.get('creatorId'),'creatorId')
    row=q('INSERT INTO channels(name,description,owner_id,follower_ids) VALUES (%s,%s,%s,%s) RETURNING *', (body['name'].strip(), body.get('description','').strip(), body['creatorId'], [body['creatorId']]), fetch='one')
    return {'id': str(row['id']), 'name': row['name']}

@router.post('/channels/{channel_id}/follow')
def follow(channel_id: str, body: dict):
    must(body.get('userId'),'userId'); q('UPDATE channels SET follower_ids=array_append(follower_ids,%s), updated_at=now() WHERE id=%s AND NOT (%s = ANY(follower_ids))',(body['userId'],channel_id,body['userId'])); return {'ok':True}

@router.post('/channels/{channel_id}/unfollow')
def unfollow(channel_id: str, body: dict):
    must(body.get('userId'),'userId'); q('UPDATE channels SET follower_ids=array_remove(follower_ids,%s), updated_at=now() WHERE id=%s',(body['userId'],channel_id)); return {'ok':True}

@router.post('/groups/{group_id}/leave')
def leave(group_id: str, body: dict):
    must(body.get('userId'),'userId'); uid=body['userId']; q('UPDATE groups SET member_ids=array_remove(member_ids,%s), admins=array_remove(admins,%s), updated_at=now() WHERE id=%s',(uid,uid,group_id)); return {'ok':True}

@router.post('/groups/{group_id}/members/add')
def add_member(group_id: str, body: dict):
    must(body.get('requesterId'),'requesterId'); must(body.get('memberUid'),'memberUid')
    g=q('SELECT admins FROM groups WHERE id=%s',(group_id,),fetch='one')
    if not g or body['requesterId'] not in g['admins']: raise HTTPException(status_code=403, detail='Only admins can add members.')
    q('UPDATE groups SET member_ids=array_append(member_ids,%s), updated_at=now() WHERE id=%s AND NOT (%s = ANY(member_ids))',(body['memberUid'],group_id,body['memberUid'])); return {'ok':True}

@router.post('/groups/{group_id}/members/remove')
def rem_member(group_id: str, body: dict):
    must(body.get('requesterId'),'requesterId'); must(body.get('memberUid'),'memberUid')
    g=q('SELECT admins, created_by FROM groups WHERE id=%s',(group_id,),fetch='one')
    if not g or body['requesterId'] not in g['admins']:
        raise HTTPException(status_code=403, detail='Only admins can remove members.')
    if body['memberUid'] == body['requesterId']:
        raise HTTPException(status_code=400, detail='Use Leave Group to remove yourself.')
    if body['memberUid'] == g['created_by']:
        raise HTTPException(status_code=400, detail='Group creator cannot be removed.')
    q('UPDATE groups SET member_ids=array_remove(member_ids,%s), admins=array_remove(admins,%s), updated_at=now() WHERE id=%s',(body['memberUid'],body['memberUid'],group_id)); return {'ok':True}

@router.post('/groups/{group_id}/admins/toggle')
def tog_admin(group_id: str, body: dict):
    must(body.get('requesterId'),'requesterId'); must(body.get('memberUid'),'memberUid')
    g=q('SELECT admins, created_by FROM groups WHERE id=%s',(group_id,),fetch='one')
    if not g or body['requesterId'] not in g['admins']:
        raise HTTPException(status_code=403, detail='Only admins can update admin rights.')
    if (not bool(body.get('makeAdmin'))) and body['memberUid'] == g['created_by']:
        raise HTTPException(status_code=400, detail='Group creator must remain an admin.')
    if body.get('makeAdmin'): q('UPDATE groups SET admins=array_append(admins,%s), updated_at=now() WHERE id=%s AND NOT (%s = ANY(admins))',(body['memberUid'],group_id,body['memberUid']))
    else: q('UPDATE groups SET admins=array_remove(admins,%s), updated_at=now() WHERE id=%s',(body['memberUid'],group_id))
    return {'ok':True}
