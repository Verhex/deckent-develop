# Persona-as-System-Prompt Agent Spawning Across Providers

**Status:** analysis + design proposal. **Proposes only — no production code changes.**
**Date:** 2026-08-11 · **Task:** 520-008 · **Trigger:** owner decision **D4-EK** on
[the agent catalog authority design](./agent-catalog-authority-design-2026-08-11.md).

> D4-EK (Alperen, 2026-08-11): *"iş-bazında agent-personasını system-prompt olarak enjekte etmek —
> `claude -p --append-system-prompt` benzeri komutlarla deckent-agent spawn'ı; yalnız Anthropic değil,
> api+subscription en popüler ~20 provider çerçevesinde tartışılıp analiz edilecek."*

The question in one line: **today deckent glues the agent persona into the user prompt; should it
instead hand the persona to the provider through a real system-role channel, and can that be done
provider-neutrally across API and subscription modes?**

Short answer from the code: deckent currently has **no system-prompt channel on any spawn path**.
One adapter (`bedrock`) wires a true `system` field, but its `spawn()` is a stub, so no worker has
ever been launched through it. Everything else — including every subscription-mode CLI — delivers
the persona as ordinary user-prompt text. The change D4-EK proposes is therefore not a tweak of an
existing seam; the seam does not exist yet and has to be designed into the spawn contract.

**Contents**

- Part 1 — Code truth: how each current adapter injects persona today
- Part 2 — Capability matrix: system-prompt channels across ~22 providers (CLI · API · subscription)
- Part 3 — Design proposal: a provider-neutral persona-injection contract
- Appendix A — Verification legend and method
- Appendix B — Reproduction commands

---

## Part 1 — Code truth: how deckent injects persona today

### 1.0 Where the persona comes from before any adapter sees it

The persona never reaches an adapter as a *persona*. It reaches it as a slice of one flat prompt
string.

| Step | Anchor | What happens |
| --- | --- | --- |
| Persona text loaded | `src/orchestra/prompt-god-template.ts:72-73` (`agentPrompt?: string` = "full PROMPT.md text") | The agent's `PROMPT.md` body enters the template context as a plain string. |
| Render mode chosen | `src/orchestra/prompt-god-template.ts:200-210` (`personaRenderMode?: 'full' \| 'guidance'`) | `'guidance'` emits an intent-selected slice plus a `[full persona: <path>]` pointer instead of the whole body. |
| Persona block built | `src/orchestra/prompt-god-template.ts:518` → `buildAgentBlock` (`:649-681`) | Produces an identity line + persona body (or slice + pointer to `.deckent/agents/<id>/PROMPT.md`, `:643-644`). |
| Block placed in the prompt | `src/orchestra/prompt-god-template.ts:2108` (`push('T1', 'persona', agentBlock)`) | Persona is tier **T1** inside the *single* assembled prompt — a segment of the user message, not a channel. |
| Prompt materialised | `src/orchestra/tmux.ts:80-82` (`writePromptFile`), `:301-311` (spawn writes the file, then `send-keys`) | The whole composed string is written to one temp file and fed to the provider CLI. |

Two precedence guards already exist *inside that same user prompt* because persona and task can
conflict — `src/orchestra/prompt-god-template.ts:1797-1798` emits the "Verify-precedence (this task
overrides your persona)" and "Result-precedence (PCOMP-W6)" lines. **This is load-bearing for Part 3:**
deckent's current model is *task text outranks persona text*, which is only coherent while both live
in the same channel at the same authority level.

### 1.1 Per-adapter truth table

Legend for the last column: **system channel used for persona?**
`no` = persona rides the user prompt · `type-only` = a system role exists in the types but nothing
constructs one · `wired-but-unreachable` = a real system field exists on a code path no spawn uses.

