---
title: 'Story 2.2: Guest Session'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '996af48b827c59921f652eb443c6282789bec7d9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After placing an Order, the browser has nothing that ties it to that Order. A refresh loses it, and the Guest can place any number of Orders at once.

**Approach:** Placement sets an opaque `guest_session` cookie and the Redis key `guest:session:{sid}` → orderId. `GuestSessionService.resolve(sid)` is the single validity check. It is used by a new `GuestSessionGuard` on `GET /api/v1/orders/current` and by placement, which returns `409 ORDER_ALREADY_OPEN` while a session is open.

## Boundaries & Constraints

**Always:**
- The sid is `randomBytes(16)` as 32 lowercase hex chars. If the cookie value does not match `^[0-9a-f]{32}$`, it is treated as absent, with no Redis call.
- Cookie: `guest_session=<sid>; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=placedAt + 24 h`. It is set through Express `res.cookie` on the 201 only.
- Redis: `SET guest:session:{sid} <orderId> PX (placedAt + 24 h − clock.now())`. The TTL is for cleanup only.
- `resolve(sid)` returns the session (sid plus stored Order) only when the key exists, the Order is not `COLLECTED`, and `clock.now() < placedAt + 24 h`. In every other case it `DEL`s the key and returns `null`. The open/expiry rule is a pure domain function (`GuestSessionPolicy`) that takes `now` as an argument.
- The guard sets the principal `{ kind: 'guest', sid, orderId }` and throws 401 `UNAUTHENTICATED` on `null`. `/current` reads only `principal.orderId`. No guest route takes an Order id or reference.
- When placement finds an open session, it throws `409 ORDER_ALREADY_OPEN` with `details: { reference }` and creates no Order. If the cookie is stale, placement continues and the new cookie replaces the old one.
- Never log the sid or the cookie.
- Decision (Q1): migration `<ts>_order_item_position` adds `OrderItem.position Int NOT NULL` (0-based basket order, `CHECK >= 0`, and no unique constraint, because the 2.1 retry treats any P2002 as a reference collision). Placement writes it, and every Order read uses `orderBy: { position: 'asc' }`.

**Never:** no reference lookup or throttle, and no `trust proxy` (both are Story 2.3). No web changes. No new dependencies (no `cookie-parser`). No expiry decided by Redis TTL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Place | no cookie | 201, `Set-Cookie` with all attributes, Redis key with PTTL ≈ 24 h | N/A |
| Current | valid cookie | 200 `GuestOrderView` of that Order | N/A |
| Current, no cookie | none, or malformed value | — | 401 `UNAUTHENTICATED` |
| Current, unknown sid | well-formed sid not in Redis | — | 401 |
| Expiry boundary | clock at placedAt + 24 h − 1 ms / + 24 h | 200 / 401 and key deleted | 401 |
| Collected | Order set `COLLECTED` via Prisma | 401 and key deleted | 401 |
| Second placement | open session | Order count unchanged | 409 `ORDER_ALREADY_OPEN`, `details.reference` |
| Re-place after end | clock + 24 h, or `COLLECTED` | 201, new sid; `/current` with the new cookie returns the new Order | N/A |
| Isolation | guests A and B | each `/current` returns only its own Order | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/common/default-deny.guard.ts` -- `PrincipalGuard` (implement `authenticate` only, never `canActivate`), `Principal`, `PrincipalRequest`.
- `apps/api/src/common/domain-error.ts` -- `ORDER_ALREADY_OPEN` → 409 and `UNAUTHENTICATED` → 401 are already mapped.
- `apps/api/src/common/redis.module.ts` -- `REDIS` token and `RedisClient`. `menu/menu.cache.ts` is the key-owner pattern.
- `apps/api/src/common/clock.ts` -- `Clock`, which is already provided in `OrdersModule`.
- `apps/api/src/orders/orders.service.ts` -- `place()`, `toGuestView(order, items)`. Reuse the mapping for reads.
- `apps/api/src/orders/ports/order-repository.ts` + `adapters/prisma-order.repository.ts` -- add `findById`.
- `apps/api/test/cookies.ts` -- `cookieHeader(res)` replays Secure cookies over http.
- `apps/api/test/orders.int-spec.ts` -- boot pattern with a `FakeClock` override. Its tests send no cookie, so they stay valid.
- Do not change `ErrorEnvelopeFilter`, `DefaultDenyGuard` or the shared contracts. `GuestOrderView` already fits.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/common/cookies.ts` (+ `.spec.ts`) -- `readCookie(header: string | undefined, name): string | undefined`. A minimal parser so no dependency is needed; the spec covers missing header, multiple cookies and an absent name.
- [x] `apps/api/src/orders/domain/guest-session-policy.ts` -- `GUEST_SESSION_MS`, `newSessionId()`, `isSessionId(v)`, `expiresAt(placedAt)`, `isOpen(order, now)`. Pure TS.
- [x] `apps/api/prisma/schema.prisma` + `migrations/<ts>_order_item_position/migration.sql` -- the `position` column and the hand-appended CHECK. Generate with `prisma migrate diff` in the `api-test` container, following the 2.1 pattern.
- [x] `ports/order-repository.ts`, `adapters/prisma-order.repository.ts` -- `findById(id): Promise<StoredOrder | null>` with items ordered by `position`. `create` writes `position` from the array index.
- [x] `apps/api/src/orders/guest-session.service.ts` -- owns `guest:session:{sid}`: `open(order): Promise<string>` (returns the sid) and `resolve(sid?)`.
- [x] `apps/api/src/orders/guest-session.guard.ts` -- `GuestSessionGuard extends PrincipalGuard`. Reads the cookie with `readCookie` and calls `resolve`.
- [x] `orders.service.ts` -- `place(req, sid?)` resolves first (409), and after insert calls `open`. It returns the view plus `{ sid, expiresAt }`. Add `current(orderId)`.
- [x] `orders.controller.ts`, `orders.module.ts` -- the POST sets the cookie via `@Res({ passthrough: true })`. Add `@Get('current') @UseGuards(GuestSessionGuard)`. The module imports `RedisModule` and provides the service and guard.
- [x] `apps/api/test/guest-session.int-spec.ts` -- every matrix row. Assert the cookie attributes, the Redis PTTL, and key deletion on expiry and on Collected.

