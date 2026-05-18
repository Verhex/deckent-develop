# Analysis: src/orchestra/sprint-lifecycle.ts
**Task ID:** 140-002 | **LoC:** 515

## 1. Amaci
Sprint lifecycle yönetimi — `sprint-controller.ts` God Object split'inin ürünü (ADR-024/026). BrainError sınıfı, interrupt state yönetimi, cleanup(), pauseSprint(), resumeSprint(), waitForHumanApproval(), safeDashboardUpdate() fonksiyonlarını içerir.

## 2. Public API
- `class BrainError extends Error` — phase?: SprintPhase
- `interface PauseState`
- `type CheckpointPhase = 'plan' | 'evaluate' | 'fix'`
- `setActiveSprint(projectRoot, sprint, spawnBackend?): void`
- `clearActiveSprint(): void`
- `resetInterruptState(): void` — test only
- `isInterrupted(): boolean`
- `interruptActiveSprint(): void`
- `safeDashboardUpdate(projectRoot, sprint, errorMessage): void`
- `cleanup(projectRoot, sprint, spawnBackend?): void`
- `waitForHumanApproval(projectRoot, sprintId, phase, summary): Promise<boolean>`
- `pauseSprint(projectRoot, sprint, reason?): PauseState`
- `resumeSprint(projectRoot, sprint): PauseState | null`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:fs/promises`, `node:path`
- **Dis:** `../core/types.js` (TaskStatus, SprintPhase, SprintStatus, AlertLevel, Sprint)
- **Dis:** `../core/constants.js`, `../core/utils.js`
- **Dis:** `../core/multi-ide.js` (releaseSprintLock)
- **Dis:** `../core/plugin-hooks.js` (clearHooks)
- **Dis:** `./sprint-utils.js` (now, isStaleTaskFile, isTmuxProvider, PAUSE_STATE_FILE, ...)
- **Dis:** `./spawn-backend.js` (SpawnBackend type)
- **Dis:** `./tmux.js` (killWorker, listWorkers)
- **Dis:** `../monitor/auditor.js` (updateDashboard)
- **Dis:** `../agents/worker.js` (releaseAllLocks)
- **Dis:** `./ipc-registry.js` (getChannelRegistry)

## 4. Complexity
- 13 export, cyclomatic toplam ~30 (for döngüsü + TaskStatus match + try/catch zinciri)
- Module-level mutable state: `_activeSprint`, `_isInterrupted` — singleton pattern ⚠️

## 5. Type Safety
- `JSON.parse(raw) as Record<string, unknown>` — güvenli generic cast ✓
- `parsed['status'] = 'INTERRUPTED'` — index signature, tip kaybı

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-024/026 (God Object Split):** sprint-controller.ts'den extract edilmiş ✓
- **ADR-025 (Graceful Shutdown):** `interruptActiveSprint()` SIGINT handler ✓
- Singleton mutable state: thread-safe değil ama Node.js single-thread — kabul edilebilir

## 7. Test Coverage
- `tests/orchestra/sprint-lifecycle.test.ts` — `resetInterruptState()` test helper olarak mevcut ✓
- `waitForHumanApproval` için polling timer mock gerekli

## 8. TODO/FIXME/HACK inventory
- `waitForHumanApproval` içinde `while (true)` sonsuz döngü — `_isInterrupted` check var ✓

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- `waitForHumanApproval`: checkpoint dosyası polling — `createdAt` timestamp doğrulaması yok, replay saldırısı riski minimal (local dosya)
- `cleanup`: `readdirSync(tasksDir)` tüm task dosyalarını siliyor — scope'suz silme, sprint ID filtrelemesi yok ⚠️

## 11. Memory V2 Uyumu
- Memory V2 ile doğrudan ilişki yok — sprint state management

## 12. Oneriler
- `cleanup` fonksiyonuna sprint ID filtresi ekle — farklı sprint dosyaları yanlışlıkla silinebilir

## 13. Verdict: ANALYZED
