# Epic 2 Context: Guests order and track without an account

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A Guest places an Order from the Menu without an account and gets an Order Reference. A refresh brings them back to that Order through the Guest Session. They can look it up by reference on another device, they are blocked from a second open Order, and they lose access when the Order is Collected or 24 h after placement. The epic adds the `Order` and `OrderItem` tables, the `orders` module (pure domain + ports), the Guest Session, and the web basket and tracking pages. Status is a snapshot here; live updates and staff actions arrive in Epic 3, so tests set `COLLECTED` and other statuses through fixtures.

## Stories

- Story 2.1: Place Order API
- Story 2.2: Guest Session
- Story 2.3: Track by Order Reference API
- Story 2.4: Place an Order from the Menu page
- Story 2.5: Order tracking pages

## Requirements & Constraints

- **Placement:** anonymous, with a guest name plus one or more Menu Items and quantities. Zero items, quantity < 1 or an empty name → `400 VALIDATION_FAILED`. An unknown Menu Item → `400 MENU_ITEM_NOT_FOUND` and no Order is created. A new Order starts as `RECEIVED`.
- **Prices:** prices come from the server-side Menu. Client price fields are ignored. Money is integer cents, and `totalCents` is computed server-side.
- **Guest Session:** survives refresh and reads only its own Order. It ends at Collected or at placedAt + 24 h, whichever comes first, and afterwards the device keeps no past Orders. While it is open, a new placement → `409 ORDER_ALREADY_OPEN` with the open Order's reference. The rule is per session: another device or a cleared browser counts as a new Guest.
- **Reference lookup:** works in any letter case until placedAt + 24 h. Unknown and expired references return the identical `404 ORDER_NOT_FOUND`. Lookups are rate limited (`429 RATE_LIMITED`).
- **Retention:** Orders are never deleted. The 24 h rule limits Guest access only. Guest name is not unique and never identifies an Order.
- **Order Reference:** 6 chars `[A-Z0-9]`, from a CSPRNG, unique, server-generated, not enumerable. Guest-facing data never exposes the internal Order UUID.
- **Tests:** integration tests must cover placement validation, the one-open-Order rule, Guest Session expiry at exactly 24 h (fake clock), session end at Collected, the 24 h lookup window, and identical 404s for unknown and expired references.
- **Pages:** Menu/basket and tracking pages work at 375 px with no horizontal scroll, and the status is prominent.
- **Scope:** no payment, no Cancelled state, no account.

## Technical Decisions

- **Data model:** `Order` has a UUID `id`, a unique `reference`, `guestName` (no unique constraint), `status` (a Prisma enum mirroring shared `OrderStatus`), `totalCents` and `placedAt timestamptz`. `OrderItem` has a UUID `id`, `name`, `quantity` and `unitPriceCents`, with an FK to `MenuItem` using `onDelete: Restrict`. Name and price are snapshots copied from `MenuItem` at placement, so Order reads never join `MenuItem`.
- **Ownership:** the `orders` module owns `Order`, `OrderItem` and Redis `guest:session:{sid}`. It imports `menu` (reads Menu Items through `MenuService`) and `common` only, with no `forwardRef`. Rule-heavy code is split into layers: `domain/` (pure TS: `OrderReference`, `GuestSessionPolicy`, …), `ports/` (e.g. `OrderRepository`), `adapters/` (`PrismaOrderRepository`, Redis store) and services with one use case per public method. Controllers parse input, call one service method and map the result. Domain errors carry an `ErrorCode`, and the global filter maps them.
- **Reference generation:** `OrderReference` (domain) generates the value. On a unique-constraint collision, the service retries with a new one. Lookup normalizes the reference to upper case.
- **Guest Session:** the `guest_session` cookie holds an opaque 128-bit CSPRNG id and is set as `HttpOnly; Secure; SameSite=Strict; Path=/` with `Expires = placedAt + 24 h`. Redis `guest:session:{sid}` maps to the orderId, with a TTL from `Clock` used for cleanup only. `GuestSessionService.resolve(sid)` is the **only** validity check: the key exists, the Order is not `COLLECTED`, and `clock.now() < placedAt + 24 h`. Otherwise it deletes the key and returns `null`. `GuestSessionGuard`, the place-order use case and, later, the socket handshake all call it. Placement is `@Public()` and calls `resolve` to enforce the 409.
- **Principal:** the guard sets the discriminated-union principal `{ kind: 'guest', sid, orderId }`. Guards extend `PrincipalGuard` by implementing `authenticate()`, which sets `req.principal` or throws 401. `DefaultDenyGuard` denies subclasses that override `canActivate`. No route lets a guest address another Order.
- **Expiry:** expiry is always decided in code against the injected `Clock` port, never by Redis TTL.
- **Throttle:** one throttle (`@nestjs/throttler`) for the reference lookup, which `order.subscribe` will reuse in Epic 3. The api sets `trust proxy` so limits apply per client, not per Caddy.
- **Endpoints and contracts:** paths come from `api-routes.ts`. Schemas `PlaceOrderRequest` and `GuestOrderView` live in `@restaurant/shared`.
  - `POST /api/v1/orders` (Public + resolve) takes `PlaceOrderRequest { guestName, items[{ menuItemId, quantity }] }` and returns `201 GuestOrderView` plus the cookie.
  - `GET /api/v1/orders/current` (GuestSession) returns `GuestOrderView`.
  - `GET /api/v1/orders/by-reference/:reference` (Public, throttled) returns `GuestOrderView`.
  - `GuestOrderView` is `{ reference, guestName, status, items[{ name, quantity, unitPriceCents }], totalCents, placedAt }`, with dates as ISO-8601 UTC strings.
