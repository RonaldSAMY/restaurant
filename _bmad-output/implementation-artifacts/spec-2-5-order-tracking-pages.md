---
title: 'Story 2.5: Order tracking pages'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After placing an Order, the Menu page navigates to `/track`, which 404s. A Guest also cannot look up an Order by reference, although `GET /api/v1/orders/current` (2.2) and `GET /api/v1/orders/by-reference/:reference` (2.3) exist.

**Approach:** Add `/track` and `/track/[reference]`. Both fetch from the browser through `apps/web/lib/api.ts`, using new `getCurrentOrder()` and `getOrderByReference()`. Fetching from the browser keeps the Guest cookie same-origin and makes the lookup throttle count per client, not per web container. Both pages render one shared Order view: the reference, a prominent status (Received / Preparing / Ready / Collected), the items, the total from `formatPrice`, and the guest name. On `/track`, a 401 does `router.replace('/')`. `/track` also has a lookup form that leads to `/track/[reference]`. On a lookup, `ORDER_NOT_FOUND` shows a neutral "Order not found", `RATE_LIMITED` shows "try again shortly", and any other error shows a generic message. Both pages fit 375 px with no horizontal scroll.

</frozen-after-approval>

## Implementation Notes

- `lib/api.ts`: added `getCurrentOrder()` and `getOrderByReference()` (the reference is `encodeURIComponent`-ed). Both reuse `request()`, so a network error or a bad body becomes `INTERNAL`.
- `app/track/order-view.tsx`: `OrderView` (status first, at 2rem; then reference, name, `qty × name` lines, total), `STATUS_LABELS` and `describeLookupError` (by `code` only). A server-renderable component, so it is testable without a DOM.
- `app/track/tracked-order.tsx` (client): `TrackedOrder` loads in `useEffect` and ignores late results after unmount. With no reference, `UNAUTHENTICATED` leads to `router.replace('/')`. `LookupForm` trims the input and pushes `/track/<ref>`; the api normalizes case.
- `app/track/page.tsx` and `app/track/[reference]/page.tsx`. The latter awaits `params` (Next 16).
- Beyond the frozen intent: `LookupForm` is also on `/`. A Guest on another device has no session, so `/track` redirects them to `/`, and a form only on `/track` would be unreachable for them.
- Tests: `app/track/order-view.spec.tsx` (view, error mapping, initial loading render) and the two GETs in `lib/api.spec.ts`.
- Live check at 375 px against the rebuilt compose stack: no-session `/track` → `/`; placing an Order → `/track` shows it; a lowercase lookup through the form works; `ZZZZZZ` → "Order not found"; 31 lookups → "try again shortly". `scrollWidth - clientWidth = 0` on every page. The local `.env` lacks the 3.1 vars, so `seed` fails. Api and web were started with `--no-deps` and a throwaway `AUTH_JWT_SECRET` from a scratch override. `.env` was not changed.
- Review patch: `LookupForm` moved to `app/lookup-form.tsx`, since `/`, `/track` and `/track/[reference]` all use it. It now has no `maxLength`, so a paste with spaces is no longer cut short. Submit is disabled until the trimmed, uppercased value passes the shared `GuestOrderViewSchema.shape.reference`. Not re-verified live after the move (unit tests, lint and typecheck pass).
- Status is a snapshot loaded once. Refresh the page to update it; live updates come in 3.4.

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `maxLength={6}` truncates a paste with spaces before the trim | medium | patch | Removed `maxLength`. The value is trimmed and uppercased before validation. |
| 2 | The lookup form skips the shared schema | medium | patch | Submit is gated by `GuestOrderViewSchema.shape.reference`, as the epic requires ("forms validate with the same shared schema"). |
| 3 | `/track` shows "check the reference" copy | false | reject | `/orders/current` without a valid session returns 401 (redirect), never `ORDER_NOT_FOUND`. Other errors already show the generic message. |
| 4 | An ended session redirects silently; Collected is unreachable on `/track` | false | reject | The AC says the 401 redirects to `/` "to start fresh". Collected stays visible through `/track/[reference]` for 24 h (2.3). |
| 5 | No tests for client branches (redirect, late result, form) | medium | defer | The web unit tests have no DOM lib (as in 2.4 #8). Checked live; e2e in 3.5. |
| 6 | The GET tests cover only the success path | low | reject | Error parsing is shared by `request()` and already tested through `placeOrder`. |
| 7 | The per-client throttle is unverified | false | reject | `trust proxy` is set, and 2.3's `order-lookup.int-spec` asserts per-`X-Forwarded-For` limits. Caddy appends the client IP. |
| 8 | Static "Your Order" heading, no route titles | low | reject | Cosmetic. Echoing an unverified reference in the heading was deliberately avoided. |
| 9 | `LookupForm` sits in the tracking module | low | patch | Moved to `app/lookup-form.tsx` (a simple move). The label wording was kept. |
| 10 | a11y: fixed id, no `aria-live`, `×` | low | reject / defer | One `OrderView` per page, so the id is unique. `aria-live` only matters once status changes live, so it is deferred to 3.4. The `×` reading is cosmetic. |
| 11 | The spec does not note that status is a snapshot | low | patch | Note added above. |