| Adapter | File | Exact injection shape today | System channel for persona? |
| --- | --- | --- | --- |
| Claude CLI (tmux backend) | `src/providers/claude.ts:369-412` | `claude -p - --model <apiId> [--allowedTools '…'] [--dangerously-skip-permissions] [--effort <e>] [--exclude-dynamic-system-prompt-sections] < <promptPath>` | **no** — persona is inside `promptPath`, delivered on stdin |
| Claude CLI (subprocess backend, adapter form) | `src/providers/claude.ts:380-397` | `claude -p "<promptPath>" --dangerously-skip-permissions --model <apiId> [--allowedTools …] [--effort …] [--exclude-dynamic-system-prompt-sections]` | **no** |
| Claude CLI (canonical subprocess config) | `src/providers/subprocess.ts:126-147` (`CLAUDE_SUBPROCESS_CONFIG.buildArgs`) | `['-p','-','--model',<apiId>, …]`, prompt on stdin | **no** — and the comment at `:141-142` states it outright: *"this backend never passes `--system-prompt`, so the flag always applies"* |
| Codex CLI | `src/providers/codex.ts:575-589` (`buildArgs`), `:530` (`buildCommand`) | `codex exec --full-auto <prompt> --model <wireModel> [-c model_reasoning_effort=<e>]`; command form `codex exec --full-auto "$(cat <promptPath>)" --model <apiId>` | **no** — persona is the positional prompt argument |
| Gemini CLI | `src/providers/gemini.ts:542-544` (`buildArgs`), `:566-568` (`buildCommand`) | `gemini -p <prompt> --output-format json -m <model> --approval-mode yolo --skip-trust`; command form `gemini -p "$(cat <promptPath>)" …` | **no** |
| Gemini REST fallback builder | `src/providers/gemini.ts:668`, `:701` | body is `contents: [{ parts: [{ text: '<prompt>' }] }]` | **no** — no `systemInstruction`-shaped field is emitted |
| Ollama (`/api/generate`) | `src/providers/ollama.ts:552-556`, curl form `:632-637` | `{ model: <apiId>, prompt: <prompt>, stream: false }` | **no** — body carries no system field |
| Ollama (`/api/chat` stream) | `src/providers/ollama.ts:585-591` | `{ model, messages: [{ role: 'user', content: prompt }], … }` | **no** — single user-role message |
| OpenAI-compatible HTTP | `src/providers/openai-compatible.ts:43`, `:218-241`, `:336` | `ChatMessage.role` union **includes `'system'`** (`:43`); `send()` forwards a caller-supplied `messages[]` into the `/chat/completions` body verbatim (`:218-241`); `spawn()` ignores `_prompt` and hands off to `http-agentic-worker`, which reads `.tasks/task-{id}.json` (`:326-336`) | **type-only** — the role exists, no adapter code ever emits a system message |
| OpenRouter | `src/providers/openrouter.ts:238-249`, `:576-589`, `:460` | same `/chat/completions` body shape; `buildPlannerInvocation` builds `[{ role: 'user', content: prompt }]` (`:589`); `spawn()` delegates to the same agentic worker (`:460`) | **type-only** — user-role only in every constructed message |
| Bedrock (Anthropic-on-Bedrock) | `src/providers/bedrock.ts:60`, `:67`, `:273-279` | `BedrockMessage.role` is `'user' \| 'assistant'` only (`:60`); `BedrockSendOptions.system?: string` (`:67`) → `requestBody['system'] = opts.system` (`:277-279`) — the Anthropic-native top-level system param | **wired-but-unreachable** — `spawn()` is a stub (`:362`), `buildCommand()` too (`:374`); no worker is launched this way |
| Sandbox wrapper | `src/providers/sandbox.ts:54-65` | forwards `prompt` unchanged to `super.spawn(...)` | **no** — pass-through |

### 1.2 The one system-prompt flag deckent already sets — and what it does *not* do

`--exclude-dynamic-system-prompt-sections` appears at `src/providers/claude.ts:392`, `:410` and
`src/providers/subprocess.ts:143`, `:161`, gated by `ProviderSpawnOptions.excludeDynamicPromptSections`
(`src/core/provider.ts:40-48`).

It is easy to misread this as persona plumbing. It is the opposite: it *removes* per-machine sections
(cwd, env, memory paths, git status) from the **CLI's own default system prompt** so the system-prompt
prefix stays byte-stable for prompt-cache reuse. It moves content *out of* the system prompt and into
the first user message. It never puts deckent content *into* the system prompt.

Its doc comment also records the precedent this design must not repeat:
> *"Only the claude arg-builders honor it; other providers ignore it (no equivalent flag)."*
> — `src/core/provider.ts:46-47`

A silently-ignored capability option is acceptable for a cache hint. It is **not** acceptable for
persona: an ignored persona injection means the agent is not the agent.

### 1.3 The dormant Anthropic system-role helper

`src/providers/claude.ts:841-845` defines `AnthropicMessageLike` with `role: 'user' | 'assistant' | 'system'`,
and `attachCacheControlToMessages` (`:865+`) marks the first system message with
`cache_control: { type: 'ephemeral' }`, falling back to the first user message when no system role is
present. Its own comment (`:860-863`) says it is *"wired by future API-mode adapters"* and that today
the CLI subscription path relies on prompt-content hashing instead.

So the repo already contains the shape of an API-mode system channel *and* the caching logic that
would make a stable persona prefix pay for itself — both unwired.

### 1.4 The contract gap

`ProviderSpawnOptions` (`src/core/provider.ts:26-86`) carries `allowedTools`, `autoApprove`,
`projectDir`, `logPath`, `env`, `reasoningEffort`, `excludeDynamicPromptSections`,
`taskTimeoutSeconds`, `deckBroker`, `liveTraceEnabled`, `sprintId`, `executionBudget`,
`executionLandingPolicy`, `executionAdmissionMode`.

