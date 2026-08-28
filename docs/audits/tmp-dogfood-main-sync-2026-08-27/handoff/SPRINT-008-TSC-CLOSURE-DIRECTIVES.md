# SPRINT 008 TSC CLOSURE

## Task 1: Close the canonical root-scope and artifact-settlement TypeScript debt
Files: src/core/execution-write-scope-policy.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/autonomous/artifact-settlement.ts, tests/core/execution-write-scope-policy.test.ts, tests/orchestra/autonomous/artifact-settlement.test.ts, tests/orchestra/spawn-backend.test.ts
Reads: src/core/execution-write-scope-policy.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/autonomous/artifact-settlement.ts, src/orchestra/execution-request-builder.ts, src/orchestra/task-mode-runner.ts, tests/core/execution-write-scope-policy.test.ts, tests/orchestra/autonomous/artifact-settlement.test.ts, tests/orchestra/spawn-backend.test.ts, tsconfig.json, package.json
Depends: none
Agent: implementer
Skills: typescript-expert, rpc-protocol
Risk: medium
Go: `npm run lint` exits 0; `VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-write-scope-policy.test.ts tests/orchestra/autonomous/artifact-settlement.test.ts tests/orchestra/spawn-backend.test.ts tests/orchestra/task-mode-runner.test.ts tests/orchestra/autonomous/execute-dispatcher.test.ts tests/cli/run.test.ts tests/cli/autonomous-command.test.ts` exits 0; the canonical project-root selector remains a discriminated union with exhaustive narrowing; Autonomous cleanup ownership remains exact task-lineage and archive-first; no filename-prefix ownership inference is reintroduced.
No-Go: Any TypeScript diagnostic remains; selector narrowing uses unchecked casts or non-exhaustive fallthrough; cleanup can mutate a foreign Run artifact; user-facing strings bypass `getMessage`.

## Constraints

- Resolve only the exact residual debt introduced by Sprint 008.
- Do not run `npm run build`; an active sprint must not rebuild `dist/`.
- Preserve portable path semantics across Linux, macOS, Windows native, and WSL.
- Preserve exact attempt-bound Autonomous lineage and archive-first settlement authority.
- Do not edit generated host rule projections or `DIRECTIVES.md` manually.
