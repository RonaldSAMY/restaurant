---
reviewed: ARCHITECTURE-SPINE.md (status draft, 2026-10-17)
against: prd.md (final), .memlog.md
lens: good-spine rubric (divergence coverage, rule enforceability, deferred safety, tech currency, PRD coverage, dimension coverage incl. operational envelope, bloat, mermaid validity, technical correctness)
date: 2026-10-17
---

# Spine Review: restuarent

## Verdict

The spine is sound and mostly well aimed. The import directions, data ownership, principal and guard split, atomic transitions, emit-after-commit, the error envelope and the money rules are all real divergence points, and the rules for them are concrete. It is not ready to hand to build agents yet, for three reasons. (1) There is no API surface, and paths are deliberately left out of `shared`, so web stories and api stories will each invent endpoints. (2) Several test and tooling rules fail as written: parallel truncation, `Clock` vs Redis TTL, Secure cookies vs Supertest. (3) The version-specific traps of Prisma 7 and Next 16 are left to agents whose defaults are older majors. Bloat is low. All but one of the diagrams are valid.

## Findings

Severity: critical / high / medium / low.

### F1 [high] No API surface. Web and api will diverge on endpoints.
AD-2 keeps route constants out of `shared`, and the memlog confirms "API paths NOT shared". Nothing else names the endpoints either. Only one path appears anywhere: the PATCH in the AD-10 sequence diagram. A web story and an api story built independently have to agree on at least these:
- How a refreshed Guest "lands back" on their Order (FR-3). This needs a guest-session endpoint such as `GET /api/v1/orders/current`. Nothing says it exists, what `/track` (no reference) does, or what the response is when there is no session (404 vs 401).
- Reference lookup `GET /api/v1/orders/{reference}`, which is public and throttled.
- Place order `POST /api/v1/orders`, and the shape of the 409 `details` (`{ reference }`).
- Board snapshot `GET /api/v1/kitchen/orders`, including its order (FR-8 says oldest first) and whether *Collected* Orders are excluded on the server.
- `PATCH /api/v1/kitchen/orders/{id}/status` with `{ to }`.
- `POST /api/v1/auth/login|refresh|logout`, plus a "who am I" call so `/kitchen` can tell logged-in from logged-out.
- `GET /api/v1/menu`.

**Fix:** add one table of about 9 rows (method, path, access level, request schema, response schema, error codes). This stays inside the "paths not shared" decision: the table is documentation, not a constant.

### F2 [high] Integration test isolation breaks under Vitest's default file parallelism.
AD-16 says "each integration test file truncates its tables and flushes its Redis keys in `beforeEach`" against one `postgres-test` and one `redis-test`. Vitest runs test files in parallel workers by default, so file A's truncate wipes file B's data partway through a test. The result is flaky failures that look like application bugs, the worst kind for an AI build loop.
**Fix:** state `fileParallelism: false` (or `poolOptions.forks.singleFork`) for the integration project. Alternatives are one schema or database per worker using `VITEST_POOL_ID`, and one Redis DB index per worker. Also name who applies migrations to the test DB: a Vitest `globalSetup` that runs `prisma migrate deploy`.

### F3 [high] Version-specific traps are named but not fixed. Agents default to Prisma 6 and Next 14/15 habits.
The Stack pins the majors correctly, but the spine does not record the shape changes. An agent working from older defaults will produce code that does not build, and two agents can easily make different choices.
- **Prisma 7:** connection config moves into `prisma.config.ts`, and `url` leaves the `datasource` block. The new `prisma-client` generator needs an explicit `output` and should be set to `moduleFormat = "cjs"` for Nest 11's CommonJS. The client needs a driver adapter (`@prisma/adapter-pg`, which is not in the Stack table). `.env` is not auto-loaded and seed configuration moved. The `migrate` one-shot needs the `prisma` CLI in its image. If `prisma` is a devDependency, `pnpm deploy --prod` drops it, so say whether `migrate` uses the `dev` target or `prisma` becomes a runtime dependency. Postgres `timestamptz` (Conventions) needs `@db.Timestamptz(3)`, because Prisma `DateTime` maps to `timestamp(3)` without a time zone.
- **Next 16:** the Menu page is "server-rendered" from `http://api:3000`. A route with no dynamic API is prerendered at `next build`, and inside `docker build` the api cannot be reached. The build then fails, or it bakes in a stale Menu, which breaks FR-1 "re-seed refreshes". The rule needs "Menu page is dynamic (`await connection()` / `export const dynamic = 'force-dynamic'`)". Also: `middleware.ts` is now `proxy.ts` (a naming clash with the Caddy "proxy" service, so say which is meant). `params` and `cookies()` are async. `next lint` is gone, so the root flat config must include `@next/eslint-plugin-next`. For the prod image, choose `output: 'standalone'` or `pnpm deploy` (AD-1 implies `pnpm deploy` for both apps, but standalone is the normal way to ship Next).
- **pnpm 10+/11:** `pnpm deploy` needs `injectWorkspacePackages: true` (or `--legacy`), otherwise it fails for workspace dependencies such as `@restuarent/shared`. Dependency build scripts are blocked by default, so declare `onlyBuiltDependencies` / allowed builds (esbuild, argon2, @swc/core as needed) in `pnpm-workspace.yaml`.

