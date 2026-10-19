# Epic 3 Context: Kitchen Staff run the board live

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Kitchen Staff log in, see every open Order grouped Received / Preparing / Ready, and advance each one a step at a time. Every open board and the Guest tracking page update in under 2 s without reload, and logout revokes the session. The epic adds the `StaffUser` table, the `auth` module (staff JWT sessions in Redis), the kitchen endpoints, the `OrderStatusMachine`, the Socket.IO `realtime` gateway, the staff login page and Kitchen Board, and Playwright e2e tests. Together they complete the UJ-1 (Guest orders and tracks live) and UJ-2 (staff runs the board, then logs out) demo.

## Stories

- Story 3.1: Staff login, refresh, and logout API
- Story 3.2: Kitchen Orders API and status transitions
- Story 3.3: Staff login page and Kitchen Board
- Story 3.4: Live updates for board and tracking page
- Story 3.5: End-to-end demo tests
- Story 3.6: Endpoint sub-paths in shared ApiRoutes (last; sweeps 3.1–3.5)

## Requirements & Constraints

- **Staff auth:** login uses email and password. A wrong email and a wrong password return the identical `401 INVALID_CREDENTIALS`. The access token lives 5 min and the refresh token 1 h, rotated on use, so active staff stay logged in and staff idle for more than 1 h must log in again. The session survives page refresh. After logout the old access and refresh tokens are both rejected. Accounts are seeded only, with no sign-up. Passwords are hashed with argon2id.
- **Authorization:** only staff can view the board or change a status. Every staff route (`kitchen/*`, `auth/logout`, `auth/me`) returns `401 UNAUTHENTICATED` for anonymous callers **and** for a valid Guest Session. `403` is reserved for a valid principal reaching a resource that is not its own.
- **Board:** shows all non-Collected Orders, oldest first, with reference, Guest name, items, quantities and time placed. Ready stays on the board until Collected, and Collected leaves it.
- **Transitions:** forward one step only: Take (RECEIVED→PREPARING), Mark Ready (→READY), Mark Collected (→COLLECTED). A skip, a backward move or any change to a Collected Order → `409 INVALID_TRANSITION` with the Order unchanged. When two advances race, exactly one wins. An unknown id → `404 ORDER_NOT_FOUND`. Collected ends the Guest Session.
- **Live:** new Orders and status changes reach every open board and the tracking page in under 2 s.
- **Tests:** integration tests cover login, the generic error, refresh rotation and replay rejection, access expiry at 5 min and idle expiry after 1 h (fake clock), revocation after logout, every protected route rejecting anonymous and guest callers, and all transitions including the concurrent race. E2e tests cover UJ-1 and UJ-2.
- **Viewport:** the board targets tablet/desktop (≥ 768 px, three columns side by side).
- **Scope:** no Cancelled state, no undo, no staff management UI, single kitchen.

## Technical Decisions

- **Data model:** `StaffUser` has a UUID `id`, a unique `email` and a `passwordHash`. The seed upserts the staff user by `email` from `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` through the same `PasswordHasher` port and argon2id adapter, and never deletes.
- **Ownership:** `auth` owns `StaffUser`, `auth:session:{sid}` → staffId and `auth:refresh:{jti}` → sid. Token strings are never stored. `realtime` holds only the gateway and owns no tables or keys. Import directions are realtime → auth, orders; orders → menu, auth (kitchen controller uses `StaffAuthGuard`); all → common. There is no `forwardRef`. `auth` uses the domain/ports/adapters split.
- **Tokens:** `access_token` is a JWT (5 min) with `staffId` and `sid`, cookie `Path=/`. `refresh_token` is a JWT (1 h) with `sid` and `jti`, cookie `Path=/api/v1/auth`. Both cookies are `HttpOnly; Secure; SameSite=Strict`. Refresh consumes the `jti` with `GETDEL`, issues a new pair and returns `204`; an unknown `jti` → 401. `StaffAuthGuard` accepts only a valid access token whose `sid` is still in Redis. JWT expiry is checked against the `Clock` (`clockTimestamp`), never wall time. Logout deletes both keys, clears the cookies, returns `204` and disconnects `staff-session:{sid}` sockets through `SocketServerRef`.
- **Principal:** the guard sets `{ kind: 'staff', staffId, sid }`. Guards extend `PrincipalGuard` by implementing `authenticate()`, and default deny applies.
- **State machine:** `OrderStatusMachine` is pure domain and the only place that knows the order RECEIVED→PREPARING→READY→COLLECTED. It maps a requested `to` to its required predecessor. The api applies it as one conditional `UPDATE … WHERE id = :id AND status = :predecessor`, and 0 rows → 409. The web may hide buttons but never decides validity.
- **Endpoints** (resource paths from `api-routes.ts`; sub-paths move there in Story 3.6; shared schemas `LoginRequest`, `StaffMe`, `KitchenOrder` = `GuestOrderView` + `id`, `AdvanceStatusRequest { to }`):
  - `POST auth/login` (Public) → `200 StaffMe` + cookies
  - `POST auth/refresh` (refresh cookie) → `204`
  - `POST auth/logout` (Staff) → `204`
  - `GET auth/me` (Staff) → `StaffMe`
  - `GET kitchen/orders` (Staff) → `KitchenOrder[]`, ordered by `placedAt` ascending
  - `PATCH kitchen/orders/:id/status` (Staff) → `200 KitchenOrder`
