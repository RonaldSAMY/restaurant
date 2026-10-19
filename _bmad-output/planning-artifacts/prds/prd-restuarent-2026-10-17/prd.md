---
title: Restaurant Web App PRD
status: final
created: 2026-10-17
updated: 2026-10-19
---

# PRD: Restaurant Web App
*Working title — confirm.*

## 0. Document Purpose
This is a study/demo project built by Ronald to practise real product features end to end: guest ordering, a kitchen workflow, authentication and authorization, caching, and tests. This PRD defines **what** the MVP does (2-day timebox). Technology choices and implementation notes live in `addendum.md`. Inferred items are tagged `[ASSUMPTION]` and indexed in §9.

## 1. Vision
Guests browse the public Menu, place an Order without creating an account, and follow it through the kitchen in real time using an Order Reference. Kitchen Staff log in to the Kitchen Board and move each Order from *Received* → *Preparing* → *Ready* → *Collected*. The chain is complete once the Guest collects the food.

The MVP deliberately runs a single kitchen with no payment. Later phases bring back kitchen sections, takeout, customer accounts with order history, and promo coupons built on that history — each chosen because it exercises a new piece of the stack.

## 2. Target User

### 2.1 Jobs To Be Done
- **Builder (Ronald):** practise and demonstrate a realistic full-stack feature set — secured APIs, session handling, caching, live updates, tested auth rules.
- **Guest:** see what's on offer, order quickly with no sign-up, and know when the food is ready.
- **Kitchen Staff:** see every incoming Order in one place and tell Guests where it stands with one action.
- **Manager:** see every Order and how the kitchen is doing at a glance, and step in to take or hand over Orders when the kitchen is busy.

### 2.2 Key User Journeys
- **UJ-1. Lena orders lunch without an account.** Lena opens the site, browses the Menu, adds two dishes and a drink, enters her name, and places the Order. She sees her Order Reference and a status of *Received*. She accidentally refreshes the page — her Order is still there. A few minutes later the status changes to *Preparing*, then *Ready*, without her reloading. She collects her food at the counter and the page shows *Collected*; her Guest Session ends. The next day she comes back and orders from scratch, as if for the first time. **Edge case:** on another device, she types her Order Reference to see the same status.
- **UJ-2. Omar runs the kitchen board.** Omar logs in as Kitchen Staff and sees the Kitchen Board with Lena's Order in *Received*. He takes it (*Preparing*), marks it *Ready* once it's plated, and marks it *Collected* when Lena picks it up — it leaves the board. At shift end he logs out; his session can no longer be used.
- **UJ-3. Mia manages the evening shift.** Mia logs in on the same staff login page and lands on the Manager Dashboard: counts of Orders per status and a list of all Orders, newest first, including Collected ones. The kitchen is busy, so she takes a Received Order herself and, when it's plated, marks it Ready and then Collected as she hands it over. Every change shows up live on the Kitchen Board and the Guest's tracking page. Omar (Kitchen Staff) tries to open the dashboard and is told it is for managers only. At the end of the shift Mia logs out.

## 3. Glossary
- **Guest** — an unauthenticated customer. Places Orders; holds a Guest Session.
- **Guest Session** — a session issued to a Guest when they place an Order; lets them return to that Order after a page refresh without re-entering the Order Reference. One Guest Session tracks one Order. It ends when that Order is *Collected* or 24 hours after the Order was placed, whichever comes first. While it is active, the Guest cannot place another Order.
- **Staff** — an authenticated user with one Staff Role: Kitchen Staff or Manager.
- **Staff Role** — `KITCHEN` or `MANAGER`; set by the seed, no UI to change it.
- **Kitchen Staff** — Staff with role `KITCHEN`; manages Orders on the Kitchen Board.
- **Manager** — Staff with role `MANAGER`; everything Kitchen Staff can do, plus the Manager Dashboard.
- **Manager Dashboard** — the Manager's view of all Orders (Collected included) with per-status counts and the same status actions as the Kitchen Board.
- **Kitchen Board** — the Kitchen Staff view of open Orders (not yet *Collected*) grouped by Order Status.
- **Menu** — the public list of Menu Items, grouped by category.
- **Menu Item** — a dish or drink with name, description, price, and category.
- **Order** — one or more Menu Items with quantities, placed by a Guest. Has exactly one Order Status.
- **Order Reference** — the identifier given to the Guest for an Order: 6 random letters and digits (e.g. `K7F29Q`). Short enough to type, not sequential, hard to guess.
- **Order Status** — one of, in order:
  - *Received* — placed, waiting to be taken by the kitchen.
  - *Preparing* — taken, in preparation.
  - *Ready* — waiting for the Guest to collect.
  - *Collected* — handed over; the Order is done.

