# Worker Guide

Complete reference for Deckent worker agents. Read this before starting any task.

## .plan File

Write `.tasks/task-{id}.plan` BEFORE starting any code changes. This is your execution plan:

```markdown
# Task {id}: {title}

## Approach
- Describe your strategy for completing this task
- List the files you will modify and why

## Files to Modify
- `src/path/to/file.ts` — what changes and why

## Expected Outcome
- What the end state should look like
```

Why it matters:
- **Auditability:** Brain/Auditor can verify understanding before execution
- **Debugging:** Failed tasks reveal whether the failure was in understanding or execution
- **Accountability:** Forces think-before-code, reduces scope creep

Missing `.plan` triggers a soft warning in the result file (`planWarning: 'missing'`).

## Heartbeat File

Create `.tasks/task-{id}.hb` BEFORE starting work, update periodically:

```json
{
  "workerId": "w-{taskId}",
  "taskId": "{taskId}",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "timestamp": "<new Date().toISOString() — UTC ISO 8601>",
  "filesChangedCount": 0,
  "sequence": 0,
  "backend": "tmux | subprocess | docker (optional)"
}
```

Update rules:
- `status`: EXECUTING → CODING → TESTING → DOCUMENTING
- `currentAction`: describe what you're doing right now
- `sequence`: increment on every update
- `filesChangedCount`: reflect actual files modified
- `timestamp`: always use `new Date().toISOString()` — never hardcode or use locale strings

## Result File

Write `.tasks/task-{id}.result` when complete:

```json
{
  "taskId": "{taskId}",
  "filesChanged": ["list/of/files/you/created/or/modified"],
  "linesAdded": 0,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 0,
  "selfAssessment": "DONE",
  "notes": "Brief summary of what was done",
  "tokenUsage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "cacheReadTokens": 0,
    "provider": "claude",
    "model": "opus"
  }
}
```

`selfAssessment` must be one of: `"DONE"`, `"GO_WITH_TECH_DEBT"`, `"NO_GO"`

`tokenUsage` is optional — include it if your provider reports token consumption data.

The result file is REQUIRED — without it your work cannot be evaluated.

## Error Handling

- `tsc --noEmit` fails after 3 attempts → write NO_GO result with error details
- `npx vitest run` fails after 3 attempts → write NO_GO result with failing test names
- Blocked by another task → write NO_GO result explaining the dependency
- Unsure about scope → err on the side of caution, do NOT touch files outside your scope

## Scope Rules

- Stay within `scope.directories` — auditor detects violations via `git diff --stat`
- Only write to files listed in `scope.filesWrite`
- Read any file in `scope.filesRead` as needed

## Verify Loop

1. `tsc --noEmit` — fix all type errors before proceeding
2. `npx vitest run` — fix all test failures before marking done
3. Max 3 attempts each — if still failing, write NO_GO

## Skill & Agent Context

- If skill prompts are provided, follow their guidelines — they are domain-specific expertise
- If an agent prompt is provided, it defines your specialization — supplement, don't override task instructions

## Anti-Patterns
## verify-ran Marker

Every task MUST write a `.tasks/task-{id}.result` file before exiting.
The verify-ran marker ensures Brain can evaluate your work:

- **Missing result** → Sprint stalls, task evaluated as NO_GO
- **Partial result** (missing `tokenUsage.provider`) → generates warnings
- **Atomic write** — write to `.tmp` first, then `renameSync` to final path (Bug K fix)

## Honest-Result Gate

The honest-result gate requires that before writing `selfAssessment: "DONE"`, you verify:

1. **Baseline:** what was the test/code state BEFORE your work?
2. **End state:** what is it NOW?
3. **Delta:** how much of the task did you ACTUALLY complete?

Thresholds:
- ≥80% complete → `"DONE"`
- 50–79% complete → `"GO_WITH_TECH_DEBT"` with specific gap in notes
- <50% complete → `"NO_GO"` with explanation

"Code written" ≠ "DONE". Functional outcome must match task spec.

## processQueue Stall Awareness

If your task depends on another task's output and it has not arrived:

