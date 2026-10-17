---
type: architecture-review
lens: adversary (compliant-but-incompatible unit pairs)
target: ../ARCHITECTURE-SPINE.md
context: ../../../prds/prd-restuarent-2026-10-17/prd.md
date: 2026-10-17
verdict: NOT YET BUILD-SAFE. 6 high, 7 medium, 5 low. All fixable with small AD additions; none needs new infrastructure.
---

# Adversarial Review: Architecture Spine (restuarent)

## Method

For each finding, two units one level down (stories or modules built by separate AI agents) each follow every AD exactly, and the result still breaks when they are put together. Each finding names the pair, the clash, the AD text that allows both readings, the smallest rule that closes the gap, and a severity:

- **High**: the demo journeys (UJ-1, UJ-2), the CI build, or the §5 tests fail.
- **Medium**: rework or a flaky or wrong edge case.
- **Low**: polish.

Over-engineering is out of scope. Every proposed fix is a sentence or a table, not a new component.

## Verdict

The spine is strong on the intra-module layers (AD-3, AD-7, AD-9, AD-13). Its holes are at the seams between modules and between containers, which are the places where parallel agents meet:

1. There is no endpoint/schema catalogue. AD-2 deliberately bans route constants from `shared`, but no other place pins them.
2. The Nest module dependency direction is unstated, and the realtime module forms a cycle with both orders and auth.
3. The Guest Session validity rule is written as guard behaviour, but three different units need it.
4. Two clocks govern expiry: the injected `Clock`, and Redis TTL plus JWT `exp`.
5. The test topology contradicts the "only proxy publishes a port" rule.

Fix the six High items before sharding stories.

---

## High

### H1. `orders` / `auth` vs `realtime`: Nest module import cycle
- **Pair:** Agent A builds `orders` with `OrderEventsPublisher` port, and wires the Socket.IO adapter from `realtime/` (Structural Seed puts "OrderEventsPublisher adapter" in `realtime/`). Agent B builds the `realtime` gateway, which must call `orders` (to resolve the guest cookie to `orderId`, and to validate `order.subscribe {reference}`) and `auth` (to verify the staff cookie and Redis `sid`). AD-5 has auth's logout "disconnect that session's sockets", so auth also needs realtime.
- **Clash:** OrdersModule imports RealtimeModule and RealtimeModule imports OrdersModule. The same holds for auth and realtime. Nest fails at boot with a circular-dependency error, or each agent adds `forwardRef` differently. AD-3 says only that modules "call the owner's exported service" and gives no direction.
- **Fix (AD-3 addendum):** *Module import direction is `realtime → auth`, `realtime → orders`, `orders → menu`, and never the reverse. The Socket.IO `Server` is exposed through a dependency-free `common/socket-server.ref.ts` (set by the gateway in `afterInit`). `SocketIoOrderEventsPublisher` lives in `orders/adapters/` and uses that ref. Auth logout calls `ref.server.in('staff-session:'+sid).disconnectSockets()` the same way. No `forwardRef`.* Then update the Structural Seed line for `realtime/` to read "gateway (handshake + `order.subscribe`) only".

### H2. Placement endpoint vs `GuestSessionGuard` vs socket handshake: three readings of "valid Guest Session"
- **Pair:** Agent A builds `GuestSessionGuard` per AD-6: key exists, Order not Collected, and lazy delete on Collected. Agent B builds `POST /orders`. That route must be reachable without a session, so it is `@Public()` and checks for an open session to return `409 ORDER_ALREADY_OPEN`. Agent C builds the gateway's guest handshake.
- **Clash:**
  - B checks `EXISTS guest:session:{sid}`. Lena's tracking page learned *Collected* over the socket, so the guard never ran and the key was never deleted. Her same-day re-order is rejected with `ORDER_ALREADY_OPEN` pointing at a Collected Order. This breaks UJ-1 ("starts fresh").
  - AD-4 forbids "ad-hoc auth checks inside handlers" and requires each route to declare a guard. An *optional* guest principal fits neither `@Public()` nor `GuestSessionGuard`, which rejects anonymous callers. Each agent improvises.
  - C joins `order:{orderId}` for a Collected or expired session.
- **Fix (AD-6 tightening):** *`GuestSessionService.resolve(sid): {sid, orderId} | null` (orders application layer) is the only implementation of the validity rule: key present, Order not Collected, and `now < placedAt + 24h`. On a Collected or expired session it deletes the key and returns null. `GuestSessionGuard`, the gateway handshake, and the placement use case all call it. Placement is `@Public()` and the use case (not the controller) calls `resolve` on the cookie if one is present.*

