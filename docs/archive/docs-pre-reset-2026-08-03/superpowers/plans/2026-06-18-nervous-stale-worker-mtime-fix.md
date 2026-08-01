# Nervous stale-worker mtime-fix (Bug 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make worker-staleness use the host-set `.hb` file mtime (clock-skew-proof) instead of the docker-container-clock-skewed self-reported `hb.timestamp`, so the nervous `StaleWorkerDetector` (and the auditor stale-alert) stop flagging healthy docker workers.

**Architecture:** `scanActiveWorkers` (sprint-state-tracker) derives `lastHeartbeat` from `statSync(hbPath).mtimeMs`. The auditor's stale-heartbeat scan gets the same treatment. Detectors/comparisons unchanged.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes), vitest. `node:fs` `statSync`/`utimesSync`.

## Global Constraints

- **ESM imports:** relative imports end in `.js`; `node:fs`/`node:path` built-ins.
- **Lossless:** correctly-clocked workers unchanged (mtime ≈ timestamp when clocks agree); a genuinely hung worker (old mtime) is still flagged; the `.result`-skip guard (finished workers) is preserved.
- **i18n:** internal logic — no user-facing strings.
- **Hermeticity (ADR-087):** tests use tmpdir + real files + `statSync`/`utimesSync`; no fs mocks; no `spawnSync`; clean up in `afterEach`.
- **Surgical:** write only to `src/orchestra/sprint-state-tracker.ts`, `src/monitor/auditor.ts`, and the test file. `npx tsc --noEmit` clean.
- **TDD:** failing test first.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/orchestra/sprint-state-tracker.ts` | active-worker snapshot for nervous | `scanActiveWorkers` → mtime (primary) |
| `src/monitor/auditor.ts` | stale-heartbeat alert | stale-check freshness → mtime (secondary) |
| `tests/orchestra/sprint-state-tracker.test.ts` | new tests | **create** |

---

## Task 1: mtime-based worker freshness

**Files:**
- Modify: `src/orchestra/sprint-state-tracker.ts` (`scanActiveWorkers` ~line 82-92; add `statSync` to the `node:fs` import line 12)
- Modify: `src/monitor/auditor.ts` (stale-heartbeat scan ~line 458-525 — read + apply same mtime pattern)
- Test: `tests/orchestra/sprint-state-tracker.test.ts` (create)

**Interfaces:**
- Consumes: `StaleWorkerDetector` (`src/nervous/detectors/stale-worker.ts`, unchanged); `SprintStateSnapshot` type.
- Produces: `scanActiveWorkers` returns `activeWorkers[].lastHeartbeat` as the `.hb` file's mtime ISO string.

- [ ] **Step 1: Write the failing tests**

Create `tests/orchestra/sprint-state-tracker.test.ts`. Read `sprint-state-tracker.ts` first to learn the exact exported function name that wraps `scanActiveWorkers` (it may be private — drive it through the public `buildSprintStateSnapshot`/`readSprintState` entrypoint the file exports, OR export `scanActiveWorkers` for testability if the file has no public path to it; prefer the existing public entrypoint). Then:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
// import the public snapshot builder that includes activeWorkers — confirm its name from the source:
import { buildSprintStateSnapshot } from '../../src/orchestra/sprint-state-tracker.js';

describe('sprint-state-tracker — worker freshness uses .hb mtime (clock-skew-proof)', () => {
  let root: string;
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  function setup(): string {
    root = mkdtempSync(join(tmpdir(), 'sst-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    return root;
  }
  function writeHb(root: string, taskId: string, inFileTimestamp: string, mtimeEpochMs: number): void {
    const p = join(root, '.tasks', `task-${taskId}.hb`);
    writeFileSync(p, JSON.stringify({ workerId: `w-${taskId}`, taskId, timestamp: inFileTimestamp, status: 'EXECUTING' }), 'utf-8');
    const t = mtimeEpochMs / 1000;
    utimesSync(p, t, t); // set both atime+mtime to the chosen instant
  }

  it('FALSE-POSITIVE fixed: midnight in-file timestamp but FRESH mtime → activeWorker lastHeartbeat is fresh, not stale', () => {
    const r = setup();
    const now = 1_750_000_000_000; // fixed reference instant (ms)
    writeHb(r, '290-001', '2026-06-18T00:00:00.000Z', now - 3_000); // mtime 3s ago, in-file ts midnight
    const snap = buildSprintStateSnapshot(r); // confirm builder name/signature from source
    const w = snap.activeWorkers.find(x => x.taskId === '290-001')!;
    const ageMs = now - new Date(w.lastHeartbeat).getTime();
    expect(ageMs).toBeLessThan(60_000); // fresh (from mtime), NOT ~11h (from the midnight in-file ts)
    // StaleWorkerDetector must NOT flag it:
    const res = new StaleWorkerDetector().detect({
      event: { source: 'cron' } as any,
      sprintState: { currentPhase: 'EXECUTE', activeWorkers: snap.activeWorkers } as any,
      now: new Date(now),
    } as any);
    expect(res).toBeNull();
  });

  it('REAL staleness preserved: OLD mtime (11 min ago) → StaleWorkerDetector flags it', () => {
    const r = setup();
    const now = 1_750_000_000_000;
    writeHb(r, '290-009', new Date(now).toISOString(), now - 11 * 60_000); // mtime 11 min ago
    const snap = buildSprintStateSnapshot(r);
    const res = new StaleWorkerDetector().detect({
      event: { source: 'cron' } as any,
      sprintState: { currentPhase: 'EXECUTE', activeWorkers: snap.activeWorkers } as any,
      now: new Date(now),
    } as any);
    expect(res).not.toBeNull();
    expect(res!.metadata).toMatchObject({ type: 'stale-worker' });
  });

  it('FINISHED-worker guard intact: .hb with sibling .result → not in activeWorkers', () => {
    const r = setup();
    const now = 1_750_000_000_000;
    writeHb(r, '290-010', new Date(now).toISOString(), now - 3_000);
    writeFileSync(join(r, '.tasks', 'task-290-010.result'), '{"selfAssessment":"DONE"}', 'utf-8');
    const snap = buildSprintStateSnapshot(r);
    expect(snap.activeWorkers.find(x => x.taskId === '290-010')).toBeUndefined();
  });
});
```

