# ADR-G-008: Provider Abstraction, Fleet & Native-Usage

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=provider-free across backends (`getProviderForModel` SSOT resolver; 3 CLI-subscription + N HTTP-API via one `OpenAICompatibleAdapter` + local Ollama) + leak-free subscription↔API auth-precedence + provider-native real token/cost (`session-usage-store`, real cacheCreation) → tomorrow=provider-agnostic failover Brain (ADR-G-025; Claude→GPT/Codex lossless) + `?? 'claude'` default-drift consolidation (ADR-066-W) + subscription→API overflow wire (F1-010) + Codex/Gemini native-usage phase-2 + subscription-package & opt-in hosted-core (PROV-SUBS · PROV-FC)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-017 (MCP-Native Provider Adapters) + ADR-066 (Provider Independence) + ADR-077 (8-Fleet OpenAI-Compatible) + ADR-093 (Real Token/Cost Capture) + ADR-076 Part-A (Auth-Precedence) + ADR-078 Part-B (8-provider bootstrap/overflow)
**Crosswalk:** 017 (+066+077+093+076A+078B) → ADR-G-008

---

## Context

deckent is **provider-free**: any provider (subscription-CLI or API or local) can run any task on any backend. The pieces accreted across sprints — MCP-native adapters (017), backend parity (066), an OpenAI-compatible HTTP adapter for the no-CLI fleet (077), real provider-native usage capture (093), the subscription↔API auth-precedence fix (076A), and 8-provider bootstrap/overflow (078B). The 2026-06-30 review unifies them into one provider law and connects it to Brain provider-failover (ADR-G-025).

---

## Decision (Today)

```xml
<provider-abstraction>
  <resolver>getProviderForModel (SSOT, in task-types.ts) — model → provider.</resolver>
  <backends>provider-free across subprocess / tmux / Docker (host-adapter for
    codex/gemini + per-provider OAuth mount; ollama host-route).</backends>
  <fleet>3 CLI-subscription (claude/codex/gemini) + N HTTP-API via one
    OpenAICompatibleAdapter (DeepSeek/Qwen/GLM/Mistral/Groq — same /chat/completions) +
    local Ollama. ProviderName = open string. Mixed-fleet dogfood-proven (Sprint 249:
    15 tasks / 4 real providers).</fleet>
  <auth-precedence>subscription mode → ANTHROPIC_API_KEY NOT forwarded into the
    container (~/.claude session mount instead); API mode forwards. No cross-provider
    credential leak. (Ends the `env -u ANTHROPIC_API_KEY` workaround.)</auth-precedence>
  <native-usage>session-usage-store reads the provider's own per-turn usage
    (~/.claude/projects/*.jsonl) → REAL cacheCreationTokens (the limit-dominant cost
    component, previously always 0); TokenUsage.source ∈ {session-store, envelope,
    estimate}; priority chain session-store → envelope → estimate. (sessionRoot injectable
    = test-hermetic; the real ~/.claude is never read in tests.)</native-usage>
</provider-abstraction>
```

3rd-party-API providers (DeepSeek/Qwen/GLM) are separate accounts/keys — they do **not** violate the Anthropic-Tier-1-API beta deferral (which applies to Anthropic API only).

---

## Intent / Roadmap (Tomorrow)

- **Brain provider-failover + lossless self-update** (ADR-G-025): the Brain itself fails over Claude→OpenAI/Codex losslessly; the adapter abstraction is what makes a provider-agnostic Brain possible (today Claude-Brain, tomorrow GPT-5.5-Brain).
- **🔴 ADR-066-W:** `?? 'claude'` default-provider drift (3→9 occurrences) → re-audit + consolidate to `getDefaultProviderName()` (the contract: ≤3, justified). (WM-5 provider-free hard-enforce family.)
- **🔴 Subscription→API overflow wire (F1-010):** `resolveWithOverflow` is built but **0-caller (dormant)** — wire it to the spawn-error/FIX path (tier-preserving overflow on quota-exceeded).
- **Native-usage phase-2:** Codex/Gemini own usage stores (today `null`→estimate fallback; honest seam).
- **Subscription-package support** (PROV-SUBS) + **opt-in hosted-deckent-core** as an *optional* provider (ADR-G-016: BYO default, hosted never required) + first-class cost/limit/notify/fallback (PROV-FC).

---

## Consequences

**(+)** True provider-freedom: any subscription/API/local provider, any backend, with accurate provider-native cost (real cacheCreation) and leak-free auth-precedence. The abstraction enables a provider-agnostic, failover-capable Brain. 3rd-party cost advantage (DeepSeek ~1/30th) accessible.

**(−)** Overflow is dormant (born F1-010); the `?? 'claude'` invariant drifted (born ADR-066-W); Codex/Gemini native-usage is phase-2 (estimate fallback today). Hosted-core/subs-package are roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-017 + ADR-066 + ADR-077 + ADR-093 + ADR-076-A + ADR-078-B.
- **Cross-ref:** ADR-G-025 (Brain failover/self-update) · ADR-G-006 (routing/model-selection) · ADR-G-012 (tiers) · ADR-G-014 (backends) · ADR-G-005 (.deck per-provider keys) · ADR-D-002 (test-hermeticity for sessionRoot) · F1-TOK/F1-CB (cost ledger).
- **Born:** ADR-066-W (`?? 'claude'` consolidate) · F1-010 (overflow wire) · native-usage-phase-2 · PROV-FC · PROV-SUBS.
- **Memory:** `project_deckent_runtime_ecosystem` · `project_api_mode_deferred_post_beta` · `feedback_container_auth_precedence`.
