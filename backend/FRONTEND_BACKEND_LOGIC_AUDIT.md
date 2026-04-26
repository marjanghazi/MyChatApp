# Frontend Backend-Logic Audit

## Current status
- Frontend runtime does not directly use Firebase SDK modules.
- Frontend data/storage operations are routed through backend API endpoints.
- Backend enforces path allow-lists for document and storage operations.
- Core message mutations now use dedicated backend chat endpoints (`/api/chat/messages/*`).

## Backend controls added
- Firestore doc/collection path allow-lists in `dbController`.
- Batch operation path validation in `dbController`.
- Storage path allow-lists in `mediaController` for upload/delete operations.
- Chat domain handlers for send/edit/delete/flag operations in `chatController`.

## Remaining architecture note
Some realtime orchestration (snapshot polling/call signaling flow in UI) still exists in frontend.
For strict domain-driven backend ownership, remaining call/signal orchestration should be moved into explicit chat/call backend controllers.
