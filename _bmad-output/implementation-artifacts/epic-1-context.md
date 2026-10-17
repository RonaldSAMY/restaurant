# Epic 1 Context: Guests can browse the Menu

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Anyone opening `https://localhost` on a phone sees the seeded Menu grouped by category, served from a Redis cache, and re-running the seed makes new items appear. Most of the epic is groundwork that every later epic builds on: the pnpm monorepo, the full Docker Compose stack, the quality gates and CI, the real-infra test harness, and the shared Zod contracts with default-deny API conventions. Build them in this order: stack, then gates/CI, then contracts, then features. The only table this epic creates is `MenuItem`.

## Stories

- Story 1.1: Running stack skeleton
- Story 1.2: Quality gates, test harness, and CI
- Story 1.3: Shared contracts and API conventions
- Story 1.4: Menu API with cache and seed
- Story 1.5: Public Menu page

## Requirements & Constraints

- The Menu is public (no auth) and shows all Menu Items grouped by category with name, description, and price. After the first request it is served from cache, and re-seeding refreshes the cache.
- Money is integer cents everywhere (DB, schemas, UI state) and is formatted only at render.
- The Menu page must work on a 375 px phone viewport with no horizontal scroll. If the api is down or returns an error, the page shows a friendly "Menu unavailable" state instead of crashing.
- Every endpoint enforces authorization on the server and denies by default. Passwords are hashed with argon2id.
- Tests run against real Postgres and Redis and are never mocked. `pnpm lint`, `format:check` and `typecheck` must pass with zero warnings.
- Scope: 2-day MVP with a single kitchen. Do not add features beyond the MVP to make it "look complete".

## Technical Decisions

- **Monorepo:** pnpm workspaces only (no Turborepo/Nx). There are exactly three packages, `apps/api` (NestJS 11, scaffolded with `@nestjs/cli@11`), `apps/web` (Next.js 16 App Router) and `packages/shared` (`@restaurant/shared`), linked with `workspace:*`. pnpm is pinned via `packageManager`, `injectWorkspacePackages: true` is set, and root scripts use `pnpm -r`. Prod images use `pnpm deploy --filter api --prod` for the api and `output: 'standalone'` for web.
- **Compose:** `compose.yaml` runs Caddy (`tls internal`), web, api, postgres 18, redis 8, a one-shot `migrate` and then a one-shot `seed`. Startup order is postgres/redis healthy → migrate → seed → api healthy (`/api/v1/health`) → web → proxy. Only the proxy publishes a host port (443). Caddy forwards `/api/*` unmodified to `api:3000` and everything else to `web:3000`, and the api owns the `/api/v1` prefix. `compose.dev.yaml` adds dev Dockerfile targets, bind-mounted source, `node_modules` in named volumes, hot reload and a `shared` `tsc -w` watcher. `compose.test.yaml` adds postgres-test/redis-test on `127.0.0.1:55432`/`56379`. Each app has one multi-stage Dockerfile with `dev` and `prod` targets, and the postgres volume mounts at `/var/lib/postgresql`.
- **Env:** each app parses its env with Zod at start and exits on failure. Secrets have no defaults in code, `.env` is gitignored, and a complete `.env.example` is committed. api, migrate and seed share `env_file: .env`. Web parses env in `instrumentation.ts` at server start, so `next build` needs neither the api nor secrets.
- **Shared contracts:** every wire payload, `OrderStatus` (`RECEIVED|PREPARING|READY|COLLECTED`) and `ErrorCode` is defined once as Zod, with TS types taken only via `z.infer`. The package depends only on `zod` and contains no Prisma types, business rules or route constants. It is built with `tsc` to CJS + `.d.ts`.
- **Error envelope:** one global exception filter returns `{ error: { code, message, details? } }`. The closed `ErrorCode` set is VALIDATION_FAILED 400, MENU_ITEM_NOT_FOUND 400, UNAUTHENTICATED 401, INVALID_CREDENTIALS 401, FORBIDDEN 403, ORDER_NOT_FOUND 404, ORDER_ALREADY_OPEN 409, INVALID_TRANSITION 409, RATE_LIMITED 429 and INTERNAL 500. The web branches on `code` and never on `message`.
- **Default deny:** a global guard rejects any route that has none of `@Public()`, `StaffAuthGuard` or `GuestSessionGuard`. A global `ZodValidationPipe` (nestjs-zod) validates bodies. `/health` and `/menu` are `@Public()`.
- **Module layout:** modules are `menu`, `orders`, `auth`, `realtime` and `common`, with fixed import directions (realtime → auth/orders, orders → menu, all → common) and no `forwardRef`. `menu` is a plain service that owns the `MenuItem` model and the Redis key `menu:v1`. `common/` holds Clock, the Prisma/Redis providers, the filter, the env schema, `@Public()` and the global guard.
- **Menu cache:** `MenuService` is the only reader and writer of `menu:v1`, which holds the whole grouped Menu JSON with no TTL. On a hit it returns the cached Menu. On a miss it loads from Postgres, writes the cache and returns the result. It never caches an empty Menu.
- **Seed:** the seed upserts Menu Items by fixed UUIDs (and staff by email, using `SEED_STAFF_EMAIL`/`SEED_STAFF_PASSWORD` once auth exists), never deletes, then calls `MenuCache.invalidate()`. It boots a `SeedModule` that imports only `MenuModule`, Prisma and Redis (plus the PasswordHasher adapter later).
- **Data model:** `MenuItem` has a UUID `id`, `name`, `description`, `category` and `priceCents` (int). It uses Prisma ^7.10 (never unpinned) with `prisma.config.ts`, generator `prisma-client`, output `src/generated/prisma` (gitignored) and `moduleFormat = "cjs"`.
- **API:** `GET /api/v1/health` returns `{ ok: true }`. `GET /api/v1/menu` returns `MenuResponse` (shared schema, grouped by category). JSON is camelCase.
- **Web Menu page:** `/` is server-rendered with `export const dynamic = 'force-dynamic'`. It fetches `${API_INTERNAL_URL}/api/v1/menu` server-side on every request and parses the response with `MenuResponseSchema`. This is the only server-side use of `API_INTERNAL_URL`. In Next 16, `params`, `searchParams` and `cookies()` are async.
- **Testing:**
  - Vitest is used in every package, with `unplugin-swc` in the api. Unit tests need no infrastructure.
  - Integration tests use Vitest + Supertest on the real Nest app with `fileParallelism: false`. A `globalSetup` runs `prisma migrate deploy` once, and each file truncates tables and flushes Redis in `beforeEach`. Data comes from fixture builders.
  - `common/` provides a `Clock` port with a system adapter and an advanceable fake adapter.
  - One helper copies `Set-Cookie` into a `Cookie` header.
