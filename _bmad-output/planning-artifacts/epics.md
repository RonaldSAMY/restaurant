---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-restuarent-2026-10-17/prd.md
  - _bmad-output/planning-artifacts/prds/prd-restuarent-2026-10-17/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-restuarent-2026-10-17/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-restuarent/SPEC.md
  - _bmad-output/specs/spec-restuarent/glossary.md
  - _bmad-output/specs/spec-restuarent/user-journeys.md
---

# restuarent - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for restuarent, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: A Guest can view all Menu Items grouped by category (name, description, price) without authentication; the Menu is served from cache after the first request, and re-running the seed refreshes the cache so new Menu Items appear.
FR2: A Guest can place an Order with one or more Menu Items, quantities, and their name, without an account; it is created as Received with an Order Reference shown; zero items, quantity < 1, or an unknown Menu Item is rejected with a clear error; prices come from the server-side Menu, never the client.
FR3: Placing an Order issues a Guest Session that survives page refresh and returns the Guest to their Order's status; it reads only its own Order; it ends when the Order is Collected or 24 h after placement (whichever first), after which the Guest starts fresh with no past Orders on the device; while open, another Order is rejected with a message pointing to the open Order (per session).
FR4: An Order's status, items, and Guest name can be viewed via its Guest Session or by entering its Order Reference until 24 h after placement; afterwards, and for unknown references, the same "not found" is returned without revealing other Orders; references are non-sequential and cannot be enumerated.
FR5: An Order Status change made on the Kitchen Board is pushed to the open tracking page without reload in under 2 s.
FR6: Kitchen Staff can log in with email and password and log out; wrong credentials yield one generic error; access token 5 min, refresh token 1 h rotated on use; session survives page refresh; idle > 1 h requires login; after logout the old session and refresh token are rejected.
FR7: Only Kitchen Staff can view the Kitchen Board or change an Order Status; anonymous calls and Guest Sessions to staff endpoints are rejected; a Guest Session never grants access to another Order.
FR8: Kitchen Staff see all open Orders grouped Received / Preparing / Ready, oldest first, with items, quantities, Guest name, and time placed; new Orders and status changes by any staff appear on every open board in under 2 s; Ready stays until Collected; Collected Orders leave the board.
FR9: Kitchen Staff can advance an Order one step: Take (Received → Preparing), Mark Ready (Preparing → Ready), Mark Collected (Ready → Collected); skipping or moving backwards is rejected; Collected is final; concurrent advances on the same Order — exactly one succeeds.

### NonFunctional Requirements

NFR1: Security — passwords stored hashed (argon2id); every endpoint enforces authorization on the server, default deny.
NFR2: Data retention — every Order (including Guest name) is stored permanently and never deleted; the 24 h rule limits Guest access only.
NFR3: Tests — automated tests cover FR2 validation, FR3 one-open-Order rule and Guest Session expiry, FR4 24 h window, FR6 login/logout/refresh/revocation, FR7 every protected endpoint rejecting Guest Sessions and anonymous calls, FR9 transitions.
NFR4: Responsiveness — Menu and tracking pages work on a phone; Kitchen Board targets tablet/desktop.
NFR5: Performance — live updates (tracking page and Kitchen Board) arrive in under 2 s.
NFR6: Order Reference — 6 chars [A-Z0-9], CSPRNG, unique, server-generated, case-insensitive lookup; Guest-facing data never exposes the internal Order id.
NFR7: Money — integer cents; item name and price snapshotted at placement; client prices ignored.
NFR8: Scope — 2-day timebox; single kitchen, no payment, no Cancelled state; Guest name is not unique and never used to identify an Order.

### Additional Requirements

**Starter / greenfield (Epic 1 Story 1):** no starter template. Greenfield pnpm-workspaces monorepo; scaffold api with `@nestjs/cli@11`, web as Next.js 16 App Router. Spine build order: (1) workspace skeleton + Dockerfiles + compose stack running (proxy, web hello page, api `/health`, postgres, redis, migrate, seed) with dev hot reload; (2) lint/format/typecheck + CI skeleton; (3) `packages/shared` contracts; (4) features.

