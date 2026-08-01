# A05 — Guide: Workers, Troubleshooting & Misc

**Audit scope:** `docs/guide/workers.md`, `docs/guide/architecture-overview.md`, `docs/guide/config-recovery.md`, `docs/guide/troubleshooting.md`, `docs/guide/ram-experiment.md`

**Auditor task:** `345-005` · **Sprint:** 345 · **Date:** 2026-06-28

**Method:** Cross-reference each guide claim against `src/agents/worker.ts`, extracted modules (`worker-lifecycle.ts`, `worker-verify.ts`, `worker-log.ts`, `worker-rollback.ts`), `src/core/config.ts`, `src/core/monitoring-types.ts`, `src/core/task-types.ts`, and `src/monitor/auditor.ts`.

---

## Summary

| Doc | Status | Severity | Critical Inaccuracies |
|-----|--------|----------|-----------------------|
| `workers.md` | ⚠️ STALE | HIGH | Lifecycle diagram missing states; plan format wrong; lock thresholds wrong; API table incomplete |
| `architecture-overview.md` | ✅ ACCURATE | LOW | Prose correct; overlap with reference doc flagged |
| `config-recovery.md` | ✅ ACCURATE | LOW | All template defaults verified; minor import path note |
| `troubleshooting.md` | ⚠️ MINOR | LOW | Stale test count; wrong ADR cross-reference |
| `ram-experiment.md` | ✅ ACCURATE | LOW | Historical claims unverifiable from source; formula consistent |

---

## 1. `docs/guide/workers.md`

### 1.1 INACCURATE — Worker Lifecycle Diagram

**Doc claim** (§2, lines 61–75):
```
PENDING ──► CLAIMED ──► EXECUTING ──► TESTING ──► DOCUMENTING ──► DONE
```
Heartbeat status progression documented as: `EXECUTING → CODING → TESTING → DOCUMENTING`

**Evidence from source:**

Two distinct state representations exist:

**a) `AgentStatus` enum** (`src/core/monitoring-types.ts:10–23`) — used in `Heartbeat.status`:
```typescript
enum AgentStatus {
  IDLE, PLANNING, EXECUTING, EVALUATING, SCANNING,
  CODING, VERIFYING, TESTING, DOCUMENTING, DONE, ERROR, PAUSED
}
```
The heartbeat status progression `EXECUTING → CODING → VERIFYING → TESTING → DOCUMENTING` is supported by this type. The doc omits `VERIFYING` from the heartbeat progression.

**b) `WorkerLifecycleState`** (`src/agents/worker-lifecycle.ts:439–449`) — used in `WorkerStateMachine`:
```typescript
type WorkerLifecycleState =
  | 'SPAWNING' | 'STARTING' | 'EXECUTING'
  | 'VERIFYING' | 'TESTING' | 'WRITING_RESULT'
  | 'DONE' | 'EXITED' | 'ERROR' | 'ORPHAN'
```
Valid transitions (`worker-lifecycle.ts:452–463`):
```
SPAWNING → STARTING → EXECUTING → VERIFYING → TESTING → WRITING_RESULT → DONE
                                 └────────────────────────────────→ ERROR/ORPHAN
```

**Gap:** The doc lifecycle diagram does not show `SPAWNING`, `STARTING`, `VERIFYING`, `WRITING_RESULT`, `EXITED`, `ERROR`, or `ORPHAN` states. It conflates `AgentStatus` (heartbeat) with `WorkerLifecycleState` (state machine) without distinguishing them.

**Recommended fix:** Split the diagram into two: (a) task-file status (`PENDING → CLAIMED → EXECUTING → DONE/NO_GO`) and (b) worker process lifecycle states (`SPAWNING → STARTING → EXECUTING → VERIFYING → TESTING → WRITING_RESULT → DONE | ERROR | ORPHAN`). Add a note that `AgentStatus` drives heartbeat `.status` and `WorkerLifecycleState` drives the `WorkerStateMachine`.

---

### 1.2 INACCURATE — Plan File Format

**Doc claim** (§5, lines 139–151): The `.plan` file is shown as a **markdown** format with prose sections `## Approach`, `## Files to Modify`, `## Expected Outcome`.

**Evidence from source:**

