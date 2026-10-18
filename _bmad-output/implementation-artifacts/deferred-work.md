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
  summary: The error filter logs the full stack, whose first line is the error message; Prisma errors may put call arguments (e.g. password hashes) there.
  evidence: Unverified, medium if true. Settle when Story 3.1 makes the first Prisma write with sensitive data by throwing a Prisma validation error through the filter and inspecting the log; redact or log name + frames only if leaked.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-shared-contracts-and-api-conventions.md`
  summary: The global `@Catch()` ErrorEnvelopeFilter may also run for the planned Socket.IO gateway, where `switchToHttp().getResponse()` is not an express Response.
  evidence: Unverified, medium if true. Settle when the realtime gateway lands by checking whether Nest applies APP_FILTER to WS handlers; if so, guard with `host.getType() !== 'http'`.

## Deferred from: human review of spec-1-3-shared-contracts-and-api-conventions (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-review-fixes.md`
  summary: In Story 3.1, make `DefaultDenyGuard` require that a principal was actually set (final `canActivate` + abstract `authenticate()` on `PrincipalGuard`, or an interceptor requiring `req.principal`), not only that a `PrincipalGuard` is attached; also log method + route on 500s and narrow `DomainError.details` from `unknown`.
  evidence: Today any `PrincipalGuard` subclass that returns true without setting a principal passes default deny; the first real guards land in 3.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-review-fixes.md`
  summary: Extends the realtime-gateway entry above: the global `DefaultDenyGuard` will also deny every non-`@Public()` gateway handler.
  evidence: `APP_GUARD` applies to WS handlers too, and they have no `@Public()` or `PrincipalGuard` today; settle when the gateway lands.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-review-fixes.md`
  summary: With the first web form showing inline field errors, export `ValidationIssueSchema` (`{path, message}`) from `packages/shared` and type the `VALIDATION_FAILED` `details` with it.
  evidence: `ErrorEnvelopeSchema.details` is `unknown`, so web would parse field issues untyped.
