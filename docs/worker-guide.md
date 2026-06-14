# Worker Guide

> **Full reference:** For the complete API reference (function signatures, lock format, file format table, error classes), see [`docs/guide/workers.md`](guide/workers.md).
> This file covers the practical essentials: lifecycle, scope rules, verify-loop, and Karpathy discipline.

---

## Worker Role

Workers are ephemeral, scoped execution agents spawned by Brain. Each worker:

- Receives exactly one task (identified by `taskId` from `.tasks/task-{id}.json`)
- Operates as a Claude Code session in headless mode (`claude -p`)
- Cannot plan, orchestrate, or spawn other agents
- Must stay strictly within its assigned `scope`

**Source:** `src/agents/worker.ts` | **Rules:** `.claude/rules/worker-default.md`

---

## Lifecycle: claim → plan → execute → heartbeat → result

```
PENDING → CLAIMED → EXECUTING → TESTING → DOCUMENTING → DONE
                                                         └──► NO_GO
```

| Step | File written | Rule |
|------|-------------|------|
| 1. Read task | `.tasks/task-{id}.json` (read) | Read ALL fields before touching anything |
| 2. Write heartbeat | `.tasks/task-{id}.hb` | BEFORE any work begins |
| 3. Write plan | `.tasks/task-{id}.plan` | BEFORE writing any code |
| 4. Acquire locks | `.locks/{path__sep}.lock` | Before writing each file |
| 5. Implement | within `scope.filesWrite` | Update heartbeat on every file change |
| 6. Run verify-loop | — | `tsc --noEmit` + `npx vitest run` |
| 7. Write result | `.tasks/task-{id}.result` | Required — missing result = sprint stall |
| 8. Release locks | `.locks/` | Always in a `finally` block |

### Heartbeat file format

```json
{
  "workerId": "w-{taskId}",
  "taskId": "{taskId}",
  "status": "EXECUTING",
  "currentAction": "Brief description of current action",
  "timestamp": "<new Date().toISOString() — UTC ISO 8601>",
  "filesChangedCount": 0,
  "sequence": 0
}
```

- `timestamp`: always `new Date().toISOString()` — never hardcode
- `sequence`: increment on every update
- Auditor alerts if `now − timestamp > 2 minutes`

### Plan file format

```markdown
# Task {id}: {title}

## Approach
- Strategy for completing this task

## Files to Modify
- `src/path/to/file.ts` — what changes and why

## Expected Outcome
- End state + goCriteria mapping
```

### Result file format

```json
{
  "taskId": "{taskId}",
  "filesChanged": ["src/path/file.ts"],
  "linesAdded": 0,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 0,
  "selfAssessment": "DONE",
  "notes": "Summary of what was done",
  "tokenUsage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "cacheReadTokens": 0,
    "provider": "claude",
    "model": "sonnet"
  }
}
```

`selfAssessment` values — use the Honest-Result Gate below before choosing:
- `"DONE"` — every goCriteria item verified with evidence
- `"GO_WITH_TECH_DEBT"` — mostly done, gap documented in notes
- `"NO_GO"` — at least one critical criterion unmet; details in notes

**Atomic write:** write to `.tmp` first, then `renameSync` to final path (prevents partial reads).

---

## Scope Rules

Scope is the primary security boundary. The Auditor detects violations via `git diff --stat`.

```json
"scope": {
  "directories": ["src/auth/"],
  "filesRead": ["src/core/types.ts"],
  "filesWrite": ["src/auth/index.ts"]
}
```

| Field | Meaning |
|-------|---------|
| `directories` | Worker may write to ANY file under these paths |
| `filesRead` | Worker may READ these specific files (outside directories) |
| `filesWrite` | Worker may WRITE these specific files (outside directories) |

**Golden rule:** When in doubt, do NOT write the file. Read-only access to `scope.filesRead` is always permitted.

---

## Verify Loop

Before writing the result file, run both checks (max 3 attempts each):

```bash
tsc --noEmit        # zero type errors required
npx vitest run      # all tests must pass
```

