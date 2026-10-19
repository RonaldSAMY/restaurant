---
title: 'Centralise api route paths in @restaurant/shared'
type: 'refactor'
created: '2026-10-19'
status: 'done'
baseline_commit: 'b3bb522b805dc341bd84f61c249670a23317d228'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The api version prefix and endpoint paths are typed out in several places (`setGlobalPrefix('api/v1')`, `@Controller('menu')`, and web's hardcoded `/api/v1/menu`). Changing v1→v2, or renaming an endpoint, means hunting down every copy, and the copies can drift.

**Approach:** Add one file, `packages/shared/src/api-routes.ts`, that holds the version prefix and each endpoint path, plus a helper that builds a root-relative path. The api's global prefix and controllers, and web's fetch URL, all read from it. Changing the version is then a one-line edit in that file. Decided 2026-10-19 by the human: this overrides the architecture rule "no route constants in `packages/shared`", and the architecture spine is amended in the same change.

## Boundaries & Constraints

**Always:**
- Keep current behaviour identical: the same URLs (`/api/v1/health`, `/api/v1/menu`) and the same responses.
- Tests keep literal URL strings (`'/api/v1/menu'`, `'http://api:3000/api/v1/menu'`), so an accidental version change fails a test instead of passing silently.
- Every new symbol gets TSDoc.
- Re-export the new file from `packages/shared/src/index.ts`.

**Never:**
- No constants for endpoints that do not exist yet (orders, auth, kitchen). Their stories add them.
- No api versioning framework (Nest `enableVersioning`).
- No change to the Caddyfile routing.
- No new dependency.

</frozen-after-approval>

## Code Map

- `packages/shared/src/api-routes.ts` -- new; the single home for the prefix and paths.
- `packages/shared/src/index.ts` -- add `export * from './api-routes';`.
- `apps/api/src/configure-app.ts:8` -- `setGlobalPrefix('api/v1')` → `setGlobalPrefix(API_PREFIX)`; update the TSDoc that mentions `/api/v1`.
- `apps/api/src/main.ts:7` -- the TSDoc mentions the `/api/v1` prefix; make it refer to `API_PREFIX`.
- `apps/api/src/health/health.controller.ts:5`, `apps/api/src/menu/menu.controller.ts:7` -- `@Controller('health'|'menu')` → `ApiRoutes.health`/`ApiRoutes.menu`.
- `apps/web/lib/menu.ts:28` -- `` `${parseEnv().API_INTERNAL_URL}/api/v1/menu` `` → `` `${...API_INTERNAL_URL}${apiPath(ApiRoutes.menu)}` ``.
- `compose.yaml:60-67` -- the healthcheck URL is shell, so it cannot import TS. Keep it literal and add a YAML comment: keep in sync with `API_PREFIX` in `packages/shared/src/api-routes.ts`.
- `_bmad-output/planning-artifacts/architecture/architecture-restuarent-2026-10-17/ARCHITECTURE-SPINE.md:71` -- replace "**no** route constants (routes are fixed by AD-19)" with: the api prefix and endpoint paths live once in `api-routes.ts`, matching AD-19. Add one line under AD-19 (line ~245) saying the paths are defined in `api-routes.ts`.
- **Runtime import (first one):** this is the api's first runtime value import from `@restaurant/shared`; until now it imported only types. In prod, `pnpm --filter api... build` builds shared first and `pnpm deploy` ships its `dist` (`apps/api/Dockerfile`). In dev, the shared `tsc -w` writes `dist`. Verify both via `docker compose build` and the int tests.
- **Leave as is:**
  - `apps/api/test/*.int-spec.ts`, `apps/web/lib/menu.spec.ts`: literal URLs stay.
  - The `Caddyfile` comment.
  - The `/api/v1/menu` mention in the `packages/shared/src/menu.ts` doc.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/api-routes.ts`, `packages/shared/src/index.ts` -- add `API_PREFIX = 'api/v1'`, `ApiRoutes = { health: 'health', menu: 'menu' } as const` and `apiPath(route)` returning `` `/${API_PREFIX}/${route}` ``, then re-export them -- the one place to change.
- [x] `apps/api/src/configure-app.ts`, `apps/api/src/main.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/menu/menu.controller.ts` -- read the prefix and paths from shared -- the api owns no literals.
- [x] `apps/web/lib/menu.ts` -- build the URL with `apiPath(ApiRoutes.menu)` -- web owns no literals.
- [x] `compose.yaml` -- add the keep-in-sync comment above the api healthcheck -- the one place that cannot import.
- [x] `ARCHITECTURE-SPINE.md` -- amend line 71 and add the note under AD-19 -- record the decision.

**Acceptance Criteria:**
- Given the change, when `grep -rn "api/v1" apps/*/src apps/web/lib apps/web/app --include=*.ts --include=*.tsx` runs (spec files excluded), then it finds no route strings, only doc comments if any.
- Given the existing api int tests and web unit tests, when they run with their literal URLs unchanged, then all pass.
- Given `API_PREFIX` is temporarily changed to `'api/v2'`, when the tests run, then the literal-URL tests fail (shows the one-line switch works). Revert afterwards and do not commit it.
- Given the full gate (`lint`, `format:check`, `typecheck`, `test`, `test:int`, `docker compose build`), when it runs, then every step passes with zero warnings.

## Design Notes

```ts
/** Prefix the api mounts every route under. Change the version here. */
export const API_PREFIX = 'api/v1';
/** Endpoint paths relative to {@link API_PREFIX}. */
export const ApiRoutes = { health: 'health', menu: 'menu' } as const;
/** Root-relative URL path for an endpoint, e.g. `/api/v1/menu`. */
export type ApiRoute = (typeof ApiRoutes)[keyof typeof ApiRoutes];
export function apiPath(route: ApiRoute): string { ... }
```

- Later stories add their resources here, e.g. `orders: 'orders'`, and their sub-paths stay in the controllers.
- Story 3.1 adds `auth: 'auth'` to `ApiRoutes` and sets the refresh cookie's `Path` to `apiPath(ApiRoutes.auth)`; `apiPath` only accepts `ApiRoutes` values.

## Verification

**Commands:**
- `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:int` -- expected: pass, zero warnings.
- `docker compose up -d --build && curl -sk https://localhost/api/v1/health && curl -sk https://localhost/ | grep -o '<h2' | wc -l` -- expected: `{"ok":true}` and ≥ 2.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | `apiPath(route: string)` accepts any string (typo, leading `/`, empty) | low | reject | No current caller passes a bad value; a typo'd route would fail the literal-URL tests (int specs, `menu.spec.ts`); narrowing deviates from the spec's chosen signature. |
| 2 | blind, edge, verif | compose healthcheck URL synced only by comment | low | reject | Spec Code Map chose literal + comment; drift fails loudly (api unhealthy, stack stops) and only on a version bump; a compose-parsing test adds machinery. |
| 3 | blind | `API_PREFIX` TSDoc doesn't warn the `api` segment is tied to Caddy `/api/*` | low | patch | Caddyfile:10 `handle /api/*`; renaming the segment would silently unroute the api. |
| 4 | blind | AD-2 rule sentence grafts positive clause onto prohibitions list | low | patch | Spine AD-2 reads "holds no ..., no ..., and the api prefix ... live once". |
| 5 | blind | AD-19 Paths line overstates centralisation (compose, tests literal) | low | patch | compose.yaml healthcheck and int/unit specs keep `/api/v1` deliberately. |
| 6 | blind | Spine amendment lacks date | low | patch | Reversal of an earlier rule; folded into fix 4 as "(amended 2026-10-19)". |
| 7 | blind | `API_PREFIX` vs `ApiRoutes` casing inconsistent | false | reject | Names are fixed by the spec's tasks; no caller or rule is harmed. |
| 8 | blind | `apiPath` has no direct test | false | reject | `menu.spec.ts:58,96` asserts `http://api:3000/api/v1/menu` built via `apiPath`; int specs pin `/api/v1/*`. |
| 9 | blind | main.ts and configure-app.ts reference prefix in different doc forms | false | reject | main.ts does not import `API_PREFIX`, so `{@link}` would not resolve there; backticks are correct. |
| 10 | edge | epics.md:202 still says shared holds no route constants | medium | patch | Line 202 contradicts amended AD-2; future story agents read epics. |
| 11 | verif | CI never loads a prod-image module that imports `@restaurant/shared` | medium | patch | ci.yml:35 requires only prisma/redis modules; first runtime value import from shared added here. |