**There is no persona field, no system-prompt field, and no capability declaration about either.**
`ProviderAdapter.spawn(taskId, model, prompt, opts)` (`src/core/provider.ts:248`) takes exactly one
prompt string. That single-string signature is the reason persona-as-system-prompt cannot be
expressed today — not any provider limitation.

### 1.5 Findings

1. **Zero spawn paths use a system channel.** Across all 11 adapter paths above, persona is user text.
2. **Two adapters already type the channel** (`openai-compatible.ts:43`, `claude.ts:841`) and one
   *wires* it (`bedrock.ts:277`) — so the change is additive, not a rewrite.
3. **The blocker is the spawn contract, not the providers.** `spawn(..., prompt: string, ...)` has no
   slot for a second channel.
4. **Persona resolution and prompt assembly are the same step today** (`prompt-god-template.ts:518`),
   which is exactly the coupling the agent-catalog design's slice S3 ("Prompt resolution folded into
   the resolver") plans to break. Persona-as-system-prompt should ride that slice, not fork from it.
5. **A precedence inversion is latent.** Moving persona to a system channel raises its authority above
   task text on most models, while `prompt-god-template.ts:1797-1798` deliberately asserts the
   reverse. This is a design decision for the owner, not an implementation detail (see D-C).

---

## Part 2 — Capability matrix: system-prompt channels across providers

### 2.0 How to read this matrix (read this before trusting a cell)

| Label | Meaning |
| --- | --- |
| `repo-verified` | The shape is verifiable **in this repository** at the cited anchor. Trustworthy now. |
| `needs-live-verification` | A provider-side surface that **cannot be verified from this repo**. Where a flag or field name is recalled from training data it is written in `code font` and still carries this label. Treat every such name as a hypothesis to confirm against `--help` / the live API before any code depends on it. |
| `absent-in-repo` | deckent has no adapter for this provider; the row exists for coverage of D4-EK's "~20 providers", not because code exists. |

**No flag in this document is asserted as verified unless it appears in this repository.** The only
flags with in-repo evidence are: `-p`, `--model`/`-m`, `--allowedTools`, `--dangerously-skip-permissions`,
`--effort`, `--exclude-dynamic-system-prompt-sections`, `--output-format`, `--verbose`, `exec`,
`--full-auto`, `-c <key>=<value>`, `--approval-mode`, `--skip-trust`. Notably **`--append-system-prompt`
does not appear anywhere in this repository** — it comes from the owner's D4-EK text and is therefore
`needs-live-verification` here.

"Subscription mode" below means: the provider is reached through a seat/plan login (Claude Pro/Max,
ChatGPT Plus/Pro, Google AI Pro/Ultra, Copilot seat, …) rather than a metered API key — which in
practice almost always means **the CLI or IDE client is the only entry point**, so the subscription
column is usually a restatement of the CLI column plus "no direct HTTP body control".

### 2.1 Providers with an adapter in this repository

