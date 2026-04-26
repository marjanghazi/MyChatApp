# Frontend Backend-Logic Audit

## Current status
- Frontend runtime does not directly use Firebase SDK modules.
- `ChatWindow` read/write flows use backend chat/media APIs (`/api/chat/*`, `/api/media/*`).
- Backend enforces document/storage allow-lists for any compatibility paths still exposed.

## Backend controls added
- Firestore doc/collection path allow-lists in `dbController`.
- Storage path allow-lists in `mediaController` for upload/delete operations.
- Chat domain handlers in `chatController` for:
  - message mutations,
  - thread/call-log/signal reads,
  - signal deletion,
  - conversation seen/meta updates,
  - conversation call-log/message append,
  - conversation clear-for-user.

## Remaining architecture note
- `firebaseCompat` still exists for legacy compatibility references (`firebase.js` export + test mocks), but `ChatWindow` no longer depends on it.
- For strict backend-only ownership, next cleanup is removing legacy compatibility exports/tests and replacing any remaining non-chat frontend data paths with domain endpoints.
