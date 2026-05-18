# SUBAGENT — Sprint 168 Cluster C0e (Prompt Lifecycle Contract + ADR-048)

## Mission

Sprint 167 cascade ENDPOINT (BUG-HH). `src/providers/claude.ts:125-142 _cleanupOrphanedPromptFiles()` non-selective olarak `.tasks/.prompt-*.txt` TÜMÜNÜ siliyordu — `spawn-backend-docker.ts:941-942` "tmpfiles persist until sprint cleanup" kontratını ihliyordu. Bu task **Cluster E** root-cause fix: Option C selective filter + `getActiveWorkerIds()` shared helper extract + cross-sprint orphan handling + 3-backend kontrat uniformity + ADR-048 yazımı.

**Cascade significance:** Cluster B/C/A herhangi bir kill triggerlarsa BUG-HH tetikleniyordu. C0e fix → cascade KAPANIR.

## Worktree

```
cd /home/alperen/deckent-sprint-168-C0e
```

Branch: `sprint-168-C0e` (main fork). Bu worktree dışına ÇIKMA.

## File Authority (STRICT — Plan Section "File Authority Matrix")

**YAZMA YETKİSİ (scope.filesWrite):**
- `src/core/active-workers.ts` (NEW)
- `src/providers/claude.ts` (sadece L125-142 `_cleanupOrphanedPromptFiles` + import)
- `src/orchestra/sprint-lifecycle.ts` (cleanupPreviousSprintOrphans export ekle)
- `src/orchestra/spawn-backend.ts` (kontrat comment ekle — sadece comment)
- `src/orchestra/tmux.ts` (kontrat comment ekle — sadece comment)
- `docs/adr/048-prompt-lifecycle-contract.md` (NEW — placeholder boş, doldur)
- `tests/core/active-workers.test.ts` (NEW)
- `tests/providers/claude-cleanup-active-protected.test.ts` (NEW)
- `tests/orchestra/sprint-startup-prev-sprint-orphan.test.ts` (NEW)
- `tests/orchestra/cross-backend-prompt-uniformity.test.ts` (NEW)

**OKUMA İZNİ:** Tüm src/, tests/, docs/, `.audit/`, `.brain/exports/`, plan dosyası.

**YASAK:** Diğer cluster'ların scope'undaki dosyalara YAZMA YASAK (file-lock.ts, planner.ts, task-builder.ts, sprint-finalizer.ts, sprint-retro-writer.ts, sprint-reporter.ts, identity-generator.ts, rule-generator.ts).

## Phase 1+2 Input (MUTLAKA OKU — context için)

- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase1.md` (BUG-HH Phase 1 detay)
- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase2.md` (Cluster E + cascade pattern)
- `/home/alperen/deckent-dev/docs/superpowers/plans/2026-05-14-sprint-168-plan.md` (Lines 409-832 detaylı TDD adımları)

## TDD Discipline (ZORUNLU — Plan Lines 426-832, 21 step)

1. **Step 1-4:** `getActiveWorkerIds()` shared helper extract — failing test → fix → PASS
2. **Step 5-8:** `claude.ts _cleanupOrphanedPromptFiles` selective filter — failing test → fix → PASS
3. **Step 9-12:** `cleanupPreviousSprintOrphans()` sprint-lifecycle.ts cross-sprint — failing test → fix → PASS
4. **Step 13-16:** Cross-backend uniformity contract comments (spawn-backend.ts + tmux.ts) — failing test → fix → PASS
5. **Step 17:** ADR-048 yazımı (Plan Lines 699-770 MADR v3 template — doldur)
6. **Step 18-19:** All tests PASS + `npx tsc --noEmit` 0 hata
7. **Step 20:** Atomic commit (Plan Lines 786-806 commit message template)

**TDD GATE (asla taviz verme):**
- Failing test ÖNCE yaz (red phase)
- Run test → FAIL doğrula
- Minimal implementation
- Run test → PASS doğrula
- **Yeni test'lerde `.skip` veya `it.skip` KULLANMA** (baseline 41 korunur)
- Test PASS olmadan commit YASAK

## Output

**Subagent .result file:** `/home/alperen/deckent-dev/.deckent/sprint-168-C0e-result.json`:

```json
{
  "cluster": "C0e",
  "status": "DONE",
  "commits": ["<commit_hash>"],
  "tests_added": 4,
  "tests_skipped_added": 0,
  "files_changed": [
    "src/core/active-workers.ts",
    "src/providers/claude.ts",
    "src/orchestra/sprint-lifecycle.ts",
    "src/orchestra/spawn-backend.ts",
    "src/orchestra/tmux.ts",
    "docs/adr/048-prompt-lifecycle-contract.md",
    "tests/core/active-workers.test.ts",
    "tests/providers/claude-cleanup-active-protected.test.ts",
    "tests/orchestra/sprint-startup-prev-sprint-orphan.test.ts",
    "tests/orchestra/cross-backend-prompt-uniformity.test.ts"
  ],
  "tsc_clean": true,
  "vitest_baseline_preserved": true,
  "notes": "Cluster E cascade endpoint kapatıldı. ADR-048 MADR v3 yazıldı. Wave 1.5 Alperen CHECKPOINT bekliyor."
}
```

## Anchor Constraints

1. Sadece kendi worktree'nde çalış (`/home/alperen/deckent-sprint-168-C0e`)
2. File authority matrix STRICT — dışına yazma
3. TDD enforce (failing test → fix → pass)
4. Skip kullanma (baseline 41 korunur — Sprint 168 ≤41)
5. Commit ATOMİK (her TDD cycle bağımsız değil — full feature single commit OK)
6. `tsc --noEmit` 0 hata zorunlu
7. ADR-048 MADR v3 format (Status / Context / Decision / Architectural Principles / Consequences / Compliance / Related ADRs / References)
8. Result JSON yaz — Alperen review gate için kritik
