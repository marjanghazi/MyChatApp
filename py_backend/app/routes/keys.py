"""Retired v1 endpoints: never accept or return server-held E2EE secrets."""
from fastapi import APIRouter, HTTPException
router = APIRouter(prefix='/api/keys', tags=['retired crypto protocol'])

@router.api_route('/{path:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def retired(path: str):
    raise HTTPException(status_code=410, detail='Crypto protocol v1 is retired. Update the client and use /api/keys/v2.')
