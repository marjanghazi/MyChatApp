# Frontend Backend-Logic Audit

## Current status
- Frontend runtime does not directly use Firebase SDK modules.
- Core message mutations use backend chat endpoints (`/api/chat/messages/*`).
- Message/call-log/signal reads are now polled via backend chat endpoints.
- Backend enforces document/storage allow-lists for proxied operations.

## Backend controls added
- Firestore doc/collection path allow-lists in `dbController`.
- Storage path allow-lists in `mediaController` for upload/delete operations.
- Chat domain handlers in `chatController` for send/edit/delete/flag and read APIs.

## Remaining architecture note
Call-state and signaling writes, theme/mute toggles, and some conversation-level operations are still executed through the compatibility data layer from frontend.
For strict domain-driven backend ownership, those remaining write flows should be moved into dedicated backend chat/call controllers.