| # | Provider | CLI / agentic mode | API mode | Subscription mode | Channel shape |
| --- | --- | --- | --- | --- | --- |
| 1 | **Anthropic Claude** (`claude.ts`, `subprocess.ts`) | deckent passes **no** system flag today (`repo-verified`, `subprocess.ts:141-142`). Owner cites `claude -p --append-system-prompt <text>` (`needs-live-verification`); a `--system-prompt` replacement form is implied by the same comment (`needs-live-verification`). | Messages API top-level `system` param — `repo-verified` by proxy at `bedrock.ts:273-279`; `AnthropicMessageLike` role `'system'` at `claude.ts:841`. | Claude Pro/Max drives the same `claude` CLI; whatever the CLI exposes is the whole surface. `needs-live-verification` whether system-prompt flags are plan-gated. | Append-to-default vs replace-default is a **material** distinction: append preserves the CLI's tool/agent scaffolding, replace can break it. Confirm which before design lock. |
| 2 | **OpenAI Codex CLI** (`codex.ts`) | No system flag used (`repo-verified`, `codex.ts:575-589`). A generic `-c <key>=<value>` config override **is** used for `model_reasoning_effort` (`repo-verified`, `:586`) — so a config-key route plausibly exists, but the key name for instructions is `needs-live-verification`. Codex also conventionally reads a repo instructions file (`AGENTS.md`-style) — `needs-live-verification`. | Not used by this adapter; Codex CLI is the transport. | ChatGPT Plus/Pro login drives the same binary; note `codex.ts:576-581` records that a subscription rejects some model ids — evidence that **subscription mode already differs behaviourally** from API mode on this provider. | Two candidate channels: `-c` config key, or a file-based instruction convention. Both need live confirmation. |
| 3 | **Google Gemini CLI** (`gemini.ts`) | No system flag used (`repo-verified`, `gemini.ts:542-544`). A `--system-prompt`-shaped flag or a `GEMINI.md`-style context file are both plausible — `needs-live-verification`. | `generateContent` supports a `systemInstruction`-shaped field — `needs-live-verification`; deckent's REST builder omits it (`repo-verified`, `gemini.ts:668`, `:701`). | Google AI Pro/Ultra & Code Assist drive the same CLI. `needs-live-verification`. | If `systemInstruction` confirms, Gemini API mode is a clean native channel. |
| 4 | **Ollama** (local, `ollama.ts`) | Local HTTP, not a CLI arg surface for deckent. | `/api/generate` accepts a `system` field and `/api/chat` accepts a `role:'system'` message — both `needs-live-verification`; deckent emits **neither** (`repo-verified`, `ollama.ts:552-556`, `:585-591`). | n/a (local, no subscription). | Highest-confidence early adopter: fully local, free to verify, no billing risk. |
| 5 | **OpenAI-compatible gateways** (`openai-compatible.ts`) | n/a (HTTP adapter). | `messages[].role === 'system'` — `repo-verified` in the type at `:43`; the body builder forwards `messages` verbatim (`:218-241`) and `extraBody` explicitly **cannot** hijack `messages` (`:137-149`). | Depends on the gateway behind it. | The single cleanest insertion point in the whole repo: prepend one system message to `messages[]`. |
| 6 | **OpenRouter** (`openrouter.ts`) | n/a (HTTP adapter). | Same `/chat/completions` shape (`repo-verified`, `:238-249`); constructed messages are user-role only (`:589`). Per-model translation of the system role is done by OpenRouter itself — `needs-live-verification` for models whose native format has no system role. | OpenRouter is credit-based, not seat-based. | Same one-line insertion as row 5, but the **downstream model may silently reshape** the system message. |
| 7 | **AWS Bedrock** (`bedrock.ts`) | n/a. | Top-level `system: string` on the Anthropic-on-Bedrock invoke body — **`repo-verified`**, `bedrock.ts:67`, `:273-279`. Note `BedrockMessage.role` excludes `'system'` (`:60`) — system is *not* a message here. | Enterprise contract, not a consumer subscription. | The only true system channel already written in deckent — and unreachable, since `spawn()` is a stub (`:362`). |

### 2.2 Major providers without an adapter here (`absent-in-repo`, for D4-EK coverage)

Every cell below is `needs-live-verification`. The value of the table is the **channel taxonomy**, not
the flag names.

| # | Provider | API-mode channel (recalled — verify) | CLI / agentic mode | Subscription mode | Taxonomy |
| --- | --- | --- | --- | --- | --- |
| 8 | **OpenAI direct API** | `messages[].role='system'`; newer Responses-style APIs use a top-level `instructions`-shaped field; some reasoning models rename the role to `developer` | via Codex CLI (row 2) | ChatGPT Plus/Pro → CLI/IDE only | native-message + native-param |
| 9 | **Azure OpenAI** | wire-compatible with OpenAI chat completions | Azure CLI is control-plane, not inference | enterprise agreement | native-message |
| 10 | **Google Vertex AI** | Gemini `systemInstruction`-shaped field; Anthropic-on-Vertex mirrors the Anthropic `system` param | `gcloud` is control-plane | enterprise | native-param |
| 11 | **Anthropic direct API** | top-level `system` param (same shape as row 7) | `claude` CLI (row 1) | Pro/Max → CLI | native-param |
| 12 | **Mistral** | OpenAI-compatible `system` role | — | — | native-message |
| 13 | **Cohere** | a dedicated preamble/system-message concept distinct from OpenAI's | — | — | native-param (non-OpenAI shape) |
| 14 | **xAI Grok** | OpenAI-compatible surface | — | X Premium+ → app/IDE clients | native-message |
| 15 | **DeepSeek** | OpenAI-compatible `system` role; note `prompt_cache_hit_tokens` is already handled at `openai-compatible.ts:571` (`repo-verified` that deckent talks to DeepSeek-shaped responses) | — | — | native-message |
| 16 | **Alibaba Qwen / DashScope** | OpenAI-compatible endpoint plus a native endpoint; a Qwen-branded CLI exists | CLI plausible | plan-based in some regions | native-message |
| 17 | **Moonshot Kimi** | OpenAI-compatible | — | consumer plan → app only | native-message |
| 18 | **Zhipu GLM** | OpenAI-compatible | — | — | native-message |
| 19 | **Groq** | OpenAI-compatible (inference host) | — | — | native-message |
| 20 | **Together AI** | OpenAI-compatible (inference host) | — | — | native-message |
| 21 | **Fireworks AI** | OpenAI-compatible (inference host) | — | — | native-message |
| 22 | **Perplexity** | OpenAI-compatible; system-message handling may be constrained by its search pipeline | — | Pro → app only | native-message (constrained) |
| 23 | **GitHub Copilot** | no general-purpose public chat API for arbitrary system prompts | IDE/CLI client; repo instruction files are the de-facto persona channel | seat-based | **file-convention only** |
| 24 | **Amazon Q Developer** | IDE/CLI oriented | CLI exists | seat-based | file-convention / opaque |
| 25 | **Cursor** | proprietary agent client | IDE-embedded | seat-based | **file-convention only** (rules files) |
| 26 | **LM Studio / llama.cpp server** | OpenAI-compatible local server | local | n/a | native-message |
| 27 | **Hugging Face Inference** | varies per model/task; chat endpoints are OpenAI-compatible | — | PRO plan | native-message (per-model) |

