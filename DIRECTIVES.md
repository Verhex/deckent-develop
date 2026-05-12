# DIRECTIVES — Sprint 160: Brain Stability + Restart Recovery

## Goal

Brain runner restart loop'un kanıtlanmış üç yapısal eksiğini kapatmak: (1) global exception/rejection/SIGTERM handler eksik (silent crash), (2) checkpoint loop runtime'da çalışmıyor (Sprint 138 T-9 broken), (3) phase transition update sprint-state.json'a yazılmıyor. Sprint 157→158→159 üç crash'inin tekrar etmesini önleyen T4-modified disiplin sprint'i: source + test + observability + 2 ADR (043 Crash Recovery + 044 State Observability) + Security Review (3 madde) + çift katmanlı smoke (in-sprint crash injection + Sprint 161 dogfood).

## Referanslar

- **Spec (architecture + rationale):** `docs/superpowers/specs/2026-05-12-sprint-160-brain-stability-design.md`
- **Plan (step-by-step + kod örnekleri):** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md`
- **Önceki sprint:** `.brain/archive/DIRECTIVES-sprint-159.md`
- **Forensic kanıt:** `.deckent/sprint-159-events.jsonl`, `.deckent/sprint-159-checkpoint.json`, `.deckent/sprint-state.json`

## Wave Plan + Dependency

- **Wave 1 (paralel, 0 collision — ayrı dosyalar):** Task 1, Task 2, Task 3, Task 4 eş zamanlı
- **Wave 2 (Task 1 + Task 2 done bekler):** Task 5 (state recovery, brain.ts + sprint-controller.ts)
- **Wave 3 (Task 1 + 2 + 3 + 5 done bekler):** Task 6 (crash injection + e2e smoke)

---

## Task 1: Global Exception/Rejection/SIGTERM Handler + Redaction (T-001)

- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Agent: bug-fixer
- Files: src/orchestra/sprint-runner-entry.ts, src/orchestra/sensitive-redactor.ts, tests/orchestra/sensitive-redactor.test.ts, tests/orchestra/exception-handler.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

`src/orchestra/sprint-runner-entry.ts` Brain runner detached child process'in entry point'i. Şu an sadece `process.on('exit')` handler var (line 243). **Eksik:** `uncaughtException`, `unhandledRejection`, `SIGTERM` graceful handler. Sprint 157→158→159 üçü de silent crash oldu çünkü exception yakalanamadı.

**Yapılacaklar:**
1. **`src/orchestra/sensitive-redactor.ts` (YENİ, ~60 LoC):** `redactSensitive(err)` fonksiyonu. Pattern coverage: `api[_-]?key`, `Authorization: Bearer`, `Bearer <token>`, `GITHUB_TOKEN`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY` env vars, `token=`/`secret=`/`password=`, `sk-...`/`pk-...` keys, +100 char file content (`: [REDACTED:N chars]`).

