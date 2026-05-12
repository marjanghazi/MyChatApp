# Backend-First Migration Plan (Web + Mobile)

This checklist defines all changes required so **backend/** is the single source of backend logic and frontend clients only use APIs.

## Definition of done
- No `firebase/*` imports in `frontend/src` except optional analytics-only helpers.
- No direct Firestore/Auth/Storage reads/writes in frontend code.
- Web and mobile both call `backend/` HTTP APIs for all operations.
- Security rules/indexes and all server-side business logic live in `backend/`.

## Current status
- Community create/follow/unfollow already migrated to backend APIs.
- Remaining flows still directly use Firebase SDK in frontend (`App.js`, `ChatWindow.jsx`).

---

## Required backend modules and endpoints

### 1) Auth module
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`

Notes:
- Issue backend session/JWT.
- Keep Firebase Admin usage server-side only.

### 2) Users module
- `GET /api/users?excludeUid=...`
- `GET /api/users/search?q=...`
- `POST /api/users/import-contact`
- `PATCH /api/users/:uid/presence`

### 3) Conversations module
- `GET /api/conversations?uid=...`
- `GET /api/conversations/:id/messages?cursor=...`
- `POST /api/conversations/:id/messages`
- `PATCH /api/conversations/:id/messages/:messageId`
- `DELETE /api/conversations/:id/messages/:messageId`
- `PATCH /api/conversations/:id/status`

### 4) Groups module
- keep existing create endpoint
- add:
  - `GET /api/groups?uid=...`
  - `GET /api/groups/:id/messages`
  - `POST /api/groups/:id/messages`
  - `POST /api/groups/:id/members`
  - `DELETE /api/groups/:id/members/:uid`

### 5) Channels module
- keep existing create/follow/unfollow endpoints
- add:
  - `GET /api/channels?uid=...`
  - `GET /api/channels/:id/posts`
  - `POST /api/channels/:id/posts`

### 6) Calls/signaling module
- `POST /api/calls/:conversationId/offer`
- `POST /api/calls/:conversationId/answer`
- `POST /api/calls/:conversationId/ice`
- `POST /api/calls/:conversationId/logs`
- `GET /api/calls/:conversationId/logs`

### 7) Media module
- `POST /api/media/upload` (or signed upload flow)
- `DELETE /api/media`

---

## Frontend required changes

1. Replace direct Firebase imports in:
   - `frontend/src/App.js`
   - `frontend/src/components/chatwindow/ChatWindow.jsx`
2. Split frontend data layer into services:
   - `authService`
   - `userService`
   - `conversationService`
   - `groupService`
   - `channelService`
   - `callService`
   - `mediaService`
3. Keep UI components unchanged where possible; move logic into services.
4. Point all service calls to `REACT_APP_API_BASE_URL`.

---

## Rollout order (recommended)
1. Auth + session
2. Users + conversations list
3. Direct message send/read/edit/delete
4. Groups/channels message flows
5. Calls signaling/logs
6. Media upload/delete
7. Remove remaining Firebase client SDK usage

---

## Validation gates
- Add CI check: fail if frontend contains forbidden imports:
  - `firebase/auth`
  - `firebase/firestore`
  - `firebase/storage`
- End-to-end smoke tests for:
  - login/register
  - direct chat
  - group chat
  - channel follow/post
  - media upload
  - call setup/logs

When all gates pass, backend-first architecture is complete.