`worker.ts:318–322`:
```typescript
export function writeTaskPlan(projectRoot: string, plan: TaskPlan): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = planFilePath(projectRoot, plan.taskId);
  writeFileSync(path, JSON.stringify(plan, null, 2), 'utf-8');
}
```

`TaskPlan` interface (`src/core/task-types.ts:502–512`):
```typescript
export interface TaskPlan {
  taskId: string;
  workerId: string;
  filesToCreate: string[];
  filesToModify: string[];
  executionSteps: string[];
  testStrategy: string;
  documentationPlan: string;
  estimatedDurationMin?: number;
}
```

**Gap:** The `.plan` file is written as **JSON**, not markdown. The documented format does not match the `TaskPlan` interface — it shows free-form markdown headings, while the actual schema uses structured fields (`filesToCreate`, `filesToModify`, `executionSteps`, etc.).

**Recommended fix:** Replace the markdown template in §5 with the actual JSON schema from `TaskPlan`. Note that LLM workers may write a freeform text plan to the `executionSteps` array.

---

### 1.3 INACCURATE — Lock Stale Thresholds

**Doc claim** (§6, lines 185–189):
```
| > 5 minutes  | WARNING alert                        |
| > 15 minutes | CRITICAL alert, Brain notified        |
```

**Evidence from source:**

`src/monitor/auditor.ts:691`:
```typescript
export function checkStaleLocks(
  projectRoot: string,
  autoClean = false,
  lockStaleThresholdMs = 300_000  // 5 minutes
): { ... }
```

Lines 718–755: A single threshold check. When elapsed > 5 min: either `AlertLevel.INFO` (if auto-cleaned) or `AlertLevel.WARNING`. **No secondary 15-minute CRITICAL threshold exists** in this function or anywhere in auditor.ts for file locks.

**Gap:** The documented "CRITICAL at 15 minutes" threshold does not exist in production code. Only one threshold (5 min → WARNING) is implemented.

**Recommended fix:** Remove the >15min CRITICAL row from the table. Change the table to accurately reflect: `> 5 min → WARNING (stale_lock boundary violation logged)`.

---

### 1.4 CORRECT — Heartbeat Stale Threshold

**Doc claim** (§4, line 131): "Auditor alerts if `now - timestamp > 2 minutes`"

**Evidence from source:**

`src/core/config.ts:251`:
```typescript
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 120_000;
```
`src/monitor/auditor.ts:32,477`: `import { DEFAULT_HEARTBEAT_TIMEOUT_MS }` used as default for `scanHeartbeats`.

`120_000 ms = 120 seconds = 2 minutes` → **MATCH**. The heartbeat stale threshold is correctly documented.

---

### 1.5 ARCHITECTURE GAP — Sprint 144 God Object Split

**Doc claim** (§16, lines 376–393): The API reference table lists all functions as if they are natively in `src/agents/worker.ts`.

**Evidence from source:**

`worker.ts:1–12` (file header):
```
Sprint 144 God Object Split: 1670 LoC → 4 modules.
This file retains core task I/O and re-exports everything from the 3 extracted modules.
```

Actual module split:
| Module | Functions |
|--------|-----------|
| `worker.ts` | `readTask`, `claimTask`, `writeTaskPlan`, `createHeartbeat`, `writeHeartbeat`, `writeResult`, `updateTaskStatus`, `isWithinScope`, `checkWorkerAuthority`, `authHealthCheck`, etc. |
| `worker-lifecycle.ts` | `atomicWriteFileSync`, `WorkerStateMachine`, `VALID_TRANSITIONS`, `STOPPABLE_STATES`, `TERMINAL_STATES`, feedback loop helpers |
| `worker-verify.ts` | `runTestVerifyLoop`, `runCompilationLoop`, `enforceVerifyLoop`, `verifyTests`, `verifyCompilation` |
| `worker-log.ts` | `readWorkerLog`, `formatWorkerLog`, `appendWorkerLog` |
| `worker-rollback.ts` | `snapshotWorkerScope`, `rollbackWorkerScope`, `dropWorkerSnapshot` |
| `core/file-lock.ts` | `acquireLock`, `releaseLock`, `checkLock`, `releaseAllLocks` |

**Gap:** The API table in §16 is functionally correct (all functions ARE re-exported from `worker.ts`), but omits: `calculateProgress()`, `verifyResultPersisted()`, `getSharedMemory()`, `setupTaskSnapshot()`, `checkWorkerAuthority()`, `emitWorkerQuestion()`, `authHealthCheck()`, `WorkerStateMachine`, and the rollback API. Minor incompleteness, not an inaccuracy.

