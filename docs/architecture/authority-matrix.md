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

The authority matrix defines *exactly* what each component can read, write, execute, and emit. Any action not explicitly permitted is **implicitly denied** (fail-closed model).

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

---

## 3. Full Authority Matrix Table

The master overview. ✅ = allowed, ❌ = denied, ⚠️ = conditional (see notes).

### File System Write Access

| Path Pattern | Brain | Auditor | Worker | Notes |
|---|:---:|:---:|:---:|---|
| `src/**` | ❌ | ❌ | ⚠️ | Worker: only files in `scope.filesWrite`. ADR-038 Brain exception pending. |
| `tests/**` | ❌ | ❌ | ⚠️ | Worker: only files in `scope.filesWrite` |
| `.tasks/*.json` (task definitions) | ✅ | ❌ | ❌ | Brain creates/updates task definitions |
| `.tasks/task-{ownId}.hb` | ❌ | ❌ | ✅ | Worker writes own heartbeat only |
| `.tasks/task-{ownId}.result` | ❌ | ❌ | ✅ | Worker writes own result only |
| `.tasks/task-{ownId}.plan` | ❌ | ❌ | ✅ | Worker writes own execution plan only |
| `.tasks/task-{otherId}.*` | ❌ | ❌ | ❌ | Lateral movement prevention |
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
| Skip auditor verification | ❌ | ❌ | ❌ | Brain MUST await verification |
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

> `DECKENT→USER:NOTIFY` is owned by the Deckent CLI layer, not any agent role. Defined in Protocol V1.0 for Sprint 139 dispatcher implementation.

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

- **Write source code** (`src/**`, `tests/**`) — must spawn a Worker instead
- **Modify ADRs** (`.brain/DECISIONS.md`) — requires human governance process
- **Write to `.dashboard`** — Auditor's exclusive domain
- **Skip auditor verification** — Brain must consume `AUDITOR→BRAIN:VERIFICATION_RESULT` before labeling a task GO

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
- **Read context** — task JSON, `scope.filesRead`, `.brain/DECISIONS.md`, `DIRECTIVES.md`
- **Write own artifacts** — `.tasks/task-{ownId}.hb`, `.result`, `.plan`, `.verify-delta.json`
- **Acquire file locks** — for its own scope before each file write
- **Send event stream messages** — `WORKER→BRAIN:*` and `WORKER→AUDITOR:CODE_VERIFY_REQUEST`

### What Worker CANNOT Do

- **Read or write sibling task files** (`.tasks/task-{otherId}.*`) — lateral movement prevention
- **Modify `.brain/DECISIONS.md`** — privilege escalation prevention
- **Write to `.brain/MEMORY.md`, `.brain/RETRO.md`** — Brain's exclusive domain
- **Change sprint state** — Brain's exclusive right
- **Self-verify** — Workers cannot run their own verification pipeline; that belongs to Auditor

### Worker Scope Resolution

Every Worker's allowed paths come from its task JSON:

```json
{
  "scope": {
    "directories": ["src/core/", "tests/core/"],
    "filesRead": ["src/core/config.ts", ".brain/DECISIONS.md"],
    "filesWrite": ["src/core/config.ts", "tests/core/config.test.ts"]
  }
}
```

The `isWithinScope()` function in `src/agents/worker.ts` enforces these boundaries with symlink-aware path resolution (see ADR-034).

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

Auditor **never** writes source code (`src/**`, `tests/**`). This is ADR-037's untouchable rule. If Auditor writes code, it can no longer independently verify it — the entire verification model collapses.

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

Exception: ADR-038 (meta-refactoring capability) is referenced but not yet defined. Until ADR-038 is accepted, Brain cannot write to `src/**`.

### Rule 5: Event Stream Integrity

The event stream (`.deckent/sprint-NNN-events.jsonl`) is **append-only**. No component may modify or delete existing events. A corrupted event stream triggers file-based fallback (ADR-035).

