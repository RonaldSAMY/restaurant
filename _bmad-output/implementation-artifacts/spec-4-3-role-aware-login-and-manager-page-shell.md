---
title: 'Story 4.3: Role-aware login and Manager page shell'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
implementer: 'Ronald (by hand)'
route: 'manual'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

## Intent

**Problem:** After login everyone lands on `/kitchen`, and there is no Manager page.

**Approach:**
- The login form reads `role` from `StaffMe` and routes Managers to `/manager`.
- A new `/manager` page loads the Manager's identity and the manager endpoint. It renders one of four states: loading, managers-only (on 403), error, or ready. The ready state shows a heading, the email, a link to the board and Log out.
- The dashboard content itself comes in 4.4.

## Boundaries & Constraints

**Always:**
- `lib/api.ts` gets two functions, both through `staffRequest`:
  - `getMe()`: `GET auth/me`, parsed with `StaffMeSchema`;
  - `getManagerOrders(status?: OrderStatus)`: `GET manager/orders`, parsed with `ManagerOrdersResponseSchema`. With a status it appends `?status=<value>` using `URLSearchParams`, never string concatenation of user input.
- A `403 FORBIDDEN` is returned to the caller unchanged: no refresh, no navigation. That is already `staffRequest`'s behaviour; prove it with a test.
- Pure helper `landingFor(role: StaffRole): '/manager' | '/kitchen'` in `app/kitchen/login/login-form.tsx`. The form calls `router.replace(landingFor(result.data.role))`.
- The login page heading becomes "Staff login"; the URL stays `/kitchen/login` (D2).
- `/manager` page: `app/manager/page.tsx` (server component, a `<main className="wide">` wrapper like `/kitchen`) renders a client `ManagerDashboard` from `app/manager/manager-dashboard.tsx`.
- In `manager-dashboard.tsx`, split the **pure view** from the **stateful loader** so you can test the view with `renderToStaticMarkup`:
  - `ManagerView` takes props `{ state: 'loading' | 'forbidden' | 'error' } | { state: 'ready'; me: StaffMe }` plus an `onLogout` callback;
  - `ManagerDashboard` holds the state and calls the api.
- Forbidden text is exactly "This page is for managers only." with a link to `/kitchen`.
- Ready shows: `<h1>Manager Dashboard</h1>`, the email, a "Kitchen Board" link to `/kitchen`, and a "Log out" button. Log out calls `logout()` and then `router.replace(STAFF_LOGIN_PAGE)`.

**Never:**
- No counts or table (4.4) and no socket (4.5).
- No Next `proxy.ts` and no server-side role check: protection is the api's 401/403 (AD-12).
- No second login page.

## I/O & Edge-Case Matrix

| Scenario | State | Expected |
|---|---|---|
| Manager logs in | `StaffMe.role = MANAGER` | navigates to `/manager` |
| Kitchen logs in | `role = KITCHEN` | navigates to `/kitchen` |
| Manager opens `/manager` | both calls ok | heading, email, board link, Log out |
| Kitchen opens `/manager` | `manager/orders` → 403 | "This page is for managers only." + link; no email shown |
| No session | 401 → refresh fails | existing redirect to `/kitchen/login` (no new code) |
| Network error | either call `INTERNAL` | generic error text with `role="alert"` |
| Log out | button | `POST auth/logout`, then `/kitchen/login` |

## Code Map

- `apps/web/lib/api.ts`: `staffRequest`, `listKitchenOrders` (pattern), `STAFF_LOGIN_PAGE`.
- `apps/web/lib/api.spec.ts`: `describe('staff calls')` from line ~141 shows how `fetch` is stubbed and calls are asserted.
- `apps/web/app/kitchen/login/login-form.tsx` (`router.replace('/kitchen')`) and `page.tsx` (heading).
- `apps/web/app/kitchen/kitchen.spec.tsx`: line ~143 asserts 'Kitchen login'; update it. The file also shows the `vi.mock('next/navigation', …)` and `renderToStaticMarkup` pattern.
- `apps/web/app/kitchen/kitchen-board.tsx`: `KitchenBoard` is the model for the loader (`useEffect`, `cancelled` flag, the `signOut` function).
- `apps/web/app/kitchen/page.tsx`: page wrapper pattern.

