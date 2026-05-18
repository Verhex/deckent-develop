# Analysis: src/orchestra/sprint-estimator.ts
**Task ID:** 140-002 | **LoC:** 278

## 1. Amaci
Heuristic tabanlı sprint süre tahmini. Task karmaşıklık skoru (model, effort, scope), paralellik faktörü (sqrt algoritması), ve geçmiş sprint verisi (%70/%30 ağırlıklı blend) ile sprint süresini dakika cinsinden hesaplar. Dashboard'a entegre eder.

## 2. Public API
- `interface TaskComplexityScore` — taskId, baseMin, effortMin, scopeMin, totalMin
- `interface SprintEstimate` — estimatedMin, taskScores, serialTotalMin, parallelismFactor, historicalAvgMin, ...
- `scoreTaskComplexity(task: Task): TaskComplexityScore`
- `calculateParallelismFactor(workers): number`
- `parseSprintDurationFromLog(content): number | null`
- `readHistoricalDurations(projectRoot, limit?): number[]`
- `average(values): number`
- `estimateSprintDuration(tasks, workers, projectRoot?): number`
- `estimateSprintFull(tasks, workers, projectRoot?): SprintEstimate`
- `writeEstimateToDashboard(projectRoot, estimate): void`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../core/types.js` (Task)
- **Dis:** `../core/constants.js` (BRAIN_DIR, SPRINTS_DIR, DASHBOARD_FILE)
- **Dis:** `../core/utils.js` (debugLog)

## 4. Complexity
- 9 export fonksiyon, cyclomatic ~10 (parallelism hesap, history okuma döngüsü)
- Algorithm clean ve documented ✓

## 5. Type Safety
- Tip güvenli — `Record<string, number>` lookup ile fallback `?? 20` ✓
- `JSON.parse(raw) as Record<string, unknown>` — güvenli generic cast

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-008 (Brain Import):** core/ import, brain import yok ✓
- Historical data: `SPRINTS_DIR` dosyalarından okuyor — Memory V2 DB'den okunabilir ⚠️

## 7. Test Coverage
- `tests/orchestra/sprint-estimator.test.ts` kesinlikle bekleniyor
- `scoreTaskComplexity`, `calculateParallelismFactor`, `average` — pure, test için ideal

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- `readFileSync` sprint logları okuyor — güvenli (local .brain/sprints/) ✓

## 11. Memory V2 Uyumu
- `readHistoricalDurations`: `.brain/sprints/*.md` dosyalarını okuyor — Memory V2 DB'de `type: 'retro'` kayıtlarından sorgulanabilir
- Sprint log parse için `parseSprintDurationFromLog` regex — DB'ye geçince gereksiz kalır

## 12. Oneriler
- Sprint 142: `readHistoricalDurations` → `store.searchMemory({ type: ['retro'], sprint_range: { min: currentSprint - 3 } })` kullan

## 13. Verdict: ANALYZED
