---
id: SPEC-restuarent
companions:
  - glossary.md
  - user-journeys.md
  - ../../planning-artifacts/architecture/architecture-restuarent-2026-10-17/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/prds/prd-restuarent-2026-10-17/prd.md
  - ../../planning-artifacts/prds/prd-restuarent-2026-10-17/addendum.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Restaurant Web App — MVP

Terms in Title Case (Guest, Guest Session, Order Reference, Kitchen Board, …) are defined in `glossary.md`. All HOW (modules, endpoints, payloads, error codes, cookies, infra, stack versions) is fixed by `ARCHITECTURE-SPINE.md`.

## Why

A **vision to realize** for a study/demo project: Ronald practises a realistic full-stack feature set end to end — guest ordering, a kitchen workflow, authentication and authorization, caching, live updates, and tested auth rules — inside a 2-day MVP. Guests order without an account and follow their Order live; Kitchen Staff move each Order Received → Preparing → Ready → Collected. Each later phase (kitchen sections, takeout, customer accounts, coupons) is chosen to exercise a new piece of the stack.

## Capabilities

- **CAP-1** View Menu
  - **intent:** Anyone can view all Menu Items grouped by category, with name, description, and price, without logging in.
  - **success:** Anonymous request returns the grouped Menu; after the first request it is served from cache; re-running the seed makes newly added Menu Items appear.
- **CAP-2** Place Order
  - **intent:** A Guest can submit an Order of one or more Menu Items with quantities plus their name, without an account.
  - **success:** Order is created as Received and its Order Reference is shown; zero items, quantity < 1, or an unknown Menu Item is rejected with a clear error; stored prices come from the Menu, never the client.
- **CAP-3** Guest Session
  - **intent:** Placing an Order gives the Guest a Guest Session that brings them back to that Order after a page refresh.
  - **success:** After refresh the Guest lands on their Order's status without re-entering the reference; the session reads only its own Order; it ends when the Order is Collected or 24 h after placement (whichever first), after which the Guest starts fresh with no past Orders on the device; while open, a second Order is rejected with a message pointing to the open Order (per session — a new device or cleared browser is a new Guest).
- **CAP-4** Track by Order Reference
  - **intent:** An Order's status, items, and Guest name can be viewed through its Guest Session or by typing its Order Reference, until 24 h after placement.
  - **success:** After 24 h the Order returns "not found" to Guests while staying stored; an unknown reference returns the same "not found" and reveals nothing about other Orders; references cannot be enumerated.
- **CAP-5** Real-time status for Guests
  - **intent:** An Order Status change is pushed to the open tracking page without a reload.
  - **success:** A change made on the Kitchen Board appears on the tracking page in under 2 s.
- **CAP-6** Staff login and logout
  - **intent:** Kitchen Staff can log in with email and password and log out.
  - **success:** Wrong email or password yields one generic error; access token lasts 5 min, refresh token 1 h and rotates on use, so active staff stay logged in across page refreshes and staff idle > 1 h must log in again; after logout the old session and its refresh token are rejected.
- **CAP-7** Role-based authorization
  - **intent:** Only Kitchen Staff can view the Kitchen Board or change an Order Status.
  - **success:** Every Kitchen Staff endpoint rejects anonymous calls and Guest Sessions; a Guest Session never grants access to any Order other than its own.
- **CAP-8** View Kitchen Board
  - **intent:** Kitchen Staff see all open Orders grouped into Received, Preparing, and Ready, oldest first, with items, quantities, Guest name, and time placed.
  - **success:** New Orders and status changes made by any Kitchen Staff appear on every open Kitchen Board in under 2 s; a Ready Order stays until marked Collected; Collected Orders leave the board.
- **CAP-9** Advance Order Status
  - **intent:** Kitchen Staff move an Order one step forward: Take (Received → Preparing), Mark Ready (Preparing → Ready), Mark Collected (Ready → Collected).
  - **success:** Skipping a step or moving backwards is rejected; Collected is final; when two staff advance the same Order at once, exactly one succeeds.

## Constraints

- 2-day timebox; build only this MVP scope.
- Single kitchen; no payment.
- Prices and item names are copied from the Menu at placement; client-sent prices are ignored; money is integer cents.
- Every Order, including the Guest name, is stored permanently and never deleted; the 24 h rule limits Guest access, never storage.
- Guest name is not unique (two Guests may share a name at the same time) and must never be used to identify or look up an Order.
- Order Reference: 6 characters `[A-Z0-9]`, random from a CSPRNG, unique, server-generated, looked up case-insensitively; Guest-facing data never exposes the internal Order id.
- Passwords stored hashed; every endpoint enforces authorization on the server, default deny; the client may hide actions but never decides validity.
- Guests carry no JWT: the Guest Session is an opaque server-side session id.
- Live updates use WebSocket.
- Stack is fixed: NestJS, Next.js, Prisma + PostgreSQL, Redis (Menu cache, staff sessions/refresh tokens, Guest Sessions), all containerized.
- Menu and tracking pages work on a phone; the Kitchen Board targets tablet/desktop.
- Menu Items and Kitchen Staff accounts come from seed data only; Guests give a name only (no phone or email).
- Tests run against real PostgreSQL and Redis; time-based expiry must be testable without waiting.

## Non-goals

- Kitchen sections (à la carte, fast food & drinks) — planned next.
- Takeout as an order type.
- Payment of any kind.
- Cancelled state; undo of a status change.
- Past Orders for Guests; customer accounts and order history; promo coupons.
- No-show handling — an uncollected Order stays on the board until marked Collected.
- Menu management UI; staff sign-up or account management.
- Allergen or dietary information on Menu Items.
- Deleting Guest personal data.
- Message queue (RabbitMQ).
- Public hosting, real TLS certificates, backups.
- Any feature added to "look complete".

## Success signal

- UJ-1 and UJ-2 (`user-journeys.md`) run end to end in one session with two browsers, including live updates under 2 s.
- Automated tests pass covering: CAP-2 validation; CAP-3 one-open-Order rule and Guest Session expiry; CAP-4 24 h access window; CAP-6 login, refresh, logout, and revocation; CAP-7 every protected endpoint rejecting Guest Sessions and anonymous calls; CAP-9 status transitions.
