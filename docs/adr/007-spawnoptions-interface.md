# ADR-007: SpawnOptions Interface

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** `SpawnOptions { allowedTools?: string; autoApprove?: boolean }` tmux modülünde tanımlanır.
**Context:** Blueprint 15 gereği her ajan `--allowedTools` ile kısıtlanır. `autoApprove` ise `--dangerously-skip-permissions` ekler.
**Consequence:** Brain, worker scope'una göre allowedTools string'i hesaplar. SpawnOptions her spawn fonksiyonuna opsiyonel parametre olarak geçer.

**Note (evolution):** This is the original/foundational decision and remains accurate — `SpawnOptions` is still defined in the tmux module (`src/orchestra/tmux.ts`, re-exported via `src/orchestra/index.ts`). With multi-provider support the concept was **extended** (not replaced): `ProviderSpawnOptions` in `src/core/provider.ts` and `SpawnBackendOptions extends ProviderSpawnOptions` in `src/orchestra/spawn-backend.ts` (see ADR-017 MCP-Native Provider Adapters, ADR-027 Hybrid Spawn Backend). `allowedTools`/`autoApprove` semantics are unchanged. Documentation alignment only.