- AD-1: one pnpm-workspaces repo, exactly `apps/api`, `apps/web`, `packages/shared` (`@restaurant/shared`), `workspace:*`, pnpm pinned via `packageManager`, `injectWorkspacePackages: true`; prod images via `pnpm deploy` (api) and Next `output: 'standalone'` (web).
- AD-2: every HTTP/WS payload, `OrderStatus`, `ErrorCode` defined once as Zod in `packages/shared`; api validates inbound with global `ZodValidationPipe` / `schema.parse`; web parses every response; shared holds no Prisma types, business rules, or routes; built with `tsc` (CJS + d.ts), `tsc -w` in dev.
- AD-3: modular monolith — modules `menu`, `orders`, `auth`, `realtime`, `common`; fixed import directions, no `forwardRef`; pure domain + ports in `orders`/`auth`; table and Redis key ownership per module; `SocketServerRef` in `common`.
- AD-4: principal union `staff | guest`; global guard denies routes lacking `@Public()` / `StaffAuthGuard` / `GuestSessionGuard`; staff routes return 401 for anonymous and guests; 403 only for a valid principal on a foreign resource.
- AD-5: staff `access_token` (JWT 5 min) + `refresh_token` (JWT 1 h, `Path=/api/v1/auth`), httpOnly/Secure/SameSite=Strict; Redis `auth:session:{sid}`, `auth:refresh:{jti}`; refresh `GETDEL` rotation; logout deletes keys and disconnects `staff-session:{sid}` sockets; web `lib/api.ts` single-flight refresh on 401, then redirect to `/kitchen/login`.
- AD-6: `guest_session` cookie (opaque 128-bit id, expires placedAt + 24 h) + Redis `guest:session:{sid}` → orderId; `GuestSessionService.resolve` is the only validity check (used by guard, socket handshake, placement); `409 ORDER_ALREADY_OPEN` with reference; `/track` loads `GET /orders/current`, 401 → `/`.
- AD-7: `OrderStatusMachine` domain class; conditional `UPDATE … WHERE status = predecessor`, 0 rows → `409 INVALID_TRANSITION`.
- AD-8: UUID primary keys; separate unique `reference` with collision retry; shared throttle for reference lookup + `order.subscribe`; `trust proxy`.
- AD-9: cents everywhere; `OrderItem` snapshots name/price; `totalCents` server-computed; `OrderItem → MenuItem` `onDelete: Restrict`.
- AD-10: Socket.IO at `/api/socket.io`; server-assigned rooms (`kitchen`, `staff-session:{sid}`, `order:{orderId}`); `order.subscribe { reference }` for sessionless trackers; publish only from `OrdersService` after commit via `OrderEventsPublisher` port; events `order.created`, `order.status-changed`; clients refetch snapshot on (re)connect and apply forward-only.
- AD-11: `MenuService` owns `menu:v1` (no TTL, never cache empty); seed upserts by fixed UUIDs / staff email, never deletes, then invalidates cache; `SeedModule`; `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD`.
- AD-12: Menu page server-rendered, `force-dynamic`, via `API_INTERNAL_URL`; browser code uses same-origin `/api/v1` and Socket.IO; env parsed at server start, `next build` needs no secrets; kitchen protection via 401 flow, not `proxy.ts`.
- AD-13: one error envelope `{ error: { code, message, details? } }` from a global filter; closed `ErrorCode` set (VALIDATION_FAILED, MENU_ITEM_NOT_FOUND, UNAUTHENTICATED, INVALID_CREDENTIALS, FORBIDDEN, ORDER_NOT_FOUND, ORDER_ALREADY_OPEN, INVALID_TRANSITION, RATE_LIMITED, INTERNAL).
- AD-14: Zod env parsing at start, fail fast; shared `.env`; committed `.env.example`; no secret defaults.
- AD-15: `compose.yaml` (Caddy proxy `tls internal`, web, api, postgres, redis, one-shot migrate → seed, health-ordered startup; only proxy publishes 443; `/api/*` → api unmodified); `compose.dev.yaml` (dev targets, bind mounts, named `node_modules`, hot reload, shared watcher); `compose.test.yaml` (unpublished postgres-test/redis-test + one-shot `api-test` runner); multi-stage Dockerfile per app.
- AD-16: Vitest unit (domain, services with in-memory fakes, schemas, web components); Vitest + Supertest integration on real Nest app against real Postgres + Redis, `fileParallelism: false`, truncate/flush per file, fixture builders; Playwright e2e for UJ-1 + UJ-2 in two contexts on full stack; injected `Clock` port drives all expiry; cookie helper for Supertest.
- AD-17: TSDoc on every symbol; one root ESLint flat config (type-aware) + Prettier; `pnpm lint`, `format:check`, `typecheck` zero warnings.
- AD-18: GitHub Actions on push/PR: frozen install → lint + format → typecheck → unit → integration (in compose `api-test`) → build prod images; Playwright e2e on `main` + nightly.
- AD-19: fixed endpoint table (health, menu, orders, orders/current, orders/by-reference/:reference, auth login/refresh/logout/me, kitchen/orders, kitchen/orders/:id/status) with named shared schemas (`GuestOrderView`, `KitchenOrder`, `PlaceOrderRequest`, `LoginRequest`, `StaffMe`, `AdvanceStatusRequest`, `MenuResponse`).
- Data model: `MenuItem`, `Order`, `OrderItem`, `StaffUser` per spine ER diagram; Prisma 7 with `prisma.config.ts`, client output `src/generated/prisma` (cjs).
- Logging: Nest `Logger` per class; order lines include `reference`; never log tokens, passwords, cookies.
- Web routes: `/` (menu), `/track`, `/track/[reference]`, `/kitchen`, `/kitchen/login`.

