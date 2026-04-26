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

## Notes
- Keep all backend logic in this folder so both web and mobile apps call the same API layer.
- `pqc-chat-ui/` should stay frontend-only.
