---
title: 'Story 1.2: Quality gates, test harness, and CI'
type: 'chore'
created: '2026-10-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cf95366283d15f96257687482fe61038fee21af8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing checks the code: there is no lint, format, typecheck, test harness or CI, so a change can merge that only works on one machine.

**Approach:** One root ESLint/Prettier setup with TSDoc enforcement and a typecheck gate covering every TS file, all run on the host and the CI runner. Vitest in every package, with unit and integration tests run only in containers from `compose.test.yaml`. Add the `Clock` port, the cookie helper, and one GitHub Actions workflow.

## Boundaries & Constraints

**Always:** Versions from the Stack table (Vitest 5.0.x + unplugin-swc 2.x + @swc/core 1.16.x, ESLint 10 + typescript-eslint 8 flat config, Prettier 3 + eslint-config-prettier ≥10.1.8). Zero warnings. Root `dev` stays the docker compose command. TSDoc on all new code.

**Decisions (user, 2026-10-18):** lint/format/typecheck use one config shared by host and containers, and run on the host and the CI runner. All tests (unit and integration) run only inside containers, so their library and Node versions match the real runtime. Test DBs are unpublished. Integration never mocks Postgres/Redis.

**Deferred-work decisions:** in scope: env fail-fast unit tests (api + web), `/health` integration test, `prisma.config.ts` typecheck. Re-deferred (scope split, see `deferred-work.md`): CI compose checks (smoke job incl. `127.0.0.1`, entry-point exits, sentinel env file, `init: true` and single-port assertions); Linux host UID/GID (team is on macOS).

