# agent#2 — agent code-audit (permission-types, permission, provider-detect, anthropic, ollama, openai, sse, provider-tooluse/types)

> Read-only structural audit. 8 files read in full. Every finding carries `file:line` + proving snippet.
> Zero-caller/dormant claims grep-verified across `src/` (def + test excluded).
> Categories: unwired | dormant | inconsistent | dead-test | root-cause.
> Scope note: this cluster is the **native agentic transport layer** (`src/agent/`), distinct from the orchestrator's `src/agents/` workers and `src/providers/` CLI-spawn adapters.

## Findings

### unwired (zero production callers — grep-verified)

- _None._ Every exported symbol in the 8 files has a live production caller (grep over `src/`, def+test excluded):
  - `matchRule` → `src/agent/permission.ts:36,42` · `decide` + `resolveTier` → `src/agent/loop.ts:122,125` · `detectTransport` → `src/cli/repl/native-transport.ts:48`.
  - `createAnthropicAdapter` → `native-transport.ts:54`, `src/connectors/bot-completion.ts:105` · `createOpenAIAdapter` → `native-transport.ts:60`, `bot-completion.ts:109`, `provider-tooluse/ollama.ts:16` · `createOllamaAdapter` (agent) → `native-transport.ts:62`.
  - `parseSSE` → `anthropic.ts:68`, `openai.ts:57` · `validateProviderRequest` → `anthropic.ts:38`, `openai.ts:37` · `ApprovalMode`/`PermissionDecision`/`Provider*` types → `loop.ts`, `session.ts`, `permission-policy.ts`, both adapters. Clean category.

### dormant (defined-but-unread / no-op gate in production)

- [dormant|low] `AnthropicEvent.error.message` field is declared but never read — `src/agent/provider-tooluse/anthropic.ts:119` — `error?: { type?: string; message?: string };` — the only consumer of the error frame reads `.type` alone: `:105` `throw new Error(\`anthropic stream error: ${d.error?.type ?? 'unknown'}\`)`. The richer `message` string the API supplies on `overloaded_error`/`invalid_request_error` is parsed into the type but discarded; surfaced errors never include it.

### inconsistent (duplicate / divergent / conflicting definitions)

- [inconsistent|medium] Two divergent `createOllamaAdapter` functions with the same name across subsystems — `src/agent/provider-tooluse/ollama.ts:15` `export function createOllamaAdapter(opts: OllamaAdapterOptions): ProviderAdapter` (thin wrapper over `createOpenAIAdapter`, returns the normalized `ProviderAdapter`) vs `src/providers/ollama.ts:708` `export function createOllamaAdapter(projectDir: string, opts?: {...}): OllamaAdapter` (class-backed orchestrator adapter, different param list + return type). Both are live (`native-transport.ts:62` imports the agent one; `cli/commands/doctor.ts:457` + `core/provider.ts:839` import the providers one). Identical name, two semantics — a rename/refactor hazard and a discoverability trap.

- [inconsistent|low] Synthesized tool-call id prefixes diverge between adapters — `src/agent/provider-tooluse/anthropic.ts:93` `id: cur.id || \`toolu-${cur.name}-${d.index}\`` vs `src/agent/provider-tooluse/openai.ts:81` `id: tc.id || \`call-${tc.name}-${idx}\``. The two adapters carry word-for-word identical comments ("Synthesized id is index-scoped…") but emit different fallback-id conventions. Harmless today (no consumer pattern-matches the prefix), but the shared comment implies a shared scheme that the code does not actually share.

- [inconsistent|low] `usage` event cardinality + system-prompt shape differ between adapters — Anthropic emits exactly one `usage` event, at `message_stop` (`anthropic.ts:96-99`: `outputTokens` latched on `message_delta`, single yield on stop); OpenAI yields a `usage` event on every chunk that carries `chunk.usage` (`openai.ts:85` `if (chunk.usage) yield {...}`). Separately, OpenAI always injects a `system` role message even when `req.system === ''` (`openai.ts:43` `[{ role: 'system', content: req.system }, ...]`) whereas Anthropic passes `system` as a top-level field (`anthropic.ts:46`). A consumer that sums `usage` events (rather than last-wins) would behave differently per backend.

### dead-test (mock-only / stale / tests over dead production code)

- _None._ All 9 dedicated test files (`permission-decide`, `permission-match`, `permission-resolve-tier`, `provider-types`, `provider-detect`, `anthropic-adapter`, `ollama-adapter`, `openai-adapter`, `sse`) assert real behavior. The adapter tests inject `fetchImpl` with **canned SSE bytes** and assert the **real** parsed `ProviderEvent[]` output (e.g. `tests/agent/ollama-adapter.test.ts:11-22` feeds `data: {...}` and asserts `{ type: 'text-delta', text: 'hey' }` + final `{ type: 'done' }` + the resolved URL `…/v1/chat/completions`). That is legitimate transport-level dependency injection, **not** a mock-only/tautological test. 44/44 pass. Clean category.