### H3. API controllers vs web pages vs Caddyfile: no endpoint catalogue and no prefix rule
- **Pair:** Agent A builds the `orders` controllers. Agent B builds `web/app/track` and `web/app/kitchen`. Agent C writes the `Caddyfile` and `API_INTERNAL_URL` usage.
- **Clash:**
  - AD-2 bans route constants in `shared`, and no other place lists the routes. A builds `GET /api/v1/orders/me`. B calls `GET /api/v1/guest/order` for the refresh-restore case in FR-3.
  - The PATCH body is `{to: Preparing}` in the AD-10 diagram, `{status: 'PREPARING'}` by the conventions table, or an action (`take`).
  - The board's `GET` response element and the `order.created` "full board card" may become two schemas. The guest view and the staff view of an Order are unnamed, so one agent returns the staff shape (with UUID) to guests.
  - C uses `handle_path /api/*`, which strips the prefix, while A sets `setGlobalPrefix('api/v1')`. Every call returns 404. The web server calls `http://api:3000/menu` and gets the same 404.
- **Fix (new short table in the spine):**

  | Method + path | Guard | Request schema | Response schema |
  | --- | --- | --- | --- |
  | `GET /api/v1/menu` | Public | none | `MenuResponse` |
  | `POST /api/v1/orders` | Public (+resolve) | `PlaceOrderRequest` | `GuestOrderView` (+ sets cookie) |
  | `GET /api/v1/orders/current` | GuestSession | none | `GuestOrderView` |
  | `GET /api/v1/orders/by-reference/{reference}` | Public, throttled | none | `GuestOrderView` |
  | `POST /api/v1/auth/login` / `refresh` / `logout` | Public / refresh cookie / Staff | `LoginRequest` / none / none | `StaffMe` / 204 / 204 |
  | `GET /api/v1/kitchen/orders` | Staff | none | `KitchenOrder[]` (open only, `placedAt` asc) |
  | `PATCH /api/v1/kitchen/orders/{id}/status` | Staff | `{ to: OrderStatus }` | `KitchenOrder` |

  Plus these rules:
  - `GuestOrderView` has no `id`.
  - `KitchenOrder` = `GuestOrderView` + `id`. It is also the `order.created` payload.
  - `ORDER_ALREADY_OPEN` carries `details: { reference }`.
  - Caddy forwards `/api/*` unmodified (`reverse_proxy`, no strip).
  - The api owns the `/api/v1` prefix (`setGlobalPrefix`) and the Socket.IO `path: '/api/socket.io'`.
  - Server-side web calls `${API_INTERNAL_URL}/api/v1/menu`.

### H4. Domain expiry rules (injected `Clock`) vs Redis TTL / JWT `exp`: two clocks
- **Pair:** Agent A builds the orders and auth adapters. They follow AD-6 and AD-5 literally and rely on Redis TTL (`guest:session` absolute expiry, `auth:session` and `auth:refresh` 1 h) and on JWT `exp` checked by `@nestjs/jwt` against the wall clock. Agent B builds the integration tests and follows AD-16: "time-dependent rules take an injected `Clock` port so tests control time."
- **Clash:** B advances the fake `Clock` by 24 h and 5 min, but Redis keys and JWT `exp` ignore it. The FR-3 expiry, FR-4 24 h window, and FR-6 access-expiry tests either fail or need real sleeps. Two §5-mandated tests cannot be written against A's code.
- **Fix (AD-16 tightening):** *Expiry decisions are made in code against `Clock`: `resolve` checks `placedAt + 24h`, the reference lookup checks `placedAt + 24h`, and JWT verify passes `clockTimestamp: clock.now()/1000`. Redis TTLs are garbage collection only and are set from the same `Clock` value. A test that needs "key evicted" deletes the key explicitly.*

### H5. Integration harness vs `compose.test.yaml` vs CI: unreachable test databases and destructive parallelism
- **Pair:** Agent A writes `compose.test.yaml`. AD-15 says "only `proxy` publishes a host port", so `postgres-test` and `redis-test` publish nothing. Agent B writes the Vitest integration config and runs it on the host with `DATABASE_URL=...@postgres-test:5432`. Agent C writes CI per AD-18 with GitHub service containers at `localhost:5432`. Agent D writes e2e expecting `compose.test.yaml` to be an *override* that points `api` at the test databases, while A wrote it as a standalone file.
- **Clash:**
  - The host cannot reach `postgres-test`.
  - The hostname differs between local runs and CI.
  - e2e runs against the dev database, or against nothing.
  - Vitest runs files in parallel by default, and AD-16 makes every file truncate tables in `beforeEach` on a shared DB. Tests delete each other's data and become flaky.