---

## 8. Scenario Examples

### Scenario A: Worker Tries to Write `sprint-state.json`

> "Worker task-139-005 wants to update `.deckent/sprint-state.json` to mark its phase as DONE"

**What happens:**

1. Worker calls `isWithinScope('.deckent/sprint-state.json')` before writing.
2. `isWithinScope()` checks the path against `task-139-005.json`'s `scope.filesWrite` list.
3. `.deckent/sprint-state.json` is **not** in the worker's scope → violation detected. *(V1.0 soft: a warning is logged + an event emitted; the write is **not hard-blocked**. The honest worker self-flags BOUNDARY_VIOLATION → NO_GO. V2 will hard-block.)*
4. Auditor's 30s scan also detects the attempt via `git diff --stat`.
5. Auditor emits `AUDITOR→BRAIN:ADR_VIOLATION` event with `{ rule: 'ADR-037', component: 'worker', path: '.deckent/sprint-state.json' }`.
6. Brain receives the violation event → applies FIX/cascade and the task is evaluated NO_GO.

**Root cause:** Sprint state management is Brain's exclusive responsibility. Workers never advance sprint phases directly — they only write their own `.result` files.

---

### Scenario B: Auditor Edits `src/monitor/auditor.ts`

> "The Auditor determines it needs to improve its own verification logic during a sprint scan"

**What happens:**

1. Auditor has **READ** access to `src/**` (for code analysis).
2. Auditor does **NOT** have write access to `src/**` — ADR-037 Rule 3 (Auditor Independence).
3. Any attempt to write `src/monitor/auditor.ts` would trigger a scope violation.
4. Auditor cannot modify the code it verifies — doing so would invalidate its independence.

**Correct process:** Auditor identifies the issue → emits `AUDITOR→BRAIN:ADR_VIOLATION` or leaves a note in `docs/audits/` → Brain creates a new task for a Worker to implement the fix.

**Why this matters:** If Auditor could edit source code, the verification pipeline becomes circular: "I verified my own changes." This is precisely the failure mode seen in Sprint 137 when workers self-assessed as DONE.

---

### Scenario C: Brain Needs to Change `.brain/DECISIONS.md`

> "Brain wants to add a new ADR entry during sprint execution"

**What happens:**

1. Brain does **NOT** have write access to `.brain/DECISIONS.md` — ADR-037 explicit DENY.
2. Brain cannot create ADRs autonomously, even if it identifies a legitimate architectural need.

**Correct process:**

```
Brain identifies new architectural decision needed
        ↓
Brain writes proposal to sprint retrospective (RETRO.md)
        ↓
Human (Alperen) reviews proposal in next session
        ↓
Human writes new ADR in .brain/DECISIONS.md
        ↓
ADR governance validation: npm run lint:adr
```

**Why this matters:** ADRs are governance documents. Allowing AI agents to modify them creates a privilege escalation path — an agent could relax its own scope constraints by writing a new "ADR." The `.brain/DECISIONS.md` write prohibition applies to **all three roles** (Brain, Auditor, Worker).

---

### Scenario D: Two Workers Write to the Same File

> "Worker task-139-010 and task-139-015 both need to modify `src/core/config.ts`"

**What happens:**

1. `detectScopeCollisions()` in `sprint-spawner.ts` identifies the conflict at **plan time**.
2. Both tasks are placed in separate waves: task-139-010 in Wave 3, task-139-015 in Wave 4.
3. At runtime, Worker task-139-010 acquires a file lock (`.locks/src__core__config.ts.lock`).
4. If task-139-015 attempts to write before the lock is released, `acquireLock()` returns `null`.
5. Worker task-139-015 waits and retries after the lock is released.
6. If both attempt concurrent write despite wave separation, Auditor emits `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`.

**Prevention:** Plan-time collision detection means this scenario should be rare in practice.

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
6. Brain overrides the worker's self-assessment → task labeled `GO_WITH_TECH_DEBT`.