**Fix:** add a short "Version notes" block under Stack with these bullets, or put them in the relevant ADs (AD-15 for migrate and images, AD-12 for the dynamic Menu).

### F4 [high] The injected `Clock` cannot control Redis TTLs, so the expiry rules are untestable as written.
AD-6 says a Guest Session is valid "only while the key exists", and AD-5 relies on Redis TTLs for sessions and refresh tokens. AD-16 says time-dependent rules "take an injected `Clock` port so tests control time". Redis expires keys on its own wall clock, so a test that moves `Clock` forward 24 h still finds the key. Either the FR-3 and FR-4 expiry tests cannot be written, or agents will each work around it differently (sleeping, `EXPIRE` hacks, mocking Redis, which breaks AD-16).
**Fix:** make the clock-based check authoritative. A Guest Session is valid iff the key exists, `clock.now() < placedAt + 24h`, and the Order is not *Collected*. The Redis TTL is cleanup only. `placedAt` is set from `Clock` by the app, not by a DB `now()` default. The JWT verifier gets `clock.now()` (jose `currentDate` / jsonwebtoken `clockTimestamp`). FR-4's reference-lookup window uses the same computation.

### F5 [medium] Local HTTPS and Secure-cookie mechanics are only partly correct, and the test topology contradicts AD-15.
- **Secure cookies behind Caddy are fine.** Express sets the `Secure` attribute whatever `req.secure` is, and the browser sees https. But Caddy's `tls internal` CA is generated inside the container and cannot install itself into the macOS or CI trust store. The spine needs: persist Caddy's `/data` volume (otherwise there is a new CA on every recreate), trust `root.crt` manually or accept the warning, and set Playwright `ignoreHTTPSErrors: true` locally and in CI.
- **Supertest:** integration tests go directly to Nest over http. superagent's cookie jar (`request.agent`) does not send `Secure` cookies over http, so the obvious login-then-call test fails with 401. State the convention: tests copy `Set-Cookie` into a `Cookie` header themselves (one small helper), or run Supertest with a forced https flag.
- **Where tests run:** "Only `proxy` publishes a host port" conflicts with integration tests that run on the host against `postgres-test`/`redis-test`. CI uses service containers on `localhost`. Fix one topology, for example: compose.test publishes `5433`/`6380` to the host, tests run on the host in both places, and `DATABASE_URL` uses the same ports. The alternative is tests running in a container; either way, write it down.
- **SameSite=Strict is correct here.** It is a good CSRF and CSWSH control: the WS handshake from a foreign site carries no cookies. It works because all session-aware reads are same-origin `fetch`, which counts as same-site wherever the user came from. The trap: a cross-site top-level navigation (a link from another site) arrives without the cookies. Any future server-side gate (Next `proxy.ts` or a server component that checks the session for `/kitchen` or `/track`) would see "logged out". Add one line: "the web never checks the session on the server; session state comes from client fetches". The refresh cookie is path-scoped to `/api/v1/auth`, so the web could not see it server-side anyway.
- **Cookie Path:** make `Path=/` explicit for `access_token` and `guest_session`. Express defaults to `/`, but RFC 6265 default-path would give `/api/v1/auth` and `/api/v1`. Then `/api/socket.io` (AD-10 handshake auth) and `/api/v1/kitchen` would not receive the cookies. One word prevents an agent from "tidying" the path.

### F6 [medium] Staff refresh choreography and the web fetch path are undecided, and the Deferred list makes this worse.
FR-6 needs the session to survive refreshes with a 5-minute access token. Nothing says who refreshes, or when. Without that, the login, board and socket stories will each do it their own way. With rotation, parallel board requests (or two tabs sharing the cookie jar) send the same `jti` twice. One request wins, the other gets 401, and the staff member is "logged out". "Client data-fetching library" is deferred, which is fine, but then each page writes its own fetch.
**Fix:** one rule in AD-12. All browser calls go through one `apiFetch` (parse with the shared schema, map the error envelope, and on `401` run one single-flight `POST /auth/refresh` and retry once). After a failed refresh, retry the original call once, because another tab may already have rotated the cookies, and only then send the user to login. Socket `connect_error` triggers refresh and then reconnect. Server side: the refresh endpoint consumes the `jti` atomically (`GETDEL`) and checks that `auth:session:{sid}` exists.

