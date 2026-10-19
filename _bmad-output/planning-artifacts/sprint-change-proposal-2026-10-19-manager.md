# Sprint Change Proposal — Manager module (Epic 4)

- **Date:** 2026-10-19
- **Trigger:** Ronald, new requirement after Epic 3 (Story 3.6 `05227ed`): "Build manager module — Manager can login / logout; Manager has a dedicated dashboard; Manager can see all orders and status; Manager can accept orders too like kitchen staff, and deliver also."
- **Issue type:** New requirement from the stakeholder (post-MVP scope).
- **Scope:** Moderate. Adds a new epic and a staff role. PRD, architecture, epics and sprint status all get edits. No completed story is rolled back.
- **Mode:** Batch
- **Delivery mode:** **hand-implemented by Ronald** (practice). Claude writes specs and reviews; Claude does not implement. Every story spec lists small, test-first tasks.
- **Status:** Approved and applied 2026-10-19 (sections 4.1–4.5); D1–D6 as defaults

## 1. Issue Summary

The MVP has one kind of staff user. `StaffUser` has no role (`apps/api/prisma/schema.prisma`), the principal is `{ kind: 'staff', staffId, sid }` (`common/default-deny.guard.ts`), and the PRD lists "staff account management" and "admin screens" as out of scope (§6.2, §9). A Manager needs:

1. Their own account, logging in and out with the same session rules as Kitchen Staff.
2. A dedicated dashboard at `/manager`.
3. A view of **all** Orders, Collected included, with their status. The Kitchen Board only shows open Orders.
4. The same Take / Mark Ready / Mark Collected actions Kitchen Staff have. "Deliver" maps to **Mark Collected** (decision D1).

## 2. Impact Analysis

### Checklist record

| # | Item | Status | Note |
| --- | --- | --- | --- |
| 1.1 | Trigger story | [x] | None. New requirement raised after 3.6 |
| 1.2 | Core problem | [x] | New requirement: a second staff role with a wider view |
| 1.3 | Evidence | [x] | No `role` on `StaffUser`; no all-orders endpoint; PRD §6.2 excludes admin screens |
| 2.1 | Current epic | [N/A] | Epic 3 is unaffected; 3.5 stays in backlog |
| 2.2 | Epic-level change | [!] | Add **Epic 4: Managers oversee and run Orders** |
| 2.3 | Remaining epics | [x] | None planned beyond 3 |
| 2.4 | Obsolete / new epics | [x] | One new epic, nothing obsolete |
| 2.5 | Order | [x] | Epic 4 runs after Epic 3. Story 4.6 (E2E) depends on 3.5's Playwright harness |
| 3.1 | PRD | [!] | Glossary, new UJ-3, FR-10–FR-13, FR-7 widened, §5 tests, §6 phase, §9 |
| 3.2 | Architecture | [!] | AD-4 (role, 403), AD-5 (role claim), AD-11 (seed manager), AD-19 (endpoint, StaffMe), ER, routes |
| 3.3 | UX | [N/A] | No UX contract exists. Dashboard UI is defined in the story ACs |
| 3.4 | Other artifacts | [!] | `.env.example` (+2 vars), Prisma migration, compose `env_file` already shared |
| 4.1 | Direct adjustment | Viable | Effort Medium, Risk Low |
| 4.2 | Rollback | Not viable | Nothing to revert; existing auth extends cleanly |
| 4.3 | MVP review | Not needed | MVP is done; this is the first post-MVP phase |
| 4.4 | Path | [x] | Option 1: direct adjustment, a new Epic 4 |

### Epic impact
- **Epic 4 (new):** six stories, 4.1–4.6.
- **Epics 1–3:** no story text changes. Story 4.1 touches 3.1's code (principal, tokens, `StaffMe`, seed) in a backwards-compatible way. Existing Kitchen Staff default to role `KITCHEN`.

