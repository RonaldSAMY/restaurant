---
title: 'Story 4.1: Staff roles in data, seed and session'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
implementer: 'Ronald (by hand)'
route: 'manual'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

## Intent

**Problem:** Every staff user is the same. Nothing in the database, the JWT or the principal says who is a Manager, so no route can treat a Manager differently.

**Approach:**
- Add `StaffRole { KITCHEN MANAGER }` to `StaffUser` (default `KITCHEN`).
- Carry `role` in shared `StaffMe`, the access-token claims and the staff principal.
- On refresh, re-read the role from the DB.
- Seed one Manager next to the Kitchen Staff user.

## Boundaries & Constraints

**Always:**
- `StaffRoleSchema = z.enum(['KITCHEN', 'MANAGER'])` lives in `packages/shared/src/auth.ts`, with type `StaffRole`. The Prisma enum uses the same two values.
- `StaffMeSchema` = `{ id, email, role: StaffRoleSchema }`.
- `AccessClaimsSchema` = `{ staffId, sid, role: StaffRoleSchema }`. A token without `role`, or with an unknown role, verifies as `null`.
- `Principal` staff variant = `{ kind: 'staff'; staffId; sid; role: StaffRole }`. `StaffAuthGuard` already spreads the claims, so it should need no logic change.
- `refresh()` loads the user with `users.findById(staffId)`. If the user is missing → `401 UNAUTHENTICATED`. The new access token uses the DB role.
- The migration is a new folder `apps/api/prisma/migrations/20261021000000_staff_role/` (same hand-picked timestamp style as `20261020000000_staff_user`). It must not edit old migrations.
- `seedStaff(prisma, hasher, email, password, role)`: the upsert sets `role` in both `create` and `update`.
- TSDoc on every new or changed symbol (AD-17).

**Never:**
- No `ManagerGuard` or manager endpoint (Story 4.2).
- No web changes beyond what typecheck forces (Story 4.3).
- No role in the refresh token.
- No role stored in Redis.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| Migrate existing data | DB with a staff row from before 4.1 | row has `role = 'KITCHEN'` |
| Login as kitchen | seeded/fixture user, role KITCHEN | `200 { id, email, role: 'KITCHEN' }` |
| Login as manager | fixture user, role MANAGER | `200 { …, role: 'MANAGER' }`; `/me` same |
| Access token claims | after login | decoded `access_token` has `role` |
| Old-style token | access JWT signed without `role` | guard → `401 UNAUTHENTICATED` |
| Role changed in DB | login KITCHEN → set MANAGER in DB → refresh | new `access_token` has `role: 'MANAGER'` |
| Account deleted | login → delete row → refresh | `401 UNAUTHENTICATED` |
| Seed twice | KITCHEN + MANAGER env | two rows, correct roles, no duplicates |
| Seed changes role | user exists as KITCHEN, seeded as MANAGER | role becomes MANAGER |

## Code Map

- `packages/shared/src/auth.ts`: `LoginRequestSchema` and `StaffMeSchema` live here; add `StaffRoleSchema`.
- `apps/api/prisma/schema.prisma`: `model StaffUser`.
- `apps/api/src/auth/ports/staff-user-repository.ts`: the `StaffUser` interface, which gains `role`. The Prisma adapter returns it automatically.
- `apps/api/src/auth/domain/auth-tokens.ts` and `.spec.ts`: `AccessClaimsSchema`; the spec's `access` fixture is at line 13.
- `apps/api/src/common/default-deny.guard.ts` (`Principal`) and `.spec.ts` (staff fixture near line 20).
- `apps/api/src/auth/auth-session.service.ts`: `login` (builds `me` and calls `issue`), `refresh` (currently only reads the staffId from Redis), `me`, and `issue`.
- `apps/api/src/common/env.ts`: `SeedEnvSchema`; `env.spec.ts` beside it.
- `apps/api/src/seed/seed.module.ts` (`seedStaff`) and `seed.ts` (the caller).
- `apps/api/test/fixtures.ts`: `buildStaffUser`.
- `apps/api/test/auth.int-spec.ts`: `loginOk` helper (line ~79), the seed test (line ~401), and the cookie parsing near line 45.
- `.env.example`: the seed block at the bottom.

## Tasks

Branch first: `git switch main && git switch -c story/4-1-staff-roles`.

### A. Shared contract
- [ ] **T1 🔴 Test**: create `packages/shared/src/auth.spec.ts`. Assert that `StaffMeSchema` accepts `{ id: <uuid>, email, role: 'MANAGER' }` and rejects a missing `role` and `role: 'ADMIN'`, and that `StaffRoleSchema.options` equals `['KITCHEN','MANAGER']`. *Done when:* `pnpm test` fails on these cases (the schema has no `role` yet).
- [ ] **T2 🟢 Code**: add `StaffRoleSchema` / `StaffRole` and `role` on `StaffMeSchema`. *Done when:* T1 passes. `pnpm typecheck` now fails in the api at `me`/`login`. That is expected: the compiler is listing your next tasks.

