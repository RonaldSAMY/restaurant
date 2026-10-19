# Epic 1 Context: Guests can browse the Menu

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Anyone opening `https://localhost` in a browser on the host sees the seeded Menu grouped by category, served from a Redis cache, and re-running the seed makes new items appear. Most of the epic is groundwork every later epic builds on: the pnpm monorepo, the Docker Compose stack, quality gates and CI, the real-infra test harness, and the shared Zod contracts with default-deny API conventions. Build in this order: stack, then gates/CI, then contracts, then features. The only table this epic creates is `MenuItem`.

## Stories

- Story 1.1: Running stack skeleton
- Story 1.2: Quality gates, test harness, and CI
- Story 1.3: Shared contracts and API conventions
- Story 1.4: Menu API with cache and seed
- Story 1.5: Public Menu page

## Requirements & Constraints

- The Menu is public (no auth) and shows all Menu Items grouped by category with name, description and price. After the first request it is served from cache; re-seeding refreshes it.
- Money is integer cents everywhere (DB, schemas, UI state), formatted only at render.
- The Menu page must be usable at a 375 px viewport with no horizontal scroll. If the api is down or errors, it shows a friendly "Menu unavailable" state instead of crashing.
- Every endpoint enforces authorization server-side, default deny. Passwords are hashed with argon2id.
- Integration tests run against real Postgres and Redis, never mocked. `pnpm lint`, `format:check` and `typecheck` pass with zero warnings.
- Scope: 2-day MVP, single kitchen. Nothing beyond the MVP.

## Technical Decisions

