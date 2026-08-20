<!-- AUTO-START -->
# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- ADR constraints included in the task prompt or resolved from `.brain/memory.db` are mandatory; absence from a prompt is not permission to violate accepted ADRs
- If you need to query project memory: relevant ADRs and past learnings are provided by Brain via MemoryStore
- If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment
- Plan silently before coding — no plan file (7094-F1d: the host never reads one; the write only burned a cached-context turn)
- Check `.locks/` before writing any file
- Write heartbeat (`.tasks/task-XXX.hb`) ONCE at start (7094-F1d: the host only checks its existence, never its mtime)
- Stay within your assigned scope — do not touch files outside it
- Run the exact scoped verification declared by the task and effective policy; do not launch a full build or full suite unless the run explicitly permits and requires it
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
> **Note:** Verification is evidence, not a self-issued verdict. Obey task scope, active-run
> prohibitions, resource admission, and the effective bounded retry policy; report every command
> and result honestly.
- Run task-declared lint/type/build checks only when admitted; fix failures within the configured attempt budget
- Run task-declared scoped tests; fix failures within the configured attempt budget
- When the admitted verification budget is exhausted, write a typed NO_GO result with error details and executed evidence
- For dependencies, the prompt's host-evaluated logical-lineage `aggregate` verdict is canonical.
  Never downgrade it from a raw `.tasks/task-{dep-id}.result`; that file is attempt-scoped audit
  evidence and may intentionally retain an original `NO_GO` after a FIX settles the lineage.
- If blocked by another task → write NO_GO result explaining the dependency

## Agent Context
- If an agent prompt is provided, it defines your specialization
- Follow agent-specific guidelines for your domain (security, testing, docs, etc.)
- Agent expertise supplements but does not override task instructions


## Active ADR Constraints

Full ADR text + rationale live in `.brain/memory.db` (SSOT). Query with `deckent recall "<topic>"` or `store.getByType('adr')` — do NOT rely on a static copy. The list below is an id-only index; look any id up for its current constraint.

Accepted: **ADR-D-001**, **ADR-D-002**, **ADR-D-004**, **ADR-D-005**, **ADR-D-006**, **ADR-D-007**, **ADR-D-008**, **ADR-D-009**, **ADR-D-010**, **ADR-D-011**, **ADR-D-012**, **ADR-D-013**, **ADR-G-001**, **ADR-G-002**, **ADR-G-004**, **ADR-G-005**, **ADR-G-006**, **ADR-G-007**, **ADR-G-008**, **ADR-G-009**, **ADR-G-010**, **ADR-G-011**, **ADR-G-012**, **ADR-G-013**, **ADR-G-014**, **ADR-G-015**, **ADR-G-016**, **ADR-G-017**, **ADR-G-018**, **ADR-G-019**, **ADR-G-020**, **ADR-G-021**, **ADR-G-022**, **ADR-G-023**, **ADR-G-024**, **ADR-G-025**, **ADR-G-026**, **ADR-G-027**, **ADR-G-028**, **ADR-G-029**, **ADR-G-030**, **ADR-G-031**, **ADR-G-032**, **ADR-G-033**, **ADR-G-034**, **ADR-G-035**, **ADR-G-036**, **ADR-G-037**, **ADR-G-038**, **ADR-G-039**
<!-- AUTO-END -->

<!-- CUSTOM-START -->

## Karpathy 4-Discipline Anchor

MUST follow karpathy-discipline.md when generating code.

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
  `ci-guardian` (e2e harness). See ADR-G-009 + karpathy-discipline.md (Proof-of-Function DoD).

<!-- CUSTOM-END -->