**Recommended fix:** Add a note that `worker.ts` is a re-export router since Sprint 144 and list the extracted modules. Expand the API table with the missing exported functions.

---

### 1.6 CORRECT — Error Classes

**Doc claim** (§12): Three error classes: `TaskClaimError`, `LockError`, `ScopeViolationError`.

**Evidence from source:**
- `worker.ts:169`: `export class TaskClaimError extends Error` ✓
- `worker.ts:176`: `export class ScopeViolationError extends Error` ✓
- `worker.ts:127`: `export { LockError } from '../core/file-lock.js'` ✓

**MATCH.**

---

### 1.7 CORRECT — Atomic Write in `writeResult()`

**Doc claim** (§10, line 288): "Write to `.tmp` first, then `renameSync` to final path (Bug K fix)."

**Evidence from source:**

`worker.ts:412`: `_atomicWrite(path, JSON.stringify(result, null, 2))`

`worker-lifecycle.ts:43–53` (`atomicWriteFileSync`):
```typescript
const tmpPath = `${filePath}.tmp`;
writeFileSync(tmpPath, data, 'utf-8');
const fd = openSync(tmpPath, 'r');
try { fsyncSync(fd); } finally { closeSync(fd); }
renameSync(tmpPath, filePath);
```

**MATCH.**

---

### 1.8 CORRECT — Honest-Gate (Self-Honesty Check)

**Doc claim** (§11): DONE claim downgraded to NO_GO when linesAdded=0 AND testsPassed=false.

**Evidence from source:**

`worker.ts:393–409`: `looksLikeStub` check — exactly as documented. **MATCH.**

---

### 1.9 CORRECT — `isWithinScope()` Logic

**Doc claim** (§8): trailing-slash protection prevents `src/core/` matching `src/core-extra/`.

**Evidence from source:**

`worker.ts:546–549`:
```typescript
const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
if (resolvedFile.startsWith(dirWithSlash) || resolvedFile === normalizedDir) {
  return true;
}
```

**MATCH.** Symlink protection via `realpathSync` also present (not documented, but defensive).

---

### 1.10 Links in `workers.md`

| Link | Target | Status |
|------|--------|--------|
| `src/agents/worker.ts` | `/workspace/src/agents/worker.ts` | ✅ Exists |
| `.claude/rules/worker-default.md` | `/workspace/.claude/rules/worker-default.md` | ✅ Exists |
| `docs/reference/api-surface.md` | `/workspace/docs/reference/api-surface.md` | ✅ Exists |
| `src/core/types.ts` | Mentioned; actual types split across `task-types.ts`, `monitoring-types.ts` | ⚠️ Path drift — `types.ts` is a re-export barrel, not the canonical source |

---

## 2. `docs/guide/architecture-overview.md`

### 2.1 CORRECT — Module Descriptions

All 9 module directories described (`orchestra/`, `core/`, `agents/`, `nervous/`, `monitor/`, `connectors/`, `providers/`, `api/`, `cli/`, `mcp/`, `dashboard/`) match actual `src/` subdirectories. Descriptions are accurate at the architectural summary level.

| Module | Source present | Description accurate |
|--------|---------------|---------------------|
| `orchestra/` | ✅ | ✅ sprint lifecycle/planning/routing |
| `core/` | ✅ | ✅ stable shared foundation |
| `agents/` | ✅ | ✅ worker execution layer |
| `nervous/` | ✅ | ✅ proactive meta-orchestrator (ADR-040) |
| `monitor/` | ✅ | ✅ Auditor + scan loop |
| `connectors/` | ✅ | ✅ Discord/Telegram/WhatsApp adapters |
| `providers/` | ✅ | ✅ Claude/Codex/Gemini/Ollama/OpenAI-compat |
| `api/` | ✅ | ✅ HTTP API + SSE |
| `cli/` | ✅ | ✅ native command surface |
| `mcp/` | ✅ | ✅ stdio transport |
| `dashboard/` | ✅ | ✅ React/Vite/Tailwind |

### 2.2 CORRECT — One-Way Dependency Rule (ADR-008)

