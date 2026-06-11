# ADR-007: SpawnOptions Interface

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** `SpawnOptions { allowedTools?: string; autoApprove?: boolean }` tmux modülünde tanımlanır.
**Context:** Blueprint 15 gereği her ajan `--allowedTools` ile kısıtlanır. `autoApprove` ise `--dangerously-skip-permissions` ekler.
**Consequence:** Brain, worker scope'una göre allowedTools string'i hesaplar. SpawnOptions her spawn fonksiyonuna opsiyonel parametre olarak geçer.

**Note (evolution):** This is the original/foundational decision and remains accurate — `SpawnOptions` is still defined in the tmux module (`src/orchestra/tmux.ts`, re-exported via `src/orchestra/index.ts`). With multi-provider support the concept was **extended** (not replaced): `ProviderSpawnOptions` in `src/core/provider.ts` and `SpawnBackendOptions extends ProviderSpawnOptions` in `src/orchestra/spawn-backend.ts` (see ADR-017 MCP-Native Provider Adapters, ADR-027 Hybrid Spawn Backend). `allowedTools`/`autoApprove` semantics are unchanged. Documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: dogfood-ağırlıklı** (iç spawn-sözleşmesi; `--allowedTools` güvenlik etkisi kullanıcıya dolaylı yansır).

**Re-verified (gövde-okuma; mevcut Note da doğru çıktı):** `SpawnOptions { allowedTools?, autoApprove? }` (`tmux.ts:19-21`), tüketim `:106-107/:120`, `autoApprove → --dangerously-skip-permissions` (`:125`) ✓ · re-export (`orchestra/index.ts:55`) ✓ · genişleme-zinciri `ProviderSpawnOptions` (`provider.ts:10`) → `SpawnBackendOptions` (`spawn-backend.ts:51`) ✓ · "Brain scope'tan allowedTools hesaplar" canlı: `sprint-spawner.ts:198/504/611` (writeTargets→allowedTools) ✓.

**Evrim:** autoApprove semantiği Docker-backend'e **per-provider** taşındı (`spawn-backend-docker.ts:551`, Sprint 249 kökü — her provider'ın kendi bypass-flag'i: claude `--dangerously-skip-permissions`, codex `--dangerously-bypass-approvals-and-sandbox`, gemini yolo); Claude CLI root'ta bypass'ı reddettiğinden container host-user olarak koşar (`:598/:688`). md+db senkron (Alperen ADR-review).
