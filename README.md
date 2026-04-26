# MyChatApp

Repository structure:

- `pqc-chat-ui/` — frontend-only React application (UI + API calls).
- `backend/` — single backend source (API, rules/indexes, server-side business logic).

## Goal Architecture
Frontend clients (web + mobile) should call backend APIs only.

## Migration Status
- ✅ Community operations (`create group/channel`, `follow/unfollow`) are routed through backend APIs.
- ⏳ Remaining direct Firebase usage in frontend is tracked in `backend/BACKEND_FIRST_MIGRATION.md` and `backend/FRONTEND_BACKEND_LOGIC_AUDIT.md` and must be migrated to backend endpoints.
