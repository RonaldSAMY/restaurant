---
title: 'Story 2.4: Place an Order from the Menu page'
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

**Problem:** The Menu page (`/`) is read-only. A Guest cannot pick dishes or place an Order, although `POST /api/v1/orders` exists (Stories 2.1/2.2).

**Approach:** Keep `page.tsx` as the server component that fetches the Menu, and render a client basket under it. Each Menu Item gets add and remove controls. The basket lists lines with quantities (1–99, as in the shared schema) and a running total formatted with `formatPrice` (an estimate; the server total is authoritative), plus a name field. Submit is disabled until `PlaceOrderRequestSchema.safeParse` passes. Submitting goes through a new `apps/web/lib/api.ts`, the single same-origin fetch wrapper. It parses success with `GuestOrderViewSchema` and errors with `ErrorEnvelopeSchema`, then branches on `error.code`. `VALIDATION_FAILED`/`MENU_ITEM_NOT_FOUND` give an inline error, `ORDER_ALREADY_OPEN` gives a message linking to `/track` with the open reference from `details.reference`, and success navigates to `/track`. The basket fits 375 px with no horizontal scroll.

</frozen-after-approval>

## Implementation Notes

- `app/page.tsx` stays a server component. The Menu list moved into the client `app/order-menu.tsx` (`OrderMenu`) so each Menu Item can carry an Add button next to the basket form.
- `lib/api.ts`: `request()` is the single browser fetch wrapper (same-origin, `no-store`). A success body is parsed with the route's schema and an error body with `ErrorEnvelopeSchema`. A network failure or an unexpected body becomes a synthesized `INTERNAL` error, so callers only branch on `code`. `placeOrder()` is the only caller for now; 2.5 adds its GETs here.
- `lib/basket.ts`: pure basket math (`changeQuantity` capped at the schema's `quantity.maxValue`, `basketTotalCents`) plus `describeSubmitError`, which maps a code to inline text. `ORDER_ALREADY_OPEN` shows the reference from `details` and a link to `/track`, since the open session makes `/track` load that Order. Submit is gated by `PlaceOrderRequestSchema.safeParse`, and the name `maxLength` comes from the same schema.
- After a successful submit the button stays disabled while the browser navigates, which blocks a double submit. `/track` is built in 2.5, so until then it 404s.
- The basket is in-memory only and does not survive a refresh. After placement the Guest Session (cookie) carries the Order.
- Deferred item "web never parses the error envelope": settled for browser calls by `lib/api.ts`. Server-side `fetchMenu` still logs the status only, which is enough because it degrades to "Menu unavailable".
- Tests: `lib/api.spec.ts`, `lib/basket.spec.ts`, plus a basket render case in `app/page.spec.tsx` (mocks `next/navigation`). The web unit tests run in node with no DOM lib, so click interactions are covered by testing the pure helpers. The project adds no testing-library.
- Live check at 375 px: `next dev` against a stub Menu API on the host, because Docker was down. With a 60-char dish name and the price €1,435.50 × 6, `scrollWidth` equals `clientWidth`. The total, the steppers, the disabled submit with its hint, and the error path (`INTERNAL` → "Something went wrong") all behave as expected. `next dev` writes `apps/web/AGENTS.md`; it was removed as out of scope.

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Menu Items have Add but no remove control | medium | patch | The frozen intent says "add and remove controls". Once a dish is in the basket, its Menu Item now shows the shared `QuantityStepper`. |
| 2 | Tapping Add gives no visible or spoken feedback on mobile | medium | patch | Same patch as #1: the Menu Item turns into `− N +`, and `N` is an `<output>`. |
| 3 | Disabled submit gives no reason; name not `required` | low | patch | Added a hint line while the request is invalid, plus `required` on the name input. |
| 4 | The browser fetch has no timeout, so a hung api spins forever | medium | patch | `AbortSignal.timeout(10 s)` maps to `INTERNAL`, and a test covers it. |
| 5 | Raw server validation text is shown | low | reject | The client gates on the same schema, so the only server-only issue is the merged-quantity check, and its message is written for humans. |
| 6 | Basket ids missing from `itemsById` are submitted but not shown | false | reject | Basket ids only come from `categories` props, which never change on the client. |
| 7 | A stale error stays after basket edits | low | patch | `change()` clears it with one line. |
| 8 | `submit()` and non-empty basket rendering are untested | medium | defer | The web unit tests have no DOM lib. The pure helpers are tested, and the flow was checked live. The full flow is left to 3.5's e2e tests. |
| 9 | The page-spec submit regex is brittle | low | reject | React SSR attribute order is deterministic, and the test fails loudly if it changes. |
| 10 | 375 px is unverified | medium | patch | Verified live (see the notes above). |
| 11 | The error colour is hard-coded, with no dark-mode variant | low | reject | The app has no dark theme or tokens. #b00020 on white is about 7:1. |