### Artifact conflicts
- **PRD:** §6.2 "staff account management" stays out of scope. Accounts are still seeded only, with **no sign-up and no user-management UI**. The "admin screens" exclusion is narrowed: the Manager dashboard is read-and-act, not admin.
- **Architecture:** no new module. The role lives in `auth` (it owns `StaffUser`), and the manager endpoint lives in `orders` (it owns `Order`), following AD-3. No new `ErrorCode`: `FORBIDDEN` (403) already exists.

### Technical impact
- One Prisma migration: an enum `StaffRole { KITCHEN MANAGER }` and `StaffUser.role` (default `KITCHEN`).
- One new endpoint: `GET /api/v1/manager/orders`.
- One new guard: `ManagerGuard`.
- One new web route: `/manager`.
- Live updates reuse the existing `kitchen` room; there are no new socket events.

## 3. Recommended Approach

**Direct adjustment: add Epic 4.** The auth design already allows it. AD-4 keeps a single `staff` principal kind, and the role becomes one more field on it. `PrincipalGuard` subclasses only implement `authenticate()`, so a `ManagerGuard` that throws `403 FORBIDDEN` for a non-manager fits without touching `DefaultDenyGuard`.

- **Effort:** Medium. Six stories: two api, three web, one e2e. Hand-built, so plan roughly 1–2 evenings per story.
- **Risk:** Low. Every change is additive, and the existing integration suite guards against regressions in Kitchen Staff behaviour.
- **Timeline:** independent of 3.5. Only Story 4.6 waits for 3.5.

### Decisions (defaults, flip any before approval)

| # | Question | Default |
| --- | --- | --- |
| D1 | What does "deliver" mean? | **Mark Collected** (READY → COLLECTED). No new status. |
| D2 | Separate manager login page? | **No.** One staff login page; after login, managers land on `/manager` and Kitchen Staff on `/kitchen`. The page is retitled "Staff login" and keeps the `/kitchen/login` URL so 401 redirects don't change. |
| D3 | How much of "all orders"? | Newest first, **max 100**, optional `?status=` filter. Counts per status cover **all time**. No pagination and no date filter yet (`ponytail:` ceiling noted in 4.2). |
| D4 | Kitchen Staff calling manager routes | **403 FORBIDDEN** (valid principal, wrong role). Anonymous or guest callers get **401** as before. The `/manager` page shows "Managers only" with a link to `/kitchen`. |
| D5 | Can a Manager use `/kitchen` too? | **Yes.** `StaffAuthGuard` admits any staff role. |
| D6 | Where does the role come from on each request? | From a signed `role` claim in the access JWT. Refresh re-reads the role from the DB, so a role change takes effect within 5 min. |

## 4. Detailed Change Proposals

### 4.1 PRD (`prds/prd-restuarent-2026-10-17/prd.md`)

**Frontmatter** `updated: 2026-10-17` → `updated: 2026-10-19`

**§2.1 Jobs To Be Done — add:**
```markdown
- **Manager:** see every Order and how the kitchen is doing at a glance, and step in to take or hand over Orders when the kitchen is busy.
```

**§2.2 — add UJ-3:**
```markdown
- **UJ-3. Mia manages the evening shift.** Mia logs in on the same staff login page and lands on the Manager Dashboard: counts of Orders per status and a list of all Orders, newest first, including Collected ones. The kitchen is busy, so she takes a Received Order herself and, when it's plated, marks it Ready and then Collected as she hands it over. Every change shows up live on the Kitchen Board and the Guest's tracking page. Omar (Kitchen Staff) tries to open the dashboard and is told it is for managers only. At the end of the shift Mia logs out.
```

**§3 Glossary — change and add:**
```markdown
OLD: - **Kitchen Staff** — an authenticated user who manages Orders on the Kitchen Board. The only role that logs in for the MVP.
NEW: - **Staff** — an authenticated user with one Staff Role: Kitchen Staff or Manager.
     - **Staff Role** — `KITCHEN` or `MANAGER`; set by the seed, no UI to change it.
     - **Kitchen Staff** — Staff with role `KITCHEN`; manages Orders on the Kitchen Board.
     - **Manager** — Staff with role `MANAGER`; everything Kitchen Staff can do, plus the Manager Dashboard.
     - **Manager Dashboard** — the Manager's view of all Orders (Collected included) with per-status counts and the same status actions as the Kitchen Board.
```

