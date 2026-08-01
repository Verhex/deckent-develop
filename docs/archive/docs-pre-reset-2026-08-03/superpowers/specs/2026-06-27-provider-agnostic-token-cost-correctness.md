# Provider-Agnostic Token Counting + Cost Correctness — Deep Research & Corrective Design

**Date:** 2026-06-27 · **Effort:** max (3 parallel research agents: deckent code archaeology + context7 provider-usage + context7 tokenizer/cost) · **Anchor:** Law #2 — every AI tool × every provider, REAL token counts + correct cost, NOT claude-specific.

---

## 0. VERDICT (answer first)

| Question | Answer |
|----------|--------|
| **Cost module correct?** | ✅ **YES.** Math + prices verified against LiteLLM canonical map + Anthropic published: Opus $5/$25, Sonnet $3/$15 per Mtok, cache_creation 1.25×, cache_read 0.1× — all EXACT. Cache-weighting + safeCost unit-guard correct. |
| **Token counters correct?** | 🔴 **NO for the most-used path.** Default claude-docker backend runs on the **fabricated heuristic** (cacheRead=input×4, output=linesAdded×15, cacheCreation=0). The real-capture mechanism (ADR-093 session-store reader) is **dead code — zero production callers.** REAL only for codex/gemini/subprocess-claude; PARTIAL (cache/reasoning dropped) for openai-compatible/ollama. |
| **Was a real (non-claude) counter planned?** | ✅ **YES — confirmed.** F1-TOK (S273-275) + Worker Output Contract (S325-328) + provider-agnostic full-matrix spec (S328) + ADR-093 (S334) all designed it provider-agnostic. Claude-only was rejected 4× as a Law-#2 violation. The design is right; the **wiring is incomplete.** |

**Bottom line:** the *cost* is correct; the *token capture* is the broken half — built but unwired for the default path. The fix is **completing the provider-agnostic capture**, not redesigning cost.

---

## 1. Current-state map (per provider, production result path)

Path: `collectResults → enrichResultTokenUsage (result-collector.ts:442) → enrichResultCost`. Priority: Step0 adapter `.log`/`.cli-output.json` → Step1 claude-CLI log → Step2 keep-real-claim → Step3 **heuristic**.

| Provider / backend | token counts | cacheRead | cacheCreation | status |
|---|---|---|---|---|
| **claude — docker (DEFAULT)** | ESTIMATED (heuristic) | input×4 (fake) | **always 0** | 🔴 fabricated |
| claude — subprocess | REAL | REAL | REAL (but dropped at cost, G6) | ◑ |
| claude — tmux | ESTIMATED | fake | 0 | 🔴 |
| codex-CLI (host) | REAL (+reasoning) | REAL | n/a | ✅ |
| gemini-CLI (host+docker) | REAL (+reasoning/total) | REAL | n/a | ✅ |
| ollama | REAL in/out | 0 hardcoded | n/a | ◑ ($0 local, correct) |
| openai-compatible HTTP | REAL in/out; **cache/reasoning dropped** | 0 | n/a | ◑ (G8) |
| bedrock | no worker path (chat-only) | — | — | — |

`deckent usage` (limit-ledger) reads REAL claude transcripts (`~/.claude/projects/**/*.jsonl`) — genuine but **claude-only + subscription-formula-only**.

