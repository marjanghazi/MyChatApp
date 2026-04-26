# MyChatApp

Repository structure:

- `pqc-chat-ui/` — frontend-only React application (UI + API calls).
- `backend/` — single backend source (API, rules/indexes, server-side business logic).

## Goal Architecture
Frontend clients (web + mobile) should call backend APIs only.

## Migration Status
- ✅ Community operations (`create group/channel`, `follow/unfollow`) are now routed through backend APIs.
- ⏳ Remaining direct Firebase usage in frontend should be migrated to backend endpoints in the next steps.
