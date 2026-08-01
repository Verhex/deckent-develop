# Authority Matrix — Brain · Auditor · Worker RBAC Protocol V1.0

> **ADR Reference:** [ADR-037 — Brain-Auditor-Worker Authority Matrix](../adr/037-brain-auditor-worker-authority-matrix-rbac-protocol-v1-0.md) (see also the [ADR index](../adr/README.md))
> **Protocol Version:** 1.0 (Sprint 138)
> **NIST Reference:** NIST SP 800-162 — Guide to Attribute Based Access Control (ABAC)

> ⚠️ **Enforcement reality (ADR-037 V1.0 — read this first).** This matrix
> describes the **intended** authority model. What is actually enforced today:
> - **Layer 1 (compile-time lint) + Layer 3 (audit-trail) are ACTIVE.**
> - **Layer 2 (runtime) is ADVISORY/SOFT** — violations are logged as warnings
>   and emitted to the event stream but **do NOT block the action**
>   (`authority-enforcer.ts` is always-soft; `worker.ts` returns `true` even on
>   a detected violation). The hard-blocking Layer-2 is **intentionally absent
>   in V1.0** and planned as a post-GA **V2 hard-flip**.
> - `enforceVerifyLoop()` / `runTestVerifyLoop()` are **prompt instructions,
>   not code-enforced** (0 runtime callers).
>
> This mirrors the honest framing already in `CLAUDE.md` and
> `.claude/rules/worker-default.md`. Read "blocks / prevents / denied / thrown /
> NO_GO" below as **design intent**, not a current runtime guarantee.
>
> ℹ️ **ADR store:** ADRs live in `.brain/memory.db` (`type='adr'`), exported to
> `.brain/exports/decisions.md` and `docs/adr/`. The legacy path
> `.brain/DECISIONS.md` used below is **shorthand for the ADR governance
> store** — the write-prohibition applies to that store in any representation.