If either still fails after 3 attempts → write `NO_GO` result with error details.

**ADR-037 V1.0 note:** The verify loop is a prompt instruction (advisory). `enforceVerifyLoop` has no runtime callers in V1.0 — enforcement relies on worker honesty and the Honest-Result Gate. Hard enforcement is planned for V2 post-GA.

---

## Honest-Result Gate

Before writing `selfAssessment: "DONE"`, verify all three:

1. **Baseline** — what was the code/test state BEFORE your work?
2. **End state** — what is it NOW?
3. **Delta** — how much of the task did you ACTUALLY complete?

| Completion | Assessment |
|-----------|-----------|
| ≥ 80% | `"DONE"` |
| 50–79% | `"GO_WITH_TECH_DEBT"` (name the gap in notes) |
| < 50% | `"NO_GO"` (explain what blocked you) |

**"Code written" ≠ "DONE".** Functional outcome must match task spec.

---

## Karpathy 4-Discipline

From `.claude/rules/karpathy-discipline.md` — validate every change against all four:

1. **Think before coding** — read the task + all scope files + ADRs; write `.plan` BEFORE touching source files; list your assumptions.
2. **Simplicity first** — reuse existing patterns; YAGNI; no premature abstraction; prefer fewer new lines.
3. **Surgical changes** — stay inside `scope.filesWrite`; minimum-diff; preserve existing behavior; no scope creep.
4. **Goal-driven** — map every change to a `goCriteria` item; if you cannot justify a line, remove it; assess yourself honestly.

---

## RBAC — Authority Matrix (ADR-037)

| Role | Write Source Code | Write Docs | Write `.tasks/` | Write `.brain/` |
|------|:-----------------:|:----------:|:---------------:|:---------------:|
| Brain | ❌ | ✅ | ✅ | ✅ |
| Worker | ✅ (scope only) | ✅ (scope only) | ✅ (own files) | ❌ |
| Auditor | ❌ | ❌ | ❌ | ✅ (patterns) |

ADR-037 V1.0 enforcement is **advisory/soft** (compile-time lint + audit-trail). Hard enforcement planned post-GA V2.

---

## Forbidden Anti-Patterns

| Anti-Pattern | Reason |
|-------------|--------|
| `it.skip(...)` without justification comment | Hides failing tests |
| `stub()` / hardcoded return values | Produces false GO results |
| `npm run build` in worker | `dist/` contamination risk |
| Writing outside `scope.filesWrite` | ADR-037 RBAC violation |
| `selfAssessment: "DONE"` without verify-ran | Sprint evaluator rejects → NO_GO |
| Hardcoded timestamps in `.hb` files | Use `new Date().toISOString()` |
| Ignoring ADR constraints | Requires NO_GO + ADR amendment proposal |
| Missing `.result` file on exit | Sprint stalls; always write result even on failure |

---

## Worker Rules Summary

```
1.  Read task file FIRST            (.tasks/task-XXX.json)
2.  Write heartbeat BEFORE work     (.tasks/task-XXX.hb)
3.  Write execution plan            (.tasks/task-XXX.plan)
4.  Check locks before writing      (.locks/)
5.  Update heartbeat on every file  (increment sequence)
6.  Stay within scope               (scope.directories + scope.filesWrite)
7.  Run verify loop                 (tsc + vitest, max 3 each)
8.  Write result file               (.tasks/task-XXX.result — REQUIRED)
9.  Release ALL locks               (success or failure)
10. Honest self-assessment          (pass Honest-Result Gate)
```

**Cardinal rules:** workers never plan · never spawn · never write outside scope · never leave result unwritten

---

## References

- **Source:** `src/agents/worker.ts`
- **Rules:** `.claude/rules/worker-default.md`
- **Karpathy discipline:** `.claude/rules/karpathy-discipline.md`
- **Full reference:** `docs/guide/workers.md`
- **Contract:** `docs/reference/api-surface.md`
- **RBAC:** ADR-037 (`.brain/exports/decisions.md`)
