# DIRECTIVES — Sprint 161: Brain Stability + Restart Recovery (continued)

> **Önceki sprint:** Sprint 160 SPAWN fazında crash oldu (`docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md` üzerinde spawn-lock conflict — DIRECTIVES task description'larında plan.md path mention'ı planner tarafından `filesWrite`'a yorumlanmıştı). T-001 (160-001) Brain crash öncesi DONE oldu, **commit `9c184a3`** ile kalıcı: `src/orchestra/sensitive-redactor.ts` + `sprint-runner-entry.ts` (installCrashHandlers + redactor 11/11 test PASS). Build yansıtıldı — Brain bu sefer exception handler ile korunmuş.

## Goal

Sprint 160'ın **kalan 5 task'ı** ile Brain stability sprint'ini tamamla. Hedef: checkpoint loop runtime wire + sprint phase observability + EvaluationAuditTrail wire + double-MCP guard + state recovery + crash injection integration test. T4-modified disiplin: source + test + observability + 2 ADR + Security Review.

## Referanslar (read-only — task description'larında ASLA path mention etme!)

- **Spec:** `docs/superpowers/specs/2026-05-12-sprint-160-brain-stability-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md`
- **T-001 commit:** `9c184a3`
- **Önceki sprint stall forensic:** `.deckent/sprint-160-events.jsonl`, `.tasks/archive/sprint-160-stalled/`

> ⚠️ **Anchor kural (Sprint 160 lesson):** Task description'larında `docs/...` veya `.deckent/...` PATH MENTION YAPMA — planner bunu `filesWrite`'a alıyor, spawn-lock conflict'e sebep oluyor. Plan/Spec referansı için yukarıdaki "Referanslar" header section'ını oku.

## Wave Plan + Dependency

- **Wave 1 (paralel, 0 collision — ayrı dosyalar):** Task 1, Task 2, Task 3 eş zamanlı
- **Wave 2 (Task 2 done bekler — sprint-controller.ts paylaşımı):** Task 4
- **Wave 3 (Task 1 + 2 + 4 done bekler — integration):** Task 5

---

## Task 1: Checkpoint Loop Runtime Wire — eventStreamOffset + completedTasks Invariants (T-002)

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-controller.ts, tests/orchestra/checkpoint-loop.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Forensic bug (Sprint 159):** `checkpoint.json` `checkpointNumber:1, completedTasks:[], eventStreamOffset:0` donuk kaldı. Kök sebep: `sprint-controller.ts:389,412,526,582,591` `writePhaseCheckpoint(projectRoot, sprint, sprint.phase)` 3 parametre veriyor, `eventStreamOffset` undefined → 0 yazılıyor; `completedTasks` da hep `[]`.

**Yapılacaklar:**
1. **`src/orchestra/sprint-checkpoint.ts`:**
   - Yeni export: `computeEventStreamOffset(projectRoot, sprintId)` — `<sprintId>-events.jsonl` son sequence (source-of-truth). Eksik/boş → 0.
   - `writeCheckpoint` body: `completedTasks = sprint.tasks.filter(t => t.status === DONE).map(t => t.id)`, `pendingTasks = filter(!terminal)`. **Atomic rename** (`renameSync(tmp, final)`).
   - `writePhaseCheckpoint` kendi içinde `computeEventStreamOffset()` çağırır (caller değişmez), `brainPhase` parametresini explicit alır.

2. **`src/orchestra/sprint-controller.ts`:** Mevcut `writePhaseCheckpoint(projectRoot, sprint, sprint.phase)` çağrıları aynı kalabilir; helper içinde offset compute eder. Backward compatible.

**Kanıt:**
- `grep -n "computeEventStreamOffset" src/orchestra/sprint-checkpoint.ts` → 2+ match
- `grep -n "renameSync" src/orchestra/sprint-checkpoint.ts` → 1+ match
- Test çıktısı: `checkpoint.json` `completedTasks: ['t-1','t-2']`, `eventStreamOffset: 3` (donuk değil)

**Test:** 7 test (eventStreamOffset compute, completedTasks filter, checkpointNumber increment, brainPhase reflect, atomic rename no .tmp leftover, missing events.jsonl=0, empty events.jsonl=0).

---

## Task 2: Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/phase-transition-observability.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Composite task (spec onaylı):** 2 alt-bug aynı dosyada (`sprint-phases.ts`), aynı kontrat (phase transition). Birleştirme collision'ı önlüyor.

**(a) Sprint phase observability (ADR-044):** Sprint 159 forensic: `sprint-state.json` `phase:SPAWN, status:PLANNING, updatedAt:15:45:45` donuk kaldı; phase EXECUTE→EVALUATE→RETRO→CLEANUP gerçekte geçti ama disk'e yansımadı. External observer kör.

**(b) EvaluationAuditTrail wire:** `src/orchestra/evaluation-audit-trail.ts` Sprint 157 T-001 survivor — `commit 6c337b0`'da diskte var (8/8 test pass), AMA `runEvaluatePhase` içinde çağrılmıyor. Audit trail'ler `.tasks/<id>.audit.json` yazılmıyor.

**Yapılacaklar:**
1. **`src/orchestra/sprint-phases.ts`:**
   - Yeni helper: `persistPhaseTransition(projectRoot, sprintId, phase, status)` — `src/monitor/sprint-state.ts`'in `writeSprintState` fonksiyonunu çağırır, try/catch wrap (Brain'i öldürmesin).
   - Mevcut `sprint.phase = SprintPhase.X` setlerinden SONRA `persistPhaseTransition()` çağrısı eklenir:
     - `runPlanPhase` → PLAN / 'PLANNING'
     - `runSpawnPhase` (line ~401) → SPAWN / 'RUNNING'
     - `runEvaluatePhase` (line ~586) → EVALUATE / 'EVALUATING'
     - `runFixPhase` → FIX / 'FIXING'
   - `runEvaluatePhase` her task evaluation'dan sonra `writeEvaluationAudit(...)` çağrısı (try/catch wrap, fail-soft).

