# Analysis: src/orchestra/sprint-phases.ts
**Task ID:** 140-002 | **LoC:** 622

## 1. Amaci
Sprint yaşam döngüsünün faz fonksiyonlarını içerir (PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP). `sprint-controller.ts` God Object Split Phase 1 (ADR-024) sonucu oluşturuldu. Her faz tek bir fonksiyonda encapsulate edilmiş — runSprint() ince orchestration katmanı olarak kalıyor.

## 2. Public API
- Sprint phase fonksiyonları: runPlan, runSpawn, runExecute, runEvaluate, runFix, runRetro, runDecay, runCleanup (tam isimler sprint-controller.ts'e göre değişebilir)

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../core/types.js` (TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, AlertLevel)
- **Dis:** `../core/utils.js` (readJsonSafe, parseDebtTable, debugLog)
- **Dis:** `../core/constants.js`, `../core/plugin-hooks.js`
- **Dis:** `../monitor/auditor.js` (updateDashboard, startScanLoop, writeScanToDashboard, runScanCycle)
- **Dis:** `./debt-manager.js`, `./result-evaluator.js`, `./rollback.js`
- **Dis:** `../core/agent-pool.js`, `../core/skill-pool.js`, `../core/stack-detector.js`
- **Dis:** `../cli/helpers/splash.js`, `./sprint-reporter.js`
- **Not:** sprint-controller.ts ile döngüsel bağımlılık mevcut — modül init'te değil, fonksiyon body'de çözümleniyor (güvenli)

## 4. Complexity
- 622 LoC, 8 faz fonksiyonu, cyclomatic toplam ~50+
- En karmaşık modüllerden biri — faz bazında bölünebilir

## 5. Type Safety
- `parseDebtTable` import: `core/utils.js`'ten — @deprecated mi? kontrol gerekli
- `readJsonSafe` generic kullanımı ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-024 (God Object Split):** sprint-controller.ts'den extract edilmiş ✓
- **ADR-038 Dead Code:** `parseDebtTable` import — deprecated mı?
- **Memory V2 İhlali:** DEBT_FILE dosya okuma kullanımı varsa kritik ⚠️

## 7. Test Coverage
- `tests/orchestra/sprint-phases.test.ts` bekleniyor — integration test ağır

## 8. TODO/FIXME/HACK inventory
- `// NOTE: This module and sprint-controller.ts form a safe circular dependency` — intentional

## 9. Dead Code Candidates
- `parseDebtTable` import kullanımı kontrol edilmeli

## 10. Security Findings
- `runHooks` çağrıları: user-defined plugin hook'ları — sandbox içinde çalışmalı

## 11. Memory V2 Uyumu
- Evaluate fazı: DEBT_FILE okuma varsa Memory V2 ihlali
- Decay fazı: `runDecay()` Memory V2 DB'de çalışıyor mu? debt-manager.ts analizi gerekli

## 12. Oneriler
- 622 LoC büyük — faz başına ayrı dosya düşünülebilir (Sprint 143+ öneri)

## 13. Verdict: ANALYZED (Memory V2 kontrol gerekli)
