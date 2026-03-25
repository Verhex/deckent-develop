# Worker Guide

Complete reference for Deckent worker agents. Read this before starting any task.

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
  "sequence": 0
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
  "notes": "Brief summary of what was done"
}
```

`selfAssessment` must be one of: `"DONE"`, `"GO_WITH_TECH_DEBT"`, `"NO_GO"`

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
