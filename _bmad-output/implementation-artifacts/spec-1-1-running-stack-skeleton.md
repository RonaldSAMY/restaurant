---
title: 'Story 1.1: Running stack skeleton'
type: 'chore'
created: '2026-10-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4acf84e6a12d4d2440c21589da5b9fe2fae29768'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-restuarent-2026-10-17/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo has no code. Every later story needs one shared environment that works the same locally, in tests and in CI.

**Approach:** Scaffold the pnpm monorepo (`apps/api`, `apps/web`, `packages/shared`) and the full Docker Compose stack (proxy, web, api, postgres, redis, migrate, seed), all started with one `docker compose up`. Each app gets the smallest real content that proves the wiring: api `GET /api/v1/health`, a web placeholder page, and fail-fast env parsing.

## Boundaries & Constraints

**Always:** Use the versions in the architecture Stack table (Node 24, pnpm 11.28.x via `packageManager` + corepack, NestJS 11.2.x scaffolded with `@nestjs/cli@11`, Next 16.4.x, React 19.3.x, TS ~6.0.3, Zod 4, Prisma ^7.10, `postgres:18.6-alpine`, `redis:8.10.2-alpine`, `caddy:2.11.7-alpine`). Name files in kebab-case. Root scripts use `pnpm -r`. Write a TSDoc comment on every class, function and schema. Only `proxy` publishes a host port (443). Keep secrets only in `.env` and commit a complete `.env.example`.

