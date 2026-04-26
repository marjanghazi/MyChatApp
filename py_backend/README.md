# PQC Chat Python Backend (FastAPI)

Independent FastAPI backend that mirrors the existing `backend/` API contract.

## Stack
- FastAPI + Uvicorn
- Firebase Admin SDK (Firestore + Storage)
- HTTPX (Firebase Identity Toolkit auth calls)
- python-dotenv

## Folder layout
- `app/main.py` — FastAPI app entrypoint
- `app/routes/` — route modules (`auth`, `community`, `users`, `thread`, `media`, `chat`)
- `app/firebase_client.py` — Firebase Admin bootstrap and clients
- `firebase/` — copied Firebase rules/index definitions
- `.env.example` — env template

## Setup
Use Python 3.11+ recommended (3.10 works but has upcoming Google SDK support EOL warnings).
```bash
cd py_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload

# quick sanity checks
curl http://127.0.0.1:4000/
curl http://127.0.0.1:4000/api/health
```

## API endpoints
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/update-profile`
- `POST /api/community/groups`
- `POST /api/community/groups/{groupId}/leave`
- `POST /api/community/groups/{groupId}/members/add`
- `POST /api/community/groups/{groupId}/members/remove`
- `POST /api/community/groups/{groupId}/admins/toggle`
- `POST /api/community/channels`
- `POST /api/community/channels/{channelId}/follow`
- `POST /api/community/channels/{channelId}/unfollow`
- `POST /api/users/check-phone`
- `POST /api/users/profile`
- `GET /api/users/{uid}/profile`
- `POST /api/users/{uid}/presence`
- `PATCH /api/users/{uid}/profile`
- `POST /api/users/{uid}/contacts`
- `GET /api/thread/users?excludeUid=...`
- `GET /api/thread/conversations?uid=...`
- `PATCH /api/thread/conversations/{conversationId}/delivered`
- `GET /api/thread/groups?uid=...`
- `GET /api/thread/channels`
- `POST /api/media/upload`
- `POST /api/media/upload-by-path`
- `POST /api/media/delete-by-path`
- `POST /api/chat/messages/send`
- `PATCH /api/chat/messages/edit`
- `PATCH /api/chat/messages/delete-for-me`
- `PATCH /api/chat/messages/delete-for-everyone`
- `PATCH /api/chat/messages/toggle-flag`
- `GET /api/chat/messages`
- `GET /api/chat/call-logs`
- `GET /api/chat/signals`
- `DELETE /api/chat/signals/{signalId}`
- `PATCH /api/chat/conversations/seen`
- `PATCH /api/chat/conversations/meta`
- `POST /api/chat/conversations/call-logs`
- `POST /api/chat/conversations/messages`
- `POST /api/chat/conversations/signals`
- `POST /api/chat/conversations/clear`

## Notes
- Set `REACT_APP_API_BASE_URL` in frontend to this backend URL when testing.
- Ensure Firebase credentials and `FIREBASE_WEB_API_KEY` are configured in `.env`.