### B. Database
- [ ] **T3 🟢 Code**: in `schema.prisma`, add `enum StaffRole { KITCHEN MANAGER }` and `role StaffRole @default(KITCHEN)` on `StaffUser`. Create migration `20261021000000_staff_role` (generate it with `prisma migrate dev --create-only` inside the api dev container, then rename the folder, or write the SQL by hand: `CREATE TYPE` + `ALTER TABLE … ADD COLUMN … DEFAULT 'KITCHEN'`). *Done when:* `pnpm test:int` boots (its `globalSetup` runs `migrate deploy`) and existing tests still pass.
- [ ] **T4 🟢 Code**: add `role: StaffRole` to the `StaffUser` port interface. *Done when:* `pnpm typecheck` shows no errors from the repository adapter.

### C. Tokens and principal
- [ ] **T5 🔴 Test**: in `auth-tokens.spec.ts`:
  - add `role: 'KITCHEN'` to the `access` fixture and assert the round-trip returns it;
  - add a case where a token signed with `{ staffId, sid }` only (use the module's `jwt.sign` the same way the spec's other forged tokens do) verifies as `null`;
  - add the same check for `role: 'ADMIN'`.

  *Done when:* the new cases fail.
- [ ] **T6 🟢 Code**: add `role` to `AccessClaimsSchema`. *Done when:* T5 passes.
- [ ] **T7 🟢 Code**: add `role` to the staff `Principal` variant and update `default-deny.guard.spec.ts`'s fixture. *Done when:* `pnpm typecheck` points only at `auth-session.service.ts`.

### D. Session service
- [ ] **T8 🔧 Tidy**: add `{ role = 'KITCHEN' }` to `buildStaffUser`'s options in `test/fixtures.ts` and pass it to `create`. *Done when:* typecheck is clean for `test/`.
- [ ] **T9 🔴 Test**: in `auth.int-spec.ts`:
  - make the login test expect `role: 'KITCHEN'` in the body;
  - add a test where a manager built with `buildStaffUser(..., { email: 'boss@example.com', role: 'MANAGER' })` logs in and gets `role: 'MANAGER'` from both login and `/me`;
  - decode the `access_token` cookie (`jwt.decode`) and assert `role`.

  *Done when:* the tests fail on the missing `role`.
- [ ] **T10 🟢 Code**: in `login`, put `user.role` into `me` and pass it to `issue`. In `me`, return `role`. Change `issue(staffId, sid, jti)` to take the role as well. *Done when:* T9 passes.
- [ ] **T11 🔴 Test**: add two refresh tests:
  - **role change:** log in as KITCHEN, `prisma.staffUser.update({ role: 'MANAGER' })`, refresh, and assert that the new `access_token` decodes to `role: 'MANAGER'`;
  - **deleted account:** log in, delete the user, and assert refresh → `401 UNAUTHENTICATED`.

  *Done when:* both fail.
- [ ] **T12 🟢 Code**: in `refresh`, after reading `staffId` from Redis, call `this.users.findById(staffId)`. If the user is missing, call `unauthenticated()`. Otherwise issue the token with `user.role`. *Done when:* T11 passes and the existing rotation and replay tests are still green.

### E. Seed
- [ ] **T13 🔴 Test**: in `env.spec.ts`, assert that `SeedEnvSchema` requires `SEED_MANAGER_EMAIL` (an email, normalised) and `SEED_MANAGER_PASSWORD` (min 12 characters). In `auth.int-spec.ts`'s seed test:
  - seed the KITCHEN user and the MANAGER user twice, and assert two rows with the right roles;
  - re-seed the KITCHEN email with `'MANAGER'`, and assert its role flips.

  *Done when:* these fail.
- [ ] **T14 🟢 Code**: extend `SeedEnvSchema`, add the `role` parameter to `seedStaff`, and make `seed.ts` call it twice (staff `KITCHEN`, manager `MANAGER`) with a log line per call. Add `SEED_MANAGER_EMAIL=manager@example.com` and `SEED_MANAGER_PASSWORD=change-me-please` to `.env.example`, **and to your own `.env`**. *Done when:* T13 passes and `pnpm dev` seeds without exiting.

### F. Finish
- [ ] **T15 🔧 Tidy**: update TSDoc on every symbol you touched. `StaffUser` is no longer just "A Kitchen Staff account"; `StaffAuthGuard`'s doc should mention `role`. *Done when:* `pnpm lint` reports 0 warnings.
- [ ] **T16 ✅ Check**: run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:int`, then log in by hand as the manager at `https://localhost/kitchen/login`. It still lands on `/kitchen`; that is correct until 4.3. *Done when:* everything is green. Then say **"review story 4.1"**.

## Questions to think about (ask me any time)

1. Why put `role` in the access token instead of looking it up from the DB on every request? What does that cost when a Manager is demoted?
2. Why must a token *without* `role` fail verification rather than default to `KITCHEN`?
3. Why does refresh read the role from the DB but the guard does not?
4. The migration adds a column with a default. What would change if there were millions of staff rows? (Postgres 11+ makes this cheap. Why?)

## Verification

- `pnpm lint && pnpm format:check && pnpm typecheck`: exit 0
- `pnpm test && pnpm test:int`: green, including the new cases in `auth.spec.ts`, `auth-tokens.spec.ts`, `env.spec.ts` and `auth.int-spec.ts`

## Review Notes

<!-- Claude fills this in on "review story 4.1" -->
