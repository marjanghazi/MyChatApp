# PQC Chat Backend

This folder is the single backend source for both:
- `pqc-chat-ui` (web frontend)
- future mobile applications

## Contents
- `src/` — backend server implementation
- `firebase/` — backend Firebase configuration artifacts:
  - `firestore.indexes.json`
  - `storage.rules`
- `.env.example` — environment variable template

## Run backend
```bash
cd backend
npm install
npm start
```

Default health endpoint:
- `GET /api/health`
