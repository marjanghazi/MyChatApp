# Frontend Backend-Logic Audit

## Current status
- Frontend runtime does not directly use Firebase SDK modules.
- Frontend data/storage operations are routed through backend API endpoints.
- Backend now enforces path allow-lists for document and storage operations.

## Backend controls added
- Firestore doc/collection path allow-lists in `dbController`.
- Batch operation path validation in `dbController`.
- Storage path allow-lists in `mediaController` for upload/delete operations.

## Remaining architecture note
The frontend still contains chat orchestration logic in `ChatWindow.jsx`.
For strict domain-driven backend ownership, this logic should be moved into explicit chat/message/call controllers.
