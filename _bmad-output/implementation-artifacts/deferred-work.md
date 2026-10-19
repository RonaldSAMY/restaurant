- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: resolved 2026-10-18 — Story 1.2 (`spec-1-2-quality-gates-test-harness-and-ci.md`): `apps/api/src/common/env.spec.ts`, `apps/web/lib/env.spec.ts`
  summary: Add unit tests for api `apps/api/src/common/env.ts` and web `apps/web/lib/env.ts` fail-fast parsing (missing/invalid var exits 1, valid env parses).
  evidence: No test exists for the fail-fast env behavior; Story 1.1 excluded Vitest, so it belongs in Story 1.2's harness.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: partly resolved 2026-10-18 — health integration test added in Story 1.2 (`apps/api/test/health.int-spec.ts`); the single-port CI check is re-deferred to the compose-checks entry at the end of this file
  summary: Add an integration test for `GET /api/v1/health` and a CI check that only `proxy` publishes ports in `docker compose config`.
  evidence: The health route, `/api/v1` prefix and single-port rule are verified only by manual curl/jq; Story 1.2 brings Supertest and CI.

## Deferred from: code review of spec-1-1-running-stack-skeleton (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: re-deferred 2026-10-18 — moved to the compose-checks entry at the end of this file (Story 1.2 scope split)
  summary: Add a CI compose smoke job (`docker compose up -d --wait`, then `curl -sk https://localhost/api/v1/health` expects `{"ok":true}` and `curl -sk https://localhost/` expects HTML) so Caddy `/api/*` vs web routing is covered.
  evidence: The planned Supertest integration test runs in-process and never passes through Caddy; `handle_path`, a typo'd matcher or swapped upstreams would pass it.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: re-deferred 2026-10-18 — moved to the compose-checks entry at the end of this file (Story 1.2 scope split)
  summary: Add entry-point fail-fast checks: api started with `DATABASE_URL` empty and web prod server with `API_INTERNAL_URL` empty must exit non-zero.
  evidence: The planned `env.ts` unit tests cover the helper only; removing `parseEnv()` from `main.ts` or a wrong `NEXT_RUNTIME` guard in `instrumentation.ts` would keep them green.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: resolved 2026-10-18 — Story 1.2 (`spec-1-2-quality-gates-test-harness-and-ci.md`): all tests run in `compose.test.yaml` runners (`api-unit`, `web-unit`, `api-test`)
  summary: Story 1.2 must run the Vitest/Supertest integration harness (including `prisma migrate deploy` in `globalSetup`) inside containers, not on the host.
  evidence: Decided in the 1.1 review: the app runs only in Docker for dev and prod; the host only runs `pnpm install` for the editor. `prisma.config.ts` deliberately does not load `.env` on the host.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: re-deferred 2026-10-18 — team is on macOS; revisit when a Linux host joins
  summary: Run dev containers as the host user (`user: "${UID:-1000}:${GID:-1000}"`) if a Linux host joins. Bash does not export `UID` and `GID` is not set, so write both into `.env` (e.g. `echo "UID=$(id -u)" >> .env; echo "GID=$(id -g)" >> .env`) or the fallback 1000:1000 is always used.
  evidence: Dev containers run as root and write `dist`, `.next` and `src/generated` into the bind mount; deferred because the team develops on macOS, where Docker Desktop maps ownership.

