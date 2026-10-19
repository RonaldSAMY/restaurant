---
title: 'Story 3.3: Staff login page and Kitchen Board'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '89e935f17e66d95744cc8e857abdf30252f79d29'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The staff auth and kitchen APIs exist (3.1, 3.2) but there is no UI, so Kitchen Staff cannot log in or move Orders.

**Approach:** Add `/kitchen/login` and `/kitchen` client pages. Extend `lib/api.ts` with staff calls behind one refresh-once-then-retry path (single-flight per tab). The board fetches `kitchen/orders`, groups the Orders into three columns, and gives each card one forward action.

## Boundaries & Constraints

**Always:**
- `lib/api.ts` stays the only fetch wrapper. Staff calls (`kitchen/orders` GET, `kitchen/orders/:id/status` PATCH, `auth/logout`) use a `staffRequest` that does this on `401 UNAUTHENTICATED`: it awaits one shared `POST auth/refresh` (a module-level in-flight promise, cleared when it settles) and retries once. If the refresh fails, or the retry gets 401 again, it calls `window.location.assign('/kitchen/login')` and returns the error. Login and refresh themselves never go through `staffRequest`.
- `204` responses parse with `z.undefined()` through the existing `request`.
- Interim path rule: sub-paths are typed only in `lib/api.ts` as `` `${apiPath(ApiRoutes.auth)}/login` ``, `/refresh`, `/logout`, and `` `${apiPath(ApiRoutes.kitchenOrders)}/${encodeURIComponent(id)}/status` ``. Do not change `apiPath`.
- JS never reads a cookie or token. Kitchen protection is the 401 flow: no `proxy.ts`, no middleware.
- Login form: email + password, validated with `LoginRequestSchema` before submit. Success → `router.replace('/kitchen')`. `INVALID_CREDENTIALS`/`VALIDATION_FAILED` → one generic "Email or password is incorrect."; `RATE_LIMITED` → "Too many attempts. Please try again shortly."; anything else → "Something went wrong. Please try again."
- Board: Received / Preparing / Ready columns, each in API order (oldest first). Each card shows the reference, Guest name, `quantity × name` lines and the time placed (local `HH:MM`). Actions: Take (→PREPARING), Mark Ready (→READY), Mark Collected (→COLLECTED). The action is disabled while its request is pending.
- Success replaces the card with the returned `KitchenOrder` (it moves column), or removes it on `COLLECTED`. `INVALID_TRANSITION` refetches the board and shows "That Order already moved. Board refreshed." Any other failure shows "Something went wrong. Please try again." The notice sits in a `role="status"` region.
- A Log out button calls logout and then goes to `/kitchen/login` whatever the result.
- Columns are side by side at ≥ 768 px (CSS grid) and stacked below that. The board's `main` widens past the 40rem default.

**Never:** No Socket.IO or live updates (3.4). No api, shared-schema or migration changes. No client-side transition rules beyond picking the one next status for the button (the server decides). No new dependencies, no DOM test library. No `auth/me` call.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Login ok | valid credentials | `/kitchen` | N/A |
| Login bad | wrong email or password | stays, generic error | same text for both |
| Expired access | staff call 401, refresh 204, retry 200 | data returned, one refresh | N/A |
| Concurrent 401s | two staff calls 401 at once | exactly one `auth/refresh` request | N/A |
| Refresh fails | refresh 401 | `location.assign('/kitchen/login')` | error returned |
| Retry 401 | refresh 204, retry 401 | navigates to login, no second refresh | error returned |
| Non-401 error | 409 / 500 | returned as-is, no refresh | N/A |
| Advance | tap Take on a RECEIVED card | card in Preparing | N/A |
| Collect | tap Mark Collected | card removed | N/A |
| Stale card | PATCH → 409 | board refetched, notice shown | INVALID_TRANSITION |
| Anonymous `/kitchen` | no cookies | list 401 → refresh 401 → login page | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/lib/api.ts` -- `request(path, schema, init)` is the base. Add `login`, `logout`, `listKitchenOrders` and `advanceOrder` beside the Guest calls, with `staffRequest` and the single-flight `refreshing` promise. Do not change the Guest functions.
- `apps/web/lib/api.spec.ts` -- existing `stubFetch` / `vi.stubGlobal` pattern. Stub `window` as `{ location: { assign } }` for the navigation assertions.
- `packages/shared/src/{auth,orders,api-routes}.ts` -- `LoginRequestSchema`, `StaffMeSchema`, `KitchenOrderSchema`, `AdvanceStatusRequest`, `OrderStatus`, `ApiRoutes.auth`/`kitchenOrders`. Use them read-only.
- `apps/api/src/auth/auth.controller.ts` -- login `200 StaffMe`, refresh/logout `204`; the refresh cookie path is `/api/v1/auth`, so the refresh call must go to that path. `apps/api/src/orders/kitchen.controller.ts` -- list and PATCH.
- `apps/web/app/lookup-form.tsx`, `track/tracked-order.tsx` -- client-component patterns (`useRouter`, `cancelled` effect guard, `role="status"`/`role="alert"`). `track/order-view.tsx` -- `STATUS_LABELS` (reuse it for column headings).
- `apps/web/app/track/order-view.spec.tsx` -- test style: `renderToStaticMarkup` in node, `vi.mock('next/navigation')`. There is no DOM, so effects and clicks are not unit-testable.
- `apps/web/app/globals.css` -- `main { max-width: 40rem }`, 44px touch targets, `.error`, `.items`/`.item-row`. Add the board styles here.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/lib/api.ts` -- `staffRequest` + single-flight refresh, and the `login`, `logout`, `listKitchenOrders`, `advanceOrder(id, to)` calls -- AD-5 client half.
- [x] `apps/web/lib/api.spec.ts` -- cover the matrix rows for login (path/body), expired access, concurrent 401s (one refresh), failed refresh, retry 401, non-401, and the advance path encoding.
- [x] `apps/web/app/kitchen/login/page.tsx` + `login-form.tsx` -- the page and the form, with a `describeLoginError(error)` helper exported for tests.
- [x] `apps/web/app/kitchen/page.tsx` + `kitchen-board.tsx` -- the board client component plus pure exported pieces: `nextStatus(status)` (the one forward status for the button, or null), `OrderCard`, `Board({ orders, ... })`.
- [x] `apps/web/app/kitchen/kitchen.spec.tsx` -- static render of `Board` with Orders in all three statuses (column placement, card fields, button labels), `nextStatus`, `describeLoginError`, and the login page markup.
- [x] `apps/web/app/globals.css` -- `.board` grid (1 column, 3 at `min-width: 768px`), card and wide-`main` styles.