- **Fix (AD-15/16 addendum):**
  - *`compose.test.yaml` is an override (`-f compose.yaml -f compose.test.yaml`). It adds `postgres-test` and `redis-test`, publishes them on `127.0.0.1:55432` and `127.0.0.1:56379` (the only exception to the proxy-only rule), and repoints `api`, `migrate`, and `seed` at them.*
  - *Integration tests run on the host and in CI against `localhost:55432` / `localhost:56379`, read from `TEST_DATABASE_URL` / `TEST_REDIS_URL`. CI service containers map the same ports.*
  - *Vitest integration uses `fileParallelism: false`. `globalSetup` runs `prisma migrate deploy` once.*

### H6. Web menu page (server-rendered) vs prod Dockerfile / CI image build
- **Pair:** Agent A builds `web/app/page.tsx` as a server component that fetches `API_INTERNAL_URL`, per AD-12. Agent B builds the web prod Dockerfile target (`next build`), which CI builds per AD-18.
- **Clash:** Next prerenders a page with no dynamic APIs at build time. Inside `docker build` there is no `api` host, so the build fails in CI, or it bakes in an empty or stale Menu. A baked Menu breaks FR-1 ("re-running the seed refreshes"). The same failure happens if the AD-14 env parse runs at module load during `next build`.
- **Fix (AD-12 addendum):** *The Menu page is dynamic (`export const dynamic = 'force-dynamic'`). The web env schema is parsed at request/server start (in `instrumentation.ts` or lazily), never at build. `next build` needs no running api and no secrets.*

---

## Medium

### M1. `StaffAuthGuard` vs FR-7 authz tests: 401 or 403 for a guest
- **Pair:** The auth agent's guard sees no staff cookie and returns 401. The test agent reads AD-13 ("wrong principal 403") and asserts 403 for a guest cookie on `/kitchen/*`.
- **Clash:** Returning 403 requires the guard to detect a guest cookie. That means reading the orders-owned Redis key or calling orders, which reverses H1's direction. The tests and the guard disagree.
- **Fix (AD-4):** *Staff routes return `401 UNAUTHENTICATED` for anonymous callers and for guests alike. 403 `FORBIDDEN` is used only when a valid guest touches another guest's resource.* (The PRD allows 401/403.)

### M2. Kitchen web client vs auth: who refreshes, and when
- **Pair:** The auth agent issues a 5-minute access token and rotates the refresh token on `POST /auth/refresh`. The kitchen-board agent calls `fetch` and opens the socket.
- **Clash:** After 5 minutes, the next PATCH returns 401 and the board bounces to login (nobody refreshes), or each page writes its own retry. The Socket.IO client auto-reconnects with an expired `access_token`. The handshake is rejected, and the board goes silently dead because `refresh_token` is path-scoped to `/api/v1/auth` and never reaches the socket path. Two tabs that refresh at once rotate the same `jti`. One gets a 401 and is logged out.
- **Fix (AD-5/AD-12):** *`web/lib/api.ts` is the single fetch wrapper. On a 401 from a staff route, it calls `/auth/refresh` once (single-flight per tab) and retries; a second 401 sends the user to `/kitchen/login`. On socket `connect_error` with code `UNAUTHENTICATED`, the client runs the same refresh, then reconnects.* Two-tab rotation races are acceptable for the demo; note this under Deferred.

### M3. Cookie paths vs socket handshake
- **Pair:** The auth agent picks a tidy `Path=/api/v1` for `access_token` (AD-5 fixes only the refresh path). The orders agent does the same for `guest_session`. The gateway agent reads cookies at `/api/socket.io`.
- **Clash:** The browser does not send either cookie to `/api/socket.io`. Every socket is anonymous, so the kitchen gets no events and the guest's auto-join fails.
- **Fix (AD-5/6):** *`access_token` and `guest_session` use `Path=/`. Only `refresh_token` is narrowed.*

### M4. Orders read model vs `menu` ownership: item names on the board and tracking page
- **Pair:** The orders agent obeys AD-3, which bans joining `MenuItem` from an orders adapter. It needs item names for `GuestOrderView` and `KitchenOrder`, so it calls `MenuService` per Order (N+1 on the board). Another orders-story agent uses Prisma `include: { menuItem }`, which violates AD-3, or ships ids without names.
- **Clash:** Shapes and ownership diverge. A re-seed that renames an item also rewrites history.
- **Fix (AD-9 extension):** *At placement, copy `MenuItem.name` into `OrderItem.name` alongside `unitPriceCents`. Order reads never touch `MenuItem`.* This is one column and removes the cross-module read.

