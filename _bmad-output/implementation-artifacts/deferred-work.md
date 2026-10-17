- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Add unit tests for api `apps/api/src/common/env.ts` and web `apps/web/lib/env.ts` fail-fast parsing (missing/invalid var exits 1, valid env parses).
  evidence: No test exists for the fail-fast env behavior; Story 1.1 excluded Vitest, so it belongs in Story 1.2's harness.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-running-stack-skeleton.md`
  summary: Add an integration test for `GET /api/v1/health` and a CI check that only `proxy` publishes ports in `docker compose config`.
  evidence: The health route, `/api/v1` prefix and single-port rule are verified only by manual curl/jq; Story 1.2 brings Supertest and CI.
