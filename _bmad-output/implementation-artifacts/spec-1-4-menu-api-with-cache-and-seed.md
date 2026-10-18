---
title: 'Story 1.4: Menu API with cache and seed'
type: 'feature'
created: '2026-10-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f41b0cde3a35cf5b60d7c8efdf137e4e59e79791'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no Menu: no `MenuItem` table, no `GET /api/v1/menu`, and the seed logs "nothing to seed".

**Approach:** Add the Prisma `MenuItem` model + migration, Prisma and Redis providers in `common/`, and a `menu` module whose `MenuService` serves the grouped Menu cache-aside from Redis `menu:v1`. The seed boots a `SeedModule`, upserts demo items by fixed UUIDs and invalidates the cache.

## Boundaries & Constraints

**Always:** `MenuResponseSchema` lives in `@restaurant/shared`; the api returns that shape. `MenuService` (via `MenuCache`) is the only code touching `menu:v1`: whole grouped JSON, no TTL, never written when the Menu is empty. Seed upserts by fixed UUID, never deletes, then calls `MenuCache.invalidate()`; `SeedModule` imports only `MenuModule`, `PrismaModule`, `RedisModule`. Prisma client via `@prisma/adapter-pg` (^7.10, matching `prisma`). `redis` (node-redis, already a devDep) becomes a runtime dependency. Integration tests use real Postgres/Redis. TSDoc on all new code.

**Never:** No staff seeding or `PasswordHasher` (Epic 3), no web changes (1.5), no TTL, no cache writes outside `MenuService`/`MenuCache`, no deletes in seed, no mocks of Postgres/Redis.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Anonymous read | items in DB, no cookie | `200` body passes `MenuResponseSchema`; items grouped by category with `id, name, description, priceCents` | N/A |
| Cache miss | `menu:v1` absent | loads from Postgres, `SET menu:v1` with no TTL (`TTL` = -1), returns it | N/A |
| Cache hit | `menu:v1` set, then DB rows deleted directly | second GET returns the cached Menu unchanged (no DB read) | N/A |
| Empty Menu | no rows, `menu:v1` absent | `200 {categories: []}`; `menu:v1` still absent | N/A |
| Re-seed | cache primed; seed runs with an extra item | next GET includes it | N/A |
| Seed idempotent | seed run twice | same row count; existing rows updated, none deleted | N/A |
| Redis/DB down | connection failure | `500 INTERNAL` envelope via the existing filter | filter |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` -- datasource/generator set (Prisma 7, no `url`); add `MenuItem` (`id String @id @db.Uuid`, `name`, `description`, `category`, `priceCents Int`).
- `apps/api/prisma.config.ts` -- migrations path `prisma/migrations`; leave as is.
- `apps/api/src/app.module.ts` -- global filter/guard/pipe; add `MenuModule` import.
- `apps/api/src/common/env.ts` -- `parseEnv()` (needs `DATABASE_URL`, `REDIS_URL`, `PORT`; exits on failure). Provider factories read URLs from it.
- `apps/api/src/common/public.decorator.ts` -- `@Public()` for the menu GET handler (put on the handler, like `health.controller.ts`).
- `apps/api/src/seed/seed.ts` -- placeholder entry; compose runs `node dist/seed/seed.js` with `env_file: .env` + `PORT`.
- `apps/api/test/setup.ts` -- integration harness (truncate + `flushDb` per test); must also set `DATABASE_URL`/`REDIS_URL`/`PORT` from the `TEST_*` vars so `parseEnv()` works in the app under test.
- `apps/api/test/health.int-spec.ts` -- app bootstrap pattern (`NestFactory.create(AppModule, {logger:false})`, `configureApp`, `app.init()`).
- `apps/api/test/global-setup.ts` -- runs `prisma migrate deploy`; picks up the new migration automatically.
- `packages/shared/src/index.ts` -- re-export point; shared depends only on `zod`.
- `compose.test.yaml` `api-test` -- already runs `prisma generate` before tests; no change.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/menu.ts`, `index.ts` -- `MenuItemSchema` (`id` uuid, `name`, `description`, `priceCents` int ≥ 0), `MenuCategorySchema` (`name`, `items`), `MenuResponseSchema` (`{categories}`) + `z.infer` types; re-export.
- [x] `apps/api/package.json` -- add `@prisma/adapter-pg` ^7.10.1, move `pg` and `redis` to dependencies.
- [x] `apps/api/prisma/schema.prisma`, `prisma/migrations/<ts>_menu_item/migration.sql` -- model + SQL generated in the `api-test` container with `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
- [x] `apps/api/src/common/prisma.module.ts` -- `PrismaService extends PrismaClient` (adapter-pg, `DATABASE_URL`), `$disconnect` on shutdown; module exports it.
- [x] `apps/api/src/common/redis.module.ts` -- `REDIS` token → connected node-redis client (`REDIS_URL`), closed on shutdown; module exports it.
- [x] `apps/api/src/menu/menu.cache.ts`, `menu.service.ts`, `menu.controller.ts`, `menu.module.ts` -- `MenuCache` (`get`/`set`/`invalidate` on `menu:v1`), `MenuService.getMenu()` cache-aside, `@Public() @Get()` at `menu`; module imports Prisma + Redis modules, exports `MenuService` and `MenuCache`.
- [x] `apps/api/src/seed/menu-seed-data.ts`, `seed.module.ts`, `seed.ts` -- ~8 demo items in 3 categories with fixed UUIDs; `seedMenu(prisma, cache, items)` upserts then invalidates; entry boots `NestFactory.createApplicationContext(SeedModule)`, runs it, closes.
- [x] `apps/api/test/fixtures.ts`, `test/setup.ts`, `test/menu.int-spec.ts` -- `buildMenuItem(overrides)` via Prisma; env mapping in setup; one test per matrix row (Redis/DB down row excluded).

**Acceptance Criteria:**
- Given `docker compose up` on a fresh volume, when `GET https://localhost/api/v1/menu` runs, then the seeded Menu comes back and `redis-cli GET menu:v1` returns it.
- Given the full gate (`lint`, `format:check`, `typecheck`, `test`, `test:int`), when it runs, then every step passes with zero warnings.

