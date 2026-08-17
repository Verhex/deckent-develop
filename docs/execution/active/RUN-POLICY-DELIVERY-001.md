# Outcome Capsule — RUN-POLICY-DELIVERY-001 (Paket B)

OUTCOME_ID: RUN-POLICY-DELIVERY-001
DOGFOOD_MODE: OFF (kayıt — authority DEĞİL; aktif mode = host DECKENT-DEV-CONTROL bloğu)
OWNER_DECISION_REF: Alperen 2026-08-17 onay (c) — ürün kodu olarak; + owner-live-2026-08-17-direct-main (direct-main, remote CI advisory)
BASE_SHA: abf3892d1 (post PHASE-1 governance commit)
BRANCH: main (WORKSPACE_MODE=MAIN — doğrudan root checkout)
MODE: implement

## Allowed mutations (gerçek kapsam — ana paket + correction + correction-2 ile LANDED)
- `src/core/task-types.ts` (RunPolicyPlanAuthority + create + result evidence)
- `src/core/task-result-schema.ts` (runPolicyEvidence şeması)
- `src/core/task-result-settlement.ts` (settleRunPolicyResultEvidence)
- `src/orchestra/run-policy-resolver.ts` (yeni plan-time producer)
- `src/orchestra/sprint-planner.ts` (choke-point stamp — correction-2 ile İLK task-JSON
  persistence'ının ÖNCESİNE taşındı)
- `src/orchestra/debt-manager.ts` (FIX inheritance ×2)
- `src/orchestra/prompt-god-template.ts` (task-carried consumer; ctx-injection kaldırıldı)
- `src/orchestra/task-builder.ts` (fail-soft compile-observation jsonl satırı + dürüst adlandırma)
- `src/orchestra/result-evaluator.ts` (üç terminal producer'da içselleştirilmiş parity gate:
  grader wrapper + reconcile wrapper + reconstruction kuyruğu; idempotent)
- `src/orchestra/sprint-finalizer.ts` (correction-2: `enforceRunPolicyParityOnTerminalInputs`
  terminal-convergence veto'su — standard/test-mode/CLI-finalize/checkpoint-recovery tek giriş)
- `src/orchestra/sprint-phases.ts` + `src/orchestra/autonomous/backlog-eval.ts` (dış wrap'lerin
  geri alınması + boundary işaret yorumları)
- Testler: `tests/core/run-policy-authority.test.ts` · `tests/orchestra/run-policy-delivery.test.ts`
  · `tests/orchestra/run-policy-plan-persistence.test.ts` (yeni, gerçek planSprint+fs adapter)
  · `tests/orchestra/prompt-run-policy-authority.test.ts` (486-017 suite'inin task-carried migrasyonu)
- Regen/baseline: PLATFORM.md, hermeticity baselines (atıflı realign'lar), README stats,
  MASTER 7140 evidence + projections, bu capsule
- **Bu noktadan sonra runtime source FROZEN (owner talimatı) — yalnız canary/docs**

## Explicit exclusions (owner brief)
- CI taxonomy / merge-group / Shards workflow tamiri — owner kararıyla bu phase'den ÇIKARILDI
- DOGFOOD_MODE=ON flip / canary başlatma — YALNIZ Alperen'in açık ON kararıyla (CANARY_READY gate)
- Literal DOGFOOD_MODE'un customer product feature yapılması
- Runtime DB/evidence cleanup; private PEM

## Verification manifest (correction-2 sonrası gerçek komutlar)
- `VITEST_MAX_FORKS=2 npx vitest run tests/core/run-policy-authority.test.ts tests/orchestra/run-policy-delivery.test.ts tests/orchestra/run-policy-plan-persistence.test.ts tests/orchestra/prompt-run-policy-authority.test.ts --pool=forks` → **44/44**
- `VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/ --pool=forks` → 686/686 dosya, 9169 test, exit 0
- `npx tsc --noEmit` → 0 hata
- `npm run lint:gates` → 16/16 (hermeticity atıflı realign dahil)
- Sprint yokken `npm run build` → yeşil; source↔dist davranışsal kimlik: compiled dist üzerinde
  `DIST-IDENTITY missing=NO_GO exact=DONE policyFree=DONE`
- Fresh host-adapter reconnect: stale MCP server'lar kapatıldı, taze server yeni dist'ten
  `deckent_doctor` cevapladı

## DONE
- Production chain gerçek: resolver → task persistence → compiler (task'tan) → provider-neutral
  byte-parity → worker digest echo kontratı → evaluator/settlement parity (typed HOLD) →
  best-effort compile observation jsonl (fail-soft; authoritative compile-evidence authority =
  MASTER 9024, enforcement = settlement parity zinciri)
- **Correction (owner analiz turu, 2026-08-17):** parity gate result-evaluator'ın ÜÇ terminal
  producer'ının içinde — `evaluateWithRubric` exported wrapper (D-1 verification fast-path +
  D-2 schema + tüm iç dönüşler), `reconcileEvaluationSpuriousNoGo` wrapper (recovery flip),
  `reconstructFromDurableEvidence` kuyruğu (rubric-fault) — downstream caller/mock gate'i soyamaz.
- **Correction-2 (owner talimatı, 2026-08-17):** (a) run-policy snapshot'ı planSprint içinde İLK
  task-JSON persistence'ından ÖNCE stamp'lenir — disk'teki task worker'ın gördüğüdür; gerçek
  planSprint→tmpdir persistence testiyle kanıtlı. (b) Finalize tarafı:
  `buildFinalizerTerminalTruth` girişindeki `enforceRunPolicyParityOnTerminalInputs` veto'su —
  standard finalize, test-mode receipt, CLI `deckent finalize` ve completed-checkpoint recovery
  bu TEK convergence'tan geçer; evaluationDecision/selfAssessment-türevi DONE/GWT claim'leri
  missing/mismatch/tampered evidence ile terminal olamaz (7-case attempt-authority matrisi:
  missing/mismatch/GWT/tamper ⇒ NO_GO; exact/policy-free/FIX-exact ⇒ korunur).
- FIX/retry attempt'leri identical digest taşır; tamper fail-closed
- LOCAL_VERIFIED battery yeşil; direct-main push
- **CANARY PASS (owner kararı, 2026-08-17 — sprint-537):** Alperen'in açık ON kararıyla
  `DOGFOOD_MODE=ON` (gate kanıtı: twin parity + control digest `edf73a2851…f75c85f`);
  A′/ADR-D-007 bounded recovery ile zero-task terminal-publication fail-closed kapatıldı
  (`d47e69c08`). Canlı zincir disk-kanıtlı: task-537-001 `runPolicy.policyDigest` = owner-pin
  `54754a6bc806ef89ef7fd0e3f07411b8f4bfec5c2bb5d36b8abfb4bdeca3a989` → docker'daki gerçek
  gpt-5.6-sol worker'ı `.result.runPolicyEvidence`'ta AYNI digest'i echo'ladı → finalizer
  convergence GWT claim'ini yalnız exact evidence ile geçirdi → terminal receipt COMPLETE
  (logicalTaskCount=1, holds=[], cleanupEligibility CANDIDATE) → `CANARY-NOTE.md` tek gerekli
  satırla oluştu; advisory compile-observation jsonl satırı mevcut. Verdict GO_WITH_TECH_DEBT
  policy-DIŞI rubrik sınıfından (doc-task coverage). Owner PASS ile `DOGFOOD_HEALTH=DEGRADED`
  ilanı kalktı. MASTER 7140 state flip'i ve capsule silinmesi Phase-5 writer kurulana dek
  YAPILMAZ (owner talimatı) — bu blok o kapanışın evidence kaydıdır.

## Stop conditions
- Owner gate: CANARY_READY sonrası ON kararı yalnız Alperen'den
- Scope dışı zorunlu değişiklik → exact eksik authority raporu
- 🔒 Yasa/ADR çelişkisi → typed HOLD + amendment önerisi