**Never:** No Turborepo/Nx. No default values for secrets in code. No ESLint/Prettier/Vitest/CI (Story 1.2), no global guard, error filter or shared contracts (1.3), no `MenuItem` model or Redis client usage (1.4). Do not add `compose.test.yaml` (1.2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Health | `GET https://localhost/api/v1/health` | `200 {"ok":true}` | N/A |
| Web root | `GET https://localhost/` | Next.js placeholder HTML | N/A |
| Missing api env | `DATABASE_URL` unset | api exits non-zero, logs the Zod issues | `process.exit(1)` |
| Missing web env | `API_INTERNAL_URL` unset | web server exits non-zero at start (not at `next build`) | `process.exit(1)` in `instrumentation.ts` |

</frozen-after-approval>

## Code Map

Greenfield repo. Only `_bmad*`, `.claude/` and `.gitignore` exist; `.gitignore` already ignores `.env`, `.env.*` and `node_modules/`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `pnpm-workspace.yaml`, `.gitignore`: add root `packageManager: pnpm@11.28.x`, `-r` scripts (`build`, `dev`), workspace globs `apps/*`, `packages/*`, and `injectWorkspacePackages: true`. Ignore `dist/`, `.next/` and `apps/api/src/generated/`.
- [x] `packages/shared/`: create `@restaurant/shared` with a `zod`-only dependency, `tsc` build to CJS + `.d.ts`, and one placeholder export. This proves the `workspace:*` link from both apps.
- [x] `apps/api/`: scaffold with Nest CLI 11, trimmed to `AppModule` with `setGlobalPrefix('api/v1')`, a `HealthController` (`GET /health` → `{ ok: true }`), and `src/common/env.ts` (a Zod schema for `DATABASE_URL`, `REDIS_URL`, `PORT`, parsed in `main.ts` before bootstrap; exit 1 on failure). Add `prisma/schema.prisma` (datasource plus a `prisma-client` generator, output `../src/generated/prisma`, `moduleFormat = "cjs"`, no models), `prisma.config.ts`, and `src/seed/seed.ts` (parses env, logs "nothing to seed", exits 0). Depend on `@restaurant/shared` via `workspace:*`.
- [x] `apps/web/`: create a Next 16 App Router app with `output: 'standalone'`, `app/page.tsx` as the placeholder, and `instrumentation.ts`, which parses `API_INTERNAL_URL` with Zod in `register()` (Node runtime only) and exits 1 on failure. Depend on `@restaurant/shared` via `workspace:*`.
- [x] `apps/api/Dockerfile`, `apps/web/Dockerfile`: multi-stage with `dev` and `prod` targets. api prod uses `pnpm deploy --filter api --prod` (plus the generated Prisma client), and its image also serves `migrate`/`seed`. web prod copies `.next/standalone` + `static`. The `next build` stage gets no secrets.
- [x] `compose.yaml`, `Caddyfile`, `.env.example`: add the services and `depends_on` conditions (`service_healthy` / `service_completed_successfully`) in the required order, and healthchecks for postgres, redis and api. api, migrate and seed share `env_file: .env`, and web gets `API_INTERNAL_URL=http://api:3000`. The postgres volume mounts at `/var/lib/postgresql` and the Caddy `/data` volume is named. Caddy runs `tls internal`: `handle /api/*` → `api:3000`, everything else → `web:3000`.
- [x] `compose.dev.yaml`: put web and api on the `dev` target with source bind-mounted, `node_modules` in named volumes, `nest start --watch` / `next dev`, and add a `shared` service running `tsc -w`.

**Acceptance Criteria:**
- Given a fresh clone with `.env` copied from `.env.example`, when `docker compose up` runs, then services start in the order postgres/redis healthy → migrate → seed → api healthy → web → proxy, and both rows of the I/O matrix return as expected.
- Given the repo, when inspected, then there are exactly three workspace packages linked with `workspace:*` and no turbo/nx config.
- Given `docker compose config`, when ports are checked, then only `proxy` publishes `443`.
- Given `compose.dev.yaml`, when a source file in `api`, `web` or `shared` is edited, then the running service reflects it without a rebuild.
- Given `docker compose build`, when the `prod` targets build, then both succeed with no api running and no secrets passed to the web build.

## Design Notes

- **Migrate/seed with no models yet:** `migrate` runs `prisma migrate deploy` against a schema with no migrations, which exits 0. `seed` is a no-op stub. Story 1.4 fills both in.
- **Shared hot reload risk:** `injectWorkspacePackages` hard-links a copy of `shared` into each app, so `tsc -w` output may not reach the apps. If the edit-shared check fails, bind-mount `packages/shared/dist` over the injected path in the dev compose only, and record that here.
- **Web exits on bad env:** Next logs errors from `register()` without exiting, so `instrumentation.ts` must call `process.exit(1)` itself.

## Verification

**Commands:**
- `pnpm install --frozen-lockfile && pnpm -r build`: expect success.
- `cp .env.example .env && docker compose up -d --build --wait`: expect all long-running services healthy/running and migrate/seed exited 0.
- `curl -sk https://localhost/api/v1/health`: expect `{"ok":true}`.
- `curl -sk https://localhost/ | grep -i '<html'`: expect a match.
- `docker compose config --format json | jq '[.services[] | select(.ports) ] | length'`: expect `1`.
- `docker compose run --rm -e DATABASE_URL= api`: expect a non-zero exit and a Zod error.

**Manual checks:**
- With `docker compose -f compose.yaml -f compose.dev.yaml up`, edit the health response and the placeholder text, and confirm both change live.

## Implementation Notes

- Pinned: pnpm 11.28.6, `@nestjs/*` ~11.2.7, next ~16.4.2, react ~19.3.1, TS ~6.0.3, zod ^4.6.7, prisma/@prisma/client ^7.10.1. `@prisma/adapter-pg`/`pg` are deferred to 1.4 (no client is instantiated yet).
- Shared hot reload: with pnpm 11 `dedupeInjectedDeps` (default on), the injected `@restaurant/shared` resolves to a symlink to `packages/shared` on the host and in the images, so `tsc -w` output reaches both apps. No `dist` bind-mount was needed; verified live edits to api, web and shared under `compose.dev.yaml`.
- pnpm 11 blocks dependency build scripts, so `pnpm-workspace.yaml` has `allowBuilds` for `prisma` and `@prisma/engines`.
- Dev targets set `pnpm_config_verify_deps_before_run=false`; otherwise pnpm tries to reinstall against the bind-mounted workspace before every script and fails (it also created a stray `.pnpm-store`).
- api tsconfig drops the scaffold `incremental` flag: a stale `.tsbuildinfo` made `nest start --watch` emit nothing after `deleteOutDir`. `baseUrl` removed and `types` set explicitly (TS 6).
- web env parsing lives in `lib/env.ts`, imported dynamically from `instrumentation.ts` on the Node runtime, so the Edge bundle never contains `process.exit` (Turbopack warned otherwise).
- `@restaurant/shared` exports only `APP_NAME`, used by the api startup log and the web page/title.
- Review fixes: `PORT: "3000"` is pinned in compose (removed from `.env.example`, still required by `EnvSchema`); `init: true` on api/migrate/seed/web; `pg_isready -h 127.0.0.1` avoids the first-boot init-server race; api prod runs `node --enable-source-maps`, and the unused `source-map-support` devDependency is gone.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | blind, edge, verif | `PORT` settable in `.env` but 3000 hardcoded in healthcheck, Caddyfile, `API_INTERNAL_URL` | medium | `compose.yaml` healthcheck fetches `localhost:3000`; any other `PORT` never turns healthy and blocks web/proxy | patch |
| 2 | blind, edge | node as PID 1 ignores SIGTERM | medium | No `init`, no signal handler; PID 1 gets no default SIGTERM action, so stop waits 10 s then SIGKILL | patch |
| 3 | edge | `pg_isready` via unix socket passes during first-boot init server | medium | postgres image init server listens on socket only, then restarts; migrate can hit the restart on a fresh volume | patch |
| 4 | blind | Source maps built but unused in prod | low | `sourceMap: true` + `source-map-support` devDep, CMD lacks `--enable-source-maps`; one-token fix | patch |
| 5 | verif | api `parseEnv` fail-fast has no automated test | medium | No test files or CI exist; frozen intent excludes Vitest from 1.1 | defer (1.2) |
| 6 | verif | health route, `/api/v1` prefix, single-port rule checked only by hand | medium | Same as #5; harness and CI are Story 1.2 | defer (1.2) |
| 7 | verif, blind | Verification lacks a web missing-env command | low | Fix edits this spec; I ran `docker compose run --rm -e API_INTERNAL_URL= web` during step 3 and it exited 1 | reject (spec edit) |
| 8 | blind | `.env` shared by postgres and api leaks each other's vars | low | Real but dev-only placeholders; the fix splits env files (new structure) | reject |
| 9 | blind, edge | Password duplicated in `POSTGRES_PASSWORD` and `DATABASE_URL` | low | Real drift risk, flagged in an `.env.example` comment; the fix restructures env and conflicts with 1.2's test override | reject |
| 10 | blind, edge | web has no healthcheck; proxy may 502 briefly during startup | low | Transient, startup only; the required order (api healthy → web → proxy) is met; the fix adds a healthcheck | reject |
| 11 | blind | Dev override still builds and runs prod migrate/seed | low | True but cached after the first build; seed is a no-op until 1.4 | reject |
| 12 | blind | Named `node_modules` volumes go stale after dependency changes | low | Inherent to named volumes; recorded in implementation notes as `down -v` | reject |
| 13 | blind, edge | Dev `shared` healthcheck passes on stale `dist` | low | `tsc -w` recompiles within seconds; live shared edits verified | reject |
| 14 | blind | Spec status `in-review` vs sprint `in-progress`; "both rows" wording | false | Sprint sync to review happens in step 5; the wording fix edits the spec | reject |
| 15 | blind | `node:24-alpine` floats; loose devDep ranges | low | Matches the "Node 24 LTS" decision; the lockfile pins deps | reject |
| 16 | blind | web prod image doesn't copy `public/` | false | No `public/` exists; nothing 404s today | reject |
| 17 | blind | Duplicate `parseEnv` in api and web | false | Different schemas in different apps; `shared` must not hold runtime helpers like this | reject |
| 18 | edge | `PORT` > 65535 passes validation | low | `listen` then throws a RangeError, a loud failure | reject |
| 19 | edge | URL scheme not checked for `DATABASE_URL`/`REDIS_URL` | low | A wrong scheme fails loudly at connect time | reject |
| 20 | edge | `/api` without trailing slash routes to web | false | Nothing requests bare `/api`; all routes live under `/api/v1/` | reject |
| 21 | edge | `http://localhost` (port 80) refused | false | Intended: only 443 is published, per the frozen intent | reject |
| 22 | blind | No README / getting-started note | low | AC presumes `.env` is copied; docs not requested | reject |