- Check `.tasks/task-{dep-id}.result` exists before proceeding
- Do NOT busy-wait — write `NO_GO` result explaining the dependency
- Brain will reschedule via mid-sprint-adapter

## RBAC — ADR-037 Authority Matrix

| Role | Write Source Code | Write Docs | Write `.tasks/` | Write `.brain/` |
|------|:-----------------:|:----------:|:---------------:|:---------------:|
| Brain | ❌ | ✅ | ✅ | ✅ |
| Worker | ✅ (scope only) | ✅ (scope only) | ✅ (own files) | ❌ |
| Auditor | ❌ | ❌ | ❌ | ✅ (patterns) |

Workers MAY ONLY write files listed in `scope.filesWrite`. Auditor detects violations via `git diff --stat`.

## Forbidden Anti-Patterns

| Anti-Pattern | Status | Reason |
|-------------|--------|--------|
| `it.skip(...)` without justification comment | YASAK | Hides failing tests — must fix or document why |
| `stub()` / empty function returning hardcoded value | YASAK | Produces false GO results — implement real logic |
| `npm run build` in worker | YASAK | Alperen kararı — dist/ contamination risk |
| Writing outside `scope.filesWrite` | YASAK | ADR-037 RBAC violation — auditor will flag |
| `selfAssessment: "DONE"` without verify-ran marker | YASAK | Sprint evaluator rejects, task → NO_GO |
| Hardcoded timestamps in `.hb` files | YASAK | Use `new Date().toISOString()` always |
| Ignoring ADR constraints | YASAK | Violation requires NO_GO + ADR amendment proposal |

## verify-ran Marker

Every task MUST write a `.tasks/task-{id}.result` file before exiting.
The verify-ran marker ensures Brain can evaluate your work:

- **Missing result** → Sprint stalls, task evaluated as NO_GO
- **Partial result** (missing `tokenUsage.provider`) → generates warnings
- **Atomic write** — write to `.tmp` first, then `renameSync` to final path (Bug K fix)

## Honest-Result Gate

Before writing `selfAssessment: "DONE"`, verify:

1. **Baseline:** what was the test/code state BEFORE your work?
2. **End state:** what is it NOW?
3. **Delta:** how much of the task did you ACTUALLY complete?

Thresholds:
- ≥80% complete → `"DONE"`
- 50–79% complete → `"GO_WITH_TECH_DEBT"` with specific gap in notes
- <50% complete → `"NO_GO"` with explanation

"Code written" ≠ "DONE". Functional outcome must match task spec.

## processQueue Stall Awareness

If your task depends on another task's output and it has not arrived:

- Check `.tasks/task-{dep-id}.result` exists before proceeding
- Do NOT busy-wait — write `NO_GO` result explaining the dependency
- Brain will reschedule via mid-sprint-adapter

## RBAC — ADR-037 Authority Matrix

| Role | Write Source Code | Write Docs | Write `.tasks/` | Write `.brain/` |
|------|:-----------------:|:----------:|:---------------:|:---------------:|
| Brain | ❌ | ✅ | ✅ | ✅ |
| Worker | ✅ (scope only) | ✅ (scope only) | ✅ (own files) | ❌ |
| Auditor | ❌ | ❌ | ❌ | ✅ (patterns) |

Workers MAY ONLY write files listed in `scope.filesWrite`. Auditor detects violations via `git diff --stat`.

## Forbidden Anti-Patterns

| Anti-Pattern | Status | Reason |
|-------------|--------|--------|
| `it.skip(...)` without justification comment | YASAK | Hides failing tests — must fix or document why |
| `stub()` / empty function returning hardcoded value | YASAK | Produces false GO results — implement real logic |
| `npm run build` in worker | YASAK | Alperen kararı — dist/ contamination risk |
| Writing outside `scope.filesWrite` | YASAK | ADR-037 RBAC violation — auditor will flag |
| `selfAssessment: "DONE"` without verify-ran marker | YASAK | Sprint evaluator rejects, task → NO_GO |
| Hardcoded timestamps in `.hb` files | YASAK | Use `new Date().toISOString()` always |
| Ignoring ADR constraints | YASAK | Violation requires NO_GO + ADR amendment proposal |
