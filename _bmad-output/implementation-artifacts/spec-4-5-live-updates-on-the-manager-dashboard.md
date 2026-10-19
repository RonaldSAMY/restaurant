---
title: 'Story 4.5: Live updates on the Manager Dashboard'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
implementer: 'Ronald (by hand)'
route: 'manual'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

## Intent

**Problem:** The dashboard is a snapshot. New Orders and changes made on the Kitchen Board don't appear until reload.

**Approach:** Open the existing staff socket, which already joins the `kitchen` room for any staff role. On every connect and on every `order.created` / `order.status-changed` event, refetch the dashboard. Bursts of events are coalesced: at most one request in flight, plus at most one queued after it.

## Boundaries & Constraints

**Always:**
- Use `openSocket({ staff: true, onConnect, on })` from `lib/socket.ts`. Do not call `io()` yourself.
- Event names come from shared `SocketEvents`. Payloads are **not** needed, because you refetch, so don't parse them; a comment saying why is enough.
- Coalescing helper `coalesce(run: () => Promise<void>): () => void` in `apps/web/lib/coalesce.ts`, pure and framework-free:
  - calling it while idle starts `run`;
  - calling it while a run is in flight sets a "dirty" flag, however many times it is called;
  - when the run settles (resolve **or** reject) and the flag is dirty, it clears the flag and runs exactly once more.
- The dashboard's `load` (from 4.4) is the function you coalesce. The filter change from 4.4 goes through the same coalesced function.
- Close the socket on unmount, and on an unmount during a load the result is ignored (`cancelled` flag).
- Live updates must arrive in under 2 s (NFR5). Check by hand with two browsers.

**Never:**
- No new socket events, rooms or server changes. The gateway already admits a Manager because `StaffAuthGuard` accepts any role. If it doesn't, stop and ask: that would be a 4.1 bug.
- No polling.
- No `setTimeout` debounce: coalescing is enough and adds no delay.

## I/O & Edge-Case Matrix

| Scenario | Events | Expected |
|---|---|---|
| Guest places an Order | `order.created` | one refetch; new row on top, RECEIVED tile +1 |
| Kitchen advances | `order.status-changed` | one refetch; tiles and row update |
| Burst of 5 events during one load | 5× | exactly 2 loads total (the current one + 1 trailing) |
| Load fails during burst | run rejects, dirty | still runs once more |
| Reconnect | socket `connect` again | one refetch |
| Logout elsewhere | server disconnects socket | existing `openSocket` behaviour → `/kitchen/login` |
| Unmount | — | socket closed; no state update after unmount |

## Code Map

- `apps/web/lib/socket.ts`: `openSocket` and its options.
- `apps/web/lib/socket.spec.ts`: how the socket is faked in tests (for reference; you don't need to test `openSocket` again).
- `apps/web/app/kitchen/kitchen-board.tsx`: the `useEffect` with `load`, `openSocket` and `close` is the exact wiring pattern; the dashboard's version is simpler because every event means "refetch".
- `packages/shared/src/realtime.ts`: `SocketEvents`.

## Tasks

Branch: `git switch main && git switch -c story/4-5-manager-live` (after 4.4 is merged).

### A. Coalescing helper (pure, test-first)
- [ ] **T1 🔴 Test**: create `apps/web/lib/coalesce.spec.ts`. Use a `run` that returns a promise you resolve by hand (keep the resolver in a variable). Cases:
  - **idle call:** `run` is called once;
  - **burst:** while the run is in flight, call 3 more times → still 1 call; resolve → exactly 1 more call; resolve that → no further call;
  - **reject:** the run rejects with the flag dirty → it still runs once more;
  - **idle again:** after everything settles, a new call starts a new run.

  Hint: `await Promise.resolve()` (or `vi.waitFor`) lets the `.finally` run before you assert. *Done when:* the cases fail (no module yet).
- [ ] **T2 🟢 Code**: write `coalesce` in about 15 lines, with TSDoc. *Done when:* T1 passes.

### B. Wire into the dashboard
- [ ] **T3 🟢 Code**: in `ManagerDashboard`, wrap `load` with `coalesce`, then:
  - open the staff socket in a `useEffect`, with `onConnect` → coalesced load and `on` → `{ [SocketEvents.orderCreated]: refresh, [SocketEvents.orderStatusChanged]: refresh }`;
  - return the close function from the effect.

  Watch out: `filter` must be current when a socket event triggers a load. Using a `ref` for the filter, or recreating the coalesced function per filter, are both fine. Explain your choice in the review. *Done when:* `pnpm typecheck` is clean.
- [ ] **T4 ✅ Check by hand (two browsers)**:
  - Manager on `/manager`; a Guest on `/` places an Order → the row appears in under 2 s;
  - Kitchen Staff on `/kitchen` press Take → the dashboard row and tiles change in under 2 s;
  - set the filter to READY, then mark an Order Ready on the board → it appears in the filtered list.

  *Done when:* all three work.
- [ ] **T5 ✅ Check by hand**: open DevTools → Network, then place 3 Orders quickly from a script or several tabs. *Done when:* you see no more than 2 `manager/orders` requests per burst.

### C. Finish
- [ ] **T6 🔧 Tidy**: TSDoc, and a short comment on why event payloads are ignored. *Done when:* `pnpm lint` reports 0 warnings.
- [ ] **T7 ✅ Check**: all gates. *Done when:* green. Then say **"review story 4.5"**. After the review fixes, mark the epic's API and web stories done; 4.6 waits for 3.5.

## Questions to think about

1. The Kitchen Board applies events locally; the dashboard refetches. What does each approach cost? Why is refetching the right call here? (Counts, the filter, the 100 cap.)
2. Why does coalescing need the "run once more" step? What bug would you get with "skip if in flight" alone?
3. What happens to the dashboard if the socket never connects? Is that acceptable?

## Verification

- `pnpm lint && pnpm format:check && pnpm typecheck`: exit 0
- `pnpm test`: green, including `coalesce.spec.ts`
- Manual: updates arrive in under 2 s in two browsers

## Review Notes

<!-- Claude fills this in on "review story 4.5" -->
