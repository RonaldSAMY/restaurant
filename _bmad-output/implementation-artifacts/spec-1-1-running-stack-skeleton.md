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

- 2026-10-18 (code review, human-approved): the frozen "Root scripts use `pnpm -r`" rule is amended. The root `dev` script runs `docker compose -f compose.yaml -f compose.dev.yaml up`, because the app runs only in Docker (dev and prod) and the host only runs `pnpm install` for the editor; `build` still uses `pnpm -r`.

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

### Review Findings

Code review 2026-10-18 (Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor).

- [x] [Review][Patch] Document the Docker-only workflow and the editor setup in the `compose.dev.yaml` header (resolved decision: the app runs only in containers, for dev and prod; the host only runs `pnpm install` so the editor can resolve types; generated files reach the host through the bind mount). [compose.dev.yaml:1-2]
- [x] [Review][Defer] Dev containers run as root and write into the bind mount; on Linux hosts the output is root-owned, causing EACCES [compose.dev.yaml:5-47] — deferred: the team develops on macOS (Docker Desktop maps ownership); fix with `user:` if a Linux host joins.
- [x] [Review][Patch] `.dockerignore` excludes only root-level `.env*`; nested `apps/web/.env.local` or `apps/api/.env` enter the build context and `next build` loads them, which breaks "next build gets no secrets" (medium). Fix: `**/.env` and `**/.env.*`. [.dockerignore:7-8]
- [x] [Review][Patch] api `tsconfig.json` keeps the scaffold `declaration: true`, so unused `.d.ts` files ship in the prod image (low). [apps/api/tsconfig.json:8]
- [x] [Review][Defer] Caddy `/api/*` → api vs web routing has no automated check; the planned Supertest tests run in-process and bypass the proxy [Caddyfile:5-11] — deferred: Story 1.2 CI should add a compose smoke job (`docker compose up -d --wait` + curl `/api/v1/health` and `/`).
- [x] [Review][Defer] Planned `parseEnv` unit tests would not catch entry points dropping the call (`main.ts`, `instrumentation.ts` `NEXT_RUNTIME` guard) [apps/api/src/main.ts:9, apps/web/instrumentation.ts:7] — deferred: Story 1.2 should add entry-point exit checks (`-e DATABASE_URL=` api, `-e API_INTERNAL_URL=` web expect non-zero).

**Rejected**

