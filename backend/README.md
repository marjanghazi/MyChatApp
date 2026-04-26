# PQC Chat Backend

This folder is the single backend source for both:
- `pqc-chat-ui` (web frontend)
- future mobile applications

## Contents
- `src/` — backend server implementation and API routes
- `firebase/` — backend Firebase configuration artifacts:
  - `firestore.indexes.json`
  - `storage.rules`
- `.env.example` — environment variable template
- `BACKEND_FIRST_MIGRATION.md` — complete checklist to finish backend-first architecture
- `FRONTEND_BACKEND_LOGIC_AUDIT.md` — exact audit of remaining frontend backend-logic usage

## Setup
```bash
cd backend
npm install
cp .env.example .env
npm start
```

## API
- `GET /api/health`
- `POST /api/community/groups`
- `POST /api/community/channels`
- `POST /api/community/channels/:channelId/follow`
- `POST /api/community/channels/:channelId/unfollow`

## Frontend integration
In `pqc-chat-ui/.env` set:
```bash
REACT_APP_API_BASE_URL=http://localhost:4000
```

## Next steps
Follow `BACKEND_FIRST_MIGRATION.md` and `FRONTEND_BACKEND_LOGIC_AUDIT.md` to migrate all remaining frontend direct Firebase usage into backend APIs.
