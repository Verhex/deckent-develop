# monitor#1 — monitor/alert-emitter + monitor/auditor + monitor/dashboard-manager

## Findings

- [inconsistent|medium] Triple divergent alert-dedup implementations — `src/monitor/alert-emitter.ts:40` (`deduplicateAlert`, key=`source??''`), `src/monitor/auditor.ts:1433` (`deduplicateAlerts`, key=`"${source??''}::${message}"`), `src/monitor/dashboard-manager.ts:272` (`dedupAlerts`, key=`source??message`) — three parallel dedup functions with different dedup key strategies, field-update semantics, and retention ordering for the same conceptual operation.

  Evidence (alert-emitter.ts:42-43):
  ```ts
  const key = incoming.source ?? '';
  const existing = list.find((a) => (a.source ?? '') === key);
  ```
  Evidence (auditor.ts:1438-1440):
  ```ts
  const key = `${alert.source ?? ''}::${alert.message}`;
  const idx = merged.findIndex(
    (a) => `${a.source ?? ''}::${a.message}` === key,
  ```
  Evidence (dashboard-manager.ts:275-276):
  ```ts
  const key = alert.source ?? alert.message;
  const existing = map.get(key);
  ```

- [root-cause|medium] `emitAlert` silent-fallback — both `catch {}` blocks at `src/monitor/alert-emitter.ts:85-87` and `src/monitor/alert-emitter.ts:98-101` swallow all I/O errors with zero logging. Dashboard write failures and event-stream write failures are invisible to the scan loop and any observer.

  Evidence (alert-emitter.ts:85-87):
  ```ts
  } catch {
    // Dashboard write failure must not break scan loop
  }
  ```
  Evidence (alert-emitter.ts:98-101):
  ```ts
  } catch {
    // Event stream write failure must not break scan loop
  }
  ```

- [root-cause|critical] `checkBoundaryViolations` double-loop false-positive factory — `src/monitor/auditor.ts:642-656` iterates EVERY changed file × EVERY worker scope. File changed by Worker A triggers violations against Workers B, C, D whose scope doesn't include that file — even though B/C/D never touched the file. Comment at line 647 admits: `"simplified: flag all out-of-scope files"`. Root cause of the chronic `file_outside_scope` violation pattern in `.brain/exports/summary.md` (36 entries).

  Evidence (auditor.ts:642-656):
  ```ts
  for (const [workerId, scope] of workerScopes) {
    const inScope = isFileInScope(normalizedFile, scope);
    if (!inScope) {
      // Check if file was changed by this worker — simplified: flag all out-of-scope files
      violations.push({
        type: 'file_outside_scope',
        agentId: workerId,
        detail: `File outside scope: ${filePath}`,
        timestamp: now(),
      });
    }
  }
  ```

- [root-cause|high] `runScanCycle` outer catch silently swallows entire scan — `src/monitor/auditor.ts:1349-1360` catches all unhandled exceptions and returns `{ heartbeats:[], violations:[], alerts:[], locks:[], dependencyViolations:[] }`. The auditor appears healthy and produces zero findings when the scan crashes internally.

  Evidence (auditor.ts:1349-1360):
  ```ts
  } catch {
    return {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
      dependencyViolations: [],
    };
  }
  ```

- [root-cause|medium] `validateTechDebt` trust-without-verify — `src/monitor/auditor.ts:2000-2007`: any `notes` field with 20+ characters passes the GO_WITH_TECH_DEBT validation unconditionally. The threshold is trivially satisfied by boilerplate and provides no meaningful tech-debt quality signal.

  Evidence (auditor.ts:2000-2007):
  ```ts
  if (!result.notes || result.notes.length < 20) {
    return {
      verdict: 'DOWNGRADE',
      newStatus: 'NO_GO',
      reason: 'GO_WITH_TECH_DEBT but no meaningful tech debt explanation in notes',
    };
  }
  return { verdict: 'PASS', reason: 'Tech debt self-assessment accepted — notes provided' };
  ```