- **Quality and CI:**
  - Every class, method, property, function, type and Zod schema, exported or not, has a TSDoc comment saying what it is for and naming any pattern it uses. Lint enforces this (e.g. `eslint-plugin-jsdoc`).
  - There is one root `eslint.config.mjs` (type-aware typescript-eslint via `projectService`, plus the Next plugin for web), Prettier and `eslint-config-prettier`. tsconfigs set `types` explicitly and do not use `baseUrl`. TypeScript is ~6.0.3.
  - GitHub Actions runs on every push and PR: frozen install → lint + format → typecheck → unit → integration (service containers on 55432/56379) → build the prod images.
- **Conventions:** file names are kebab-case. Schemas are named `XxxSchema` with the matching type `Xxx`. Redis keys follow `<owner>:<thing>:{id}`. Logging uses `new Logger(ClassName.name)` and never logs tokens, passwords or cookies. Code throws domain errors that carry an `ErrorCode`.

## Cross-Story Dependencies

- Stories 1.1 → 1.2 → 1.3 → 1.4 → 1.5 follow the build order, and each one depends on the previous.
- 1.4 relies on 1.3 for the default-deny guard, `@Public()`, the error filter and the shared `MenuResponseSchema` home. It relies on 1.2 for the integration harness that proves cache hits skip the DB.
- 1.5 consumes 1.4's `MenuResponse` and 1.1's `API_INTERNAL_URL` / compose networking.
- Epics 2 and 3 build on this foundation: `OrderItem → MenuItem` uses `onDelete: Restrict` with snapshots of name and price, and the seed later adds staff users via the PasswordHasher adapter. The `Clock` port and cookie helper exist mainly for their expiry and auth tests.