## Deferred from: code review of spec-1-1-running-stack-skeleton, round 2 (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: resolved 2026-10-18 — applied via `planning-artifacts/sprint-change-proposal-2026-10-18.md`
  summary: Reconcile the planning docs with the Docker-only decision before Story 1.2 (run `bmad-correct-course`). `epic-1-context.md` publishes postgres-test/redis-test on `127.0.0.1:55432/56379` and uses CI service containers (host-run tests); the spine says `prisma.config.ts` loads env. Also record the root-script amendment (spec Change Log, 2026-10-18): spine AD-1 and `epic-1-context.md` still say "root scripts use `pnpm -r`", but root `dev` now runs `docker compose -f compose.yaml -f compose.dev.yaml up`; do not revert it. Also drop the "opening `https://localhost` on a phone" access wording from the epic goal: the public pages only need to open in a browser on the host (decided in the 1.1 review). Keep Story 1.5's 375 px layout requirement; that is a product requirement, removable only by the product owner.
  evidence: The 1.1 review decided the app and tests run only in containers; the host only runs `pnpm install` for the editor.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: re-deferred 2026-10-18 — moved to the compose-checks entry at the end of this file (Story 1.2 scope split)
  summary: In Story 1.2 CI, after building the prod images, assert that a sentinel nested env file (e.g. `apps/web/.env.local`) is absent from the web build and standalone output.
  evidence: Only `.dockerignore` (`**/.env`, `**/.env.*`) keeps nested env files out of the build; reverting it would fail no check.

## Deferred from: code review of spec-1-1-running-stack-skeleton, round 4 (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: resolved 2026-10-18 — Story 1.2 (`spec-1-2-quality-gates-test-harness-and-ci.md`): `apps/api/tsconfig.json` (`noEmit`) covers `src`, `test` and root `*.ts`/`*.mts`; `pnpm typecheck` runs it
  summary: In Story 1.2, include `apps/api/prisma.config.ts` in the typecheck gate (e.g. a typecheck-only tsconfig with `noEmit`).
  evidence: `apps/api/tsconfig.json` has `include: ["src"]` and `rootDir: ./src`, so no tsconfig covers `prisma.config.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: re-deferred 2026-10-18 — moved to the compose-checks entry at the end of this file (Story 1.2 scope split)
  summary: Extend the Story 1.2 CI compose smoke job: also curl `https://127.0.0.1/api/v1/health`, and assert every long-running service has `init: true` in `docker compose config --format json` (base and dev override).
  evidence: The 1.1 review added the `127.0.0.1`/`[::1]` Caddy addresses and `init: true` (the dev `shared` service had missed it); nothing would catch a revert.

## Deferred from: spec-1-2-quality-gates-test-harness-and-ci scope split (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-quality-gates-test-harness-and-ci.md`
  summary: Add a CI compose-checks job after the prod image build: sentinel `apps/web/.env.local` absent from the web image, only `proxy` publishes ports (base, dev, test overrides), `init: true` on long-running services (base and dev), `run --rm --no-deps` api with `DATABASE_URL=` and web with `API_INTERNAL_URL=` exit non-zero, then `up -d --wait` and curl `https://localhost/api/v1/health`, `https://127.0.0.1/api/v1/health` (`{"ok":true}`) and `https://localhost/` (HTML).
  evidence: Split from Story 1.2 at the user's request to keep that story to the core gates, test harness and CI pipeline; it re-defers the 1.1 entries for the compose smoke job, entry-point fail-fast, sentinel env file and `init: true`/single-port assertions.