- [root-cause|medium] `isWorkerProcessAlive` subprocess backend hardcoded-false — `src/monitor/auditor.ts:127-135`: `case 'subprocess'` unconditionally returns `false`. Signal B (process-alive) is permanently disabled for subprocess workers — multi-signal stale detection degrades to 2-signal for this backend with no fallback.

  Evidence (auditor.ts:127-135):
  ```ts
  case 'subprocess': {
    // Subprocess: check PID if available in workerId pattern w-NNN-NNN
    // Fallback: cannot verify without PID — assume unknown
    return false; // conservative: subprocess PID not stored in HB
  }
  ```

- [inconsistent|high] ADR-008 pilot rule pattern is stale — `src/monitor/auditor.ts:2134-2139` uses pattern `from.*brain` targeting `src/monitor/auditor.ts`, `src/orchestra/tmux.ts`, `src/agents/worker.ts`. The live ADR-008 amendment (brain.md) changed the constraint to `core/ → orchestra/` import direction checks — the pilot rule does not test the actual violation surface and would miss the real `routing-engine.ts:30 → ecosystem-intelligence` violation flagged in the ADR.

  Evidence (auditor.ts:2134-2139):
  ```ts
  // ADR-008: Brain is the ONLY module that imports tmux/auditor/worker
  ['ADR-008', {
    type: 'grep_forbid',
    pattern: 'from.*brain',
    targetFiles: ['src/orchestra/tmux.ts', 'src/monitor/auditor.ts', 'src/agents/worker.ts'],
  } as ADREnforcementRule],
  ```

- [inconsistent|high] ADR-010 pilot rule `maxCount: 3` permanently fires — `src/monitor/auditor.ts:2141-2143`: project has 13 runtime dependencies (confirmed: `package.json` `dependencies` count = 13). `checkADRCompliance` will always generate a spurious warning `"Runtime dependency count (13) exceeds max (3)"` on every `package.json` change, regardless of whether the change actually adds a dependency.

  Evidence (auditor.ts:2141-2143):
  ```ts
  ['ADR-010', {
    type: 'count_check',
    maxCount: 3,
  } as ADREnforcementRule],
  ```

- [dormant|medium] `ADREnforcementRule.type: 'grep_require'` is declared but never handled — `src/monitor/auditor.ts:2076` declares `type: 'grep_forbid' | 'grep_require' | 'count_check'`, but the switch at lines 2197-2244 has no `case 'grep_require'` branch. Any ADR rule configured as `grep_require` silently falls through without running.

  Evidence (auditor.ts:2076):
  ```ts
  type: 'grep_forbid' | 'grep_require' | 'count_check';
  ```
  Evidence (auditor.ts:2197-2244): switch handles only `'grep_forbid'` and `'count_check'` — `grep_require` falls to default (no-op).

- [root-cause|high] `runVitestOnFiles` uses `spawnSync` — `src/monitor/auditor.ts:1915`: blocks the event loop inside the auditor scan path (`verifyFunctional` → `verifyWorkerResult` → `verifyWorkerResult`). ADR-087 forbids `spawnSync` for subprocesses (CI timeout cause).

  Evidence (auditor.ts:1915):
  ```ts
  const result = spawnSync('npx', ['vitest', 'run', '--reporter=json', ...existingFiles], {
  ```

- [root-cause|medium] `defaultRunGitStatus` and `defaultRunGrepEvidence` use `spawnSync` — `src/monitor/auditor.ts:1826` and `src/monitor/auditor.ts:1847`: both default implementations inside the async `tryCodeVerifiedDone` call chain use synchronous blocking subprocess invocations (ADR-087 violation).

  Evidence (auditor.ts:1826):
  ```ts
  const result = spawnSync('git', ['status', '--porcelain', filePath], {
  ```
  Evidence (auditor.ts:1847):
  ```ts
  const result = spawnSync('sh', ['-c', cmd], {
  ```

- [dormant|medium] `parseADRs` exported with no production callers — `src/monitor/auditor.ts:2094`: `checkADRCompliance` reads ADRs from `MemoryStore` (DB-first, lines 2166-2183), never from `parseADRs`. The function is a vestige of the pre-DB parsing approach. Grep confirms: zero production callers (only `tests/monitor/auditor.test.ts`).

  Evidence (auditor.ts:2094):
  ```ts
  export function parseADRs(content: string): ParsedADR[] {
  ```
  Caller check: `grep -rn "parseADRs" --include="*.ts" | grep -v "tests/"` → only the definition in auditor.ts.

