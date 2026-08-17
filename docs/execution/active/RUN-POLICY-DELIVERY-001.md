# Outcome Capsule — RUN-POLICY-DELIVERY-001 (Paket B)

OUTCOME_ID: RUN-POLICY-DELIVERY-001
DOGFOOD_MODE: OFF (kayıt — authority DEĞİL; aktif mode = host DECKENT-DEV-CONTROL bloğu)
OWNER_DECISION_REF: Alperen 2026-08-17 onay (c) — ürün kodu olarak; + owner-live-2026-08-17-direct-main (direct-main, remote CI advisory)
BASE_SHA: abf3892d1 (post PHASE-1 governance commit)
BRANCH: main (WORKSPACE_MODE=MAIN — doğrudan root checkout)
MODE: implement

## Allowed mutations
- `src/core/task-types.ts` (RunPolicyPlanAuthority + create + result evidence)
- `src/core/task-result-schema.ts` (runPolicyEvidence şeması)
- `src/core/task-result-settlement.ts` (settleRunPolicyResultEvidence)
- `src/orchestra/run-policy-resolver.ts` (yeni plan-time producer)
- `src/orchestra/sprint-planner.ts` (tek choke-point stamp)
- `src/orchestra/debt-manager.ts` (FIX inheritance ×2)
- `src/orchestra/prompt-god-template.ts` (task-carried consumer; ctx-injection kaldırıldı)
- `src/orchestra/task-builder.ts` (execution-authority.jsonl audit satırı)
- `src/orchestra/result-evaluator.ts` (gateRunPolicyParityVerdict, evaluateWithRubric içinde)
- `tests/core/run-policy-authority.test.ts` + `tests/orchestra/run-policy-delivery.test.ts`
- Regen/baseline: PLATFORM.md, hermeticity baselines, README stats, MASTER 7140 evidence + projections

## Explicit exclusions (owner brief)
- CI taxonomy / merge-group / Shards workflow tamiri — owner kararıyla bu phase'den ÇIKARILDI
- DOGFOOD_MODE=ON flip / canary başlatma — YALNIZ Alperen'in açık ON kararıyla (CANARY_READY gate)
- Literal DOGFOOD_MODE'un customer product feature yapılması
- Runtime DB/evidence cleanup; private PEM

## Verification manifest
- `npx vitest run tests/core/run-policy-authority.test.ts tests/orchestra/run-policy-delivery.test.ts` → 20/20
- `tests/core/ + tests/orchestra/` regression ailesi → yeşil
- `npx tsc --noEmit` → 0 hata
- `npm run lint:gates` → yeşil (hermeticity realign dahil)
- Build + gerçek-binary kanıtı (canlı execution yokluğu doğrulanarak)

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
- `CANARY_READY` ancak bu correction + gerçek canary hazırlığı sonrası; Alperen'in açık ON kararı
  olmadan DOGFOOD_MODE değişmez

## Stop conditions
- Owner gate: CANARY_READY sonrası ON kararı yalnız Alperen'den
- Scope dışı zorunlu değişiklik → exact eksik authority raporu
- 🔒 Yasa/ADR çelişkisi → typed HOLD + amendment önerisi
