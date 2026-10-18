---
title: 'Story 1.5: Public Menu page'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: '10b537a9f70e2eeb54db0214d3472f6290afd5d8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/` is a placeholder ("The Menu is coming soon"); guests cannot see the Menu that `GET /api/v1/menu` already serves.

**Approach:** Make `apps/web/app/page.tsx` a dynamic server component that fetches `${API_INTERNAL_URL}/api/v1/menu` per request, parses it with `MenuResponseSchema`, and renders category headings with each item's name, description and price (formatted from cents at render). Any fetch/HTTP/parse failure renders a friendly "Menu unavailable" state. Plain CSS keeps it usable at 375 px.

## Boundaries & Constraints

**Always:** `export const dynamic = 'force-dynamic'`; `API_INTERNAL_URL` read via `parseEnv()` from `lib/env.ts` (the page is its only server-side consumer); fetch with `cache: 'no-store'`; parse with `MenuResponseSchema` from `@restaurant/shared`; prices stay integer cents until one `formatPrice(cents)` call at render; `next build` needs no api and no secrets; TSDoc on all new code; unit tests run in the existing `web-unit` container. Currency (decided 2026-10-18): EUR, formatted with a hardcoded `Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })` (e.g. `€6.50`).

**Never:** No basket/ordering UI (2.4), no client components or browser-side fetching, no CSS framework or new dependency, no api changes, no caching in web.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Menu loads | api 200, valid body, ≥ 2 categories | one `<h2>` per category in api order; each item shows name, description, formatted price | N/A |
| Empty Menu | api 200 `{categories: []}` | short "No dishes on the Menu yet" message, no crash | N/A |
| api unreachable | fetch rejects (DNS/connection refused) | "Menu unavailable" state, page status 200 | caught in `fetchMenu`, logged with `console.error` |
| api error | api 5xx / non-2xx with error envelope | "Menu unavailable" state | caught, logged |
| Bad shape | 200 but body fails `MenuResponseSchema` | "Menu unavailable" state | caught, logged |

</frozen-after-approval>

## Code Map

- `apps/web/app/page.tsx` -- placeholder; replace entirely.
- `apps/web/app/layout.tsx` -- root shell; import the new `globals.css` here.
- `apps/web/lib/env.ts` -- `parseEnv()` returns `{ API_INTERNAL_URL }`; reuse, do not duplicate env parsing.
- `apps/web/lib/env.spec.ts` -- test style to copy (`vi.stubEnv`, `vi.spyOn`, `afterEach` restore).
- `apps/web/instrumentation.ts` -- validates env at server start; leave as is.
- `packages/shared/src/menu.ts` -- `MenuResponseSchema`, `MenuResponse`, `MenuItem` types; import from `@restaurant/shared`.
- `compose.yaml` `web` -- already sets `API_INTERNAL_URL: http://api:3000`; no change.
- `compose.test.yaml` `web-unit` -- builds shared then `pnpm --filter web test`; picks up new `*.spec.ts` with no config.
- `eslint.config.mjs` -- requires TSDoc on every function/const (incl. non-exported) and Next core-web-vitals rules for web.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/lib/menu.ts` -- `fetchMenu(): Promise<MenuResponse | null>` (fetch `${parseEnv().API_INTERNAL_URL}/api/v1/menu`, `no-store`, non-OK/throw/parse failure → log + `null`) and `formatPrice(cents: number): string` (module-level `Intl.NumberFormat`, `cents / 100`) -- keeps the page thin and testable.
- [x] `apps/web/lib/menu.spec.ts` -- unit tests: each matrix row via `vi.stubGlobal('fetch', …)` + `vi.stubEnv('API_INTERNAL_URL', …)`, asserting the requested URL; `formatPrice` for 0, 650, 1999.
- [x] `apps/web/app/page.tsx` -- `force-dynamic` async server component: `null` → unavailable section; empty → empty message; else `<section>` per category with `<h2>` and a `<ul>` of items (name + price row, description below).
- [x] `apps/web/app/globals.css`, `apps/web/app/layout.tsx` -- system font, `max-width` centered column with 16 px side padding, `overflow-wrap: anywhere` on text, box-sizing border-box; import in layout.

**Acceptance Criteria:**
- Given `docker compose up -d --build`, when `https://localhost/` is opened, then the seeded Menu shows under Starters/Mains/… headings with formatted prices.
- Given the stack with `api` stopped, when `/` is loaded, then "Menu unavailable" shows and the web container keeps running.
- Given a 375 px viewport, when the page is viewed, then `document.documentElement.scrollWidth <= 375` (no horizontal scroll).
- Given the full gate (`lint`, `format:check`, `typecheck`, `test`, `docker compose build`), when it runs, then every step passes with zero warnings.

