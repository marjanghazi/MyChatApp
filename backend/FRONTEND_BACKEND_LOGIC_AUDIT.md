# Frontend Backend-Logic Audit

Generated to satisfy: "move backend logic from `pqc-chat-ui` into `backend/`".

## Findings
The following frontend files still directly use Firebase SDK (backend/data logic currently in UI app):

- `pqc-chat-ui/src/App.js`
  - Firebase Auth import/use
  - Firestore queries, listeners, writes
  - Storage upload/delete usage
- `pqc-chat-ui/src/components/chatwindow/ChatWindow.jsx`
  - Firestore message/call query + write flows
  - Storage upload/delete usage
- `pqc-chat-ui/src/firebase.js`
  - Client SDK initialization for auth/db/storage
- `pqc-chat-ui/src/App.test.js`
  - Firebase SDK mocks (test-only)

## Exact detection command
```bash
rg -n "firebase/auth|firebase/firestore|firebase/storage|from \"\./firebase\"|from \"\.\./\.\./firebase\"" pqc-chat-ui/src
```

## Required migration actions (must be done for full backend-first)
1. Move Auth flow from frontend Firebase SDK to backend auth APIs.
2. Move App-level users/conversations/groups/channels reads/writes to backend APIs.
3. Move ChatWindow message/calls/media logic to backend APIs.
4. Remove `pqc-chat-ui/src/firebase.js` runtime dependency (or leave only optional analytics).
5. Keep frontend as API consumer only.

## Status
- Community CRUD/follow actions are already migrated to backend API.
- Full migration is **not complete** until items 1-5 above are finished.
