# Analysis: src/orchestra/sprint-finalizer.ts
**Task ID:** 141-002 | **LoC:** 1073

## 1. Amaci
Sprint sonrası tüm finalizasyon eylemlerini yönetir: metrik hesaplama, sprint log yazma, RETRO.md güncelleme, PROJECT-IDENTITY.md, decay, plugin hooks, adaptive thresholds, arşivleme ve self-audit gate. Event stream entegrasyonu var.

## 2. Public API (export listesi)
- `runHonestyCheck(projectRoot, sprintId, results)` — dürüstlük ihlali kontrolü (stub)
- `writeRubricDetail(projectRoot, sprintId, results, evaluations)` — RETRO.md'ye rubrik tablosu ekler
- `SelfAuditResult`, `SelfAuditGateOptions` interfaces
- `runSelfAuditGate(sprintId, projectRoot, options)` — tsc + vitest + honesty + observability gate
- `applyGateStatus(currentStatus, gate)` — gate başarısızlığını sprint durumuna yansıtır
- `applyAdaptiveThresholds(projectRoot, config)` — agent_min_score ve coverage_threshold auto-adjust
- `FinalizeSprintOptions` interface
- `finalizeSprint(projectRoot, sprint, evaluations, results, opts)` — ana fonksiyon

## 3. Ic + Dis Bagimliliklar
- **İç:** ./sprint-reporter.js, ./sprint-docs-updater.js, ./result-evaluator.js, ./baseline-tracker.js, ./result-collector.js, ./debt-manager.js, ./outcome-tracker.js, ./quality-assessor.js, ./rule-evolver.js, ./promotion-pipeline.js, ./event-stream.js
- **Dış:** ../core/utils.js, ../core/constants.js, ../core/types.js, ../core/observability.js, ../core/agent-pool.js, ../core/skill-pool.js, ../core/plugin-hooks.js, ../cli/helpers/sprint-summary-rich.js, **../monitor/auditor.js**
- **Node:** node:fs (sync + promises), node:path, node:child_process

## 4. Complexity
`finalizeSprint`: ~590 LoC, 13+ step, cyclomatic ~40. En karmaşık modüldür. `runSelfAuditGate`: ~150 LoC, 4 step, cyclomatic ~10. `applyAdaptiveThresholds`: ~60 LoC.

## 5. Type Safety
- `sprint.status = newStatus as Sprint['status']` — unsafe cast. `SprintStatus` enum kullanılmalı.
- `const rawConfig = opts?.config as Record<string, unknown>` — type cast (ResolvedConfig → Record) gerekiyor ama tehlikeli.
- `(task.routingMeta?.taskDNA ?? { ... }) as TaskDNA` — long inline default + cast.

## 6. ADR Compliance
- **ADR-040 (Memory V2):** PARTIAL COMPLIANT — `writeRetrospective` çağrısı DB dual-write yapıyor. `parseDebtTable(debtContent)` kullanımı var (line ~553) — bu V1 parse fonksiyonu! `DEBT.md` dosyasından parse ediliyor. Bu bir V1 kalıntısı.
- **ADR-035 (Event Stream):** COMPLIANT — writeEvent ile SPRINT_PHASE_CHANGE, METRIC_EMITTED, GATE_COMPUTED, LOAD_REPORT_WRITTEN olayları yayımlıyor.
- **ADR-037 (RBAC):** PARTIAL — finalizeSprint brain rolü adına davranıyor ama authority check yok.
- **ADR-005 (Sync I/O):** `readFileSync`, `writeFileSync` kullanımı var (sprint-phases.ts'te) — async fs.promises çoğunlukla kullanılıyor ama karışık.

## 7. Test Coverage
- `tests/orchestra/sprint-finalizer.test.ts` mevcut beklenir.
- `runSelfAuditGate` test edilebilir (DI options ile).
- `finalizeSprint` entegrasyon testleri gerekiyor.

## 8. TODO/FIXME/HACK inventory
- `// Stub — Task 5 (baseline-tracker) will implement comparison logic.` — `runHonestyCheck` hâlâ stub!
- `// NOTE: This module and sprint-controller.ts form a safe circular dependency` — sprint-phases.ts'e atıf

## 9. Dead Code Candidates
- `runHonestyCheck` stub implementasyon — kullanılıyor ama içi boş.

## 10. Security Findings
- `spawnSync('git', ['diff', '--stat', 'HEAD~1'], ...)` — güvenli, cwd ile.
- `spawnSync('npx', ['tsc', '--noEmit'], ...)` — `spawnSync` ADR-006 kapsamında.

## 11. Memory V2 Uyumu
PARTIAL: `writeRetrospective` DB dual-write yapıyor (GOOD). Ancak `parseDebtTable(debtContent)` ile `DEBT.md` dosyasından V1 parse hâlâ yapılıyor (line ~551-553) — bu açık bir V1 kalıntısıdır. `auditBrainBudget` DB-first (GOOD). `runDecay` DB-first (GOOD).

**KRITIK BULGU:** `finalizeSprint` line ~551: `const debtContent = await fsPromises.readFile(join(projectRoot, BRAIN_DIR, DEBT_FILE), 'utf-8').catch(() => '')` ardından `parseDebtTable(debtContent)` — bu V1 DEBT.md parse. V2'de debt DB'de; DEBT.md artık export. Bu satır DB-first pattern'ı ihlal ediyor.

## 12. Oneriler
- `parseDebtTable(debtContent)` çağrısını `store.getByType('debt')` ile değiştirmek gerekiyor.
- `runHonestyCheck` stub tamamlanmalı.
- `sprint.status as Sprint['status']` unsafe cast düzeltilmeli.
- `finalizeSprint` fonksiyonu daha küçük step fonksiyonlarına bölünebilir.

## 13. Verdict: ANALYZED
