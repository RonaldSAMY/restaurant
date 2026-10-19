# Sprint Change Proposal — Endpoint sub-paths in `ApiRoutes`

- **Date:** 2026-10-19
- **Trigger:** Ronald, after Story 3.2 (`f3b9f29`): sub-path strings such as `@Get('by-reference/:reference')` are typed by hand on both api and web, so a mismatch is easy to miss.
- **Scope:** Moderate — one story added to the end of Epic 3, plus planning-doc edits. No code changes in this proposal.
- **Mode:** Batch
- **Status:** Approved and applied 2026-10-19 (sections 4.1–4.4); D1 = tests keep literal paths

## 1. Issue Summary

AD-2 / AD-19 put the `/api/v1` prefix and each **resource** path (`orders`, `auth`, `kitchen/orders`, …) in `packages/shared/src/api-routes.ts`. The **sub-paths** below the resource were never moved there, so each side types its own copy:

| Endpoint | api (decorator) | web |
| --- | --- | --- |
| `GET orders/current` | `orders.controller.ts:77` `@Get('current')` | `lib/api.ts:72` `` `${apiPath(ApiRoutes.orders)}/current` `` |
| `GET orders/by-reference/:reference` | `orders.controller.ts:92` | `lib/api.ts:80` hand-built + `encodeURIComponent` |
| `PATCH kitchen/orders/:id/status` | `kitchen.controller.ts:37` | not yet called (Story 3.3) |
| `POST auth/login`, `refresh`, `logout`, `GET auth/me` | `auth.controller.ts:70,85,100,116` | not yet called (Story 3.3) |
| `refresh_token` cookie `Path=/api/v1/auth` | auth cookie options | — |

Renaming one side still compiles. The break only shows up at runtime.

## 2. Impact Analysis

- **Epic 3:** add Story 3.6 at the end, after 3.5. Stories 3.3–3.5 keep today's pattern, under the interim rule in 4.3. Stories 3.1 and 3.2 are already done and get changed by 3.6.
- **Epics 1–2:** no story changes. Their code (`orders.controller.ts`, `lib/api.ts`) is swept by 3.6.
- **PRD:** no change. This is an internal contract change; no requirement moves.
- **Architecture:** AD-2 and AD-19 change wording from "each resource path" to "every endpoint path, as a template".
- **UX:** none.
- **Tests:** unchanged by default; see decision D1.
- **Infra:** Caddyfile and the compose healthcheck keep their literals (AD-19 already says so).

## 3. Recommended Approach

**Direct adjustment.** Add Story 3.6 as the last story of Epic 3, so the sweep covers everything 3.3–3.5 add. Until then, an interim rule keeps every hand-typed sub-path in two known places. That keeps the 3.6 sweep bounded, and nothing new drifts in the meantime.

- **Effort:** low. Mechanical, about 10 call sites plus the `apiPath` change.
- **Risk:** low. Integration and e2e tests catch any wrong path.
- **Timeline:** +1 small story at the end of Epic 3. Stories 3.3–3.5 are not delayed.

### Decision D1 — should tests use the constants? (default: no)

When someone changes a constant, the api and web change together, so they never disagree with each other. Anything **outside** the TypeScript build does not change with them:
- the Caddyfile and the compose healthcheck
- the e2e tests' `page.goto` and `request` calls, if typed by hand
- bookmarks, curl scripts and any already-deployed browser tab

If tests also read the constants, a typo such as `kitchen/order` would pass every test, and only those outside callers would break. Literal paths in tests are the one place that says "the public URL is still `/api/v1/kitchen/orders`". A rename then needs a deliberate test edit.

**Default in this proposal:** AD-19's exception stays, and tests keep literal paths. If you'd rather tests use the constants too, say so: AD-19's last sentence then becomes "only the compose healthcheck and the Caddyfile keep literals", and the Story 3.6 test AC flips.

## 4. Detailed Change Proposals

### 4.1 Epics (`epics.md`)

**New Story 3.6** (append after Story 3.5):