## Deferred from: code review of spec-1-2-quality-gates-test-harness-and-ci (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-quality-gates-test-harness-and-ci.md`
  summary: Add Docker layer caching to CI (buildx `cache-from/to: type=gha`) for the dev runner images and prod builds.
  evidence: Every CI run rebuilds the api/web dev images and both prod images from scratch; speed only.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-quality-gates-test-harness-and-ci.md`
  summary: Add a lint canary: run eslint on an undocumented fixture and expect `jsdoc/require-jsdoc` errors.
  evidence: The TSDoc rule was verified once with a throwaway probe; a weakened config (e.g. `publicOnly: true`) would pass CI.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-quality-gates-test-harness-and-ci.md`
  summary: The test runners in `compose.test.yaml` also run as root and write `packages/shared/dist` and `src/generated` into the bind mount; include them in the Linux UID/GID fix.
  evidence: Same cause as the 1.1 Linux UID/GID deferral; harmless on macOS Docker Desktop.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-shared-contracts-and-api-conventions.md`
  status: resolved 2026-10-19 — `spec-pre-epic-2-hardening.md`: verified Prisma 7 validation errors carry the call args in the stack; `ErrorEnvelopeFilter` now logs Prisma errors as name + code + frames (`conventions.int-spec.ts` "logs a Prisma error without its call arguments")
  summary: The error filter logs the full stack, whose first line is the error message; Prisma errors may put call arguments (e.g. password hashes) there.
  evidence: Unverified, medium if true. Settle when Story 3.1 makes the first Prisma write with sensitive data by throwing a Prisma validation error through the filter and inspecting the log; redact or log name + frames only if leaked.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-shared-contracts-and-api-conventions.md`
  status: resolved 2026-10-19 — `spec-pre-epic-2-hardening.md`: the filter returns without a response on non-`http` hosts and still logs unexpected errors (`error-envelope.filter.spec.ts`); the gateway answers its own errors (Story 3.4 AC)
  summary: The global `@Catch()` ErrorEnvelopeFilter may also run for the planned Socket.IO gateway, where `switchToHttp().getResponse()` is not an express Response.
  evidence: Unverified, medium if true. Settle when the realtime gateway lands by checking whether Nest applies APP_FILTER to WS handlers; if so, guard with `host.getType() !== 'http'`.

