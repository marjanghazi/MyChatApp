from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import cors_origins, load_env
load_env()

from app.db import db_healthcheck, init_db
from app.routes.auth import router as auth_router
from app.routes.admin import router as admin_router
from app.routes.chat import router as chat_router
from app.routes.keys import router as keys_router
from app.routes.crypto_keys import router as crypto_keys_router
from app.routes.crypto_activity import router as crypto_activity_router
from app.routes.community import router as community_router
from app.routes.media import router as media_router
from app.routes.thread import router as thread_router
from app.routes.users import router as users_router

load_env()
init_db()

app = FastAPI(title='pqc-chat-backend', version='1.1.0')
frontend_build = Path(__file__).resolve().parents[2] / 'frontend' / 'build'

origins = cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/')
def root():
    if frontend_build.joinpath('index.html').is_file():
        return FileResponse(frontend_build / 'index.html')
    return {'ok': True, 'service': 'pqc-chat-backend', 'health': '/api/health', 'docs': '/docs'}


@app.get('/api/health')
def health():
    return {'ok': True, 'service': 'pqc-chat-backend'}


@app.get('/api/health/db')
def health_db():
    return db_healthcheck()


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(community_router)
app.include_router(users_router)
app.include_router(thread_router)
app.include_router(media_router)
app.include_router(chat_router)
app.include_router(crypto_keys_router)
app.include_router(crypto_activity_router)
app.include_router(keys_router)


@app.get('/{path:path}', include_in_schema=False)
def frontend_app(path: str):
    if path.startswith('api/') or path == 'api':
        raise StarletteHTTPException(status_code=404)
    build_root = frontend_build.resolve()
    requested = (build_root / path).resolve()
    if requested.is_relative_to(build_root) and requested.is_file():
        return FileResponse(requested)
    if path.startswith('static/'):
        raise StarletteHTTPException(status_code=404)
    index = build_root / 'index.html'
    if index.is_file():
        return FileResponse(index)
    raise StarletteHTTPException(status_code=404)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Preserve deliberate, domain-specific 404s (for example a contact that has
    # not registered an encryption bundle). Starlette uses the literal
    # ``Not Found`` for an unmatched route, which is the only case where adding
    # the requested path is more useful than echoing the detail.
    if exc.status_code == 404 and str(exc.detail) == 'Not Found':
        message = f'API route not found: {request.method} {request.url.path}'
    else:
        message = str(exc.detail)
    return JSONResponse(status_code=exc.status_code, content={'message': message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    message = first.get('msg') or 'Validation error'
    return JSONResponse(status_code=422, content={'message': message})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={'message': str(exc) or 'Internal Server Error'})
