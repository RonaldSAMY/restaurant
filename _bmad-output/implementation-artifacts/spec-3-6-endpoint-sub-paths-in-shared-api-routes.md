---
title: 'Story 3.6: Endpoint sub-paths in shared ApiRoutes'
type: 'refactor'
created: '2026-10-19'
status: 'done'
baseline_commit: '308813cc19ef021028daf5177d4b4570eba771d6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Endpoint sub-paths (`current`, `by-reference/:reference`, `:id/status`, `login`, ...) are typed twice, once in a Nest decorator and once in `apps/web/lib/api.ts`, so api and web can drift on a URL.

**Approach:** Make `ApiRoutes` hold every endpoint as a full template relative to `API_PREFIX`, give `apiPath(route, params)` typed `:param` substitution, and have every controller and every web call use them.

## Boundaries & Constraints

**Always:**
- `ApiRoutes` (in `packages/shared/src/api-routes.ts`) lists every endpoint: `health`, `menu`, `orders`, `orders/current`, `orders/by-reference/:reference`, `auth/login`, `auth/refresh`, `auth/logout`, `auth/me`, `kitchen/orders`, `kitchen/orders/:id/status`.
- `apiPath(route, params?)` returns `/${API_PREFIX}/${route}` with each `:name` replaced by `encodeURIComponent(params.name)`. Types are derived from the template: no params arg for param-less routes, a required object with exactly the template's keys otherwise; missing or extra keys fail `tsc`.
- Controllers declare `@Controller()` with no path; each handler's `@Get/@Post/@Patch` takes its `ApiRoutes` entry. No path string literal remains in an `apps/api/src` decorator.
- The `refresh_token` cookie `Path` stays `/api/v1/auth`, derived from `API_PREFIX` + `ApiRoutes` (parent of `apiPath(ApiRoutes.authRefresh)`), not typed out.
- Web builds every api URL via `apiPath(...)`; no template-concatenated sub-path and no `encodeURIComponent` on a path segment remain in `apps/web`.
- Every public URL is unchanged: existing unit, integration and e2e tests pass without edits.

**Never:** No edits to existing tests, the Caddyfile, the compose healthcheck, or `SOCKET_PATH`. No route behaviour, guard, throttle or response change. No path-building helper outside `packages/shared`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No-param route | `apiPath(ApiRoutes.menu)` | `/api/v1/menu` | N/A |
| Param route | `apiPath(ApiRoutes.kitchenOrderStatus, { id: 'x' })` | `/api/v1/kitchen/orders/x/status` | N/A |
| Encoding | `apiPath(ApiRoutes.ordersByReference, { reference: 'ab 1/' })` | `/api/v1/orders/by-reference/ab%201%2F` | N/A |
| Missing param | `apiPath(ApiRoutes.kitchenOrderStatus)` or `{}` | does not compile | `@ts-expect-error` in spec |
| Extra param | `{ id: 'x', foo: 'y' }`, or any object on a no-param route | does not compile | `@ts-expect-error` in spec |

</frozen-after-approval>

## Code Map

