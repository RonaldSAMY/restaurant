---
title: 'Story 2.3: Track by Order Reference API'
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

**Problem:** A Guest on another device (or with a lost cookie) has no way to see their Order; only the original browser's Guest Session can read it.

**Approach:** Add `GET /api/v1/orders/by-reference/:reference` — `@Public()`, throttled per client IP — that normalizes the reference to upper case and returns `GuestOrderView` while `clock.now() < placedAt + 24 h`. Unknown and expired references return the identical `404 ORDER_NOT_FOUND`; Orders are never deleted. `trust proxy` is already set (Story 3.1), so the throttle is per client.

</frozen-after-approval>

## Implementation Notes

- `GET by-reference/:reference` in `orders.controller.ts`: `@Public()`, `ThrottlerGuard` + `REFERENCE_LOOKUP_THROTTLE` (30 per 60 s per client IP, failed lookups included), `Cache-Control: no-store`.
- `OrderReference.normalize` checks `[A-Za-z0-9]{6}` before upper-casing (ASCII only, so `ß` → `SS` can never form a reference). Malformed input gets the same 404 with no DB query.
- `OrdersService.byReference` reuses `GuestSessionPolicy.expiresAt` for the 24 h window. Collected Orders stay visible until then; only the session ends at Collected.
- `OrderRepository.findByReference` (port + Prisma adapter), items ordered by `position`.
- `trust proxy` was already set in `configure-app.ts` (Story 3.1). The test asserts that limits are per `X-Forwarded-For` client.
- The throttler is still registered (global) in `AuthModule`. Moving it to `AppModule` broke `SeedModule`, which boots `AuthModule` alone, so that change was reverted and deferred.
- Tests: `test/order-lookup.int-spec.ts` (case, Collected, 24 h boundary, identical 404s plus row retained, throttle on failed lookups) and `normalize` cases in `order-reference.spec.ts`.

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | The 24 h lookup rule is inline in the service, not a domain function | low | reject | It reuses `GuestSessionPolicy.expiresAt`. The `Date >=` comparison is correct through `valueOf`. Structural only. |
| 2 | The orders throttle depends on `ThrottlerModule.forRoot` in `AuthModule` | medium | defer | It is real coupling. Moving the registration to `AppModule` crashed `SeedModule`, which imports `AuthModule` without `AppModule`, so the fix is bigger than a simple patch. |
| 3 | The throttle config lives in the controller, and the budget is per handler | low | patch (doc) | The comment now says that sharing the config does not share the budget. Moving the file was rejected as cosmetic. |
| 4 | No test shows that failed lookups use up the throttle | medium | patch | The throttle test now sends unknown and malformed references, then gets a 429 on a valid one. |
| 5 | `no-store` is missing on 404/429 error responses | low | reject | The fix would mean editing the global filter. Caddy does not cache, and the body is identical either way. |
| 6 | The JSDoc says "identical", but malformed timing differs | low | reject | The timing difference reveals only what the client already knows (the format). |
| 7 | No test covers a spoofed `X-Forwarded-For` chain | false | reject | With `trust proxy = 1`, Express takes the rightmost entry, which Caddy appends. Client-supplied left-hand entries are ignored. This is Story 3.1 config. |
| 8 | Lookups are not logged | low | reject | The epic requires `reference` on order log lines, not a log line per lookup. A per-lookup log would add noise for guessing traffic. |
| 9 | The spec's Implementation Notes are empty | low | patch | Filled in. |
| 10 | Legitimate refreshes behind NAT may hit 30/min | maybe-false | reject | 30/min is generous for manual refresh, and live updates arrive in Epic 3. Even if hit, this is only low. |