```markdown
### Story 3.6: Endpoint sub-paths in shared `ApiRoutes`

As the Builder,
I want every endpoint path, sub-paths included, defined once in `packages/shared`,
So that api and web cannot drift apart on a URL.

**Implements:** AD-2, AD-19

**Acceptance Criteria:**

**Given** `packages/shared/src/api-routes.ts`
**When** it builds
**Then** `ApiRoutes` holds every endpoint as a full template relative to `API_PREFIX` (e.g. `orders/current`, `orders/by-reference/:reference`, `kitchen/orders/:id/status`, `auth/login`, `auth/refresh`, `auth/logout`, `auth/me`)
**And** `apiPath(route, params)` replaces each `:name` with `encodeURIComponent(params.name)`, typed so a missing or extra param is a compile error.

**Given** the Nest controllers
**When** routes are declared
**Then** every `@Controller`/`@Get`/`@Post`/`@Patch` path comes from `ApiRoutes`, with no path string literal left in `apps/api/src`
**And** the `refresh_token` cookie `Path` is derived from `API_PREFIX` + `ApiRoutes`.

**Given** `apps/web`
**When** it calls the api
**Then** every URL comes from `apiPath(...)`, with no hand-built sub-path or `encodeURIComponent` on a path segment left.

**Given** the existing unit, integration and e2e tests
**When** they run unchanged, with their literal `/api/v1/...` paths
**Then** all pass, proving every public URL is the same as before
**And** `api-routes.spec.ts` covers `apiPath` substitution, encoding (`ab 1/` → `ab%201%2F`) and the no-param case.
```

**Epic 3 summary** (line 461): append `Ends with Story 3.6, which moves every endpoint sub-path into shared \`ApiRoutes\`.`

### 4.2 Architecture spine (`ARCHITECTURE-SPINE.md`)

**AD-2 Rule** (line 72)
- OLD: `The api prefix and endpoint paths live once in \`packages/shared/src/api-routes.ts\` (\`API_PREFIX\`, \`ApiRoutes\`, \`apiPath\`), matching AD-19 (amended 2026-10-19).`
- NEW: `The api prefix and every endpoint path, sub-paths and \`:params\` included, live once in \`packages/shared/src/api-routes.ts\` (\`API_PREFIX\`, \`ApiRoutes\` templates, \`apiPath(route, params)\`), matching AD-19 (amended 2026-10-19; full templates from Story 3.6).`

**AD-19 Paths** (line 247)
- OLD: `the \`/api/v1\` prefix and each resource path are defined once in \`packages/shared/src/api-routes.ts\`; the api and web read them from there.`
- NEW: `the \`/api/v1\` prefix and every endpoint path (full template, e.g. \`orders/by-reference/:reference\`) are defined once in \`packages/shared/src/api-routes.ts\`; the api and web read them from there, and \`apiPath\` encodes params. Until Story 3.6 lands, sub-paths are still typed in controller decorators and \`apps/web/lib/api.ts\`.`
- The final sentence ("The compose api healthcheck URL and the tests keep literal `/api/v1` paths on purpose.") stays, per D1.

### 4.3 Epic context (`implementation-artifacts/epic-3-context.md`)

**Stories list:** add `3.6 Endpoint sub-paths in shared ApiRoutes (last; sweeps 3.1–3.5)`.

**Endpoints bullet** (line 35): `(paths from \`api-routes.ts\`; …)` → `(resource paths from \`api-routes.ts\`; sub-paths move there in Story 3.6; …)`.

**Cross-Story Dependencies:** add this note:

> **Interim path rule (until Story 3.6).** Stories 3.3–3.5 take resource paths from `ApiRoutes` as today. Any sub-path is typed in exactly two places: the Nest decorator, and `apps/web/lib/api.ts` (web never builds an api URL anywhere else). Realtime keeps `/api/socket.io` where AD-10 puts it. Each story spec lists the sub-paths it adds, so Story 3.6 has a complete inventory. No story in between adds a new path helper or changes `apiPath`.

### 4.4 Sprint status (`sprint-status.yaml`)

Add `3-6-endpoint-sub-paths-in-shared-api-routes: backlog` after `3-5-end-to-end-demo-tests`.

### 4.5 PRD / UX

No change.

## 5. Implementation Handoff

- **Scope:** Moderate → Developer agent applies 4.1–4.4 verbatim now. Story 3.6 is built via `bmad-build` after 3.5.
- **Success criteria (for this proposal):**
  - `epics.md` has Story 3.6, and `sprint-status.yaml` lists it as `backlog` after 3.5.
  - AD-2 / AD-19 say "every endpoint path"; the tests-keep-literals sentence matches D1.
  - `epic-3-context.md` carries the interim path rule.
- **Success criteria (for Story 3.6, later):** `grep -rnE "@(Get|Post|Patch|Put|Delete|Controller)\('" apps/api/src` returns nothing; `apps/web` has no `` `${apiPath(`` concatenation; every existing test passes unchanged.
