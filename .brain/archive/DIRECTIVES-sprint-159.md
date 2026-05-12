# DIRECTIVES — Sprint 157 (Brain Orchestra Hardening + EvaluationAuditTrail, T4 god-level)

> **Tema:** Sprint 156 dogfood'unun canlı kanıtladığı 3 major + 6 bonus bug'a kök çözümler. Brain "kara kutu" → şeffaf orchestra geçişi. EvaluationAuditTrail BU SPRINTIN EN KRİTİK üretimi — diğer fix'lerin forensic değeri buna bağlı.

## ⚠️ ANCHOR KURALLARI (HER TASK İÇİN ZORUNLU)

1. **BUILD YASAK:** `npm run build`, `npm install`, `npm publish`, `docker build`, proje geneli `tsc --noEmit`, proje geneli `vitest run` çağrılmaz. Build = Alperen kararı.
2. **TEST İZOLE:** Worker sadece kendi yazdığı test için `npx vitest run path/to/file.test.ts`.
3. **VERIFY ONLY:** Worker selfAssessment DONE der, Brain karar verir.
4. **SCOPE İZOLE:** Description'larda örnek path verme. Sadece gerçek filesWrite.
5. **ATOMIC TASKS:** Her task tek bir effect, composite YASAK.
6. **CODE BLOCKS PRESERVE:** Mevcut working kod silinmez, sadece eklenir/değiştirilir.

---

## Task 1: EvaluationAuditTrail Foundation
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/evaluation-audit-trail.ts, tests/orchestra/evaluation-audit-trail.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Yeni dosya `src/orchestra/evaluation-audit-trail.ts`. `writeEvaluationAudit(projectRoot, sprintId, taskId, attemptNum, evalResult)` fonksiyonu `.deckent/evaluations/<sprintId>/<taskId>-attempt-<N>.json` yazar. Schema: timestamp + taskId + sprintId + evaluator (brain) + ruleSet (CODE/AUDIT/DOC_WRITE) + schemaValidation {valid, missingFields, coverageRelaxed} + criterionScores [{name, score, threshold, weight, passed, reason}] + totalScore + decision + decisionRationale (human-readable). Path constant `EVALUATIONS_DIR` core/constants.ts'a eklenir. Test: 5 senaryo (audit/doc-write/code rubric çıktısı + decision rationale formatı + multi-attempt overwrite).

---

## Task 2: Dual-Evaluator Race Close (Bug X)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/evaluate-phase-idempotency.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`runEvaluatePhase` mutex/idempotency. Phase guard ekle: aynı sprint için runEvaluatePhase tekrar çağrılırsa second call no-op (early return). `.deckent/sprint-NNN-evaluate-lock` file (PID-bound). Race trigger root cause araştır (fix_phase_timeout batch trigger vs reconcile path). Test: 2 paralel runEvaluatePhase çağrısı, ikincisi NO_OP, single result set.

---

## Task 3: Sprint-Stall Fix-Fix Spawn Loop
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-phases.ts, src/core/config.ts, tests/orchestra/fix-recursion.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
`runFixPhase` recursion. `max_fix_retries` config (default 2) artık runtime'da AKTİF: FIX phase sonrası eğer yeni fix-fix.json definition varsa AND `attempt_count < max_fix_retries` ise runFixPhase tekrar çağrılır. Aksi halde phase RETRO'ya geçer + `fix_retries_exhausted` event emit. Test: fix-of-fix recursion 2 derinliğe kadar, sonra retro.

---

## Task 4: handleEvaluation → updateTaskStatus Wire
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/debt-manager.ts, src/orchestra/sprint-phases.ts, tests/orchestra/task-status-update.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`handleEvaluation(task, evaluation, result)` içinde fix workers ve orig workers için her durumda `updateTaskStatus(taskId, TaskStatus.DONE | GO_WITH_TECH_DEBT | NO_GO)` çağrılsın. Mevcut: sadece NO_GO yolunda updateTaskStatus(NO_GO) çağrılıyor, DONE/TECH_DEBT path'lerinde unutulmuş. Test: orig task DONE → status updated, fix task DONE → status updated, both paths.

---

## Task 5: Heartbeat Write Atomicity
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/hb-atomic-write.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
HB write atomic pattern: önce `.hb.tmp` yaz, sonra `rename .hb.tmp .hb`. POSIX rename atomic. Concurrent multi-writer'a karşı: HB writer single-PID, başka process yazmaya çalışırsa lock fail. Test: 2 concurrent HB write simulation, atomic visibility check.

---

## Task 6: sprint-state.json Phase Transition Update
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, src/orchestra/sprint-state-manager.ts, tests/orchestra/sprint-state-update.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`SPRINT_PHASE_CHANGE` event yayınlandığında sprint-state.json `phase` + `updatedAt` field'ları write edilir. Mevcut: sprint başlangıcında bir kez yazılıyor, sonra freeze. Yeni: phase her değiştiğinde update. `sprint-state-manager.ts` yeni dosya — read/write encapsulate. Test: 3 phase transition (EXECUTE→EVALUATE→RETRO→CLEANUP) → state.json 3 update.