- **Docker-only:** the app and all tests (unit, integration) run only in containers, for dev and prod. The host runs only `pnpm install`, so the editor can resolve types. `prisma.config.ts` reads `DATABASE_URL` from the process env (compose `env_file`) and never loads `.env`.
- **Monorepo:** pnpm workspaces only (no Turborepo/Nx). Exactly three packages: `apps/api` (NestJS 11), `apps/web` (Next.js 16 App Router), `packages/shared` (`@restaurant/shared`), linked with `workspace:*`. pnpm pinned via `packageManager`; `injectWorkspacePackages: true`. Root scripts use `pnpm -r`, except `dev`, which runs `docker compose -f compose.yaml -f compose.dev.yaml up`. Prod images: api via `pnpm deploy --filter api --prod`, web via `output: 'standalone'`.
- **Compose:** `compose.yaml` runs Caddy (`tls internal`), web, api, postgres 18, redis 8, then one-shot `migrate` and `seed`. Startup: postgres/redis healthy → migrate → seed → api healthy (`/api/v1/health`) → web → proxy. Only the proxy publishes a host port (443), with no exceptions. Caddy forwards `/api/*` unmodified to `api:3000`, everything else to `web:3000`; the api owns the `/api/v1` prefix. `compose.dev.yaml` adds dev targets, bind-mounted source, `node_modules` in named volumes, hot reload, and a `shared` `tsc -w` watcher. `compose.test.yaml` adds unpublished `postgres-test`/`redis-test` and a one-shot `api-test` runner (api `dev` target, `TEST_DATABASE_URL`/`TEST_REDIS_URL` over the compose network). Integration runs locally and in CI via `docker compose -f compose.yaml -f compose.test.yaml run --rm api-test`.
- **Env:** each app parses env with Zod at start and exits on failure. No secret defaults in code; `.env` gitignored, complete `.env.example` committed; api/migrate/seed share `env_file: .env`. Web parses env in `instrumentation.ts` at server start, so `next build` needs no api and no secrets.
- **Shared contracts:** every wire payload, `OrderStatus` (`RECEIVED|PREPARING|READY|COLLECTED`) and `ErrorCode` is defined once as Zod; TS types only via `z.infer`. Depends only on `zod`; no Prisma types or business rules. The api prefix and endpoint paths live once in `api-routes.ts` (amended AD-2, AD-19). Built with `tsc` to CJS + `.d.ts`.
- **Error envelope:** one global exception filter returns `{ error: { code, message, details? } }`. Closed `ErrorCode` set: VALIDATION_FAILED 400, MENU_ITEM_NOT_FOUND 400, UNAUTHENTICATED 401, INVALID_CREDENTIALS 401, FORBIDDEN 403, ORDER_NOT_FOUND 404, ORDER_ALREADY_OPEN 409, INVALID_TRANSITION 409, RATE_LIMITED 429, INTERNAL 500. Web branches on `code`, never `message`.
- **Default deny:** a global guard rejects routes with none of `@Public()`, `StaffAuthGuard`, `GuestSessionGuard`. A global `ZodValidationPipe` (nestjs-zod) validates bodies → `400 VALIDATION_FAILED` with field details. `/health` and `/menu` are `@Public()`.
- **Modules:** `menu`, `orders`, `auth`, `realtime`, `common`, with fixed import directions (realtime → auth/orders, orders → menu, all → common), no `forwardRef`. `menu` is a plain service owning `MenuItem` and Redis key `menu:v1`. `common/` holds Clock, Prisma/Redis providers, the filter, env schema, `@Public()` and the global guard.
- **Menu cache:** `MenuService` is the only reader/writer of `menu:v1` (whole grouped Menu JSON, no TTL). Hit → return; miss → load from Postgres, write, return. Never cache an empty Menu.
- **Seed:** upserts Menu Items by fixed UUIDs, never deletes, then calls `MenuCache.invalidate()`. Boots a `SeedModule` importing only `MenuModule`, Prisma and Redis (staff seeding via `SEED_STAFF_EMAIL`/`SEED_STAFF_PASSWORD` and the PasswordHasher adapter comes with auth).
- **Data model:** `MenuItem` = UUID `id`, `name`, `description`, `category`, `priceCents` (int). Prisma ^7.10 (never unpinned), generator `prisma-client`, output `src/generated/prisma` (gitignored), `moduleFormat = "cjs"`.
- **API:** `GET /api/v1/health` → `{ ok: true }`; `GET /api/v1/menu` → `MenuResponse` (grouped by category). JSON camelCase.
- **Web Menu page:** `/` uses `export const dynamic = 'force-dynamic'`, fetches `${API_INTERNAL_URL}/api/v1/menu` server-side per request (the only server-side use of `API_INTERNAL_URL`), and parses with `MenuResponseSchema`. Next 16 `params`/`searchParams`/`cookies()` are async.
- **Testing:** Vitest in every package (`unplugin-swc` in api); unit tests need no infrastructure. Integration: Vitest + Supertest on the real Nest app inside `api-test`, `fileParallelism: false`, `globalSetup` runs `prisma migrate deploy` once, each file truncates tables and flushes Redis in `beforeEach`, data from fixture builders. `common/` provides a `Clock` port with system and advanceable fake adapters. One helper copies `Set-Cookie` into a `Cookie` header.
- **Quality and CI:** TSDoc on every class, method, property, function, type and Zod schema (exported or not), stating its purpose and naming any pattern; lint enforces it (e.g. `eslint-plugin-jsdoc`). One root `eslint.config.mjs` (type-aware typescript-eslint via `projectService`, Next plugin for web) + Prettier + `eslint-config-prettier`. tsconfigs set `types` explicitly, no `baseUrl`; TypeScript ~6.0.3. GitHub Actions on push/PR: frozen install → lint + format → typecheck → unit → integration (same `api-test` compose command; no CI service containers) → build prod images.
- **Conventions:** kebab-case files; schema `XxxSchema` → type `Xxx`; Redis keys `<owner>:<thing>:{id}`; `new Logger(ClassName.name)`, never log tokens, passwords or cookies; throw domain errors carrying an `ErrorCode`.

## Cross-Story Dependencies

- 1.1 → 1.2 → 1.3 → 1.4 → 1.5 follow the build order; each depends on the previous.
- 1.2 must take each Story 1.2 entry in `implementation-artifacts/deferred-work.md` (env fail-fast tests, compose smoke job, sentinel env file check, `prisma.config.ts` typecheck, `init: true` assertion) into scope or explicitly re-defer it.
- 1.4 relies on 1.3 for default deny, `@Public()`, the error filter and the home for `MenuResponseSchema`, and on 1.2 for the integration harness that proves cache hits skip the DB.
- 1.5 consumes 1.4's `MenuResponse` and 1.1's `API_INTERNAL_URL` / compose networking.
- Epics 2 and 3 build on this: `OrderItem → MenuItem` is `onDelete: Restrict` with name/price snapshots; the seed later adds staff users; the `Clock` port and cookie helper exist mainly for their expiry and auth tests.