## Deferred from: human review of spec-1-3-shared-contracts-and-api-conventions (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-review-fixes.md`
  status: partly resolved 2026-10-19 — `spec-pre-epic-2-hardening.md`: `PrincipalGuard` has a final `canActivate` over abstract `authenticate()` that sets `req.principal` or throws 401, and `DefaultDenyGuard` denies subclasses overriding `canActivate`; logging method + route on 500s and narrowing `DomainError.details` remain open
  summary: In Story 3.1, make `DefaultDenyGuard` require that a principal was actually set (final `canActivate` + abstract `authenticate()` on `PrincipalGuard`, or an interceptor requiring `req.principal`), not only that a `PrincipalGuard` is attached; also log method + route on 500s and narrow `DomainError.details` from `unknown`.
  evidence: Today any `PrincipalGuard` subclass that returns true without setting a principal passes default deny; the first real guards land in 3.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-review-fixes.md`
  status: resolved 2026-10-19 — `spec-pre-epic-2-hardening.md`: moved into Story 3.4 as an acceptance criterion in `planning-artifacts/epics.md`
  summary: Extends the realtime-gateway entry above: the global `DefaultDenyGuard` will also deny every non-`@Public()` gateway handler.
  evidence: `APP_GUARD` applies to WS handlers too, and they have no `@Public()` or `PrincipalGuard` today; settle when the gateway lands.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-review-fixes.md`
  status: resolved 2026-10-19 — `spec-pre-epic-2-hardening.md`: `ValidationIssueSchema`/`ValidationIssue` exported from `packages/shared`; the filter types `VALIDATION_FAILED` details as `ValidationIssue[]` (parse with `ValidationIssueSchema.array()`)
  summary: With the first web form showing inline field errors, export `ValidationIssueSchema` (`{path, message}`) from `packages/shared` and type the `VALIDATION_FAILED` `details` with it.
  evidence: `ErrorEnvelopeSchema.details` is `unknown`, so web would parse field issues untyped.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-menu-api-with-cache-and-seed.md`
  summary: No automated test guards `disableOfflineQueue: true` on the Redis client (menu requests would hang instead of 500 while Redis reconnects).
  evidence: The Redis-down test destroys the client, which rejects regardless of the flag; a real guard needs a harness that can stop or sever Redis mid-run (e.g. a stoppable redis-test container or CLIENT KILL with deterministic reconnect timing).

## Deferred from: code review of spec-1-4-menu-api-with-cache-and-seed.md (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-menu-api-with-cache-and-seed.md`
  summary: The `seed.ts` entry point (what compose's `seed` service runs) is executed by no test; removing its `seedMenu` call or passing `[]` passes every check and a fresh stack serves an empty Menu.
  evidence: `menu.int-spec.ts` rebuilds the entry inline via `SeedModule` + `seedMenu`; CI only `test -f dist/seed/seed.js`. Needs an exported `seed()` with an import guard, or a subprocess test.

## Deferred from: review of spec-centralise-api-routes (2026-10-19)

- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Guard the compose api healthcheck URL against drift from `api-routes.ts`: a vitest asserting `compose.yaml` contains `localhost:3000${apiPath(ApiRoutes.health)}` (plain string match), and reword the `compose.yaml` comment to name `apiPath(ApiRoutes.health)`, not only `API_PREFIX`. Correct the spec's "one-line edit" claim: a version bump also edits the healthcheck.
  evidence: Only a comment ties them; bumping `API_PREFIX` or renaming the health route passes every test and leaves the api never healthy, so web and proxy never start.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Make the CI prod-image check (`.github/workflows/ci.yml:35`) load `dist/app.module` (pulls in the controllers that import `ApiRoutes`) and assert `API_PREFIX === 'api/v1'`, not only `require('./dist/configure-app')`.
  evidence: The current step proves the module resolves; a prod image whose shared dist lacks or changes the routes export stays green.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: `apiPath` assumes `API_PREFIX` has no leading or trailing slash; document that in the TSDoc with an assert test, or normalise slashes in `apiPath`.
  evidence: `'/api/v2'` makes web build `//api/v2/menu` while Nest normalises its prefix and serves `/api/v2/menu`.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Build the web menu URL with `new URL(apiPath(ApiRoutes.menu), API_INTERNAL_URL)` in `apps/web/lib/menu.ts:33`, or reject a trailing slash/path in the env schema.
  evidence: `z.url()` accepts `http://api:3000/`, which yields `//api/v1/menu`, a 404 and a null menu. Pre-existing, not introduced by the refactor.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Document in the `API_PREFIX` TSDoc that a version bump is breaking: deploy api and web together, or mount both prefixes during the transition.
  evidence: api and web ship as separate images; a rolling deploy or cached old web build calls `/api/v1/*` against an api serving only v2.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Dev watch does not restart the api when a shared route value changes; include `packages/shared/dist` in the nest watch or document a restart.
  evidence: `nest --watch` ignores the shared dist, so the api keeps the old paths while web hot-reloads the new ones. Low; route values rarely change.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Point the `Caddyfile:9` comment at `API_PREFIX` in `packages/shared/src/api-routes.ts` and note its first segment must stay `/api`.
  evidence: The comment hard-codes `/api/v1` and goes stale on the first version bump.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Clarify `ARCHITECTURE-SPINE.md:71`: say which decision was amended (AD-2 vs AD-19) and record the superseded "no route constants" rule and why it was reversed.
  evidence: "matching AD-19 (amended 2026-10-19)" is ambiguous; a later reader may revert the constants as a rule violation.
- source_spec: `_bmad-output/implementation-artifacts/spec-centralise-api-routes.md`
  summary: Fix the spec's audit trail: `review_loop_iteration: 0` despite a recorded triage pass, empty Implementation Notes, and no recorded result for the `API_PREFIX → api/v2` negative check.
  evidence: The acceptance criteria are marked met with no evidence recorded.

## Deferred from: review of spec-pre-epic-2-hardening (2026-10-19)

- source_spec: `_bmad-output/implementation-artifacts/spec-pre-epic-2-hardening.md`
  summary: Prisma redaction in `ErrorEnvelopeFilter` keys on `name.startsWith('PrismaClient')`; a service rethrowing a Prisma message in a plain `Error`, or a Prisma 7 `DriverAdapterError`, would still log call args or values.
  evidence: Unverified, medium if true. Settle like the PrismaClientValidationError probe: throw a driver-adapter error (e.g. a unique violation via `@prisma/adapter-pg`) through the filter and inspect the log.