### The 11 gaps (file:line)
- **G1** `resolveTokenUsage` (token-counter.ts:285) = the ADR-093 authoritative chain — **zero prod callers** (dead).
- **G2** `readNativeUsage`/session-usage-store.ts:210 — only called by G1 (dead) → session-store (only real cacheCreation source) never read in prod.
- **G3** default docker claude spec (provider-command-spec.ts:74) has **no `--output-format json`** → no envelope → heuristic. (gemini got the flag :97; claude didn't.)
- **G4** `tryExtractUsageViaAdapter` (token-counter.ts:207) reads `.cli-output.json` — **no backend writes it**.
- **G5** heuristic fabrication (result-collector.ts:401): input=estimatedTokens, output=linesAdded×15, cacheRead=input×4, cacheCreation absent.
- **G6** `enrichResultCost` (result-collector.ts:514) passes only {input,output,cacheRead} to cost — **drops cacheCreation** (the limit-dominant cost) even when real.
- **G7** autonomous path (execute-dispatcher.ts:419) calls enrichToken but **not enrichCost** → no `.cost`.
- **G8** openai-compat worker (http-agentic-worker.ts:349) accumulates only {input,output}; rich extractUsage never called → cache/reasoning lost.
- **G9** ollama has no extractUsage; cacheRead hardcoded 0.
- **G10** `calculateRegimeCost`/`billingModeToRegime` (cost-calculator.ts:270/334) — dead (subscription-vs-API regime never applied on result path).
- **G11** subscription runs show phantom metered USD in `.result.cost` (only the dead regime path would re-zero).

---

## 2. The CORRECT architecture (from research — LiteLLM/Vercel-AI/OTel)

### 2.1 One normalized model (`UnifiedUsage`, OTel-GenAI-aligned)
```ts
interface UnifiedUsage {
  input: number;        // NON-cached prompt tokens (normalized — see input-trap)
  output: number;       // generated (INCLUDES reasoning, per billing)
  cacheRead: number;    // served from cache (0 if n/a)
  cacheWrite: number;   // written to cache (Anthropic/Bedrock; 0 else)
  reasoning: number;    // reasoning/thinking subset of output
  total: number;        // input+cacheRead+cacheWrite+output (compute if absent)
  source: 'http-response'|'cli-session-store'|'local-response'|'stream-final'|'generation-endpoint';
  provider: string; surface: string; costUsd?: number;
  authoritative: boolean; // false = client-side tiktoken estimate (must be flagged)
}
```
Field names mirror OTel: `gen_ai.usage.input_tokens / output_tokens / cache_read.input_tokens / cache_creation.input_tokens` → deckent telemetry becomes OTel-native.

### 2.2 The "input trap" (the #1 cost-accounting bug — encode per family)
- **Anthropic / Bedrock / Codex:** `input_tokens` is **fresh-only** → trueInput = input + cacheRead + cacheWrite.
- **OpenAI / Gemini / DeepSeek / Qwen:** `prompt_tokens` is the **total** prompt, `cached_tokens` is a **subset inside it** → freshInput = prompt_tokens − cached_tokens. (DeepSeek self-documents: prompt = hit + miss.)

### 2.3 Adapter-per-SOURCE, keyed by (provider, surface) — never provider alone
3 classes by WHERE usage lives:
- **HTTP response:** anthropic · openai-chat · openai-responses · gemini · deepseek · mistral · xai · cohere(`meta.tokens`) · groq(`x_groq.usage` on stream) · bedrock-converse(camelCase) · vertex · azure · openrouter(+`/generation` native).
- **Local response:** ollama-native(`prompt_eval_count`/`eval_count`) · ollama-v1 · vllm · llamacpp(`tokens_evaluated`/`tokens_predicted`) · lmstudio.
- **CLI session-store (disk):** claude-jsonl(`message.usage`) / claude-result-envelope(`--output-format json`: usage+session_id+total_cost_usd+modelUsage) · codex-rollout(`token_count`, **cumulative→diff consecutive**) · gemini-cli(**OTel only**, no session usage → call HTTP API instead).

**Source ordering (authoritativeness):** HTTP usage > CLI session-store > OpenRouter /generation (async) > **tiktoken estimate (authoritative:false, last resort)**.

### 2.4 Streaming gotchas
OpenAI-family: usage only on FINAL chunk + needs `stream_options:{include_usage:true}`. Anthropic: two-part (message_start input/cache + cumulative message_delta output). Gemini: last chunk usageMetadata. Groq: `x_groq.usage`. Ollama/llama.cpp: final `done:true` object.

### 2.5 Cost — already correct, generalize the cache table (no single multiplier)
| provider | cache write | cache read |
|---|---|---|
| Anthropic | 1.25× (5m) / **2× (1h)** | 0.1× |
| OpenAI | none | 0.5×(GPT-4o)→**0.1×(GPT-5)** per-model |
| Gemini | none + **hourly storage $1-4.5/Mtok·hr** | 0.1× |
| DeepSeek | none | **~0.02×** |

### 2.6 Pricing source: vendor LiteLLM `model_prices_and_context_window.json` offline-first
Fields deckent already needs: `input_cost_per_token, output_cost_per_token, cache_creation_input_token_cost, cache_read_input_token_cost, *_above_1hr, *_above_200k_tokens`. Vendor a committed snapshot (offline default) → CI-refresh (diff+PR) → 3-layer override → unknown model = flagged "no price" (never silent $0).

### 2.7 Tokenizer fallback (provider-independent, when no usage reported)
tiktoken `o200k_base`(GPT-4o/5)/`cl100k_base`(GPT-4) — OpenAI only. Claude/Gemini = server `count_tokens`/`countTokens` (tiktoken undercounts Claude ~15-20%). Open models (Qwen/DeepSeek/Llama) = the model-repo BPE via `@huggingface/transformers`/`@lenml/tokenizers`. Always `authoritative:false` + visibly flagged.

---

## 3. Corrective plan (prioritized — implementation)

**P0 — make the default path REAL (closes G1-G5):**
1. Add `--output-format json` to the claude **docker + tmux** specs (provider-command-spec.ts) so the envelope (usage + session_id) lands in `.log` (gemini already does this). OR capture session_id at spawn → read session-store.
2. Wire `resolveTokenUsage` into `enrichResultTokenUsage` as Step 0 (native-first), feeding it the captured session_id/provider → the dead ADR-093 chain runs.
3. Verification gate: live sprint → `.result.tokenUsage.source ∈ {session-store, envelope}`, cacheCreation>0, cacheRead ≠ input×4.

**P1 — carry the full shape (closes G6/G8/G9):**
4. `enrichResultCost` pass cacheCreationTokens (1-line; cost-calculator already prices it).
5. openai-compat worker: accumulate the rich usage (cache/reasoning) via extractUsage, not the 2-field subset.
6. ollama: real cacheRead (0 is fine for non-cached, but via extractUsage not hardcode).

**P2 — correctness layer (closes G7/G10/G11):**
7. Wire the regime model (subscription→cacheRead weight 0 + cacheWrite premium; API→metered) into the result cost path; label subscription cost as price-equivalent.
8. autonomous path: call enrichCost too.

**P3 — generalize + future-proof:**
9. `UnifiedUsage` (OTel-aligned) as the canonical TaskResultV1 token shape; per-source adapters keyed by (provider, surface); the input-trap normalization.
10. Vendor LiteLLM pricing + CI-refresh; add Anthropic 1h/200k tiers + Haiku/Fable.
11. tiktoken/HF-tokenizer fallback module (authoritative:false) for usage-less tools.

**Mine LiteLLM's per-provider transform modules** rather than hand-deriving ~25 shapes.

---

## 4. Per-provider usage-shape reference (capture map)
HTTP: Anthropic `usage.{input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens}` · OpenAI-chat `usage.{prompt_tokens,completion_tokens,prompt_tokens_details.cached_tokens,completion_tokens_details.reasoning_tokens}` (+stream_options) · OpenAI-responses `usage.{input_tokens,output_tokens,input_tokens_details.cached_tokens,output_tokens_details.reasoning_tokens}` · Gemini `usageMetadata.{promptTokenCount,candidatesTokenCount,cachedContentTokenCount,thoughtsTokenCount}` · DeepSeek `usage.{prompt_cache_hit_tokens,prompt_cache_miss_tokens,completion_tokens}` · Bedrock-Converse `usage.{inputTokens,outputTokens,cacheReadInputTokens,cacheWriteInputTokens}` · OpenRouter inline `usage`+`/api/v1/generation`(native_tokens_*) · Cohere `meta.tokens.{input,output}_tokens` (no total).
Local: Ollama `prompt_eval_count`/`eval_count` · llama.cpp `tokens_evaluated`/`tokens_predicted`/`tokens_cached`.
CLI: claude `~/.claude/projects/{slug}/{uuid}.jsonl message.usage` + `claude -p --output-format json` envelope · codex `~/.codex/sessions/.../rollout-*.jsonl token_count (cumulative)` · gemini-cli OTel-only.

**Standard:** OpenTelemetry GenAI semantic conventions (`gen_ai.usage.*`, `gen_ai.client.token.usage` histogram). **Reference impls:** LiteLLM (`completion_cost`, `stream_chunk_builder`, model_cost map) · Vercel AI SDK v7 (`inputTokenDetails.{cacheReadTokens,cacheWriteTokens}` nested) · tokscale/ccusage (session-store parsers).
