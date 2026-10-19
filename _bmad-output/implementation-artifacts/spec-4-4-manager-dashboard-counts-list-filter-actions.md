---
title: 'Story 4.4: Manager Dashboard: counts, list, filter, actions'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
implementer: 'Ronald (by hand)'
route: 'manual'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

## Intent

**Problem:** The `/manager` shell shows nothing about Orders.

**Approach:** Render the `manager/orders` response as:
- four count tiles;
- a status filter;
- a table of Orders, newest first, where each non-Collected row has the same one-step action as the Kitchen Board.

After any action or filter change, refetch the whole response. That is simpler than patching local state, and the counts must come from the server anyway.

## Boundaries & Constraints

**Always:**
- Reuse, don't copy:
  - `nextStatus` from `app/kitchen/kitchen-board.tsx` (the row's action target);
  - `STATUS_LABELS` from `app/track/order-view.tsx`;
  - `formatPrice` from `lib/menu.ts`;
  - `advanceOrder` from `lib/api.ts`.

  Move `ACTION_LABELS` out of `kitchen-board.tsx` into an exported constant (same file is fine) so both the board and the dashboard use it.
- Pure, testable components in `app/manager/manager-dashboard.tsx`, or a sibling `dashboard-parts.tsx` if the file grows large:
  - `CountTiles({ counts })`: four tiles in `OrderStatusSchema.options` order, each with its label and number;
  - `StatusFilter({ value, onChange })`: a `<select>` with an "All" option (`value=""`) and one option per status; it must have a `<label>`;
  - `OrdersTable({ orders, pending, onAdvance })`: a `<table>` with a `<caption>` or `aria-label`. Columns: Reference, Guest, Items (`2 × Burger, 1 × Soup`), Total, Status, Placed (`HH:MM`), Action. A COLLECTED row has no button. A button's `aria-label` is `"<Action> <reference>"`, as on the board.
- `ManagerDashboard` state: `filter: OrderStatus | ''`, `data: ManagerOrdersResponse | null`, `pending: Set<string>`, `notice: string`. `load()` calls `getManagerOrders(filter || undefined)`. Changing the filter re-runs `load`.
- Advance flow:
  1. mark the row pending and run `advanceOrder`;
  2. on success, call `load()`;
  3. on `INVALID_TRANSITION`, call `load()` and set the notice "That Order already moved. Dashboard refreshed.";
  4. on `UNAUTHENTICATED`, show nothing (navigation is under way);
  5. on anything else, show the generic error notice;
  6. always clear pending.
- Notices go in a `<p role="status">`.
- CSS in `app/globals.css`: tiles in one row (`display: grid; grid-template-columns: repeat(4, 1fr)`) from 768 px; the table scrolls horizontally on narrow screens (`overflow-x: auto` wrapper). Reuse existing CSS variables and colours.

**Never:**
- No socket (4.5).
- No client-side rule about which transition is valid beyond `nextStatus`, which only picks the button.
- No new api endpoint.
- No pagination.
- No new dependency (no table or chart library).

## I/O & Edge-Case Matrix

| Scenario | State | Expected |
|---|---|---|
| Load | counts `{1,0,2,1}`, 4 orders | 4 tiles with those numbers; 4 rows newest first |
| Empty | counts all 0, `[]` | tiles show 0; table shows "No Orders" row |
| Filter READY | select READY | request `?status=READY`; rows only READY; tiles unchanged |
| Filter All | select All | request without `status` |
| Take | RECEIVED row → Take | PATCH `to: PREPARING`, then refetch; button disabled while pending |
| Collected row | status COLLECTED | no action button |
| Race | PATCH → 409 | refetch + "That Order already moved. Dashboard refreshed." |
| Other failure | PATCH → INTERNAL | generic notice, no refetch required |

## Code Map

- `apps/web/app/manager/manager-dashboard.tsx` (from 4.3): `ManagerView`'s ready state grows to contain tiles, filter and table.
- `apps/web/app/kitchen/kitchen-board.tsx`: `nextStatus`, `ACTION_LABELS`, `formatTime`, and the `advance()` flow, which is the closest model. `formatTime` is file-private today; export it or move it to `lib/` if you reuse it, and say which you chose in the review.
- `apps/web/app/kitchen/kitchen.spec.tsx`: the `order()` fixture and the `column()` helper are patterns for asserting markup.
- `apps/web/lib/menu.ts`: `formatPrice`. `apps/web/app/track/order-view.tsx`: `STATUS_LABELS`.
- `apps/web/app/globals.css`: the existing `.board` / `.card` styles.

## Tasks

Branch: `git switch main && git switch -c story/4-4-manager-dashboard` (after 4.3 is merged).

### A. Shared bits
- [ ] **T1 🔧 Tidy**: export `ACTION_LABELS` (and `formatTime` if you reuse it) from where it lives. *Done when:* `pnpm test` is still green (the kitchen tests are untouched).

### B. Count tiles
- [ ] **T2 🔴 Test**: in `manager.spec.tsx`, render `CountTiles` with `{RECEIVED:1, PREPARING:0, READY:2, COLLECTED:7}`. Assert each label appears with its number, in lifecycle order (use `indexOf` positions). *Done when:* it fails.
- [ ] **T3 🟢 Code**: write `CountTiles`. *Done when:* T2 passes.

### C. Orders table
- [ ] **T4 🔴 Test**: render `OrdersTable` with a RECEIVED, a READY and a COLLECTED Order. Assert:
  - row order is the same as the input;
  - the Items text reads `2 × Burger, 1 × Soup`;
  - the Total uses `formatPrice`;
  - the RECEIVED row has a `Take <ref>` button and the READY row has `Mark Collected <ref>`;
  - the COLLECTED row has no `<button`;
  - a pending id renders `disabled`;
  - an empty list renders "No Orders".

  *Done when:* it fails.
- [ ] **T5 🟢 Code**: write `OrdersTable`. *Done when:* T4 passes.

### D. Filter
- [ ] **T6 🔴 Test**: render `StatusFilter` with `value="READY"`. Assert there is a `<label` tied to the select (`htmlFor`/`id`), five `<option`s with "All" first, and READY `selected`. *Done when:* it fails.
- [ ] **T7 🟢 Code**: write `StatusFilter`. *Done when:* T6 passes.

### E. Wire it up
- [ ] **T8 🟢 Code**: in `ManagerDashboard`, keep `data` from `getManagerOrders`, add `filter` state, make `load` depend on `filter` (a `useEffect` on `[filter]`, or call `load` from the filter's `onChange`; pick one and explain the choice in the review), and render tiles, filter and table in the ready state. *Done when:* the manual check shows the numbers and rows match `GET /api/v1/manager/orders` in the browser.
- [ ] **T9 🟢 Code**: write the `advance()` flow as described above. *Done when:* manual check: Take on a RECEIVED row moves it to PREPARING and the tiles change.
- [ ] **T10 ✅ Check the race by hand**: open the same Order on `/kitchen` in a second browser, advance it there, then press the stale button on `/manager`. *Done when:* the notice appears and the row shows the new status.

### F. Style and finish
- [ ] **T11 🟢 Code**: add the CSS for the tiles row and the table wrapper; check at 375 px and 1024 px widths. *Done when:* there is no horizontal page scroll at 375 px (the table scrolls inside its wrapper).
- [ ] **T12 🔧 Tidy**: TSDoc on every component and function (AD-17). *Done when:* `pnpm lint` reports 0 warnings.
- [ ] **T13 ✅ Check**: all gates. *Done when:* green. Then say **"review story 4.4"**.

## Questions to think about

1. Why refetch after an action instead of updating the row locally, as the board does with `applyAdvanced`? When would local updates become worth it?
2. `nextStatus` decides which button to show, not whether the move is allowed. Who decides that, and what happens when they disagree?
3. What does a screen-reader user hear for the action button, and why does the `aria-label` include the reference?

## Verification

- `pnpm lint && pnpm format:check && pnpm typecheck`: exit 0
- `pnpm test`: green, including the `manager.spec.tsx` tile, table and filter tests

## Review Notes

<!-- Claude fills this in on "review story 4.4" -->
