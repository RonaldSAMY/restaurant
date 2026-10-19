---
title: 'Pre-Epic-2 hardening: principal guard, validation issues, error filter'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four deferred Epic 1 gaps: default deny passes any `PrincipalGuard` subclass that returns true without setting a principal; `VALIDATION_FAILED` details are untyped; `ErrorEnvelopeFilter` may log Prisma call arguments (secrets) via the error stack; and the filter assumes an HTTP host, which breaks for the planned Socket.IO gateway.

**Approach:**
1. `PrincipalGuard` gets a final (non-overridable by convention, enforced by `DefaultDenyGuard`) `canActivate` that calls abstract `authenticate(context)` returning the AD-4 `Principal` union or `null`; null → `401 UNAUTHENTICATED`, otherwise the principal is set on `req.principal`. `DefaultDenyGuard` only accepts a `PrincipalGuard` whose `canActivate` is the base one. Negative tests: null principal → 401; subclass overriding `canActivate` → 403.
2. Export `ValidationIssueSchema` `{ path, message }` (+ type) from `packages/shared`; the filter types `VALIDATION_FAILED` details with it.
3. Verify empirically whether a Prisma validation error's stack carries call arguments; if so, log Prisma errors as name (+ code) + stack frames only, with a test.
4. `ErrorEnvelopeFilter` writes no response for non-`http` hosts (unexpected errors are still logged), with a unit test.
5. Mark the matching `deferred-work.md` entries resolved; add a WS default-deny/principal-guard AC to Story 3.4 in `epics.md`.

</frozen-after-approval>

## Implementation Notes

- `Principal` union (AD-4) and `PrincipalRequest` live in `default-deny.guard.ts`; TS has no `final`, so `DefaultDenyGuard` enforces it at runtime (`proto.canActivate === PrincipalGuard.prototype.canActivate`). Null principal throws `DomainError('UNAUTHENTICATED')` → 401, per AD-4.
- Prisma verified empirically (Prisma 7.10.1): a `PrismaClientValidationError` stack contains the pretty-printed call (`name: "prisma-arg-marker"`); the new test failed before the fix. Errors whose `name` starts with `PrismaClient` now log `name [code]` + `    at` frames only.
- `VALIDATION_FAILED` details typed in the filter as `ValidationIssue[]`; `ErrorEnvelopeSchema.details` stays `unknown` (clients parse with `ValidationIssueSchema.array()`), so `DomainError` callers are unaffected.
- Non-HTTP hosts: filter still runs `toEnvelope` (logs unexpected errors), then returns before `switchToHttp()`.
- Tests: 4 new cases in `apps/api/test/conventions.int-spec.ts` (principal set, null → 401, override → 403, Prisma redaction), new `apps/api/src/common/error-envelope.filter.spec.ts`. `pnpm test:int` 42/42, `pnpm test` green, lint + typecheck clean.
- Docs: 5 entries in `deferred-work.md` given `status:` (DefaultDeny entry only partly — 500 route logging and `DomainError.details` narrowing remain); Story 3.4 got a WS default-deny/error-ack AC.


## Review Triage Log

- Class-field `canActivate` override bypasses the prototype check — high, real: own field shadows prototype. Patched: `PrincipalGuard` constructor pins a non-writable `canActivate`; `default-deny.guard.spec.ts` asserts construction throws.
- Filter silences gateway errors incl. guard denials — medium, real for the AC wording (gateway-scoped filters take precedence in Nest). Patched the Story 3.4 AC: gateway-scoped `@UseFilters` answers handler errors and guard denials.
- `PrincipalGuard` is HTTP-only — medium, real but no gateway exists yet. Patched the Story 3.4 AC to require a context-aware `canActivate`.
- `PrincipalRequest` drops express types and keeps `principal` optional — low, rejected: no guarded handler exists yet; Story 3.1 adds the first real guards and can add a principal param decorator.
- Wrapped Prisma errors / `DriverAdapterError` escape redaction — maybe-false (medium if true), deferred with a probe to settle it.
- Prisma `meta` dropped from logs — low, rejected: unverified that `meta` is value-free under the pg adapter; frames + code locate the call.
- Instance-form guard untested — false: `probe/principal-instance` covers it; async/throwing `authenticate` paths go through the same awaited call (low, rejected).
- Filter spec leaks spy / never asserts no-log — low, patched: `afterEach(vi.restoreAllMocks)` and `not.toHaveBeenCalled()` for the expected error.
- Spec status vs ledger mismatch — false: status is set to `done` at finalize; the remaining DefaultDeny items stay open in their own ledger entry.
- Prisma probe relies on incidental details — false: `toContain('PrismaClientValidationError')` asserts the error class before the redaction check.
