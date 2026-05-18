# Analysis: src/orchestra/sprint-controller.ts
**Task ID:** 141-002 | **LoC:** 499

## 1. Amaci
Sprint'in tam yaşam döngüsünü (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP) orkestre eden ince katmandır. Sprint 136'da 1894 LoC'tan 499'a indirilmiştir; tüm faz fonksiyonları sub-modüllere taşınmıştır.

## 2. Public API (export listesi)
- `waitForResults(projectRoot, sprint, timeoutMs, queue, spawnOpts)` — sonuç dosyalarını bekler
- `evaluateResult(result, task, vitestJsonOutput, coverageThreshold)` — DONE/GO_WITH_TECH_DEBT/NO_GO kararı
- `runSprint(projectRoot, config, opts)` — tam sprint lifecycle
- `RunSprintOptions` interface
- Re-exports: sprint-planner.ts, sprint-spawner.ts, sprint-lifecycle.ts, sprint-utils.ts, result-collector.ts, ipc-registry.ts, sprint-finalizer.ts, parallel-pipeline.ts

## 3. Ic + Dis Bagimliliklar
- **İç (direct):** sprint-planner.js, sprint-spawner.js, sprint-lifecycle.js, sprint-phases.js, result-collector.js, coverage-validator.js, baseline-tracker.js, sprint-pid-manager.js, ipc-registry.js, spawn-backend.js, connector.js
- **Dış:** ../core/types.js, ../core/constants.js, ../core/utils.js, ../core/provider.js, ../core/multi-ide.js, ../core/observability.js, ../core/plugin-hooks.js, ../monitor/auditor.js

## 4. Complexity
`runSprint` fonksiyonu: ~370 LoC, cyclomatic complexity ~25+. Faz geçişleri try/catch ile sarılmış. Grace period, checkpoint, PID yönetimi iç içe.

## 5. Type Safety
- `sprint.status = newStatus as Sprint['status']` satırı unsafe cast (line ~865)
- `rawConfig?.['output_mode'] as string` cast mevcut
- Non-null assertion: `results[existingIdx] = syntheticResult` — existingIdx kontrolü yapılıyor ama `sprint.tasks.map(t => t.id)` ile potansiyel `undefined` erişimi var

## 6. ADR Compliance
- **ADR-006 (spawnSync Security):** `readFile`, `writeFile`, `stat` async — COMPLIANT. tmux.js aracılığıyla spawnSync kullanımı izole edilmiş.
- **ADR-008 (Brain Merkezi Import):** COMPLIANT — auditor doğrudan import edilmiş ama bu brain modülü içinde.
- **ADR-037 (RBAC):** PARTIAL — authority-enforcer.ts kullanımı yok; faz geçişleri sırasında kapsam denetimi yapılmıyor.
- **ADR-040 (Memory V2):** COMPLIANT — runDecay DB-first.

## 7. Test Coverage
- `tests/orchestra/sprint-controller.test.ts` mevcut beklenir.
- Grace period ve checkpoint mantığı test güçlüğü yaratabilir.

## 8. TODO/FIXME/HACK inventory
- Line 9: "NOTE: This module and sprint-controller.ts form a safe circular dependency" — sprint-phases.ts'e referans

## 9. Dead Code Candidates
`evaluateResult` burada tekrar tanımlanmış; `result-evaluator.ts`'de de var. Duplicate gibi görünüyor — iki farklı versiyon mevcut.

## 10. Security Findings
- `spawnBackend.kill(task.id)` grace period sırasında çağrılıyor — kill edilmeden önce yeterli süre bekleniyor.
- Snapshot'ta metricsPath okuma hatası sessizce yutulmuş — non-fatal, ancak observability kaybı.

## 11. Memory V2 Uyumu
`runDecay` (debt-manager.js) çağrısı DB-first. Doğrudan MEMORY.md veya DECISIONS.md parse etme yok.

## 12. Oneriler
- `runSprint` fonksiyonunu daha fazla faza bölmek (özellikle grace period ve checkpoint kısımları) test edilebilirliği artırır.
- `sprint.status as Sprint['status']` unsafe cast'i `SprintStatus` enum ile temizlenmeli.
- `evaluateResult` duplicate tanımı — result-evaluator.ts'teki versiyon kullanılmalı.

## 13. Verdict: ANALYZED
