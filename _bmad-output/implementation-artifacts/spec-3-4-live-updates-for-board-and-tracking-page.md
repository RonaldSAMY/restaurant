---
title: 'Story 3.4: Live updates for board and tracking page'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '0472634ead705a4026f7f167d80e93b885332cd8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The board and the tracking page only show state as of their last fetch; new Orders and status changes need a reload.

**Approach:** Add a Socket.IO gateway at `/api/socket.io` whose handshake assigns rooms from cookies, an `OrderEventsPublisher` that `OrdersService` calls after each committed place/advance, and socket clients in the board and tracking page that refetch on (re)connect and apply rank-checked events.

## Boundaries & Constraints

**Always:**
- Shared contracts in new `packages/shared/src/realtime.ts`: `SOCKET_PATH = '/api/socket.io'`, event names (`order.created`, `order.status-changed`, `order.subscribe`), `KitchenStatusChangedSchema { id, reference, status, changedAt }`, `GuestStatusChangedSchema` (same, no `id`), `OrderSubscribeRequestSchema { reference }`, `SubscribeAckSchema` = `{ ok: true } | ErrorEnvelope`. `order.created` payload is `KitchenOrder`.
- Handshake (middleware in `afterInit`, rooms joined server-side; the client never names a room): `guest_session` cookie resolving via `GuestSessionService.resolve` → `order:{orderId}`. Staff rooms only when the client sends `auth: { staff: true }`: a valid access cookie (`AuthSessionService.resolve`) → `kitchen` + `staff-session:{sid}`; otherwise the connection is refused with `connect_error` message `UNAUTHENTICATED`. Neither → connected with no rooms.
- `order.subscribe` is `@Public()`, throttled with `REFERENCE_LOOKUP_THROTTLE` through a ws-aware `ThrottlerGuard` subclass (tracker = last `x-forwarded-for` entry, else handshake address), parses its body with the shared schema (failure → `VALIDATION_FAILED`), resolves the reference through the same `OrdersService` rule as the HTTP lookup (24 h window, same `ORDER_NOT_FOUND`), joins `order:{id}`, acks `{ ok: true }`.
- `OrdersService` publishes only after the write succeeded: `order.created` right after the insert; `order.status-changed` after a successful `transition` (`changedAt` = `clock.now()`), to `kitchen` with `id`, to `order:{id}` without. Failed placements and 404/409 advances emit nothing. The publisher no-ops while the server ref is unset.
- `SocketServerRef` (holds the `Server`, set by the gateway in `afterInit`) lives in `common/` behind one module imported by auth, orders and realtime. Logout calls `in('staff-session:{sid}').disconnectSockets()` after deleting the keys.
- `PrincipalGuard.canActivate` stays final: on ws it stores the principal on `client.data.principal`. Guards read cookies through one context-aware helper (HTTP request header or ws handshake header). Undecorated gateway handlers are denied by `DefaultDenyGuard` (if `APP_GUARD` does not reach gateways, apply it on the gateway class).
- A gateway-scoped `@UseFilters` filter acks `{ error }` for handler errors and guard denials, reusing the HTTP filter's code mapping (extract it as an exported function); a ws `Forbidden resource` denial → `FORBIDDEN`, throttling → `RATE_LIMITED`.
- Web `lib/socket.ts` is the only `io()` caller. Staff sockets: on `connect_error` `UNAUTHENTICATED` run the `lib/api.ts` single-flight refresh (exported; `staffRequest` uses the same function) and reconnect; a second consecutive refusal or a rejected refresh goes to `/kitchen/login`; a server-side disconnect (`io server disconnect`, i.e. logout) goes to `/kitchen/login`.
- Every `connect` (first and re-) refetches the HTTP snapshot, which replaces the held state; `/track/[reference]` also re-emits `order.subscribe`. Events apply only when their status ranks later (enum order) than the held one. Guest: match `reference`. Board: `order.created` adds unknown ids in `placedAt` order; `status-changed` moves the known card, removes it on `COLLECTED`, ignores unknown ids. Events are parsed with the shared schemas; invalid ones are dropped.

