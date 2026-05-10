# Frontend Backend-Logic Audit

## Current status
- Frontend runtime does not use Firebase SDK modules.
- Frontend feature flows use backend domain APIs only (`/api/auth`, `/api/users`, `/api/thread`, `/api/community`, `/api/chat`, `/api/media`).
- Backend owns data persistence, validation, and storage enforcement.

## Backend controls in place
- Chat domain handlers in `chatController` for message mutation/read flows, signaling, call logs, conversation seen/meta updates, and clear-for-user.
- Chat controller validates thread types/signal types and sanitizes conversation meta patch keys.
- Storage path allow-lists in `mediaController` for upload/delete operations.

## Migration conclusion
Backend ownership is complete for runtime app behavior: `frontend` acts as an API client/UI layer and backend handles persistence/domain logic.
