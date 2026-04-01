# SECURITY.md — Deckent Security Model

> Reference: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) §15 Security & Permissions

---

## Overview

Deckent enforces a **4-level permission hierarchy** that strictly separates what each agent role can read, write, and execute. The security model is enforced through a combination of:

1. Claude Code `--allowedTools` flags (runtime enforcement)
2. Auditor boundary detection (continuous scanning)
3. File lock mechanism (concurrent write safety)
4. Scope rules in task JSON (declaration-time enforcement)

This document details each layer, the threat model, and how violations are detected and handled.

---

## 1. Four-Level Permission System

### Level 1 — Operator (Human User)

The human operating the system. Has unrestricted access.

| Capability | Details |
|---|---|
| **Read** | All files in workspace |
| **Write** | All files — including `DIRECTIVES.md`, `AGENTS.md`, `.deckent/config.json` |
| **Execute** | All `deckent` CLI commands |
| **Control** | Can kill any agent (`deckent kill <id>`), approve/reject plans |
| **Git** | All git operations without restriction |

The Operator is the trust root. All other permissions derive from what the Operator grants via `DIRECTIVES.md` and `--allowedTools` configuration.

---

### Level 2 — Brain (Orchestrator)

The Brain orchestrates the sprint but cannot modify Operator-level configuration files.

| Capability | Allowed | Denied |
|---|---|---|
| **Read** | All files | — |
| **Write** | `.tasks/`, `.contracts/`, `.brain/`, `.dashboard` | `AGENTS.md`, `DIRECTIVES.md`, `.deckent/config.json` |
| **Execute** | `claude -p` (spawn workers), `tmux` (create/kill windows) | Direct source code writes |
| **Git** | `commit`, `push` (with Operator approval) | Force-push, branch deletion |

**Rationale:** The Brain must never override the Operator's goals (DIRECTIVES.md) or system configuration. Separating these prevents a runaway Brain from rewriting its own instructions.

**Claude Code `--allowedTools`:**
```
Read,Write,Bash(git *),Bash(claude *),Bash(tmux *),Bash(cat *),Bash(find *),Bash(ls *)
```

---

### Level 3 — Auditor (Monitor)

The Auditor observes the system but never modifies source code or creates tasks.

| Capability | Allowed | Denied |
|---|---|---|
| **Read** | All files | — |
| **Write** | `.dashboard`, `.brain/PATTERNS.md`, `.tasks/ALERT` | Source code, `.tasks/*.json` (create/modify), `.brain/MEMORY.md` |
| **Execute** | `git diff`, `git log` (read-only git) | Build, test, spawn agents |
| **Alerts** | Write alert files | Cannot kill agents directly |

**Rationale:** The Auditor's independence from the execution path is critical — it must be able to detect and report violations without being part of the attack surface.

**Claude Code `--allowedTools`:**
```
Read,Write(.dashboard),Write(.brain/PATTERNS.md),Write(.tasks/ALERT),Bash(git diff *),Bash(git log *),Bash(cat *),Bash(ls *),Bash(wc *)
```

---

### Level 4 — Worker (Executor)

Workers are the most restricted agents. Each worker operates within a tightly scoped sandbox.

| Capability | Allowed | Denied |
|---|---|---|
| **Read** | `AGENTS.md`, `.contracts/`, own task file | Other workers' task files, `.brain/`, `.deckent/config.json` |
| **Write** | Source files **within assigned scope only** | Files outside `scope.directories` + `scope.filesWrite` |
| **Write** | `.tasks/{own-id}.hb`, `.tasks/{own-id}.result`, `.tasks/{own-id}.plan` | Other workers' `.hb`/`.result` files |
| **Execute** | `npm *`, `npx *`, `git add *` (project build/test) | `claude -p` (no spawning), `tmux`, git push |

**Claude Code `--allowedTools`:**
```
Read,Write(src/{scope}/*),Write(tests/{scope}/*),Write(.tasks/{id}.*),Bash(npm *),Bash(npx *),Bash(git add *)
```

**Key restriction:** Workers CANNOT write to `.brain/` — memory updates are exclusively handled by Brain.

---

## 2. Scope Rules

Every task JSON file declares a `scope` object that defines the worker's write boundary:

```json
{
  "scope": {
    "directories": ["src/core/", "src/monitor/"],
    "filesRead": ["AGENTS.md", ".contracts/api-surface.md"],
    "filesWrite": ["docs/reference/security.md"]
  }
}
```