This document is the human-readable reference for Deckent's Role-Based Access Control (RBAC) system. For the formal specification see [ADR-037](../adr/037-brain-auditor-worker-authority-matrix-rbac-protocol-v1-0.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Principles](#2-core-principles)
3. [Full Authority Matrix Table](#3-full-authority-matrix-table)
4. [Brain Authority](#4-brain-authority)
5. [Auditor Authority](#5-auditor-authority)
6. [Worker Authority](#6-worker-authority)
7. [Cross-Role Interaction Rules](#7-cross-role-interaction-rules)
8. [Scenario Examples](#8-scenario-examples)
9. [Enforcement Layers](#9-enforcement-layers)
10. [ADR-038 Exception (Future)](#10-adr-038-exception-future)
11. [NIST SP 800-162 Reference](#11-nist-sp-800-162-reference)
12. [Versioning & Evolution](#12-versioning--evolution)

---

## 1. Overview

Deckent's three core components operate under **explicit, least-privilege access control**:

| Component | Role | Core Responsibility |
|-----------|------|---------------------|
| **Brain** | Orchestrator | Plan, coordinate, decide (GO / NO_GO) |
| **Auditor** | Independent Verifier | Observe, verify, report — NEVER write source code |
| **Worker** | Task Executor | Write code within assigned scope — NEVER judge own work |

The authority matrix defines *exactly* what each component can read, write, execute, and emit. By design intent, any action not explicitly permitted is implicitly denied (fail-closed model). **In V1.0 this is not yet runtime-enforced** — see the enforcement-reality note at the top: a disallowed action is logged + event-emitted but still proceeds (soft mode). Treat the ✅/❌/⚠️ cells below as the *intended* policy, not a runtime guarantee.

### Why This Matters

Before Sprint 138, authority was enforced only through natural-language rules in `.claude/rules/*.md`. Real-world incidents proved this insufficient:

- **Sprint 137 Task 137-001:** Worker reported `DONE`, but 53 vitest tests still failed. Worker was acting as its own judge — a role that belongs only to the Auditor.
- **Sprint 138 Task 138-003:** Auditor's authority was extended without a formal RBAC record, making the boundary invisible to new contributors.

This document closes those gaps.

---

## 2. Core Principles

### Least Privilege
Each component has only the minimum permissions required to perform its role. Additional permissions must be explicitly justified and recorded in ADR-037.

### Separation of Duties
No single component can both execute and verify its own work:
- Worker **writes** code → Auditor **verifies** it → Brain **decides** GO/NO_GO

### Auditability
Every permission exercise is recorded in the event stream (`.deckent/sprint-NNN-events.jsonl`). Unauthorized access attempts are logged as `SCOPE_VIOLATION` events.

### Fail-Closed
**Design goal:** if a permission check fails or is ambiguous → access denied; explicit allow lists, implicit deny. **Current implementation (V1.0):** soft-mode — a failed check is logged + event-emitted but the action still proceeds (see the enforcement-reality note at the top). Fail-closed blocking is the post-GA V2 target.

### Safety Floor — 5 Locked Actions

The following 5 actions are **permanently locked** — they require explicit user approval (`'approve'` policy) in **every mode**, including `full-auto`. They cannot be bypassed by any config override or user override. Defined in `src/nervous/authority-matrix.ts:24-30`.

| Action ID | Description |
|---|---|
| `KILL_LIVE_SPRINT` | Kill an active sprint and its workers |
| `MANUAL_FILE_DELETE` | Manually delete files outside task scope |
| `COST_OVER_THRESHOLD` | Execute actions that exceed the configured cost gate |
| `DESTRUCTIVE_GIT` | Destructive git operations (force-push, reset --hard, branch -D) |
| `ADR_DEPRECATE_ACCEPTED` | Deprecate or remove an already-accepted ADR |

These 5 actions form the `SAFETY_FLOOR` constant (`ReadonlyArray<SafetyFloorAction>`) and are checked before any policy resolution in `resolvePolicy()`. When `isSafetyFloor: true`, the policy is always `'approve'` regardless of the active matrix preset.

### Advisory Default / Hard Opt-In (ENT-1)

The base enforcement model for role-based worker authority is **advisory** (soft mode, backward-safe). To opt into **hard enforcement** (actual blocking on capability violations), set the `enforce_rbac` key to `true` in `.deckent/config.json`:

```json
{ "enforce_rbac": true }
```

- **Advisory mode (default, `enforce_rbac: false`):** A role-denied capability emits a `WorkerAuthorityViolation` event and logs a warning, but the action proceeds (`allowed: true`).
- **Hard mode (`enforce_rbac: true`):** A role-denied capability returns `allowed: false` — the action is hard-blocked.

Config key constant: `ENFORCE_RBAC_CONFIG_KEY = 'enforce_rbac'` (`src/nervous/authority-matrix.ts:196`).

---

## 3. Full Authority Matrix Table

The master overview of the **intended** policy. ✅ = allowed, ❌ = denied (by intent), ⚠️ = conditional (see notes). Per the enforcement-reality note above, ❌ cells are **not hard-blocked at runtime in V1.0** — a violation is warned + event-emitted, then the action proceeds; hard-block is the post-GA V2 target.

### File System Write Access

| Path Pattern | Brain | Auditor | Worker | Notes |
|---|:---:|:---:|:---:|---|
| `src/**` | ❌ | ❌ | ⚠️ | Worker: only files in `scope.filesWrite`. Brain meta-refactoring has no accepted ADR (see §10). |
| `tests/**` | ❌ | ❌ | ⚠️ | Worker: only files in `scope.filesWrite` |
| `.tasks/*.json` (task definitions) | ✅ | ❌ | ❌ | Brain creates/updates task definitions |
| `.tasks/task-{ownId}.hb` | ❌ | ❌ | ✅ | Worker writes own heartbeat only |
| `.tasks/task-{ownId}.result` | ❌ | ❌ | ✅ | Worker writes own result only |
| `.tasks/task-{ownId}.plan` | ❌ | ❌ | ✅ | Worker writes own execution plan only |
| `.tasks/task-{otherId}.*` | ❌ | ❌ | ❌ | Lateral-movement prevention (intent; soft in V1.0) |
| `.brain/MEMORY.md` | ✅ | ❌ | ❌ | Brain manages sprint learnings |
| `.brain/RETRO.md` | ✅ | ❌ | ❌ | Brain writes retrospective |
| `.brain/DEBT.md` | ✅ | ❌ | ❌ | Brain manages tech debt table |
| `.brain/PATTERNS.md` | ✅ | ✅ APPEND | ❌ | Auditor may only append new patterns |
| `.brain/DECISIONS.md` | ❌ | ❌ | ❌ | ADR changes require human governance |
| `.brain/sprints/sprint-*.md` | ✅ | ❌ | ❌ | Brain writes sprint logs |
| `.brain/archive/*` | ✅ | ❌ | ❌ | Brain archives tasks/directives |
| `.deckent/config.json` | ✅ | ❌ | ❌ | Brain updates project config |
| `.deckent/sprint-state.json` | ✅ | ❌ | ❌ | Brain manages sprint phase transitions |
| `.deckent/sprint-*-events.jsonl` | ✅ APPEND | ✅ APPEND | ❌ | Append-only; overwrite forbidden |
| `.deckent/sprint-*-checkpoint.json` | ✅ | ❌ | ❌ | Brain writes resume checkpoints |
| `.deckent/sprint-*-gate.json` | ❌ | ✅ | ❌ | Auditor computes sprint gates |
| `.deckent/sprint-*-metrics.jsonl` | ✅ APPEND | ❌ | ❌ | Brain emits metric points |
| `.deckent/cache/*` | ✅ | ❌ | ❌ | Brain writes managed-docs cache |
| `.dashboard` | ❌ | ✅ | ❌ | Auditor overwrites every 30s |
| `.locks/{ownScope}` | ❌ | ✅ (stale) | ✅ | Auditor: clean stale locks. Worker: own scope only |
| `docs/audits/*` | ❌ | ✅ | ❌ | Auditor writes audit/load-test reports |
| `docs/vision/roadmap.md` | ❌ | ❌ | ❌ | Human-only document |

### Sprint Lifecycle Actions

| Action | Brain | Auditor | Worker | Notes |
|--------|:---:|:---:|:---:|---|
| Task creation (PLAN phase) | ✅ | ❌ | ❌ | Requires DIRECTIVES.md read first |
| Worker spawn | ✅ | ❌ | ❌ | Only during SPAWN phase |
| Worker kill | ✅ | ❌ | ❌ | On timeout or NO_GO |
| GO / NO_GO / GO_WITH_TECH_DEBT label | ✅ | ❌ | ❌ | Auditor recommends; Brain decides |
| Cross-dependency fix spawn | ✅ | ❌ | ❌ | FIX phase, after dependency analysis |
| Skip auditor verification | ❌ | ❌ | ❌ | Brain expected to await verification (protocol intent; not code-gated) |
| Self-audit (judge own decisions) | ❌ | ❌ | ❌ | Self-audit gate owned by Auditor |
| Verification 3-pipeline | ❌ | ✅ | ❌ | Requires worker `.result` file |
| Functional verification | ❌ | ✅ | ❌ | During EXECUTE or EVALUATE phase |
| Tech debt validation | ❌ | ✅ | ❌ | Worker reported GO_WITH_TECH_DEBT |
| ADR compliance check | ❌ | ✅ | ❌ | Pilot: ADR-006, ADR-008, ADR-010 |
| Sprint gate computation | ❌ | ✅ | ❌ | After EVALUATE phase completes |
| PASS / DOWNGRADE / FAIL verdict | ❌ | ✅ | ❌ | Auditor verdict informs Brain decision |
| Task claim (PENDING → CLAIMED) | ❌ | ❌ | ✅ | Worker must own the task |
| Code writing | ❌ | ❌ | ✅ | Within assigned scope only |
| tsc + vitest verify loop | ❌ | ❌ | ✅ | Prompt instruction (≤3 attempts), **not code-enforced** — `enforceVerifyLoop`/`runTestVerifyLoop` have 0 runtime callers |
| Self-assessment writing | ❌ | ❌ | ✅ | DONE / GO_WITH_TECH_DEBT / NO_GO |
| Checkpoint question | ❌ | ❌ | ✅ | WORKER→BRAIN:QUESTION channel |

### Event Stream Channel Rights

| Channel | Brain | Auditor | Worker |
|---------|:---:|:---:|:---:|
| `BRAIN→WORKER:TASK_ASSIGN` | EMIT | — | CONSUME |
| `BRAIN→WORKER:ANSWER` | EMIT | — | CONSUME |
| `BRAIN→WORKER:FIX_REQUEST` | EMIT | — | CONSUME |
| `BRAIN→*:METRIC_EMITTED` | EMIT | CONSUME | — |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | EMIT | CONSUME | CONSUME |
| `WORKER→BRAIN:HEARTBEAT` | CONSUME | — | EMIT |
| `WORKER→BRAIN:RESULT` | CONSUME | — | EMIT |
| `WORKER→BRAIN:QUESTION` | CONSUME | — | EMIT |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | — | CONSUME | EMIT |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | CONSUME | EMIT | — |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | CONSUME | EMIT | — |
| `AUDITOR→BRAIN:ADR_VIOLATION` | CONSUME | EMIT | — |
| `AUDITOR→BRAIN:GATE_COMPUTED` | CONSUME | EMIT | — |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | CONSUME | EMIT | — |
| `DECKENT→USER:NOTIFY` | — | — | — |

> `DECKENT→USER:NOTIFY` is owned by the Deckent CLI layer, not any agent role. Implemented in Sprint 139 (`src/core/notification-dispatcher.ts`).

---

## 4. Brain Authority

Brain is the **sprint orchestrator**. It plans, coordinates, and makes final GO/NO_GO decisions.

### What Brain CAN Do

- **Read DIRECTIVES.md** → generate task JSON files in `.tasks/`
- **Spawn and kill workers** via configured backend (tmux / subprocess / Docker)
- **Evaluate task results** → assign GO / NO_GO / GO_WITH_TECH_DEBT labels
- **Write sprint memory** → `.brain/MEMORY.md`, `.brain/RETRO.md`, `.brain/DEBT.md`
- **Manage sprint state** → `.deckent/sprint-state.json`, checkpoint files
- **Append to event stream** → `BRAIN→*` channels only

### What Brain CANNOT Do

- **Write source code** (`src/**`, `tests/**`) — protocol intent: spawn a Worker instead (not runtime-blocked in V1.0)
- **Modify ADRs** (the ADR governance store; legacy shorthand `.brain/DECISIONS.md`) — requires human governance process
- **Write to `.dashboard`** — Auditor's domain by intent
- **Skip auditor verification** — Brain is expected to consume `AUDITOR→BRAIN:VERIFICATION_RESULT` before labeling a task GO (protocol convention, not a code gate)

### Brain's Decision Flow

```
DIRECTIVES.md
     ↓
Brain reads + plans (task JSONs)
     ↓
Workers spawn + execute
     ↓
Auditor verifies → VERIFICATION_RESULT
     ↓
Brain receives verdict + evaluates
     ↓
GO / NO_GO / GO_WITH_TECH_DEBT label
```

---

## 5. Auditor Authority

Auditor is the **independent verifier**. It observes the system state and reports findings — it never modifies what it reviews.

### What Auditor CAN Do

- **Read everything** (src, tests, task files, ADRs) — for analysis purposes
- **Run `git diff --stat`** to detect boundary violations
- **Write verification results** to event stream and `docs/audits/`
- **Compute sprint gate** → `.deckent/sprint-*-gate.json`
- **Clean stale locks** (older than 5 minutes) in `.locks/`
- **Append patterns** to `.brain/PATTERNS.md` (append-only, never overwrite)

### What Auditor CANNOT Do

- **Write source code** (`src/**`, `tests/**`) — absolute prohibition, no exceptions
- **Create or modify task JSON files** — Brain's exclusive right
- **Change sprint state** (`.deckent/sprint-state.json`)
- **Issue GO / NO_GO labels** — Auditor *recommends* (PASS/DOWNGRADE/FAIL verdict); Brain *decides*

### Auditor's 3-Pipeline Verification

When a Worker reports a result, Auditor runs a 3-stage pipeline based on the worker's self-assessment:

```
Worker selfAssessment
        ↓
   ┌────┴────┐
  DONE   TECH_DEBT   NO_GO
   ↓        ↓         ↓
verifyFunctional  validateTechDebt  tryCodeVerifiedDone
   ↓        ↓         ↓
 PASS /  PASS /    PASS /
DOWNGRADE FAIL    DOWNGRADE
        ↓
AUDITOR→BRAIN:VERIFICATION_RESULT
```

---

## 6. Worker Authority

Workers are **task executors**. Each Worker operates within a strictly bounded scope defined by its task JSON file.

### What Worker CAN Do

- **Write code** — only files in `scope.filesWrite` and `scope.directories`
- **Read context** — task JSON, `scope.filesRead`, ADRs (injected into the prompt from the governance store; exported to `.brain/exports/decisions.md` / `docs/adr/`), `DIRECTIVES.md`
- **Write own artifacts** — `.tasks/task-{ownId}.hb`, `.result`, `.plan`, `.verify-delta.json`
- **Acquire file locks** — for its own scope before each file write
- **Send event stream messages** — `WORKER→BRAIN:*` and `WORKER→AUDITOR:CODE_VERIFY_REQUEST`

### What Worker CANNOT Do

- **Read or write sibling task files** (`.tasks/task-{otherId}.*`) — lateral-movement prevention (intent; soft in V1.0)
- **Modify the ADR governance store** (legacy shorthand `.brain/DECISIONS.md`) — privilege-escalation prevention (intent)
- **Write to `.brain/MEMORY.md`, `.brain/RETRO.md`** — Brain's domain by intent
- **Change sprint state** — Brain's responsibility by intent
- **Self-verify** — Workers are not expected to run their own verification pipeline; that belongs to Auditor (role convention — note: the worker-side tsc/vitest verify loop is a prompt instruction, `enforceVerifyLoop`/`runTestVerifyLoop` have 0 runtime callers)

### Worker Scope Resolution

Every Worker's allowed paths come from its task JSON:

```json
{
  "scope": {
    "directories": ["src/core/", "tests/core/"],
    "filesRead": ["src/core/config.ts", "docs/adr/README.md"],
    "filesWrite": ["src/core/config.ts", "tests/core/config.test.ts"]
  }
}
```

The `isWithinScope()` function in `src/agents/worker.ts` *computes* whether a path is in scope (symlink-aware, see ADR-034). It is a pure boolean predicate: it does **not** throw or block. The wrapper `checkWorkerAuthority()` warns + emits an `AUTHORITY_VIOLATION` event on an out-of-scope write but then `return true` (the write proceeds — V1.0 soft mode). Boundary observance therefore relies on worker discipline (honest BOUNDARY_VIOLATION → NO_GO self-flag) plus Auditor advisory monitoring, not a runtime block.

### Worker Role Taxonomy (ENT-1)

Beyond the Brain/Auditor/Worker separation, workers themselves have a **role taxonomy** that controls which capabilities their task may exercise. This is the ENT-1 layer (`src/nervous/authority-matrix.ts:187-320`).

#### Roles

| Role | Capabilities | Typical Use |
|---|---|---|
| `admin` | All capabilities (full trust) | CI/CD pipelines, privileged ops |
| `engineer` | All except `erp-write` and `tenant-scope` | Standard development tasks |
| `operator` | `fs-read`, `fs-write`, `network`, `db-query`, `erp-read`, `shell`, `mcp-tool` | Execute/dispatch + read; excludes dev-admin caps (`db-write`, `erp-write`, `approval`, `provider-pin`, `gpu`, `tenant-scope`) |
| `viewer` | `fs-read`, `db-query`, `erp-read` only | Read-only analysis, audits |

Role → capability mapping is defined in `WORKER_ROLE_CAPABILITY_MAP` (`src/nervous/authority-matrix.ts:213`). The `admin` role has all 13 capabilities; `engineer` has 11 (excludes enterprise-admin caps); `operator` has 7 (execute/dispatch + read; excludes dev-admin caps); `viewer` has 3 (read-only).

#### Authority Check

`checkWorkerAuthority(request, matrix, opts)` validates that the worker's `actor.role` allows the requested capabilities:
- Returns `{ allowed: boolean, level: 'permit' | 'warn' | 'deny', ... }`
- `level: 'permit'` — all capabilities allowed
- `level: 'warn'` — violation detected, advisory (soft mode)
- `level: 'deny'` — violation detected, hard-blocked (when `enforce_rbac: true`)

Missing/unknown actor role defaults to `allow-all` (backward-compatible permissive default).

---

## 7. Cross-Role Interaction Rules

### Rule 1: Separation of Assessment and Verification

Worker writes self-assessment → Auditor verifies independently → Brain decides.

```
Worker: "I think this is DONE"         (selfAssessment)
   ↓
Auditor: "Let me check"                (verifyFunctional)
   ↓
Auditor: "Tests pass — PASS verdict"   (VERIFICATION_RESULT event)
   ↓
Brain: "GO"                            (final label)
```

No component can both execute and verify its own work.

### Rule 2: No Direct Worker-to-Worker Communication

Workers cannot communicate directly. All coordination flows through Brain.

```
Worker A needs Worker B's output
           ↓
   Worker A → WORKER→BRAIN:QUESTION
           ↓
   Brain resolves dependency (FIX phase priority)
           ↓
   Brain → BRAIN→WORKER:ANSWER → Worker A
```

### Rule 3: Auditor Independence (Absolute)

Auditor **never** writes source code (`src/**`, `tests/**`). This is ADR-037's untouchable rule, enforced as a role-discipline invariant (the Auditor module has no source-write code path) plus audit-trail observation — not a runtime sandbox. If Auditor writes code, it can no longer independently verify it — the entire verification model collapses.

### Rule 4: Brain Orchestration Boundary

Brain coordinates through task assignment. It does not write source code directly.

```
Brain needs a code change
       ↓
Brain creates task JSON (scope-bounded)
       ↓
Brain spawns Worker
       ↓
Worker implements + reports result
       ↓
Brain evaluates
```

Exception: The Brain meta-refactoring capability (referenced in ADR-037) has no accepted ADR. By policy intent, Brain does not write to `src/**` (enforced via role discipline + audit trail in V1.0, not a runtime block). See §10 for ADR-038 naming clarification.

### Rule 5: Event Stream Integrity

The event stream (`.deckent/sprint-NNN-events.jsonl`) is **append-only**. No component may modify or delete existing events. A corrupted event stream triggers file-based fallback (ADR-035).

---

## 8. Scenario Examples

### Scenario A: Worker Tries to Write `sprint-state.json`

> "Worker task-139-005 wants to update `.deckent/sprint-state.json` to mark its phase as DONE"

**What happens:**

1. Worker calls `isWithinScope('.deckent/sprint-state.json')` before writing.
2. `isWithinScope()` checks the path against `task-139-005.json`'s `scope.filesWrite` list.
3. `isWithinScope('.deckent/sprint-state.json')` returns `false`. `checkWorkerAuthority()` logs a `[ADR-037 soft]` warning and emits an `AUTHORITY_VIOLATION` event, then `return true` — **the write is NOT hard-blocked in V1.0**. The honest worker self-flags `BOUNDARY_VIOLATION` → writes `NO_GO`. V2 will hard-block.
4. Auditor's 30s scan also detects the drift via `git diff --stat` (advisory).
5. Auditor emits `AUDITOR→BRAIN:ADR_VIOLATION` event with `{ rule: 'ADR-037', component: 'worker', path: '.deckent/sprint-state.json' }`.
6. Brain receives the violation event and may apply FIX/cascade; the task is typically evaluated NO_GO via the worker's honest self-flag + Auditor verdict (not an automatic runtime block).

**Root cause:** Sprint state management is Brain's exclusive responsibility. Workers never advance sprint phases directly — they only write their own `.result` files.

---

### Scenario B: Auditor Edits `src/monitor/auditor.ts`

> "The Auditor determines it needs to improve its own verification logic during a sprint scan"

**What happens:**

1. Auditor has **READ** access to `src/**` (for code analysis).
2. By policy intent, Auditor does **NOT** have write access to `src/**` — ADR-037 Rule 3 (Auditor Independence). This is enforced as a role-discipline rule (the Auditor module has no source-write code path), not a runtime guard.
3. A write to `src/monitor/auditor.ts` would be flagged by the Auditor's own `git diff --stat` advisory scan and recorded in the audit trail (V1.0 does not hard-block it).
4. Auditor must not modify the code it verifies — doing so would invalidate its independence.

**Correct process:** Auditor identifies the issue → emits `AUDITOR→BRAIN:ADR_VIOLATION` or leaves a note in `docs/audits/` → Brain creates a new task for a Worker to implement the fix.

**Why this matters:** If Auditor could edit source code, the verification pipeline becomes circular: "I verified my own changes." This is precisely the failure mode seen in Sprint 137 when workers self-assessed as DONE.

---

### Scenario C: Brain Needs to Change `.brain/DECISIONS.md`

> "Brain wants to add a new ADR entry during sprint execution"

**What happens:**

1. By policy intent, Brain does **NOT** have write access to the ADR governance store (legacy shorthand `.brain/DECISIONS.md`; ADRs live in `.brain/memory.db` and `docs/adr/`) — ADR-037 DENY by intent (advisory/audit-trail in V1.0, not a runtime block).
2. Brain must not create ADRs autonomously, even if it identifies a legitimate architectural need.

**Correct process:**

```
Brain identifies new architectural decision needed
        ↓
Brain writes proposal to sprint retrospective (RETRO.md)
        ↓
Human (Alperen) reviews proposal in next session
        ↓
Human authors the new ADR in docs/adr/ (mirrored into .brain/memory.db)
        ↓
ADR governance validation: npm run lint:adr
```

**Why this matters:** ADRs are governance documents. Allowing AI agents to modify them creates a privilege escalation path — an agent could relax its own scope constraints by writing a new "ADR." The ADR-store write prohibition (legacy shorthand `.brain/DECISIONS.md`) applies by intent to **all three roles** (Brain, Auditor, Worker). In V1.0 this is enforced via audit-trail + role discipline, not a runtime block.

---

### Scenario D: Two Workers Write to the Same File

> "Worker task-139-010 and task-139-015 both need to modify `src/core/config.ts`"

**What happens:**

1. `detectScopeCollisions()` (defined in `src/orchestra/conflict-resolver.ts`, invoked from `src/orchestra/sprint-spawner.ts`) identifies the conflict at **plan time**.
2. The conflicting tasks are placed in separate waves so they do not run concurrently (illustrative wave numbers).
3. At runtime, Worker task-139-010 acquires a file lock (`.locks/src__core__config.ts.lock`) via `acquireLock()` in `src/core/file-lock.ts`.
4. If task-139-015 attempts to lock before release, `acquireLock()` returns `null` (advisory, process-level — not OS-enforced).
5. Worker task-139-015 waits and retries after the lock is released.
6. If both attempt concurrent write despite wave separation, Auditor emits `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` (advisory).

**Prevention:** Plan-time collision detection plus advisory file locks make this scenario rare; note neither is a hard OS-level guarantee in V1.0.

---

### Scenario E: Worker Self-Reports DONE With Failing Tests

> "Worker reports selfAssessment: 'DONE' but vitest still has 12 failures"

**What happens (Sprint 138+ behavior):**

1. Worker writes `.tasks/task-139-XXX.result` with `selfAssessment: "DONE"`.
2. Worker also writes `.tasks/task-139-XXX.verify-delta.json` with test results.
3. Brain receives the result file.
4. **Auditor's 3-pipeline** kicks in:
   - `verifyFunctional()` is called because self-assessment is `DONE`
   - Auditor runs `npx vitest run` on affected test files
   - 12 failures detected → verdict: `DOWNGRADE`
5. Auditor emits `AUDITOR→BRAIN:VERIFICATION_RESULT` with `{ verdict: 'DOWNGRADE', newStatus: 'GO_WITH_TECH_DEBT' }`.
6. Brain overrides the worker's self-assessment → task labeled `GO_WITH_TECH_DEBT`. (This evaluation path is real; the worker-side tsc/vitest verify loop that *should* catch this first is a prompt instruction only — `enforceVerifyLoop`/`runTestVerifyLoop` have 0 runtime callers — so Auditor verification is the effective backstop, not a worker-side hard gate.)

**Historical context:** This exact scenario occurred in Sprint 137 Task 137-001. The worker shortcut ("code exists = DONE") was the direct motivation for the 3-pipeline verification system in Sprint 138.

---

### Scenario F: Worker Writes to Another Worker's Task File

> "Worker task-139-007 tries to read Worker task-139-012's `.result` file to check if its dependency is done"

**What happens:**

1. `.tasks/task-139-012.result` is **not** in Worker task-139-007's `scope.filesRead`.
2. `isWithinScope()` returns `false` → the access is flagged (warn + `AUTHORITY_VIOLATION` event) but in V1.0 is **not hard-blocked**; the honest worker must not proceed and should self-flag. V2 will hard-deny.
3. **Correct approach:** Worker task-139-007 should use the `WORKER→BRAIN:QUESTION` channel to ask Brain about task-139-012's status.
4. Brain has full visibility into all task states and responds via `BRAIN→WORKER:ANSWER`.

**Why workers can't read sibling task files:** Lateral movement prevention. A malicious or confused worker could read another task's result and falsely claim completion of work it didn't do.

---

## 9. Enforcement Layers

The authority matrix is enforced at three layers:

### Layer 1 — Compile-Time (Static Analysis)

| Mechanism | What It Checks |
|-----------|----------------|
| `npm run lint:adr` | ADR format, status enum, duplicate IDs |
| Worker prompt injection (ADR-036) | Authority matrix injected into every worker prompt |
| TypeScript type system | Typed scope/role interfaces catch mis-wiring at compile time (note: `isWithinScope()`'s boolean result is *advisory* at runtime — `checkWorkerAuthority()` warns/emits but does not act on it) |

### Layer 2 — Runtime (Advisory / Soft, V1.0)

> Violations here are **logged + event-emitted but do NOT block** (soft mode).
> Hard blocking is the post-GA V2 target.

| Mechanism | What it currently does (V1.0 soft) |
|-----------|-----------------------------------|
| `isWithinScope()` in `worker.ts` | Symlink-aware path check; on violation **warns + emits event, then allows the write** (`return true`) |
| `acquireLock()` in `file-lock.ts` | Attempts a file lock; on conflict logs/retries (process-level, advisory) |
| Auditor 30s scan cycle | `git diff --stat` detects boundary drift → **advisory** alert/event |
| Event stream `source` field validation | Wrong `source` → `SCOPE_VIOLATION` alert (logged, non-blocking) |

### Layer 3 — Post-Hoc (Audit Trail)

| Mechanism | What It Records |
|-----------|-----------------|
| Event stream replay | Full reconstruction of all permission exercises |
| `.deckent/sprint-*-gate.json` | Authority violation count in gate computation |
| `docs/audits/sprint-*/` | Per-sprint compliance report |

**Limitation:** Runtime enforcement is currently process-level (not OS-level). A compromised process could bypass `isWithinScope()`. OS-level enforcement (seccomp, capabilities) was considered and rejected — see ADR-037 Alternatives.

---

## 10. ADR-038 Exception

> ⚠️ **ADR-038 naming clarification:** The ADR-038 accepted in memory.db is
> **"Dead Code Disposition — Sprint 139 Audit Results"** (code cleanup
> decisions). It is **not** the "Brain Meta-Refactoring Capability" referenced
> in ADR-037 section 3 above. The Brain Meta-Refactoring Capability concept
> remains un-ADR'd — the forward reference in ADR-037 was written speculatively
> during Sprint 138 (before Sprint 139 finalized ADR-038's actual content).

ADR-037 contains a forward reference to a **Brain Meta-Refactoring Capability** that would allow Brain to write to `src/**` under specific, tightly controlled conditions (e.g., automated code generation from schema, mechanical refactoring across many files). This concept has **not** been accepted as an ADR.

**Current status:** No accepted ADR grants Brain write access to `src/**`. Brain's `src/**` write prohibition is treated as **absolute by policy** (V1.0 enforcement is role-discipline + audit-trail, not a runtime guard).

**Why it requires a separate ADR:** Granting Brain write access to source code is a significant authority expansion that could collapse the Brain/Worker separation of duties. Any such grant must be:
- Explicitly scoped (which files, which conditions)
- Independently verified (Auditor must still validate Brain's code changes)
- Formally governed (human review + `npm run lint:adr` pass)

---

## 11. NIST SP 800-162 Reference

Deckent's authority matrix is **designed to align** with NIST SP 800-162 (Guide to ABAC) principles. The "Deckent V1.0 status" column states what is actually enforced today (soft/advisory) vs. the design target:

| NIST Concept | Design Intent | Deckent V1.0 Status |
|---|---|---|
| **Least Privilege** | Each role has minimal permissions; default-deny | Policy defined; checks are advisory (soft) |
| **Separation of Duties** | Worker ≠ Verifier ≠ Decision-maker | Enforced by role wiring + Auditor verification |
| **Need to Know** | Workers read only their own task file + declared `filesRead` | Policy defined; out-of-scope reads warned, not blocked |
| **Accountability** | Event stream provides an audit trail | Active (append-only event stream) |
| **Fail-Secure** | Permission-check failure → access denied | **Not yet** — soft mode logs/emits, action proceeds (V2 target) |
| **Complete Mediation** | `isWithinScope()` consulted before every file write | Check is computed but result is advisory (`return true`) |

### Threat Model Coverage

Mitigations below state the design intent; in V1.0 the scope/path mitigations are **advisory (warn + emit, not hard-block)** — see the enforcement-reality note. Audit-trail and lock-cleanup mitigations are active.

| Threat (STRIDE) | Intended Mitigation | V1.0 Reality |
|---|---|---|
| **S**poofing (Worker A impersonates Worker B) | Task-scoped file access — worker writes only `.tasks/task-{ownId}.*` | Advisory check; relies on worker discipline + audit trail |
| **T**ampering (Worker modifies ADRs) | ADR-store write denied for all agent roles | Advisory + audit trail (no hard-block) |
| **R**epudiation (No audit trail) | Append-only event stream records every action | Active |
| **I**nformation Disclosure (Worker reads sibling task) | `scope.filesRead` checked by `isWithinScope()` | Check computed; result advisory in V1.0 |
| **D**enial of Service (Stale lock flood) | Auditor clears locks older than 5 minutes | Active |
| **E**levation of Privilege (Worker writes sprint-state) | Sprint-state write denied for Worker and Auditor | Advisory + Auditor `git diff` scan (no hard-block) |

---

## 12. Versioning & Evolution

### Current Version: Protocol V1.0 (Sprint 138)

| Change Type | Required Process |
|-------------|-----------------|
| Add new permission (expand access) | ADR-037 amendment + `npm run lint:adr` must pass |
| Remove permission (restrict access) | ADR-037 amendment + affected component tests updated |
| Add new role (e.g., Notifier, Scheduler) | New ADR superseding ADR-037 |
| Change event channel rights | ADR-035 + ADR-037 updated together |

### Evolution History (current sprint: 286)

> These milestones were written as future plans at Sprint 138. Sprint 286 is now
> active; the items below are historical.

| Sprint | Scope | Status |
|--------|-------|--------|
| Sprint 139 | `DECKENT→USER:NOTIFY` channel (Notification Dispatcher) | ✅ Implemented (`src/core/notification-dispatcher.ts`) |
| Sprint 140+ | File-based fallback soft-deprecated; event stream primary | ⚠️ Partial — DB-first Memory V2 active; file decay is no-op |
| Sprint 142 | File-based state (`.hb`, `.result`) removed — event stream only | ❌ Not yet — `.hb`/`.result` files still active |
| Sprint 145+ | Distributed sprint execution — new ADR required | ❌ Not yet — scope not started |

---

## Related Documents

- **[ADR-037](../adr/037-brain-auditor-worker-authority-matrix-rbac-protocol-v1-0.md)** — Formal RBAC specification
- **ADR-035** — Event stream protocol and channel codes ([ADR index](../adr/README.md))
- **ADR-034** — Per-project isolation and symlink-aware scope ([ADR index](../adr/README.md))
- **ADR-036** — ADR governance and worker prompt injection ([ADR index](../adr/README.md))
- **ADR-008** — Brain-only import rule (import boundary = authority boundary) ([ADR index](../adr/README.md))
- **[sprint-lifecycle.md](sprint-lifecycle.md)** — Sprint phases where authority rules apply
- **[architecture.md](architecture.md)** — System overview and module map
- **[NIST SP 800-162](https://csrc.nist.gov/publications/detail/sp/800-162/final)** — Guide to ABAC Definition and Considerations