**Historical context:** This exact scenario occurred in Sprint 137 Task 137-001. The worker shortcut ("code exists = DONE") was the direct motivation for the 3-pipeline verification system in Sprint 138.

---

### Scenario F: Worker Writes to Another Worker's Task File

> "Worker task-139-007 tries to read Worker task-139-012's `.result` file to check if its dependency is done"

**What happens:**

1. `.tasks/task-139-012.result` is **not** in Worker task-139-007's `scope.filesRead`.
2. `isWithinScope()` check fails → access denied.
3. **Correct approach:** Worker task-139-007 should use `WORKER→BRAIN:QUESTION` channel to ask Brain about task-139-012's status.
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
| TypeScript type system | `isWithinScope()` return types enforce scope at call sites |

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

## 10. ADR-038 Exception (Future)

ADR-037 contains a forward reference to **ADR-038: Brain Meta-Refactoring Capability**. This is a **not-yet-accepted** ADR that would allow Brain to write to `src/**` under specific, tightly controlled conditions (e.g., automated code generation from schema, mechanical refactoring across many files).

**Current status:** ADR-038 is referenced but not defined. Brain's `src/**` write prohibition is **absolute** until ADR-038 is formally accepted and specifies precise scope constraints.

**Why it requires a separate ADR:** Granting Brain write access to source code is a significant authority expansion that could collapse the Brain/Worker separation of duties. Any such grant must be:
- Explicitly scoped (which files, which conditions)
- Independently verified (Auditor must still validate Brain's code changes)
- Formally governed (human review + `npm run lint:adr` pass)

---

## 11. NIST SP 800-162 Reference

Deckent's authority matrix aligns with NIST SP 800-162 (Guide to ABAC) principles:

| NIST Concept | Deckent Implementation |
|---|---|
| **Least Privilege** | Each role has minimal permissions; defaults to deny |
| **Separation of Duties** | Worker ≠ Verifier ≠ Decision-maker |
| **Need to Know** | Workers read only their own task file + declared `filesRead` |
| **Accountability** | Event stream provides immutable audit trail |
| **Fail-Secure** | Permission check failure → access denied (not granted) |
| **Complete Mediation** | `isWithinScope()` called before every file write |

### Threat Model Coverage

| Threat (STRIDE) | Mitigation |
|---|---|
| **S**poofing (Worker A impersonates Worker B) | Task-scoped file access — each worker can only write `.tasks/task-{ownId}.*` |
| **T**ampering (Worker modifies ADRs) | `.brain/DECISIONS.md` write denied for all agent roles |
| **R**epudiation (No audit trail) | Append-only event stream records every action |
| **I**nformation Disclosure (Worker reads sibling task) | `scope.filesRead` enforced by `isWithinScope()` |
| **D**enial of Service (Stale lock flood) | Auditor clears locks older than 5 minutes |
| **E**levation of Privilege (Worker writes sprint-state) | Sprint state write denied for Worker and Auditor |

---

## 12. Versioning & Evolution

### Current Version: Protocol V1.0 (Sprint 138)

| Change Type | Required Process |
|-------------|-----------------|
| Add new permission (expand access) | ADR-037 amendment + `npm run lint:adr` must pass |
| Remove permission (restrict access) | ADR-037 amendment + affected component tests updated |
| Add new role (e.g., Notifier, Scheduler) | New ADR superseding ADR-037 |
| Change event channel rights | ADR-035 + ADR-037 updated together |

### Planned Evolution

| Sprint | Scope |
|--------|-------|
| Sprint 139 | `DECKENT→USER:NOTIFY` channel implementation (Notification Dispatcher) |
| Sprint 140+ | File-based fallback soft-deprecated; event stream becomes primary |
| Sprint 142 | File-based state (`.hb`, `.result`) removed — event stream only |
| Sprint 145+ | Distributed sprint execution — authority matrix may require new ADR |

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
