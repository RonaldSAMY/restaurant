# Epic 3 Context: Kitchen Staff run the board live

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Kitchen Staff log in, see every open Order grouped Received / Preparing / Ready, and advance each one a step at a time, while every open board and the Guest tracking page update in under 2 s without reload; logout revokes the session. The epic adds `StaffUser`, the staff `auth` module, the kitchen endpoints and `OrderStatusMachine`, the Socket.IO `realtime` gateway, the login page and Kitchen Board, and Playwright e2e tests, completing the UJ-1 (Guest orders and tracks live) + UJ-2 (staff runs the board, then logs out) demo. It ends by moving every endpoint sub-path into shared `ApiRoutes` so api and web cannot drift on a URL.

## Stories

- Story 3.1: Staff login, refresh, and logout API
- Story 3.2: Kitchen Orders API and status transitions
- Story 3.3: Staff login page and Kitchen Board
- Story 3.4: Live updates for board and tracking page
- Story 3.5: End-to-end demo tests
- Story 3.6: Endpoint sub-paths in shared `ApiRoutes`

## Requirements & Constraints

- **Staff auth:** email + password; wrong email and wrong password return the identical `401 INVALID_CREDENTIALS`. Access token 5 min, refresh token 1 h rotated on use (idle > 1 h must log in again); session survives page refresh; after logout the old access and refresh tokens are rejected. Accounts are seeded only; passwords hashed with argon2id.
- **Authorization:** only staff view the board or change a status. Every staff route (`kitchen/*`, `auth/logout`, `auth/me`) returns `401 UNAUTHENTICATED` for anonymous callers and for a valid Guest Session alike; `403` only for a valid principal on a foreign resource.
- **Board:** all non-Collected Orders, oldest first, with reference, Guest name, items, quantities, time placed. Ready stays until Collected; Collected leaves.
- **Transitions:** forward one step only (Take, Mark Ready, Mark Collected). Skip, backward, or any change to Collected → `409 INVALID_TRANSITION`, Order unchanged. Concurrent advances: exactly one wins. Unknown id → `404 ORDER_NOT_FOUND`. Collected ends the Guest Session.
- **Live:** new Orders and status changes reach every open board and the tracking page in under 2 s.
- **Tests:** integration covers login, generic error, refresh rotation + replay rejection, 5 min access expiry and 1 h idle expiry via fake clock, revocation after logout, every protected route rejecting anonymous + guest, all transitions incl. the race. E2e covers UJ-1 + UJ-2 (incl. refresh during tracking, third-context lookup by reference, reuse of a logged-out session).
- **Scope:** no Cancelled state, no undo, no staff management UI, single kitchen.

## Technical Decisions

