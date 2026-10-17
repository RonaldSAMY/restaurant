# Addendum — Restaurant Web App

Purpose: study/demo project; features are chosen to exercise each technology for real.

## Tech stack (user decision, 2026-10-17)
- Backend: NestJS
- Frontend: Next.js
- ORM / DB: Prisma + PostgreSQL
- Cache + token store: Redis
- Message queue: RabbitMQ (deferred; see below)
- Authentication + authorization: set up in the MVP, with tests.

## Redis usage (user decision)
- Cache Menu Items (read-heavy public Menu).
- Store JWT sessions / refresh tokens for Kitchen Staff (enables logout/revocation).
- Guests get a Guest Session too: after placing an Order, an opaque random session id in an httpOnly cookie (Redis `guest:session:{sid}` → orderId, valid until the Order is Collected or 24 h after placement) re-establishes the session after a page refresh so they keep following their Order Status. No guest JWT or refresh token. (Updated 2026-10-17 by architecture spine AD-6; supersedes the earlier "refresh token" wording.)

## Deferred tech
- RabbitMQ: not used in the MVP. Natural post-MVP use: publish order events to per-section kitchen queues once sections return.

## Research notes (2026-10-17 digest)
- Comparables (Toast KDS, Odoo Preparation Display, TastyIgniter KDS) route items to per-section screens; an order is Ready only when every section's slice is done. Relevant when sections return post-MVP.
- Order identifiers (industry practice): long random token in the tracking link, short number (e.g. "#A42") for display. Sequential IDs in URLs are the classic OWASP IDOR example.
- Coupons from order history (post-MVP): single-use per-customer codes; cap auto-discounts; common triggers are lapsed guest (30-60 days), nth order, favourite item.
- Live status delivery mechanism (polling vs SSE vs WebSocket) is an architecture decision (resolved below).

## Finalize decisions (2026-10-17)
- Real-time delivery: WebSocket (user preference) pushes Order Status changes to open tracking pages and the Kitchen Board.
- Staff tokens: access token 5 min; refresh token 1 h, stored in Redis, rotated on use, revoked on logout.
- Order data retention: every Order is kept in PostgreSQL permanently (for future customer accounts and order history). The 24 h rule in the PRD limits access, not storage.
- Order Reference: 6-character random alphanumeric (e.g. K7F29Q), unique, generated server-side.
