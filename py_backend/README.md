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


## PostgreSQL-only confirmation
- The **Python backend (`py_backend`) does not use Firebase SDKs**; it uses PostgreSQL via `psycopg2` (`app/db.py`).
- Any Firebase code you still see is in the separate legacy Node backend folder: `backend/` (not used when you run `py_backend`).

## Quick DB troubleshooting
1) Verify env values (or `DATABASE_URL`) are loaded in `py_backend/.env`.
2) Check DB endpoint from API:
```bash
curl http://127.0.0.1:4000/api/health/db
```
3) Test login to postgres directly:
```bash
psql -h localhost -p 5432 -U postgres -d quantx_db -c "select now();"
```

If message send fails with `Database connection error`, it usually means DB credentials/host are wrong or the DB server is not reachable.