- **Web:** browser code calls same-origin `/api/v1/...` only through `apps/web/lib/api.ts`, the single fetch wrapper. It parses every response with shared schemas and branches on `error.code`, never `message`. `VALIDATION_FAILED` details are `ValidationIssue[]`; parse them with `ValidationIssueSchema.array()`. Forms validate with the same shared schema. Routes: `/` (Menu plus basket), `/track` (loads `/orders/current`; a 401 redirects to `/`) and `/track/[reference]`. Next 16 `params`/`cookies()` must be awaited.
- **Testing:** integration tests use real Postgres and Redis in `api-test`. Data comes from fixture builders (`buildMenuItem`, `buildOrder`). Requests carry cookies through the `Set-Cookie` → `Cookie` helper. Tests advance the fake `Clock` for expiry.
- **Logging:** order log lines include `reference`. Never log cookies or session ids.

## UX & Interaction Patterns

- The basket shows items, quantities and a running total formatted from cents. The total is an estimate, and the server total is authoritative. Submit stays disabled while the basket is empty or the name is missing.
- On error, `VALIDATION_FAILED` and `MENU_ITEM_NOT_FOUND` show a clear inline error. `ORDER_ALREADY_OPEN` shows a message linking to the open Order. On success the page navigates to `/track`.
- The tracking view shows the reference, a prominent status (Received / Preparing / Ready / Collected), the items, the total and the guest name. Unknown or expired references show a neutral "Order not found", and `RATE_LIMITED` shows "try again shortly". `/track` can offer a lookup form that leads to `/track/[reference]`.
- Both pages are mobile-first at 375 px.

## Cross-Story Dependencies

- 2.1 → 2.2 → 2.3 are API stories, each building on the previous one: 2.2 adds the cookie and 409 to 2.1's placement, and 2.3 reuses `GuestOrderView` and the Clock-based 24 h rule. 2.4 needs 2.1 and 2.2. 2.5 needs 2.2 and 2.3.
- From Epic 1: `MenuService` and seeded Menu Items, default deny, `@Public()`, `PrincipalGuard`, the error filter, the `Clock` port, the cookie helper and the integration harness.
- For Epic 3: `GuestSessionService.resolve` serves the socket handshake, the lookup throttle serves `order.subscribe`, and `OrdersService` later gains the `OrderEventsPublisher` port. Keep `GuestOrderView` reusable as the base of `KitchenOrder` (which adds `id`).
- Open deferred items this epic should take into scope or explicitly re-defer:
  - Epic 2 adds the first non-seed writes, so add `CHECK ("priceCents" >= 0)` on `MenuItem` or validate before caching.
  - Web logs only the HTTP status and never parses the error envelope; settle this with 2.4's `code` branching.
  - `ErrorEnvelopeFilter` redacts only `PrismaClient*` errors. The 2.1 reference-collision path raises a unique violation through `@prisma/adapter-pg`, so check that its log leaks no values.
