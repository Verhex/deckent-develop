# Design — Provider-Agnostic Per-Task Usage & Cost Capture

> **Date:** 2026-06-26 · **Status:** findings accepted; design-ready.
> **One-line:** Capture every worker's REAL token usage + cost for **every provider** (not just
> Claude) by reading each provider's NATIVE usage source via its adapter, normalizing to one rich
> schema. This is the actual root-cause fix for the long-standing "token counter never works".
> **Law #2 anchor:** designed for the full provider matrix up front — no provider is a special case.

## Problem (definitive root cause)
The token counter has never produced real numbers because deckent captures the worker's **final-text
stdout** (the agent's last message), not the **provider's usage**. The usage does not live in stdout —
it lives in each provider's **native usage source**, which deckent never reads:
- `subprocess.ts:60` (claude `buildArgs`) = `['-p','-','--model',…]` — **no usage-emitting flag** → the
  CLI prints only text; `.tasks/task-<id>.log` is 1 line of prose, no `usage`.
- `codex.ts` `buildArgs` = `exec --full-auto …` — no structured/usage flag either.
- `gemini.ts:458` `buildArgs` = `… --output-format json …` — **already requests usage** (proof the
  contract is achievable; it's just applied inconsistently — claude/codex lack it).
- API adapters (ollama/openai-compatible/bedrock) receive usage in the HTTP response, but the agentic
  worker (`agentic-worker-entry.ts`) defaults `zeroTokenUsage` (0/0) unless the runner accumulates it.

The gap spans **multiple providers AND classes** — a Claude-only fix leaves codex, every API provider,
and every gateway broken.

## Reference architectures (proven patterns to follow)
- **tokscale** (`junhoyeo/tokscale`) — extracts usage from 10+ agentic CLIs (Claude Code, OpenCode,
  Codex, Gemini, Cursor, OpenClaw, Hermes). **Key lesson: usage lives in each agent's NATIVE
  session/transcript store, not stdout** — e.g. Claude Code `~/.claude/projects/{path}/*.jsonl`
  (`usage:{input_tokens,output_tokens,cache_read_input_tokens}`), Codex `~/.codex/sessions/*.jsonl`
  (`token_count` events), Gemini `$GEMINI_CLI_HOME/tmp/{hash}/chats/*.json`, OpenCode SQLite,
  Hermes `$HERMES_HOME/state.db`, Cursor a web-API. Each source has its own location+shape; tokscale
  reads the native source per-tool and normalizes to one schema, pricing via LiteLLM/OpenRouter.
- **LiteLLM** — normalizes usage to the OpenAI shape across 100+ providers; cost via
  `completion_cost(response, model)` / `cost_per_token(model, in, out)`.
- **Vercel AI SDK** — gold-standard normalized schema: `LanguageModelUsage = { inputTokens, outputTokens,
  totalTokens, inputTokenDetails:{ cacheReadTokens, cacheWriteTokens }, outputTokenDetails:{ reasoningTokens } }`
  + `providerMetadata` for provider-specifics.
- **Hermes/OpenClaw** (agentic CLIs) — solve the **API side via a unified gateway (OpenRouter, 200+
  models)** that returns normalized usage. OpenRouter is OpenAI-compatible → deckent's
  openai-compatible adapter already reaches it.

## Provider matrix (most-used, by usage-source class)
| Class | Usage source | Providers |
|-------|-------------|-----------|
| **A — session-store CLI-agents** | the agent's native session/transcript file (or DB) | claude · codex · gemini-CLI · opencode · openclaw · hermes |
| **B — HTTP-response APIs** | the response `usage`/eval-count, accumulated across the agentic loop | OpenAI · Anthropic-API · **Google Vertex AI** · **Azure OpenAI** · DeepSeek · Mistral · xAI/Grok · Groq · Cohere · Together · Fireworks · Cerebras · **AWS Bedrock** · ollama · vLLM · LM-Studio |
| **C — unified gateways** | normalized response usage (one adapter → many models) | **OpenRouter** · LiteLLM-proxy · Vercel AI Gateway · Portkey |
| **D — SaaS-only** | the provider's web/usage API (auth) | Cursor · (hosted seats) |

## Design — the Usage-Source Contract (provider-agnostic)
1. **`extractUsage` reads its class's native source — no single mechanism is imposed.** Each adapter
   declares HOW it obtains per-run usage:
   - **A:** read the provider's session/transcript store for this run (correlate by session-id), OR
     request the CLI's usage-emitting structured-output mode (`--output-format json` for claude/gemini)
     so the per-run usage envelope is in stdout. (For headless per-task runs the structured-output
     envelope is the natural per-task usage; the session-store is the fallback / aggregate path.)
   - **B:** the adapter accumulates `usage` across the agentic loop's HTTP responses and surfaces it.
   - **C:** the gateway returns normalized usage (OpenAI shape) — the openai-compatible adapter parses it.
   - **D:** fetch from the provider's usage API (auth-gated; cached).
2. **One rich normalized schema** (parity with AI SDK / tokscale) — extend `TokenUsage` with
   `cacheWriteTokens` + `reasoningTokens` (currently missing): `{ inputTokens, outputTokens,
   cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens, source, provider, model }`.
3. **Cost** — existing cross-provider `cost-calculator` + pricing table (LiteLLM/OpenRouter-style,
   cached); local/self-hosted → $0.
4. **Gateway-first for the API side** — first-class OpenRouter support (via openai-compatible) gives
   200+ API models with normalized usage at near-zero marginal cost.
5. **Orchestrator-side (already wired, Steps 1-2)** — `enrichResultTokenUsage` (provider-agnostic,
   reads via `adapter.extractUsage`) + `enrichResultCost` consume the normalized usage uniformly.

## Implementation plan (per-class, verified per-provider — full matrix)
1. **Contract + schema:** extend `TokenUsage` (cacheWrite + reasoning); make `extractUsage` the single
   per-adapter usage-source seam; add a per-adapter contract test (each adapter, given its native
   source sample, returns normalized usage).
2. **Class A (CLI-agents):** each CLI-adapter obtains per-run usage — claude + codex add their
   usage-emitting structured-output flag (gemini already has it), with a session-store reader as the
   robust fallback. Verify each with a real run: the captured source contains parseable usage →
   `.result.tokenUsage` non-zero.
3. **Class B (APIs):** `runAgenticWorker` accumulates response `usage` across the loop and writes it to
   `.result.tokenUsage` (replace the `zeroTokenUsage` default) — ollama/openai-compatible/bedrock.
4. **Class C (gateways):** confirm openai-compatible parses OpenRouter/LiteLLM normalized usage; add
   OpenRouter as a first-class provider config.
5. **Class D (SaaS):** out of scope for v1 (auth-gated web-API); note explicitly.
6. **Full-matrix verify:** a real run from at least one provider per class shows real token+cost in the
   `.result`. No silent 0/0 for any wired provider.

## Out of scope / honest gaps
- Class D (Cursor-style web-API usage) deferred to v1.1 (auth + per-vendor API).
- Per-task session-id correlation for concurrent same-project Class-A workers needs care (capture the
  run's session-id) — flagged for the Class-A task.

## Sources
tokscale (github.com/junhoyeo/tokscale) · LiteLLM (docs.litellm.ai) · Vercel AI SDK (ai-sdk.dev) ·
OpenRouter · Hermes/OpenClaw (nousresearch) · artificialanalysis.ai providers leaderboard.