- blind+acceptance+edge: Host-side `pnpm dev` / Prisma CLI fail outside compose (`.env` not loaded, `.env.example` lacks `PORT`/`API_INTERNAL_URL`, `prisma.config.ts` doesn't load `.env`, `shared` not prebuilt). Resolved decision: Docker-only runtime, so the loud fail-fast on the host is correct and compose injects every value.

- blind: Spec `status: done` vs sprint `review`. The fix edits the spec under review; this review's status sync handles it.
- blind: Triage #12 cites a `down -v` note that doesn't exist. The fix edits the spec under review.
- blind: Triage #7/#14 rejection reasoning is wrong; no web missing-env verification command. The fix edits the spec under review.
- blind: `migrate` skips Zod fail-fast. low: a missing URL still fails loudly with a Prisma error; the fix adds config complexity.
- blind: `seed` validates `PORT` it doesn't use. false as a defect: the spec requires seed to parse the api env.
- blind: No `enableShutdownHooks()`. false: no module registers destroy hooks yet; add it with the 1.4 connections.
- blind: No `restart:` policy. low: a local dev stack, crashes unlikely in the skeleton; the fix adds config per service.
- blind: `migrate`/`seed` defined in both package.json and compose. false: both are in sync, and no caller diverges.
- blind: `shared` and `api` dev services build the same tag. low: the second build is a cache hit; dropping `build:` from `shared` would make it try to pull a local-only image.
- acceptance: Logger names are string literals. false: neither caller is a class, so `ClassName.name` doesn't apply.
- acceptance: No file-watch polling fallback in dev web. low: live edits verified on Docker Desktop; no failing host shown.
- acceptance: `setGlobalPrefix` set in `main.ts`, not `AppModule`. false: Nest supports it only on the app instance; the intent is met.

#### Round 2 (2026-10-18)

- [x] [Review][Patch] Point the root `dev` script at Docker: `"dev": "docker compose -f compose.yaml -f compose.dev.yaml up"`; `build` stays `pnpm -r` (resolved decision; amends the frozen "Root scripts use `pnpm -r`" rule, see Spec Change Log). Source: blind-hunter. [package.json:10]
- [x] [Review][Patch] `.env.example`: the password in `DATABASE_URL` must be percent-encoded when it contains `@ : / # ? %`; otherwise the URL parses the wrong user or host (low). Source: edge-case-hunter. [.env.example:5-9]
- [x] [Review][Patch] `.env.example`: changing `POSTGRES_*` after the first boot has no effect, because the `postgres-data` volume keeps the old credentials. migrate then fails auth and blocks the stack until `docker compose down -v` (low). Source: edge-case-hunter. [.env.example:3-6]
- [x] [Review][Defer] Planning docs predate the Docker-only and host-browser-only decisions (the epic goal still says "on a phone"): `epic-1-context.md` has `compose.test.yaml` publishing postgres-test/redis-test on `127.0.0.1:55432/56379` and CI service containers (a host-run test design), and the spine Stack table says "`prisma.config.ts` loads env" [epic-1-context.md:29,48; ARCHITECTURE-SPINE.md:291] — deferred: the fix edits other planning docs. Run `bmad-correct-course` before Story 1.2.
- [x] [Review][Patch] Document trusting Caddy's `tls internal` root CA on the host (resolved decision: no phone access; the public pages only need to open in a browser on the host). Without it the browser shows a certificate warning on `https://localhost`, which `curl -sk` hides (low). Add a `Caddyfile` comment: `docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt .` then `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain root.crt`. Source: blind-hunter+edge-case-hunter. [Caddyfile:1]
- [x] [Review][Defer] No check that nested `.env*` files stay out of the build context; reverting `.dockerignore` would pass everything [.dockerignore:7-8] — deferred: Story 1.2 CI image build should assert that a sentinel `apps/web/.env.local` is absent from the build and standalone output.

**Rejected (round 2)**

- blind: `pnpm-lock.yaml` not committed. false: it is tracked (`git ls-files pnpm-lock.yaml`), excluded only from the review diff.
- blind: `.pnpm-store` not ignored. false: `pnpm_config_verify_deps_before_run=false` stopped it being created, and none exists on disk.
- blind: Web missing-env command still missing from Verification. The fix edits the spec under review.
- blind: Stale or false statements in the round-1 triage log (#7, #12, #14). The fix edits the spec under review.
- blind: `review_loop_iteration: 0` / `status: done` stale. The fix edits the spec under review; status is re-set by this round's outcome.
- blind: `deferred-work.md` first entries lack a `## Deferred from:` header. low: every entry carries `source_spec`, so its origin is clear.
- acceptance: Story marked `done` before round 2. false: this round's outcome re-sets the status.
- acceptance: Implementation Notes don't list the round-1 fixes. The fix edits the spec under review; they are recorded as checked Review Findings.
- acceptance: Logger names are string literals. Already rejected in round 1 (neither caller is a class).

#### Round 3 (2026-10-18)

- [x] [Review][Patch] Dev `shared` service has no `init: true` (round-1 #2 fix missed it), so pnpm as PID 1 ignores SIGTERM and every dev `down` or restart waits 10 s, then SIGKILL (medium). Source: edge-case-hunter. [compose.dev.yaml:5]
- [x] [Review][Patch] Caddyfile CA-trust comment copies `root.crt` into the repo root, where it isn't gitignored. It also omits that trust must be redone after `caddy-data` is reset (`down -v` makes a new root) and that Firefox uses its own trust store (low). Copy to `/tmp/caddy-root.crt` instead. Source: blind-hunter. [Caddyfile:1-3]
- [x] [Review][Patch] Caddy site matches only `localhost`; `https://127.0.0.1` fails the TLS handshake (low). Use `localhost, 127.0.0.1`. Source: edge-case-hunter. [Caddyfile:4]
- [x] [Review][Patch] `apps/web` `"start": "next start"` doesn't work with `output: 'standalone'`, and the prod image runs `node apps/web/server.js`, so the script is dead and misleading (low). Delete it. Source: blind-hunter. [apps/web/package.json:8]
- [x] [Review][Patch] `deferred-work.md` Linux entry says `user: "${UID:-1000}:${GID:-1000}"`, but bash doesn't export `UID` and `GID` isn't set, so it would always fall back to 1000:1000 (low). Note that `UID`/`GID` must be exported or written to `.env`. Source: blind-hunter. [deferred-work.md]
- [x] [Review][Patch] `deferred-work.md` correct-course entry omits the root-script amendment, so spine AD-1 and `epic-1-context.md` still say "root scripts use `pnpm -r`" and Story 1.2 could revert `dev` (low). Source: acceptance-auditor. [deferred-work.md]

**Rejected (round 3)**

- blind: `migrate` depends on `redis: service_healthy` although it never uses Redis. false as a defect: the AC fixes the order "postgres/redis healthy → migrate".
- blind: Prisma client files may not reach `dist/`. false: all 8 generated files are `.ts`, and `dist/generated` has 8 `.js` + 8 `.map`.
- blind: Build `DATABASE_URL` from `POSTGRES_*` via compose interpolation (triage #9). low: already rejected in round 1, and interpolation can't percent-encode special-character passwords.
- blind: No getting-started document (triage #22). low: steps are documented next to the files they concern; a new file wasn't requested.
- blind: Web missing-env command missing from Verification. The fix edits the spec under review (third time raised).
- blind: False entries in triage log #7 / #12. The fix edits the spec under review.
- blind: `review_loop_iteration: 0` not bumped. The fix edits the spec under review.
- blind: Frozen "Root scripts use `pnpm -r`" line has no inline amendment note. The fix edits frozen spec text; the amendment is in the Spec Change Log.
- acceptance: Story marked `done` while round 3 is open. false: this round's outcome re-sets the status.

#### Round 4 (2026-10-18)

- [x] [Review][Patch] Nothing tells devs that the six named `*-modules` volumes keep old dependencies after a dependency change; `up --build` rebuilds the image but the volumes win (medium). Add a `compose.dev.yaml` header line on removing only the `*-modules` volumes (not `down -v`, which also wipes `postgres-data`). Source: blind-hunter. [compose.dev.yaml:1-6]
- [x] [Review][Patch] Compose interpolates `$` in `env_file` values: verified that `PW=ab$cd$$ef` becomes `ab$ef`, so a password containing `$` is silently mangled (low). Add an `.env.example` note to write `$` as `$$`. Source: edge-case-hunter. [.env.example:8-10]
- [x] [Review][Patch] Caddy site list lacks `[::1]`, so `https://[::1]` fails TLS (the same gap round 3 fixed for `127.0.0.1`) (low). Source: edge-case-hunter. [Caddyfile:6]
- [x] [Review][Patch] api `"start": "node dist/main"` is unused and differs from the prod CMD (`--enable-source-maps`), the same dead-script case as web's `start` removed in round 3 (low). Delete it. Source: acceptance-auditor. [apps/api/package.json:14]
- [x] [Review][Patch] The `deferred-work.md` correct-course entry mixes the dev-access decision with the product requirement: it says to drop Story 1.5's 375 px phone-viewport requirement "if that no longer applies" (low). Drop only the "on a phone" access wording; keep the 375 px layout requirement unless the product owner removes it. Source: blind-hunter. [deferred-work.md]
- [x] [Review][Defer] `apps/api/prisma.config.ts` is outside every tsconfig (`include: ["src"]`), so Story 1.2's typecheck gate would miss errors in it [apps/api/tsconfig.json:22] — deferred: Story 1.2 owns the typecheck gate; cover the file there.
- [x] [Review][Defer] No planned check covers the round-3/4 fixes: the Caddy `127.0.0.1`/`[::1]` site addresses and `init: true` on every long-running service [Caddyfile:6, compose.yaml:10,69, compose.dev.yaml:15] — deferred: Story 1.2 CI smoke job should also curl `https://127.0.0.1/api/v1/health` and assert `init: true` in `docker compose config --format json`.

**Rejected (round 4)**

- blind: Spec Verification has no web missing-env command, and triage #12's `down -v` note doesn't exist. The fix edits the spec under review (the user was told this recurs).
- blind: web discards the validated env; export a `getEnv()`. low: speculative for Story 1.5; nothing reads the env yet.
- blind: Add a "stale" banner to `epic-1-context.md`. The fix edits a context doc, and it's already covered by the correct-course deferred entry.
- blind: Story marked `done` while review rounds are open. false: every round with open patches set it back to `in-progress`.
- blind: Single-port check runs on `compose.yaml` only, not the dev override. low: `docker compose -f compose.yaml -f compose.dev.yaml config` was verified to publish only `proxy`; the fix extends spec Verification.
- blind: CA-trust steps are macOS-only. low: the team develops on macOS.
- blind: `engines.node >=24` is not enforced. low: pnpm warns; the app runs only in Node 24 images.