2. **`writeSprintState`** signature'ı `src/monitor/sprint-state.ts`'ten oku, parametre adapter. Field set: `{sprintId, phase: String(phase), status, taskIds, updatedAt}`.

3. **`writeEvaluationAudit`** signature'ı `src/orchestra/evaluation-audit-trail.ts:157`'den oku, parametre adapter: `{taskId, decision, ruleSet, criterionScores, schemaValidation, rationale, timestamp}`. `buildDecisionRationale(evaluation)` mevcut export'unu kullan.

**Kanıt:**
- `grep -n "persistPhaseTransition" src/orchestra/sprint-phases.ts` → 5+ match
- `grep -n "writeEvaluationAudit" src/orchestra/sprint-phases.ts` → 1+ match
- Test çıktısı: `sprint-state.json` phase her transition'da update

**Test:** 6 test (PLAN/SPAWN/EVALUATE/FIX state.json write, audit.json schema, atomic write no .tmp leftover).

---

## Task 3: Double-MCP Guard + PID Singleton Lock (T-006)

- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Agent: bug-fixer
- Files: src/mcp/server-singleton-lock.ts, src/mcp/server.ts, tests/mcp/server-singleton.test.ts
- Scope: src/mcp/, tests/mcp/

### Description

**Sprint 160 session başında kanıt:** 2 MCP server (PID 1311115 + 1473819) aynı anda çalışıyordu. Atomic PID lock yok. Race riski Brain restart loop'a katkı yapmış olabilir.

**Yapılacaklar:**
1. **`src/mcp/server-singleton-lock.ts` (YENİ, ~80 LoC):**
   - `SingletonLockError` (extends Error, ownerPid field)
   - `LockHandle` interface (`{path, acquired, stolen}`)
   - `isProcessAlive(pid)` — `process.kill(pid, 0)` ESRCH/EPERM ayrımı
   - `acquireSingletonLock(path)` — `openSync(path, 'wx')` atomic O_EXCL. EEXIST'te owner read + alive check; alive → throw, dead → cleanup + retry (one-shot).
   - `releaseSingletonLock(handle)` — own PID ise unlink (race-safe).

2. **`src/mcp/server.ts`:**
   - Import singleton-lock module.
   - `bootSingletonGuard(projectRoot)` fonksiyonu: `acquireSingletonLock(join(projectRoot, DECKENT_DIR, 'mcp-server.pid'))`. Failure → stderr + exit code 2.
   - `process.on('exit'|'SIGTERM'|'SIGINT')` cleanup hook ile release.
   - McpServer instantiation'dan ÖNCE `bootSingletonGuard(process.cwd())` çağrısı.

**Kanıt:**
- `grep -n "acquireSingletonLock\|isProcessAlive" src/mcp/server-singleton-lock.ts` → 4+ match
- `grep -n "bootSingletonGuard\|acquireSingletonLock" src/mcp/server.ts` → 2+ match

