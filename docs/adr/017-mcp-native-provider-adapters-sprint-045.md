# ADR-017: MCP-Native Provider Adapters (Sprint 045)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Codex/Gemini adapter'ları mock komutlar kullanıyordu. Gerçek CLI davranışı test edilemiyordu.

**Decision:** Gerçek CLI komutlarına geçiş: `codex exec --full-auto` ve `gemini -p --output-format json`. Adapter'lar gerçek binary'leri wrap eder.

**Consequence:** Gerçek provider'larla uçtan uca test mümkün. CI ortamında binary yoksa `describe.skipIf` ile testler atlanır. Mock adapter'lar yalnızca unit test scope'unda kalır.

**Note (current scope, refreshed 2026-06-11):** The real-CLI ProviderAdapter decision holds and has **expanded to a multi-provider fleet** (ADR-066 Provider Independence, ADR-077 Multi-Provider 8-Fleet + OpenAI-Compatible HTTP Adapter). Adapters now live in `src/providers/` (**7**): `claude.ts`, `codex.ts`, `gemini.ts`, **`ollama.ts`**, **`openai-compatible.ts`**, `sandbox.ts`, `subprocess.ts` — behind the `ProviderAdapter` interface + `ProviderRegistry` (`src/core/provider.ts`). Integration tests use `describe.skipIf` (`tests/providers/*`).

**Per-provider flags (host vs docker — ProviderCommandSpec, Sprint 252 PSL-1):**
- **codex:** host path keeps `codex exec --full-auto` (backward-compat; Rust CLI ignores it harmlessly, `--approval-mode full-auto` also accepted); the **docker** container path uses `--dangerously-bypass-approvals-and-sandbox` via `ProviderCommandSpec` + per-provider OAuth mount.
- **gemini:** `gemini -p … --output-format json` (also `stream-json`/NDJSON); docker path adds yolo / skip-trust (autoApprove-gated for security) + OAuth mount.

Per the ADR-010 Amendment this ADR is also the governing record for the `@modelcontextprotocol/sdk` runtime dependency (MCP server/client transport, `src/mcp/server.ts`).

---

**Amendment log:** 2026-06-11 — Note refreshed: adapter list 5→**7** (ollama + openai-compatible eklendi); codex host `--full-auto` vs docker `--dangerously-bypass` (ProviderCommandSpec PSL-1) + gemini yolo/skip-trust ayrımı; cross-ref ADR-066/077 (Alperen ADR-review). Davranış değişmedi; md+db senkron.
