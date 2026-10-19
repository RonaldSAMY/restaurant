---
title: 'Story 3.2: Kitchen Orders API and status transitions'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '8f3aac67c413994f20d59f6b0bf55056c531a209'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Staff can log in, but there is no way to see open Orders or move them forward, so Guests' Orders sit at `RECEIVED` forever.

**Approach:** Add a staff-only kitchen controller in `orders` with `GET kitchen/orders` (all non-Collected, oldest first) and `PATCH kitchen/orders/:id/status { to }`. A pure `OrderStatusMachine` maps `to` → required predecessor; the repository applies it as one conditional update, so races and invalid moves both become `409 INVALID_TRANSITION`.

## Boundaries & Constraints

**Always:**
- `OrderStatusMachine` (pure, no imports but the `OrderStatus` type) is the only place that knows `RECEIVED → PREPARING → READY → COLLECTED`. `predecessorOf(to)` returns the required prior status, or `null` for `RECEIVED` (nothing transitions into it). `COLLECTED` is final because nothing has it as predecessor.
- Transition is one `updateMany({ where: { id, status: predecessor }, data: { status: to } })`. `count === 0` → re-read by id: missing → `404 ORDER_NOT_FOUND`, present → `409 INVALID_TRANSITION`. No read-then-write check before the update.
- A malformed (non-UUID) `:id` → `404 ORDER_NOT_FOUND`, never a Prisma 500. `to: 'RECEIVED'` on an existing Order → 409; on an unknown id → 404.
- Body is validated by a shared `AdvanceStatusRequestSchema { to: OrderStatusSchema }` (bad `to` → `400 VALIDATION_FAILED`).
- Shared `KitchenOrderSchema = GuestOrderViewSchema.extend({ id: z.uuid() })`; `ApiRoutes.kitchenOrders = 'kitchen/orders'`.
- Both routes `@UseGuards(StaffAuthGuard)` at controller level; `GET` sends `Cache-Control: no-store`. Controllers stay rule-free.
- List: `status != COLLECTED`, `orderBy [{ placedAt: 'asc' }, { id: 'asc' }]`, items in basket order. No 24 h filter.
- Log each transition as `Order status reference=… from=… to=…`.
- **Decision (module wiring):** `OrdersModule` imports `AuthModule` (option A); auth never imports orders, so no cycle. AD-3 diagram and `epic-3-context.md` now show `orders → auth`.
- Collected ends the Guest Session through the existing `GuestSessionPolicy.isOpen`; no new session code.

**Never:** no event publishing / `OrderEventsPublisher` (Story 3.4). No web changes. No migration or new index. No Cancelled state, no undo. No `forwardRef`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List | staff; Orders RECEIVED, READY, COLLECTED placed t0..t2 | 200 `KitchenOrder[]` of the 2 open ones, `placedAt` asc, with `id` | N/A |
| Take / Ready / Collect | `to` = next status | 200 `KitchenOrder` with new status; DB updated | N/A |
| Skip / backward / from Collected / to RECEIVED | e.g. RECEIVED→READY, READY→PREPARING, COLLECTED→any | Order unchanged | 409 `INVALID_TRANSITION` |
| Race | two concurrent RECEIVED→PREPARING | exactly one 200, one 409 | 409 |
| Unknown / malformed id | random UUID, `not-a-uuid` | — | 404 `ORDER_NOT_FOUND` |
| Bad body | `{ to: 'DONE' }`, `{}` | — | 400 `VALIDATION_FAILED` |
| Collected ends session | PATCH to COLLECTED, then guest `GET orders/current` | — | 401 `UNAUTHENTICATED` |
| Anonymous / guest-only cookie | both kitchen routes | — | 401 `UNAUTHENTICATED` |

</frozen-after-approval>

## Code Map

