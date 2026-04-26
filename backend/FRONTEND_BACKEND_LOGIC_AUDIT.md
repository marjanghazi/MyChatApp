# Frontend Backend-Logic Audit

## Current status
- Frontend runtime does not use Firebase SDK modules.
- Chat runtime flows in `ChatWindow` use backend domain APIs (`/api/chat/*`) and media upload API (`/api/media/*`).
- Legacy compatibility shim (`firebaseCompat`) and generic `/api/db` proxy routes were removed.

## Backend controls added
- Chat domain handlers in `chatController` for message mutation/read flows, signaling, call logs, conversation seen/meta updates, and clear-for-user.
- Chat controller now validates thread types/signal types and sanitizes conversation meta patch keys.
- Storage path allow-lists in `mediaController` for upload/delete operations.

## Remaining architecture note
- To finish strict backend ownership across the whole app, any non-chat feature still using generic data access patterns should be migrated to dedicated backend domain endpoints.