### 2.3 What the matrix actually says

Collapse 27 rows and only **five** channel kinds exist:

| Kind | Meaning | Examples | Fidelity |
| --- | --- | --- | --- |
| **A. `system-param`** | a dedicated top-level request field | Anthropic/Bedrock `system` (`repo-verified`), Gemini `systemInstruction` (verify) | highest — never confused with conversation |
| **B. `system-message`** | a first message with a system/developer role | every OpenAI-compatible surface (`repo-verified` type at `openai-compatible.ts:43`) | high — but the host may reshape it per model |
| **C. `cli-arg`** | a CLI flag carrying system text | `--append-system-prompt` / `--system-prompt` shapes (all `needs-live-verification`) | high — but argv-length and quoting limits bite on multi-KB personas |
| **D. `cli-config` / `file-convention`** | a config key or an on-disk instructions file the client reads | codex `-c` (`repo-verified` mechanism), `AGENTS.md`/`GEMINI.md`/rules-file conventions (verify) | medium — persona becomes ambient repo state, not per-spawn state |
| **E. `none`** | no addressable channel | closed agent clients | zero — must degrade |

Three consequences worth stating plainly:

1. **Subscription mode almost never adds a channel; it removes one.** A seat login routes you through
   a client binary, so kinds A and B become unreachable and you are left with C, D, or E. Any design
   that assumes "we can always set a system field" is wrong for exactly the modes deckent's dogfood
   runs on today (`claude` CLI, `codex` CLI, `gemini` CLI — rows 1-3, all currently **kind E in
   practice** because deckent passes nothing).
2. **Kind D is per-repo, not per-spawn.** A file-convention channel is shared by every concurrent
   worker in the same worktree. deckent runs many workers in parallel with *different* personas, so
   kind D is unusable for per-task persona without worktree isolation — it is a fallback for
   single-worker or worktree-isolated runs only.
3. **Kind C has a hard size limit that persona rendering already anticipates.** `personaRenderMode`
   (`prompt-god-template.ts:200-210`) exists precisely because full `PROMPT.md` bodies are large. A
   CLI-arg channel may only accept the `'guidance'` slice, while an API channel accepts `'full'` —
   i.e. **channel kind can change what persona content is renderable**, which is a routing input, not
   a rendering detail.

---

## Part 3 — Design proposal: a provider-neutral persona-injection contract

**Proposes only.** No file below is edited by this task.

### 3.1 Design constraints this must satisfy

| # | Constraint | Source |
| --- | --- | --- |
| C1 | Persona resolves from the agent catalog authority, not from ad-hoc file reads | agent catalog design, slice S3 |
| C2 | An agent with no resolvable persona is **non-routable** | owner D4: *"capabilities YOKSA kesin non-routable"* |
| C3 | `preferredModel` failure must **not** block routing — any model can wear the persona | owner D4 |
| C4 | **No provider names on code paths.** Behaviour comes from adapter capability declarations | task NO-GO condition; ADR-D-004 C5 (narrow, registered exceptions only) |
| C5 | Degradation must be **typed and visible**, never silent | CLAUDE.md: *"unsupported platform fail honestly, never silently"* (Law 2) |
| C6 | Full platform/mode matrix designed up front — CLI · API · subscription · local · sandboxed | Law 2 |
| C7 | No MVP; the contract covers all five channel kinds from day one | Law 3 |
| C8 | i18n: persona content is agent-authored data, not UI text; any operator-facing message about degradation goes through `getMessage` | CLAUDE.md quality bar |

### 3.2 The contract — three types, one resolution, one injection

**(a) `ResolvedPersona` — produced by the catalog resolver, provider-agnostic.**