- **Data/ownership:** `StaffUser` (UUID `id`, unique `email`, `passwordHash`) and Redis `auth:session:{sid}` → staffId, `auth:refresh:{jti}` → sid are owned by `auth`; token strings are never stored. Seed upserts staff by email from `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` via the same `PasswordHasher` port/argon2id adapter. `realtime` holds only the gateway. Imports: realtime → auth, orders; orders → menu, auth; all → common; no `forwardRef`.
- **Tokens:** `access_token` JWT 5 min (`staffId`, `sid`, `Path=/`); `refresh_token` JWT 1 h (`sid`, `jti`, `Path=/api/v1/auth`); both `HttpOnly; Secure; SameSite=Strict`. Refresh consumes `jti` with `GETDEL`, issues a new pair, `204`. `StaffAuthGuard` accepts only a valid access token whose `sid` is still in Redis; JWT expiry verified against `Clock`. Logout deletes both keys, clears cookies, `204`, and disconnects `staff-session:{sid}` sockets via `SocketServerRef`.
- **Principal:** `{ kind: 'staff', staffId, sid } | { kind: 'guest', sid, orderId }`; default deny for anything not `@Public()` or guarded.
- **State machine:** pure-domain `OrderStatusMachine` is the only owner of RECEIVED→PREPARING→READY→COLLECTED; maps `to` → required predecessor. Applied as one `UPDATE … WHERE id = :id AND status = :predecessor`; 0 rows → 409. Web may hide buttons but never decides validity.
- **Endpoints:** `POST auth/login` (Public, `LoginRequest` → `200 StaffMe`), `POST auth/refresh` (refresh cookie → `204`), `POST auth/logout` (Staff → `204`), `GET auth/me` (Staff → `StaffMe`), `GET kitchen/orders` (Staff → `KitchenOrder[]`, `placedAt` asc), `PATCH kitchen/orders/:id/status` (Staff, `AdvanceStatusRequest { to }` → `200 KitchenOrder`). `KitchenOrder` = `GuestOrderView` + `id`.
- **Realtime:** Socket.IO at `/api/socket.io`; server assigns rooms from handshake cookies (staff → `kitchen` + `staff-session:{sid}`; `GuestSessionService.resolve` hit → `order:{orderId}`); clients never name a room. Sessionless `order.subscribe { reference }` uses the HTTP lookup's throttle and 24 h window; ack `{ ok: true } | { error }`. Inbound WS messages parsed with shared schemas.
- **Events:** only `OrdersService` publishes, after commit, via the `OrderEventsPublisher` port (`SocketIoOrderEventsPublisher` adapter). `order.created` (`KitchenOrder`) → `kitchen`; `order.status-changed` `{ id, reference, status, changedAt }` → `kitchen` and `{ reference, status, changedAt }` → `order:{id}` (no UUID). Failed writes emit nothing.
- **Gateway auth/errors:** `APP_GUARD` runs on gateway handlers; a handler is reachable only if `@Public()` or guarded by a `PrincipalGuard` resolving the principal from handshake cookies. `PrincipalGuard.canActivate` must become context-aware (HTTP-only today). The global error filter writes nothing on non-HTTP hosts; a gateway-scoped `@UseFilters` filter answers handler errors and guard denials with the ack `{ error }`.
- **Web:** `lib/api.ts` is the only fetch wrapper; on a staff 401 it refreshes once (single-flight per tab) and retries, a second 401 → `/kitchen/login`. Socket `connect_error` `UNAUTHENTICATED` runs the same refresh, then reconnects. JS never reads a token; kitchen protection is this 401 flow, not `proxy.ts`. On every (re)connect clients refetch the HTTP snapshot, then apply only events whose status ranks later than the one held.
- **Paths (Story 3.6):** `ApiRoutes` holds every endpoint as a full template relative to `API_PREFIX`; `apiPath(route, params)` encodes each `:param`, with missing/extra params a compile error. No path string literals left in `apps/api/src` decorators; `refresh_token` cookie `Path` derived from `API_PREFIX` + `ApiRoutes`; web builds every URL via `apiPath`. Tests, the Caddyfile and the compose healthcheck keep literal `/api/v1/...` paths on purpose, so unchanged tests prove public URLs did not move.
- **E2E/CI:** Playwright (`ignoreHTTPSErrors`) in a container against the full compose stack at `https://localhost`, two browser contexts (plus a third for reference lookup); GitHub Actions runs it on `main` and nightly.
- **Logging:** never log tokens, passwords or cookies; order lines include `reference`.

## UX & Interaction Patterns

- **Login (`/kitchen/login`):** success lands on `/kitchen`; any credential failure shows one generic error.
- **Board (`/kitchen`, tablet/desktop ≥ 768 px):** three side-by-side columns (Received, Preparing, Ready), oldest first; each card shows reference, Guest name, items with quantities, time placed, and one action (Take / Mark Ready / Mark Collected). Success moves the card or removes it on Collected; `409 INVALID_TRANSITION` refetches the board and shows a short notice. Logout button ends the session → `/kitchen/login`.
- **Tracking page:** status updates live without reload; after Collected, `/track` returns the Guest to `/`.

## Cross-Story Dependencies

- 3.1 provides `StaffAuthGuard`, the staff principal and logout; 3.2 needs it for 401 tests; 3.3 needs 3.1 + 3.2; 3.4 needs 3.1 (handshake, logout disconnect) and 3.2 (advance publishes); 3.5 needs all; 3.6 runs last and sweeps every path added by 3.1–3.5 plus Epic 2's orders routes.
- **Interim path rule (until 3.6):** resource paths come from `ApiRoutes`; any sub-path is typed in exactly two places, the Nest decorator and `apps/web/lib/api.ts` (web builds api URLs nowhere else). Socket.IO keeps `/api/socket.io`. Each story spec lists the sub-paths it adds; no interim story adds a path helper or changes `apiPath`.
- **From Epic 2:** `GuestSessionService.resolve` (socket handshake, Collected ends session), the reference-lookup throttle and 24 h window (`order.subscribe`), `GuestOrderView` (base of `KitchenOrder`), placement in `OrdersService` (must publish `order.created`), and the `/track` + `/track/[reference]` pages (gain the socket).
- **From Epic 1:** default-deny guard, `@Public()`, error envelope filter, `Clock`, Supertest cookie helper, fixture builders (add `buildStaffUser`), `SeedModule`, compose test runner and CI workflow.
