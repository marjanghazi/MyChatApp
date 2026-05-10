# PQC Chat Backend

This folder is the single backend source for both:
- `frontend` (web frontend)
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


Required auth env value:
```bash
FIREBASE_WEB_API_KEY=<firebaseConfig.apiKey from Firebase console>
```

## API
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/update-profile`
- `POST /api/community/groups`
- `POST /api/community/groups/:groupId/leave`
- `POST /api/community/groups/:groupId/members/add`
- `POST /api/community/groups/:groupId/members/remove`
- `POST /api/community/groups/:groupId/admins/toggle`
- `POST /api/community/channels`
- `POST /api/community/channels/:channelId/follow`
- `POST /api/community/channels/:channelId/unfollow`
- `POST /api/users/check-phone`
- `POST /api/users/profile`
- `GET /api/users/:uid/profile`
- `POST /api/users/:uid/presence`
- `PATCH /api/users/:uid/profile`
- `POST /api/media/upload`
- `POST /api/users/:uid/contacts`
- `GET /api/thread/users?excludeUid=...`
- `GET /api/thread/conversations?uid=...`
- `PATCH /api/thread/conversations/:conversationId/delivered`
- `GET /api/thread/groups?uid=...`
- `GET /api/thread/channels`

## Frontend integration
In `frontend/.env` set:
```bash
REACT_APP_API_BASE_URL=http://localhost:4000
```

## Next steps
Follow `BACKEND_FIRST_MIGRATION.md` and `FRONTEND_BACKEND_LOGIC_AUDIT.md` to migrate all remaining frontend direct Firebase usage into backend APIs.

## Troubleshooting
If backend start prints missing dependencies (for example `Cannot find package 'dotenv'` or `express`):
```bash
cd backend
npm install
npm start
```
