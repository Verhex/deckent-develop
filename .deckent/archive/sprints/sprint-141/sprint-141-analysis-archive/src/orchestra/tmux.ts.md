# Analysis: src/orchestra/tmux.ts
**Task ID:** 140-002 | **LoC:** 340

## 1. Amaci
tmux session/window yönetimi ve Claude CLI worker'larını tmux pane'lerinde spawn eden modül. ADR-006 (spawnSync Security Pattern) + ADR-007 (SpawnOptions Interface) implementasyonu. `buildWorkerCommand()`, `spawnWorker()`, `ensureSession()`, `killWorker()`, `listWorkers()` ana export'lar.

## 2. Public API
- `interface SpawnOptions` — allowedTools?, autoApprove?
- `class TmuxError extends Error`
- `cleanupPromptFile(promptPath): void`
- `WORKER_TIMEOUT_SECONDS = 1200`
- `buildWorkerCommand(model, taskId, promptPath, options?, adapter?): string`
- `ensureSession(): void`
- `spawnWorker(taskId, model, prompt, projectRoot, options?, adapter?): void`
- `killWorker(taskId): void`
- `listWorkers(): string[]`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:child_process` (spawnSync)
- **Dis:** `node:fs`, `node:path`, `node:crypto`
- **Dis:** `../core/types.js` (ModelType)
- **Dis:** `../core/provider.js` (ProviderAdapter)
- **Dis:** `../core/utils.js` (debugLog)
- **Dis:** `../core/constants.js` (TMUX_SESSION_NAME, TMUX_AUDITOR_WINDOW, TMUX_WORKER_PREFIX, TASKS_DIR)

## 4. Complexity
- 10 fonksiyon, cyclomatic ~15 (tmux status check + conditional spawn)

## 5. Type Safety
- `(result.stdout ?? '').trim()` — güvenli optional chain ✓
- `TmuxError` typed exception ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-006 (spawnSync Security Pattern):** `spawnSync('tmux', args)` array args — shell injection yok ✓
- **ADR-007 (SpawnOptions Interface):** `interface SpawnOptions` ✓
- `writePromptFile`: prompt temp dosyaya yazılıyor, stdin redirect — shell injection koruması ✓

## 7. Test Coverage
- `tests/orchestra/tmux.test.ts` — `spawnSync` mock gerekli, platform-dependent

## 8. TODO/FIXME/HACK inventory
- `WORKER_TIMEOUT_SECONDS = 1200` (20dk) — hardcoded, config'den gelmeli (ama zaten config override mevcut)

## 9. Dead Code Candidates
- Yok — aktif production backend

## 10. Security Findings
- `writePromptFile`: `.prompt-{random}.txt` dosyası tmp write — `randomBytes(8)` yeterli entropy ✓
- `buildWorkerCommand`: shell escape yok ama prompt file path random hex — güvenli ✓
- tmux session name `TMUX_SESSION_NAME` constant — predictable ama local

## 11. Memory V2 Uyumu
- Memory V2 ile ilgisi yok — tmux backend

## 12. Oneriler
- `cleanupPromptFile` hata durumunda çağrılıyor mu? spawn hata sonrası cleanup kontrol et

## 13. Verdict: ANALYZED