**Test:** 8 test (clean acquire, refuse with live PID, stale cleanup + steal, isProcessAlive own/init/improbable, release removes file, O_EXCL race).

---

## Task 4: State Recovery on Brain Restart (T-004)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-controller.ts, tests/orchestra/state-recovery.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Dependency:** Task 1 (checkpoint loop, T-002) DONE bekler — recovery test edilemez yoksa. T-001 (exception handler) zaten committed (`9c184a3`), dist'te.

**Forensic kanıt (Sprint 159):** `durationMs: -106` (negative!) — `startedAt` restart sonrası persist edilmedi. Stale EXECUTING task'lar `handleEvaluation` çağrılmadı. State.json donuk.

**Yapılacaklar:**
1. **`src/orchestra/sprint-checkpoint.ts` (end of file):**
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

## Task 5: Crash Injection Integration Test + E2E Smoke (T-007)

- Model: opus
- Effort: normal
- Skills: testing-expert, ci-testing
- Agent: test-writer
- Files: tests/orchestra/brain-crash-injection.test.ts, tests/e2e/sprint-160-smoke.test.ts
- Scope: tests/

### Description

**Dependency:** Task 1 + 2 + 4 DONE bekler (integration test). T-001 + T-006 (Task 3) bağımsız çalışır.

6 crash injection senaryosu + e2e mini-sprint smoke.

**6 senaryo (`tests/orchestra/brain-crash-injection.test.ts`):**
- S1: SIGTERM mid-EXECUTE → `restoreSprintFromCheckpoint` action `resume-evaluate`, stale task `.result` ile
- S2: unhandledRejection with API key → `redactSensitive` API key silindi (T-001 fix verified)
- S3: Double-MCP `acquireSingletonLock` ikinci kez → `SingletonLockError`
- S4: `sprint-state.json` desync (`phase:SPAWN`) + checkpoint `EVALUATE` → recovery state.json EVALUATE'a yazar
- S5: Missing checkpoint → `action:'fresh'` (false-positive recovery yok)
- S6: `writeEvaluationAudit` fail (`vi.mock` throw) → `runEvaluatePhase` başarılı dönüş (fail-soft try/catch kanıtı)

**E2E smoke (`tests/e2e/sprint-160-smoke.test.ts`):** Mini-sprint 1 dummy task, DI mocked worker spawn. Assert: state.json phase transitions visible, checkpoint `eventStreamOffset > 0` post-sprint, events.jsonl sequence monotonic.

**Kanıt:**
- `grep -nE "S[1-6]:" tests/orchestra/brain-crash-injection.test.ts` → 6 match
- Test isolated run → 9/9 PASS

**Test:** 9 test (6 crash injection + 3 e2e).

---

## ADR + Security Review (post-Task gates)

**ADR-043 + ADR-044** — Sprint 160'tan taşındı. Doc-writer agent ile yazılır + `memory.db`'ye insert (Sprint sonu).

**Security Review** — 3 madde audit (SR-1 exception handler data leak, SR-2 double-MCP O_EXCL race, SR-3 state recovery integrity).

---

## Anchor Kurallar (worker'lar zorunlu okur)

- **`npm run build` YASAK** worker'larda — Alperen kararı.
- **Test izole:** `npx vitest run path/to/file.test.ts` ile tek dosya çalıştır.
- **Scope discipline:** Sadece `Files` field'daki dosyalara yaz. `git diff --stat` auditor tarafından izlenir.
- **ESM import:** `.js` uzantısı zorunlu (Node16 resolution).
- **No mid-sprint refactor:** Task'ın `Files` dışına çıkma.
- **TDD discipline:** Test önce yaz, fail doğrula, kod yaz, pass doğrula, commit.
- **NO MVP / NO MINIMUM** — T4-modified disiplin.
- **🆕 NO docs/ PATH MENTION:** Task description'larında `docs/...` veya `.deckent/...` path yazma — planner bunu `filesWrite`'a alıyor (Sprint 160 SPAWN crash sebebiydi).

## GO/NO_GO Criteria

- ✅ 5/5 task DONE veya GO_WITH_TECH_DEBT
- ✅ tsc PASS + vitest PASS (delta 0 fail)
- ✅ 36 yeni test (7+6+8+6+9) PASS, 0 regression
- ✅ ADR-043 + ADR-044 accepted (memory.db'de)
- ✅ Security review 3/3 greenflag
- ❌ NO_GO: Task 1 (checkpoint) veya Task 4 (state recovery) NO_GO → Sprint 162'de P0 retain