### Scope Enforcement Rules

| Rule | Description |
|---|---|
| **Directory containment** | Worker may write any file whose path starts with a `scope.directories` entry |
| **Explicit file write** | Files listed in `scope.filesWrite` are always writable regardless of directory |
| **Read-only files** | `scope.filesRead` lists files the worker may read but not modify |
| **Trailing separator** | Directories are compared with a trailing `/` to prevent prefix overlap (`src/core/` cannot match `src/core-extra/`) |
| **Path normalization** | All paths are normalized (OS path separator) before comparison to prevent traversal attacks |

### Implementation Reference

Scope checking is implemented in `src/monitor/auditor.ts`:

```typescript
function isFileInScope(filePath: string, scope: TaskScope): boolean {
  const normalizedFile = normalize(filePath).replace(/\\/g, '/');

  for (const dir of scope.directories) {
    const normalizedDir = normalize(dir).replace(/\\/g, '/');
    const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
    if (normalizedFile.startsWith(dirWithSlash) || normalizedFile === normalizedDir) {
      return true;
    }
  }

  for (const f of scope.filesWrite) {
    if (normalize(f).replace(/\\/g, '/') === normalizedFile) return true;
  }

  return false;
}
```

---

## 3. Lock Mechanism

To prevent concurrent write conflicts between parallel workers, Deckent uses a file-based lock system in `.locks/`.

### Lock File Format

Lock files are stored as `.locks/{filepath-with-__-separators}.lock`:

```json
{
  "filePath": "src/core/types.ts",
  "ownerWorkerId": "w-007-002",
  "acquiredAt": "2026-03-18T09:00:00.000Z",
  "taskId": "007-002"
}
```

### Lock Naming Convention

File path separators (`/`) are replaced with `__` (double underscore) to avoid nested directory creation:

| File Path | Lock File Name |
|---|---|
| `src/core/types.ts` | `src__core__types.ts.lock` |
| `docs/reference/security.md` | `docs__SECURITY.md.lock` |

### Lock Lifecycle

1. **Acquire** — Worker checks `.locks/` before writing any file
2. **Hold** — Lock is held for the duration of the write operation
3. **Release** — Lock file is deleted after the write completes
4. **Stale detection** — Auditor flags locks held for more than 5 minutes (`LOCK_STALE_THRESHOLD_MS = 300_000`)

### Stale Lock Handling

When Auditor detects a stale lock (>5 min), it:
1. Creates a `WARNING` alert in `.dashboard`
2. Records the pattern in `.brain/PATTERNS.md`
3. The Brain can escalate to killing the offending worker

```
WARNING: Stale lock: src/core/types.ts by w-007-002 (held 312s)
```

---

## 4. Auditor Boundary Detection

The Auditor runs a continuous scan loop every 30 seconds (`AUDITOR_SCAN_INTERVAL_MS`). Each scan cycle checks four threat categories:

### 4.1 Heartbeat Staleness

Workers must update their `.tasks/{id}.hb` file every time they take an action. If a heartbeat is older than 2 minutes (`HEARTBEAT_STALE_THRESHOLD_MS = 120_000`):

- Auditor creates a `CRITICAL` alert
- Records as `stale_heartbeat` violation
- Brain evaluates whether to synthesize a `NO_GO` result

### 4.2 Boundary Violations

Auditor runs `git diff --stat` to see all modified files, then cross-references each file against the scope map loaded from active task JSON files:

```
git diff --stat → modified files list
  ↓
For each file: isFileInScope(file, workerScope)?
  No → BoundaryViolation: file_outside_scope
```

**Limitation:** The current implementation flags all out-of-scope changed files. Future versions will attribute violations to specific workers by combining git blame data with heartbeat timestamps.

### 4.3 Stale Locks

Auditor scans `.locks/*.lock` files. Any lock held beyond the threshold generates a `WARNING` alert.

### 4.4 Circular Dependencies / Deadlocks

Auditor uses **Kahn's algorithm** (topological sort) on task dependency graphs to detect cycles:

1. Build adjacency list from task `dependencies` fields
2. Run BFS from zero-in-degree nodes
3. If `processed < totalNodes` → cycle detected
4. Report the cyclic task IDs as `circular_dependency` violation

```typescript
// If processed < inDegree.size, a cycle exists
const cyclicNodes = [...inDegree.entries()]
  .filter(([, degree]) => degree > 0)
  .map(([id]) => id);
```

