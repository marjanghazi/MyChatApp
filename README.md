# MyChatApp

Repository structure:

- `frontend/` — frontend-only React application (UI + API calls).
- `backend/` — Node.js backend (stable reference implementation).
- `py_backend/` — FastAPI backend intended to mirror `backend/` behavior and routes.

## Goal Architecture
Frontend clients (web + mobile) should call backend APIs only.

## Migration Status
- ✅ Community operations (`create group/channel`, `follow/unfollow`) are routed through backend APIs.
- ⏳ Remaining direct Firebase usage in frontend is tracked in `backend/BACKEND_FIRST_MIGRATION.md` and `backend/FRONTEND_BACKEND_LOGIC_AUDIT.md` and must be migrated to backend endpoints.

