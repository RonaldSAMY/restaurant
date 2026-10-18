---
title: 'Story 1.3: Shared contracts and API conventions'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: '001558966ba8c6c4a218be2f51c6dfbb7d0e1733'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The api has no wire contract, no error shape and no authorization default: any new route is public, unvalidated and answers errors in Nest's default format.

**Approach:** Put `OrderStatusSchema`, `ErrorCodeSchema` and `ErrorEnvelopeSchema` in `@restaurant/shared`. In api `common/`, register one global exception filter (AD-13 envelope), one global default-deny guard (`@Public()` or a principal guard required), and the global nestjs-zod `ZodValidationPipe`. Prove all three with integration tests on test-only routes.

## Boundaries & Constraints

**Always:** `ErrorCode` is exactly the 10 AD-13 codes. Shared depends only on `zod`; the code→HTTP-status map lives in the api. Filter, guard and pipe are registered once in `AppModule` (`APP_FILTER`/`APP_GUARD`/`APP_PIPE`), so tests and prod use the same wiring. The filter never logs request headers, cookies or bodies, only the error's stack. TSDoc on all new code. nestjs-zod 5.5.x, `@nestjs/testing` ~11.2.7.

**Decision (user, 2026-10-18):** Nest HTTP errors with no AD-13 code (unknown route 404, 405, 413 …) keep their HTTP status with code `INTERNAL`; 400→`VALIDATION_FAILED`, 401→`UNAUTHENTICATED`, 403→`FORBIDDEN`, 429→`RATE_LIMITED`.

**Never:** No `StaffAuthGuard`/`GuestSessionGuard` implementations (Epics 2/3), no Menu schemas (1.4), no route constants in shared, no web changes beyond dropping `APP_NAME`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undecorated route | `GET` a route with no `@Public()` and no principal guard | `403 {error:{code:"FORBIDDEN",message}}`; handler never runs | guard returns false |
| Principal guard | route with `@UseGuards(G)`, `G extends PrincipalGuard`, allowing | `200`, handler runs | N/A |
| Public route | `GET /api/v1/health` | `200 {"ok":true}` | N/A |
| Invalid body | `POST` public probe with `{name: 1}` (schema `{name: string}`) | `400 VALIDATION_FAILED`, `details: [{path:"name",message}]` | pipe |
| Malformed JSON | body `{` with JSON content type | `400 VALIDATION_FAILED` | body parser |
| Domain error | handler throws `new DomainError('ORDER_ALREADY_OPEN', msg, {reference})` | `409`, envelope with that code, message, details | N/A |
| Crash | handler throws `new Error('boom')`, request has a cookie and `password` body field | `500 INTERNAL`, generic message (not `boom`) | logged stack contains neither cookie nor password |
| Other HTTP error | unknown route `GET /api/v1/nope` | `404 {error:{code:"INTERNAL",message}}` | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/index.ts` -- only `APP_NAME` today (placeholder); used by `apps/api/src/main.ts:3,14`, `apps/web/app/layout.tsx:2,5`, `apps/web/app/page.tsx:1,7`. Shared builds CJS via `tsc` (nodenext, no `"type"`).
- `apps/api/src/app.module.ts` -- only `HealthController`; global providers go here.
- `apps/api/src/configure-app.ts` -- prefix only; leave as is (DI-registered globals need no change here).
- `apps/api/src/health/health.controller.ts` -- needs `@Public()`.
- `apps/api/test/health.int-spec.ts` -- pattern for app bootstrap (`logger: false`, `configureApp`, `app?.close()`); keep passing.
- `apps/api/vitest.integration.config.mts` -- SWC emits decorator metadata, which nestjs-zod DTOs need.
- `@nestjs/common/constants` `GUARDS_METADATA` -- read with `Reflector.getAllAndMerge` on handler + class to find principal guards.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/order-status.ts`, `errors.ts`, `index.ts` -- `OrderStatusSchema` (`z.enum`), `ErrorCodeSchema` (10 codes), `ErrorEnvelopeSchema` (`{error:{code,message,details?: unknown}}`) + `z.infer` types; re-export; delete `APP_NAME`.
- [x] `apps/api/src/main.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx` -- inline `'Restaurant'` where `APP_NAME` was.
- [x] `apps/api/package.json` -- add `nestjs-zod` ~5.5.0; dev `@nestjs/testing` ~11.2.7.
- [x] `apps/api/src/common/domain-error.ts` -- `DomainError(code, message, details?)` and `ERROR_STATUS: Record<ErrorCode, number>` (type-checked exhaustive).
- [x] `apps/api/src/common/error-envelope.filter.ts` -- `@Catch()` filter: `DomainError` → mapped; `ZodValidationException` → 400 with issue `{path, message}` list; other `HttpException` → status table (Decision above); anything else → 500 `INTERNAL`, `new Logger(ErrorEnvelopeFilter.name).error(stack)`.
- [x] `apps/api/src/common/default-deny.guard.ts`, `public.decorator.ts` -- `@Public()` metadata; abstract `PrincipalGuard implements CanActivate` (future Staff/Guest guards extend it); `DefaultDenyGuard` allows `@Public()` or any route/controller guard whose prototype is a `PrincipalGuard`.
- [x] `apps/api/src/app.module.ts`, `health/health.controller.ts` -- register `APP_FILTER`, `APP_GUARD`, `APP_PIPE` (`ZodValidationPipe`); mark health `@Public()`.
- [x] `apps/api/test/conventions.int-spec.ts` -- `Test.createTestingModule({imports:[AppModule], controllers:[probe]})` + `configureApp`; one test per matrix row, logger spied for the crash row.