2. **`src/orchestra/sprint-runner-entry.ts` (MODIFY):**
   - Yeni export: `CrashContext` interface (`ipcDir`, `jobId`).
   - Yeni export: `installCrashHandlers(ctx: CrashContext)` — idempotent (module-level guard), 3 handler ekler:
     - `uncaughtException` → IPC `error.json` (redact'lı payload) + stderr + `exit(1)`
     - `unhandledRejection` → aynı pattern + `exit(1)`
     - `SIGTERM` → IPC `status.json` (`terminatedBy:SIGTERM`) + `exit(143)`
   - `main()` içinde IPC config okuduktan SONRA `installCrashHandlers({ipcDir, jobId: config.jobId})` çağrısı (AS EARLY AS POSSIBLE).

**Detaylı kod örnekleri:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md#task-1`

**Fail-fast policy (ADR-043):** Brain kendi restart'ını YAPMAZ. Exit code 1 (crash) / 143 (SIGTERM); parent supervisor restart kararı verir (Sprint 161+ watchdog).

**Kanıt:**
- `grep -n "uncaughtException\|unhandledRejection" src/orchestra/sprint-runner-entry.ts` → 2+ match
- `grep -n "installCrashHandlers\|redactSensitive" src/orchestra/sprint-runner-entry.ts` → 2+ match

**Test:** 11 test (6 redactor + 5 crash handler). Senaryolar: API key redact, Bearer redact, +100 char content, env var redact, password redact, idempotent install, `error.json` schema, SIGTERM `exit(143)`, unhandledRejection handler.

---

## Task 2: Checkpoint Loop Runtime Wire — eventStreamOffset + completedTasks Invariants (T-002)

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-controller.ts, tests/orchestra/checkpoint-loop.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Forensic bug kanıtı (Sprint 159):** `checkpoint.json` `checkpointNumber:1, completedTasks:[], eventStreamOffset:0` donuk kaldı — Brain restart loop bunu kanıtladı. Kök sebep: `sprint-controller.ts:389,412,526,582,591` `writePhaseCheckpoint(projectRoot, sprint, sprint.phase)` 3 parametre veriyor, `eventStreamOffset` undefined → 0; `completedTasks` da `[]`.

**Yapılacaklar:**
1. **`src/orchestra/sprint-checkpoint.ts` (MODIFY):**
   - Yeni export: `computeEventStreamOffset(projectRoot, sprintId)` — `<sprintId>-events.jsonl` son sequence (source-of-truth). Eksik/boş → 0.
   - `writeCheckpoint` body: `completedTasks = sprint.tasks.filter(t => t.status === DONE).map(t => t.id)`, `pendingTasks = filter(!terminal)`. **Atomic rename** (`renameSync(tmp, final)`).
   - `writePhaseCheckpoint` kendi içinde `computeEventStreamOffset()` çağırır (caller değişmez), `brainPhase` parametresini explicit alır.

2. **`src/orchestra/sprint-controller.ts` (MODIFY):** Mevcut `writePhaseCheckpoint(projectRoot, sprint, sprint.phase)` çağrıları aynı kalabilir; T-002 helper içinde offset compute eder. (Caller değişmesi opsiyonel — type signature backward compatible).

**Detaylı kod:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md#task-2`

**Kanıt:**
- `grep -n "computeEventStreamOffset" src/orchestra/sprint-checkpoint.ts` → 2+ match (export + internal call)
- `grep -n "renameSync" src/orchestra/sprint-checkpoint.ts` → 1+ match (atomic rename)
- Test çıktısı: `checkpoint.json` `completedTasks: ['t-1','t-2']`, `eventStreamOffset: 3` (donuk değil)

**Test:** 7 test (eventStreamOffset compute, completedTasks filter, checkpointNumber increment, brainPhase reflect, atomic rename no .tmp leftover, missing events.jsonl=0, empty events.jsonl=0).

---

## Task 3: Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/phase-transition-observability.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Composite task (spec onaylı):** 2 alt-bug aynı dosyada (`sprint-phases.ts`), aynı kontrat (phase transition). Birleştirme collision'ı önlüyor.

**(a) Sprint phase observability (ADR-044):** Sprint 159 forensic kanıt: `sprint-state.json` `phase:SPAWN, status:PLANNING, updatedAt:15:45:45` donuk kaldı; phase EXECUTE→EVALUATE→RETRO→CLEANUP gerçekte geçti ama disk'e yansımadı. External observer (auditor, dashboard, MCP `deckent_status`) kör.

**(b) EvaluationAuditTrail wire:** `src/orchestra/evaluation-audit-trail.ts` Sprint 157 T-001 survivor — `commit 6c337b0`'da diskte var (6.2 KB, 8/8 test pass), AMA `runEvaluatePhase` içinde çağrılmıyor. Audit trail'ler `.tasks/<id>.audit.json` olarak yazılmıyor.

**Yapılacaklar:**
1. **`src/orchestra/sprint-phases.ts` (MODIFY):**
   - Yeni helper: `persistPhaseTransition(projectRoot, sprintId, phase, status)` — `src/monitor/sprint-state.ts`'in `writeSprintState` fonksiyonunu çağırır, try/catch wrap (Brain'i öldürmesin).
   - Mevcut `sprint.phase = SprintPhase.X` setlerinden SONRA `persistPhaseTransition()` çağrısı eklenir:
     - `runPlanPhase` → PLAN / 'PLANNING'
     - `runSpawnPhase` (line ~401) → SPAWN / 'RUNNING'
     - `runEvaluatePhase` (line ~586) → EVALUATE / 'EVALUATING'
     - `runFixPhase` → FIX / 'FIXING'
   - `runEvaluatePhase` her task evaluation'dan sonra `writeEvaluationAudit(projectRoot, sprint.id, {...})` çağrısı (try/catch wrap, fail-soft).

2. **`src/monitor/sprint-state.ts`'in `writeSprintState` signature'ını OKU**, parametre adapter yap. Field set'i: `{sprintId, phase: String(phase), status, taskIds, updatedAt}`.

3. **`src/orchestra/evaluation-audit-trail.ts:157`'nin `writeEvaluationAudit` signature'ını OKU**, parametre adapter: `{taskId, decision, ruleSet, criterionScores, schemaValidation, rationale, timestamp}`. `buildDecisionRationale(evaluation)` mevcut export'unu kullan.

**Detaylı kod + test placeholders:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md#task-3`

**Test note:** Plan'da 6 placeholder test var — worker `writeSprintState` ve `writeEvaluationAudit` exact signature'larına bakıp assertion'ları gerçekleştirir. Test count hedefi: 6/6 PASS.

