# Review — Versions & Reality Check

- **Target:** `ARCHITECTURE-SPINE.md` (Stack table + every named technology), cross-checked against `.memlog.md` `(version)` entries
- **Lens:** every committed decision web-researched / reality-checked, not asserted from training data
- **Date:** 2026-10-17
- **Method:** `npm view <pkg> version / dist-tags / peerDependencies / engines` against the live registry; Docker Hub tag API for images; official docs (prisma.io, pnpm.io) and web search for behavior
- **Verdict:** **REVISE.** Most named technologies exist and fit. Three committed decisions rest on stale or incomplete facts: NestJS 12 has shipped, Prisma 7 needs config that the spine doesn't mention, and `pnpm deploy` on pnpm 11 needs a setting the spine leaves out. Several version pins are also behind current, and `typescript` and `prisma` now resolve to versions the spine forbids if they are installed unpinned.

## Registry snapshot (2026-10-17)

| Package / image | Spine says | Live `latest` | Relevant facts |
| --- | --- | --- | --- |
| `@nestjs/core` / `common` / `platform-socket.io` | 11.1.x | **12.1.3** (`legacy` tag = 11.2.7) | 12.0.0 published 2026-08-27; v12 packages are `"type":"module"` |
| `@nestjs/cli` | — | **12.0.8** (11 line = 11.0.24) | CLI 11 bundles TS 5.9.3; CLI 12 bundles TS ~6.0.2 |
| `nestjs-zod` | latest supporting zod ^4 | 5.5.0 (2026-07-25) | peer `@nestjs/common ^10 \|\| ^11`, `zod ^3.25 \|\| ^4` — **no Nest 12** |
| `@nestjs/throttler` | (unversioned) | 6.7.1 | peers allow Nest 7–12 |
| `zod` | 4.x | 4.6.7 | ok |
| `typescript` | 6.0 | **7.0.2** (6.x = 6.0.3) | unpinned install gets TS 7 |
| `typescript-eslint` | "10.x" | **8.71.2** | peer `typescript >=4.8.4 <6.1.0`, `eslint ^8.57 \|\| ^9 \|\| ^10` |
| `eslint` | 10.x | 10.13.0 | ok |
| `prettier` / `eslint-config-prettier` | 3.x / ≥10.1.8 | 3.9.10 / 10.1.8 | ok |
| `socket.io` / `socket.io-client` | 4.x | 4.8.4 | ok |
| `next` | 16.2.x | **16.4.2** | 16.x still current major |
| `react` | 19.x | 19.3.1 | ok |
| `prisma` | 7.x, not 8 | **`latest` = 8.0.0-rc.23** (`prev` = 7.10.1) | npm `latest` tag points at an RC |
| `@prisma/client` | 7.x | 7.10.1 | engines node `^20.19 \|\| ^22.12 \|\| >=24` |
| `@prisma/adapter-pg` | **not mentioned** | 7.10.1 | depends on `pg ^8.16.3` |
| `pnpm` | 11.x | **12.14.0** (`latest-11` = 11.28.6) | |
| `vitest` | latest at scaffold | 5.0.5 | engines node `^22.12 \|\| ^24 \|\| >=26`; peer vite 6–8 |
| `unplugin-swc` / `@swc/core` | latest at scaffold | 2.0.0 / 1.16.18 | ok |
| `@playwright/test` | 1.62.x | **1.64.1** | |
| `argon2` | not named ("argon2id") | 0.45.1 | N-API + node-gyp-build prebuilds, engines `>=16.17`: fine on Node 24 |
| `node` image | 24 LTS | `lts` = krypton = 24.22.0 | 26.12 is `current` |
| `postgres` image | 18 | 18.6 (19rc1 exists) | **PG18 image changed its data dir** |
| `redis` image | 8.x | 8.10.2 (memlog: 8.10.1) | ok |
| `caddy` image | 2.11 | 2.11.7 | ok |

## Findings

### F1 — HIGH — NestJS 12 has shipped; the "11.1.x" pin is based on a stale memlog entry

The memlog says "v12 ESM/Vitest drafted for Q3 2026, unconfirmed shipped". The registry shows `@nestjs/core@12.0.0` was published 2026-08-27 and `latest` is now 12.1.3. The 11 line is tagged `legacy` at **11.2.7**, so "11.1.x" is not even the current 11 minor. v12 packages ship as ESM (`"type":"module"`). They still load from CJS apps through `require(esm)`, and v12 adds built-in Standard Schema validation (Zod accepted on `@Body/@Query/@Param`).