- `packages/shared/src/api-routes.ts` -- `API_PREFIX`, `ApiRoutes` (scope-level today: `orders`, `auth`, `kitchenOrders`), `ApiRoute`, one-arg `apiPath`. Rewrite here.
- `packages/shared/src/api-routes.spec.ts` -- new. Shared has vitest (`pnpm --filter @restaurant/shared test`) but no specs yet; keep the spec in `src/` so `tsc` (typecheck) verifies the `@ts-expect-error` lines. Root `pnpm test` does not run shared.
- `apps/api/src/orders/orders.controller.ts:45,55,77,92` -- `@Controller(ApiRoutes.orders)`, `@Post()`, `@Get('current')`, `@Get('by-reference/:reference')`.
- `apps/api/src/orders/kitchen.controller.ts:23,30,37` -- `@Controller(ApiRoutes.kitchenOrders)`, `@Get()`, `@Patch(':id/status')`.
- `apps/api/src/auth/auth.controller.ts:46,63,70,85,100,116` -- `REFRESH_OPTS.path = apiPath(ApiRoutes.auth)`, `@Controller(ApiRoutes.auth)`, `login`/`refresh`/`logout`/`me`. `@Param` names (`id`, `reference`) must match the template.
- `apps/api/src/health/health.controller.ts:6,10`, `apps/api/src/menu/menu.controller.ts:7,14` -- move path to the method decorator.
- `apps/web/lib/api.ts:69-165` -- seven hand-built URLs (`${apiPath(...)}/current`, `encodeURIComponent(reference)`, `encodeURIComponent(id)`, auth sub-paths). Doc comments mention `/api/v1/...`; leave them.
- `apps/web/lib/menu.ts:33` -- `apiPath(ApiRoutes.menu)`; still valid, only the key may stay `menu`.
- Do not touch: `apps/web/lib/api.spec.ts`, `apps/web/lib/menu.spec.ts`, `apps/api/test/*` (literal paths prove URLs did not move; `auth.int-spec.ts:57` asserts `Path=/api/v1/auth`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/api-routes.ts` -- full-template `ApiRoutes`, typed `apiPath` -- single source for every URL.
- [x] `packages/shared/src/api-routes.spec.ts` -- matrix rows (runtime + `@ts-expect-error`) -- pins substitution, encoding, typing.
- [x] `apps/api/src/{health,menu,orders,auth}/*.controller.ts`, `orders/kitchen.controller.ts` -- `@Controller()` + `ApiRoutes` on each method; refresh cookie path derived -- no literal paths in api.
- [x] `apps/web/lib/api.ts`, `apps/web/lib/menu.ts` -- every URL via `apiPath` -- no hand-built sub-paths.

**Acceptance Criteria:**
- Given the change, when `grep -rnE "@(Controller|Get|Post|Patch)\('" apps/api/src` runs, then it finds nothing; and `grep -n "encodeURIComponent\|apiPath([^)]*)}/" apps/web/lib apps/web/app` finds nothing.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test`, the shared spec and `pnpm test:int`, when run with tests unchanged, then all pass.

## Design Notes

Param typing from the template, no runtime schema:

```ts
type Params<R> = R extends `${string}:${infer P}/${infer Rest}` ? P | Params<Rest>
  : R extends `${string}:${infer P}` ? P : never;
export function apiPath<R extends ApiRoute>(
  route: R, ...params: [Params<R>] extends [never] ? [] : [Record<Params<R>, string>]
): string
```

Excess-property checks on the object literal reject extra keys. Keys like `ordersCurrent`, `authRefresh`, `kitchenOrderStatus` are implementer's choice.

## Verification

**Commands:**
- `pnpm --filter @restaurant/shared build && pnpm --filter @restaurant/shared test` -- expected: pass
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: exit 0
- `pnpm test:int` -- expected: green, no test file changed (`git diff --stat -- '*spec*' apps/api/test` shows only the new shared spec)

## Implementation Notes

- Added `packages/shared/tsconfig.build.json` (excludes `*.spec.ts`) for `build`/`dev`: otherwise the spec compiled into `dist/` and vitest ran it twice and failed. `typecheck` keeps `tsconfig.json`, so the `@ts-expect-error` lines stay checked.
- Root `pnpm test` does run shared (compose's api filter includes it). Rebuild a local `packages/shared/dist` built before this change to drop a stale `dist/api-routes.spec.js`.
- Refresh cookie path: `posix.dirname(apiPath(ApiRoutes.authRefresh))` → `/api/v1/auth`.
- Verified: both grep ACs empty; lint, typecheck, `pnpm test` (shared 4, api 54, web 88), `pnpm test:int` (138) green; no existing test changed. E2e not run.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | blind | Refresh cookie path via `posix.dirname(authRefresh)` can drift if the route moves | low | Frozen intent mandates "parent of `apiPath(ApiRoutes.authRefresh)`"; `auth.int-spec.ts:57` pins `Path=/api/v1/auth`; fix edits the spec | rejected |
| 2 | blind, edge | `apiPath` emits `undefined` / empty segment for a missing or empty param at runtime | low | Types forbid a missing key at every caller; `''` produced the same `//` URL before this change (pre-existing). Fix adds guards | rejected (low, adds guards) |
| 3 | blind, edge | `Params<R>` type ends a name at `/`, runtime regex at non-`\w` | low | No current template differs, but it's a one-token direct correction (`/:([^/]+)/g`) | patch (fixed) |
| 4 | blind | Spec lacks two-param, well-formedness and `@Param`-name coverage | low | No two-param route exists; a renamed `:id` breaks the int suite that hits the route | rejected |
| 5 | blind | `ApiRoutes` repeats prefixes instead of composing | low | Frozen intent lists full templates; no named harm beyond duplication inside one 15-line object | rejected |
| 6 | blind | `@Controller()` loses per-controller grouping | low | Bare `@Controller()` is mandated by the frozen intent; fix edits the spec | rejected |
| 7 | blind | No clean step before shared build; stale `dist/*.spec.js` could ship | low | Reviewer confirmed current `dist/` has none; Docker builds start clean; noted in Implementation Notes | rejected |
| 8 | blind | Compile-time test passes vacuously under vitest | false | `.github/workflows/ci.yml:27` runs `pnpm typecheck`, which uses `tsconfig.json` including the spec | rejected |
| 9 | blind | Doc comments still hard-code `/api/v1/...` | low | Code Map says leave them; comments, not a URL source | rejected |
| 10 | edge | Stale shared dist missing new keys → `@Post(undefined)` mounts at prefix root | low | Consumers fail `tsc` against a stale `.d.ts`; Docker and dev watch rebuild shared; per-key guard adds complexity | rejected |
