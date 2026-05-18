# Analysis: src/core/provider.ts
**Task ID:** 141-001 | **LoC:** 609

## 1. Amaci (1-2 cumle)
Multi-provider AI adapter altyapisi. `ProviderAdapter` interface, `ProviderRegistry` sinifi ve concrete provider implementasyonlari (Claude tmux, subprocess, Codex, Gemini) ile birlikte model equivalence routing saglar.

## 2. Public API (export listesi)
- `ProviderSpawnOptions`, `ProviderWorkerInfo` interfaces
- `ProviderAdapter` interface (spawn, kill, listWorkers, isAvailable, healthCheck)
- `ProviderRegistry` class (register, get, isSupported, listAll)
- `getEquivalentModelForProvider()`, `routeToProvider()` helper functions
- Concrete adapters: `createClaudeTmuxAdapter()`, `createClaudeSubprocessAdapter()`, `createCodexAdapter()`, `createGeminiAdapter()`

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./types.js`, `./config-types.js`, `./task-types.js`, `./model-equivalence.js`, `../orchestra/connector.js`, `./deck-file.js`
- **Dis:** `node:child_process` (spawnSync)
- **ADR-016 Connector Module** kullaniliyor

## 4. Complexity
- 15+ fonksiyon, cyclomatic rough: 30-35

## 5. Type Safety
- `any`: 2 (connector cagrilarinda)
- Non-null assertion: 4

## 6. ADR Compliance
- ADR-006 (spawnSync): spawnSync kullaniliyor — security pattern dogrulanmali (timeout set mi?)
- ADR-016 (Connector Module): `Connector` import edilmis — UYUMLU
- ADR-001 (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/provider.test.ts` MEVCUT olmali

## 8. TODO/FIXME/HACK inventory
- `/** Environment variable overrides injected into the worker process (only provider-specific keys) */` — security comment

## 9. Dead Code Candidates
- `healthCheck()` — tum adapterlerde implemente mi?

## 10. Security Findings
- `env?: Record<string, string>` — worker process env injection; provider-specific keys only yorumu var ama enforcement mekanizmasi?
- `loadDeckSecrets()` cagrilmasi — secret exposure riski; kod incelemesi gerekiyor

## 11. Memory V2 Uyumu
- Dogrudan iliskisi yok

## 12. Oneriler
- `spawnSync` timeout kontrolu dogrulanmali (ADR-006)
- Env injection allowlist/denylist eklenmeli

## 13. Verdict: ANALYZED