Staying on 11 still holds up, because `nestjs-zod@5.5.0` declares peer `@nestjs/common ^10 || ^11` and does not cover 12. But the spine never records that reason. A build agent that runs `npx @nestjs/cli new` will also get CLI 12, whose new-project defaults (ESM, Vitest, oxlint, Rspack) conflict with AD-17's ESLint decision and AD-2's CJS shared build.

**Replace Stack row** `NestJS … | 11.1.x` with:
`NestJS (@nestjs/* incl. platform-socket.io; @nestjs/cli@11) | 11.2.x — npm tag "legacy"; not 12: nestjs-zod 5.5 peers only ^11. Scaffold with npx @nestjs/cli@11 new`
**Alternative, for the user to decide:** move to Nest 12.1.x, drop `nestjs-zod`, and use Nest 12's built-in Standard Schema validation. That changes AD-2's "global ZodValidationPipe" wording.

### F2 — HIGH — Prisma 7 needs config the spine omits: prisma.config.ts, a driver adapter, and a CJS generator

Per the official Prisma 7 upgrade guide and generator docs:
- **A driver adapter is required** for every DB. For Postgres: `@prisma/adapter-pg` + `pg`, with `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
- **`prisma.config.ts` is the CLI config.** `datasource.url` in `schema.prisma` is deprecated and moves to the config. The CLI **no longer auto-loads `.env`**, so the config must load env (for example `dotenv`) or the `migrate` one-shot container must receive `DATABASE_URL` in its environment.
- **Generator:** `provider = "prisma-client"` with a **required `output`** (no longer generated into `node_modules`). The guide's default examples assume ESM (`"type":"module"`, `moduleResolution: bundler`). For Nest 11 CJS, set **`moduleFormat = "cjs"`**.
- **npm `latest` for `prisma` is `8.0.0-rc.23`**, so `pnpm add -D prisma` with no version installs the RC. "Pin prisma@7" is correct and matters a lot. `^7` keeps you off 8.

**Replace Stack row** `Prisma ORM (prisma, @prisma/client) | 7.x — pin prisma@7, not 8` with:
`Prisma ORM (prisma, @prisma/client, @prisma/adapter-pg + pg) | ^7.10 (npm "latest" is 8 RC — never install unpinned); prisma.config.ts at apps/api (loads env), generator "prisma-client" output ../src/generated/prisma moduleFormat "cjs"`
Also add `prisma.config.ts` to the Structural Seed under `apps/api/`, and say in AD-15 that `migrate` gets `DATABASE_URL` from compose env.
Postgres 18 support: Prisma docs don't list a supported-version matrix. PG18 is the current GA major and `pg ^8.16` speaks its protocol, so I expect it to work. **Confirm with the first `migrate deploy` in compose (unconfirmed).**

### F3 — HIGH — `pnpm deploy` on pnpm 11 needs `injectWorkspacePackages: true` (or `--legacy`)

pnpm.io (10.x and 11.x docs): by default `pnpm deploy` only works in workspaces where `inject-workspace-packages=true`. Otherwise it refuses, unless you pass `--legacy` / `force-legacy-deploy`. Only **pnpm 12.2.0+** drops the requirement. AD-1 says "Production images are assembled with `pnpm deploy --filter <app>`" with no setting, so the first prod image build will fail.

The memlog also calls pnpm 12 "too fresh (reported Aug 2026)". The registry now has `latest` = 12.14.0. Staying on 11 is still a valid choice, but the reason given is stale.

**Replace in AD-1** `Production images are assembled with pnpm deploy --filter <app>.` with:
`Production images are assembled with pnpm deploy --filter <app> --prod <dir>; pnpm-workspace.yaml sets injectWorkspacePackages: true (required by pnpm 11 deploy).`
**Replace Stack row** `pnpm | 11.x` with `pnpm | 11.28.x (pinned via packageManager in root package.json; corepack in images)`.

### F4 — MEDIUM — TypeScript 6.0: unpinned install gets TS 7, the starter tsconfig hits TS 6 deprecations, and the typescript-eslint row is wrong

- `typescript` `latest` = **7.0.2**. TS 6 must be pinned or agents will install 7, which the memlog itself rules out.
- `typescript-eslint@8.71.2` peers `typescript <6.1.0`, so TS 6.0 is compatible. There is **no typescript-eslint 10.x**. The Stack row "ESLint + typescript-eslint | 10.x" is wrong for the second package.
- TS 6.0 changed defaults and deprecated options (secondary sources and release coverage): `baseUrl` is deprecated (the Nest 11 starter tsconfig sets `"baseUrl": "./"`), `moduleResolution node`/`node10` is deprecated, `types` now defaults to `[]` (Node and Vitest globals are no longer included implicitly), and `strict` defaults to true. Nest CLI 11 bundles TS 5.9.3 internally, so `nest build` with the `tsc` builder may compile with a different TS than `pnpm typecheck`. Use the SWC builder plus `tsc --noEmit` from the workspace TS 6 as the single type-check.

**Replace Stack row** `TypeScript | 6.0` with `TypeScript | ~6.0.3 (npm "latest" is 7 — pin; typescript-eslint 8.x supports <6.1)`.
**Replace Stack row** `ESLint + typescript-eslint | 10.x flat config` with `ESLint 10.x + typescript-eslint 8.x | flat config`.
Add one line to AD-17: `tsconfigs set "types" explicitly (node, vitest/globals as needed) and do not use baseUrl.`

### F5 — MEDIUM — PostgreSQL 18 image moved its data directory; the usual compose volume path breaks

The official `postgres:18` image changed PGDATA to a versioned subdirectory (`/var/lib/postgresql/18/docker`), and `/var/lib/postgresql/data` is now a symlink. Mounting a volume at the old `/var/lib/postgresql/data` path fails at start (docker-library/postgres#1370). Agents copying familiar compose snippets will hit this on build step 1.

**Add to AD-15:** `postgres / postgres-test use image postgres:18.6 with the named volume mounted at /var/lib/postgresql (PG18 image layout), not /var/lib/postgresql/data.`

### F6 — LOW — Several pins are behind current, and "latest at scaffold" leaves the major version unpinned

| Row | Replace with |
| --- | --- |
| Next.js `16.2.x` | `16.4.x` |
| React `19.x` | `19.3.x` |
| Playwright `1.62.x` | `1.64.x` (`@playwright/test`, image `mcr.microsoft.com/playwright:v1.64.x` to match) |
| Vitest + unplugin-swc `latest at scaffold` | `Vitest 5.0.x + unplugin-swc 2.x + @swc/core 1.16.x` (Vitest 5 engines need Node 22.12+/24: ok) |
| nestjs-zod `latest supporting zod ^4` | `5.5.x (peers zod ^4, Nest ^11)` |
| Socket.IO `4.x` | `4.8.x (server + client in lockstep)` |
| `@nestjs/throttler` (no version) | `6.7.x` |
| Redis `8.x` | `8.10 (image redis:8.10.2-alpine)` |
| Caddy `2.11` | `2.11 (image caddy:2.11.7-alpine)` |
| PostgreSQL `18` | `18 (image postgres:18.6-alpine)` |
| (missing) password hashing | add row `argon2 | 0.45.x (argon2id; N-API prebuilds incl. musl)` |

## Confirmed / no change needed

- **Node 24 LTS:** `node:lts` still resolves to 24 (krypton, 24.22.0). Every package checked accepts Node 24.
- **Zod 4.x + nestjs-zod:** 5.5.0 peers `zod ^4`. The global `ZodValidationPipe` / `APP_PIPE` approach applies on Nest 11.
- **Socket.IO 4.8.4** is current. `@nestjs/platform-socket.io@11` pairs with socket.io 4.
- **@nestjs/throttler 6.7.1** peers cover Nest 11 and 12.
- **Next.js 16 + CJS workspace package:** shared builds to CJS + `.d.ts` in `dist/` and is consumed as a normal dependency. Next and Turbopack handle CJS packages from `node_modules`, so `transpilePackages` isn't needed. Note for scaffold (not verified live): for `output: 'standalone'` in a monorepo, set `outputFileTracingRoot` to the repo root.
- **eslint-config-prettier 10.1.8** is still the latest release and matches the ≥10.1.8 supply-chain floor.
- **Caddy 2.11 / Redis 8.x / Postgres 18** tags exist on Docker Hub. PG 19 is still rc1, so the memlog's call to avoid it holds.
- **argon2 on Node 24:** N-API with prebuilt binaries. No ABI coupling to the Node major.

## Sources

- npm registry (`npm view`), 2026-10-17: versions, dist-tags, peerDependencies, engines for all packages above
- Docker Hub tag API: `library/postgres`, `library/redis`, `library/caddy`, `library/node`
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Prisma generators (prisma-client options, moduleFormat)](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)
- [pnpm deploy](https://pnpm.io/cli/deploy)
- [NestJS v12.0.0 release](https://newreleases.io/project/github/nestjs/nest/release/v12.0.0), [InfoQ: NestJS 12 roadmap](https://infoq.com/news/2026/04/nestjs-12-roadmap-esm)
- [TypeScript 6.0 ships (Visual Studio Magazine)](https://www.visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx), [What's new in TS 6.0 (OpenReplay)](https://blog.openreplay.com/whats-new-typescript-6-0/)
- [docker-library/postgres#1370](https://github.com/docker-library/postgres/issues/1370), [PG18 Docker migration notes](https://nite07.com/en/posts/postgres-docker-18-migration/)
