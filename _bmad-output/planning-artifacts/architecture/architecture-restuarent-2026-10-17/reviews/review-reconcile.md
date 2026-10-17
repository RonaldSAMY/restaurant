# Review — Reconcile inputs against ARCHITECTURE-SPINE.md

- Date: 2026-10-17
- Inputs: `prd.md`, `addendum.md`, `.memlog.md` (overrides addendum where stated)
- Target: `ARCHITECTURE-SPINE.md` (status: draft). Not edited.

## Verdict

**Pass with fixes.** Almost every PRD requirement and memlog decision landed in the spine, and nothing in it contradicts a core requirement. The gaps are: one user code standard that got narrowed, the user's "every flow easy to understand" direction only partly delivered, the 24 h expiry rule in a place tests cannot control, and a few behaviours the PRD needs but no AD covers. None of them needs a redesign. Each is a sentence or a table row.

## Findings

Severity: High = contradicts a user decision or blocks an acceptance criterion; Medium = requirement missing, so build agents will guess; Low = small omission or inconsistency.

### M-1 — TSDoc rule narrowed to exported symbols (memlog code standard distorted) — Medium
- Memlog (constraint, user): "doc comments describe purpose of **every** class, method, property".
- Spine AD-17 and the Conventions "Comments" row: "Every **exported** class, method, property…". Private methods, non-exported classes, and class properties that are not exports fall outside the rule.
- Fix: drop "exported", or state the scope the user actually asked for (every class, method, property; exported functions/types/schemas too).

### M-2 — "All flows easy to understand" direction only partly delivered — Medium
- Memlog (direction): audience is study plus interviewers; "all flows must be easy to understand -> extra human-facing rendering of flows needed at finalize".
- The spine has diagrams for the module import graph, the status state machine, one sequence (kitchen status change), containers, and the ER model. It has no flow for: UJ-1 place order + Guest Session cookie + refresh landing; staff login → access expiry → refresh rotation → logout + socket disconnect; socket connect/room assignment for guest, staff and `order.subscribe`; the 409 one-open-Order path.
- The spine also does not say where the "extra human-facing rendering" will live (a companion doc, or the spine itself) or that it is still owed at finalize.
- Fix: add those sequences, or add a tracked finalize item / companion (for example `FLOWS.md`) listed under `companions`.

### M-3 — 24 h expiry depends on Redis TTL, but tests are told to control time with `Clock` — Medium
- PRD FR-3 / FR-4 and §5 Tests require automated tests for Guest Session expiry and the 24 h tracking window.
- AD-6 enforces Guest Session expiry only through cookie expiry and the Redis TTL on `guest:session:{sid}`. AD-16 says time-dependent rules "take an injected `Clock` port so tests control time". A `Clock` fake cannot advance Redis TTLs or browser cookie expiry, so an integration test cannot exercise the AD-6 expiry path as written.
- The reference-lookup 24 h rule (AD-8: "unknown or expired reference → 404") is not assigned to any domain class or policy, and the spine does not say what it compares against (`placedAt + 24h` vs `Clock.now()`).
- Fix: state that `GuestSessionPolicy` (or a separate `OrderAccessWindow`) checks `placedAt + 24h > clock.now()` on every guest/reference access, with the Redis TTL as cleanup only. The same applies to staff token TTL checks if those are to be tested with `Clock`.

### M-4 — FR-3 "lands back on their Order after a refresh" has no endpoint or route behaviour — Medium
- PRD FR-3: after a refresh the Guest lands back on their Order's status *without re-entering the Order Reference*. UJ-1 repeats this.
- The spine defines the cookie and guard (AD-6), but no endpoint that resolves "my current Order" from the guest cookie (for example `GET /api/v1/orders/current`), and no web behaviour for a guest who opens `/` or `/track` with a live session (redirect to `/track/[reference]`?). `GuestSessionGuard` is defined, yet no route in the spine uses it.
- Fix: name the guest-session read endpoint and the web landing/redirect rule in AD-6 or AD-12.

### M-5 — Re-seeding the Menu can break retained Orders — Medium
- PRD §5 Data retention: every Order is stored permanently. FR-1: re-running the seed refreshes the Menu.
- AD-9 says Orders are never deleted, and `OrderItem` snapshots only `unitPriceCents`. Item names come from the FK to `MenuItem`. The spine does not say whether the seed may delete or recreate `MenuItem` rows. A truncate-and-insert seed would fail on the FK or orphan retained `OrderItem`s, and the board and tracking page would lose item names.
- Fix: the seed upserts Menu Items by a stable key and never deletes them (or `OrderItem` also snapshots `name`). Pick one and state it in AD-9 or AD-11.

### M-6 — Build order differs from the user's "containers first" constraint — Medium/Low
- Memlog (constraint, user): "standing up the stack in containers is the **first** build step".
- Spine Structural Seed: step 1 = "monorepo + lint/format + CI skeleton → `packages/shared` → compose stack … → features". Containers come third.
- This is defensible (the compose stack needs the workspace to exist), but it should be said plainly or reordered so the user's stated first step stays first: workspace skeleton + compose stack (empty apps, healthchecks, proxy, migrate, seed) before shared contracts and CI.

