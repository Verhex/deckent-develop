# DIRECTIVES — Sprint 162: Brain Stability Final (T-003 + T-004 + T-007)

> **Sprint 160→161 progress:**
> - Sprint 160 SPAWN crash → T-001 commit `9c184a3` (exception handler + redactor)
> - Sprint 161 SPAWN crash → T-002 + T-006 commit `8cefed0` (checkpoint loop + double-MCP)
> - **Config fix:** `dependency_pipeline_enabled: false` (Sprint 161 crash kök sebebiydi — Brain auditor collision uyarısını dikkate almıyordu)
> - **3 task kaldı:** T-003 (phase observability composite) + T-004 (state recovery) + T-007 (crash injection + smoke)

## Goal

Brain stability hattının son 3 task'ı: phase transition observability + EvaluationAuditTrail runtime wire + state recovery on Brain restart + crash injection integration test. T4-modified disiplin tamamlanır, ADR-043 + ADR-044 accepted, Sprint 163 Brain dogfood smoke ready.

## Referanslar (read-only — task description'larında PATH MENTION ASLA yapma!)

- **Spec + Plan:** önceki sprint commit'lerinde mevcut (Sprint 160 design)
- **T-001 commit:** `9c184a3` (exception handler + redactor)
- **T-002 + T-006 commit:** `8cefed0` (checkpoint loop + double-MCP + config fix)
- **Stalled forensic:** `.tasks/archive/sprint-160-stalled/`, `.tasks/archive/sprint-161-stalled/`

> ⚠️ **Anchor kural:** Task description'larında `docs/...` veya `.deckent/...` path mention YASAK. Planner bunu `filesWrite`'a yorumluyor → spawn-lock conflict (Sprint 160 crash sebebi).

## Wave Plan

- **Wave 1 (paralel — ayrı dosyalar):** Task 1 (T-003), Task 2 (T-004)
- **Wave 2 (Wave 1 done bekler):** Task 3 (T-007)

---

## Task 1: Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/sprint-phases.ts, src/monitor/sprint-state.ts, tests/orchestra/phase-transition-observability.test.ts
- Scope: src/orchestra/, src/monitor/, tests/orchestra/

### Description

