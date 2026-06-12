# Worker Guide

> **Canonical location moved.** See [docs/guide/workers.md](../../docs/guide/workers.md) for the complete worker guide.

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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
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
| `npm run build` in worker | YASAK | dist/ contamination risk — build is a separate gate, not worker responsibility |
| Writing outside `scope.filesWrite` | YASAK | ADR-037 RBAC violation — auditor will flag |
| `selfAssessment: "DONE"` without verify-ran marker | YASAK | Sprint evaluator rejects, task → NO_GO |
| Hardcoded timestamps in `.hb` files | YASAK | Use `new Date().toISOString()` always |
| Ignoring ADR constraints | YASAK | Violation requires NO_GO + ADR amendment proposal |