- [unwired|low] `refreshLivenessFromDisk` exported but never called in production — `src/monitor/auditor.ts:329`: `startScanLoop` at line 1396 calls `batchProbeLiveness` directly, bypassing `refreshLivenessFromDisk`. The exported wrapper adds no production value; caller check returns only `tests/monitor/auditor-async-liveness.test.ts`.

  Evidence (auditor.ts:329):
  ```ts
  export async function refreshLivenessFromDisk(
  ```
  Evidence (auditor.ts:1396):
  ```ts
  void batchProbeLiveness(active)
  ```

- [inconsistent|medium] `lock_state_snapshot` event uses wrong CHANNELS key — `src/monitor/auditor.ts:1328`: emits a lock state snapshot using `CHANNELS.SCOPE_COLLISION_DETECTED` (`'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED'`). The payload `type: 'lock_state_snapshot'` (line 1330) is semantically unrelated to scope collision. Downstream consumers of `SCOPE_COLLISION_DETECTED` receive unexpected lock-snapshot payloads.

  Evidence (auditor.ts:1326-1331):
  ```ts
  writeEvent(
    projectRoot, currentSprintId, 'auditor', 'brain',
    CHANNELS.SCOPE_COLLISION_DETECTED,
    {
      type: 'lock_state_snapshot',
  ```

- [inconsistent|medium] `detectDependencyViolations` uses hardcoded channel string — `src/monitor/auditor.ts:2610` emits `'AUDITOR→BRAIN:DEPENDENCY_VIOLATION'` as a raw string literal, bypassing the typed `CHANNELS` registry. Compare: `ORPHAN_HB_DETECTED` uses `CHANNELS.ORPHAN_HB_DETECTED` (src/core/event-stream.ts:118). No `DEPENDENCY_VIOLATION` entry exists in CHANNELS.

  Evidence (auditor.ts:2610):
  ```ts
  'AUDITOR→BRAIN:DEPENDENCY_VIOLATION',
  ```

- [inconsistent|low] `DASHBOARD_INITIAL_STATE.updatedAt` frozen at module load — `src/monitor/dashboard-manager.ts:20-26`: `updatedAt: new Date().toISOString()` is evaluated once at module initialization. Internal callers in this file all properly override with fresh timestamps, but external consumers who spread without override receive a stale epoch value.

  Evidence (dashboard-manager.ts:20-26):
  ```ts
  export const DASHBOARD_INITIAL_STATE: DashboardState = {
    sprint: { id: '', number: 0, phase: SprintPhase.PLAN, status: SprintStatus.PLANNING },
    agents: [],
    progress: { done: 0, active: 0, blocked: 0, total: 0 },
    alerts: [],
    updatedAt: new Date().toISOString(),
  };
  ```

- [dormant|medium] `isDashboardState` exported type guard never called in production — `src/monitor/dashboard-manager.ts:46`: `ensureDashboard` and `readDashboardSafe` use `validateDashboardSchema` (line 171, 232), not `isDashboardState`. Grep confirms: zero production callers — only `tests/monitor/dashboard-manager.test.ts`.

  Evidence (dashboard-manager.ts:46):
  ```ts
  export function isDashboardState(data: unknown): data is DashboardState {
  ```

## Summary

17 findings across 3 files. Most critical: **root-cause `checkBoundaryViolations` double-loop** (`auditor.ts:642-656`) — the systematic false-positive generator proven by 36 `file_outside_scope` pattern entries in the active brain summary. Second critical: **`runScanCycle` silent outer catch** (`auditor.ts:1349-1360`) masking scan crashes. ADR consistency has two stale pilot rules (ADR-008 `from.*brain` pattern, ADR-010 `maxCount: 3` against 13 actual deps) producing chronic noise. Three parallel alert-dedup functions (`deduplicateAlert`/`deduplicateAlerts`/`dedupAlerts`) with divergent key strategies represent a consolidation opportunity. ADR-087 (`spawnSync`) is violated in 3 separate sites within the synchronous scan path.