**Kanıt:**
- `grep -n "persistPhaseTransition" src/orchestra/sprint-phases.ts` → 5+ match (helper + 4 phase call)
- `grep -n "writeEvaluationAudit" src/orchestra/sprint-phases.ts` → 1+ match
- Test çıktısı: `sprint-state.json` phase her transition'da update

**Test:** 6 test (PLAN/SPAWN/EVALUATE/FIX state.json write, audit.json schema, atomic write no .tmp leftover).

---

## Task 4: Double-MCP Guard + PID Singleton Lock (T-006)

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

2. **`src/mcp/server.ts` (MODIFY):**
   - Import singleton-lock module.
   - `bootSingletonGuard(projectRoot)` fonksiyonu: `acquireSingletonLock(join(projectRoot, DECKENT_DIR, 'mcp-server.pid'))`. Failure → stderr + exit code 2.
   - `process.on('exit'|'SIGTERM'|'SIGINT')` cleanup hook ile release.
   - McpServer instantiation'dan ÖNCE `bootSingletonGuard(process.cwd())` çağrısı.

**Detaylı kod:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md#task-4`

**Kanıt:**
- `grep -n "acquireSingletonLock\|isProcessAlive" src/mcp/server-singleton-lock.ts` → 4+ match
- `grep -n "bootSingletonGuard\|acquireSingletonLock" src/mcp/server.ts` → 2+ match

**Test:** 8 test (clean acquire, refuse with live PID, stale cleanup + steal, isProcessAlive own/init/improbable, release removes file, O_EXCL race).

---

## Task 5: State Recovery on Brain Restart (T-004)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-controller.ts, tests/orchestra/state-recovery.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Dependency:** Task 1 (crash handler) + Task 2 (checkpoint loop) DONE bekler. Bunlar olmadan recovery test edilemez.

**Forensic kanıt (Sprint 159):** `durationMs: -106` (negative!) — `startedAt` restart sonrası persist edilmedi. Stale EXECUTING task'lar `handleEvaluation` çağrılmadı. State.json donuk.

**Yapılacaklar:**
1. **`src/orchestra/sprint-checkpoint.ts` (MODIFY, end of file):**
   - `RestoreResult` interface (`{restored, action, restoredSprint?, staleTasksWithResult, staleTasksMarkedNoGo}`)
   - `restoreSprintFromCheckpoint(projectRoot, sprintId): RestoreResult`:
     - `readCheckpoint` çağrı; null → `{restored:false, action:'fresh'}`
     - `sprint.tasks` rebuild (`completedTasks` + `pendingTasks` → task.json okur)
     - `startedAt` korunur (`cp.sprintStartedAt ?? cp.timestamp`)
     - `cp.pendingTasks.length === 0` → `action:'complete'`
     - Stale EXECUTING + `.result` var → `staleTasksWithResult`, `action:'resume-evaluate'`
     - Stale EXECUTING + `.result` yok → `task.status = NO_GO` (task.json overwrite), `staleTasksMarkedNoGo`, `action:'resume-evaluate'`
     - `writeSprintState` ile state.json'a resumed phase sync

2. **`src/orchestra/sprint-controller.ts:264` (MODIFY, `runSprint` body başı):**
   - Sprint ID determine'dan sonra, `planSprint`'ten ÖNCE `restoreSprintFromCheckpoint(projectRoot, sprintId)` çağrı
   - `recovery.restored`:
     - `action:'complete'` → emit `SPRINT_RESUME_COMPLETE` + `finalizeSprint`
     - `action:'resume-evaluate'` → emit `SPRINT_RESUME` (payload: staleWithResult, staleMarkedNoGo) + `sprint = recovery.restoredSprint!` + skip PLAN/SPAWN/EXECUTE, jump to `runEvaluatePhase`
     - `action:'fresh'` → normal path
   - Idempotency: `tryAcquireEvaluateLock` (Sprint 157 T-002 survivor) safety guard, recovery sırasında double-eval önler.

**Detaylı kod:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md#task-5`

**Kanıt:**
- `grep -n "restoreSprintFromCheckpoint" src/orchestra/sprint-checkpoint.ts src/orchestra/sprint-controller.ts` → 3+ match
- `grep -n "SPRINT_RESUME\b" src/orchestra/sprint-controller.ts` → 1+ match

**Test:** 6 test (no checkpoint→fresh, all DONE→complete, stale+result→resume-evaluate, stale+no-result→NO_GO mark + resume, startedAt preserve, state.json sync after restore).

---

## Task 6: Crash Injection Integration Test + E2E Smoke (T-007)

