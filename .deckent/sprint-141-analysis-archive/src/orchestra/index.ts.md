# Analysis: src/orchestra/index.ts
**Task ID:** 141-002 | **LoC:** 110

## 1. Amaci
`orchestra/index.ts` modülün public API barrel'ıdır. Yalnızca `cli/`, `mcp/` ve `api/` tarafından tüketilen sembolleri dışa aktarır; internal fonksiyonlar yeniden export edilmez.

## 2. Public API (export listesi)
- Tmux API: `isSessionActive`, `ensureSession`, `spawnWorker`, `killWorker`, `attach`, `destroy`, `setupWatchWindow`, `createWatchLayout`, `attachToWorkerPane`, `TmuxError`, `SpawnOptions`
- Brain API: `BrainError`, `readContext`, `planSprint`, `confirmDraftTasks`, `cleanupDraftTasks`, `buildWorkerPrompt`, `cleanup`, `runSprint`, `finalizeSprint`, `runDecay`
- Types: `BrainContext`, `ProjectState`, `SprintSizeRecommendation`, `PlannerResult`, `PlannerTask`, `BrainPlanningMode`, `SprintResult`, `CreateTaskParams`, `RunDecayOptions`, `FinalizeSprintOptions`, `RunSprintOptions`
- Doc Updater plugin API: `registerUpdater`, `runAllUpdaters`, `DocUpdater`, `DocUpdateContext`, `DocUpdateResult`
- Routing Engine: `OutcomeTracker`, `assessQuality`, `assessSkillRelevance`, `RuleEvolver`, `PromotionPipeline`, `MidSprintAdapter`, `generateProjectConventionsSkill`, `generateDataDrivenSkills`
- Prompt Token Optimizer: `filterSkillPrompts`, `filterSkillPromptsByDNA`, `computeSkillRelevance`
- Ecosystem Intelligence: `analyzeNewSkill`, `persistSkillActivation`

## 3. Ic + Dis Bagimliliklar
- **İç:** tmux.js, brain.js, sprint-controller.js, doc-updaters/index.js, outcome-tracker.js, quality-assessor.js, rule-evolver.js, promotion-pipeline.js, mid-sprint-adapter.js, temp-skill-generator.js, prompt-token-optimizer.js, ecosystem-intelligence.js
- **Dış:** ../core/types.js

## 4. Complexity
Re-export barrel — sıfır implementasyon. ADR-008 uyumlu public API sınırı.

## 5. Type Safety
Tip-safe barrel. `any` yok, assertion yok.

## 6. ADR Compliance
- **ADR-008:** COMPLIANT — orchestra/ modülü için tek dışa aktarım noktası.
- **ADR-022 (CLI/MCP Feature Parity):** Bu barrel her iki ortama da aynı API'yi sunuyor; parity tutulmuş.

## 7. Test Coverage
Re-export olarak test gerekmez; implementasyon testleri sub-modüllerde.

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`OutcomeTracker` — routing v2'de aktif; v1 projelerinde kullanılmıyor olabilir.

## 10. Security Findings
Yok.

## 11. Memory V2 Uyumu
`runDecay` DB-first (debt-manager) fonksiyonu export ediliyor. Doğrudan DB işlemi yok.

## 12. Oneriler
- `generateDataDrivenSkills` fonksiyonunun kullanım durumu belirsiz; Sprint 142'de dead-code analizi yapılabilir.

## 13. Verdict: ANALYZED