**Never:** No contracts, guard, filter or Prisma models (1.3/1.4). No Testing Library/Playwright. No CI service containers. No `baseUrl`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Missing doc | class/method/property/function/type/top-level const without TSDoc | `pnpm lint` fails | non-zero exit |
| Env invalid | api `parseEnv()` with `DATABASE_URL` missing/not a URL; web with `API_INTERNAL_URL` missing | logs Zod issues, `process.exit(1)` | spy on `process.exit` |
| Env valid | all vars set | parsed env (`PORT` a number) | N/A |
| Fake clock | `new FakeClock(t0).advance(60_000)` | `now()` = t0 + 60 s | N/A |
| Cookies | 2 `Set-Cookie` headers with attributes | `"a=1; b=2"` | none → `""` |
| Health | Supertest `GET /api/v1/health` | `200 {"ok":true}` | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- keep `build`/`dev`; add root lint/format devDependencies.
- `apps/api/tsconfig.json` -- `include: ["src"]`, `rootDir: ./src`: `prisma.config.ts`, `test/` and vitest configs are outside every tsconfig. `nest build`/`start` use `tsconfig.build.json`.
- `apps/api/src/common/env.ts`, `apps/web/lib/env.ts` -- `parseEnv()` under test; behavior unchanged.
- `apps/api/src/main.ts` -- sets `api/v1` prefix; the integration test must apply it to its app too.
- `apps/*/Dockerfile` `dev` target -- deps only (`--filter <app>...`), no source; the test runners reuse it with source bind-mounted and anonymous `node_modules` volumes (as in `compose.dev.yaml`).
- `packages/shared` -- apps resolve it via `dist/`; build it before typecheck, lint and tests.
- Compose needs `.env` for any command (CI: `cp .env.example .env`). No migrations yet; `prisma migrate deploy` exits 0.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore` -- root scripts `lint` (`eslint . --max-warnings 0`), `format`, `format:check`, `typecheck` (`pnpm -r typecheck`), `test` (runs `api-unit` then `web-unit`), `test:int` (runs `api-test`). ESLint: typescript-eslint `recommendedTypeChecked` via `projectService`; `@next/eslint-plugin-next` on `apps/web/**`; `eslint-plugin-jsdoc` requiring a described comment on the matrix's constructs; `eslint-config-prettier` last. Ignore build output, generated code, `_bmad*`, `.claude`, lockfile.
- [x] `apps/api/tsconfig*.json`, package `package.json`s -- api `tsconfig.json` covers `src`, `test`, root `*.ts` with `noEmit`; the build config keeps `rootDir`/`outDir`/`src` and excludes specs. `typecheck` scripts (web: `next typegen && tsc --noEmit`); `test` scripts with Vitest (`unplugin-swc` in api, `passWithNoTests` in shared).
- [x] `apps/api/src/common/clock.ts` (+ spec) -- abstract `Clock` port (`now(): Date`), `SystemClock` and `FakeClock` (`advance(ms)`, `set(date)`) adapters.
- [x] `apps/api/src/common/env.spec.ts`, `apps/web/lib/env.spec.ts` -- env matrix rows.
- [x] `apps/api/test/cookies.ts` (+ spec) -- `cookieHeader(res)` builds a `Cookie` value from `Set-Cookie`.
- [x] `apps/api/vitest.integration.config.*`, `test/global-setup.ts`, `test/setup.ts`, `test/health.int-spec.ts` -- `fileParallelism: false`; globalSetup runs `prisma migrate deploy` once against `TEST_DATABASE_URL`; `beforeEach` truncates every public table except `_prisma_migrations` (`pg`) and flushes Redis (`redis`), devDependencies.
- [x] `compose.test.yaml` -- unpublished `postgres-test`/`redis-test` (healthchecks, fixed test-only credentials); one-shot `api-unit`, `web-unit` (no infra) and `api-test` (depends on both healthy, `TEST_DATABASE_URL`/`TEST_REDIS_URL`). Each builds shared first; `api-test` also runs `prisma generate`.
- [x] `.github/workflows/ci.yml` -- push/PR: pnpm + Node 24, frozen install, build shared, lint + format check, typecheck, `cp .env.example .env`, unit (`pnpm test`), integration (`pnpm test:int`), `docker compose build` prod images.
- [x] `deferred-work.md` -- mark the in-scope 1.1 entries resolved and the rest re-deferred.

**Acceptance Criteria:**
- Given `pnpm install` and a built shared, when `pnpm lint`, `format:check`, `typecheck` run on the host, then each passes with zero warnings.
- Given a type error in `apps/api/prisma.config.ts`, when `pnpm typecheck` runs, then it fails.
- Given `.env`, when `pnpm test` runs, then unit tests of every package pass in containers with no DB/Redis started.
- Given `.env`, when `pnpm test:int` runs, then `postgres-test`/`redis-test` start unpublished and the health test passes.
- Given a push or PR, when CI runs, then every workflow step passes in order.

## Verification

**Commands:**
- `pnpm install --frozen-lockfile && pnpm --filter @restaurant/shared build && pnpm lint && pnpm format:check && pnpm typecheck` -- expected: pass, zero warnings.
- `pnpm test && pnpm test:int` -- expected: exit 0.
- `docker compose -f compose.yaml -f compose.test.yaml config --format json | jq '[.services[]|select(.ports)]|length'` -- expected: `1`.
- Add an undocumented function; `pnpm lint` -- expected: fails; revert.

**Manual checks:**
- After pushing, the GitHub Actions run is green.

## Implementation Notes

- Vitest configs are `.mts` (a `.ts` config triggered Vite's CJS warning). `pnpm-workspace.yaml` blocks `@swc/core`'s postinstall (`allowBuilds: false`); the musl binary comes from the optional platform package (api-unit passes on Alpine).
- `pnpm test`/`test:int` pass `--build` so runners never reuse a stale dev image. The integration app uses `NestFactory.create(AppModule)`; add `@nestjs/testing` when a story needs to override providers (e.g. `Clock`).
- The TSDoc rule was checked with a throwaway probe file covering each required construct; no committed canary (see triage #V4).

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| B1 | blind | Spec and lockfile missing from the diff | false | Excluded on purpose: the spec is the claims file, and the lockfile is generated | reject |
| B2/V3 | blind, verif | Truncate/flush isolation never exercised | medium | No migrations exist, so the TRUNCATE branch never runs and nothing asserts the flush | patch |
| B3/V2 | blind, verif | Test sets the `api/v1` prefix itself; no check on `main.ts` | medium | `health.int-spec.ts:15` duplicates `main.ts`; 1.3 global wiring would drift | patch |
| B4/E7 | blind, edge | `test:int` leaves postgres-test/redis-test running | low | `run --rm` removes only the runner; fix is one command | patch |
| B5 | blind | CI never runs `prisma generate` on the runner | low | `src/generated` is gitignored; host lint/typecheck break once 1.4 imports it; one line | patch |
| B6 | blind, verif-other | Env tests cover only DATABASE_URL | low | REDIS_URL/PORT failure paths untested; adding table rows is trivial | patch |
| B7 | blind | web has no vitest config with restoreMocks | low | Manual `afterEach` cleanup works; future-only concern | reject |
| B8 | blind | CI lacks permissions/timeout/concurrency | low | Default token scope is broader than needed; permissions and timeout are trivial; concurrency rejected | patch |
| B9 | blind | No Docker layer cache in CI | low | Speed only | defer |
| B10/E1 | blind, edge | setup.ts falls back to localhost if TEST_* is unset | low | Guard exists only in global-setup for the DB; a one-line guard prevents a wrong-target wipe | patch |
| B11 | blind | Unit runners may not resolve `@restaurant/shared` | maybe-false | 1.1 verified that `dedupeInjectedDeps` symlinks the injected copy; would only be low | reject |
| B12 | blind | swc musl binding unverified | false | `api-unit` ran and passed in the Alpine dev image | reject |
| V1 | verif | Prod api image without `dist/main.js` still passes CI | medium | `noEmit` now lives in the base tsconfig; nothing checks the build output | patch |
| V4 | verif | No canary proves the TSDoc rule fires | low | Rule verified once with a probe; regression only if the config is edited | defer |
| E2 | edge | TEST_DATABASE_URL could equal DATABASE_URL | low | `api-test` has no `env_file`, so DATABASE_URL is unset there | reject |
| E3 | edge | `redis.close()` in afterAll masks connect errors | low | Only when infra is down; the connect error still logs first | reject |
| E4 | edge | `app.close()` on undefined after bootstrap fails | low | Trivial `?.` fix | patch |
| E5 | edge | FakeClock accepts NaN or an invalid date | low | Test-only adapter; needs guard branches | reject |
| E6 | edge | Empty Set-Cookie entry gives an empty segment | low | Not produced by Node/Supertest | reject |
| E8 | edge | Root-owned bind-mount output on Linux | low | Same cause as the existing Linux UID/GID deferral | defer |
| E9 | edge | Test commands fail without `.env` | low | Compose already requires `.env` for every command; CI copies it | reject |