### F7 [medium] AD-4's "default is deny" has no enforcing mechanism.
"Every route declares its guard explicitly … default is deny" holds only with a global guard, but the spine names two route-level guards and a `@Public()` marker. If an agent forgets `@UseGuards`, the route is open.
**Fix:** one global `APP_GUARD` that reads `@Access('public' | 'guest' | 'staff')` metadata and throws when metadata is missing. It delegates to the guest and staff checks, and the two principal kinds stay as they are. Add an FR-7 integration test that lists every route via `DiscoveryService` and checks that each non-public route rejects anonymous and guest callers. This also covers routes that are "public but read the guest cookie" (POST /orders, for the 409).

### F8 [medium] Throttling has gaps: the WS bypass and the proxy IP.
- AD-8 throttles the HTTP reference lookup. AD-10's `order.subscribe { reference }` repeats the same lookup over WS, where `@nestjs/throttler`'s HTTP guard does not apply, so it is an unthrottled enumeration path. Fix: throttle `order.subscribe` with the same limiter (a WS throttler guard keyed on the handshake IP), or allow subscribe only after the HTTP lookup succeeds.
- Behind Caddy, every request comes from the proxy's IP, so the throttler limits all guests together. Fix: `app.set('trust proxy', 1)` (Caddy sets `X-Forwarded-For`), or a throttler `getTracker` that reads it.