**§4 — add section 4.6:**
```markdown
### 4.6 Manager
**Description:** Managers log in like Kitchen Staff, oversee every Order on a dedicated dashboard, and can advance Orders themselves. Accounts are seeded; there is no sign-up or user management. Realizes UJ-3.

#### FR-10: Manager Login and Logout
A Manager logs in and out exactly as in FR-6, on the same login page.
- After login, a Manager lands on the Manager Dashboard; Kitchen Staff land on the Kitchen Board.
- Token lifetimes, refresh and revocation follow FR-6.

#### FR-11: Manager Dashboard
A Manager has a dashboard showing the number of Orders in each Order Status and a list of Orders.
- Only Managers can open it; Kitchen Staff see a "managers only" notice, and anonymous or Guest callers are sent to login.

#### FR-12: View All Orders
A Manager can see all Orders, Collected included, newest first, with reference, Guest name, items, total, status and time placed, and can filter by Order Status.
- At most 100 Orders are listed per view `[ASSUMPTION: no pagination in this phase]`.
- New Orders and status changes appear on an open dashboard in under 2 seconds.

#### FR-13: Manager Advances Orders
A Manager can Take, Mark Ready and Mark Collected ("deliver") an Order, under the same FR-9 rules.
- A Manager can also use the Kitchen Board.
```

**§4.4 FR-7 — change:**
```markdown
OLD: Only Kitchen Staff can view the Kitchen Board or change an Order Status.
NEW: Only Staff (Kitchen Staff or Manager) can view the Kitchen Board or change an Order Status. Only Managers can view the Manager Dashboard or the all-Orders list.
     - Kitchen Staff calling a Manager-only endpoint are rejected with 403.
```

**§5 Tests — append:** `FR-10 role-based landing, FR-12 Manager-only access (Kitchen Staff 403, Guest/anonymous 401), FR-13 Manager transitions.`

**§6 — add §6.3:**
```markdown
### 6.3 Phase 2: Manager module (added 2026-10-19)
Staff Roles, a seeded Manager account, Manager Dashboard, all-Orders list, Manager status actions, live dashboard updates. Still out of scope: staff/user management UI, menu management UI, reports and analytics beyond per-status counts, pagination.
```

**§9 — add:** `- §4.6 FR-12 — all-Orders list capped at 100, newest first; counts are all-time.` and `- §4.6 FR-13 — "deliver" means Mark Collected; no new status.`

### 4.2 Architecture (`ARCHITECTURE-SPINE.md`)

**Frontmatter** `binds:` append `FR-10, FR-11, FR-12, FR-13`; `updated: '2026-10-19'`.

**AD-4 — change Rule:**
```markdown
OLD: The principal is a discriminated union `{ kind: 'staff', staffId, sid } | { kind: 'guest', sid, orderId }`. ... `403 FORBIDDEN` is used only when a valid principal reaches a resource that is not its own.
NEW: The principal is a discriminated union `{ kind: 'staff', staffId, sid, role } | { kind: 'guest', sid, orderId }`, where `role` is shared `StaffRole` (`KITCHEN` | `MANAGER`). ... `ManagerGuard` (a `PrincipalGuard` in `auth`) admits only `role: 'MANAGER'`; it throws `403 FORBIDDEN` for other staff and `401` like `StaffAuthGuard` otherwise. `403 FORBIDDEN` is used only when a valid principal reaches a resource that is not its own or needs a role it lacks. Role checks live in guards, never in controllers or services.
```

**AD-5 — change bullet 1:** access JWT claims `staffId`, `sid`, **`role`**. **Add:** "Refresh re-reads the role from `StaffUser`; a missing account → 401."

**AD-11 — change:** "staff by unique `email`" → "staff and the manager by unique `email`, each with its `role`". Credentials come from `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` and **`SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD`**.

**AD-19 — table:** `StaffMe` gains `role`. Add the row:
```markdown
| `GET /api/v1/manager/orders?status=` | Manager | `ManagerOrdersQuery` `{ status?: OrderStatus }` | `ManagerOrdersResponse` `{ counts: Record<OrderStatus, number>, orders: KitchenOrder[] }` (newest first, max 100) |
```

