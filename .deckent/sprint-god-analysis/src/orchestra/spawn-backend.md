# Analysis: src/orchestra/spawn-backend.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 275 | **Effort:** max

## 1. Amaci (detayli)
SpawnBackend soyut interface ve factory modülü. Worker spawn etmek için 3 backend (tmux, subprocess, docker) arasında seçim yapar. SpawnBackendFactory.create() ile uygun backend'i oluşturur. 'auto' modunda docker → tmux → subprocess fallback chain uygular. Strategy + Factory pattern.

## 2. Public API
- `SpawnBackend` (interface) — spawn, kill, list, isAvailable, name — JSDoc ✓ (detailed inline)
- `SpawnBackendOptions` (interface extends ProviderSpawnOptions) — JSDoc yok, EKSIK
- `SpawnBackendError` (class extends Error) — JSDoc yok
- `TmuxBackend` (class implements SpawnBackend) — JSDoc ✓
- `SubprocessBackend` (class implements SpawnBackend) — JSDoc ✓
- `BackendType` (type: 'tmux' | 'subprocess' | 'docker' | 'auto') — JSDoc yok
- `SpawnBackendFactoryOptions` (interface) — JSDoc ✓ (inline field docs)
- `SpawnBackendFactory` (class) — JSDoc ✓
  - `static create(opts)` → SpawnBackend — JSDoc ✓
  - `static isTmuxAvailable()` → boolean — JSDoc ✓
  - `static createAsync(opts)` → Promise<SpawnBackend> — JSDoc ✓

## 3. Ic Bagimliliklar
- `../core/types.js` (ModelType)
- `../core/provider.js` (ProviderSpawnOptions)
- `./tmux.js` (ensureSession, spawnWorker, killWorker, listWorkers)
- `../providers/subprocess.js` (SubprocessSpawnBackend)
- `./spawn-backend-docker.js` (DockerSpawnBackend, isDockerAvailable)
- Döngüsel bağımlılık riski: YOK — tmux.ts → spawn-backend.ts zinciri yok (spawn-backend tmux'u import eder, tmux spawn-backend'i import etmez)

## 4. Dis Bagimliliklar
- `node:child_process` (spawnSync) — tmux availability check (ADR-006 uyumlu)
- ADR-010 uyumu: ✓

## 5. Complexity
- Class sayısı: 3 (TmuxBackend, SubprocessBackend, SpawnBackendFactory)
- Fonksiyon sayısı: 12+ (3 class × 4-5 methods)
- Max cyclomatic complexity: `SpawnBackendFactory.create()` (satır 210-246) ≈ CC 5 (4 backend types + auto)
- En karmaşık: create() — simple if/else chain

## 6. Type Safety
- `as string[]` — satır 159 (`listWorkers()` return type assertion on SubprocessSpawnBackend)
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓
- Non-null `!`: 0 ✓

## 7. ADR Compliance
- **ADR-006 spawnSync**: spawnSync used in TmuxBackend.isAvailable() (satır 113) and SpawnBackendFactory.isTmuxAvailable() (satır 252). Both are tmux version checks — appropriate use ✓
- **ADR-008**: Imports from core/ and orchestra/ (tmux.ts, spawn-backend-docker.ts) ✓
- **ADR-010**: Node.js built-in only ✓
- **ADR-027 Hybrid Spawn Backend**: This file IS the ADR-027 implementation — factory pattern with auto detection ✓
- **Memory V2**: N/A

## 8. Test Coverage
- `tests/core/spawn-backend.test.ts` — EXISTS ✓ (misplaced in tests/core/, should be tests/orchestra/)
- `tests/orchestra/spawn-backend-move.test.ts` — EXISTS ✓ (likely factory/backend move tests)
- Test location inconsistency: spawn-backend.ts is in src/orchestra/ but main test is in tests/core/ — **P2 misplacement**

## 9. TODO/FIXME/HACK inventory
- NONE ✓

## 10. Dead Code
- `createAsync()` — is this called anywhere? If no callers, it's dead code (create() is synchronous and preferred). Needs grep verification.
- `BackendType` includes 'auto' which is the default — all 4 values are reachable ✓
- SubprocessBackend lazy initialization (`_backend: null`, `getBackend()`) — valid pattern, not dead

## 11. Security
- spawnSync with controlled args ('tmux', ['-V']) — no injection ✓
- SpawnBackendOptions accepts `autoApprove: boolean` which enables `--dangerously-skip-permissions` on Claude CLI. This is by design (Deckent workers need full permissions) but DOCUMENTED explicitly in spawn-backend-docker.ts line 97: "IMMUTABLE — Deckent standard: workers MUST have full write permissions". ✓
- No secret exposure ✓

## 12. Memory V2 Uyumu
- N/A — no memory operations

## 13. i18n
- No user-facing strings
- Error messages are English — acceptable for internal errors

## 14. Dokumantasyon Tutarliligi
- SpawnBackend interface: excellent JSDoc on every method ✓
- Factory: documented ✓
- Missing: SpawnBackendOptions, SpawnBackendError, BackendType JSDoc

## 15. Performance
- spawnSync calls: 2 (tmux -V checks) — cold path, infrequent ✓
- Factory.create() is sync — appropriate for startup
- SubprocessBackend lazy backend initialization — good pattern, no unnecessary allocation

## 16. Oneriler
- **P2**: Test file misplacement — `tests/core/spawn-backend.test.ts` should be `tests/orchestra/spawn-backend.test.ts`
- **P3**: Verify `createAsync()` has callers — if not, consider removing or marking @internal
- **P3**: Add JSDoc to SpawnBackendOptions, SpawnBackendError, BackendType
- **P3**: Duplicate tmux availability check — `TmuxBackend.isAvailable()` (async) and `SpawnBackendFactory.isTmuxAvailable()` (sync) both call `spawnSync('tmux', ['-V'])`. Consider consolidating.

## Verdict: ANALYZED
