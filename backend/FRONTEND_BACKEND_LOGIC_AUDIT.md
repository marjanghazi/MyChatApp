# Frontend Backend-Logic Audit

## Current status
Frontend runtime no longer imports Firebase client SDK modules directly.
All data and storage mutations are routed through backend APIs (`/api/db/*`, `/api/media/*`).

## What changed
- Added backend document API endpoints for Firestore document/collection operations.
- Added backend media endpoints for upload/delete by explicit storage path.
- Replaced `ChatWindow.jsx` Firebase SDK imports with `firebaseCompat` service calls.
- Replaced frontend `firebase.js` with compatibility re-export (no Firebase SDK initialization).

## Notes
- `firebaseCompat` implements polling-based `onSnapshot` behavior in the frontend to preserve UI behavior while keeping Firebase access in the backend.