## 4. Features

### 4.1 Public Menu
**Description:** Anyone can view the Menu without logging in. Menu Items are loaded from seed data. Realizes UJ-1.

#### FR-1: View Menu
A Guest can view all Menu Items grouped by category, with name, description, and price.
- The Menu loads with no authentication.
- The Menu is served from cache after the first request; re-running the seed refreshes the cache so newly added Menu Items appear.

### 4.2 Guest Ordering
**Description:** A Guest builds an Order from the Menu and submits it without an account. Realizes UJ-1.

#### FR-2: Place Order
A Guest can submit an Order with one or more Menu Items and quantities, plus their name. `[ASSUMPTION: name is required so staff can call the order; no phone/email]`
- The Order is created with Order Status *Received* and an Order Reference is shown.
- An Order with zero items, quantity < 1, or an unknown Menu Item is rejected with a clear error.
- Prices are taken from the Menu on the server, never from the client.

#### FR-3: Guest Session
On placing an Order, the Guest receives a Guest Session that survives a page refresh.
- After a refresh, the Guest lands back on their Order's status without re-entering the Order Reference.
- A Guest Session grants read access to its own Order only.
- When the Order becomes *Collected*, the Guest Session ends; a returning Guest starts fresh. No past Orders are kept on the device.
- A Guest Session expires 24 hours after the Order is placed, even if the Order was never collected.
- While a Guest Session's Order is not *Collected*, that Guest cannot place another Order; the attempt is rejected with a message pointing to the open Order. (Enforced per Guest Session — a different device or cleared browser is a new Guest; acceptable for the MVP.)

### 4.3 Order Tracking
**Description:** A Guest follows their Order's progress live. Realizes UJ-1.

#### FR-4: Track by Order Reference
An Order's status, items, and Guest name can be viewed through its own Guest Session or by entering its Order Reference, until 24 hours after the Order was placed.
- After 24 hours, the Order returns "not found" to Guests — the Order itself stays stored (see §5 Data retention).
- An unknown Order Reference returns "not found" and does not reveal whether other Orders exist.
- Order References cannot be enumerated (not sequential).

#### FR-5: Real-Time Status Updates
An Order Status change is pushed to the open tracking page in real time, without a reload.
- A status change made on the Kitchen Board appears on the tracking page in under 2 seconds. `[ASSUMPTION: 2 s target]`

### 4.4 Kitchen Staff Access
**Description:** Kitchen Staff authenticate to reach the Kitchen Board. Accounts are seeded; there is no sign-up `[ASSUMPTION]`. Realizes UJ-2.

#### FR-6: Staff Login and Logout
Kitchen Staff can log in with email and password and log out.
- A wrong email or password returns one generic error.
- The access token lasts 5 minutes and the refresh token 1 hour; the session survives page refreshes. `[ASSUMPTION: refresh token rotates on use, so active staff stay logged in and idle >1 hour must log in again]`
- After logout, the old session and its refresh token are rejected.

#### FR-7: Role-Based Authorization
Only Staff (Kitchen Staff or Manager) can view the Kitchen Board or change an Order Status. Only Managers can view the Manager Dashboard or the all-Orders list. *(Widened 2026-10-19 for §4.6.)*
- Kitchen Staff calling a Manager-only endpoint are rejected with 403.
- Requests with no session or a Guest Session to Kitchen Staff endpoints are rejected (401/403).
- A Guest Session never grants access to any Order other than its own.

### 4.5 Kitchen Board
**Description:** One board for the whole kitchen, with open Orders grouped into *Received*, *Preparing*, and *Ready* columns, oldest first. Realizes UJ-2.

