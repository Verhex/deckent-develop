# Analysis: src/orchestra/result-evaluator.ts
**Task ID:** 141-002 | **LoC:** 1085

## 1. Amaci
Task sonuçlarını değerlendirir: DONE/GO_WITH_TECH_DEBT/NO_GO kararları, rubrik bazlı değerlendirme, token kullanımı doğrulama, hata sınıflandırması (RUNTIME vs CODE), cascade kararları ve honesty check.

## 2. Public API (export listesi)
- `isBashUnavailable(result)` — Bash araç erişilebilirlik tespiti
- `isDocTask(task)` — doc-only task kontrolü
- `evaluateResult(result, task, vitestJsonOutput, coverageThreshold)` — legacy değerlendirme (@deprecated)
- `waitForResults(projectRoot, sprint, options)` — DI ile test edilebilir bekleme
- `SpawnTaskFn`, `KillWorkerFn`, `ReadJsonFn`, `FileExistsFn`, `ResultWatcher`, `CreateResultWatcherFn`, `WaitableSprint`, `WaitForResultsOptions` interfaces
- `RecentSprintStats` interface, `getRecentSprintStats(projectRoot, lookback)` — adaptive thresholds için
- `aggregateTokenUsage(results)` — token toplam hesaplama
- `DEFAULT_RUBRIC`, `scoreCorrectness`, `scoreTestCoverage`, `scoreScopeCompliance`, `scoreDocumentation`
- `evaluateWithRubric(result, task, rubric?)` → `EvaluationResult`
- `TECH_DEBT_DOWNGRADE_DONE_THRESHOLD`, `TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD`
- `TechDebtDowngradeResult`, `applyTechDebtDowngrade(originalDecision, result, verifyDeltaCompletionRatio?)`
- `TokenUsageValidationResult`, `validateTokenUsage(result)`
- `HONESTY_VIOLATION`, `GO_WITH_GATE_FAILURE`, `HONESTY_VIOLATION_NO_VERIFY_MARKER`
- `FailureCategory`, `FailureContext`, `FailureClassification`, `classifyFailure(ctx)`
- `CascadeDecision`, `decideCascadeAction(taskId, ctx)`
- `checkVerifyMarkerHonesty(projectRoot, taskId, notes)`
- Re-exports: `containsHonestyTrigger`, `checkWorkerHonesty`, `HonestyCheckResult`, `TestBaseline`, `BaselineComparison` (baseline-tracker.js)
- Re-exports: `CODE_VERIFIED_DONE`, `tryCodeVerifiedDone`, `writeCodeVerifiedResult`, `parseEvidenceCommand` (../monitor/auditor.js)

## 3. Ic + Dis Bagimliliklar
- **İç:** ./coverage-validator.js, ./baseline-tracker.js
- **Dış:** ../core/types.js, ../core/constants.js, ../core/utils.js, **../monitor/auditor.js** (re-export)
- **Node:** node:fs/promises, node:path

## 4. Complexity
En büyük modüllerden biri. `classifyFailure`: RUNTIME + CODE regex scan, cyclomatic ~8. `evaluateWithRubric`: criterion loop, cyclomatic ~6. `evaluateResult` (deprecated): step chain, cyclomatic ~12. `waitForResults` (DI): watcher loop, cyclomatic ~10. Toplam: ~60.

## 5. Type Safety
- `const parsed = JSON.parse(cleaned) as unknown` → zod ile parse — SAFE.
- `result.rubricScores!` — filter guard'lı, SAFE.
- `result as { selfAssessment: string; ... }` olmaksızın generic typing.
- Hiç `@ts-ignore` yok.

## 6. ADR Compliance
- **ADR-005 (Sync I/O) — DEPRECATED:** Async `readFile`, `readdir`, `stat` kullanıyor — GOOD.
- **ADR-006:** `evaluateResult` kodunda spawnSync yok.
- **ADR-040:** Memory V2 ile doğrudan ilişki yok — pure evaluation logic.
- `evaluateResult` @deprecated işaretlenmiş — `evaluateWithRubric` önerilen.

## 7. Test Coverage
- `tests/orchestra/result-evaluator.test.ts` mevcut beklenir.
- `classifyFailure` için her pattern test edilmeli.
- `applyTechDebtDowngrade` threshold davranışı kritik.

## 8. TODO/FIXME/HACK inventory
- `@deprecated Use evaluateWithRubric() instead.` — evaluateResult deprecated ama hâlâ kullanılıyor.

## 9. Dead Code Candidates
- `evaluateResult` @deprecated ama sprint-controller.ts'de hâlâ export ediliyor. Sprint 142'de kaldırılabilir.
- `WaitForResultsOptions.buildPrompt` — result-collector.ts'e taşınmış; hâlâ bu interface'de.

## 10. Security Findings
- `RUNTIME_PATTERNS` / `CODE_PATTERNS` regex'leri — ReDoS riski minimal (basit literal pattern'lar).
- `stat(markerPath)` — async, non-blocking.

## 11. Memory V2 Uyumu
Pure evaluation — doğrudan Memory V2 işlemi yok. `getRecentSprintStats` sprint log dosyalarını okuyor (V1 style file read), DB'den değil. Bu potansiyel bir V1 kalıntısı olabilir.

## 12. Oneriler
- `evaluateResult` kaldırılabilir (V2 rubric evaluation varsayılan hale geldiğinde).
- `getRecentSprintStats` DB-first pattern'a geçebilir (sprint metrics DB'de saklanıyorsa).
- `RUNTIME_PATTERNS` / `CODE_PATTERNS` regex'leri ayrı konfigürasyon dosyasında tutulabilir.

## 13. Verdict: ANALYZED
