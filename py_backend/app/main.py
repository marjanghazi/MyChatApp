from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import cors_origins, load_env
from app.firebase_client import init_firebase
from app.routes.auth import router as auth_router
from app.routes.chat import router as chat_router
from app.routes.community import router as community_router
from app.routes.e2ee import router as e2ee_router
from app.routes.media import router as media_router
from app.routes.thread import router as thread_router
from app.routes.users import router as users_router

load_env()
init_firebase()

app = FastAPI(title='pqc-chat-backend', version='1.1.0')

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
    return {'ok': True, 'service': 'pqc-chat-backend', 'health': '/api/health', 'docs': '/docs'}


@app.get('/api/health')
def health():
    return {'ok': True, 'service': 'pqc-chat-backend'}


app.include_router(auth_router)
app.include_router(community_router)
app.include_router(users_router)
app.include_router(thread_router)
app.include_router(media_router)
app.include_router(chat_router)
app.include_router(e2ee_router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    message = 'Not Found' if exc.status_code == 404 else str(exc.detail)
    return JSONResponse(status_code=exc.status_code, content={'message': message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    message = first.get('msg') or 'Validation error'
    return JSONResponse(status_code=422, content={'message': message})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={'message': str(exc) or 'Internal Server Error'})