```
ResolvedPersona {
  agentId: string                     // stable catalog identity (agent-catalog design §3.2)
  version: string                     // catalog schema/content version
  renderModes: {
    full:     { text: string, bytes: number }
    guidance: { text: string, bytes: number, pointerPath: string }   // existing 'guidance' slice
  }
  digest: string                      // content hash — cache-prefix identity + evidence anchor
  authority: 'persona'                // fixed tier; see D-C
}
```

It carries **both** render modes because §2.3(3) showed the channel decides which one fits. Resolution
happens once, in the resolver, exactly where the catalog design already puts prompt resolution — this
proposal adds no second resolution path.

**(b) `PersonaChannelCapability` — declared by each adapter, read by the spawn layer.**

```
PersonaChannelCapability {
  kind: 'system-param' | 'system-message' | 'cli-arg' | 'cli-config' | 'none'
  maxBytes?: number                   // e.g. argv budget for 'cli-arg'
  semantics?: 'append' | 'replace'    // does provider default system prompt survive?
  perSpawnIsolated: boolean           // false for file-convention channels (§2.3(2))
  verification: 'repo-verified' | 'needs-live-verification'
  evidenceRef?: string                // probe/receipt id that established the capability
}
```

Every branch in the spawn layer keys off `kind`, `maxBytes`, `semantics`, `perSpawnIsolated` — never
off `adapter.name`. That is C4 made mechanical, and it is checkable by a lint (slice S7).

**(c) `ProviderSpawnOptions.persona?: PersonaSpawnRequest` — the missing slot from §1.4.**

```
PersonaSpawnRequest {
  persona: ResolvedPersona
  preferredMode: 'full' | 'guidance'  // what the task wants; channel may downgrade it
  onUnavailable: 'degrade' | 'hold'   // policy, config-resolved (see D-D)
}
```

Adding one optional field to `ProviderSpawnOptions` (`src/core/provider.ts:26-86`) is the whole
signature change. `spawn()` keeps its `prompt: string` parameter; nothing existing breaks.

### 3.3 The degradation ladder

Given a `PersonaSpawnRequest` and a `PersonaChannelCapability`, the spawn layer walks a **fixed,
provider-independent** ladder and returns a typed outcome:

| Rung | Condition | Action | Recorded outcome |
| --- | --- | --- | --- |
| 1 | `kind` ∈ {`system-param`, `system-message`} | inject persona into the native channel at `preferredMode` | `native` |
| 2 | `kind === 'cli-arg'` and `bytes ≤ maxBytes` | inject via the declared flag | `native` |
| 3 | `kind === 'cli-arg'` and `full` exceeds `maxBytes` but `guidance` fits | inject `guidance`; the `[full persona: …]` pointer (`prompt-god-template.ts:665`) already tells the agent where the rest is | `native-downgraded` |
| 4 | `kind === 'cli-config'` **and** `perSpawnIsolated === true` | write the scoped config/file, inject, clean up | `native-ambient` |
| 5 | `kind === 'cli-config'` and `perSpawnIsolated === false` | **refuse the channel** — concurrent workers would overwrite one another (§2.3(2)) | falls to rung 6 |
| 6 | `kind === 'none'`, or any rung above refused, and `onUnavailable === 'degrade'` | today's behaviour: persona stays tier T1 in the user prompt (`prompt-god-template.ts:2108`) | `degraded-to-prompt` |
| 7 | as rung 6 but `onUnavailable === 'hold'` | typed `unavailable/HOLD`, no spawn | `held` |
| 8 | persona itself unresolvable | **non-routable** per owner D4 — the agent cannot be spawned at all | `non-routable` |

Rung 6 is why this design is safe to land incrementally: **the floor of the ladder is exactly what
deckent does today**, so every unimplemented channel behaves as it does now, but says so.

### 3.4 Interaction with prompt caching (do not lose the win)

Moving persona into a system channel is also a **cache-prefix** change:

- `attachCacheControlToMessages` (`claude.ts:865+`) already marks the first system message with
  `cache_control: ephemeral`, falling back to the first user message when no system role exists.
  A persona system message makes that helper hit its intended branch for the first time.
- `--exclude-dynamic-system-prompt-sections` (`claude.ts:392`, `subprocess.ts:143`) exists to keep the
  system prefix byte-stable. If deckent starts writing its own system prompt, the interaction between
  a deckent-authored system prefix and that flag must be re-measured — `semantics: 'append' | 'replace'`
  in the capability is the field that decides it.
- `ResolvedPersona.digest` is the natural cache-prefix key: **same agent + same version ⇒ same system
  prefix across every task**, which is a much better cache story than today's per-task composed string.

This is a genuine efficiency argument for the change, independent of behavioural fidelity — but it is
also a reason to require measurement rather than assume the win (slice S6).