## Design Notes

- **Ordering (my call, visible in 1.5):** query with `orderBy: [{category:'asc'},{name:'asc'}]` and group in that order, i.e. alphabetical categories and items. A custom course order (Starters → Mains → Desserts) would need a `sortOrder` column the data model does not have. Say so at approval if you want it.
- Seed takes its items as an argument, so the re-seed test passes "seed data + one new item" without editing the real seed file.
- Cache-hit proof deletes rows with raw SQL after the first GET; a second GET still returning them shows no DB read happened. No spies on Prisma.

## Verification

**Commands:**
- `pnpm lint && pnpm format:check && pnpm typecheck` -- expected: pass, zero warnings.
- `pnpm test && pnpm test:int` -- expected: exit 0, menu tests included.
- `docker compose up -d --build` then `curl -sk https://localhost/api/v1/menu` -- expected: seeded Menu JSON.

## Implementation Notes

- Redis client uses `disableOfflineQueue: true` so commands reject while Redis is down (500 envelope) instead of queueing forever; verified manually by stopping `redis` in a running stack.
- `seedMenu` lives in `seed.module.ts` (not `seed.ts`) because `seed.ts` runs on import; upserts run in one `$transaction`.
- Migration `20261018000000_menu_item` is the verbatim `migrate diff` output; `migration_lock.toml` added.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | blind | `main.ts` never enables shutdown hooks, so Prisma/Redis `onModuleDestroy` never runs on SIGTERM | low | `main.ts` has no `enableShutdownHooks()`; the new TSDoc claims close-on-shutdown; one-line fix | patch |
| 2 | blind, edge | Corrupt or wrong-shaped `menu:v1` 500s forever (no re-validation) | low | Only `MenuCache.set` writes the key, always from a typed `MenuResponse`; a shape change would bump `v1`. Fix adds a guard path | reject |
| 3 | blind, edge | Miss-then-seed race can cache a stale pre-seed Menu with no TTL | low | Real, but compose runs seed before api (`depends_on: service_completed_successfully`); a live re-seed race is a millisecond window; fix needs WATCH or versioning | reject |
| 4 | blind, edge | No DB `CHECK (priceCents >= 0)`; negative row would be served | low | The only writer is the seed with constant non-negative data; adding a constraint the Prisma schema can't model adds drift | reject |
| 5 | blind | Empty strings allowed in name/category/description | low | No writer produces them (constant seed data); adds constraints | reject |
| 6 | blind | Category grouping depends on exact strings and DB collation | low | Seed data is controlled; ordering is an accepted Design Notes decision | reject |
| 7 | blind, verify | Redis/DB-down matrix row has no automated test | medium | Matrix row is frozen intent; the tasks list excluded it. Covered by a new test that destroys the app's Redis client and asserts the 500 envelope | patch |
| 8 | blind, edge | `void seed()` has no catch/log | low | Node's unhandled rejection already prints the stack and exits 1, so compose's api never starts; adds a branch | reject |
| 9 | blind | sprint-status `in-progress` vs spec `in-review` | false | Sprint status syncs at step 5 per workflow; spec status is the workflow state | reject |
| 10 | blind | Shared and Prisma both export `MenuItem` | low | Fields differ, so a wrong auto-import fails typecheck; rename is cosmetic | reject |
| 11 | blind | `CREATE SCHEMA IF NOT EXISTS "public"` in migration | false | Standard verbatim `migrate diff --from-empty` output, idempotent, required by the task | reject |
| 12 | blind | `parseEnv()` called three times per process | low | Entry points call `parseEnv()` before DI, so a bad env exits there with its message first | reject |
| 13 | edge | Seed `invalidate()` failing after commit leaves stale cache | low | Seed then rejects → exit 1 → api doesn't start; rerun fixes. Loud failure, not silent | reject |
| 14 | edge | Redis unreachable at boot → connect retries forever, hangs | low | compose gates on `redis` `service_healthy`; fix adds a reconnect strategy | reject |
| 15 | edge | `RedisModule.onModuleDestroy` throws when the client is already closed | low | `close()` on a closed client throws `ClientClosedError`; reachable via #7's test; direct `isOpen` guard | patch |
| 16 | edge | `buildMenuItem` with an explicit `undefined` override | false | Test-only helper; Prisma rejects loudly, which is correct behavior for a misuse never exercised | reject |
| 17 | verify | `SeedModule` wiring / seed entry flow not exercised by any test | medium | Pre-verified gap: tests call `seedMenu` via `AppModule`; dropping `MenuModule` from `SeedModule` passes everything | patch |
| 18 | verify | Removing `disableOfflineQueue` (hang instead of 500 while Redis reconnects) undetected | medium (unverified by test) | The #7 test uses a destroyed client, which rejects regardless of the flag; simulating a reconnecting Redis needs a stoppable Redis per test | defer |