---

## Task 7: scoreTestCoverage null Neutral Score
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/coverage-null-neutral.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`scoreTestCoverage(result, task)` fonksiyonu task parametresi alsın (mevcut: yok). `coverageOptional(task)` true ise `coverage:null` → neutral score 75 + passed:true + reason "N/A for this task type". Math.min(null,100)=0 patolojisi son bulur. Test: doc-write coverage:null → 75, code coverage:null → schema fail OK, code coverage:0 → 0 (existing behavior).

---

## Task 8: AUDIT_RUBRIC Dinamik Threshold
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/rubric-registry.ts, tests/orchestra/audit-rubric-dynamic.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
AUDIT_RUBRIC threshold'ları task scope büyüklüğüne göre dinamik. Yeni: `getAuditThresholds(task)` fonksiyonu — task.scope.filesWrite uzunluğu + description uzunluğuna göre small/medium/large bucket. Small: finding_count threshold 20 (1 finding yeter), citation 30. Large: finding 70+, citation 70+. workflow-verify gibi küçük audit'ler small bucket'a düşer. Test: small audit + medium audit + large audit threshold farklılığı.

---

## Task 9: Retro Naming Off-By-One Fix
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/sprint-lifecycle.ts, tests/orchestra/retro-naming.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`retro-sprint-N.md` GERÇEKTEN sprint N retro'sunu içersin. Mevcut bug: sprint N CLEANUP'ında write yapılırken filename sprint N+1 alıyor (off-by-one). Naming: `retro-sprint-${sprint.id}.md` (sprint.id current sprint). Test: sprint 200 CLEANUP → retro-sprint-200.md sprint 200 metrikleri.

---

## Task 10: sprint-phases.ts cleanup 'spawn-fail' Argument
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/cleanup-spawn-fail.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
runSpawnPhase retry-failure callsite cleanup() çağrısı `'spawn-fail'` argument'le yapılsın (Sprint 156 156-004-fix out-of-scope note). Sprint 156'da CleanupPhaseKind type eklenmişti, caller hâlâ default 'sprint-end' geçiriyor. Fix: spawn-fail case'lerinde cleanup('spawn-fail') → tmpfiles preserve in-place. Test: spawn-fail simulate → tmpfiles archive YOK, in-place korundu.

---

## Task 11: DeckentConfig dependency_pipeline_enabled Field
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/core/config-types.ts, src/core/config.ts, tests/core/config-pipeline-type.test.ts
- Scope: src/core/, tests/core/

### Description
DeckentConfig type'a `dependency_pipeline_enabled?: boolean` field eklenir (config-types.ts:69-312 arası uygun yere). DeckentConfigWithPipeline alias kaldırılır + 3 `as DeckentConfigWithPipeline` cast'i config.ts'te native field kullanımıyla replace edilir. JSDoc Default: true (Sprint 156 history note). Test: type-level test (config build).

---

## Task 12: Per-Change Security Review
- Model: sonnet
- Effort: normal
- Skills: security-specialist, documentation-writer
- Files: docs/security/sprint-157-review.md
- Scope: docs/security/

### Description
Sprint 157 production task'ları (1-11) için per-change threat model + mitigation. EvaluationAuditTrail PII (notes) içerebilir — retention class belirtilmeli. HB atomic write race window kalıntısı analizi. ADR Lite style. ≥800 kelime.

---

## Task 13: 2 Yeni ADR Draft
- Model: sonnet
- Effort: normal
- Skills: system-architect, documentation-writer
- Files: docs/adr/061-evaluation-audit-trail-schema.md, docs/adr/062-hb-atomic-write-pattern.md
- Scope: docs/adr/

### Description
ADR-061 EvaluationAuditTrail Schema (MADR v3, proposed) — 5-layer schema rationale + storage hierarchy + GDPR retention + Hybrid Scoring katmanıyla uyum. ADR-062 HB Atomic Write Pattern (MADR v3, proposed) — POSIX rename atomicity + single-writer enforcement + lock fallback. Her ADR ≥600 kelime.

---

## Task 14: EvaluationAuditTrail E2E Smoke Test
- Model: opus
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/orchestra/evaluation-audit-trail-e2e.test.ts
- Scope: tests/orchestra/

### Description
End-to-end test: 5 mock task evaluate edilir (doc-write 2 + audit 1 + code 2). Her birinin `.deckent/evaluations/<sprint>/<task>.json` doğru yazıldığını + criterionScores breakdown'un decisionRationale ile uyumlu olduğunu doğrula. tmpdir kullan, cleanup. Test: 5 senaryo per task tipi.

---

## Task 15: Sprint 157 Retro + Bug Close Forensic
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-157/T-015-retro-bug-close.md
- Scope: docs/audits/sprint-157/

### Description
Sprint 157 retrospective: Sprint 156'nın canlı kanıtladığı 3 major + 6 bonus bug'ın close kanıtları. EvaluationAuditTrail Sprint 158+ baseline. Dogfood meta-evidence (Sprint 157 kendisi de Brain stuck olursa yeni `.deckent/evaluations/*.json`'da görünür). ≥500 kelime.
