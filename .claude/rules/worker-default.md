<!-- AUTO-START -->
---
paths: ["src/**","tests/**"]
---
# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- ADRs are injected into your prompt automatically from `.brain/memory.db` — they are mandatory constraints
- If you need to query project memory: relevant ADRs and past learnings are provided by Brain via MemoryStore
- If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment
- Write execution plan to `.tasks/task-XXX.plan` before coding
- Check `.locks/` before writing any file
- Update heartbeat (`.tasks/task-XXX.hb`) on every file change
- Stay within your assigned scope — do not touch files outside it
- Run project-specific lint/build and test suite before marking done
- Document changes in relevant docs
- Write result to `.tasks/task-XXX.result` with:
  - files_changed, lines_added/removed
  - test results, coverage
  - self_assessment: DONE | GO_WITH_TECH_DEBT | NO_GO
  - notes for Brain

## Skill Context
- If skill prompts are provided in your prompt, follow their guidelines
- Skill content is domain-specific expertise — apply it to your task
- Do not ignore skill instructions even if they seem overly detailed

## Verify Loop
> **Note:** The Verify Loop is guidance for you to follow, not a hard-enforced gate. Run your project's own lint/build/test commands yourself and report results honestly.
- Run lint/build check after code changes — fix errors (max 3 attempts; use project-specific command)
- Run test suite after code changes — fix failures (max 3 attempts; use project-specific command)
- If both fail after 3 attempts → write NO_GO result with error details
- If blocked by another task → write NO_GO result explaining the dependency

## Agent Context
- If an agent prompt is provided, it defines your specialization
- Follow agent-specific guidelines for your domain (security, testing, docs, etc.)
- Agent expertise supplements but does not override task instructions


## Active ADR Constraints

Full ADR text + rationale live in `.brain/memory.db` (SSOT). Query with `deckent recall "<topic>"` or `store.getByType('adr')` — do NOT rely on a static copy. The list below is an id-only index; look any id up for its current constraint.

Accepted: **ADR-003**, **ADR-007**, **ADR-068**, **ADR-069**, **ADR-008**, **ADR-087**, **ADR-089**, **ADR-086**, **ADR-083**, **ADR-082**, **ADR-081**, **ADR-080**, **ADR-079**, **ADR-078**, **ADR-076**, **ADR-077**, **ADR-075**, **ADR-074**, **ADR-073**, **ADR-072**, **ADR-071**, **ADR-070**, **ADR-066**, **ADR-065**, **ADR-064**, **ADR-062**, **ADR-063**, **ADR-010**, **ADR-037**, **ADR-047**, **ADR-048**, **ADR-046**, **ADR-045**, **ADR-043**, **ADR-044**, **ADR-053**, **ADR-041**, **ADR-042**, **ADR-040**, **ADR-038**, **ADR-039**, **ADR-035**, **ADR-033**, **ADR-034**, **ADR-029**, **ADR-030**, **ADR-031**, **ADR-032**, **ADR-036**, **ADR-028**, **ADR-027**, **ADR-025**, **ADR-026**, **ADR-023**, **ADR-024**, **ADR-022**, **ADR-018**, **ADR-019**, **ADR-017**, **ADR-014**, **ADR-015**, **ADR-016**, **ADR-020**, **ADR-021**, **ADR-013**, **ADR-001**, **ADR-002**, **ADR-004**, **ADR-006**, **ADR-011**, **ADR-012**, **ADR-088**, **ADR-090**
<!-- AUTO-END -->

<!-- CUSTOM-START -->

## Karpathy 4-Discipline Anchor

MUST follow @karpathy-discipline.md when generating code.

Before writing any code line, validate against all four disciplines:
1. **Think Before Coding** — read + plan first, list ADR constraints, write .plan file
2. **Simplicity First** — prefer existing patterns, YAGNI, avoid premature abstractions
3. **Surgical Changes** — stay in scope.filesWrite, minimum-diff, preserve existing behavior
4. **Goal-Driven Execution** — every change must map to a goCriteria item; honest self-assessment

## Proof-of-Function (Tier-1 user-surface)

A **user-surface** task (writes to `src/cli/commands/`, `src/dashboard/`, or `src/api/`) is
Tier-1 and MUST carry a `Smoke:` directive line — a run-proven real-binary command plus its
expected output (e.g. `Smoke: node dist/cli/entry.js serve --port 3211 → /api/status = 200`).
Only a real-binary run (run-proven) closes a Tier-1 task — not a unit test.

- **A mock-only test alone = GO_WITH_TECH_DEBT, never DONE.** The test must assert on the
  REAL served HTML / real CLI stdout, not a mock. deckent runs the `Smoke:` command host-side
  in-sprint (post-sprint-smoke) and downgrades DONE→GO_WITH_TECH_DEBT if it fails.
- Tier-0 (internal/structural — `src/core/`, refactors) stays unit-test-sufficient.
- Routing: surface tasks → `frontend-designer` (dashboard) / `api-builder` (api·serve·cli) /
  `ci-guardian` (e2e harness). See ADR-079 + @karpathy-discipline.md (Proof-of-Function DoD).

<!-- CUSTOM-END -->
