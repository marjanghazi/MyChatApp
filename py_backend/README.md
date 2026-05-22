# PQC Chat Python Backend (PostgreSQL)

FastAPI backend migrated from Firebase/Firestore to PostgreSQL.

## Database
- Database: `quantx_db`
- Default user: `postgres`
- Default password: `17100309Hm*`

`app/main.py` runs schema bootstrap (`app/schema.sql`) automatically on startup.

## Setup
```bash
cd py_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload
```

## Tables created
- `users`
- `groups`
- `channels`
- `conversations`
- `messages`
- `call_logs`
- `signals`

All required REST endpoints under `/api/auth`, `/api/users`, `/api/community`, `/api/thread`, `/api/chat`, and `/api/media` remain available for integration.