### L-1 — 2-day timebox and scope counter-metric are missing — Low
- PRD §0/§6.1/§7: 2-day MVP; counter-metric "don't grow scope to look complete". The spine never mentions the timebox. Several items the user did ask for (CI, nightly e2e, Caddy, compose.test, throttler) are heavy for 2 days, and the spine has no priority note marking what to cut if time runs short.
- Fix: one line in Build order naming what can slip (for example nightly e2e, image build in CI) without breaking §7 Success.

### L-2 — Kitchen Board "oldest first" ordering not captured — Low
- PRD §4.5: columns ordered oldest first. Not in AD-10/AD-12 or the shared snapshot contract. Add "sorted by `placedAt` ascending, server-side".

### L-3 — FR-2 "unknown Menu Item" has no error code — Low
- PRD FR-2: zero items, quantity < 1, or unknown Menu Item rejected with a clear error. The first two are Zod (400). An unknown Menu Item is only found when the service checks the DB, and AD-13 lists no code for it (for example `MENU_ITEM_NOT_FOUND`, 400 or 422). Add it to the ErrorCode list and status map.

### L-4 — Client-side token refresh flow not specified — Low
- PRD FR-6: the session survives page refreshes, and active staff stay logged in through rotation. The spine defines the refresh endpoint semantics but not who calls refresh (web on 401 then retry once? proactive timer?). It also doesn't say how a Socket.IO reconnect behaves after the 5-min access token has expired, given the handshake authenticates from the access cookie. Different agents will build different behaviour here.

### L-5 — ER diagram is missing fields the ADs and PRD require — Low
- `MenuItem` lacks `name`, `description` (FR-1). `Order` lacks `totalCents` (named in AD-9; stored or computed is not stated). `OrderItem` shows no `menuItemId`. Either complete the diagram or label it "key fields only".

### L-6 — Compose ordering for `seed` not stated — Low
- Memlog: "migrate + seed as one-shot services **before api**". AD-15 makes `api` wait only for `migrate`. The seed also needs Redis (cache invalidate), and its order relative to `api` is unstated. Not harmful, but it drifts from the decision as written.

### L-7 — Addendum update owed but not tracked — Low
- Memlog (event): the addendum should be updated for the Guest Session change (offer at finalize). AD-6 records the supersession but does not track the follow-up, and the addendum still says "a refresh token re-establishes the session". Add it as a finalize action so the two sources stop disagreeing.

### L-8 — SOLID and the Coaching working mode are not reflected — Low
- Memlog code standard: "respect SOLID and design patterns without over-complicating". AD-17 covers patterns and the anti-over-abstraction rule but never says SOLID.
- Memlog decision: Coaching path. Ronald writes no code and reviews everything. The spine is a build substrate for agents but says nothing about reviewable unit size or review gates. Possibly out of the spine's scope; mention it in one line if it should constrain how agents slice work.

### L-9 — Next.js caching could defeat the "re-seed refreshes Menu" rule — Low
- FR-1/AD-11 handle the Redis cache. The Menu page is server-rendered (AD-12), and if Next caches that fetch or route, new Menu Items won't appear after re-seed even though `menu:v1` was cleared. State that the Menu page renders dynamically (no Next data cache), or revalidate it from the seed.

### L-10 — Working-title typo frozen into package names — Low
- PRD title is "*Working title — confirm*". The spine bakes `restuarent` (misspelled) into `@restuarent/shared` and the repo layout. Confirm the name before scaffold. Renaming a package scope later touches every import.

## Checked and landed (no finding)

FR-1 cache-aside and seed invalidation; FR-2 server-side prices, integer cents, snapshot; FR-3 opaque cookie, one-open-Order 409, own-Order-only access, lazy end on Collected; FR-4 non-enumerable 6-char CSPRNG reference, same 404 for unknown/expired, throttled; FR-5/FR-8 Socket.IO, server-assigned rooms, emit after commit, refetch on reconnect, < 2 s in e2e; FR-6 5 min / 1 h cookies, rotation, `sid` checked so logout kills the access token at once, argon2id, generic `INVALID_CREDENTIALS`, socket disconnect on logout; FR-7 two principals and guards, default deny, 401/403; FR-9 forward-only state machine, atomic conditional update, 409 loser; NFR security/retention/tests/responsiveness; all memlog decisions on repo, shared Zod package (no Prisma/rules/routes, CJS + d.ts), modular monolith with ports, Docker topology, Caddy, testing on real infra with fixture builders, CI pipeline, error envelope, env fail-fast, Logger with reference, lint/Prettier, all version pins (incl. `prisma@7`, eslint-config-prettier >= 10.1.8), post-MVP Clean/DDD and RabbitMQ deferral.