### root-cause (advisory-soft / trust-without-verify / silent-fallback / hardcoded-0-metric)

- [root-cause|medium] Malformed tool-call arguments silently degrade to empty `{}` instead of failing — `src/agent/provider-tooluse/anthropic.ts:90` `try { args = cur.json ? (JSON.parse(cur.json) as Record<string, unknown>) : {}; } catch { args = {}; }` and the identical `src/agent/provider-tooluse/openai.ts:78` `try { args = tc.args ? (JSON.parse(tc.args) ...) : {}; } catch { args = {}; }`. If a provider streams truncated/invalid `input_json`/`arguments` JSON, the adapter swallows the parse error and emits a `tool-call` event with **empty args** rather than signalling failure. The downstream loop (`loop.ts`) then dispatches the tool with no arguments — a trust-without-verify silent fallback that converts a corrupt-stream signal into a (potentially wrong) successful-looking tool execution.

- [root-cause|low] Unparseable SSE `data:` frames are silently skipped — `src/agent/provider-tooluse/anthropic.ts:70` `try { d = JSON.parse(ev.data) as AnthropicEvent; } catch { continue; }` and `src/agent/provider-tooluse/openai.ts:60` `try { chunk = JSON.parse(ev.data) as OpenAIChunk; } catch { continue; }`. Benign for keep-alive/comment frames, but a genuinely malformed JSON data frame (partial flush, provider bug) is dropped with no log/emit — a content/usage frame could vanish without any error surfacing.

- [root-cause|low] Token usage is silently lost when the Anthropic stream ends without `message_stop` — `src/agent/provider-tooluse/anthropic.ts:98-100` yields the single `usage` event only inside the `message_stop` branch (then `break`); if the `for await` drains without a `message_stop` (dropped connection, early close), control falls through to `:108` `yield { type: 'done' }` and **no `usage` event is ever emitted** → the turn reports 0/absent tokens with no error. Anthropic-only; OpenAI latches usage per-chunk.

- [root-cause|low] OpenAI/Ollama token metric is `0`/absent when the endpoint ignores `include_usage` — `src/agent/provider-tooluse/openai.ts:42` requests `stream_options: { include_usage: true }`, but usage is emitted only `if (chunk.usage)` (`:85`). Endpoints that don't honor `include_usage` (notably local **Ollama** via the wrapper at `ollama.ts:16`, and some vLLM builds) never send a usage chunk, so the loop silently records zero tokens for the turn — a hardcoded-0-metric outcome with no fallback estimate or warning.

- [root-cause|low] `validateProviderRequest` verifies only the shape of `tools`, not its elements — `src/agent/provider-tooluse/types.ts:60` `if (!Array.isArray(r.tools)) return 'tools must be an array';` then `:61 return null`. Message `role`/`content` are checked element-by-element (`:55-59`), but each tool's `name`/`description`/`input_schema` is trusted unverified. A malformed tool object flows straight into `body.tools` (`anthropic.ts:49`, `openai.ts:46`) where `t.name`/`t.input_schema` may be `undefined` — trust-without-verify at the validation boundary the header comment frames as the request guard.

## Summary

8 native-transport files audited (all read in full); zero source changes. `tsc --noEmit` clean (exit 0); the 9 dedicated test files for this cluster pass (44/44). **9 findings**:

- **unwired (0):** every export is wired (callers listed above).
- **dormant (1):** `AnthropicEvent.error.message` declared but never read (only `.type` surfaces).
- **inconsistent (3):** duplicate `createOllamaAdapter` name across `agent/provider-tooluse/` vs `providers/` (divergent signature+return); divergent synthesized tool-call id prefixes (`toolu-` vs `call-`) under identical comments; `usage` event cardinality (single-at-stop vs per-chunk) + empty-`system`-message shape diverge between adapters.
- **dead-test (0):** adapter tests use injected `fetchImpl` over canned SSE and assert real parsed output — legitimate DI, not mock-only.
- **root-cause (5):** malformed tool-call args silently degrade to `{}` in both adapters (the highest-leverage one — corrupt stream → empty-arg tool dispatch); unparseable SSE frames silently `continue`; Anthropic usage lost on missing `message_stop`; OpenAI/Ollama usage silently `0` when `include_usage` is ignored; `validateProviderRequest` trusts tool-element shape unverified.

Highest-leverage: the **`catch { args = {} }`** fallback shared by `anthropic.ts:90` and `openai.ts:78` — it turns a corrupt tool-call stream into a silently-empty-argument tool execution rather than an error, which is the one finding here with real runtime-safety impact. The two **usage** gaps (Anthropic no-`message_stop`, OpenAI/Ollama no-`include_usage`) make token accounting silently under-report for local/interrupted turns. The duplicate `createOllamaAdapter` name is a maintainability trap, not a runtime defect. Note: `sse.ts` end-of-stream flush (`:37-44`) was checked and is correct — the in-loop blank-line flush already drains multi-line records, so the trailing single-line handler is not a defect.
