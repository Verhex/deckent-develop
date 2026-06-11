# ADR-077: Multi-Provider 8-Fleet + OpenAI-Compatible HTTP Adapter

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 214

---

## Context

### Provider Architecture Pre-Sprint-214

Deckent's three existing cloud provider adapters (`claude/codex/gemini`) are all **CLI-spawn** adapters: they run the vendor's CLI binary (`claude`, `codex`, `gemini`) as a subprocess and parse stdout. This model works for subscriptions where the CLI handles auth, but it has a hard constraint: **providers without a CLI cannot be added**.

A Sprint 213 provider audit confirmed the architectural fact:

| Provider | CLI available? | API shape |
|----------|---------------|-----------|
| Anthropic (Claude) | ✅ `claude` CLI | custom |
| OpenAI (Codex) | ✅ `codex` CLI | custom |
| Google (Gemini) | ✅ `gemini` CLI | custom |
| DeepSeek | ❌ no CLI | OpenAI-compatible |
| Qwen (Alibaba DashScope) | ❌ no CLI | OpenAI-compatible |
| GLM / Zhipu AI | ❌ no CLI | OpenAI-compatible |
| Mistral | ❌ no CLI | OpenAI-compatible |
| Groq | ❌ no CLI | OpenAI-compatible |

DeepSeek, Qwen, GLM, Mistral, Groq, and every other third-party API provider expose the same REST interface: `POST /chat/completions` with OpenAI-shaped request/response bodies. One HTTP adapter handles all of them.

### Additional Gaps Confirmed by the Audit

1. **`model-catalog.ts` `PROVIDER_MAP`** only maps `anthropic`, `openai`, `google`. New provider names are unmapped → routing fallback to default.
2. **`ProviderName` type** is hardcoded `'claude' | 'codex' | 'gemini'`. A third-party provider registered in the registry has no type coverage.
3. **Per-provider API keys** are not stored in `.deck` (ADR-014 secret system). Bootstrap auto-registration does not run when keys are present.
4. **Simultaneous mix** (3 CLI-subscription + N HTTP-API + local Ollama) was never validated as coexisting in the same registry.

### Business Motivation

F1-009 (8-provider fleet) is a core differentiator: the "provider-free" pillar means users can mix and match any combination of subscription + API + local providers. DeepSeek's cost advantage (~1/30th of Claude Opus), Qwen's multilingual strength, and GLM's China-region availability are concrete user needs. The same sprint workflow that runs on Claude must run seamlessly on DeepSeek.

**Note:** "API mode forbidden during beta" (ADR-074, `[[project_api_mode_deferred_post_beta]]`) applies to **Anthropic Tier-1 API** only. Third-party API providers (DeepSeek, Qwen, GLM) do **not** violate this constraint — they are separate accounts with separate keys and no subscription/API conflict.

---

## Decision

### Part A — `OpenAICompatibleAdapter` (HTTP fetch, single adapter for N providers)

`src/providers/openai-compatible.ts` implements the `ProviderAdapter` interface:

- **Config shape:** `{ baseURL: string, apiKeyEnv: string, models: string[], name: string }`
- **`send(prompt, options)`:** `fetch(baseURL + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer <key>', 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, ... }) })` — parses `choices[0].message.content` from the JSON response.
- **`isAvailable()`:** returns `!!process.env[apiKeyEnv]` (or `.deck` secret value if present).
- **`stream()`:** stub returning async iterator over single message (streaming V2, post-beta, ADR-074 §F2-007).
- **Built-in presets:**
  - `DeepSeek`: `baseURL: 'https://api.deepseek.com/v1'`, `apiKeyEnv: 'DEEPSEEK_API_KEY'`
  - `Qwen/DashScope`: `baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'`, `apiKeyEnv: 'DASHSCOPE_API_KEY'`
  - `GLM/Zhipu`: `baseURL: 'https://open.bigmodel.cn/api/paas/v4'`, `apiKeyEnv: 'ZHIPU_API_KEY'`

No new runtime dependencies — Node.js built-in `fetch` (available Node.js ≥18, required ≥24 per ADR-001). ADR-010 (Tek Runtime Dependency) preserved.

### Part B — `PROVIDER_MAP` Extension + Dynamic `ProviderName`

`src/core/model-catalog.ts` extended:

- `PROVIDER_MAP` adds entries for `deepseek`, `qwen`, `zhipu`, and a generic `openai-compat` passthrough key.
- `ProviderName` type is widened: instead of a closed union, the type becomes `'claude' | 'codex' | 'gemini' | string` (open string for registered provider names). This preserves compile-time checking for the three built-ins while accepting any registered provider at runtime without a type error.
- `getProviderTier(providerName)` falls back to `'standard'` for unknown providers (safe default).

### Part C — Per-Provider Key Bootstrap + Auto-Register

`src/core/provider.ts` bootstrap phase:

1. Checks for `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `ZHIPU_API_KEY` in environment and `.deck` secrets (ADR-014 `readDeckSecret`).
2. For each present key: instantiates the corresponding `OpenAICompatibleAdapter` preset and calls `registerProvider(name, adapter)`.
3. Missing key → silent skip (no error, no warning spam). Graceful degradation: users without DeepSeek keys are not affected.
4. Bootstrap runs once at process start (same lifecycle as Claude/Codex/Gemini registration).

### Part D — Simultaneous Multi-Provider Coexistence Smoke

`scripts/multi-provider-smoke.mjs` validates that 3+ providers (mock claude + mock ollama + real OpenAICompatibleAdapter in test mode) can coexist in the registry and that per-task provider routing selects the correct adapter (not always the first registered). This is a **registry coexistence test**, not a live API call.

---

## Consequences

**Positive:**
- Any OpenAI-API-compatible provider can be added with a 3-line config object — no new adapter file needed.
- DeepSeek/Qwen/GLM users can run Deckent sprints at dramatically lower cost (DeepSeek-V3 ~$0.27/M tokens vs Claude Sonnet ~$3/M).
- `ProviderName` widening preserves backward compatibility: existing code that checks `provider === 'claude'` continues to work; new code can pass any registered name.
- Simultaneous fleet (CLI-subs + HTTP-API + local Ollama) is validated as coexisting.

**Negative:**
- HTTP adapter latency model differs from CLI-spawn: no local process startup overhead, but every call is a network round-trip. Timeout defaults (currently CLI-spawn tuned) may need adjustment for HTTP providers (lower per-call latency but higher variance).
- `fetch` error handling is surface-level in V1 (non-200 → throw, no retry). Retry/backoff is a post-beta concern (F1-010 load-balancing).
- `ProviderName` open-string widening loses exhaustiveness checking. A future dedicated `ProviderRegistry.listRegistered()` return type can restore type safety without closing the union.
- Bootstrap auto-register reads env at startup only. Hot-add (adding a key at runtime) requires process restart.

---

## Alternatives Considered

- **Separate adapter file per provider** (`deepseek-adapter.ts`, `qwen-adapter.ts`, etc.) — rejected: pure duplication; all share the identical `/chat/completions` interface. ADR-010 simplicity principle applies.
- **`litellm` or `openai` npm package as dependency** — rejected: ADR-010 (Tek Runtime Dependency = commander.js only). Built-in `fetch` is sufficient for `POST /chat/completions`.
- **Hard-close `ProviderName` union (add `| 'deepseek' | 'qwen' | 'zhipu'`)** — rejected: creates maintenance burden for every future provider. Open string is the correct extensibility point; built-in providers are the exhaustive-check boundary.
- **User-managed YAML/JSON provider registry** — rejected: over-engineering for V1. Auto-register from env keys is the minimal, correct bootstrap. Custom registry is a post-beta extension point.
- **Streaming-first adapter** — rejected: streaming is F2-007 (post-beta). Non-streaming works for all sprint task types (code gen, review, docs). Single-turn request/response matches the existing CLI-spawn model.

---

## References

- Sprint 214 — F1-009 8-provider (214-014 OpenAICompatibleAdapter, 214-015 PROVIDER_MAP, 214-016 bootstrap, 214-017 smoke)
- Sprint 213 provider audit — confirmed CLI-spawn vs HTTP-API architectural split
- `src/providers/openai-compatible.ts` — HTTP adapter implementation (Part A)
- `src/core/model-catalog.ts` — PROVIDER_MAP + ProviderName dynamic (Part B)
- `src/core/provider.ts` — bootstrap auto-register (Part C)
- `scripts/multi-provider-smoke.mjs` — coexistence validation (Part D)
- ADR-023: Plan Tier Generalizasyonu — provider-agnostic tier names (tier mapping preserved)
- ADR-066: Provider Independence — Multi-Provider Backend Parity (this ADR extends the fleet)
- ADR-010: Tek Runtime Dependency (Node built-in fetch, no new npm deps)
- ADR-014: .deck Secret File System (per-provider key storage)
- `[[project_deckent_runtime_ecosystem]]` — 8-provider + runtime ecosystem direction
- `[[project_api_mode_deferred_post_beta]]` — Anthropic Tier-1 API deferred; 3rd-party unaffected
- DeepSeek API: https://api.deepseek.com/v1 (OpenAI-compatible)
- Qwen DashScope: https://dashscope.aliyuncs.com/compatible-mode/v1 (OpenAI-compatible)
- GLM/Zhipu: https://open.bigmodel.cn/api/paas/v4 (OpenAI-compatible)

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (provider-free çekirdek ürün vaadi; 3rd-party maliyet-avantajı doğrudan user-değeri).

**Re-verified (dört part da canlı):** Part-A adapter + 3 preset (`openai-compatible.ts:52/228`) ✓ · Part-B `PROVIDER_MAP` deepseek/qwen/zhipu (`model-catalog.ts:122-124`) ✓ · Part-C bootstrap auto-register + `.deck`-köprüsü (`provider.ts:718-721`, `DECKENT_DEEPSEEK_API_KEY` → env) ✓ · Part-D `multi-provider-smoke.mjs` ✓.

**Canlı evrim:** Sprint 248-254 bu temeli **gerçek mixed-fleet dogfood'una** taşıdı — Sprint 249'da 15 task / 4 gerçek provider eşzamanlı koştu (forensics: `docs/alperen-analysis/2026-06-09-mixed-fleet-sprint249-forensics.md`); **ADR-078** "8-Provider Runtime" bunu runtime'da resmîleştirdi; **F1-CB billing-follows-auth** (S254) 3rd-party maliyet-etiketlerini de doğru-temelledi; ollama/deepseek/qwen/glm kullanıcı-dokümanları S244'te eklendi. md+db senkron (Alperen ADR-review).