### F9 [medium] Dev and ops envelope gaps (the operational dimension is mostly covered; these are the holes).
- **`shared` in dev:** both apps use `dist/` (CJS). With hot reload, an edit to `shared` is invisible until it is rebuilt. Name a `tsc -b --watch` for `shared` in compose.dev (its own service, or part of each app's dev command). Also give `shared` an `exports`/`types` map and `files: ["dist"]` (needed by `pnpm deploy`). Declare `zod` as a peer dependency of `shared`, with one version pinned through a pnpm catalog, so web, api, `shared` and nestjs-zod never load two Zod copies.
- **Bind mounts on macOS:** mounting the repo with the host's `node_modules` puts darwin binaries (swc, esbuild, argon2) into Linux containers. Rule: `node_modules` is installed only in the container, with anonymous or named volumes over every `node_modules`.
- **Seed:** it runs on every `compose up`, so it must be idempotent: upsert by natural key or fixed UUIDs, never delete Menu Items that OrderItems reference (FK, retention), and take the staff password from `.env` (AD-14).
- **Health:** `api` waits for postgres and redis, but nothing waits for `api`. Add a public `GET /api/v1/health`, a compose healthcheck on it, `proxy`/`web` depending on it, and e2e waiting on it.
- **Redis durability:** sessions live only in Redis. Say whether a restart that loses all sessions is acceptable (it is for the demo), and whether AOF is off or on.
- **Web env fail-fast (AD-14):** Next has no `main()`. Name `instrumentation.ts` `register()` (or a `server-only` env module) as the place it is parsed, and note that `NEXT_PUBLIC_*` values are inlined at build time.

### F10 [low] Live-update merge rule is missing a small guarantee.
"Refetch the snapshot, then apply events" leaves a gap: events that arrive while the snapshot is in flight can be dropped or applied before it. Because status only moves forward, one line closes this: "the client merges by order rank, `max(current, incoming)`, never regressing, so it is idempotent and order-independent."

### F11 [low] Rule enforceability for AD-17 and the shared/Prisma enum mirror.
- "TSDoc on every exported symbol" and "zero warnings" are enforceable only through a lint rule. Name `eslint-plugin-jsdoc` (`require-jsdoc` with `publicOnly`).
- "Prisma enum mirrors" the shared `z.enum`, which means two sources. Add one unit test that asserts `Object.values($Enums.OrderStatus)` equals `OrderStatusSchema.options`.

### F12 [low] Data model inconsistencies.
- AD-9 lists `totalCents` "in the DB", but the ER has no such column. Decide whether it is stored on `Order` or computed in the response.
- The ER leaves out the fields FR-1 and FR-6 need (`MenuItem.name/description`, `StaffUser.email/passwordHash`) and the unique `Order.reference` (`UK`). Agents will add them anyway, but the seed is the place to show uniqueness.
- Currency and locale for "format at render" are not fixed, so two pages could format money differently. Name one `formatCents()` and one currency.

### F13 [low] Tech currency notes.
- "ESLint + typescript-eslint 10.x": typescript-eslint has its own version line (8.x as of the last check). List the two separately.
- TypeScript 6.0: check that the pinned typescript-eslint, `@nestjs/cli` and Next 16 support TS 6 before scaffolding, and keep 5.9 as the fallback. TS 6 also deprecates `moduleResolution: node`, so `shared`'s tsconfig should use `module`/`moduleResolution: nodenext` (which emits CJS without `"type": "module"`).
- "nestjs-zod: latest supporting zod ^4" and "Vitest: latest at scaffold" are acceptable under the Deferred "exact patch versions" row.
- Node 24 LTS, Postgres 18, Redis 8, Caddy 2.11, Next 16.2, Nest 11.1, Prisma 7 (not 8) and Zod 4 (`z.iso.datetime()` exists) agree with the memlog's web checks. The "≥ 10.1.8" floor for eslint-config-prettier correctly avoids the compromised 10.1.6/10.1.7.

### F14 [low] Minor correctness: double-submit on placement.
A new Guest has no cookie yet, so a double click on "Place Order" creates two Orders. FR-3's one-open-Order rule only applies once the cookie exists. A disabled button covers it for the demo. If the rule matters, place an `Idempotency-Key` or SET-NX on the client-generated key.

## Bloat and over-engineering

Low overall. Most of the structure exists because a test or the post-MVP direction needs it.
- **Ports & adapters in `auth`** (low): auth's domain is argon2 plus JWT plus two Redis keys. Integration tests already hit real Redis and Postgres, so repository ports and in-memory fakes in `auth` buy little. AD-17's own rule ("no abstraction without a second implementation or a test fake that needs it") argues for keeping ports in `orders` only (repository, `OrderEventsPublisher`) plus `Clock`, and leaving `auth` a plain service like `menu`.
- **Three compose files** (low): `compose.test.yaml` could be a `profiles: [test]` block in `compose.yaml`. This is a matter of taste, not a finding that blocks anything.
- **Nightly e2e plus e2e on main** for a 2-day demo (low): fine, but "on main" alone is enough.
- Everything else (Socket.IO rooms, the `staff-session:{sid}` room for logout disconnect, the error envelope, fail-fast env) is a small cost that buys a real guarantee. No finding.

## Deferred list check

None of the Deferred rows lets two units diverge, with one exception. The "Client data-fetching library" deferral leaves fetch, refresh and parse behavior to each page; see F6, where one `apiFetch` rule closes it without adding a library. "Production hosting" is deferred explicitly, which settles the deployment dimension for this altitude. The RabbitMQ and Socket.IO Redis adapter rows are safe behind the `OrderEventsPublisher` port and the single-replica assumption.

## PRD coverage

| PRD item | Covered | Gap |
| --- | --- | --- |
| FR-1 | AD-9/11/12 | Next prerender trap (F3) |
| FR-2 | AD-2/8/9 | Double submit (F14, low) |
| FR-3 | AD-4/6 | "Land back after refresh" endpoint missing (F1); expiry testability (F4) |
| FR-4 | AD-6/8 | Window computed by `Clock` (F4); WS bypass of throttle (F8) |
| FR-5 | AD-10 | Merge rule (F10) |
| FR-6 | AD-5 | Refresh choreography and race (F6) |
| FR-7 | AD-4/16 | Default-deny mechanism (F7) |
| FR-8 | AD-10/12 | Oldest-first ordering not stated (F1) |
| FR-9 | AD-7 | No gap |
| NFR security / retention / tests / responsive | AD-4/5/9/16/12 | Test isolation (F2), Secure cookies in tests (F5) |

## Dimension coverage

| Dimension | Status |
| --- | --- |
| Module boundaries, data ownership, layering | Decided (AD-3, paradigm table) |
| Wire contracts | Decided for schemas (AD-2); **endpoint surface silent** (F1) |
| AuthN/AuthZ | Decided (AD-4/5/6); enforcement mechanism thin (F7) |
| Concurrency and consistency | Decided (AD-7, AD-10) |
| Realtime | Decided (AD-10) |
| Caching | Decided (AD-11) |
| Errors, config, logging | Decided (AD-13/14, Conventions) |
| Frontend data access | Decided (AD-12); refresh and fetch path missing (F6) |
| Testing | Decided (AD-16); isolation and clock flaws (F2, F4, F5) |
| Environments and deployment | Decided for local and CI (AD-15/18); prod deferred explicitly |
| Infra and operations | Mostly: health, seed idempotency, Redis durability, dev install silent (F9) |
| Observability | Deferred explicitly |

## Mermaid validity

- Paradigm `flowchart TD`: valid.
- AD-7 `stateDiagram-v2`: valid.
- AD-10 `sequenceDiagram`: valid. Braces and `...` in message text are fine.
- AD-15 `flowchart LR`: valid (quoted pipe labels, cylinder `[("…")]`).
- Seed `erDiagram`: the bare `StaffUser` line (an entity with no relationship and no attribute block) does not render in all Mermaid versions. Give it an attribute block (`StaffUser { uuid id  string email  string passwordHash }`), which also fixes part of F12. All other syntax is valid.