**Never:** No Redis adapter or multi-replica support, no client-named rooms, no token in JS, no `ApiRoutes`/`apiPath` change, no migration, no DOM test library. Only `OrdersService` publishes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Staff connect | `staff: true`, valid access cookie | in `kitchen`, gets `order.created` on placement | N/A |
| Stale staff connect | `staff: true`, expired/no access | `connect_error` `UNAUTHENTICATED` | web refreshes once, reconnects |
| Guest connect | open `guest_session` | gets guest `status-changed` (no `id`) | N/A |
| Anonymous connect | no cookies, no flag | connected, receives nothing | N/A |
| Subscribe ok | known reference, any case, < 24 h | ack `{ ok: true }`, then events | N/A |
| Subscribe bad | unknown / expired / malformed | ack `{ error }` | `ORDER_NOT_FOUND` / `VALIDATION_FAILED` |
| Subscribe flood | 31st in 60 s from one IP | ack `{ error }` | `RATE_LIMITED` |
| Undecorated handler | any message | ack `{ error }` | `FORBIDDEN` |
| Failed advance | 409 / 404 | no event | N/A |
| Logout | staff logs out | that session's sockets disconnected | N/A |
| Stale event | held READY, event PREPARING | ignored | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/common/default-deny.guard.ts` -- `PrincipalGuard` (writes `req.principal` via `switchToHttp`), `DefaultDenyGuard`; spec in `default-deny.guard.spec.ts`.
- `apps/api/src/common/cookies.ts` -- `readCookie`; add the context-aware header helper here.
- `apps/api/src/common/error-envelope.filter.ts` -- private `toEnvelope`; extract for reuse. Returns early on non-HTTP hosts (keep).
- `apps/api/src/auth/{staff-auth.guard,auth-session.service,auth.module}.ts` -- `StaffAuthGuard.authenticate` reads `req.headers.cookie`; `ACCESS_COOKIE`; `AuthSessionService.resolve/logout`. AuthModule already exports `AuthSessionService`; its `ThrottlerModule.forRoot` is global.
- `apps/api/src/orders/{guest-session.guard,guest-session.service,orders.service,orders.module,orders.controller}.ts` -- `GUEST_SESSION_COOKIE`, `GuestSessionService.resolve`, `place`/`advance`/`byReference` (refactor its lookup into a shared private method returning the stored Order so subscribe gets the id), `REFERENCE_LOOKUP_THROTTLE`. Export `GuestSessionService` and `OrdersService` from OrdersModule. New `ports/order-events-publisher.ts` + `adapters/socket-io-order-events.publisher.ts` (pattern: `OrderRepository` abstract-class token).
- `apps/api/src/realtime/` (new) -- `realtime.gateway.ts`, ws throttler guard, ws ack filter, `realtime.module.ts` (imports auth, orders, socket-ref module); add to `AppModule`.
- `apps/api/test/kitchen.int-spec.ts` -- app setup pattern (`FakeClock`, `configureApp`, `buildStaffUser`, login cookies via `test/cookies.ts`). Sockets need `app.listen(0)` and `socket.io-client` with `extraHeaders: { cookie }`.
- `apps/web/lib/api.ts` -- `refreshSession` / `staffRequest`; `apps/web/app/track/tracked-order.tsx` (load effect), `apps/web/app/kitchen/kitchen-board.tsx` (`applyAdvanced`, `KitchenBoard` effect). Specs: `lib/api.spec.ts`, `app/kitchen/kitchen.spec.tsx`, `app/track/order-view.spec.tsx`.
- Deps: api `@nestjs/websockets` + `@nestjs/platform-socket.io` `~11.2.7`, `socket.io` `~4.8.4`, dev `socket.io-client` `~4.8.4`; web `socket.io-client` `~4.8.4`. Caddy already forwards `/api/*` (upgrades included).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/realtime.ts` + `index.ts` -- realtime contracts.
- [x] `apps/api/package.json`, `apps/web/package.json` -- deps above; `pnpm install`.
- [x] `apps/api/src/common/` -- `socket-server.ref.ts` (+ module), cookie helper, ws-aware `PrincipalGuard`, exported envelope mapping; extend `default-deny.guard.spec.ts` for the ws principal.
- [x] `apps/api/src/auth/` -- guard via cookie helper; logout disconnects `staff-session:{sid}`.
- [x] `apps/api/src/orders/` -- publisher port + adapter, publish in `place`/`advance`, reference lookup for subscribe, exports.
- [x] `apps/api/src/realtime/` + `app.module.ts` -- gateway, ws throttler guard, ack filter, module.
- [x] `apps/api/test/realtime.int-spec.ts` -- every matrix row except Stale event, plus a probe gateway in the test module with one undecorated handler (denied) next to `order.subscribe` (allowed).
- [x] `apps/web/lib/socket.ts` + `lib/socket.spec.ts` -- connect helper, staff refresh/reconnect flow (mock `socket.io-client`); `lib/api.ts` exports the refresh.
- [x] `apps/web/app/track/tracked-order.tsx`, `apps/web/app/kitchen/kitchen-board.tsx` -- socket wiring plus pure, exported, unit-tested merge functions (guest event, board created, board status-changed, rank).

**Acceptance Criteria:**
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test` and the api integration suite, then all pass.
- Given the dev stack with two boards and one tracking page open, when a Guest places an Order and staff advance it to Collected, then every view reflects each step in under 2 s without reload, and logging out of one board sends it to `/kitchen/login`.

## Design Notes

The `staff: true` handshake flag is the client stating intent, not naming a room: without it a stale staff cookie could not be told apart from a Guest, and `connect_error` would never fire. Snapshot-replaces-state leaves a small window where an event that lands while a refetch is in flight is overwritten by an older snapshot; mark it with a `ponytail:` comment (fix: merge snapshot by rank).

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: exit 0
- api integration suite (`pnpm --filter api test:int` against the compose test stack) -- expected: green incl. `realtime.int-spec.ts`

**Manual checks:**
- `docker compose up`; at `https://localhost`, two `/kitchen` windows and one `/track`: place, advance through Collected, log out of one board.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | verification-gap | `TrackedOrder`/`KitchenBoard` socket wiring runs in no test | medium | Pre-verified: effects never run in any web spec. The only fix renders with a DOM/client renderer, which the frozen intent's Never ("no DOM test library") excludes; the pure merge functions are tested | rejected (excluded by intent) |
| 2 | verification-gap | Last-XFF-entry tracker rule not pinned by a test | medium | Pre-verified: switching to the first entry still passes the rate-limit test | patch (fixed) |
| 3 | verification-gap other, blind, edge | Handshake passes raw non-auth `Error` to `next()`; its message reaches the client as `connect_error`, and the log has no stack | medium | `realtime.gateway.ts` afterInit: `next(error)` for any Error; Socket.IO sends `err.message` to the client; log line is `'Handshake failed'` only | patch (fixed) |
| 4 | verification-gap other, blind | ws branch of `readContextCookie` / `PrincipalGuard` has no caller | low | True, but the frozen intent requires the ws-aware `PrincipalGuard` and the context-aware helper; the fix would edit the spec | rejected |
| 5 | blind, edge | Staff socket stays in `kitchen` after its session TTL lapses (only logout evicts) | low | Session keys expire by `pExpire`, which emits nothing. The receiver is the same authenticated staff device; a fix needs timers or re-validation (new complexity) | rejected (low, complex fix) |
| 6 | edge | Guest socket stays in `order:{id}` past Guest Session end | low | Receives only its own Order's status; harmless; fix adds complexity | rejected |
| 7 | blind, edge | Non-auth `connect_error` (middleware refusal, e.g. INTERNAL) leaves the board or tracking page offline for good; guests register no handler | medium | socket.io-client does not auto-reconnect after a middleware refusal; `socket.ts` returns early unless `UNAUTHENTICATED` and only for staff | patch (fixed) |
| 8 | edge | Redis failure in Guest Session resolve refuses every handshake | low | Redis down breaks the HTTP api equally; once #3/#7 are fixed the client retries | rejected |
| 9 | blind, edge | `order.subscribe` ack ignored on the tracking page | low | ORDER_NOT_FOUND only when the same-rule HTTP load also fails (page already shows error); RATE_LIMITED needs throttle exhaustion; fix adds branches | rejected |
| 10 | blind, edge | Failed reload on reconnect replaces a shown Order with an error; reconnect churn burns the lookup throttle | low | The reload runs right after a successful connect, so failure is unlikely; 30/min needs about 15 reconnects a minute; fix adds branches | rejected |
| 11 | blind, edge | Board silently stale when a reconnect reload fails (`loadFailed` ignored once orders are set) | low | Same unlikely timing as #10; fix adds a notice branch | rejected |
| 12 | blind | No test that one Order's events stay out of another's room, or that a Guest socket gets no `order.created` | medium | `realtime.int-spec.ts` checks anonymous and own-order only; room isolation is the privacy promise | patch (fixed) |
| 13 | blind | ws tracker trusts last XFF even without a proxy | false | HTTP uses the same rule (`trust proxy` 1, `configure-app.ts:16`); compose publishes no api port; the spec mandates this tracker | rejected |
| 14 | blind | `changedAt` from the clock, not the stored write | false | The frozen intent mandates `changedAt = clock.now()` | rejected |
| 15 | blind | Single-instance limit lacks a `ponytail:` note | low | The intent's Never already excludes the Redis adapter and multi-replica support | rejected |
| 16 | blind | `Gateway()` default deny is an unenforced convention | low | Only one gateway exists; the spec's fallback (guard on the gateway class) is implemented; enforcement would be new code | rejected |
| 17 | edge | Logout kicks every tab sharing the staff session | false | The intent specifies disconnecting `staff-session:{sid}` | rejected |
| 18 | edge | A socket accumulates `order:*` rooms via repeated subscribes | low | Bounded by 30/min throttle and socket lifetime; negligible memory | rejected |
