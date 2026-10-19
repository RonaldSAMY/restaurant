# Epic 4 Context: Managers oversee and run Orders

<!-- Compiled from planning artifacts (sprint-change-proposal-2026-10-19-manager.md). Edit freely. -->

## Goal

A Manager logs in on the shared staff login page and lands on `/manager`. The page shows per-status counts and every Order (Collected included), with a status filter. The Manager can Take, Mark Ready and Mark Collected ("deliver") Orders like Kitchen Staff, and everything updates live. Kitchen Staff are kept out of the dashboard. The epic adds `StaffRole` to `StaffUser`, `ManagerGuard`, `GET manager/orders`, and the `/manager` page.

**Delivery mode:** Ronald implements every story by hand. Claude writes the specs and reviews against them, and does not implement. Review = "review story 4.x": findings cite `file:line` and say what is wrong, why, and which direction a fix should take. Claude does not apply fixes unless asked.

## Stories

- 4.1 Staff roles in data, seed and session (api)
- 4.2 Manager all-Orders API (api)
- 4.3 Role-aware login and Manager page shell (web)
- 4.4 Manager Dashboard: counts, list, filter, actions (web)
- 4.5 Live updates on the Manager Dashboard (web)
- 4.6 Manager end-to-end test (needs 3.5; spec written when 3.5 lands)

## Requirements & Constraints

- **Roles:** `StaffRole = 'KITCHEN' | 'MANAGER'` (shared `z.enum`, Prisma enum mirrors it). Existing staff default to `KITCHEN`. Roles are seeded only: no sign-up, no user-management UI.
- **Login:** one endpoint and one page (`/kitchen/login`, retitled "Staff login"). `StaffMe` gains `role`; the web routes `MANAGER` → `/manager` and `KITCHEN` → `/kitchen`. Session rules are unchanged from FR-6.
- **Authorization:**
  - `StaffAuthGuard` admits both roles, so Managers use every kitchen route (D5).
  - `ManagerGuard` admits only `MANAGER`. Other staff get `403 FORBIDDEN`; anonymous or Guest callers get `401 UNAUTHENTICATED` (D4).
  - Role checks live in guards only.
- **All Orders:** `GET manager/orders?status=` → `{ counts: Record<OrderStatus, number>, orders: KitchenOrder[] }`. Counts are all time and include all four statuses with zeros. `orders` are `placedAt` desc then `id` desc, max 100, optionally filtered by status; the filter does not change `counts` (D3).
- **Deliver = Mark Collected** (D1). There is no new status or transition.
- **Live:** the dashboard reuses the staff socket (`kitchen` room) and refetches on events; there are no new socket events.

## Technical Decisions

- **Ownership (AD-3):** `auth` owns `StaffUser.role`, the role claim and `ManagerGuard`. `orders` owns the manager controller and queries. `OrdersModule` already imports `AuthModule`, so no new module edges are needed.
- **Principal (AD-4):** `{ kind: 'staff', staffId, sid, role }`.
- **Tokens (AD-5):** access JWT claims `{ staffId, sid, role }`. An access token without a valid `role` fails verification, so old tokens force a refresh. Refresh reads `role` from `StaffUser` via `StaffUserRepository.findById`; a missing account → `401`.
- **Guard shape:** `ManagerGuard extends PrincipalGuard` and implements only `authenticate()`, which reuses `StaffAuthGuard.authenticate()` and then checks the role. Throwing `DomainError('FORBIDDEN')` inside `authenticate` yields 403; `null` yields 401 through the final `canActivate`.
- **Seed (AD-11):** `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` in `SeedEnvSchema` and `.env.example`. `seedStaff(prisma, hasher, email, password, role)` upserts the role on create and update.
- **Paths (AD-2/19):** `ApiRoutes.managerOrders = 'manager/orders'`; the web builds URLs with `apiPath`. Tests keep literal `/api/v1/...` paths.
- **Errors (AD-13):** no new codes. `FORBIDDEN` (403) already exists.
- **Web:** `lib/api.ts` stays the only fetch wrapper and `lib/socket.ts` the only `io()` caller. Reuse `formatPrice` (`lib/menu.ts`), `STATUS_LABELS` (`app/track/order-view.tsx`), and `nextStatus` (`app/kitchen/kitchen-board.tsx`). Web tests use `renderToStaticMarkup` + Vitest, as in `kitchen.spec.tsx`.

## Test-first convention for this epic

Each task in a story spec is one focus:
- 🔴 **Test**: write the failing test and see it fail *for the right reason*.
- 🟢 **Code**: make it pass with the least code.
- 🔧 **Tidy**: TSDoc (AD-17), names, and any refactor while green.
- ✅ **Check**: run gates or a manual check.

Tick a box only when its "Done when" line is true. Commit at any green point.

## Cross-Story Dependencies

- 4.1 is first: everything else needs `role`.
- 4.2 needs 4.1 (`ManagerGuard` reads `role`).
- 4.3 needs 4.1 (`StaffMe.role`) and 4.2 (403 from `manager/orders`).
- 4.4 needs 4.3's shell.
- 4.5 needs 4.4.
- 4.6 needs 4.5 and 3.5.

## Verification (every story)

- `pnpm lint && pnpm format:check && pnpm typecheck`
- `pnpm test` (unit: api + web)
- `pnpm test:int` (api integration, real Postgres/Redis)