- `apps/api/src/orders/orders.service.ts` -- add `listOpen()` and `advance(id, to)`; `toGuestView` is the base for a new `toKitchenView` (`{ id, ...toGuestView(o) }`). Do not change placement or lookup.
- `apps/api/src/orders/ports/order-repository.ts`, `adapters/prisma-order.repository.ts` -- add `findOpen()` and `transition(id, from, to): Promise<boolean>` (`updateMany` count > 0); reuse `ITEMS_IN_ORDER`. `findById` for the post-update read and the 404/409 split.
- `apps/api/src/orders/domain/` -- new `order-status-machine.ts` (+ `.spec.ts`), style of `guest-session-policy.ts` (const object, TSDoc).
- `apps/api/src/orders/orders.controller.ts` -- controller/DTO pattern (`createZodDto`, `@Header('Cache-Control','no-store')`). New `kitchen.controller.ts` beside it.
- `apps/api/src/auth/staff-auth.guard.ts`, `auth.module.ts` -- guard is exported with `AuthSessionService`; do not change.
- `apps/api/src/common/domain-error.ts` -- `ORDER_NOT_FOUND`/`INVALID_TRANSITION` already mapped (404/409).
- `packages/shared/src/{orders,api-routes}.ts` -- add schemas and route.
- `apps/api/test/auth.int-spec.ts` -- boot pattern, `expectError`; login without the throttle by calling `app.get(AuthSessionService).login(...)` after `buildStaffUser` (`test/fixtures.ts`) and sending `access_token=…`. `test/guest-session.int-spec.ts` -- `place` helper and `cookieHeader` for the guest cookie. `test/setup.ts` truncates DB and flushes Redis per test.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/orders.ts`, `api-routes.ts` -- `KitchenOrderSchema`/`KitchenOrder`, `AdvanceStatusRequestSchema`/`AdvanceStatusRequest`, `ApiRoutes.kitchenOrders` -- shared wire contract (AD-2, AD-19).
- [x] `apps/api/src/orders/domain/order-status-machine.ts` + `.spec.ts` -- `predecessorOf` for all four statuses -- AD-7 rule in one pure place.
- [x] `apps/api/src/orders/ports/order-repository.ts`, `adapters/prisma-order.repository.ts` -- `findOpen`, `transition` -- the atomic conditional write.
- [x] `apps/api/src/orders/orders.service.ts` -- `listOpen`, `advance` (UUID check → machine → transition → 404/409 split → re-read → log) -- use cases.
- [x] `apps/api/src/orders/kitchen.controller.ts`, `orders.module.ts` (import `AuthModule`, register `KitchenController`) -- the two staff routes.
- [x] `apps/api/test/kitchen.int-spec.ts` -- the full matrix against real Postgres/Redis, race via `Promise.all` of two PATCHes.

**Acceptance Criteria:**
- Given `pnpm test:int`, then every matrix row passes, and every FR9 transition (3 valid, skip, backward, from Collected) is covered.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test`, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | edge-case, blind | `advance` re-read can return a status past `to` if another advance lands between write and read | low | Real race window, but the response then shows the Order's true current status and the log uses `from`/`to` correctly; needs two staff advancing the same Order within ms, and keeping the requested status would mean an update-and-return path or a status override | rejected (negligible) |
| 2 | edge-case | 404/409 classification read is non-atomic; Order could vanish | false | No code path deletes Orders (`grep delete( apps/api/src/orders` empty); an Order advanced meanwhile still exists → 409 is correct | rejected |
| 3 | edge-case, blind | `findOpen` unbounded / unindexed | low | Frozen intent: "No 24 h filter", "No migration or new index" — intent excludes it | rejected (out of scope by intent) |
| 4 | verification-gap, blind | `id` tie-break never exercised by list test | medium (pre-verified) | Only placedAt tie is with the filtered COLLECTED Order | patch |
| 5 | blind | Basket (`position`) order untested on kitchen list | low | Every inserted Order has one item; fix is a direct test addition | patch |
| 6 | blind | 409 details lack current status | low | Not required by spec; Board refetches on 409; no named harm | rejected |
| 7 | blind | Transition log line not asserted | low | Repo tests do not assert log output (`logger: false` everywhere); a regression only loses a log line | rejected |
| 8 | blind | Malformed id + `to: RECEIVED` untested; `z.uuid()` RFC coupling | low | UUID guard runs before any `to` handling so the outcome is fixed; ids are Prisma-generated v4 | rejected |
| 9 | blind | Unit spec doesn't pin "COLLECTED is final" | false | `it.each` asserts all four predecessors; none is `COLLECTED`, which is exactly the rule | rejected |
| 10 | blind | `KitchenController` import out of alphabetical order in `orders.module.ts` | low | Inconsistent with the file's own order; fix is moving one line | patch |
| 11 | blind | Doc changes (AD-3, epic context) missing from diff | false | Reviewed diff was scoped to `apps`/`packages`; both docs are modified in the working tree | rejected |
| 12 | blind | No test for a stale or expired staff token on kitchen routes | false | `StaffAuthGuard` is unchanged and its expired/gone-session cases are covered in `test/auth.int-spec.ts:256,283` | rejected |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck` -- expected: exit 0
- `pnpm test && pnpm test:int` -- expected: all green, `kitchen.int-spec.ts` and `order-status-machine.spec.ts` included