**Acceptance Criteria:**
- Given a placement with no valid cookie, when Redis `SET` fails after the insert, then the response is 500 `INTERNAL` (accepted; see Design Notes).
- Given the suite runs, when `pnpm test:int` finishes, then it covers the one-open-Order rule, expiry at exactly 24 h via `FakeClock`, and session end at Collected (NFR3).

## Implementation Notes

- Migration `20261019100000_order_item_position`: verbatim `migrate diff --from-config-datasource` output (api-test container, after `migrate deploy`) plus the hand-appended `OrderItem_position_check`.
- `toGuestView(order)` now maps `order.items` (stored, ordered by `position`) for both placement and `/current`; `create` also includes items ordered by `position`.
- `orders.int-spec.ts`: the DB CHECK fixture now sets `position: 0` (required column) and gained an `OrderItem_position_check` case.
- `GuestSessionPolicy` is an object (`newSessionId`, `isSessionId`, `expiresAt`, `isOpen`) plus `GUEST_SESSION_MS`, mirroring `OrderReference`; unit spec added.
- `GUEST_SESSION_COOKIE` lives in `guest-session.guard.ts`; the controller imports it.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | edge, blind, vgap | Migration adds `position NOT NULL` with no default | medium | patch | `compose.yaml` `migrate` runs `migrate deploy` on the persistent dev DB, which can hold 2.1 OrderItems; the ALTER fails there. |
| 2 | vgap | Stored `position` and `orderBy` are not pinned by any test | medium | patch | Pre-verified: every test inserts in basket order, so dropping `orderBy` or writing a constant `position` still passes. |
| 3 | blind | `/current` sends no `Cache-Control: no-store` | low | patch | No global cache headers in `apps/api/src`; a guest-private GET relies on the cache defaults. The fix is one decorator. |
| 4 | blind | The malformed-cookie test spies only on `get` | low | patch | `resolve` returning early also skips `del`; adding one spy makes "no Redis call" true as stated. |
| 5 | blind | The schema comment cites a story instead of the reason | low | patch | A direct comment correction: no unique constraint because a P2002 is read as a reference collision. |
| 6 | edge | Order Collected between the guard and `current()` | false | reject | It returns the Order as it was a moment earlier. The same race exists at any read, and the Design Notes accept the reload. |
| 7 | edge | A non-UUID Redis value makes Prisma return 500 | false | reject | Only `open()` writes the key, and only with `order.id`, a UUID. Not reachable. |
| 8 | edge | A failed cleanup DEL blocks placement with 500 | false | reject | A failure in Redis `get` 500s the same path anyway. With Redis down, a 500 is the correct loud failure. |
| 9 | edge, blind | RFC 6265 quoted cookie values are not unquoted | false | reject | The server sets a bare hex value and browsers echo it back unquoted. Not reachable. |
| 10 | edge | Secure cookie dropped over plain HTTP | false | reject | The intent requires `Secure` explicitly; browsers exempt localhost. |
| 11 | blind | A dead cookie is never cleared | false | reject | The intent says the cookie is set "on the 201 only"; the stale cookie is harmless because `resolve` rejects it. |
| 12 | blind | No test that the sid is never logged | maybe-false | reject | It would need node-redis errors to include command args. ErrorReply carries only Redis's message. Even if true, only low. |
| 13 | blind | Stale-sid placement, old-key deletion and cookie replacement are not fully asserted | low | reject | The expiry and Collected re-placement tests already exercise the `resolve` → `del` path; more cases add little. |
| 14 | blind | `readCookie` with duplicate names: first wins | false | reject | Only `Path=/` with no Domain is ever set, so a browser never holds two `guest_session` cookies. |
| 15 | blind | `isOpen` misses Collected-in-window and now < placedAt | false | reject | Collected is tested at `placedAt`, which is inside the window. A `now` before `placedAt` being open is the correct result. |
| 16 | blind | The controller's `principal?.kind` re-check is redundant | low | reject | It narrows the `Principal` union for TypeScript. Removing it needs a cast. Cosmetic. |
| 17 | blind | The 500 test does not assert that no session key exists | low | reject | `set` is mocked to reject, so no key can exist. The assertion would be tautological. |

## Design Notes

The guard reloads the Order through `current(orderId)` instead of passing it along, so the principal keeps the architecture's shape and Epic 3's socket handshake can reuse `resolve` unchanged.

Known limits, marked with `ponytail:` comments: (1) two concurrent POSTs with the same open-able state can both pass `resolve` and create two Orders. The last cookie wins, and a `SET NX` placement lock fixes this if it ever matters. (2) The insert and the Redis `SET` are not atomic. A failed `SET` leaves an Order with no session, which the Guest can still reach by reference in Story 2.3.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint && pnpm format:check` -- expected: clean
- `pnpm test` -- expected: pass, including `cookies.spec.ts`
- `pnpm test:int` -- expected: pass, including `guest-session.int-spec.ts` and the unchanged `orders.int-spec.ts`
