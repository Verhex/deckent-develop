# Analysis: src/orchestra/index.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 109 | **Effort:** max

## 1. Amaci (detayli)
Orchestra modulunun public API barrel export dosyasi. cli/, mcp/ ve api/ tarafindan tuketilen sembolleri toplu olarak disa aktarir. Internal fonksiyonlar (modüller arasi dogrudan import ile kullanilan) burada export edilmez. Sprint lifecycle (runSprint, planSprint, cleanup), tmux backend, doc updater plugin API, routing engine v2 (OutcomeTracker, RuleEvolver, PromotionPipeline), prompt token optimizer ve ecosystem intelligence export'larini icerir.

## 2. Public API
Barrel export — tum public API'yi dokumante eder:
- **Tmux Backend** (10 export): isSessionActive, ensureSession, spawnWorker, killWorker, attach, destroy, setupWatchWindow, createWatchLayout, attachToWorkerPane, TmuxError + SpawnOptions type
- **Brain API** (9 export): BrainError, readContext, planSprint, confirmDraftTasks, cleanupDraftTasks, buildWorkerPrompt, cleanup, runSprint, finalizeSprint, runDecay + 5 type exports
- **Doc Updater** (2 func + 3 type): registerUpdater, runAllUpdaters, DocUpdater, DocUpdateContext, DocUpdateResult
- **Routing Engine v2** (6 class + 3 func + 4 type): OutcomeTracker, RuleEvolver, PromotionPipeline, MidSprintAdapter, assessQuality, assessSkillRelevance, generateProjectConventionsSkill, generateDataDrivenSkills
- **Prompt Token Optimizer** (3 func): filterSkillPrompts, filterSkillPromptsByDNA, computeSkillRelevance
- **Ecosystem Intelligence** (2 func): analyzeNewSkill, persistSkillActivation

## 3. Ic Bagimliliklar (re-export kaynaklari)
- `./tmux.js` — tmux fonksiyonlari
- `./brain.js` — brain lifecycle
- `../core/types.js` — BrainContext, ProjectState, vs.
- `./sprint-controller.js` — RunSprintOptions type
- `./doc-updaters/index.js` — doc updater API
- `./outcome-tracker.js` — OutcomeTracker
- `./quality-assessor.js` — assessQuality
- `./rule-evolver.js` — RuleEvolver
- `./promotion-pipeline.js` — PromotionPipeline
- `./mid-sprint-adapter.js` — MidSprintAdapter
- `./temp-skill-generator.js` — skill generation
- `./prompt-token-optimizer.js` — prompt filtreleme
- `./ecosystem-intelligence.js` — skill aktivasyon analizi
- Dongusel bagimllik: YOK (barrel sadece re-export)

## 4. Dis Bagimliliklar
- YOK (barrel)
- ADR-010: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 0 (sadece re-export)
- Max cyclomatic: 0
- Cok basit — sadece export/import ifadeleri

## 6. Type Safety
- Re-export — tip guvenligi kaynak modullere bagimli
- `export type` kullanimi dogru (tip-only exportlar icin)

## 7. ADR Compliance
- ADR-008 brain import: UYUMLU (barrel, brain.js'den re-export)
- ADR-022 CLI/MCP parity: Bu barrel CLI ve MCP icin ortak API sagliyor — UYUMLU

## 8. Test Coverage
- Barrel export icin ayri test dosyasi: YOK — ama export edilen modullerin kendi testleri var
- Edge case: N/A (barrel)

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
Eksik export'lar (orchestra/ icinde olup index.ts'den export edilmeyen moduller):
- **multi-agent.ts** — definePipeline, runPipeline — EXPORT YOK
- **pattern-reader.ts** — PatternReader — EXPORT YOK
- **pattern-recorder.ts** — PatternRecorder, LearningEntry — EXPORT YOK
- **shared-memory.ts** — SharedMemory — EXPORT YOK
- **rollback.ts** — createSafetyPoint, rollback, vs. — EXPORT YOK
- **model-selector.ts** — resolveTaskModel, calculateModelScore — EXPORT YOK

Bu modullerin cogu orchestra/ icinden dogrudan import ediliyor — barrel'dan gecmeden. Bu intentional ama dokumante edilmeli.

Fazla export kontrolu:
- Tum mevcut exportlar aktif kullaniliyor (cli/, mcp/, api/ tarafindan)

## 11. Security
- N/A (barrel)

## 12. Memory V2 Uyumu
- N/A (barrel)

## 13. i18n
- N/A (barrel)

## 14. Dokumantasyon Tutarliligi
- Dosya basindaki yorum blogu (sat 1-40) detayli ve DOGRU — hangi fonksiyon nerede kullaniliyor listelenmis
- PUBLIC API SURFACE, Internal vs Public ayirimi acik
- Sat 9-10: "This barrel exports ONLY the symbols consumed by cli/, mcp/, and api/" — DOGRU

## 15. Performance
- Barrel import — tree-shaking icin dezavantajli olabilir ama runtime overhead minimal
- Hot path: N/A

## 16. Oneriler
- **P2:** Dokumantasyon: barrel'dan export edilmeyen ama orchestra/ icinden dogrudan import edilen modulleri (internal) listelemeli
- **P3:** generateTempAgents export eksik — eger dis kullanim varsa eklenmeli
- **P3:** multi-agent, shared-memory gibi modullerin dis kullaniminin olup olmadigini kontrol et — gereksizse `@internal` olarak isaretlemeli

## Verdict: ANALYZED