### UX Design Requirements

None — no UX design contract exists. UI follows NFR4 and the spine's route list (AD-12).

### FR Coverage Map

FR1: Epic 1 - View cached, seeded Menu without login
FR2: Epic 2 - Place Order, server-side prices, validation
FR3: Epic 2 - Guest Session: refresh, own Order only, 24 h / Collected end, one open Order
FR4: Epic 2 - Track by Order Reference, 24 h window, uniform not-found
FR5: Epic 3 - Live status push to tracking page < 2 s
FR6: Epic 3 - Staff login/logout, token refresh rotation, revocation
FR7: Epic 3 - Staff-only board and status changes; guests/anonymous rejected
FR8: Epic 3 - Kitchen Board grouped, oldest first, live across boards
FR9: Epic 3 - Forward-only status changes, Collected final, one concurrent winner

## Epic List

### Epic 1: Guests can browse the Menu
Anyone opens `https://localhost` in a browser on the host and sees the seeded Menu grouped by category, served from cache; re-seeding shows new items. Lays the foundation per the spine build order: workspace, compose stack, quality gates + CI, shared contracts.
**FRs covered:** FR1

### Epic 2: Guests order and track without an account
A Guest places an Order, gets an Order Reference, returns to it after refresh, looks it up by reference on another device, is blocked from a second open Order, and loses access at Collected or 24 h.
**FRs covered:** FR2, FR3, FR4

### Epic 3: Kitchen Staff run the board live
Kitchen Staff log in, see all open Orders grouped Received / Preparing / Ready, advance them forward-only, and every board plus the Guest tracking page updates in under 2 s; logout revokes the session. Completes the UJ-1 + UJ-2 demo.
**FRs covered:** FR5, FR6, FR7, FR8, FR9

## Epic 1: Guests can browse the Menu

Anyone opens `https://localhost` in a browser on the host and sees the seeded Menu grouped by category, served from cache; re-seeding shows new items. Lays the foundation per the spine build order. Creates only the `MenuItem` table.

### Story 1.1: Running stack skeleton

As the Builder,
I want the monorepo and full compose stack to start with one command,
So that every later story runs in the same environment locally, in tests, and in CI.

**Implements:** NFR8; AD-1, AD-14, AD-15

**Acceptance Criteria:**

**Given** a fresh clone with `.env` copied from `.env.example`
**When** I run `docker compose up`
**Then** `postgres`/`redis` become healthy → `migrate` completes → `seed` completes → `api` is healthy → `web` → `proxy` start in that order
**And** `https://localhost/api/v1/health` returns `{ "ok": true }` and `https://localhost/` serves a Next.js placeholder page.

**Given** the repo layout
**When** I inspect it
**Then** there are exactly three workspace packages `apps/api`, `apps/web`, `packages/shared` (`@restaurant/shared`) linked with `workspace:*`
**And** pnpm is pinned via `packageManager`, `injectWorkspacePackages: true` is set, and no Turborepo/Nx is present.

**Given** the compose files
**When** I check published ports
**Then** only `proxy` publishes a host port (443, Caddy `tls internal`)
**And** Caddy forwards `/api/*` unmodified to `api:3000` and everything else to `web:3000`.

**Given** a required env var is missing
**When** `api` or `web` starts
**Then** it exits with a Zod validation error (AD-14)
**And** no secret has a default value in code.

**Given** `compose.dev.yaml`
**When** I edit source in `api`, `web`, or `shared`
**Then** the change hot-reloads, with source bind-mounted and `node_modules` in named volumes.