### Scan Result Disposition

After each scan, the Auditor:
- Overwrites `.dashboard` with updated state (never appends — always fresh)
- Appends new patterns to `.brain/PATTERNS.md` (never overwrites — append only)
- Keeps last 50 alerts in dashboard state

---

## 5. Dangerous Mode Control

Deckent supports three operating modes with different risk/convenience trade-offs:

| Mode | Command | Behavior |
|---|---|---|
| **Normal** | `deckent start` | Claude Code prompts for permission on each tool use |
| **Auto-approve** | `deckent start --auto-approve` | All tool uses auto-approved (uses `--dangerously-skip-permissions`) |
| **Sandbox** | `deckent start --sandbox` | Runs workers inside Docker container (most restrictive) |

**Warning:** `--auto-approve` should only be used in controlled environments. It bypasses Claude Code's interactive permission prompts, which are the last line of defense against unintended file modifications.

---

## 6. Threat Model

### In-Scope Threats

| Threat | Vector | Mitigation |
|---|---|---|
| **Worker scope creep** | Worker writes outside assigned directory | Auditor `git diff` scan + BoundaryViolation alert |
| **Stale/zombie worker** | Worker crashes, holds locks forever | Stale heartbeat + stale lock detection |
| **Deadlocked tasks** | Task A depends on B depends on A | Kahn's algorithm circular dependency detection |
| **Brain overreach** | Brain modifies DIRECTIVES or config | `--allowedTools` excludes those file paths |
| **Concurrent write conflict** | Two workers write the same file | `.locks/` file-based mutex |
| **Memory budget overflow** | `.brain/` exceeds 900 lines | Brain's `runDecay` forced at budget limit |
| **Sprint abandonment** | Error mid-sprint leaves tasks incomplete | `runSprint` wraps all phases in try/catch; always reaches COMPLETE |

### Out-of-Scope Threats

| Threat | Notes |
|---|---|
| **Network-level attacks** | Deckent is a local CLI tool; no network surface in core |
| **Supply chain attacks** | Standard npm dependency hygiene applies; not Deckent-specific |
| **Claude API key theft** | Handled by Anthropic SDK / OS credential store |
| **Multi-user isolation** | Deckent is single-user, single-workspace; no multi-tenancy |

### Trust Boundaries

```
┌─────────────────────────────────────────────────┐
│  OPERATOR (full trust)                          │
│  ┌───────────────────────────────────────────┐  │
│  │  BRAIN (elevated trust)                   │  │
│  │  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │   AUDITOR    │  │  WORKERS (x N)   │   │  │
│  │  │ (read-heavy) │  │  (scope-scoped)  │   │  │
│  │  └──────────────┘  └──────────────────┘   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Each boundary is enforced independently — a compromised Worker cannot escalate to Brain-level writes, and the Auditor cannot create tasks or spawn agents.

---

## 7. Module Import Security (ADR-008)

The module import graph is itself a security boundary. Circular imports are explicitly forbidden:

| Rule | Enforcement |
|---|---|
| Brain is the **only** module that imports from tmux, auditor, worker | `tsc --noEmit` + code review |
| Planner imports **only** from `core/` | Prevents planner from accessing execution context |
| Auditor reads task files **from disk** (no brain import) | Prevents auditor from being manipulated by brain state |
| Worker reads task files **from disk** (no brain import) | Prevents worker from accessing orchestration secrets |

This ensures that even if a worker module is compromised, it cannot call Brain or Auditor functions directly.

---

## 8. Configuration Security

The `.deckent/config.json` file controls system behavior (model limits, plan mode, sprint IDs). It is writable only by the Operator:

```json
{
  "brain_planning": "ai",
  "haiku_allowed": true,
  "last_sprint_id": 17,
  "workspace": "."
}
```

Brain reads this file but cannot write it. Workers have no access to it. Changes to config require operator intervention, preventing agents from modifying their own constraints.

---

## Related Documentation

- [DECKENT-MASTER-BLUEPRINT.md §15](../DECKENT-MASTER-BLUEPRINT.md) — Primary security specification
- [worker-guide.md](../development/worker-guide.md) — Worker scope and lock rules
- [brain-guide.md](../development/brain-guide.md) — Brain permission boundaries
- [architecture.md](../architecture/architecture.md) — Overall system architecture
- `.contracts/api-surface.md` — Worker scope contract definition
- `.claude/rules/auditor.md` — Auditor operational rules