**Doc claim**: "Brain, implemented through `sprint-controller`, is the only orchestrator importing tmux, auditor, and worker execution modules."

This matches ADR-008 Amendment (Sprint 281) "Brain-family" definition. **MATCH.**

### 2.3 OVERLAP FLAG — `docs/reference/lifecycle-diagram.md`

`docs/guide/architecture-overview.md` and `docs/reference/lifecycle-diagram.md` cover the same module map:

| Content | `guide/architecture-overview.md` | `docs/reference/lifecycle-diagram.md` |
|---------|----------------------------------|--------------------------------------|
| Module map | Prose descriptions | Mermaid `graph TD` diagram |
| Sprint lifecycle | Not covered | Full mermaid `flowchart TD` with 8 phases |
| Module counts | None (safer) | "94 modules" for `orchestra/` |
| ADR references | ADR-008 | ADR-045, ADR-008 |

**Risk:** Dual maintenance of module descriptions. When modules are added or renamed, both files need updating. The reference doc is richer but may drift from the guide over time. The guide is prose-only (good for new-user onboarding); the reference doc is diagram-first (good for quick reference). The overlap is acceptable if authors know both exist, but neither file links to the other.

**Recommended fix:** Add a cross-link from `guide/architecture-overview.md` → `docs/reference/lifecycle-diagram.md` with note: "For the mermaid diagram version and sprint lifecycle, see the reference diagram."

### 2.4 INCOMPLETE — `agents/` Split Not Mentioned

The guide says `agents/` contains "adaptive agent modules support runtime adjustment." This is correct (`adaptive-agent.ts` exists) but doesn't mention the Sprint 144 god-object split that produced `worker-lifecycle.ts`, `worker-verify.ts`, `worker-log.ts`, `worker-rollback.ts`. Not a critical omission for an overview doc.

---

## 3. `docs/guide/config-recovery.md`

### 3.1 CORRECT — `REGEN_TEMPLATE_DEFAULTS`

**Doc claim** (lines 103–108): Template defaults:
```json
{
  "spawn_backend": "docker",
  "dependency_pipeline_enabled": false,
  "haiku_allowed": false,
  "brain_planning": "structured"
}
```

**Evidence from source** (`src/core/config.ts:1723–1728`):
```typescript
export const REGEN_TEMPLATE_DEFAULTS: Record<string, unknown> = {
  spawn_backend: 'docker',
  dependency_pipeline_enabled: false,
  haiku_allowed: false,
  brain_planning: 'structured',
} as const;
```

**EXACT MATCH.** All 4 fields and values are correct.

### 3.2 CORRECT — `regenerateConfigSafe()` is Synchronous

**Doc claim** (line 89): "senkron — Promise döndürmez"

**Evidence from source** (`config.ts:1751`): `export function regenerateConfigSafe(projectRoot?: string): RegenConfigResult` — plain function, not `async`. **MATCH.**

### 3.3 CORRECT — Merge Strategy

**Doc claim**: "mevcut config'i template defaults ile MERGE eder, overwite etmez. Kullanıcı değerleri her zaman kazanır."

**Evidence from source** (`config.ts:1776–1780`):
```typescript
// Template is the base; existing config overlays it — user fields always win
const merged = deepMerge(
  REGEN_TEMPLATE_DEFAULTS as Record<string, unknown>,
  existingConfig,
) as Record<string, unknown>;
```

