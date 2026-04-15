# Worker Guide

Complete reference for Deckent worker agents. Read this before starting any task.

## Task Lifecycle

A worker follows these steps for every task:

1. **Claim** — Read `.tasks/task-{id}.json`, write heartbeat
2. **Plan** — Write `.tasks/task-{id}.plan` with your approach
3. **Execute** — Write code, staying within scope
4. **Verify** — Run `tsc --noEmit` and `npx vitest run`
5. **Report** — Write `.tasks/task-{id}.result`

## .plan File — What It Is, What It Does, Why It Matters

### What Is a .plan File?

A `.plan` file is an execution plan that a worker writes to `.tasks/task-{id}.plan` **before starting any code changes**. It outlines the worker's approach to completing the assigned task.

### Format

The `.plan` file can be markdown or JSON. A markdown example:

```markdown
# Task {id}: {title}

## Approach
- Describe your strategy for completing this task
- List the files you will modify and why
- Note any dependencies or blockers

## Files to Modify
- `src/path/to/file.ts` — what changes and why
- `tests/path/to/test.ts` — what tests to add

## Expected Outcome
- What the end state should look like
- Which tests should pass
```

### Why It Matters

1. **Auditability** — The Brain and Auditor can verify that the worker understood the task before execution began. If the result diverges from the plan, it signals a scope creep or misunderstanding.

2. **Debugging** — When a task fails (NO_GO), the `.plan` file reveals whether the failure was in understanding (bad plan) or execution (good plan, bad implementation).

3. **Sprint Analytics** — Plan coverage (% of tasks with `.plan` files) is a sprint health metric. Low coverage correlates with higher NO_GO rates.

4. **Worker Accountability** — Writing a plan forces the worker to think through the approach before coding. This reduces "code first, think later" patterns that lead to scope violations and incomplete implementations.

### What Happens If You Skip It?

- **Sprint 139**: Soft warning — `console.warn` + `planWarning: 'missing'` flag in result file
- **Sprint 140+**: Potential `GO_WITH_TECH_DEBT` downgrade (planned enforcement)

## Heartbeat File

Create `.tasks/task-{id}.hb` BEFORE starting work, update periodically:

```json
{
  "workerId": "w-{taskId}",
  "taskId": "{taskId}",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "timestamp": "<new Date().toISOString()>",
  "filesChangedCount": 0,
  "sequence": 0
}
```

Update rules:
- `status`: EXECUTING, CODING, TESTING, DOCUMENTING
- `currentAction`: describe what you're doing right now
- `sequence`: increment on every update
- `timestamp`: always use `new Date().toISOString()` (UTC ISO 8601)

## Result File

Write `.tasks/task-{id}.result` when complete:

```json
{
  "taskId": "{taskId}",
  "filesChanged": ["list/of/files"],
  "linesAdded": 0,
  "linesRemoved": 0,
  "testsPassed": true,
  "selfAssessment": "DONE",
  "notes": "Brief summary",
  "rubricScores": {
    "correctness": 95,
    "test_coverage": 90,
    "scope_compliance": 100,
    "documentation": 85
  }
}
```

`selfAssessment` values:
- `"DONE"` — task fully completed, all tests pass
- `"GO_WITH_TECH_DEBT"` — mostly done, minor issues documented
- `"NO_GO"` — could not complete, error details in notes

The result file is **REQUIRED** — without it your work cannot be evaluated.

## Scope Rules

- Stay within `scope.directories` — auditor detects violations via `git diff --stat`
- Only write to files listed in `scope.filesWrite`
- Read any file in `scope.filesRead` as needed

## Verify Loop

1. `tsc --noEmit` — fix all type errors (max 3 attempts)
2. `npx vitest run` — fix all test failures (max 3 attempts)
3. If still failing after 3 attempts — write NO_GO result with error details

## Error Handling

- `tsc --noEmit` fails → fix type errors, retry (max 3)
- `npx vitest run` fails → fix test failures, retry (max 3)
- Blocked by another task → write NO_GO explaining the dependency
- Unsure about scope → err on the side of caution