- Model: opus
- Effort: normal
- Skills: testing-expert, ci-testing
- Agent: test-writer
- Files: tests/orchestra/brain-crash-injection.test.ts, tests/e2e/sprint-160-smoke.test.ts
- Scope: tests/

### Description

**Dependency:** Task 1 + 2 + 3 + 4 + 5 DONE bekler (integration test).

Spec §9 Katman 1 — 6 crash injection senaryosu + e2e mini-sprint smoke.

**6 senaryo (`tests/orchestra/brain-crash-injection.test.ts`):**
- S1: SIGTERM mid-EXECUTE → `restoreSprintFromCheckpoint` action `resume-evaluate`, stale task `.result` ile
- S2: unhandledRejection with API key → `redactSensitive` API key silindi
- S3: Double-MCP `acquireSingletonLock` ikinci kez → `SingletonLockError`
- S4: `sprint-state.json` desync (`phase:SPAWN`) + checkpoint `EVALUATE` → recovery state.json EVALUATE'a yazar
- S5: Missing checkpoint → `action:'fresh'` (false-positive recovery yok)
- S6: `writeEvaluationAudit` fail (`vi.mock` throw) → `runEvaluatePhase` başarılı dönüş (fail-soft try/catch kanıtı)

**E2E smoke (`tests/e2e/sprint-160-smoke.test.ts`):** Mini-sprint 1 dummy task, DI mocked worker spawn (subprocess yerine inline). Assert: state.json phase transitions visible, checkpoint `eventStreamOffset > 0` post-sprint, events.jsonl sequence monotonic.

**Detaylı kod + placeholders:** `docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md#task-6`

**Worker note:** S6 + e2e placeholder'lar — worker `vi.mock` + DI pattern ile gerçek assertion'ları yazar.

**Kanıt:**
- `grep -nE "S[1-6]:" tests/orchestra/brain-crash-injection.test.ts` → 6 match
- `npx vitest run tests/orchestra/brain-crash-injection.test.ts tests/e2e/sprint-160-smoke.test.ts` → 9/9 PASS

**Test:** 9 test (6 crash injection + 3 e2e).

---

## ADR + Security Review (post-Task gates, Sprint sonu finalize öncesi)

**ADR-043 + ADR-044** (`docs/adr/ADR-043-brain-crash-recovery.md` + `docs/adr/ADR-044-sprint-state-observability.md`) — Plan'da inline draft mevcut, doc-writer agent ile yazılır + `memory.db`'ye insert.

**Security Review** — 3 madde audit (`docs/audits/sprint-160/security-review.md`):
- SR-1 Exception handler data leak coverage
- SR-2 Double-MCP O_EXCL race
- SR-3 State recovery integrity (startedAt + idempotency)

---

## Anchor Kurallar (worker'lar zorunlu okur)

- **`npm run build` YASAK** worker'larda (memory: `feedback_build_requires_user_approval`). Alperen kararı.
- **Test izole:** `npx vitest run path/to/file.test.ts` ile tek dosya çalıştır.
- **Scope discipline:** Sadece `Files` field'daki dosyalara yaz. `git diff --stat` auditor tarafından izlenir.
- **ESM import:** `.js` uzantısı zorunlu (Node16 resolution). `import { foo } from './bar.js'`.
- **No mid-sprint refactor:** Task'ın `Files` dışına çıkma, ilgisiz cleanup yapma.
- **TDD discipline:** Test önce yaz, fail doğrula, kod yaz, pass doğrula, commit.
- **NO MVP / NO MINIMUM** (memory: `feedback_no_minimum_no_mvp_deckent`). T4-modified disiplin.

## GO/NO_GO Criteria

- ✅ 6/6 task DONE veya GO_WITH_TECH_DEBT
- ✅ tsc PASS + vitest PASS (delta 0 fail)
- ✅ 47 yeni test (11+7+6+8+6+9) PASS, 0 regression
- ✅ ADR-043 + ADR-044 accepted (memory.db'de)
- ✅ Security review 3/3 greenflag
- ❌ NO_GO: T-001 (exception handler) veya T-004 (state recovery) NO_GO → Sprint 161'de P0 retain

---

## Sprint Sonrası (Sprint 161 dogfood — Alperen kararı)

Sprint 160 finalize sonrası: Alperen `npm run build` + MCP restart → Sprint 161 minimal 3-task dogfood. Beklenen smoke:
- 0 Brain crash (sprint-runner-entry exit 0)
- sprint-state.json phase her transition canlı update
- checkpoint.json invariants tutar
- events.jsonl sequence monotonic
- Tek MCP server instance

Brain crash olursa exception handler `error.json` (redact'lı) + `restoreSprintFromCheckpoint` resume devreye girer → Sprint 160 fix'inin gerçek dünya kanıtı.
