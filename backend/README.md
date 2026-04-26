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

## What remains to make backend fully authoritative
To make backend handle all business logic, migrate all remaining frontend direct Firebase reads/writes to backend endpoints (conversations, messages, calls, user profile/search, uploads).