**Structural Seed:** web `app/` routes add `/manager`. ER `StaffUser` adds `string role`.

**Capability map — add rows:** FR-10 → `auth`, `web/app/kitchen/login` (AD-4, AD-5); FR-11/FR-12 → `api/orders` manager controller, `web/app/manager` (AD-4, AD-10, AD-19); FR-13 → existing kitchen routes (AD-7).

**Deferred — add:** "Staff/user management UI, pagination and date filters for the all-Orders list — revisit with reports."

### 4.3 Epics (`epics.md`)

- **Requirements Inventory:** add FR10–FR13 (text as in 4.1), and update FR7.
- **FR Coverage Map:** `FR10–FR13: Epic 4`.
- **Epic List:** add Epic 4 (below).
- **Append the full Epic 4 section.** Stories as follows; the full ACs go into epics.md on apply:

| Story | Title | Covers |
| --- | --- | --- |
| 4.1 | Staff roles in data, seed and session | FR-10, FR-7; AD-4, AD-5, AD-11 |
| 4.2 | Manager all-Orders API | FR-7, FR-12; AD-4, AD-19 |
| 4.3 | Role-aware login and Manager page shell | FR-10, FR-11 |
| 4.4 | Manager Dashboard: counts, list, filter, actions | FR-11, FR-12, FR-13 |
| 4.5 | Live updates on the Manager Dashboard | FR-12; AD-10 |
| 4.6 | Manager end-to-end test (after 3.5) | UJ-3; AD-16 |

### 4.4 Sprint status (`sprint-status.yaml`)

```yaml
  epic-4: backlog
  4-1-staff-roles-in-data-seed-and-session: ready-for-dev
  4-2-manager-all-orders-api: ready-for-dev
  4-3-role-aware-login-and-manager-page-shell: ready-for-dev
  4-4-manager-dashboard-counts-list-filter-actions: ready-for-dev
  4-5-live-updates-on-the-manager-dashboard: ready-for-dev
  4-6-manager-end-to-end-test: backlog   # needs 3.5
  epic-4-retrospective: optional
```

### 4.5 New implementation artifacts

- `implementation-artifacts/epic-4-context.md`: goal, rules and cross-story dependencies for reviews.
- `implementation-artifacts/spec-4-1-…md` through `spec-4-5-…md`, each with:
  - Intent, Boundaries (Always / Never), an I/O matrix, and a Code Map pointing at real files
  - **Tasks** as numbered, single-focus checkboxes, test first: 🔴 write the failing test → 🟢 make it pass → 🔧 refactor or doc. Each task has a "Done when" line
  - Verification commands, plus a "Questions to think about" section for practice
- Spec 4.6 is written once 3.5 lands, since it reuses that Playwright harness.

### 4.6 Other

- `.env.example`: add `SEED_MANAGER_EMAIL=manager@example.com` and `SEED_MANAGER_PASSWORD=change-me-please`. Ronald adds them in Story 4.1, task list item 1. Real `.env` values are his to set.

## 5. Implementation Handoff

- **Scope:** Moderate. Backlog reorganisation plus planning-doc edits.
- **Claude (PO/SM role), on approval:** apply 4.1–4.5 to the docs and write the epic context and story specs 4.1–4.5. Claude does not change any code.
- **Ronald (Dev):** implement each story by hand on its own branch from `main` (the story-branch workflow), ticking tasks as he goes.
- **Claude (Reviewer):** when Ronald says "review story 4.x", run a code review against the spec and point out fixes with `file:line`. Claude does not apply them.
- **Success criteria:**
  - UJ-3 works by hand in two browsers (Manager plus Kitchen Staff).
  - All existing tests pass unchanged, apart from fixture and `StaffMe` updates in 4.1.
  - The new integration tests cover: role landing, Manager-only access (KITCHEN → 403, guest/anon → 401), Manager transitions, list order, the 100 cap, and the filter.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:int` are green per story.