## Tasks

Branch: `git switch main && git switch -c story/4-3-manager-shell` (after 4.2 is merged).

### A. API client
- [ ] **T1 🔴 Test**: in `api.spec.ts` under `staff calls`, write four tests:
  - `getMe` GETs `/api/v1/auth/me` and parses `StaffMe`;
  - `getManagerOrders()` GETs `/api/v1/manager/orders`;
  - `getManagerOrders('READY')` GETs `/api/v1/manager/orders?status=READY`;
  - a 403 envelope is returned as `{ ok: false, error.code: 'FORBIDDEN' }` with **no** refresh call and no `location.assign`.

  *Done when:* they fail (the functions don't exist yet).
- [ ] **T2 🟢 Code**: add both functions with TSDoc. *Done when:* T1 passes.

### B. Login landing
- [ ] **T3 🔴 Test**: in `kitchen.spec.tsx`, `landingFor('MANAGER') === '/manager'` and `landingFor('KITCHEN') === '/kitchen'`. Change the heading assertion to 'Staff login'. *Done when:* both fail.
- [ ] **T4 🟢 Code**: add `landingFor`, use it in `submit`, and retitle the page and its doc comment. *Done when:* T3 passes.

### C. Manager view (pure)
- [ ] **T5 🔴 Test**: create `app/manager/manager.spec.tsx` and render `ManagerView` for each state:
  - **forbidden** contains "This page is for managers only." and `href="/kitchen"`, and does not contain "Log out";
  - **ready** contains "Manager Dashboard", the email, `href="/kitchen"` and "Log out";
  - **error** has `role="alert"`;
  - **loading** contains "Loading".

  *Done when:* it fails.
- [ ] **T6 🟢 Code**: write `ManagerView`. *Done when:* T5 passes.

### D. Loader and page
- [ ] **T7 🟢 Code**: write `ManagerDashboard`. On mount, call `getManagerOrders()` and `getMe()` (in parallel with `Promise.all`):
  - either returns `FORBIDDEN` → state `forbidden`;
  - either returns `UNAUTHENTICATED` → do nothing, because `staffRequest` is already navigating;
  - any other failure → state `error`;
  - both ok → state `ready` with `me`.

  Keep the result of `getManagerOrders` unused for now; 4.4 will use it. Use the `cancelled` flag as `KitchenBoard` does. Then create `app/manager/page.tsx`. *Done when:* `pnpm typecheck` is clean.
- [ ] **T7b 🟢 Code**: add `{ href: '/manager', label: 'Manager' }` to `NAV_LINKS` in `app/layout.tsx`. The nav shows it to everyone; the page itself handles access. *Done when:* the link opens `/manager`.
- [ ] **T8 ✅ Check by hand**:
  - log in as the manager → `/manager` shows your email; Log out → `/kitchen/login`;
  - log in as staff → `/kitchen`; then type `/manager` → "managers only";
  - in a private window open `/manager` → redirected to login.

  *Done when:* all three behave.

### E. Finish
- [ ] **T9 🔧 Tidy**: TSDoc on everything new; remove dead code. *Done when:* `pnpm lint` reports 0 warnings.
- [ ] **T10 ✅ Check**: all gates. *Done when:* green. Then say **"review story 4.3"**.

## Questions to think about

1. The web never decides who is a Manager; it only reacts to 403. Why is that safer than reading `role` from `getMe()` to hide the page?
2. Why call `manager/orders` in the shell at all, when 4.4 needs it anyway? (Hint: which call is guarded by `ManagerGuard`?)
3. Why `URLSearchParams` for `?status=` even though `status` is an enum?

## Verification

- `pnpm lint && pnpm format:check && pnpm typecheck`: exit 0
- `pnpm test`: green, including the new cases in `api.spec.ts`, `kitchen.spec.tsx` and `manager.spec.tsx`

## Review Notes

<!-- Claude fills this in on "review story 4.3" -->