**Given** each app's multi-stage Dockerfile
**When** I build the `prod` target
**Then** api builds via `pnpm deploy --filter api --prod` and web via `output: 'standalone'`
**And** web's `next build` needs no api and no secrets.

### Story 1.2: Quality gates, test harness, and CI

As the Builder,
I want lint, format, typecheck, and real-infra tests running locally and on every push,
So that nothing merges that only works on one machine.

**Implements:** NFR3; AD-16, AD-17, AD-18

**Acceptance Criteria:**

**Given** a root `eslint.config.mjs` (type-aware typescript-eslint, Next plugin for web), Prettier, and `eslint-config-prettier`
**When** I run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`
**Then** each passes with zero warnings
**And** tsconfigs set `types` explicitly and do not use `baseUrl`.

**Given** any class, method, property, function, type, or Zod schema (exported or not)
**When** it is committed
**Then** it carries a TSDoc comment stating what it is for, naming the pattern where one is used (Repository, State machine, Adapter, Guard)
**And** `pnpm lint` enforces it (e.g. `eslint-plugin-jsdoc` require rules) with zero warnings (AD-17).

**Given** Vitest in every package (`unplugin-swc` in api)
**When** I run `pnpm test`
**Then** unit tests run with no infrastructure.

**Given** `compose.test.yaml` with unpublished `postgres-test` / `redis-test` and a one-shot `api-test` runner
**When** I run `docker compose -f compose.yaml -f compose.test.yaml run --rm api-test`
**Then** it runs against them with `fileParallelism: false`, `globalSetup` running `prisma migrate deploy` once, and each file truncating tables and flushing Redis in `beforeEach`
**And** a `/health` integration test passes via Supertest.

**Given** `common/`
**When** a test needs time control
**Then** a `Clock` port with a system adapter and an advanceable fake adapter is available.

**Given** a Supertest response that sets cookies
**When** a following request needs them
**Then** one helper copies `Set-Cookie` into a `Cookie` header.

**Given** `.github/workflows/ci.yml`
**When** I push or open a PR
**Then** it runs frozen install → lint + format check → typecheck → unit → integration (the same `api-test` compose command) → build api and web prod images.

**Given** the Story 1.2 entries in `implementation-artifacts/deferred-work.md` (env fail-fast tests, compose smoke job, sentinel env file check, `prisma.config.ts` typecheck, `init: true` assertion)
**When** Story 1.2 is specced
**Then** each is in scope or explicitly re-deferred.

### Story 1.3: Shared contracts and API conventions

As the Builder,
I want one wire contract, one error envelope, and default-deny routing before any feature exists,
So that every endpoint is validated, secured, and shaped the same way.

**Implements:** NFR1; AD-2, AD-3, AD-4, AD-13

**Acceptance Criteria:**

**Given** `packages/shared`
**When** it builds (`tsc` → CJS + `.d.ts`; `tsc -w` in dev)
**Then** it exports `OrderStatusSchema` (`RECEIVED | PREPARING | READY | COLLECTED`), `ErrorCodeSchema` (exactly the 10 AD-13 codes), and `ErrorEnvelopeSchema`
**And** it depends only on `zod`, with no Prisma types or business rules; the api prefix and endpoint paths live in `api-routes.ts`.

**Given** the api
**When** any route throws a domain error, fails validation, or crashes
**Then** one global exception filter returns `{ error: { code, message, details? } }` with the AD-13 status (validation → `400 VALIDATION_FAILED`, unexpected → `500 INTERNAL`)
**And** no token, password, or cookie is logged.

**Given** the global guard
**When** a route carries none of `@Public()`, `StaffAuthGuard`, `GuestSessionGuard`
**Then** requests to it are rejected (default deny)
**And** `/health` is `@Public()`.

**Given** a global `ZodValidationPipe`
**When** a request body fails its shared schema
**Then** the response is `400 VALIDATION_FAILED` with field details.

**Given** an integration test
**When** it calls a test-only route with no guard decorator
**Then** it is rejected, proving default deny.

### Story 1.4: Menu API with cache and seed

As a Guest,
I want the Menu served by the API grouped by category,
So that I can see what's on offer without logging in.

**Implements:** FR1; NFR7; AD-3, AD-9, AD-11, AD-19

**Acceptance Criteria:**

**Given** the Prisma `MenuItem` model (UUID id, name, description, category, `priceCents` int) and its migration
**When** `seed` runs
**Then** it upserts demo Menu Items by fixed UUIDs, never deletes, and then calls `MenuCache.invalidate()`
**And** it boots a `SeedModule` importing only `MenuModule`, Prisma, and Redis.

**Given** an anonymous client
**When** it calls `GET /api/v1/menu`
**Then** it receives `200` with `MenuResponse` (shared schema): items grouped by category with name, description, `priceCents`.

**Given** `menu:v1` is absent in Redis
**When** the Menu is requested
**Then** `MenuService` loads from Postgres, writes `menu:v1` (no TTL), and returns it
**And** an empty Menu is never cached.

**Given** `menu:v1` is cached
**When** the Menu is requested again
**Then** it is served from Redis without a DB query (verified by integration test).

**Given** a new Menu Item added to seed data
**When** the seed is re-run
**Then** the next `GET /api/v1/menu` includes it.

### Story 1.5: Public Menu page

As a Guest on my phone,
I want to browse the Menu by category,
So that I can decide what to order.

**Implements:** FR1; NFR4; AD-2, AD-12

**Acceptance Criteria:**

**Given** the web app
**When** I open `/`
**Then** the page is server-rendered and dynamic (`force-dynamic`), fetching `${API_INTERNAL_URL}/api/v1/menu` per request
**And** the response is parsed with `MenuResponseSchema`.

**Given** a Menu with items in several categories
**When** the page renders
**Then** items appear under category headings with name, description, and price formatted from cents only at render.

**Given** a phone viewport (375 px)
**When** I view the page
**Then** it is readable and usable with no horizontal scroll.

**Given** the api is unreachable or errors
**When** the page renders
**Then** a friendly "Menu unavailable" state shows instead of a crash.

**Given** `next build`
**When** it runs in CI
**Then** it succeeds with no api and no secrets (env parsed at server start in `instrumentation.ts`).

## Epic 2: Guests order and track without an account

A Guest places an Order, gets an Order Reference, returns to it after refresh via the Guest Session, looks it up by reference on another device, is blocked from a second open Order, and loses access at Collected or 24 h. Adds `Order` and `OrderItem` tables. Status is shown as a snapshot; live updates arrive in Epic 3.

### Story 2.1: Place Order API

As a Guest,
I want to submit an Order with items, quantities, and my name,
So that the kitchen receives it and I get an Order Reference.

**Implements:** FR2; NFR2, NFR6, NFR7, NFR8; AD-8, AD-9, AD-19

**Acceptance Criteria:**

**Given** Prisma `Order` (UUID id, unique `reference`, `guestName`, `status`, `totalCents`, `placedAt timestamptz`) and `OrderItem` (UUID id, `name`, `quantity`, `unitPriceCents`, FK → `MenuItem` `onDelete: Restrict`)
**When** the migration runs
**Then** both tables exist
**And** `guestName` has no unique constraint.

**Given** a valid `PlaceOrderRequest` `{ guestName, items[{ menuItemId, quantity }] }`
**When** `POST /api/v1/orders` is called anonymously
**Then** it returns `201 GuestOrderView` `{ reference, guestName, status: RECEIVED, items[{ name, quantity, unitPriceCents }], totalCents, placedAt }`
**And** the body never contains the Order UUID.

**Given** the client sends any price field or a stale price
**When** the Order is stored
**Then** `OrderItem.name` / `unitPriceCents` are copied from `MenuItem` and `totalCents` is computed server-side; client prices are ignored.

**Given** zero items, a quantity < 1, or an empty name
**When** submitted
**Then** the response is `400 VALIDATION_FAILED`.

**Given** an unknown `menuItemId`
**When** submitted
**Then** the response is `400 MENU_ITEM_NOT_FOUND` and no Order is created.

**Given** the `OrderReference` domain class
**When** a reference is generated
**Then** it is 6 chars `[A-Z0-9]` from a CSPRNG (unit-tested)
**And** a unique-constraint collision triggers a retry with a new reference.

**Given** two Guests with the same name
**When** both place Orders
**Then** both succeed with different references.

### Story 2.2: Guest Session

As a Guest,
I want my browser to remember my open Order,
So that a refresh brings me back to it and I can't accidentally place a second Order.

**Implements:** FR3, FR7; NFR3; AD-4, AD-6, AD-16

**Acceptance Criteria:**

**Given** a successful placement
**When** the response returns
**Then** it sets cookie `guest_session` (opaque 128-bit CSPRNG id; `HttpOnly; Secure; SameSite=Strict; Path=/`; `Expires = placedAt + 24 h`) and Redis `guest:session:{sid}` → orderId with TTL derived from `Clock`.

**Given** a valid Guest Session
**When** `GET /api/v1/orders/current` is called
**Then** it returns that Order's `GuestOrderView`.

**Given** `GuestSessionService.resolve(sid)`
**When** the key is missing, the Order is `COLLECTED`, or `clock.now() >= placedAt + 24 h`
**Then** it deletes the key and returns `null`, and `/orders/current` returns `401 UNAUTHENTICATED`
**And** `GuestSessionGuard` and the place-order use case both use `resolve` as the only validity check.

**Given** an active Guest Session
**When** the Guest calls `POST /api/v1/orders` again
**Then** the response is `409 ORDER_ALREADY_OPEN` with `details.reference` of the open Order.

**Given** the fake `Clock` advanced 24 h past `placedAt`, or the Order set `COLLECTED` via fixture
**When** the Guest places a new Order
**Then** it succeeds and a new Guest Session is issued.

**Given** a Guest Session
**When** it is used
**Then** it can read only its own Order; no route lets a session address another Order.

**Given** the integration suite (NFR3)
**When** it runs
**Then** it covers the one-open-Order rule, expiry at exactly 24 h via fake clock, and session end at Collected.

### Story 2.3: Track by Order Reference API

As a Guest on another device,
I want to look up my Order by typing its reference,
So that I can see its status without the original browser.

**Implements:** FR4; NFR2, NFR3, NFR6; AD-8, AD-16

**Acceptance Criteria:**

**Given** an Order placed < 24 h ago
**When** `GET /api/v1/orders/by-reference/:reference` is called anonymously in any letter case
**Then** it returns `200 GuestOrderView` (reference normalized to upper case).

**Given** an unknown reference, or an Order with `clock.now() >= placedAt + 24 h`
**When** looked up
**Then** both return the identical `404 ORDER_NOT_FOUND` body
**And** the expired Order is still stored in Postgres (NFR2).

**Given** repeated lookups from one client
**When** they exceed the throttle limit
**Then** the response is `429 RATE_LIMITED`; the throttle is reusable by `order.subscribe` later
**And** the api sets `trust proxy` so limits are per client, not per Caddy.

**Given** the integration suite (NFR3)
**When** it runs
**Then** it covers the 24 h window via fake clock and identical 404s for unknown vs expired references.

### Story 2.4: Place an Order from the Menu page

As a Guest on my phone,
I want to add dishes to a basket, enter my name, and place the Order,
So that I can order without creating an account.

**Implements:** FR2, FR3; NFR4; AD-2, AD-12, AD-13

**Acceptance Criteria:**

**Given** the Menu page
**When** I add items and adjust quantities
**Then** a basket shows items, quantities, and a running total formatted from cents (estimate; the server total is authoritative).

**Given** a filled basket and a name
**When** I submit
**Then** the browser calls same-origin `POST /api/v1/orders` through `lib/api.ts`, parses the result with the shared schema, and navigates to `/track`.

**Given** the API returns an error
**When** I submit
**Then** `VALIDATION_FAILED` / `MENU_ITEM_NOT_FOUND` show a clear inline error and `ORDER_ALREADY_OPEN` shows a message linking to my open Order
**And** the UI branches on `error.code`, never `message`.

**Given** an empty basket or no name
**When** I try to submit
**Then** submit is disabled with client-side validation from the same shared schema.

**Given** a 375 px viewport
**When** I use the basket
**Then** it works with no horizontal scroll.

### Story 2.5: Order tracking pages

As a Guest,
I want to see my Order's status, items, and name from my session or by entering the reference,
So that I know where my food is.

**Implements:** FR3, FR4; NFR4; AD-6, AD-12

**Acceptance Criteria:**

**Given** a valid Guest Session
**When** I open or refresh `/track`
**Then** it loads `GET /api/v1/orders/current` and shows reference, status, items, total, and my name.

**Given** no or an expired Guest Session
**When** I open `/track`
**Then** the 401 redirects me to `/` to start fresh.

**Given** `/track/[reference]` (or a lookup form on `/track` leading there)
**When** I enter a valid reference
**Then** it shows the same Order view via `GET /api/v1/orders/by-reference/:reference`.

**Given** an unknown or expired reference
**When** I look it up
**Then** a neutral "Order not found" message shows
**And** `RATE_LIMITED` shows "try again shortly".

**Given** a 375 px viewport
**When** I view either page
**Then** it is readable with no horizontal scroll and the status (Received / Preparing / Ready / Collected) is prominent.

## Epic 3: Kitchen Staff run the board live

Kitchen Staff log in, see all open Orders grouped Received / Preparing / Ready, advance them forward-only, and every board plus the Guest tracking page updates in under 2 s; logout revokes the session. Adds `StaffUser`. Completes the UJ-1 + UJ-2 demo.

### Story 3.1: Staff login, refresh, and logout API

As Kitchen Staff,
I want to log in with email and password, stay logged in while active, and log out,
So that only I can use my session.

**Implements:** FR6, FR7; NFR1, NFR3; AD-4, AD-5, AD-11, AD-16

**Acceptance Criteria:**

**Given** Prisma `StaffUser` (UUID id, unique `email`, `passwordHash`) and a `PasswordHasher` port with an argon2id adapter
**When** the seed runs
**Then** it upserts the staff user by `email` from `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD`, storing only the hash.

**Given** valid credentials
**When** `POST /api/v1/auth/login` is called
**Then** it returns `200 StaffMe` and sets `access_token` (JWT 5 min, `staffId`, `sid`, `Path=/`) and `refresh_token` (JWT 1 h, `sid`, `jti`, `Path=/api/v1/auth`), both `HttpOnly; Secure; SameSite=Strict`
**And** Redis holds `auth:session:{sid}` → staffId and `auth:refresh:{jti}` → sid, never the token strings.

**Given** a wrong email or a wrong password
**When** login is attempted
**Then** both return the identical `401 INVALID_CREDENTIALS`.

**Given** a valid refresh cookie
**When** `POST /api/v1/auth/refresh` is called
**Then** the `jti` is consumed atomically (`GETDEL`), a new pair is issued, and the response is `204`
**And** replaying the old refresh token returns `401`.

**Given** an access token whose `sid` is no longer in Redis
**When** a `StaffAuthGuard` route is called
**Then** the response is `401 UNAUTHENTICATED`
**And** JWT expiry is verified against `Clock`.

**Given** a logged-in staff member
**When** `POST /api/v1/auth/logout` is called
**Then** both Redis keys are deleted, cookies are cleared, and the response is `204`
**And** the old access and refresh tokens are rejected afterwards.

**Given** a valid session
**When** `GET /api/v1/auth/me` is called
**Then** it returns `StaffMe`.

**Given** the integration suite (NFR3)
**When** it runs
**Then** it covers login, the generic error, refresh rotation, access expiry at 5 min via fake clock, idle > 1 h expiry, and revocation after logout.

### Story 3.2: Kitchen Orders API and status transitions

As Kitchen Staff,
I want to list open Orders and move each one forward a step,
So that Guests know where their food is.

**Implements:** FR3, FR7, FR8, FR9; NFR3; AD-4, AD-7, AD-19

**Acceptance Criteria:**

**Given** a staff session
**When** `GET /api/v1/kitchen/orders` is called
**Then** it returns `KitchenOrder[]` (`GuestOrderView` + `id`) for all non-`COLLECTED` Orders, `placedAt` ascending.

**Given** `OrderStatusMachine` (pure domain, unit-tested)
**When** asked about a requested `to`
**Then** it knows only `RECEIVED → PREPARING → READY → COLLECTED`, returns the required predecessor, and treats `COLLECTED` as final.

**Given** `PATCH /api/v1/kitchen/orders/:id/status` `{ to }`
**When** the Order is in the predecessor status
**Then** one conditional `UPDATE … WHERE id AND status = predecessor` applies it and returns `200 KitchenOrder`.

**Given** a skipped step, a backward move, or any change to a `COLLECTED` Order
**When** requested
**Then** the response is `409 INVALID_TRANSITION` and the Order is unchanged.

**Given** two concurrent advances of the same Order
**When** both run
**Then** exactly one returns `200` and the other `409 INVALID_TRANSITION`.

**Given** an unknown Order id
**When** patched
**Then** the response is `404 ORDER_NOT_FOUND`.

**Given** an Order advanced to `COLLECTED`
**When** its Guest Session is used afterwards
**Then** `resolve` returns `null` and the Guest starts fresh (FR3).

**Given** the integration suite (NFR3, FR7)
**When** it runs
**Then** every staff route (`kitchen/*`, `auth/logout`, `auth/me`) returns `401 UNAUTHENTICATED` for anonymous calls and for calls with a valid Guest Session
**And** all FR9 transitions are covered.

### Story 3.3: Staff login page and Kitchen Board

As Kitchen Staff on a tablet,
I want a login page and a board with Received / Preparing / Ready columns and one-tap actions,
So that I can run the kitchen from one screen.

**Implements:** FR6, FR8, FR9; NFR4; AD-5, AD-12

**Acceptance Criteria:**

**Given** `/kitchen/login`
**When** I submit valid credentials
**Then** I land on `/kitchen`
**And** invalid credentials show one generic error.

**Given** `lib/api.ts`
**When** a staff route returns 401
**Then** it calls `POST /api/v1/auth/refresh` once (single-flight per tab) and retries
**And** a second 401 navigates to `/kitchen/login`; JavaScript never reads a token.

**Given** `/kitchen`
**When** it loads
**Then** it shows three columns (Received, Preparing, Ready), oldest first, each card with reference, Guest name, items, quantities, and time placed.

**Given** a card
**When** I tap its action (Take / Mark Ready / Mark Collected)
**Then** the card moves to the next column, or leaves the board on Collected
**And** a `409 INVALID_TRANSITION` refetches the board and shows a short notice.

**Given** the logout button
**When** I tap it
**Then** my session ends and I am sent to `/kitchen/login`.

**Given** a tablet/desktop viewport (≥ 768 px)
**When** I view the board
**Then** the three columns sit side by side and are usable.

### Story 3.4: Live updates for board and tracking page

As a Guest and as Kitchen Staff,
I want status changes and new Orders to appear without reloading,
So that everyone sees the same state within 2 s.

**Implements:** FR5, FR8; NFR5; AD-3, AD-10

**Acceptance Criteria:**

**Given** a Socket.IO gateway at `/api/socket.io` and `SocketServerRef` in `common/`
**When** a client connects
**Then** the server assigns rooms from cookies — valid staff → `kitchen` + `staff-session:{sid}`; `GuestSessionService.resolve` hit → `order:{orderId}`; otherwise none
**And** the client never names a room.

**Given** a sessionless client
**When** it sends `order.subscribe { reference }`
**Then** the reference is validated like the HTTP lookup (shared throttle, 24 h window), it joins `order:{orderId}`, and the ack is `{ ok: true } | { error }` (shared schema).

**Given** `OrdersService`
**When** an Order is placed or advanced and the DB write commits
**Then** it publishes via the `OrderEventsPublisher` port: `order.created` (`KitchenOrder`) → `kitchen`; `order.status-changed` `{ id, reference, status, changedAt }` → `kitchen` and `{ reference, status, changedAt }` → `order:{id}` (no UUID)
**And** nothing is emitted for a failed or rolled-back write.

**Given** the tracking page or the board
**When** the socket connects or reconnects
**Then** it refetches the HTTP snapshot, then applies events, ignoring any event whose status does not rank later than the one held.

**Given** a staff logout
**When** it completes
**Then** the server disconnects `staff-session:{sid}` sockets.

**Given** a board socket `connect_error` with `UNAUTHENTICATED`
**When** it occurs
**Then** the board runs the same refresh flow and reconnects.

**Given** two boards and one tracking page open
**When** a staff member advances an Order or a Guest places one
**Then** every open view reflects it in under 2 s (FR5, FR8).

### Story 3.5: End-to-end demo tests

As the Builder,
I want UJ-1 and UJ-2 automated against the full stack,
So that the demo is proven and stays proven.

**Implements:** FR5, FR6, FR8, FR9 (UJ-1, UJ-2); NFR3, NFR5; AD-16, AD-18

**Acceptance Criteria:**

**Given** Playwright (`ignoreHTTPSErrors`) against the compose stack at `https://localhost`
**When** the e2e suite runs
**Then** UJ-1 + UJ-2 run in two browser contexts: Guest orders; staff logs in and advances to Collected; the Guest page shows each status within 2 s without reload; after Collected the Guest's `/track` returns to `/`
**And** a refresh during tracking keeps the Order visible.

**Given** a third context
**When** it enters the Order Reference on `/track/[reference]`
**Then** it shows the same status (UJ-1 edge case).

**Given** staff logout
**When** the old session is reused
**Then** it is rejected (UJ-2).

**Given** `.github/workflows/ci.yml`
**When** code lands on `main` and nightly
**Then** the Playwright e2e job runs against the compose stack.
