# DIRECTIVES — Sprint 163: Brain Stability Closure

> **Sprint 160→162 progress recap:**
> - Sprint 160 SPAWN crash → T-001 commit `9c184a3` (exception handler + redactor)
> - Sprint 161 SPAWN crash → T-002 + T-006 commit `8cefed0` (checkpoint loop + double-MCP)
> - Sprint 162 → 3/3 worker DONE (T-003 phase observability + T-004 state recovery + T-007 crash injection)
> - **Sprint 162 forensic kanıtı (manuel verify):**
>   - Brain Spurious NO_GO regression: 162-003 worker selfAssessment DONE + rubric 95/95/100/85, Brain evaluationDecision NO_GO (Sprint 145 helper `mid-sprint-adapter.ts:338` reconcileSpuriousNoGo call-site eksik veya yetersiz)
>   - Docker container_start_failed: 162-003-fix worker spawn fail (Sprint 156 commit `4d15196` debt aktif)
> - **Konfigurasyon:** `dependency_pipeline_enabled: false` (Sprint 161 lesson — wire eksik, Sprint 164'te Yol B ile ele alınacak)

## Goal

Sprint 160-162 Brain stability hattını mühürlemek: (1) Sprint 162'de patlayan iki regression'ı (Brain spurious NO_GO + Docker container_start_failed) source-level fix, (2) Sprint 160 governance borcunu kapat (ADR-043 + ADR-044 + Security Review), (3) tüm fix'leri canlı dogfood smoke ile self-validate. Sprint 164 (dep_pipeline Yol B wire) için temiz foundation.

## Referanslar (read-only — task description'larında PATH MENTION YASAK!)

- Sprint 160 design: docs/superpowers/specs/2026-05-12-sprint-160-brain-stability-design.md
- Sprint 160 plan: docs/superpowers/plans/2026-05-12-sprint-160-brain-stability.md
- Sprint 145 spurious NO_GO helper: `src/orchestra/mid-sprint-adapter.ts:338` reconcileSpuriousNoGo
- Sprint 156 commit (docker exit pattern fix): `4d15196`
- Sprint 160 stalled forensic: .tasks/archive/sprint-160-stalled/
- Sprint 161 stalled forensic: .tasks/archive/sprint-161-stalled/

> ⚠️ **Anchor kural (Sprint 160→161→162 lesson):** Task description'larında `docs/...` veya `.deckent/...` PATH MENTION YAPMA — planner bunu `filesWrite`'a alıyor → spawn-lock conflict. Path'ler sadece `Files:` field'ında belirtilir.

## Wave Plan + Dependency

- **Wave 1 (paralel, 0 collision — ayrı dosyalar):** Task 1, Task 2, Task 3
- **Wave 2 (Wave 1 done bekler — ayrı dosyalar):** Task 4, Task 5
- **Wave 3 (Wave 1+2 done bekler — live state validation):** Task 6

## Post-Sprint Manuel Verify Protokolü (ZORUNLU)

Sprint 163'ün kendisi spurious NO_GO bug'lı Brain ile çalışıyor (Task 1 fix henüz canlı değil). **6/6 task için manuel forensic ZORUNLU:**

1. `.tasks/archive/sprint-163/task-163-NNN.result` dosyalarını oku — `selfAssessment` field'ı primary kanıt
2. Worker selfAssessment DONE + rubric ortalama ≥ 85 + tests PASS → **gerçek DONE** (Brain evaluationDecision sekonder)
3. Brain NO_GO etiketleyip worker DONE diyorsa → Sprint 162 162-003 senaryosu, retro'da B1 fix'in kendisi doğrulanır
4. `git diff --stat` ile worker'ın yazdığı dosyaları kontrol — kod gerçekten disk'te mi
5. `npx vitest run <test-file>` ile testler canlı çalışır mı doğrula

---

## Task 1: Brain Spurious NO_GO Reconciliation Wire Restore (B1)

- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/mid-sprint-adapter.ts, src/orchestra/result-evaluator.ts, tests/orchestra/spurious-no-go-reconciliation.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

Sprint 145'te "Brain Spurious NO_GO Reconciliation Helper" `src/orchestra/mid-sprint-adapter.ts:338` `reconcileSpuriousNoGo` olarak yazıldı. Sprint 162'de regresyon kanıtı: 162-003 worker selfAssessment DONE + rubricScores `{correctness:95, coverage:95, scope:100, doc:85}`, Brain evaluationDecision NO_GO etiketledi. Helper var ama call-site eksik veya yeni edge case'i kaçırıyor.

**Yapılacaklar:**

1. **`src/orchestra/mid-sprint-adapter.ts` + `src/orchestra/result-evaluator.ts`:**
   - `grep -n "reconcileSpuriousNoGo" src/orchestra/` ile helper'ı (mid-sprint-adapter.ts:338) ve mevcut caller'ları bul.
   - Caller eksikse `evaluateResult` (result-evaluator.ts) veya `handleEvaluation` içinde, Brain decision belirlendikten sonra `reconcileSpuriousNoGo(result, task, brainDecision)` çağrısı ekle.
   - Helper'ı gerekirse genişlet — karar matrisi (decision matrix):
     - Worker selfAssessment === 'DONE' AND result.testsPassed === true AND rubricScores ortalama ≥ 85 AND result.coverage ≥ 80 → DONE (worker wins, Brain NO_GO override edilir)
     - Worker selfAssessment === 'DONE' AND scope_compliance < 90 → NO_GO (scope violation concrete, override edilmez)
     - Worker selfAssessment === 'NO_GO' → NO_GO (worker'ın kendi NO_GO'su priority)
     - Brain NO_GO sebebi "test_failed" veya "scope_violation" → concrete, override edilmez
     - Brain NO_GO sebebi "evaluation_pipeline_uncertainty" veya "heuristic_low_confidence" → heuristic, worker selfAssessment priority
   - Call-site: `evaluateResult` veya `handleEvaluation` içinde, Brain decision belirlendikten sonra `reconcileSpuriousNoGo` çağırılır

2. **Test:** Sprint 162 162-003 senaryosunu reproduce et + 4 edge case.

**Kanıt:**
- `grep -n "reconcileSpuriousNoGo\|reconcil" src/orchestra/result-evaluator.ts` → 3+ match (definition + 1+ call-site)
- Test çıktısı: Sprint 162 162-003 senaryosu (rubric 95/95/100/85 + Brain heuristic NO_GO) → result.evaluationDecision === DONE

**Test:** 5 test (heuristic NO_GO reconcile to DONE, concrete test_failed preserve NO_GO, scope_violation preserve NO_GO, worker self NO_GO preserve, rubric threshold respect).

---

## Task 2: Docker container_start_failed Health Check + Retry Policy (B2)

- Model: opus
- Effort: normal
- Skills: docker-expert, typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-container-start-failed.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

Sprint 156 commit `4d15196`'da docker worker exit pattern fix edilmişti. Sprint 162'de 162-003-fix worker spawn fail — `container_start_failed` error path tetiklendi. Fix-phase'de aynı race tekrarladı, root cause ya container hiç başlamıyor ya başlar başlamaz exit ediyor — iki durum ayırt edilmiyor.

**Yapılacaklar:**

1. **`src/orchestra/spawn-backend-docker.ts`:**
   - `grep "container_start_failed"` ile error path'i bul
   - Health check eklemesi: `docker run` çağrısından sonra 3 saniye bekle + `docker inspect <name> --format='{{.State.Running}}'` çağrısı. Sonuç:
     - `true` → spawn başarılı, devam
     - `false` + ExitCode 0 → instant-exit success (gracefully terminated) — bu hata değil
     - `false` + ExitCode > 0 → real container_start_failed, retry candidate
   - Retry policy: max 2 attempt × 5 saniye delay. İkinci fail sonrası graceful error:
     - `image not found` → `DECKENT_E081: Docker image '<name>' bulunamadı`
     - `port collision` → `DECKENT_E082: Port çakışması`
     - `resource limit` → `DECKENT_E083: Docker resource limit`
     - `unknown` → `DECKENT_E084: container_start_failed (exitCode=N, stderr=...)`
   - Bu fix Sprint 162 162-003-fix senaryosunu kapatır (fix-phase'de container_start_failed → graceful retry → success or graceful fail)

2. **Test:** 4 senaryo mock docker backend ile.

**Kanıt:**
- `grep -n "inspect.*Running\|retry.*spawn" src/orchestra/spawn-backend-docker.ts` → 3+ match
- Test çıktısı: instant-exit success ve real-fail ayırt edilir

**Test:** 4 test (clean start, retry-then-success on 2nd attempt, retry-then-fail with graceful error code, instant-exit ExitCode=0 detected as success).

---

## Task 3: ADR-043 — Brain Crash Recovery Protocol (A1)

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/adr/043-brain-crash-recovery-protocol.md
- Scope: docs/adr/

### Description

Sprint 160 governance borç — ADR-043 markdown yazımı + memory.db insert. Sprint 160 T-001 (exception handler + redactor) + Sprint 161 T-002 (checkpoint loop atomic write) + Sprint 162 T-004 (state recovery action discrimination) birlikte Brain crash recovery protokolünü oluşturur.

ADR içeriği (MADR v3 hibrit format):
- **Title:** Brain Crash Recovery Protocol
- **Status:** accepted
- **Date:** 2026-05-13
- **Context:** Sprint 159-161 forensic — Brain crash sonrası sprint state recovery yetersizdi (`durationMs: -106` negative bug, stale EXECUTING task'lar handleEvaluation'a girmedi, sensitive data exception log'unda leak riski)
- **Decision:** 3-katman recovery protokolü:
  1. **Entry-point exception handler** — process boot'ta `installCrashHandlers` çağrısı, `redactSensitive` ile API key/token redaction (commit `9c184a3`)
  2. **Atomic checkpoint write** — `computeEventStreamOffset` + `completedTasks` populated, `renameSync` atomic rename (commit `8cefed0`)
  3. **State recovery on restart** — `restoreSprintFromCheckpoint` 3 action: `fresh` / `complete` / `resume-evaluate`, stale EXECUTING task `.result` mevcudiyeti ile ayırt edilir (Sprint 162 T-004)
- **Consequences:** Brain restart sonrası state korunur, negative durationMs giderilir, sensitive data exception log'una sızmaz, external observer crash öncesi state'i restore edebilir
- **Alternatives considered:** (a) No-recovery (fresh restart) — reddedildi, partial work kaybı; (b) Full memory checkpoint — reddedildi, performance overhead
- **References:** commits `9c184a3`, `8cefed0`, Sprint 162 T-004 result
- **memory.db insert pattern:** `store.insert({ type: 'adr', id: 'adr-043', status: 'accepted', sprint_id: 'sprint-163', tags: ['recovery', 'crash', 'brain', 'observability'] })`

**Kanıt:**
- File exists, MADR v3 section'lar (Context, Decision, Consequences, Alternatives, References) dolu
- memory.db query: `deckent recall "adr-043"` → result returned

**Test:** 0 test (governance doc task, kanıt yapısal validation)

---

## Task 4: ADR-044 — Sprint State Observability Contract (A2)

- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/adr/044-sprint-state-observability-contract.md
- Scope: docs/adr/

### Description

Sprint 160 governance borç — ADR-044 markdown + memory.db insert. Sprint 162 T-003 (phase observability + EvaluationAuditTrail wire) bu contract'ı implement etti, ADR sonradan kayda alınır.

ADR içeriği (MADR v3):
- **Title:** Sprint State Observability Contract
- **Status:** accepted
- **Date:** 2026-05-13
- **Context:** Sprint 159-161 forensic — `sprint-state.json` `phase:SPAWN, status:PLANNING` donuk kaldı, sprint gerçek phase ilerlemesi (EXECUTE→EVALUATE→RETRO→CLEANUP) disk'e yansımadı, external observer kör
- **Decision:** Her `sprint.phase` mutation'dan sonra `persistPhaseTransition(projectRoot, sprint, phase, status)` ZORUNLU çağrı:
  - `runPlanPhase` → PLAN / 'PLANNING'
  - `runSpawnPhase` → SPAWN / 'RUNNING'
  - `runEvaluatePhase` → EVALUATE / 'EVALUATING'
  - `runFixPhase` → FIX / 'FIXING'
  - Atomic write (rename pattern), fail-soft try/catch wrap (Brain'i öldürmesin)
  - Her task evaluation sonrası `writeEvaluationAudit(...)` ZORUNLU — per-task audit.json schema: `{taskId, decision, ruleSet, criterionScores, schemaValidation, rationale, timestamp}`
- **Consequences:** Dashboard real-time phase tracking, audit trail per-task, post-sprint forensic için sequential timeline rebuild edilebilir
- **Alternatives considered:** (a) Event-stream-only observability — reddedildi, snapshot point gerekli; (b) Synchronous DB write — reddedildi, performance/lock risk
- **References:** Sprint 162 T-003 (`sprint-phases.ts:persistPhaseTransition` wire), `evaluation-audit-trail.ts` (Sprint 157 T-001 survivor `6c337b0`)
- **memory.db insert pattern:** ADR-043 ile aynı

**Kanıt:**
- File exists, MADR v3 sections
- memory.db: `deckent recall "adr-044"` → result

**Test:** 0 test (governance doc task)

---

## Task 5: Sprint 160 Security Review 3/3 (A3)

- Model: sonnet
- Effort: normal
- Skills: security-specialist, documentation-writer
- Agent: security-auditor
- Files: docs/audits/sprint-163/security-review.md
- Scope: docs/audits/sprint-163/

### Description

Sprint 160 plan'da Security Review 3 madde işaretliydi, Sprint 163'te kapatılır:
- **SR-1:** Exception handler data leak risk — `redactSensitive` coverage tam mı? API key/token regex sızıntı var mı?
- **SR-2:** Double-MCP O_EXCL race condition — `acquireSingletonLock` race-safety, EEXIST + stale PID cleanup atomicity
- **SR-3:** State recovery integrity — `restoreSprintFromCheckpoint` checkpoint trust boundary, malformed JSON attack surface

Raporda her madde için:
- **Code path:** İlgili source file + grep çıktısı (kanıt)
- **Saldırı yüzeyi:** Hangi input attacker-controlled? (örn. process.env, sprint state file, lock file PID)
- **Mevcut savunma:** Defense layers (redaction regex, atomic syscall, JSON schema validation)
- **Verdict:** GREEN (sound) / YELLOW (minor concerns) / RED (P0 fix needed)
- **Öneri:** YELLOW/RED için sonraki sprint task önerisi

**Kanıt:**
- File 3 section (SR-1, SR-2, SR-3) içerir
- Her section verdict + code path + öneri var

**Test:** 0 test (audit task)

---

## Task 6: Brain Dogfood Smoke — Sprint 163 Self-Validation (C1)

- Model: opus
- Effort: normal
- Skills: testing-expert, ci-testing
- Agent: ci-guardian
- Files: docs/audits/sprint-163/dogfood-smoke-report.md
- Scope: docs/audits/sprint-163/

### Description

**Dependency:** Task 1-5 DONE bekler. Sprint 163'ün **kendisi** dogfood smoke — Wave 3 başladığında Wave 1+2 task'ları Brain stability fix'lerini zaten canlı kanıtlamış olur.

Worker, Sprint 163'ün live state dosyalarını okur (read-only) ve aşağıdaki 6 invariant'ı doğrular:

1. **events.jsonl monotonic sequence:** sprint events stream'de her satırda sequence numarası strict increasing (gap veya duplicate yok)
2. **sprint-state.json phase transitions persisted:** PLAN → SPAWN → EVALUATE → RETRO geçişleri disk'te visible (Sprint 162 T-003 wire kanıtı)
3. **checkpoint.json invariants:** `eventStreamOffset > 0`, `completedTasks` populated (boş array değil), `checkpointNumber` ≥ 1 (Sprint 161 T-002 fix kanıtı)
4. **audit.json per-task:** Her completed task için per-task audit.json var, `decision`/`criterionScores`/`rationale` field'ları dolu (Sprint 162 T-003 EvaluationAuditTrail wire kanıtı)
5. **No .tmp leftover:** sprint state/event dizininde `.tmp` suffix'li dosya yok (atomic rename başarılı)
6. **Spurious NO_GO reconciliation evidence:** Sprint 163'te en az 1 task'ta worker selfAssessment vs Brain initial decision delta görülürse, `reconcileSpuriousNoGo` çağrılma kanıtı (audit.json `rationale` field'da reconciliation note)

Her invariant için PASS/FAIL + kanıt (file content snippet) raporda. 6/6 PASS → Brain stability hattı LIVE CONFIRMED → Sprint 164 başlatma onayı.

**Kanıt:**
- Rapor 6 invariant section, her biri PASS/FAIL verdict + kanıt snippet
- `grep -cE "PASS|FAIL" docs/audits/sprint-163/dogfood-smoke-report.md` → 6+

**Test:** 0 test (live observability validation — read-only audit)

---

## Anchor Kurallar (worker'lar zorunlu okur)

- **`npm run build` YASAK** worker'larda — Alperen kararı.
- **Test izole:** `npx vitest run path/to/file.test.ts` ile tek dosya çalıştır.
- **Scope discipline:** Sadece `Files` field'daki dosyalara yaz. `git diff --stat` auditor tarafından izlenir.
- **ESM import:** `.js` uzantısı zorunlu (Node16 resolution).
- **No mid-sprint refactor:** Task'ın `Files` dışına çıkma.
- **TDD discipline:** Test önce yaz, fail doğrula, kod yaz, pass doğrula, commit.
- **NO MVP / NO MINIMUM** — T4-modified disiplin, full god-level scope.
- **🆕 NO docs/ + .deckent/ PATH MENTION** task description'larında — planner bunu `filesWrite`'a alıyor (Sprint 160 SPAWN crash sebebi). Path'ler `Files:` field'da.
- **🆕 Post-sprint manuel verify ZORUNLU** — Brain spurious NO_GO bug aktif (Task 1 fix henüz canlı değil); worker selfAssessment primary kanıt, Brain evaluationDecision sekonder.

## GO/NO_GO Criteria

- ✅ 6/6 task DONE veya GO_WITH_TECH_DEBT (post-sprint manuel verify ile)
- ✅ tsc PASS + vitest PASS (delta 0 fail)
- ✅ 9 yeni test (5+4+0+0+0+0) PASS, 0 regression
- ✅ ADR-043 + ADR-044 accepted (memory.db'de)
- ✅ Security Review 3/3 verdict yazıldı (GREEN/YELLOW/RED)
- ✅ Dogfood smoke 6/6 invariant PASS
- ❌ NO_GO: Task 1 (spurious NO_GO) veya Task 2 (docker) NO_GO → Sprint 164 (dep_pipeline wire) GECİKİR, fix retry öncelikli
