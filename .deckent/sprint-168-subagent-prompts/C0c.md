# SUBAGENT — Sprint 168 Cluster C0c (Plan↔Spawn Integration Layer)

## Mission

Sprint 167 cascade ROOT layer. Plan ile Spawn pipeline arasındaki bağlantı eksik (Sprint 138 T4 incomplete). 3 alt-fix:
- **RC1:** `validateScopeFilesWrite` + bare token blocklist (parser-level)
- **RC2:** `decision-engine.ts handleScopeCollision` subscriber + `BRAIN→SPAWN:BLOCKED` event
- **RC3:** `readTaskJsonFresh` invariant — task.json her TASK_ASSIGN'da disk'ten fresh okunur (manuel patch detect)

**Cluster:** C (Plan↔Spawn Disconnect — Sprint 138 T4 partial)

## Worktree

```
cd /home/alperen/deckent-sprint-168-C0c
```

Branch: `sprint-168-C0c` (main fork). Bu worktree dışına ÇIKMA.

## File Authority (STRICT)

**YAZMA YETKİSİ:**
- `src/orchestra/task-builder.ts` (RC1 — `validateScopeFilesWrite` export + parser apply)
- `src/orchestra/planner.ts` (sadece gerekirse validate çağrısı için — RC1 bağ)
- `src/orchestra/decision-engine.ts` (RC2 — `handleScopeCollision` + `SpawnDecision` types)
- `src/orchestra/sprint-controller.ts` (sadece TASK_ASSIGN re-read + collision consult — RC2+RC3 wire)
- `tests/orchestra/parser-bare-token-validation.test.ts` (NEW)
- `tests/orchestra/decision-engine-collision-blocker.test.ts` (NEW)
- `tests/orchestra/brain-task-assign-fresh-read.test.ts` (NEW)

**YASAK:** sprint-finalizer.ts, sprint-retro-writer.ts, sprint-docs-updater.ts, sprint-reporter.ts, sprint-lifecycle.ts, file-lock.ts, auditor.ts, claude.ts, spawn-backend-docker.ts, identity-generator.ts, rule-generator.ts.

## Phase 1+2 Input (MUTLAKA OKU)

- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase1.md` (Plan↔Spawn disconnect bugs)
- `/home/alperen/deckent-dev/.audit/sprint-167/T5-brain-debug-phase2.md` (Cluster C — RC1 + RC2 + RC3 detay)
- `/home/alperen/deckent-dev/docs/superpowers/plans/2026-05-14-sprint-168-plan.md` (Lines 1137-1356 detaylı TDD)

## TDD Discipline (ZORUNLU — Plan Lines 1149-1338, 15 step)

### RC1: Parser bare token validation
1. **Step 1-4:** `validateScopeFilesWrite` — failing test → fix → PASS
   - Blocklist: `['.ts', '.md', '.test', 'test.ts', '.json', '.txt']`
   - Basename-only paths (no `/` or `\`) reject
   - Return: `{ valid, errors, sanitized }`
2. **Step 5:** Parser'da uygula (task-builder.ts — Files: alanı parse sırasında validate)

### RC2: Decision engine collision blocker
3. **Step 6-9:** `handleScopeCollision` — failing test → fix → PASS
   - Input: `{ taskIds, files, detectedAt }` ScopeCollisionPayload
   - Output: `{ action: 'block'|'replan'|'continue', reason, taskIds }`
4. **Step 10:** `sprint-controller.ts` TASK_ASSIGN öncesi `handleScopeCollision` çağrısı + `BRAIN→SPAWN:BLOCKED` event emit

### RC3: Fresh task.json read
5. **Step 11-13:** `readTaskJsonFresh` — failing test → fix → PASS
   - Always disk read (no in-memory cache)
   - `JSON.parse(readFileSync('.tasks/task-NNN.json'))`
   - Manuel patch detection (test edits file → fresh read returns new content)
6. **Step 13b:** TASK_ASSIGN flow'da `readTaskJsonFresh` kullan (cached lookup replace)

### Verify
7. **Step 14:** All C0c tests PASS + `npx tsc --noEmit` 0 hata
8. **Step 15:** Atomic commit (Plan Lines 1343-1356 commit message)

**TDD GATE:**
- Failing test ÖNCE
- Skip YASAK (baseline 41 korunur)
- Test PASS olmadan commit YASAK

## Output

**Subagent .result file:** `/home/alperen/deckent-dev/.deckent/sprint-168-C0c-result.json`:

```json
{
  "cluster": "C0c",
  "status": "DONE",
  "commits": ["<hash>"],
  "tests_added": 3,
  "tests_skipped_added": 0,
  "files_changed": [
    "src/orchestra/task-builder.ts",
    "src/orchestra/decision-engine.ts",
    "src/orchestra/sprint-controller.ts",
    "tests/orchestra/parser-bare-token-validation.test.ts",
    "tests/orchestra/decision-engine-collision-blocker.test.ts",
    "tests/orchestra/brain-task-assign-fresh-read.test.ts"
  ],
  "tsc_clean": true,
  "vitest_baseline_preserved": true,
  "notes": "RC1+RC2+RC3 plan-spawn integration. Cascade root layer eradicated."
}
```

## Anchor Constraints

1. Worktree isolation strict
2. File authority strict (sprint-controller.ts sadece TASK_ASSIGN wire — kapsamlı refactor YASAK)
3. TDD enforce
4. Skip YASAK
5. `tsc --noEmit` 0 hata
6. `BRAIN→SPAWN:BLOCKED` event-stream'a event type olarak eklenmeli (event-stream.ts touch eder)
7. Result JSON yaz