### 3.5 The precedence problem (the real risk in this proposal)

deckent currently asserts **task > persona** inside one channel
(`prompt-god-template.ts:1797-1798`: verify-precedence and result-precedence). Providers generally
treat the system channel as **higher** authority than user text. Promoting persona to the system
channel therefore silently inverts deckent's own precedence chain: a persona saying "always run the
full suite" would outrank a task saying "run only the targeted test file".

Three candidate resolutions, for owner choice (D-C):

| Option | Mechanism | Cost |
| --- | --- | --- |
| **P1 — Persona-only system channel** | System carries persona **identity/expertise only**; all *procedure* text (verify mandates, output formats) stays in the task prompt. Requires splitting `PROMPT.md` into identity vs procedure — which is exactly what owner D8 already opened (*"PROMPT.md formatı sorgulanacak"*). | Persona files must be restructured; highest long-term payoff |
| **P2 — Precedence preamble in the system channel** | The system prompt begins with a deckent-authored precedence clause stating the task contract outranks persona procedure. | Cheap; relies on model compliance, not structure |
| **P3 — Keep persona in the user prompt** | Reject D4-EK's premise; use the system channel only for a small deckent operating contract. | Zero fidelity gain from the change |

**Recommendation: P1, with P2 as the interim** — P2 ships with slice S3, P1 lands with the D8
`PROMPT.md` reformat, and the two compose (a restructured persona still benefits from the preamble).

### 3.6 Security and multi-tenancy notes

- Persona text becomes higher-authority content. The catalog authority (owner-approved promotion only
  — owner D7: *"hiçbir otonomluk yok"*) is therefore also a **privilege boundary**, not just a
  quality gate. A learned/promoted agent's persona would execute at system authority.
- `cli-arg` channels put persona text on the process command line, where it is visible in `ps` output
  and in any command echo. For multi-tenant hosts, prefer a file-fed or stdin-fed form; the capability
  should carry an explicit `argvVisible: boolean` if a `cli-arg` channel is adopted.
- `cli-config`/file-convention channels write persona to disk in the workspace — cross-tenant leakage
  risk if the workspace is shared. Rung 5 already refuses the non-isolated case for correctness; the
  same rule doubles as the security rule.
- Nothing here touches credentials, so the existing scrub/broker path (`src/core/provider.ts:58-70`)
  is unaffected.

### 3.7 Implementation slices (admission-sized, dependency-ordered)

Each slice is independently admissible and independently verifiable. No slice both adds a capability
and flips behaviour.

| Slice | Content | Verification | Depends on |
| --- | --- | --- | --- |
| **S0 — Live capability probe** | For rows 1-4 of §2.1, run `--help`/local API probes and record real evidence; convert every `needs-live-verification` cell in §2.1 to a verified or refuted fact. **Produces evidence, changes no code.** | probe transcripts stored as evidence artifacts | — |
| **S1 — Types only** | Add `ResolvedPersona`, `PersonaChannelCapability`, `PersonaSpawnRequest`; add optional `persona` to `ProviderSpawnOptions`. No behaviour. | `tsc --noEmit`; no runtime diff | S0 (for field shapes) |
| **S2 — Capability declarations** | Every adapter declares its `PersonaChannelCapability`. Adapters with no confirmed channel declare `kind: 'none'` **honestly** — not optimistically. | unit test asserting every adapter declares one | S1 |
| **S3 — Ladder + degrade floor** | Implement §3.3 rungs 6-8 only: resolve persona from the catalog, and when no channel exists, keep today's user-prompt path but emit the typed `degraded-to-prompt` outcome. Ship the P2 precedence preamble. **Behaviour-neutral by construction.** | targeted tests on the ladder; a byte-identical prompt assertion vs today | S2, catalog design S3 |
| **S4 — Native channels, HTTP first** | Rungs 1-2 for `system-message` (`openai-compatible.ts`, `openrouter.ts`) and `system-param` (`bedrock.ts` — already has the field at `:277`). Local `ollama` first for free verification. | targeted adapter tests + a real local Ollama run | S3 |
| **S5 — Native channels, CLI/subscription** | Rungs 2-4 for the CLI adapters, strictly per S0's verified flags. `maxBytes` enforcement and the `full`→`guidance` downgrade (rung 3). | real-binary spawn proof per adapter | S4, S0 |
| **S6 — Evidence + cache measurement** | Record the ladder outcome per spawn in the execution authority trail; measure cache-hit deltas against `ResolvedPersona.digest` as prefix key. | before/after cache-read token comparison | S4 |
| **S7 — Enforcement** | Lint that no provider-name string literal appears on the persona-injection path (C4/ADR-D-004 C5 in the same spirit as `authority-enforcer.ts`). | lint gate | S5 |
| **S8 — Persona restructure (P1)** | Split identity vs procedure in `PROMPT.md`, per owner D8; system channel carries identity only. | catalog-level schema validation | S3, owner D8 |

