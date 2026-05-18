# SUBAGENT — Sprint 168 Cluster C0b (SpawnLock Symmetric Cleanup)

## Mission

Sprint 167 RC4 Bug E fix. SpawnLock cleanup helpers eksik (Phase 2 §141 listed 5 missing). 5 yeni helper ekle (file-lock.ts), Auditor scan loop binding (L485 paterni `stale_spawn_lock` alert + 30s scan), on-exit hook sad-path coverage (spawn-backend-docker.ts:933).

**Cluster:** B (Locking Asymmetry — Sprint 156 T-10 partial completion gap)

## Worktree

```
cd /home/alperen/deckent-sprint-168-C0b
```

Branch: `sprint-168-C0b` (main fork). Bu worktree dışına ÇIKMA.

## File Authority (STRICT)

**YAZMA YETKİSİ:**
- `src/core/file-lock.ts` (5 yeni helper ekle, mevcut helper'lara dokunma)
- `src/monitor/auditor.ts` (SADECE L485 binding bölümü — `stale_spawn_lock` alert + import)
- `src/orchestra/spawn-backend-docker.ts` (SADECE L933 on-exit hook ekle — `releaseStaleSpawnLocksForTask` import + call)
- `tests/core/spawn-lock-orphan-cleanup.test.ts` (NEW)
- `tests/core/spawn-lock-stale-ttl.test.ts` (NEW)
- `tests/monitor/auditor-spawn-lock-binding.test.ts` (NEW)

**YASAK:** Diğer cluster'ların scope'undaki dosyalara YAZMA YASAK (claude.ts, planner.ts, sprint-finalizer.ts, sprint-reporter.ts, identity-generator.ts, rule-generator.ts, sprint-retro-writer.ts, sprint-docs-updater.ts, sprint-lifecycle.ts).

## Phase 1+2 Input (MUTLAKA OKU)

- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase1.md` (BUG-E forensic)
- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase2.md` (Cluster B + §141 5 missing helper list)
- `/home/alperen/deckent-dev/docs/superpowers/plans/2026-05-14-sprint-168-plan.md` (Lines 886-1133 detaylı TDD)

## TDD Discipline (ZORUNLU — Plan Lines 898-1106, 11 step)

1. **Step 1-4:** `clearOrphanSpawnLocks` — failing test → 5 helper add → PASS
   - `checkSpawnLock` (single lock state)
   - `checkSpawnLocks` (batch query)
   - `clearStaleSpawnLocks(maxAgeMs=300000)` (TTL-based, 5min default)
   - `clearOrphanSpawnLocks(activeTaskIds)` (taskId-aware)
   - `releaseStaleSpawnLocksForTask(taskId)` (on-error cleanup)
2. **Step 5-8:** Auditor `stale_spawn_lock` alert + 30s scan binding — failing test → fix → PASS
   - Import: `import { clearOrphanSpawnLocks, clearStaleSpawnLocks } from '../core/file-lock.js'`
   - L485 pattern: per scan cycle, alert emit on cleanup > 0
3. **Step 9:** `spawn-backend-docker.ts:933` on-exit hook — `releaseStaleSpawnLocksForTask(projectRoot, taskId)` call
4. **Step 10:** All tests PASS + `npx tsc --noEmit` 0 hata
5. **Step 11:** Atomic commit (Plan Lines 1108-1132 message template)

**TDD GATE:**
- Failing test ÖNCE
- Skip YASAK (baseline 41 korunur)
- Test PASS olmadan commit YASAK

## Output

**Subagent .result file:** `/home/alperen/deckent-dev/.deckent/sprint-168-C0b-result.json`:

```json
{
  "cluster": "C0b",
  "status": "DONE",
  "commits": ["<hash>"],
  "tests_added": 3,
  "tests_skipped_added": 0,
  "files_changed": [
    "src/core/file-lock.ts",
    "src/monitor/auditor.ts",
    "src/orchestra/spawn-backend-docker.ts",
    "tests/core/spawn-lock-orphan-cleanup.test.ts",
    "tests/core/spawn-lock-stale-ttl.test.ts",
    "tests/monitor/auditor-spawn-lock-binding.test.ts"
  ],
  "tsc_clean": true,
  "vitest_baseline_preserved": true,
  "notes": "5 helper + Auditor binding + on-exit hook. RC4 Bug E closure."
}
```

## Anchor Constraints

1. Worktree isolation strict
2. File authority strict
3. TDD enforce
4. Skip YASAK
5. `tsc --noEmit` 0 hata
6. Auditor.ts L485 dışına yazma (binding sadece)
7. Result JSON yaz
