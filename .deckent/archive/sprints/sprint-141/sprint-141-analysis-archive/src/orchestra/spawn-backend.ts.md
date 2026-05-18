# Analysis: src/orchestra/spawn-backend.ts
**Task ID:** 141-002 | **LoC:** 274

## 1. Amaci
Worker spawn backend soyutlamasını tanımlar: `SpawnBackend` interface, `TmuxBackend`, `SubprocessBackend` ve `SpawnBackendFactory`. Docker backend için `spawn-backend-docker.ts`'e delege eder.

## 2. Public API (export listesi)
- `SpawnBackend` interface (spawn, kill, list, isAvailable)
- `SpawnBackendOptions` interface
- `SpawnBackendError` class
- `TmuxBackend` class (SpawnBackend impl)
- `SubprocessBackend` class (SpawnBackend impl)
- `BackendType` type ('tmux' | 'subprocess' | 'docker' | 'auto')
- `SpawnBackendFactoryOptions` interface
- `SpawnBackendFactory` class (create, createAsync, isTmuxAvailable static methods)

## 3. Ic + Dis Bagimliliklar
- **İç:** ./tmux.js (ensureSession, spawnWorker, killWorker, listWorkers), ./spawn-backend-docker.js, ../providers/subprocess.js
- **Dış:** ../core/types.js, ../core/provider.js
- **Node:** node:child_process (spawnSync)

## 4. Complexity
`SpawnBackendFactory.create`: backend type switch, cyclomatic ~6. `TmuxBackend.spawn`: delegasyon, ~2. Toplam: ~15.

## 5. Type Safety
Tip-safe interface implementasyonları. `available[0] ?? 'claude' as ProviderName` benzeri cast yok.

## 6. ADR Compliance
- **ADR-027 (Hybrid Spawn Backend):** FULLY COMPLIANT — docker → tmux → subprocess fallback zinciri implement edilmiş.
- **ADR-006 (spawnSync):** `spawnSync('tmux', ['-V'], ...)` availability check için — güvenli.

## 7. Test Coverage
- `tests/orchestra/spawn-backend.test.ts` beklenir.
- Factory `auto` modu fallback zinciri test edilmeli.

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`SubprocessBackend._backend` lazy init pattern — kullanılıyor; dead code değil.

## 10. Security Findings
- Backend seçimi `opts.backend` ile yapılıyor; user-controlled değil konfigürasyondan geliyor — güvenli.

## 11. Memory V2 Uyumu
Doğrudan ilişki yok.

## 12. Oneriler
- `auto` mod'da docker availability check senkron (`isDockerAvailable()`) — async check daha sağlıklı olabilir.

## 13. Verdict: ANALYZED