> Adapt the import/builder name + the `DetectorContext`/`SprintStateSnapshot` shapes to the actual source (read `sprint-state-tracker.ts` exports and `core/nervous-types.ts` `DetectorContext`). The `as any` casts on the detector context are acceptable test scaffolding for the minimal fields the detector reads (`event.source`, `sprintState.currentPhase`, `sprintState.activeWorkers`, `now`); keep them tight.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orchestra/sprint-state-tracker.test.ts`
Expected: FAIL — the first test fails because `lastHeartbeat` currently comes from the midnight in-file `timestamp` (age ≈ 11h, and the detector flags it).

- [ ] **Step 3: Primary fix — `scanActiveWorkers` uses mtime**

In `src/orchestra/sprint-state-tracker.ts`, add `statSync` to the `node:fs` import (line 12):
```typescript
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
```
Then change the `out.push` block (~line 82-92) so `lastHeartbeat` is the file mtime:
```typescript
    try {
      const hbPath = join(tasksDir, file);
      const raw = readFileSync(hbPath, 'utf-8');
      const hb = JSON.parse(raw) as { workerId?: unknown; taskId?: unknown };
      const workerId = typeof hb.workerId === 'string' ? hb.workerId : null;
      const taskId = typeof hb.taskId === 'string' ? hb.taskId : null;
      if (workerId === null || taskId === null) continue;
      out.push({
        id: workerId,
        taskId,
        // Host filesystem mtime (set on every write through the docker mount) — clock-skew-proof,
        // unlike the worker's self-reported in-file `timestamp` (container clock). Bug-1 fix.
        lastHeartbeat: new Date(statSync(hbPath).mtimeMs).toISOString(),
      });
    } catch {
      // malformed .hb / stat error — skip silently
    }
```
(The in-file `timestamp` is no longer read for freshness. Keep the `.result`-skip guard above it unchanged.)

- [ ] **Step 4: Secondary fix — Auditor stale-heartbeat freshness**

Read `src/monitor/auditor.ts:458-525` (the `staleAgents` scan that emits `stale_heartbeat` alerts). Find where it computes a heartbeat's freshness (the timestamp it compares against "now"). If it derives freshness from the `.hb` file's in-file `timestamp` (same container-clock bug), change that freshness signal to the `.hb` file **mtime** (`statSync(hbPath).mtimeMs`) — mirroring Step 3. Preserve the DONE-status skip (auditor.ts:476) and the WARNING-downgrade (508). If the auditor already uses file mtime (or only uses the timestamp for display, not staleness), make NO change and note it in the report.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/orchestra/sprint-state-tracker.test.ts`
Expected: PASS — false-positive fixed, real staleness preserved, finished-guard intact.

- [ ] **Step 6: Type-check + regression**

Run: `npx tsc --noEmit && npx vitest run tests/monitor/auditor.test.ts tests/nervous/ 2>/dev/null; npx vitest run tests/monitor/auditor.test.ts`
Expected: no type errors; auditor + any nervous tests stay green. If a test asserted the OLD behaviour (stale flag from the in-file timestamp), that encoded the bug — update it with a one-line `// bug-1: freshness from .hb mtime` justification and report it.

- [ ] **Step 7: Commit**

```bash
git add src/orchestra/sprint-state-tracker.ts src/monitor/auditor.ts tests/orchestra/sprint-state-tracker.test.ts
git commit -m "$(cat <<'EOF'
fix(nervous): stale-worker freshness from .hb mtime (clock-skew-proof) — bug 1

Docker worker containers write hb.timestamp on a skewed clock (midnight),
so sprint-state-tracker reported ~11h-stale lastHeartbeat for healthy
workers → StaleWorkerDetector spammed WORKER_RESPAWN. Derive lastHeartbeat
(and the auditor stale-alert freshness) from the host-set .hb file mtime
instead. Detector unchanged; finished-worker guard + real-staleness preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
(If Step 4 made no auditor change, drop `src/monitor/auditor.ts` from the `git add`.)

---

## Self-Review

**Spec coverage:** mtime in scanActiveWorkers (§2 primary) → Step 3; auditor secondary (§2) → Step 4; lossless (correctly-clocked unchanged, real-staleness preserved, finished-guard) → Step 1 tests; hermetic tmpdir+utimesSync (§4) → Step 1. ✅

**Placeholder scan:** complete code in every code step. The test's `buildSprintStateSnapshot` name + `DetectorContext` shape are flagged "confirm from source" (Step 1 note) because they depend on the file's actual exports — the implementer reads and adapts, not invents. ✅

**Type consistency:** `statSync` imported (Step 3); `lastHeartbeat` stays a `string` (ISO) matching `ActiveWorker` type (sprint-state-tracker.ts:18) and `nervous-types.ts:247`. The detector reads `w.lastHeartbeat` as before. ✅