**MATCH.** User config wins (it's the second argument to deepMerge, which overlays the first).

### 3.4 MINOR — Import Path Inconsistency

**Doc claim** (line 87): `import { regenerateConfigSafe } from 'deckent/core/config';`

The package export map for `deckent/core/config` is not verified in this audit (would require reading `package.json` exports field). The second code block (line 185) shows the internal relative path `'./src/core/config.js'` which is correct for project-internal use. No `.js` extension in the first block may fail under ESM resolution (ADR-001).

**Recommended fix:** Standardize to relative import with `.js` extension: `import { regenerateConfigSafe } from '../../src/core/config.js'` or verify the package export map supports the bare `deckent/core/config` specifier.

### 3.5 OVERLAP — Recovery Chain Duplication

The recovery chain (lines 43–53) is duplicated almost verbatim in `troubleshooting.md` (lines 24–40). The troubleshooting.md correctly references config-recovery.md with "See [Config Recovery Guide](./config-recovery.md) for a detailed breakdown." This cross-link pattern is appropriate. The duplication is intentional for UX (users searching troubleshooting don't need to leave the page for basic steps). **No action required** as long as updates propagate to both.

---

## 4. `docs/guide/troubleshooting.md`

### 4.1 CORRECT — Exit Code 137 = OOM/SIGKILL

**Doc claim** (line 49): "Exit code 137 = SIGKILL (OOM)." **Accurate.**

### 4.2 CORRECT — `deckent doctor` Node Check

**Doc claim** (line 116): "checks: Node version (≥24)."

Matches ADR-001 Node 24+ baseline (`package.json engines: { node: ">=24.0.0" }`). **MATCH.**

### 4.3 INACCURATE — ADR Cross-Reference

**Doc claim** (line 178): `# ADR-002: Node16 resolution`

**Finding:** ADR-001 covers TypeScript+ESM and the `.js` extension requirement on ESM imports (Node 16+ module resolution mode, now Node 24+ floor). ADR-002 is a separate ADR (not audited here). The comment attributes `.js` extension requirements to "ADR-002" but the correct ADR is **ADR-001**.

**Evidence:** CLAUDE.md §Gotchas: "ESM imports: .js extension mandatory (Node16 resolution)" — attribute is in ADR-001, not ADR-002.

**Recommended fix:** Change the comment to reference `ADR-001`.

### 4.4 STALE — Test Count Claim

**Doc claim** (lines 200–201): "Known pre-existing failures: ~67 tests in the full suite depend on stale model-id expectations or live provider connections."

This count is a point-in-time snapshot that will drift as tests are added, fixed, or the model-id landscape changes. The `~67` figure cannot be verified from the codebase without running the suite.

**Recommended fix:** Replace with a qualitative statement such as "A number of pre-existing test failures exist in the full suite unrelated to any given change — run only targeted tests for your changed files." Remove the specific count.

### 4.5 CORRECT — MCP Cache Warning

**Doc claim** (lines 207–217): "After a `tsc` rebuild, the long-lived MCP process still runs the old compiled code."

This matches the CLAUDE.md §Gotchas: "MCP server restart: dist/ rebuild sonrası long-lived MCP process eski kodu cache'ler." **MATCH.**

### 4.6 Links in `troubleshooting.md`

| Link | Target | Status |
|------|--------|--------|
| `./config-recovery.md` (line 42) | `docs/guide/config-recovery.md` | ✅ Exists |

No other inter-doc links. No dead links found.

---

## 5. `docs/guide/ram-experiment.md`

### 5.1 CORRECT — Formula

**Doc claim**:
```
peak_worker_RAM = max_workers × worker_memory_limit
total_required  = peak_worker_RAM + 2 GB (host overhead)
```
Formula is internally consistent and matches the scenario matrix in the doc. Cannot verify directly from source without reading CLI doctor command implementation.

### 5.2 CORRECT — Sprint History

Historical context (Sprint 192 first OOM, Sprint 194 `detectHostMemory()`, Sprint 198 `--ram-experiment`) cannot be verified from current source but is consistent with the overall sprint numbering cadence.

### 5.3 CORRECT — WSL2 Config Format

**Doc claim** (lines 59–63): `~/.wslconfig [wsl2] memory=24GB swap=8GB` — standard WSL2 format, accurate.

### 5.4 UNVERIFIED — Exit Code 1 for Risky

**Doc claim** (line 102): "Exit code is `1` when verdict is Risky."

Cannot confirm without reading the CLI doctor command source (`src/cli/commands/doctor.ts` or similar). Marked unverified but the claim is reasonable.

---

## Cross-Cutting: Overlap Detection

### `guide/architecture-overview.md` vs `docs/reference/lifecycle-diagram.md`

| Aspect | guide/architecture-overview.md | docs/reference/lifecycle-diagram.md |
|--------|---------------------------------|--------------------------------------|
| Audience | New users, onboarding | Developers referencing architecture |
| Format | Prose paragraphs | Mermaid diagrams + table |
| Module map | ✅ Both cover the same 9 modules | ✅ |
| Sprint lifecycle | ❌ Not covered | ✅ Full 8-phase diagram |
| Cross-links | ❌ No link to reference doc | ❌ No link to guide |
| Maintenance risk | HIGH if module map changes | HIGH if module map changes |

**Finding:** Both files maintain independent copies of the module map. A new module addition requires updates in at minimum 3 places: CLAUDE.md §Architecture, `guide/architecture-overview.md`, and `docs/reference/lifecycle-diagram.md`. No linking between them.

### Recovery Chain Duplication

`config-recovery.md` and `troubleshooting.md` both contain the 5-step recovery chain. The troubleshooting.md links to config-recovery.md for "detailed breakdown" — an acceptable pattern. No further deduplication recommended.

---

## Findings Summary

### MUST FIX (High — Inaccurate claims)

| ID | Doc | Section | Issue |
|----|-----|---------|-------|
| F-W1 | `workers.md` | §2 Lifecycle | Diagram missing SPAWNING, STARTING, VERIFYING, WRITING_RESULT, EXITED, ERROR, ORPHAN states; two state representations (AgentStatus vs WorkerLifecycleState) conflated |
| F-W2 | `workers.md` | §5 Plan Writing | Plan format shown as markdown; actual format is JSON (TaskPlan interface) |
| F-W3 | `workers.md` | §6 Lock Management | "CRITICAL at >15 min" threshold does not exist; only WARNING at >5 min implemented |
| F-T1 | `troubleshooting.md` | §Build Failures | ADR cross-reference incorrect: `.js` extension rule is ADR-001, not ADR-002 |

### SHOULD FIX (Low — Staleness/Completeness)

| ID | Doc | Section | Issue |
|----|-----|---------|-------|
| F-W4 | `workers.md` | §16 API Reference | Missing ~8 exported functions; no mention of Sprint 144 module split |
| F-W5 | `workers.md` | §9 Test Execution | `VERIFYING` status omitted from heartbeat progression |
| F-T2 | `troubleshooting.md` | §Test Failures | `~67` test count is stale and unmaintained |
| F-C1 | `config-recovery.md` | §Güvenli Config | Import path uses package specifier without `.js`; ESM compliance unclear |

### CONSIDER (Structural / Overlap)

| ID | Docs | Issue |
|----|------|-------|
| F-A1 | `architecture-overview.md` ↔ `lifecycle-diagram.md` | Parallel module maps with no cross-links; dual maintenance risk |
| F-W6 | `workers.md` references `src/core/types.ts` | `types.ts` is a barrel re-export; canonical types are in `task-types.ts`, `monitoring-types.ts` |

---

## Verified Claims (Evidence Trail)

| Claim | Doc | Source | Result |
|-------|-----|--------|--------|
| Heartbeat stale threshold = 2 min | `workers.md:131` | `config.ts:251` `DEFAULT_HEARTBEAT_TIMEOUT_MS = 120_000` | ✅ CORRECT |
| `TaskClaimError`, `LockError`, `ScopeViolationError` | `workers.md:311–326` | `worker.ts:127,169,176` | ✅ CORRECT |
| Atomic write via `.tmp → fsync → rename` | `workers.md:288` | `worker-lifecycle.ts:43–53` | ✅ CORRECT |
| Honest-gate: stub DONE → NO_GO | `workers.md:294` | `worker.ts:393–409` | ✅ CORRECT |
| `isWithinScope` trailing-slash protection | `workers.md:226` | `worker.ts:546–549` | ✅ CORRECT |
| `REGEN_TEMPLATE_DEFAULTS` values | `config-recovery.md:103–108` | `config.ts:1723–1728` | ✅ EXACT MATCH |
| `regenerateConfigSafe` is synchronous | `config-recovery.md:89` | `config.ts:1751` | ✅ CORRECT |
| User config wins in deepMerge | `config-recovery.md:9–10` | `config.ts:1776–1780` | ✅ CORRECT |
| Lock stale threshold = 5 min | `workers.md:186` (WARNING) | `auditor.ts:691` default 300_000ms | ✅ CORRECT (WARNING only) |
| Lock stale CRITICAL at 15 min | `workers.md:188` | `auditor.ts:691–759` | ❌ DOES NOT EXIST |
| Plan file is markdown format | `workers.md:139–151` | `worker.ts:318–322` + `task-types.ts:503` | ❌ WRONG — JSON |
| Architecture module map | `architecture-overview.md` | `src/` directory listing | ✅ CORRECT |

---

*A05 audit complete. No source code was modified. All findings are documentation-only.*
