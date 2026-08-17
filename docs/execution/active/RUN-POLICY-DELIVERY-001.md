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
  byte-parity → worker digest echo kontratı → evaluator/settlement parity (typed HOLD) → durable audit
- FIX/retry attempt'leri identical digest taşır; tamper fail-closed
- LOCAL_VERIFIED battery yeşil; direct-main push
- `CANARY_READY` raporu verildi ve Alperen'in ON kararı BEKLENIYOR (bu satır DONE'un parçası değil;
  canary terminal settlement'ı ON kararı sonrası ayrı kanıttır)

## Stop conditions
- Owner gate: CANARY_READY sonrası ON kararı yalnız Alperen'den
- Scope dışı zorunlu değişiklik → exact eksik authority raporu
- 🔒 Yasa/ADR çelişkisi → typed HOLD + amendment önerisi