## Design Notes

- Category/item order comes from the api (alphabetical, Story 1.4 decision); the page does not re-sort.
- `fetchMenu` returns `null` instead of throwing so the page never hits Next's error boundary; no `error.tsx` needed.
- Errors are logged with `console.error` (web has no Nest `Logger`); log the status or error message only.

## Verification

**Commands:**
- `pnpm lint && pnpm format:check && pnpm typecheck` -- expected: pass, zero warnings.
- `pnpm test` -- expected: exit 0, `menu.spec.ts` included.
- `docker compose up -d --build && curl -sk https://localhost/ | grep -c '<h2'` -- expected: ≥ 2.

**Manual checks:**
- Browser at 375 px: no horizontal scroll; `docker compose stop api` then reload → "Menu unavailable".

## Implementation Notes

## Spec Change Log

- 2026-10-18 review iteration 0: human decided (fetch-timeout finding) that `fetchMenu` aborts after 5 s via `AbortSignal.timeout(5000)`; a timeout counts as a fetch failure and renders "Menu unavailable". Applied as a patch; no revert.

## Review Triage Log

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Price span can wrap mid-number at 375 px (blind, edge) | medium | `overflow-wrap: anywhere` on all spans lowers the price's min-content width, and it has no `flex-shrink: 0`/`nowrap` | patch |
| 2 | No fetch timeout; a hung api stalls render (blind, edge) | medium | No `signal`; undici's default headersTimeout is about 300 s. Human chose a 5 s timeout | patch (human-resolved) |
| 3 | Connection-error log drops `err.cause` (blind) | low | The implementer's own run logged only "Menu fetch failed: fetch failed"; undici puts ECONNREFUSED in `cause` | patch |
| 4 | Page render branches untested (verification-gap) | medium | Pre-verified gap; nothing renders `HomePage`, so swapped branches or raw prices would pass CI | patch |
| 5 | Trailing slash in API_INTERNAL_URL gives `//api` (edge, gap) | low | Only on misconfig; compose.yaml sets no slash. Unlikely, and the fix changes URL semantics | reject |
| 6 | Category with empty `items` renders bare heading (blind, edge) | false | `MenuService.getMenu` builds categories from item rows, so every category has at least 1 item | reject |
| 7 | Duplicate category names give duplicate React keys (blind, edge) | false | Grouping over rows ordered by category yields unique, contiguous names | reject |
| 8 | Empty description renders empty `<p>` (blind, edge) | low | Cosmetic margin only; seeded items all have descriptions; fix adds a branch | reject |
| 9 | `parseEnv()` per request can `process.exit` mid-request (blind, gap) | false | `instrumentation.ts` validates the same env at startup, so a bad env never reaches a request. The spec mandates `parseEnv()` | reject |
| 10 | Error tests miss 4xx and non-JSON 200 (blind) | low | 4xx takes the same `!res.ok` branch; non-JSON `res.json()` throws into the tested catch | reject |
| 11 | Schema-mismatch log omits zod issues (blind) | low | Diagnostics only; the spec chose message-only logging | reject |
| 12 | `role="status"` on static content (blind) | false | No bad outcome: an SSR live region is not announced on load and is harmless | reject |
| 13 | Non-OK response body not drained (blind) | low | Only on api errors; undici frees it on GC; negligible | reject |