Rollout posture per CLAUDE.md: **flag-gated first, default later.** S3-S5 land behind a
config-resolved switch; the default flips only after S6 shows no fidelity regression.

### 3.8 Owner decision points

| ID | Decision | Options | Note |
| --- | --- | --- | --- |
| **D-A** | Do we adopt persona-as-system-prompt at all? | (a) yes, ladder as designed · (b) yes but API modes only · (c) no (P3) | §1 shows the seam must be built either way if the catalog is to own persona resolution |
| **D-B** | Which persona content goes into the system channel? | (a) identity only · (b) whole `PROMPT.md` · (c) render-mode-dependent | Interacts with `maxBytes` (§2.3(3)) |
| **D-C** | How is task-over-persona precedence preserved? | **P1** (restructure) · **P2** (preamble) · **P3** (no change) | Recommended: P2 now, P1 with D8. This is the highest-risk item |
| **D-D** | Default for `onUnavailable` | (a) `degrade` — spawn with persona in the prompt · (b) `hold` — typed HOLD | (a) matches today; (b) is stricter but would block every current CLI path until S5 |
| **D-E** | Is a file-convention (`kind: 'cli-config'`) channel acceptable at all? | (a) never · (b) only when worktree-isolated · (c) yes | Rung 5 currently refuses the non-isolated case |
| **D-F** | Does a broken/absent persona make an agent non-routable at spawn time too? | (a) yes, consistent with D4 · (b) warn and spawn personaless | D4 already answered the catalog side; this extends it to the spawn boundary |
| **D-G** | Is "system-prompt bozukluğu" machine-detectable? (D4's open question) | (a) treat empty/undersized/digest-mismatch as broken · (b) schema-validate after D8 restructure · (c) owner review only | (a) is implementable at S2; (b) becomes possible only after S8 |

### 3.9 Explicit non-goals

- Not proposing any provider-specific code branch keyed on a provider name (C4).
- Not proposing to change `spawn()`'s existing `prompt: string` parameter.
- Not proposing autonomous persona promotion — owner D7 stands.
- Not asserting any external provider flag as verified; S0 exists to do that.

---

## Appendix A — Verification legend and method

- Everything labelled `repo-verified` was read directly from the files cited, inside this task's read
  scope (`src/providers/`, `src/orchestra/`, `follow-up-works/`).
- Everything labelled `needs-live-verification` is a provider-side surface. Some names are recalled
  from training data and are written in code font, but **no such name is a claim** — slice S0 exists
  to convert each of them into evidence or delete it.
- `--append-system-prompt` appears in this document **only** as the owner's D4-EK phrasing; it is not
  present anywhere in this repository.

## Appendix B — Reproduction

```bash
# Persona composition path (single user prompt, tier T1)
grep -n "agentPrompt\|persona" src/orchestra/prompt-god-template.ts

# Every place deckent touches a system prompt today
grep -rn "system-prompt\|systemPrompt\|role: 'system'\|\['system'\]" src/providers/

# The spawn contract with no persona slot
sed -n '26,90p' src/core/provider.ts

# The only wired system field in the repo
sed -n '270,282p' src/providers/bedrock.ts

# Link gate for this document
node scripts/lint-links.mjs
```

---

## OWNER DECISIONS (Alperen, 2026-08-11 — codex cross-review sonrası)

- **D-A:** yes — ladder kurulur (seam her durumda gerekli).
- **D-C: REVİZE** — P2 preamble yalnız flag-gated adversarial CANARY; native system-channel
  DEFAULT'u ancak P1 (D8 restructure ile identity/procedure yapısal ayrımı) + provider'ın
  kanıtlı `append` capability'siyle açılır. P2-as-default reddedildi (model-compliance yetmez).
- **D-D:** (a) `degrade` default — system-channel yoksa persona prompt'a katlanır, spawn sürer.
- **D-F:** (a) — bozuk/eksik persona spawn sınırında da non-routable (D4 ile tutarlı).
- **D-G:** (a) — boş/undersized/digest-mismatch makine-tespit; VE S0'a provider-channel davranış
  doğrulaması eklenir (ignore/transform/truncate tespiti — codex bulgusu).
- **D-H (YENİ, codex bulgusu):** provider system-channel semantiği `replace` ise spawn otomatik
  typed HOLD; yalnız kanıtlı `append`/`preserve-provider-default` kanal default'a aday olabilir.
- Codex verdict: SOUND-WITH-GAPS; yukarıdaki revizyonlar boşlukları kapatır.
