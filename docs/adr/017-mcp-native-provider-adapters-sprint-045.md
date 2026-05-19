# ADR-017: MCP-Native Provider Adapters (Sprint 045)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Codex/Gemini adapter'ları mock komutlar kullanıyordu. Gerçek CLI davranışı test edilemiyordu.

**Decision:** Gerçek CLI komutlarına geçiş: `codex exec --full-auto` ve `gemini -p --output-format json`. Adapter'lar gerçek binary'leri wrap eder.

**Consequence:** Gerçek provider'larla uçtan uca test mümkün. CI ortamında binary yoksa `describe.skipIf` ile testler atlanır. Mock adapter'lar yalnızca unit test scope'unda kalır.

**Note (current scope):** Verified accurate — `src/providers/codex.ts` emits `codex exec --full-auto … --model …`; `src/providers/gemini.ts` uses `gemini -p … --output-format json` and now also supports `--output-format stream-json` (NDJSON); integration tests use `describe.skipIf` (`tests/providers/{codex,gemini}-integration.test.ts`). Adapters live in `src/providers/{claude,codex,gemini,sandbox,subprocess}.ts` behind the `ProviderAdapter` interface + `ProviderRegistry` (`src/core/provider.ts`). Per the ADR-010 Amendment, this ADR is also the governing record for the `@modelcontextprotocol/sdk` runtime dependency (MCP server/client transport, `src/mcp/server.ts`). Behavior unchanged; documentation alignment only.
