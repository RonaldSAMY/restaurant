---
title: 'Story 4.2: Manager all-Orders API'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
implementer: 'Ronald (by hand)'
route: 'manual'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

## Intent

**Problem:** The only Order list is the Kitchen Board's open Orders. A Manager needs every Order, Collected included, plus a count per status, and Kitchen Staff must not get it.

**Approach:**
- Add a `ManagerGuard` in `auth`: a `PrincipalGuard` that reuses `StaffAuthGuard` and then requires `role: 'MANAGER'`.
- Add a `ManagerController` in `orders` with `GET manager/orders?status=`, which returns `{ counts, orders }` from two repository queries.

## Boundaries & Constraints

**Always:**
- Shared, in `packages/shared/src/orders.ts`:
  - `ManagerOrdersQuerySchema = z.object({ status: OrderStatusSchema.optional() })`
  - `ManagerOrdersResponseSchema = z.object({ counts: z.record(OrderStatusSchema, z.number().int().nonnegative()), orders: z.array(KitchenOrderSchema) })`

  (In Zod 4, `z.record` with an enum key requires every key, which is what we want.) In `api-routes.ts`: `managerOrders: 'manager/orders'`.
- `ManagerGuard extends PrincipalGuard`. Its `authenticate(context)`:
  - calls `StaffAuthGuard.authenticate(context)` (inject `StaffAuthGuard`, don't duplicate the cookie logic);
  - returns `null` when that returns `null`, which gives 401;
  - throws `new DomainError('FORBIDDEN', 'Managers only')` when the role is not `MANAGER`;
  - otherwise returns the principal.

  It must **not** override `canActivate` (`DefaultDenyGuard` would deny it). Provide and export it from `AuthModule`.
- Repository port gets two methods:
  - `countByStatus(): Promise<Record<OrderStatus, number>>`: one Prisma `groupBy({ by: ['status'], _count: true })`, with missing statuses filled as `0`;
  - `findLatest(status: OrderStatus | undefined, limit: number): Promise<StoredOrder[]>`: `orderBy [{ placedAt: 'desc' }, { id: 'desc' }]`, `take: limit`, items via `ITEMS_IN_ORDER`.
- `OrdersService.overview(status?)` returns `{ counts, orders: orders.map(toKitchenView) }` with `MANAGER_LIST_LIMIT = 100`. Mark the cap with a `// ponytail:` comment naming the ceiling (no pagination) and the upgrade (cursor on `placedAt,id`).
- `ManagerController`: `@Controller()`, `@UseGuards(ManagerGuard)` at class level, `@Get(ApiRoutes.managerOrders)`, `@Header('Cache-Control', 'no-store')`, and `@Query() query: ManagerOrdersQueryDto` (via `createZodDto`). It calls one service method and holds no rules.
- Register the controller in `OrdersModule`.

**Never:**
- No role check in the controller or service.
- No new `ErrorCode`.
- No change to kitchen routes: a Manager passes `StaffAuthGuard` already.
- No web changes.
- No migration or index. (`placedAt` desc on a demo dataset is fine. Note why in the review if you disagree.)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| Manager, mixed Orders | 1 RECEIVED, 2 READY, 1 COLLECTED at t0..t3 | 200; `counts` `{RECEIVED:1, PREPARING:0, READY:2, COLLECTED:1}`; `orders` 4 items, newest first, each with `id` |
| Tie on `placedAt` | two Orders same `placedAt` | `id` descending breaks the tie |
| Filter | `?status=READY` | `orders` only READY; `counts` unchanged |
| Bad filter | `?status=DONE` | 400 `VALIDATION_FAILED` |
| Cap | 101 Orders | `orders.length === 100`, the oldest one missing; `counts` total 101 |
| Empty | no Orders | `counts` all `0`, `orders: []` |
| Kitchen Staff | valid KITCHEN session | 403 `FORBIDDEN` |
| Anonymous / guest cookie only | — | 401 `UNAUTHENTICATED` |
| Manager advances | Manager PATCHes `kitchen/orders/:id/status` RECEIVED→PREPARING | 200 `KitchenOrder`; skip → 409 |
| Headers | Manager GET | `Cache-Control: no-store` |

## Code Map

- `packages/shared/src/orders.ts`: `KitchenOrderSchema` and `AdvanceStatusRequestSchema` are the pattern; `api-routes.ts` needs one new entry, and its spec has a route list check if you want one.
- `apps/api/src/auth/staff-auth.guard.ts`: the shape to copy for `manager.guard.ts` beside it.
- `apps/api/src/common/default-deny.guard.ts`: read `PrincipalGuard.canActivate` to see why throwing inside `authenticate` gives 403.
- `apps/api/src/common/domain-error.ts`: `FORBIDDEN` → 403 is already mapped.
- `apps/api/src/auth/auth.module.ts`: `providers` / `exports`.
- `apps/api/src/orders/ports/order-repository.ts`, `adapters/prisma-order.repository.ts`: `findOpen` is the model for `findLatest`.
- `apps/api/src/orders/orders.service.ts`: `listOpen` and `toKitchenView`.
- `apps/api/src/orders/kitchen.controller.ts`: the controller pattern to copy for `manager.controller.ts`.
- `apps/api/test/kitchen.int-spec.ts`: boot, `insert(reference, status, placedAt)`, and the staff cookie setup. Copy its structure into a new `test/manager.int-spec.ts`. Log in via `app.get(AuthSessionService).login(...)` after `buildStaffUser(..., { role: 'MANAGER' })`.

## Tasks

Branch: `git switch main && git switch -c story/4-2-manager-orders-api` (after 4.1 is merged).

### A. Contract
- [ ] **T1 🔴 Test**: in a new `packages/shared/src/orders.spec.ts`, assert:
  - `ManagerOrdersQuerySchema` accepts `{}` and `{ status: 'READY' }` and rejects `{ status: 'DONE' }`;
  - `ManagerOrdersResponseSchema` rejects `counts` missing a status.

  *Done when:* it fails (the schemas don't exist yet).
- [ ] **T2 🟢 Code**: add both schemas and their types, plus `ApiRoutes.managerOrders`. *Done when:* T1 passes.

### B. Guard (unit, no infra)
- [ ] **T3 🔴 Test**: in `apps/api/src/auth/manager.guard.spec.ts`, build a `ManagerGuard` with a stub `StaffAuthGuard` whose `authenticate` returns:
  - `null` → expect `null`;
  - a staff principal with `role: 'KITCHEN'` → expect a `DomainError` with code `FORBIDDEN`;
  - a staff principal with `role: 'MANAGER'` → expect that principal.

  Also assert `new ManagerGuard(stub).canActivate === PrincipalGuard.prototype.canActivate`. *Done when:* it fails (no class yet).
- [ ] **T4 🟢 Code**: write `manager.guard.ts` and provide and export it from `AuthModule`. *Done when:* T3 passes.

### C. Queries
- [ ] **T5 🔴 Test**: in `test/manager.int-spec.ts`, boot the app and make a manager cookie and a kitchen cookie. Write only the **access** rows first: Manager GET → 200; Kitchen → 403 `FORBIDDEN`; no cookie → 401; guest cookie only → 401. *Done when:* every row fails with 404 (the route doesn't exist yet).
- [ ] **T6 🟢 Code**: add a minimal `ManagerController`, returning `{ counts: {…zeros}, orders: [] }` from the service for now, and register it in `OrdersModule`. *Done when:* the T5 access rows pass. This is the smallest step that proves the guard is wired in.
- [ ] **T7 🔴 Test**: add the data rows from the matrix: mixed Orders (counts and order), tie, filter, bad filter, cap (insert 101 in a loop, spaced 1 s apart), empty. *Done when:* they fail against the stub.
- [ ] **T8 🟢 Code**: add `countByStatus` and `findLatest` to the port and the Prisma adapter, and add `OrdersService.overview(status)` with the 100 cap. Hint: `groupBy` returns `[{ status, _count }]`. Start from an object with all four statuses set to `0`, then fill it in. *Done when:* T7 passes.

### D. Manager can do kitchen work
- [ ] **T9 🔴→🟢 Test**: in `manager.int-spec.ts`, as the manager, PATCH `kitchen/orders/:id/status` RECEIVED→PREPARING → 200, then a skip → 409. This should pass without code changes. If it fails, find out why before changing anything. *Done when:* green.

### E. Finish
- [ ] **T10 🔧 Tidy**: TSDoc on the guard, controller, port methods and service method; the `ponytail:` note on the cap; class-level doc on `AuthModule` mentioning `ManagerGuard`. *Done when:* `pnpm lint` reports 0 warnings.
- [ ] **T11 ✅ Check**: run all gates and `pnpm test:int`. Then, by hand: log in as manager in the browser, open `https://localhost/api/v1/manager/orders` → JSON; log in as staff in another browser → 403 envelope. *Done when:* green. Then say **"review story 4.2"**.

## Questions to think about

1. Why does throwing inside `authenticate` produce 403 while returning `null` produces 401? Trace it through `PrincipalGuard.canActivate` and the error filter.
2. Why does `ManagerGuard` reuse `StaffAuthGuard` instead of extending it? (Hint: `canActivate` is pinned on the instance in the base constructor.)
3. Why do `counts` ignore the filter? What would the UI look like if they didn't?
4. Two queries mean the counts and the list can disagree for a few milliseconds. Does that matter here? How would you make them agree if it did?

## Verification

- `pnpm lint && pnpm format:check && pnpm typecheck`: exit 0
- `pnpm test && pnpm test:int`: green, including `orders.spec.ts`, `manager.guard.spec.ts` and `manager.int-spec.ts`

## Review Notes

<!-- Claude fills this in on "review story 4.2" -->