#### FR-8: View Orders
Kitchen Staff can see all open Orders grouped by Order Status, with items, quantities, Guest name, and time placed.
- New Orders and status changes made by any Kitchen Staff appear on every open Kitchen Board in under 2 seconds.
- *Collected* Orders no longer appear on the board. A *Ready* Order stays on the board until Kitchen Staff mark it *Collected*.

#### FR-9: Advance Order Status
Kitchen Staff can move an Order forward one step: Take (Received → Preparing), Mark Ready (Preparing → Ready), Mark Collected (Ready → Collected).
- Skipping a step or moving backwards is rejected. `[ASSUMPTION: forward-only, no undo]`
- *Collected* is final; a *Collected* Order cannot change again.

### 4.6 Manager
**Description:** Managers log in like Kitchen Staff, oversee every Order on a dedicated dashboard, and can advance Orders themselves. Accounts are seeded; there is no sign-up or user management. Realizes UJ-3. *(Added 2026-10-19, Phase 2.)*

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

## 5. Cross-Cutting NFRs
- **Security:** Passwords are stored hashed. Every endpoint enforces authorization on the server.
- **Data retention:** Every Order is stored permanently, including after Guest access ends, for future customer accounts and order history.
- **Tests:** Automated tests cover FR-2 validation, FR-3 one-open-Order rule and Guest Session expiry, FR-4 24-hour access window, FR-6 login/logout/refresh/revocation, FR-7 authorization (every protected endpoint rejects Guest Sessions and anonymous calls), and FR-9 status transitions. Phase 2 adds FR-10 role-based landing, FR-12 Manager-only access (Kitchen Staff 403, Guest/anonymous 401), and FR-13 Manager transitions.
- **Responsiveness:** The Menu and tracking pages work on a phone screen. The Kitchen Board targets a tablet or desktop.

## 6. MVP Scope

### 6.1 In Scope (2 days)
Public Menu (seeded), guest ordering, Guest Session, tracking by Order Reference with real-time updates, Kitchen Staff login/logout, single Kitchen Board with forward-only status changes through to *Collected*, Menu caching, auth/authz tests.

### 6.2 Out of Scope for MVP
- **Kitchen sections** (à la carte, fast food & drinks) — single kitchen keeps the MVP simple. Planned next, and likely a natural use for the message queue.
- **Takeout** — as an order type.
- **Payment** of any kind.
- **Cancelled state** — not supported.
- **Past Orders for Guests** — Guests lose access 24 hours after placing an Order (FR-4); history comes with customer accounts.
- **No-show handling** — an uncollected Order stays on the Kitchen Board until Kitchen Staff mark it *Collected*.
- **Menu management UI and staff account management** — seed data only.
- **Message queue** — deferred.
- **Post-MVP:** customer accounts with order history; promo coupons based on order history.

### 6.3 Phase 2: Manager module (added 2026-10-19)
Staff Roles, a seeded Manager account, Manager Dashboard, all-Orders list, Manager status actions, live dashboard updates. Still out of scope: staff/user management UI, menu management UI, reports and analytics beyond per-status counts, pagination.

## 7. Success
The demo works end to end: UJ-1 and UJ-2 run in one session with two browsers. All tests listed in §5 pass. **Counter-metric:** don't grow scope to "look complete" — features beyond §6.1 wait until after the 2 days.

## 8. Open Questions
None.

## 9. Assumptions Index
Accepted as MVP defaults at finalize (2026-10-17); revisit when customer accounts or admin screens arrive.
- §4.1 — Menu comes from seed data; no admin UI.
- §4.2 FR-2 — Guest gives a name only; no phone or email.
- §4.3 FR-5 — Real-time updates arrive in under 2 seconds.
- §4.4 — Kitchen Staff accounts are seeded; no sign-up.
- §4.4 FR-6 — Refresh token rotates on use; idle >1 hour requires login.
- §4.5 FR-9 — Status changes are forward-only with no undo.
- §4.6 FR-12 — all-Orders list capped at 100, newest first; counts are all-time.
- §4.6 FR-13 — "deliver" means Mark Collected; no new status.
