# Worker Guide — Developer Reference

> For the user-facing workers guide see [docs/guide/workers.md](../guide/workers.md).
> For worker rules enforced at runtime see [.claude/rules/worker-default.md](../../.claude/rules/worker-default.md).

---

## Overview

Workers are Claude Code instances (or provider equivalents) that execute a single task in a sprint. Each worker:

1. Reads its task file from `.tasks/task-{id}.json`
2. Writes a plan to `.tasks/task-{id}.plan` before touching any source file
3. Executes the task within its assigned scope
4. Writes heartbeats to `.tasks/task-{id}.hb` throughout execution
5. Writes a result file to `.tasks/task-{id}.result` when done

Brain evaluates the result and decides GO / NO_GO / GO_WITH_TECH_DEBT.

---

## Task Lifecycle

```
PENDING → CLAIMED → EXECUTING → TESTING → DONE | NO_GO
```

| Phase | Worker Action |
|-------|--------------|
| **Claim** | Worker reads task JSON, acquires file lock via `.locks/` |
| **Plan** | Write `.tasks/task-{id}.plan` — list files, expected changes, ADR constraints |
| **Execute** | Implement changes within `scope.filesWrite` |
| **Heartbeat** | Update `.tasks/task-{id}.hb` on every significant change |
| **Verify** | Run `tsc --noEmit` + targeted test suite (max 3 attempts each) |
| **Result** | Write `.tasks/task-{id}.result` with honest self-assessment |

---

## Heartbeat Format

Workers MUST write `.tasks/task-{id}.hb` before starting and update it periodically (on every file change at minimum). Stale heartbeats older than 2 minutes trigger an Auditor alert.

```json
{
  "workerId": "w-{sprintNum}-{seq}",
  "taskId": "{sprintNum}-{seq}",
  "status": "EXECUTING",
  "sequence": 1,
  "timestamp": "2026-06-14T10:00:00.000Z"
}
```

`timestamp` MUST be a UTC ISO 8601 string from `new Date().toISOString()`.

---

## Result File Format

Write `.tasks/task-{id}.result` atomically — write to `.tmp` first, then `renameSync` to final path.

```json
{
  "taskId": "286-001",
  "filesChanged": ["src/core/config.ts"],
  "linesAdded": 20,
  "linesRemoved": 5,
  "testsPassed": true,
  "coverage": 92.5,
  "selfAssessment": "DONE",
  "notes": "Brief summary of what was done and verified",
  "tokenUsage": {
    "inputTokens": 15420,
    "outputTokens": 3200,
    "cacheReadTokens": 89000,
    "provider": "claude",
    "model": "sonnet"
  }
}
```

**`tokenUsage` is required** — a missing `tokenUsage` is treated as NO_GO by Brain.

See `docs/reference/api-surface.md` for the full result schema including optional fields (`rubricScores`, `sharedNotes`, `handoffNotes`, `crossVerify`).

---

## Scope Rules (ADR-037)

Workers MUST stay within their assigned scope:

- **`scope.filesWrite`**: the only files a worker may write to
- **`scope.filesRead`**: files the worker may read (in addition to the whole project)
- **`scope.directories`**: allowed directory context

The Auditor runs `git diff --stat` after every task and flags any write outside `scope.filesWrite`. Violations are **advisory/soft** in V1.0 (warn + emit, do not hard-block) per ADR-037 V1.0. Hard enforcement is planned for post-GA V2.

Workers MUST self-flag scope violations: write `selfAssessment: "NO_GO"` with `notes` explaining the boundary violation (honest-gate discipline).

---

## Verify Loop

Before writing the result file, workers MUST run:

1. **Type check**: `tsc --noEmit` (or project equivalent) — fix ALL errors (max 3 attempts)
2. **Targeted tests**: `npx vitest run <test-file>` — run only the test file(s) covering changed modules (max 3 attempts)

> **Note (ADR-037 V1.0):** The verify loop is a **prompt instruction, not code-enforced**. `enforceVerifyLoop`/`runTestVerifyLoop` are not called at runtime (0-caller). Worker discipline + Auditor advisory monitoring enforce this.

If both pass → `selfAssessment: "DONE"`.
If minor issues remain → `selfAssessment: "GO_WITH_TECH_DEBT"` with specific gap in `notes`.
After 3 failed attempts on either → `selfAssessment: "NO_GO"` with error details.

---

## Honest Self-Assessment Gate

Before writing `selfAssessment: "DONE"`, verify:

1. **Baseline**: what was the test/code state BEFORE your work?
2. **End state**: what is it NOW?
3. **Delta**: how much of the task did you ACTUALLY complete?

Thresholds:
- ≥80% complete → `"DONE"`
- 50–79% complete → `"GO_WITH_TECH_DEBT"` with specific gap in `notes`
- <50% complete → `"NO_GO"` with explanation

"Code written" ≠ "DONE". Functional outcome must match the task's `goCriteria`.

---

## RBAC — ADR-037 Authority Matrix

| Role | Write Source Code | Write Docs | Write `.tasks/` | Write `.brain/` |
|------|:-----------------:|:----------:|:---------------:|:---------------:|
| Brain | ❌ | ✅ | ✅ | ✅ |
| Worker | ✅ (scope only) | ✅ (scope only) | ✅ (own files) | ❌ |
| Auditor | ❌ | ❌ | ❌ | ✅ (patterns) |

---

## Karpathy 4-Discipline Anchor

Workers MUST follow the four disciplines defined in `.claude/rules/karpathy-discipline.md`:

### 1. Think Before Coding
- Read the full task + all `scope.filesRead` files before writing any code
- Identify every relevant accepted ADR (injected into your prompt from `memory.db`)
- Write `.tasks/task-{id}.plan` before touching source files — list files, expected deltas, goCriteria mapping
- List explicit assumptions in the plan

### 2. Simplicity First
- Prefer existing patterns; YAGNI; no premature abstraction
- Three similar lines > a premature utility function
- Do NOT add new runtime dependencies unless the task requires it and the dep is in `package.json`
- Follow ADR-010 (single runtime dependency): prefer Node.js built-ins

### 3. Surgical Changes
- Write only to `scope.filesWrite`
- Edit only the lines that must change — no reformatting adjacent code
- Preserve existing behavior unless the task description explicitly changes it
- Keep diffs small and reviewable

### 4. Goal-Driven Execution
- Map every code change to a specific `goCriteria` item — if you can't map it, drop it
- Run all verification commands before writing the result file
- Be honest: false DONE costs more than truthful NO_GO

---

## Test Hermeticity (ADR-087)

Every test MUST be hermetic — pass on a fresh checkout with no local state.

Rules:
- **Never read gitignored state** — `.deckent/config.json`, `.brain/memory.db`, `~/.deckent` are absent on a fresh checkout
- **Use tmpdir for all file I/O** — create fixtures under `os.tmpdir()`, clean up in `afterEach`
- **No `spawnSync` for subprocesses** — use async `spawn` (blocks event loop → CI timeouts)
- **CI=fresh checkout** — write every test as if only git-tracked files exist

Verify hermetic: `npm run test:ci-sim` simulates CI by hiding gitignored files before running the suite.

Routing: CI tasks → **ci-guardian agent** + **ci-testing skill**.

---

## Dependency Awareness

If your task depends on another task's output and that result has not arrived:

- Check `.tasks/task-{dep-id}.result` exists before proceeding
- Do NOT busy-wait — write `selfAssessment: "NO_GO"` explaining the dependency
- Brain will reschedule via `mid-sprint-adapter`

---

## Forbidden Anti-Patterns

| Anti-Pattern | Reason |
|-------------|--------|
| `it.skip(...)` without justification comment | Hides failing tests |
| Reading `.brain/memory.db` directly (no MemoryStore) | DB-schema coupling |
| Writing to files not in `scope.filesWrite` | RBAC violation — Auditor detects via `git diff --stat` |
| `spawnSync` in tests | Blocks event loop → CI timeouts |
| Writing `selfAssessment: "DONE"` without running verify commands | False confidence |
| Leaving TODO / debug code in committed result | Tech debt |
| Touching `.brain/exports/` directly | Generated files — rewritten each sprint |

---

## Tier-1 Proof-of-Function (ADR-079)

Tasks writing to `src/cli/commands/`, `src/dashboard/`, or `src/api/` are **Tier-1 (user-surface)** and MUST carry a `Smoke:` directive line:

```
Smoke: node dist/cli/entry.js serve --port 3211 → /api/status = 200
```

A mock-only test alone = `GO_WITH_TECH_DEBT`, never `DONE`. The smoke command must be run-proven against the real built binary.

Tier-0 (internal/structural — `src/core/`, refactors) stays unit-test-sufficient.

---

*Source: `.claude/rules/worker-default.md`, `.deckent/workspace/WORKER-GUIDE.md`, `src/agents/worker.ts`*