**Composite task (sırasıyla iki bug aynı dosyada — birleştirme collision'ı önler):**

**(a) Sprint phase observability (ADR-044):** Sprint 159+160+161 forensic: `sprint-state.json` `phase:SPAWN, status:PLANNING` donuk kaldı, Sprint ilerlemesi yansımadı. External observer kör.

**(b) EvaluationAuditTrail wire:** `src/orchestra/evaluation-audit-trail.ts` Sprint 157 T-001 survivor (commit `6c337b0`, diskte 8/8 test PASS), AMA `runEvaluatePhase` içinde çağrılmıyor. `.tasks/<id>.audit.json` yazılmıyor.

**Yapılacaklar:**
1. **`src/orchestra/sprint-phases.ts`:**
   - Yeni helper: `persistPhaseTransition(projectRoot, sprintId, phase, status)` — `writeSprintState` çağırır, try/catch wrap (fail-soft, Brain'i öldürmesin).
   - Her `sprint.phase = SprintPhase.X` setinden SONRA `persistPhaseTransition()` çağrısı:
     - `runPlanPhase` → PLAN / 'PLANNING'
     - `runSpawnPhase` (line ~401) → SPAWN / 'RUNNING'
     - `runEvaluatePhase` (line ~586) → EVALUATE / 'EVALUATING'
     - `runFixPhase` → FIX / 'FIXING'
   - `runEvaluatePhase` her task evaluation'dan sonra `writeEvaluationAudit(...)` çağrısı (try/catch wrap).

2. **`writeSprintState` signature**'ı `src/monitor/sprint-state.ts`'ten oku. Field set: `{sprintId, phase: String(phase), status, taskIds, updatedAt}`. Mevcut field'ları korumak için read+merge pattern gerekiyorsa adapter yaz.

3. **`writeEvaluationAudit` signature**'ı `src/orchestra/evaluation-audit-trail.ts:157`'den oku. Parametre: `{taskId, decision, ruleSet, criterionScores, schemaValidation, rationale, timestamp}`. `buildDecisionRationale(evaluation)` mevcut export'unu kullan.

**Kanıt:**
- `grep -n "persistPhaseTransition" src/orchestra/sprint-phases.ts` → 5+ match
- `grep -n "writeEvaluationAudit" src/orchestra/sprint-phases.ts` → 1+ match
- Test çıktısı: `sprint-state.json` phase her transition'da güncellenir

**Test:** 6 test (PLAN/SPAWN/EVALUATE/FIX state.json write, audit.json schema, atomic write).

---

## Task 2: State Recovery on Brain Restart (T-004)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-controller.ts, tests/orchestra/state-recovery.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Dependency:** T-002 (checkpoint loop, commit `8cefed0`) zaten DONE — recovery için temel hazır. T-001 (exception handler, commit `9c184a3`) zaten DONE — crash recovery için entry point hazır.

**Forensic kanıt:** Sprint 159 `durationMs: -106` (negative) — `startedAt` restart sonrası persist edilmedi. Stale EXECUTING task'lar `handleEvaluation` çağrılmadı.

**Yapılacaklar:**
1. **`src/orchestra/sprint-checkpoint.ts` (end of file, helper ekle):**
   - `RestoreResult` interface (`{restored, action, restoredSprint?, staleTasksWithResult, staleTasksMarkedNoGo}`)
   - `restoreSprintFromCheckpoint(projectRoot, sprintId): RestoreResult`:
     - `readCheckpoint` çağrı; null → `{restored:false, action:'fresh'}`
     - `sprint.tasks` rebuild (`completedTasks` + `pendingTasks` → task.json okur)
     - `startedAt` korunur (`cp.sprintStartedAt ?? cp.timestamp`)
     - `cp.pendingTasks.length === 0` → `action:'complete'`
     - Stale EXECUTING + `.result` var → `staleTasksWithResult`, `action:'resume-evaluate'`
     - Stale EXECUTING + `.result` yok → `task.status = NO_GO` (task.json overwrite), `action:'resume-evaluate'`
     - `writeSprintState` ile state.json'a resumed phase sync

2. **`src/orchestra/sprint-controller.ts:264` (`runSprint` body başı):**
   - Sprint ID determine'dan sonra, `planSprint`'ten ÖNCE `restoreSprintFromCheckpoint(projectRoot, sprintId)` çağrı
   - `recovery.restored`:
     - `action:'complete'` → emit `SPRINT_RESUME_COMPLETE` + `finalizeSprint`
     - `action:'resume-evaluate'` → emit `SPRINT_RESUME` (payload: staleWithResult, staleMarkedNoGo) + `sprint = recovery.restoredSprint!` + skip PLAN/SPAWN/EXECUTE, jump to `runEvaluatePhase`
     - `action:'fresh'` → normal path
   - Idempotency: `tryAcquireEvaluateLock` (Sprint 157 T-002 survivor) safety guard.

**Kanıt:**
- `grep -n "restoreSprintFromCheckpoint" src/orchestra/sprint-checkpoint.ts src/orchestra/sprint-controller.ts` → 3+ match
- `grep -n "SPRINT_RESUME\b" src/orchestra/sprint-controller.ts` → 1+ match

**Test:** 6 test (no checkpoint→fresh, all DONE→complete, stale+result→resume-evaluate, stale+no-result→NO_GO mark + resume, startedAt preserve, state.json sync after restore).

---

## Task 3: Crash Injection Integration Test + E2E Smoke (T-007)

- Model: opus
- Effort: normal
- Skills: testing-expert, ci-testing
- Agent: test-writer
- Files: tests/orchestra/brain-crash-injection.test.ts, tests/e2e/sprint-160-smoke.test.ts
- Scope: tests/

### Description

**Dependency:** Task 1 + Task 2 DONE bekler.

6 crash injection senaryosu + e2e mini-sprint smoke. T-001 + T-002 + T-006 hepsi commit'li, integration test bunları kanıtlayacak.

**6 senaryo (`tests/orchestra/brain-crash-injection.test.ts`):**
- S1: SIGTERM mid-EXECUTE → `restoreSprintFromCheckpoint` action `resume-evaluate`
- S2: unhandledRejection with API key → `redactSensitive` API key silindi (T-001 verified)
- S3: Double-MCP `acquireSingletonLock` ikinci kez → `SingletonLockError` (T-006 verified)
- S4: `sprint-state.json` desync + checkpoint `EVALUATE` → recovery state.json EVALUATE'a yazar (T-003 + T-004 verified)
- S5: Missing checkpoint → `action:'fresh'` (false-positive yok)
- S6: `writeEvaluationAudit` fail (`vi.mock` throw) → `runEvaluatePhase` başarılı dönüş (fail-soft kanıtı, T-003 verified)

**E2E smoke (`tests/e2e/sprint-160-smoke.test.ts`):** Mini-sprint 1 dummy task, DI mocked worker spawn. Assert: state.json phase transitions visible, checkpoint `eventStreamOffset > 0`, events.jsonl sequence monotonic.

**Kanıt:**
- `grep -nE "S[1-6]:" tests/orchestra/brain-crash-injection.test.ts` → 6 match
- Test isolated run → 9/9 PASS

**Test:** 9 test (6 crash injection + 3 e2e).

---

## Anchor Kurallar

- **`npm run build` YASAK** worker'larda — Alperen kararı.
- **Test izole:** `npx vitest run path/to/file.test.ts` ile tek dosya çalıştır.
- **Scope discipline:** Sadece `Files` field'daki dosyalara yaz.
- **ESM import:** `.js` uzantısı zorunlu (Node16 resolution).
- **No mid-sprint refactor.** No MVP / No Minimum.
- **🆕 NO docs/ PATH MENTION:** Task description'larında `docs/...` path yazma — planner filesWrite'a alıyor.

## GO/NO_GO Criteria

- ✅ 3/3 task DONE veya GO_WITH_TECH_DEBT
- ✅ tsc PASS + vitest PASS (delta 0 fail)
- ✅ 21 yeni test (6+6+9) PASS, 0 regression
- ✅ ADR-043 + ADR-044 accepted (memory.db'de) — Sprint sonu finalize
- ❌ NO_GO: Task 2 (state recovery) NO_GO → Sprint 163'te P0 retain