### M5. Seed script vs `orders` retention / `auth` ownership
- **Pair:** The seed agent writes "Menu Items" by `deleteMany()` + `createMany()` for idempotence, and writes `StaffUser` directly through Prisma. The orders agent adds an FK from `OrderItem` to `MenuItem`.
- **Clash:** The second seed run after any Order either fails on the FK, or cascades and deletes `OrderItem`s, which violates retention. The seed also becomes a second writer of the `MenuItem` and `StaffUser` tables, which contradicts AD-3.
- **Fix (AD-11/AD-3):** *The seed is the one sanctioned out-of-module writer. It **upserts** by a stable key (fixed UUIDs in the seed file, unique `email` for staff) and never deletes. The `OrderItem → MenuItem` FK uses `onDelete: Restrict`. The seed hashes passwords with the same `PasswordHasher` adapter that auth uses.*

### M6. Seed one-shot container vs AD-14 env parsing
- **Pair:** The seed agent reuses `MenuCache` (AD-11) by booting `NestFactory.createApplicationContext(AppModule)`, which runs the full api env schema. The compose agent gives the `seed` service only `DATABASE_URL` and `REDIS_URL`.
- **Clash:** The seed exits on a missing `JWT_*` secret, `api` still starts, and the Menu is empty.
- **Fix:** *`seed`, `migrate`, and `api` share `env_file: .env` in compose. The seed boots a `SeedModule` that imports only `MenuModule` and the Prisma/Redis providers. Staff seed credentials are `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` in `.env.example`, and Playwright reads the same variables.*

### M7. Socket events vs HTTP snapshot refetch: status regressions on the client
- **Pair:** The realtime agent emits after commit. The web agent follows AD-10 ("refetch snapshot, then apply events").
- **Clash:** An event buffered during the refetch can be older than the snapshot. When applied, it moves a card back from READY to PREPARING. Two Kitchen Staff clicking quickly make this visible.
- **Fix (AD-10, one line):** *The client applies `order.status-changed` only if the incoming status is later in order than the one it holds (status is forward-only, so rank comparison is enough).* The web may use the order of the shared `OrderStatus` enum for this. That is display ordering, not validity, so it does not contradict AD-7.

---

## Low

| # | Pair | Clash | Fix |
| --- | --- | --- | --- |
| L1 | Guest tracking page vs AD-10 event payload | `order.status-changed` sent to `order:{orderId}` carries `orderId` (UUID), but AD-8 says guests never see UUIDs. Agents disagree on whether to strip it. | Amend AD-8: the UUID may appear in events because it grants nothing, since guests can only send references. Alternatively, send `{reference,status,changedAt}` to guest rooms. |
| L2 | Any two agents adding to `ErrorCode` | `UNAUTHORIZED` vs `UNAUTHENTICATED`, `VALIDATION_ERROR` vs `VALIDATION_FAILED`. | List the closed set in AD-13: `VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, INVALID_CREDENTIALS, ORDER_NOT_FOUND, MENU_ITEM_NOT_FOUND, ORDER_ALREADY_OPEN, INVALID_TRANSITION, RATE_LIMITED, INTERNAL`. |
| L3 | Throttler vs Caddy | Behind the proxy every client shares one IP, so one guest exhausts the reference-lookup limit for everyone. | `app.set('trust proxy', 1)`. Caddy forwards `X-Forwarded-For` by default. |
| L4 | WS `order.subscribe` ack vs AD-13 | The ack shape is undefined, and each side guesses. | Ack is `{ ok: true } \| { error: ErrorEnvelope.error }` and is defined in shared. |
| L5 | compose.dev hot reload vs shared `dist/` consumption | Edits to shared do not reach the apps until someone rebuilds, so agents chase "type exists but undefined" ghosts. | Dev target runs `tsc -w` for `packages/shared` (one extra compose service or a `concurrently` line). |
| L6 | Playwright vs Caddy `tls internal` | e2e fails on the self-signed certificate, or someone runs it in a container against `https://proxy`, which does not match the `localhost` site block. | Playwright runs on the host or runner against `https://localhost` with `ignoreHTTPSErrors: true`. |
| L7 | Menu cache vs startup race | The api caches an empty Menu read before the seed's write, after the seed's invalidate, with no TTL. | `MenuService` never caches an empty Menu. |

## Not holes (checked, AD already holds)

- argon2 parameters seed vs auth: verify reads params from the hash.
- Money shape: AD-9 is complete.
- Transition atomicity: AD-7's conditional `UPDATE` is sufficient for a single api.
- Menu response shape: defined once in shared by AD-2. The build order puts shared first.
- Staff/guest cookie coexistence in one browser: the demo uses two browsers, so this is not worth a rule.

## Suggested patch order

H1 → H3 (table) → H2 → H4 → H5 → H6. Then fold M1 to M7 in as one-line amendments to AD-4, AD-5, AD-6, AD-9, AD-10, and AD-11.