**Acceptance Criteria:**
- Given `pnpm --filter @restaurant/shared build`, when `dist/` is inspected, then it is CJS with `.d.ts` exporting the three schemas and their types, and `package.json` deps are only `zod`.
- Given the full gate (`lint`, `format:check`, `typecheck`, `test`, `test:int`), when it runs, then every step passes with zero warnings.

## Design Notes

Default-deny rejects with 403 `FORBIDDEN`: a route nobody may reach is not an authentication problem (AD-4 keeps 401 for missing/wrong principals inside real guards). The marker is a base class rather than an import of `StaffAuthGuard`, so `common` imports nothing from `auth`/`orders` (AD-3 direction).

## Verification

**Commands:**
- `pnpm --filter @restaurant/shared build && pnpm lint && pnpm format:check && pnpm typecheck` -- expected: pass, zero warnings.
- `pnpm test && pnpm test:int` -- expected: exit 0, conventions tests included.

## Implementation Notes

- Malformed JSON needs no extra code: Nest surfaces the body-parser error as a 400 `HttpException`, which the status table maps to `VALIDATION_FAILED` (no details).
- `DefaultDenyGuard` accepts `PrincipalGuard` subclasses passed to `@UseGuards` as classes or instances.
- Verified: lint, format:check, typecheck, `pnpm test` (15 api + 3 web), `pnpm test:int` (11, incl. 8 conventions).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | edge, blind | 5xx `HttpException` sends its raw message to the client and is never logged (`error-envelope.filter.ts:220-224`) | medium | Branch returns `exception.message` for any status and logs nothing; `InternalServerErrorException('db pool exhausted')` leaks it. | patch |
| 2 | edge (+claim) | Non-Error throws are logged verbatim through `String(exception)` | low | Line 226 logs the thrown value itself, which can be built from request data; the fix is a direct one-line correction. | patch |
| 3 | edge, blind | Crash test's `Logger.prototype.error` spy leaks if an assertion fails | low | `mockRestore()` runs only after every assertion passes; direct correction with try/finally. | patch |
| 4 | verification-gap, blind | Guard and status-table behaviour untested: non-principal guard denied, controller-level and instance principal guard, 401/429 mapping | medium | Loosening the `some()` predicate, dropping `getAllAndMerge` class lookup, the instance branch, or the 401/429 rows keeps all 8 tests green. | patch |
| 5 | blind | Logged stack begins with the error message; Prisma validation errors put call arguments (e.g. `passwordHash`) in it | maybe-false (medium if true) | No Prisma call exists yet; settles once Story 3.1 staff login throws a Prisma error through the filter. | defer |
| 6 | edge | Global `@Catch()` filter may run for the planned Socket.IO gateway, where `getResponse()` is not an express Response | maybe-false (medium if true) | Gateway planned (architecture realtime decision); settles by checking whether Nest applies `APP_FILTER` to WS handlers once the gateway lands. | defer |
| 7 | edge | `HttpException` with 2xx/3xx status yields envelope with success status | low | No code throws non-error statuses; fix adds a branch for an unseen state. | reject |
| 8 | edge, blind | No `res.headersSent` check | false | No route streams or writes before throwing; Socket.IO does not go through express responses. | reject |
| 9 | edge | Unserializable `details` or cast code crashes filter | low | `DomainError` code is typed `ErrorCode`; BigInt/circular details are developer error; fix adds guards. | reject |
| 10 | edge | Symbol keys in Zod issue paths make `join` throw | false | JSON bodies only have string/number keys. | reject |
| 11 | edge, blind | `instanceof ZodError` fails with duplicate zod copies | false | Only `zod@4.6.7` is installed; nestjs-zod resolves the same copy. | reject |
| 12 | edge | Root-level issue has empty `path` | low | Cosmetic; clients still get the message. | reject |
| 13 | blind | `HttpException` branch drops `getResponse()` details from built-in pipes | low | No built-in pipes are used; Zod is the validation convention; fix adds a branch. | reject |
| 14 | blind | Web keeps an unused `@restaurant/shared` dependency | low | Intent forbids web changes beyond dropping `APP_NAME`. | reject |
| 15 | blind | Shared has no test that `ErrorCode` is exactly the 10 codes | false | `ERROR_STATUS: Record<ErrorCode, number>` object literal fails typecheck on any missing or extra code. | reject |
| 16 | blind | No `ZodSerializerInterceptor` for responses | low | Intent names only the input pipe; speculative. | reject |
| 17 | edge (claim) | "Every error becomes the envelope" fails for headers-sent / non-HTTP / unserializable cases | low | Same cases as rows 6, 8, 9. | reject |
