# SUBAGENT — Sprint 168 Cluster C0d (Sprint Metrics Math Guards)

## Mission

Sprint 167 finalize "Duration: -1dk -1sn" + "Coverage: NaN%" cosmetic bug. Null/undefined guard:
- `Math.max(0, end - start)` (negative duration → 0)
- `total > 0 ? covered/total : null` (zero division → "N/A" display)

**Cluster:** D (BUG-FF cosmetic — short task, ~1h effort)

## Worktree

```
cd /home/alperen/deckent-sprint-168-C0d
```

Branch: `sprint-168-C0d` (main fork). Bu worktree dışına ÇIKMA.

## File Authority (STRICT)

**YAZMA YETKİSİ:**
- `src/orchestra/sprint-reporter.ts` (math guards — ÖNCELİKLİ TERCİH)
- VEYA `src/orchestra/managed-doc-runner.ts` (Alperen tercih — eğer sprint metrics buradan çıkıyorsa)
- `tests/orchestra/sprint-metrics-guards.test.ts` (NEW)

**Tercih kararı:** Önce `src/orchestra/sprint-reporter.ts` dosyasını okumaya başla — coverage/duration formatlama logic'i orada mı? Değilse `managed-doc-runner.ts`'e geç. Sadece BİR dosyaya yaz.

**YASAK:** Diğer tüm dosyalar. C0d minimal scope.

## Phase 1+2 Input (oku)

- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase1.md` (BUG-FF detay)
- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase2.md` (Cluster D)
- `/home/alperen/deckent-dev/docs/superpowers/plans/2026-05-14-sprint-168-plan.md` (Lines 1400-1411)

## TDD Discipline (ZORUNLU — minimal scope ~1h)

1. **Step 1: Failing test**
   ```typescript
   // tests/orchestra/sprint-metrics-guards.test.ts
   import { describe, it, expect } from 'vitest';
   import { computeSprintMetrics } from '../../src/orchestra/sprint-reporter.js'; // veya managed-doc-runner.js

   describe('sprint metrics math guards', () => {
     it('returns duration=0 when end < start (negative)', () => {
       const m = computeSprintMetrics({ startMs: 1000, endMs: 500, totalLines: 100, coveredLines: 50 });
       expect(m.durationMs).toBe(0); // Math.max(0, end-start)
     });

     it('returns coverage=null when totalLines=0', () => {
       const m = computeSprintMetrics({ startMs: 0, endMs: 100, totalLines: 0, coveredLines: 0 });
       expect(m.coverageRatio).toBeNull(); // display "N/A"
     });

     it('returns coverage ratio when totalLines>0', () => {
       const m = computeSprintMetrics({ startMs: 0, endMs: 100, totalLines: 100, coveredLines: 75 });
       expect(m.coverageRatio).toBeCloseTo(0.75);
     });
   });
   ```
2. **Step 2: Run FAIL**
3. **Step 3: Fix sprint-reporter.ts (or managed-doc-runner.ts)**
   - `durationMs = Math.max(0, endMs - startMs)`
   - `coverageRatio = totalLines > 0 ? coveredLines / totalLines : null`
   - Display layer: `coverageRatio === null ? 'N/A' : (coverageRatio * 100).toFixed(2) + '%'`
4. **Step 4: Run PASS**
5. **Step 5: tsc --noEmit 0 hata**
6. **Step 6: Commit**

```bash
git add src/orchestra/sprint-reporter.ts tests/orchestra/sprint-metrics-guards.test.ts
git commit -m "feat(sprint-168-C0d): Sprint metrics math guards (BUG-FF)

Sprint 167 cosmetic bug fix:
- Math.max(0, end-start) — negative duration → 0
- Coverage null guard — 'N/A' display when totalLines=0"
```

**TDD GATE:**
- Failing test ÖNCE
- Skip YASAK
- `tsc --noEmit` 0 hata

## Output

**Subagent .result file:** `/home/alperen/deckent-dev/.deckent/sprint-168-C0d-result.json`:

```json
{
  "cluster": "C0d",
  "status": "DONE",
  "commits": ["<hash>"],
  "tests_added": 3,
  "tests_skipped_added": 0,
  "files_changed": ["src/orchestra/sprint-reporter.ts", "tests/orchestra/sprint-metrics-guards.test.ts"],
  "tsc_clean": true,
  "vitest_baseline_preserved": true,
  "notes": "Edge case guards. BUG-FF cosmetic closed. Cluster D minimal scope."
}
```

## Anchor Constraints

1. Worktree isolation strict
2. Tek dosya kapsamı — sprint-reporter.ts OR managed-doc-runner.ts (sadece BİRİ)
3. TDD enforce
4. Skip YASAK
5. `tsc --noEmit` 0 hata
6. Result JSON yaz
