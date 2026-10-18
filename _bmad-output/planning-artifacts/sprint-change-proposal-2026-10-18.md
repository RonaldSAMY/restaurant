# Sprint Change Proposal — Docker-only dev & test

- **Date:** 2026-10-18
- **Trigger:** Story 1.1 code review (round 2 Defer, `deferred-work.md`): "Reconcile the planning docs with the Docker-only decision before Story 1.2."
- **Scope:** Minor — planning-doc edits only, no code changes, no story added or removed.
- **Mode:** Batch
- **Status:** Approved and applied 2026-10-18 (sections 4.1–4.3; success-criteria grep clean)

## 1. Issue Summary

During the Story 1.1 review, three decisions were made and implemented (commit `9f9be66`):

1. **Docker-only.** The app and its tests run only in containers, for dev and prod. The host runs only `pnpm install`, so the editor can resolve types. `apps/api/prisma.config.ts` reads `DATABASE_URL` from the process env (compose `env_file`) and deliberately does **not** load `.env` on the host.
2. **Root `dev` script.** `pnpm dev` = `docker compose -f compose.yaml -f compose.dev.yaml up`. This amends the "root scripts use `pnpm -r`" rule (`build` still uses `pnpm -r`).
3. **No phone/LAN access.** Public pages only need to open in a browser on the host. The 375 px layout requirement (NFR4, Story 1.5) is a product requirement and **stays**.

The planning docs still describe the old design: test DBs published on `127.0.0.1:55432/56379`, host-run integration tests, CI service containers, "`prisma.config.ts` loads env", "root scripts use `pnpm -r`", and "opens `https://localhost` on a phone". If Story 1.2 is built from these docs it will reintroduce host-run tests and could revert `pnpm dev`.

## 2. Impact Analysis

- **Epic 1:** goal wording (phone access) and Story 1.2 (integration harness + CI) change. Stories 1.3–1.5 are unaffected; 1.5 keeps the 375 px AC.
- **Epics 2–3:** no change. Story 3.5 (Playwright e2e) inherits the Docker-only rule; its runner details are settled when that story is specced.
- **PRD / SPEC:** no change. NFR4 "works on a phone screen" is a layout requirement, not an access path.
- **Architecture spine:** AD-1, AD-15, AD-16, AD-18 and the Stack table.
- **`epic-1-context.md`:** goal, Monorepo, Compose and CI bullets.
- **Code:** none. Story 1.1 already matches.

## 3. Recommended Approach

**Direct adjustment.** Edit the docs to match the decisions already made. The test topology becomes: `compose.test.yaml` adds unpublished `postgres-test`/`redis-test` plus a one-shot `api-test` runner (api `dev` target) on the compose network. Locally and in CI, integration runs as `docker compose -f compose.yaml -f compose.test.yaml run --rm api-test`, so there are no published test ports and no CI service containers.

- **Effort:** ~30 min of doc edits. **Risk:** low. **Timeline:** none. Do this before Story 1.2 starts.

## 4. Detailed Change Proposals

### 4.1 Architecture spine (`ARCHITECTURE-SPINE.md`)

**AD-1 Rule** (line 65)
- OLD: `Root scripts use \`pnpm -r\` (topological).`
- NEW: `Root scripts use \`pnpm -r\` (topological), except \`dev\`, which runs \`docker compose -f compose.yaml -f compose.dev.yaml up\`. Apps and tests run only in containers; the host runs only \`pnpm install\` (editor type resolution).`
- Why: records the root-script amendment and the Docker-only rule, so Story 1.2 does not revert `dev`.

**AD-15 Rule — `compose.test.yaml` bullet** (line 197)
- OLD: `adds \`postgres-test\` / \`redis-test\` published on \`127.0.0.1:55432\` / \`127.0.0.1:56379\` (the only exception to proxy-only) and points \`api\`/\`migrate\`/\`seed\` at them.`
- NEW: `adds unpublished \`postgres-test\` / \`redis-test\` and a one-shot \`api-test\` runner (api \`dev\` target) with \`TEST_DATABASE_URL\` / \`TEST_REDIS_URL\` pointing at them over the compose network. Integration runs via \`docker compose -f compose.yaml -f compose.test.yaml run --rm api-test\`. Proxy-only has no exceptions.`

