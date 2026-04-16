# Analysis: src/orchestra/tmux.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 341 | **Effort:** max

## 1. Amaci (detayli)
Tmux session yönetim modülü. Worker ve auditor süreçlerini tmux pencereleri içinde spawn eder. Session lifecycle (create, destroy, attach), worker window lifecycle (create, kill, list), auditor window, watch layout. Prompt dosyaları aracılığıyla shell injection önler. Timeout guard ile .result dosyasının her zaman yazılmasını garanti eden EXIT trap mekanizması.

## 2. Public API
- `SpawnOptions` (interface) — JSDoc yok, EKSIK
- `TmuxError` (class extends Error) — JSDoc yok
- `cleanupPromptFile(path)` — JSDoc yok (exported for testing)
- `WORKER_TIMEOUT_SECONDS` (const = 1200) — JSDoc ✓
- `buildWorkerCommand(model, path, opts?, adapter?, taskId?, timeout?)` → string — JSDoc ✓
- `buildClaudeCommand` — **@deprecated** alias for buildWorkerCommand
- `isSessionActive()` → boolean — JSDoc yok
- `ensureSession()` — JSDoc yok
- `spawnWorker(taskId, model, prompt, dir, opts?, adapter?)` — JSDoc yok, EKSIK
- `killWorker(taskId)` — JSDoc yok
- `listWorkers()` → string[] — JSDoc ✓ (@internal)
- `startAuditor(dir, opts?, adapter?)` — JSDoc ✓ (@internal)
- `attach()` — JSDoc yok
- `destroy()` — JSDoc yok
- `killAllSessions()` — JSDoc ✓
- `sendKeys(target, keys)` — JSDoc ✓ (@internal)
- `setupWatchWindow(session, root)` — JSDoc yok
- `createWatchLayout(root)` — JSDoc yok
- `attachToWorkerPane(taskId)` — JSDoc yok

## 3. Ic Bagimliliklar
- `../core/types.js` (ModelType)
- `../core/provider.js` (ProviderAdapter)
- `../core/utils.js` (debugLog)
- `../core/constants.js` (TMUX_SESSION_NAME, TMUX_AUDITOR_WINDOW, TMUX_WORKER_PREFIX, TASKS_DIR)
- Döngüsel bağımlılık riski: spawn-backend.ts imports tmux.ts — tmux.ts does NOT import spawn-backend.ts ✓

## 4. Dis Bagimliliklar
- `node:child_process` (spawnSync) — tmux CLI
- `node:fs` (writeFileSync, unlinkSync, mkdirSync, existsSync)
- `node:path` (join)
- `node:crypto` (randomBytes) — prompt ID
- ADR-010 uyumu: ✓ (tümü Node.js built-in)

## 5. Complexity
- Fonksiyon sayısı: 15 exported + 3 private (run, workerWindowName, windowExists, writePromptFile)
- Max cyclomatic complexity: `buildWorkerCommand()` (satır 79-126) ≈ CC 6 (adapter check, opts, timeout wrap)
- `spawnWorker()` (satır 145-177) ≈ CC 2
- `createWatchLayout()` (satır 297-323) ≈ CC 2

## 6. Type Safety
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓
- Non-null `!`: 0 ✓
- `as` cast: 0 ✓
- Tamamen type-safe ✓

## 7. ADR Compliance
- **ADR-006 spawnSync**: spawnSync kullanımı yaygın (run() helper, isSessionActive, setupWatchWindow, createWatchLayout, attachToWorkerPane). Tümü tmux CLI çağrıları — ADR-006 uyumlu (controlled binary, controlled args). ✓
- **ADR-008**: core/ only import ✓
- **ADR-010**: Node.js built-ins ✓
- **ADR-025 Graceful Shutdown**: `killAllSessions()` — SIGINT handler'dan çağrılır ✓
- **ADR-027**: tmux backend is part of hybrid spawn system ✓
- **Shell injection prevention**: Prompt written to file, passed via stdin redirection (satır 51-62). Prompt content NEVER enters shell command. ✓ Excellent security pattern.

## 8. Test Coverage
- `tests/orchestra/tmux.test.ts` — EXISTS ✓
- `tests/orchestra/tmux-edge.test.ts` — edge cases ✓
- 2 test dosyası — good
- buildWorkerCommand timeout/trap logic: complex string, needs thorough testing
- Tests likely mock spawnSync (tmux not available in CI)

## 9. TODO/FIXME/HACK inventory
- NONE ✓

## 10. Dead Code
- **`buildClaudeCommand`** — satır 128-129 — @deprecated alias. Is it referenced anywhere?
  - If no external callers exist, should be removed (backward compat claim needs verification)
- `setupWatchWindow` vs `createWatchLayout` — near-duplicate functionality. setupWatchWindow takes sessionName param, createWatchLayout hardcodes TMUX_SESSION_NAME. **Potential dead code**: one may be superseded.
- `attach()` — standalone tmux attach. Used by CLI `deckent attach` command.

## 11. Security
- **Shell injection mitigation**: writePromptFile writes prompt to .tasks/.prompt-{hash}.txt, then `cmd += < ${promptPath}` — prompt content never interpreted by shell. ✓ EXCELLENT.
- **buildWorkerCommand EXIT trap**: Satır 120-123 — complex shell string with nested quoting. Single-quoted JSON with `'"'"'` escape pattern for bash. Correct but fragile. Any change to the fallback JSON structure must preserve the quoting.
- **allowedTools quoting**: Satır 99-101 — `'${opts.allowedTools}'` — single-quoted in command string. If allowedTools contains single quotes, command breaks. But allowedTools is generated internally (not user input). Risk: MINIMAL.
- **Timeout marker path**: Uses `join(promptFilePath, '..')` (satır 113) to derive .tasks/ dir from prompt path. Assumes prompt is always in .tasks/ — correct by construction.

## 12. Memory V2 Uyumu
- N/A — no memory operations

## 13. i18n
- No user-facing strings
- Internal error messages English — acceptable

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: 5/18 exported items — **POOR**
- Many core functions (spawnWorker, killWorker, isSessionActive, ensureSession) lack JSDoc
- @internal annotations on 3 functions ✓
- @deprecated on buildClaudeCommand ✓

## 15. Performance
- spawnSync calls: run() helper wraps every tmux command — synchronous by design (tmux CLI is fast)
- writeFileSync for prompt files — one-time per spawn ✓
- Nested spawnSync in setupWatchWindow/createWatchLayout — multiple tmux commands per call, but cold path
- No hot path concerns

## 16. Oneriler
- **P2**: Verify `buildClaudeCommand` has external callers. If none, remove @deprecated alias.
- **P2**: setupWatchWindow vs createWatchLayout — near-duplicate. Consolidate or document difference.
- **P2**: JSDoc coverage 5/18 — add JSDoc to spawnWorker, killWorker, ensureSession, isSessionActive at minimum
- **P3**: buildWorkerCommand EXIT trap quoting (satır 120-123) — extremely fragile. Consider extracting trap script to a template file (like Docker backend does with .worker-*.sh scripts).
- **P3**: Satır 105 `< ${promptFilePath}` — prompt file path from .tasks/ dir, no quoting. If path has spaces, command breaks. Low risk (task IDs are alphanumeric) but defensive quoting would be better.

## Verdict: ANALYZED
