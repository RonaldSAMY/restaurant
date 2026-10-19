---
title: 'Story 3.1: Staff login, refresh, and logout API'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: 'fa6f59da7e4fe7fa09e1968b4df61d9c8dd14365'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no staff identity. Nothing can log in, `StaffAuthGuard` does not exist, and every future kitchen route has no principal to check.

**Approach:** Add a new `auth` module (domain/ports/adapters). It holds a seeded `StaffUser` with an argon2id hash, short-lived access and refresh JWTs in httpOnly cookies, and Redis session/refresh keys that make every token revocable. `StaffAuthGuard` is the only staff principal source. Routes: `POST auth/login`, `POST auth/refresh`, `POST auth/logout`, `GET auth/me`.

## Boundaries & Constraints

**Always:**
- Tokens are `jsonwebtoken`, HS256 pinned on both sign and verify (`algorithms: ['HS256']`), and signed with `AUTH_JWT_SECRET` (Zod, `min(32)`, required, no default). Access: `{ staffId, sid }`, `aud: 'staff-access'`, `exp` = now + 5 min. Refresh: `{ sid, jti }`, `aud: 'staff-refresh'`, `exp` = now + 1 h. `iat`/`exp` come from `Clock`, and verify passes `clockTimestamp` from `Clock`. A token with the wrong `aud` is rejected.
- Cookies: `access_token` has `Path=/` and `refresh_token` has `Path=/api/v1/auth` (`apiPath(ApiRoutes.auth)`). Both are `HttpOnly; Secure; SameSite=Strict` and set with `res.cookie`. Logout clears both with matching paths.
- Redis: `auth:session:{sid}` → staffId and `auth:refresh:{jti}` → sid, each `PX` 1 h (cleanup only). Token strings are never stored. sid and jti are `randomUUID()`.
- Refresh: verify the JWT, then `GETDEL auth:refresh:{jti}`. The result must equal the `sid` claim, and `auth:session:{sid}` must exist. Then issue a new pair with the same sid and a new jti, re-`PX` the session key, and return `204`. Any failure → `401 UNAUTHENTICATED`.
- Guard: verify the access JWT, then `GET auth:session:{sid}` must equal the `staffId` claim → principal `{ kind: 'staff', staffId, sid }`. Otherwise 401. It extends `PrincipalGuard` (implements `authenticate` only).
- Login: the email is `trim().toLowerCase()`'d (in the shared schema and in the seed). An unknown email still runs `argon2.verify` against a dummy hash, so its timing matches a wrong password. Both return `401 INVALID_CREDENTIALS`.
- Logout (`StaffAuthGuard`): `DEL` the session key and, when the refresh cookie verifies, its refresh key. Clear the cookies and return `204`.
- Seed: upserts `StaffUser` by email from `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` (seed-only env schema) through the same `PasswordHasher`. It never deletes.
- Never log tokens, passwords, hashes or cookies.
- Decision (Q1): a consumed or unknown refresh `jti` returns 401 only. It does not end the session (no reuse-detection kill), so a two-tab refresh race never logs staff out.
- Decision (Q2): `@nestjs/throttler` 6.7.x limits `POST auth/login` to 5 per 60 s per client IP. The 6th returns `429 RATE_LIMITED` (the filter already maps 429). `configureApp` sets Express `trust proxy` to `1` (Caddy is the single hop), so the limit is per client, not per Caddy. Only login is throttled. Story 2.3 reuses the same module.

**Never:** no socket disconnect on logout (the gateway is Story 3.4). No kitchen routes. No web changes. No sign-up or staff management. No `@nestjs/jwt`/passport. No expiry decided by a Redis TTL. The deferred "log method + route on 500s / narrow `DomainError.details`" item is re-deferred, not done here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Login | seeded creds (mixed-case email) | 200 `StaffMe`; both cookies with all attributes; both Redis keys hold ids, not tokens | N/A |
| Bad login | wrong password / unknown email | identical body | 401 `INVALID_CREDENTIALS` |
| Malformed body | missing email | — | 400 `VALIDATION_FAILED` |
| Me | access cookie | 200 `StaffMe` | N/A |
| Me, no/forged/guest cookie | none, bad signature, refresh token as access, `guest_session` only | — | 401 `UNAUTHENTICATED` |
| Access expiry | clock + 5 min − 1 ms / + 5 min | 200 / 401 | 401 |
| Rotate | refresh cookie | 204, new pair; `/me` with the new access token is 200 | N/A |
| Replay | old refresh cookie after a rotation | — | 401 |
| Idle | clock + 1 h, refresh | — | 401 |
| Logout | logged in | 204, cookies cleared, both keys gone; old access → `/me` 401, old refresh → 401 | N/A |
| Brute force | 6 logins from one IP within 60 s | 6th rejected even with correct creds | 429 `RATE_LIMITED` |