- **Realtime:** Socket.IO is served at `/api/socket.io`, and the gateway sets `SocketServerRef` in `afterInit`. The server assigns rooms from handshake cookies and the client never names a room: a valid staff session joins `kitchen` + `staff-session:{sid}`, and a `GuestSessionService.resolve` hit joins `order:{orderId}`. A sessionless tracker sends `order.subscribe { reference }`, which is validated like the HTTP lookup (same throttle, 24 h window). Its ack is the shared `{ ok: true } | { error }`. Inbound WS messages are checked with `schema.parse`.
- **Events:** only `OrdersService` publishes, after commit, through the `OrderEventsPublisher` port. The adapter is `SocketIoOrderEventsPublisher` in `orders/adapters/`. A failed write emits nothing.
  - `order.created` sends a `KitchenOrder` to `kitchen`.
  - `order.status-changed` sends `{ id, reference, status, changedAt }` to `kitchen` and `{ reference, status, changedAt }` to `order:{id}`. The guest room never gets the UUID.
  - Event names and payloads are shared Zod schemas.
- **Gateway auth and errors:** `APP_GUARD` also runs on gateway handlers. A handler is reachable only if it is `@Public()` or guarded by a `PrincipalGuard` that resolves the principal from handshake cookies. `PrincipalGuard.canActivate` must become context-aware, because it is HTTP-only today. The global `ErrorEnvelopeFilter` writes nothing on non-HTTP hosts. A gateway-scoped `@UseFilters` filter answers both handler errors and guard denials with the ack `{ error }`.
- **Web:**
  - `lib/api.ts` stays the only fetch wrapper. On a staff 401 it calls refresh once (single-flight per tab) and retries. A second 401 navigates to `/kitchen/login`.
  - JavaScript never reads a token. Kitchen route protection runs through this 401 flow, not Next `proxy.ts`.
  - A socket `connect_error` with `UNAUTHENTICATED` runs the same refresh, then reconnects.
  - On every (re)connect, clients refetch the HTTP snapshot, then apply only events whose status ranks later than the one held.
  - Routes are `/kitchen/login` and `/kitchen`. Browser code uses same-origin `/api/v1` and Socket.IO.
- **E2E:** Playwright (`ignoreHTTPSErrors`) runs against the full compose stack at `https://localhost`, in its own container per the Docker-only rule. CI runs it on `main` and nightly.
- **Logging:** never log tokens, passwords or cookies. Order log lines include `reference`.

## UX & Interaction Patterns

- Login page: on success it lands on `/kitchen`. Any credential failure shows one generic error.
- Board: three columns (Received, Preparing, Ready), oldest first. Each card shows reference, Guest name, items with quantities and time placed, plus one action button (Take / Mark Ready / Mark Collected). The card moves on success and leaves the board on Collected. A `409 INVALID_TRANSITION` refetches the board and shows a short notice. A logout button ends the session and redirects to `/kitchen/login`.
- Tracking page: status updates live with no reload. After Collected, `/track` returns the Guest to `/`.

## Cross-Story Dependencies

- 3.1 comes first and provides `StaffAuthGuard`, the staff principal and logout. 3.2 needs 3.1 for the 401 tests. 3.3 needs 3.1 and 3.2. 3.4 needs 3.1 (handshake, logout disconnect) and 3.2 (advance publishes). 3.5 needs everything.
- From Epic 2:
  - `GuestSessionService.resolve` serves the socket handshake and the Collected-ends-session check.
  - The reference-lookup throttle and 24 h window are reused by `order.subscribe`.
  - `GuestOrderView` is the base of `KitchenOrder`.
  - `OrdersService` placement must also publish `order.created`.
  - The `/track` and `/track/[reference]` pages gain the socket.
- **Interim path rule (until Story 3.6).** Stories 3.3–3.5 take resource paths from `ApiRoutes` as today. Any sub-path is typed in exactly two places: the Nest decorator, and `apps/web/lib/api.ts` (web never builds an api URL anywhere else). Realtime keeps `/api/socket.io` where AD-10 puts it. Each story spec lists the sub-paths it adds, so Story 3.6 has a complete inventory. No story in between adds a new path helper or changes `apiPath`.
- From Epic 1: default deny, `@Public()`, the error filter, `Clock`, the cookie helper, fixture builders (add `buildStaffUser`) and `SeedModule`.
- One deferred item is still open for 3.1: log method + route on 500s, and narrow `DomainError.details` from `unknown`. Take it into scope or re-defer it explicitly.