**Acceptance Criteria:**
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test`, then all pass and the new web specs run.
- Given the dev stack with the seeded staff user, when they log in, take an Order through Preparing, Ready and Collected, and log out, then each step behaves as the matrix says and a reload of `/kitchen` after logout lands on `/kitchen/login`.

## Implementation Notes

- `applyAdvanced(orders, updated)` extracted from the board so the Advance/Collect matrix rows have a pure test. The Stale-card row (409 → refetch + notice) lives in effect/click code and is covered only by the manual check, per the no-DOM-test constraint.
- Login input failing `LoginRequestSchema` shows the same generic "Email or password is incorrect." text.

## Spec Change Log

## Review Triage Log

| # | Finding (source) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Pending-button test matches any later disabled button (blind, edge, vg) | low | Regex runs on all markup after DDDDD4; a disabled button on BBBBB2/CCCCC3 would pass. | patch |
| 2 | `refreshing` reset untested (blind, vg) | low | Removing `.finally` is caught only by test order leakage. | patch |
| 3 | Network/5xx refresh failure redirects to login (blind, edge) | low | `!refreshed.ok` includes synthesized INTERNAL; rare (blip exactly at refresh), recovery is re-login. Frozen intent says "if the refresh fails" → redirect, so changing it is a human call. | defer |
| 4 | Generic error flashes before login redirect (blind) | low | Mount effect sets `loadFailed` after `staffRequest` already called `location.assign`; hits every anonymous visit. | patch |
| 5 | No retry after failed first load (blind) | low | Real but manual reload recovers; adds UI not in spec. | reject |
| 6 | No empty state for empty columns (blind) | low | Empty board is an everyday state; one-line fix. | patch |
| 7 | Action buttons lack accessible context (blind) | low | Identical "Take" labels per card; accessibility basic, trivial `aria-label`. | patch |
| 8 | Stale reload can overwrite a concurrent advance (blind, edge) | low | Needs a 409 reload racing another card's PATCH; fix needs sequencing state. | reject |
| 9 | Double-tap Log out sends two logouts (blind, edge) | low | Both paths end on `/kitchen/login`; harmless extra request; fix adds state. | reject |
| 10 | Notice lingers until next advance (blind) | low | Cosmetic; spec sets no timeout. | reject |
| 11 | `applyAdvanced` unknown id / Board with COLLECTED untested (blind) | low | List API returns only open Orders; branches are trivial. | reject |
| 12 | `GENERIC_ERROR` doc comment inaccurate (blind) | low | Constant also used for first-load and failed refetch. | patch |
| 13 | `stubResponses` `void path; void init;` noise (blind) | low | Typing `vi.fn<typeof fetch>` removes it. | patch |
| 14 | Advance ORDER_NOT_FOUND leaves stale card (edge) | false | `orders.service.ts` throws ORDER_NOT_FOUND only for malformed/unknown ids; board ids come from the list and Orders are never deleted. | reject |
| 15 | Logout network failure leaves session live (edge) | low | Real, but intent mandates "goes to `/kitchen/login` whatever the result". | reject |
| 16 | 403 FORBIDDEN not redirected (edge) | low | Intent defines the flow on 401 only; 403 shows generic error. | reject |
| 17 | setState after unmount (edge) | false | React 18 ignores updates on unmounted components without warning or effect. | reject |
| 18 | Board advance outcomes (stale refetch, notice text, pending reset) untested (vg) | medium | Pre-verified; no test runs `KitchenBoard.advance`; manual-check-only by the no-DOM-test rule. | defer |
| 19 | Login submit / logout navigation untested (vg) | medium | Pre-verified; router mocked as `{}`; manual-check-only by the no-DOM-test rule. | defer |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck` -- expected: exit 0
- `pnpm test` -- expected: all green, including `api.spec.ts` refresh cases and `kitchen.spec.tsx`

**Manual checks (if no CLI):**
- `docker compose up`, then at `https://localhost/kitchen/login` (≥ 768 px wide): log in, advance an Order to Collected, log out. A 375 px view stacks the columns.
