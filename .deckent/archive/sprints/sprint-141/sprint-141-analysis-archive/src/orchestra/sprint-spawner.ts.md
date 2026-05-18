# Analysis: src/orchestra/sprint-spawner.ts
**Task ID:** 140-002 | **LoC:** 799

## 1. Amaci
Worker spawn, rerouting, dependency scheduling ve collision detection orkestratörü. `sprint-controller.ts` God Object Split sonucu. `spawnWorkers()`, `respawnEligibleTasks()`, `validateTaskDependencies()`, `routeSprintTasks()` başlıca export'lar. Sprint 138 ADR-035 scope collision detection + Sprint 139 Kahn's algorithm bağımlılık scheduler entegrasyon noktası.

## 2. Public API
- `spawnWorkers(projectRoot, sprint, config, spawnBackend, ...): Promise<void>`
- `respawnEligibleTasks(projectRoot, sprint, config, spawnBackend, ...)`
- `validateTaskDependencies(tasks): ValidationResult`
- `routeSprintTasks(tasks, projectRoot, config)`
- Ve destekleyici yardımcı fonksiyonlar

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../core/types.js`, `../core/constants.js`, `../core/utils.js`
- **Dis:** `../core/config.js` (resolveEffectiveWorkers)
- **Dis:** `../core/system-profile.js` (getSystemProfile)
- **Dis:** `./sprint-utils.js`, `./spawn-backend.js`, `./tmux.js`
- **Dis:** `../monitor/auditor.js` (updateDashboard)
- **Dis:** `./result-collector.js` (resolveAgentPrompt, resolveSkillPrompts)
- **Dis:** `./task-builder.js` (buildWorkerPrompt)
- **Dis:** `./parallel-pipeline.js` (ParallelPipelineManager)
- **Dis:** `./task-router.js` (routeTask)
- **Dis:** `../core/observability.js` (metric)
- **Dis:** `./conflict-resolver.js` (detectScopeCollisions)
- **Dis:** `./event-stream.js` (writeEvent, CHANNELS)
- **Dis:** `./dependency-scheduler.js` (buildDependencyGraph, enforceWaveDependency, ...)
- **Dis:** `./sprint-checkpoint.js` (writeCheckpoint)
- **Dis:** Worker state machine import

## 4. Complexity
- 799 LoC — en büyük modüllerden biri, cyclomatic ~60+
- Çok sayıda bağımlılık — high fan-out

## 5. Type Safety
- Genel olarak tip güvenli — import chain karmaşık

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-024 (God Object Split):** sprint-controller.ts'den extract ✓
- **ADR-035 (Scope Collision Detection):** `detectScopeCollisions` entegre ✓
- **Sprint 139 T-028 (Kahn's algorithm):** `buildDependencyGraph` entegre ✓

## 7. Test Coverage
- `tests/orchestra/sprint-spawner.test.ts` bekleniyor — complex mock gerektiriyor

## 8. TODO/FIXME/HACK inventory
- Yok (çok sayıda sprint geçti, temiz)

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- `buildWorkerPrompt` → prompt injection kontrolü task-builder.ts'te yapılmalı
- Worker spawn: komut injection `tmux.ts` seviyesinde önleniyor ✓

## 11. Memory V2 Uyumu
- Memory V2 ile doğrudan ilgisi yok — operational spawn

## 12. Oneriler
- 799 LoC — spawn + routing + collision detection farklı modüllere split edilebilir (Sprint 143+)

## 13. Verdict: ANALYZED
