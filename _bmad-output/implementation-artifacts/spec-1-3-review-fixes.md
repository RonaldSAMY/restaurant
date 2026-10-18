---
title: 'Story 1.3 review fixes'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-shared-contracts-and-api-conventions.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The human review of Story 1.3 (commit beb12c1) found untested filter paths (the 10 `ERROR_STATUS` pairs, non-Error throws), three filter edge cases (unmapped code, root-level Zod issue path, response already sent), a class-wide `@Public()` on health, and stale bookkeeping.

**Approach:** Fix-now list from the review: (1) `it.each` over all 10 `ERROR_STATUS` pairs through a `@Public` probe throwing `DomainError`, asserting status and `error.code`; (2) probe throwing a non-Error `{ password: 'marker' }` → 500 `INTERNAL`, marker absent from `Logger.error` calls; (3) filter `ERROR_STATUS[code] ?? 500`; (4) Zod issue path `i.path.length ? i.path.map(String).join('.') : '(root)'`; (5) if `res.headersSent`, log and `res.end()` instead of writing the envelope; (6) move `@Public()` from `HealthController` onto its GET handler; (7) align spec-1-3 status with `sprint-status.yaml`, update Implementation Notes test counts, replace diff-offset line refs in its triage log. Add the review's three "not now" items to `deferred-work.md`. Skipped by the reviewer: zod/mini duck-typing, lint bans on Nest HttpExceptions, fixed 4xx messages, HttpException status < 400.

</frozen-after-approval>

## Implementation Notes

- Filter: `catch()` ends the response and logs `Error after headers were sent (<code>)` when `res.headersSent`; `ERROR_STATUS[code] ?? 500`; root Zod issues report path `(root)`.
- Health: `@Public()` moved to the GET handler (`check()`).
- Tests (`apps/api/test/conventions.int-spec.ts`): `it.each` over all 10 `ERROR_STATUS` pairs, non-Error throw (marker not logged), headers-sent probe, root-path probe (body `[]`). The last two were not in the review list; each guards a new branch.
- Bookkeeping: sprint `1-3-…` → `done` to match spec-1-3 `done` (this pass closes the human review); spec-1-3 test counts and triage line refs updated; three review deferrals added to `deferred-work.md`.
- Verified: lint, format:check, typecheck, `pnpm test:int` (29, incl. 26 conventions). Unit tests untouched.

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | blind | Headers-sent branch `res.end()`s, so a truncated 200 looks complete; Express destroys the socket | low | Real, but `res.end()` is what the review asked for; no route streams today, and truncated JSON fails to parse anyway. | reject |
| 2 | blind | Headers-sent log omits message/stack for DomainError/4xx; double log for plain Error | low | Only reachable from a handler that writes then throws; none exists. | reject |
| 3 | blind | `?? 500` keeps the unmapped `code` in the body and does not log | low | Needs a cast past `ErrorCode`; the review asked only for the status fallback. | reject |
| 4 | blind | No test for the `?? 500` fallback | low | Same unreachable-without-cast state as row 3. | reject |
| 5 | blind | Old single DomainError test is redundant with the `it.each` | false | It asserts `message` and `details`, which the loop does not. | reject |
| 6 | blind | Headers-sent test would pass without `res.end()` | false | Without `res.end()` the response never finishes and supertest times out, failing the test. | reject |
| 7 | blind | `(root)` path can collide with a field named `(root)` | low | No schema uses such a field; documenting the sentinel belongs with the deferred `ValidationIssueSchema` entry. | reject |
| 8 | blind | This spec's status is still `in-progress` | false | Finalize step sets `done`; it was mid-workflow when reviewed. | reject |
| 9 | blind | Spec-1-3 triage log refs still use line numbers that go stale | low | Simple correction: now names `toEnvelope` branches instead. | patch |
| 10 | blind | First new deferred entry bundles three items | low | Grouped as the reviewer wrote it, all triggered by Story 3.1. | reject |
| 11 | blind | No test that other HealthController handlers stay denied | low | No other handler exists; default deny itself is tested. | reject |
