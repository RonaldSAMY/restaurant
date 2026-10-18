- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Add unit tests for api `apps/api/src/common/env.ts` and web `apps/web/lib/env.ts` fail-fast parsing (missing/invalid var exits 1, valid env parses).
  evidence: No test exists for the fail-fast env behavior; Story 1.1 excluded Vitest, so it belongs in Story 1.2's harness.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Add an integration test for `GET /api/v1/health` and a CI check that only `proxy` publishes ports in `docker compose config`.
  evidence: The health route, `/api/v1` prefix and single-port rule are verified only by manual curl/jq; Story 1.2 brings Supertest and CI.

## Deferred from: code review of spec-1-1-running-stack-skeleton (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Add a CI compose smoke job (`docker compose up -d --wait`, then `curl -sk https://localhost/api/v1/health` expects `{"ok":true}` and `curl -sk https://localhost/` expects HTML) so Caddy `/api/*` vs web routing is covered.
  evidence: The planned Supertest integration test runs in-process and never passes through Caddy; `handle_path`, a typo'd matcher or swapped upstreams would pass it.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Add entry-point fail-fast checks: api started with `DATABASE_URL` empty and web prod server with `API_INTERNAL_URL` empty must exit non-zero.
  evidence: The planned `env.ts` unit tests cover the helper only; removing `parseEnv()` from `main.ts` or a wrong `NEXT_RUNTIME` guard in `instrumentation.ts` would keep them green.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Story 1.2 must run the Vitest/Supertest integration harness (including `prisma migrate deploy` in `globalSetup`) inside containers, not on the host.
  evidence: Decided in the 1.1 review: the app runs only in Docker for dev and prod; the host only runs `pnpm install` for the editor. `prisma.config.ts` deliberately does not load `.env` on the host.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Run dev containers as the host user (`user: "${UID:-1000}:${GID:-1000}"`) if a Linux host joins. Bash does not export `UID` and `GID` is not set, so write both into `.env` (e.g. `echo "UID=$(id -u)" >> .env; echo "GID=$(id -g)" >> .env`) or the fallback 1000:1000 is always used.
  evidence: Dev containers run as root and write `dist`, `.next` and `src/generated` into the bind mount; deferred because the team develops on macOS, where Docker Desktop maps ownership.

## Deferred from: code review of spec-1-1-running-stack-skeleton, round 2 (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  status: resolved 2026-10-18 — applied via `planning-artifacts/sprint-change-proposal-2026-10-18.md`
  summary: Reconcile the planning docs with the Docker-only decision before Story 1.2 (run `bmad-correct-course`). `epic-1-context.md` publishes postgres-test/redis-test on `127.0.0.1:55432/56379` and uses CI service containers (host-run tests); the spine says `prisma.config.ts` loads env. Also record the root-script amendment (spec Change Log, 2026-10-18): spine AD-1 and `epic-1-context.md` still say "root scripts use `pnpm -r`", but root `dev` now runs `docker compose -f compose.yaml -f compose.dev.yaml up`; do not revert it. Also drop the "opening `https://localhost` on a phone" access wording from the epic goal: the public pages only need to open in a browser on the host (decided in the 1.1 review). Keep Story 1.5's 375 px layout requirement; that is a product requirement, removable only by the product owner.
  evidence: The 1.1 review decided the app and tests run only in containers; the host only runs `pnpm install` for the editor.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: In Story 1.2 CI, after building the prod images, assert that a sentinel nested env file (e.g. `apps/web/.env.local`) is absent from the web build and standalone output.
  evidence: Only `.dockerignore` (`**/.env`, `**/.env.*`) keeps nested env files out of the build; reverting it would fail no check.

## Deferred from: code review of spec-1-1-running-stack-skeleton, round 4 (2026-10-18)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: In Story 1.2, include `apps/api/prisma.config.ts` in the typecheck gate (e.g. a typecheck-only tsconfig with `noEmit`).
  evidence: `apps/api/tsconfig.json` has `include: ["src"]` and `rootDir: ./src`, so no tsconfig covers `prisma.config.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Extend the Story 1.2 CI compose smoke job: also curl `https://127.0.0.1/api/v1/health`, and assert every long-running service has `init: true` in `docker compose config --format json` (base and dev override).
  evidence: The 1.1 review added the `127.0.0.1`/`[::1]` Caddy addresses and `init: true` (the dev `shared` service had missed it); nothing would catch a revert.