**AD-16 table — Integration row, Infra column** (line 222)
- OLD: `real Postgres + Redis at \`TEST_DATABASE_URL\` / \`TEST_REDIS_URL\` (\`localhost:55432\` / \`:56379\`, locally and in CI)`
- NEW: `real Postgres + Redis in \`postgres-test\` / \`redis-test\` (compose network, via \`TEST_DATABASE_URL\` / \`TEST_REDIS_URL\`); runs inside the \`api-test\` container, locally and in CI`

**AD-16 table — E2E row, Infra column** (line 223)
- OLD: `full compose stack at \`https://localhost\``
- NEW: `full compose stack; Playwright runs in a container (runner details in Story 3.5)`

**AD-18 Rule** (line 239)
- OLD: `integration (Postgres + Redis service containers on 55432 / 56379)`
- NEW: `integration (\`docker compose … run --rm api-test\`, same command as local)`

**Stack table — Prisma row** (line 291)
- OLD: `\`apps/api/prisma.config.ts\` loads env;`
- NEW: `\`apps/api/prisma.config.ts\` reads \`DATABASE_URL\` from the process env (compose \`env_file\`), never loads \`.env\`;`

### 4.2 Epics (`epics.md`)

**AD-15 summary** (line 62)
- OLD: `\`compose.test.yaml\` (postgres-test/redis-test on 127.0.0.1:55432/56379)`
- NEW: `\`compose.test.yaml\` (unpublished postgres-test/redis-test + one-shot \`api-test\` runner)`

**AD-18 summary** (line 65)
- OLD: `integration (service containers 55432/56379)`
- NEW: `integration (in compose \`api-test\`)`

**Epic 1 goal** (lines 90 and 103)
- OLD: `Anyone opens \`https://localhost\` on a phone and sees …`
- NEW: `Anyone opens \`https://localhost\` in a browser on the host and sees …`

**Story 1.2 — integration AC** (line 168)
- OLD: `**Given** \`compose.test.yaml\` with \`postgres-test\` / \`redis-test\` on \`127.0.0.1:55432\` / \`:56379\` **When** I run the api integration suite`
- NEW: `**Given** \`compose.test.yaml\` with unpublished \`postgres-test\` / \`redis-test\` and a one-shot \`api-test\` runner **When** I run \`docker compose -f compose.yaml -f compose.test.yaml run --rm api-test\``

**Story 1.2 — CI AC** (line 183)
- OLD: `integration (Postgres + Redis service containers on 55432 / 56379)`
- NEW: `integration (the same \`api-test\` compose command)`

**Story 1.2 — new final AC**
- NEW: `**Given** the Story 1.2 entries in \`implementation-artifacts/deferred-work.md\` (env fail-fast tests, compose smoke job, sentinel env file check, \`prisma.config.ts\` typecheck, \`init: true\` assertion) **When** Story 1.2 is specced **Then** each is in scope or explicitly re-deferred.`
- Why: keeps the review's deferred items from being lost.

### 4.3 Epic context (`implementation-artifacts/epic-1-context.md`)

- **Line 7 goal:** `on a phone` → `in a browser on the host`.
- **Line 28 Monorepo:** `root scripts use \`pnpm -r\`` → `root scripts use \`pnpm -r\` except \`dev\` (\`docker compose -f compose.yaml -f compose.dev.yaml up\`); apps and tests run only in containers`.
- **Line 29 Compose:** `\`compose.test.yaml\` adds postgres-test/redis-test on \`127.0.0.1:55432\`/\`56379\`.` → `\`compose.test.yaml\` adds unpublished postgres-test/redis-test and a one-shot \`api-test\` runner.`
- **Line 48 CI:** `integration (service containers on 55432/56379)` → `integration (compose \`api-test\`)`.
- **Line 21 (375 px):** unchanged.

### 4.4 PRD / SPEC

No change.

## 5. Implementation Handoff

- **Scope:** Minor → Developer agent applies sections 4.1–4.3 verbatim.
- **Then:** mark the `deferred-work.md` correct-course entry resolved (reference this proposal).
- **Success criteria:**
  - `grep -rn "55432\|56379\|service containers\|localhost\` on a phone\|loads env" _bmad-output/planning-artifacts/epics.md _bmad-output/planning-artifacts/architecture _bmad-output/implementation-artifacts/epic-1-context.md` returns nothing.
  - The 375 px AC in Story 1.5 and NFR4 are still present.
  - Story 1.2 can be specced without contradicting commit `9f9be66`.