</frozen-after-approval>

## Code Map

- `apps/api/src/common/default-deny.guard.ts` -- `PrincipalGuard`, `Principal` (`kind: 'staff'` already declared). Do not change it.
- `apps/api/src/common/{clock,cookies,env,redis.module,prisma.module,domain-error,public.decorator}.ts` -- reuse as is. `INVALID_CREDENTIALS`/`UNAUTHENTICATED` → 401 are already mapped. `env.ts` gains the secret plus the seed schema.
- `apps/api/src/orders/guest-session.{guard,service}.ts`, `orders.controller.ts` -- pattern for the guard, the Redis key owner and `res.cookie({ passthrough: true })`. `orders.module.ts` -- the Clock/port provider pattern.
- `apps/api/src/seed/{seed,seed.module}.ts` -- extend with the staff upsert.
- `apps/api/test/guest-session.int-spec.ts` -- boot pattern with a `FakeClock` override and `expectError`. `test/cookies.ts` `cookieHeader`. `test/setup.ts` sets the env defaults for tests.
- `packages/shared/src/{api-routes,index}.ts` -- add `auth: 'auth'`, plus the new `auth.ts` schemas.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/package.json` -- add `argon2` 0.45.x, `jsonwebtoken` 9.x (+ `@types/jsonwebtoken` dev) and `@nestjs/throttler` 6.7.x -- token, hash and throttle primitives.
- [x] `apps/api/src/configure-app.ts` -- `trust proxy` = 1 via `app.getHttpAdapter().getInstance()` -- the throttle keys on the real client IP.
- [x] `packages/shared/src/auth.ts`, `index.ts`, `api-routes.ts` -- `LoginRequestSchema { email: z.email() trimmed+lowercased, password: string 1..1024 }`, `StaffMeSchema { id: uuid, email }`, `ApiRoutes.auth`.
- [x] `apps/api/prisma/schema.prisma` + `prisma/migrations/20261020000000_staff_user/migration.sql` -- `StaffUser { id uuid, email unique, passwordHash }`, hand-written in the existing migration style.
- [x] `apps/api/src/common/env.ts` (+ `env.spec.ts`) -- `AUTH_JWT_SECRET`. `SeedEnvSchema` extends it with `SEED_STAFF_EMAIL` (email) and `SEED_STAFF_PASSWORD` (min 12). `parseEnv(schema = EnvSchema)`.
- [x] `apps/api/src/auth/domain/auth-tokens.ts` (+ `.spec.ts`) -- pure: TTL constants, claim building/verifying given secret + now.
- [x] `apps/api/src/auth/ports/{password-hasher,staff-user-repository}.ts`, `adapters/{argon2-password-hasher,prisma-staff-user.repository}.ts` -- the ports and their adapters.
- [x] `apps/api/src/auth/auth-session.service.ts` -- sole owner of the `auth:*` keys: login, refresh, logout, resolve.
- [x] `apps/api/src/auth/staff-auth.guard.ts`, `auth.controller.ts`, `auth.module.ts` (exports guard + hasher; `ThrottlerModule`, with `ThrottlerGuard` + `@Throttle` on login only); `app.module.ts` -- wiring. The throttler's in-memory store survives across tests in one app, so the int test resets it or isolates the brute-force case.
- [x] `apps/api/src/seed/{seed,seed.module}.ts` -- `seedStaff` upsert.
- [x] `apps/api/test/setup.ts`, `fixtures.ts` (`buildStaffUser`), `test/auth.int-spec.ts` -- the matrix plus the seed upsert being idempotent.
- [x] `.env.example` -- the three new vars, with a generate hint (`openssl rand -base64 48`).

**Acceptance Criteria:**
- Given the full matrix, when `pnpm test:int` runs, then every row passes against real Postgres and Redis with a `FakeClock`.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test`, then all pass.
- Given the seed runs twice, then exactly one `StaffUser` exists and its `passwordHash` starts with `$argon2id$`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Iteration 0 (blind-hunter BH, edge-case-hunter EC, verification-gap VG).

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | BH, EC | Logout 401s once the 5-min access token expired; session lingers | low | reject | Intent prescribes `Logout (StaffAuthGuard)`; the 3.3 client refreshes on 401 and retries, so everyday logout works; a refresh-only logout path adds branches. |
| 2 | BH, EC | Logout deletes a refresh key whose `sid` differs from the session's | low | patch | `logout` pushes `refreshKey(claims.jti)` without comparing `claims.sid`; one-line direct correction. |
| 3 | BH, EC | Login throttle in memory / not per account | false | reject | Q2 decision fixes per-IP `@nestjs/throttler`; compose runs one api container. |
| 4 | BH, EC, VG | `trust proxy 1` lets a direct caller rotate `X-Forwarded-For` | false | reject | compose publishes only `proxy` (443); api is reachable only through Caddy, which does not trust client XFF by default. |
| 5 | BH | `.env.example` placeholders pass validation | low | reject | Same convention as existing `change-me` Postgres creds; blocking known values adds guards. |
| 6 | BH | Email normalization not DB-enforced | low | reject | Every write path (seed, schema) normalizes; no staff management exists; a CHECK is new surface. |
| 7 | BH | Refresh reuse not detected | false | reject | Q1 decision: consumed jti returns 401 only, by design. |
| 8 | BH | Seed builds the whole AuthModule and needs `AUTH_JWT_SECRET` | low | reject | `SeedEnvSchema` extends `EnvSchema` per task; seed service shares `.env`, works. |
| 9 | BH | Re-seed resets password and leaves sessions alive | low | reject | Upsert is the stated behavior; session revocation on rotation adds new logic. |
| 10 | BH | Failed refresh doesn't clear cookies / no `no-store` | low | reject | 204/401 carry no body; dead cookies just yield 401 again. |
| 11 | BH, EC | Guard admits a deleted StaffUser's live session | false | reject | No deletion path exists (intent: no staff management). |
| 12 | BH, EC | Logout/refresh race leaves an orphan refresh key | low | reject | Orphan key points at a deleted session → next refresh 401; TTL cleans it; WATCH/Lua adds complexity. |
| 13 | EC | Concurrent same-token refresh: loser 401 | false | reject | Q1 accepts this; the session survives. |
| 14 | BH | `AuthModule` doc omits `AuthSessionService` export | low | patch | Comment vs `exports` mismatch; direct correction. |
| 15 | BH | `AuthSessionService` calls `parseEnv()` itself | low | reject | No named harm; env already validated at bootstrap. |
| 16 | EC | Corrupt `passwordHash` makes argon2 throw → 500 | low | reject | Only seed writes hashes, always valid PHC. |
| 17 | EC | `login` before `onModuleInit` sees empty dummy hash | false | reject | Nest awaits `onModuleInit` in `app.init()` before listening. |
| 18 | EC | Random test IP can collide → flaky 429 | low | patch | Counter instead of `Math.random` is a direct correction. |
| 19 | EC | Redis key PX can lapse ms before JWT `exp` | low | reject | Sub-ms window at the 1 h edge; intent says TTL is cleanup only. |
| 20 | VG | Sliding session `pExpire` on refresh is unverified | medium | patch | Pre-verified: deleting `.pExpire` passes all tests. |
| 21 | VG | Refresh with session gone but refresh key present is untested | medium | patch | Pre-verified: removing the `staffId === null` guard passes all tests. |
| 22 | VG | Seed entry point (`seed.ts`) never executed by tests/CI | medium | defer | Pre-existing gap (CI only checks `dist/seed/seed.js` exists); needs a compose-seed CI step. |

## Design Notes

`jsonwebtoken` is chosen over hand-rolled HMAC because AD-16's `clockTimestamp` is its verify option. A dummy-hash verify for unknown emails stops user enumeration by timing. One secret is enough because `aud` separates access tokens from refresh tokens.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck` -- expected: exit 0
- `pnpm test && pnpm test:int` -- expected: all green, `auth.int-spec.ts` included
