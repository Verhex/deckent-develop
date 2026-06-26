# Design — Worker Prompt Compiler & Provider-Agnostic Cache Architecture

> **Date:** 2026-06-26 · **Status:** design-ready (brainstorm-approved).
> **One-line:** Treat the worker prompt as a **deterministic, provider-neutral, tiered byte-stable
> artifact** (not an LLM "compiler"), and put **all cache behaviour behind a provider-adapter layer
> of 5 archetypes** fed by a **swappable catalog-source** — so the same prompt logic + cache economics
> hold across Claude · OpenAI · DeepSeek · Qwen · Kimi · Gemini · xAI · Mistral · GLM · Groq ·
> Together · Fireworks · OpenRouter · vLLM/llama.cpp/Ollama, on subscription **and** $-API billing,
> single-tenant **and** million-tenant.
> **No ADR references** (the ADR set is being overhauled; decisions stand on capability merit — Pillar 6
> structures the ADR *operative-state* so a protected-set diff becomes possible).

## Why
- The worker prompt is **already** built by deterministic code (`prompt-god-template.ts:203`
  `buildTaskPrompt` → `:979` `renderTemplate`, locked by `tests/orchestra/prompt-determinism.test.ts`).
  A circulated "Prompt Compiler v2" design proposed inserting an **LLM** stage to minimize prompts for
  cache economy. That is the wrong layer: it adds non-determinism, can silently drop a protected rule
  (false NO_GO), and the design's own §7 admits enforcement "MUST be code, not the LLM." **We harden
  the existing deterministic builder; we do not add an LLM compiler.**
- The cache premise was Claude-CLI-centric and partly inverted. Ground truth is already measured
  (MASTER-PLAN §14.B F1-TOK closure + `docs/alperen-analysis/2026-06-10-weekly-limit-reverse-engineering.md`):
  the weekly subscription limit counts **price-weighted cost** `in·$in + out·$out + cacheWrite·1.25$in`;
  **cacheRead is effectively free (~0% weight)**, **cacheWrite dominates (57–63%)**, fleet cacheWrite
  ≈ **40% of total burn**, and **cross-worker cache sharing does NOT happen on the CLI path**
  (parallel-spawn race + system-prompt divergence: git-status snapshot, un-gitignored heartbeat/lock
  files split the prefix). deckent's internal "warm-share %0" was also **unmeasured** —
  `result-collector.ts:399` heuristics `cacheRead = inputTokens×4`; the CLI spawn (`tmux.ts:119`
  `claude -p -`, no `--output-format json`) never captures `cache_read_input_tokens`.
- ADR selection is **not** pre-filtered upstream (the v2 design assumed it was). All accepted ADRs
  load (`task-builder.ts:1389` `getByType('adr')`), then are **scored per-task** inside the builder
  (`adr-selector.ts:310` `selectRelevantAdrs`, top-3, `minScore 0.3`, `prompt-god-template.ts:379`).
  So the "stable prefix" is stably-*ordered* but per-task-*varying* in content → cache misses across
  task-classes.
- The cost model is fiction: `cost-calculator.ts:124` hardcodes `DEFAULT_CACHE_HIT_RATIO=0.70` +
  `:126 DEFAULT_CACHEABLE_CONTEXT=8000`, so $-cost is systematically mis-estimated and provider-blind.
- Today only Claude/Codex/Gemini/Ollama adapters exist (`providers/`); the design must reach the full
  fleet **without** a Claude assumption and **without** seating any external catalog in the core.

## Non-negotiable principles (Laws #1, #2, #3)
1. **Provider- & model-independent (Law #2).** One prompt-builder, one cache-archetype taxonomy; every
   provider is an adapter behind a port. An unsupported provider fails honestly, never silently.
2. **Dual regime, dual lens (Law #1).** Cache economics differ by billing regime — **subscription/limit**
   (cacheRead free, cacheWrite dominant) vs **$-API per-token** (cacheRead discounted, cacheWrite premium).
   Both first-class; single-tenant → million-tenant from the start (per-tenant cache-key + isolation).
3. **Data is external & swappable; logic is core.** Prices/limits/cache-fields/model-lists come from a
   **swappable catalog-source** (models.dev / OpenRouter / local / custom); cache **archetype + emit
   logic** lives in deckent's core. No external catalog is a runtime dependency.
4. **God-level, no MVP (Law #3).** Comprehensive matrix, protected-set guaranteed by a build-time diff,
   nothing left "for later" behind a silent placeholder.

---

## Pillar 1 — Prompt representation (deterministic builder, not an LLM compiler)
Keep `buildTaskPrompt`/`renderTemplate` as the single deterministic assembler; **add invariants**, do
not replace it.

- **Protected set (copied through verbatim, relocatable but never reworded):** ADR operative-state
  (soft/hard, sanctioned exceptions, tolerated residuals, flag-gating), security/RBAC/authority, scope
  `filesWrite` allow-list, Definition-of-Done / goCriteria / goNogo (incl. faithful RED→GREEN and
  byte-identical-when-flag-off), verify-precedence (targeted-tests-only, pre-existing-failure ≠ NO_GO),
  known-ON flag semantics. Compression is allowed **only** on explanatory prose, **only** at
  class-template time (§Pillar 2).
- **Two prompt paths must reach parity.** CLI/Codex/Gemini → `buildTaskPrompt`; **Ollama agentic** →
  separate `agentic-worker-runner.ts:156` `buildSystemPrompt(scope, goNogo)` + raw description. Any
  invariant guaranteed on path 1 must be guaranteed on path 2, or rules leak on the agentic path.
- **Determinism is a contract.** Same inputs → byte-identical output; section order fixed
  (`renderTemplate`), no per-task paraphrase. This is what makes Pillar 2 (byte-stable prefix) and
  Pillar 6 (diff-check) possible at all.

## Pillar 2 — Tiered cache-prefix segmentation
Replace the binary "stable prefix + tail" with a **3-tier hierarchy**, because cache is scoped per
org/key/model/tenant and the most-shared bytes must lead:

| Tier | Content | Stable across | Cache role |
|------|---------|---------------|------------|
| **T0 global** | worker contract, heartbeat/result format, Karpathy, verify-precedence | every task of every project (changes only with deckent version) | deepest, most-reused cache layer |
| **T1 tenant/project** | ADR operative-state, persona, skill-set | a project's task-**class** (same agent+skills+ADRs) | per-tenant cached prefix |
| **T2 volatile tail** | task id, description, `scope.filesWrite`, goNogo, file:line refs, hb/result paths | per task | never cached |

- **Byte-identical, not schema-identical.** Cache rewards exact-prefix match. Today T1 content varies
  per task (`filterSkillPromptsByDNA` `task-builder.ts:1378`; per-task `selectRelevantAdrs`), and T0
  boilerplate is buried at `prompt-god-template.ts:1008` (position 4). Work = **stabilize** the prefix
  per (tenant, task-class), pushing all genuine variation to T2; reorder so T0 leads (flag-gated,
  preserving the determinism test).
- **Per-tenant cache-key (scale + security).** Emit a tenant-scoped key where the provider supports it
  (`prompt_cache_key`, `x-grok-conv-id`, vLLM `cache_salt`) — both to raise hit-rate **and** to prevent
  cross-tenant cache bleed. Required for million-tenant.
- **Subscription-regime reality.** cacheRead is free, cacheWrite dominates, and CLI cross-worker
  sharing is empirically broken (warm-spawn closed as a negative result, F1-TOK). The cheap CLI win is
  prefix *stabilization* (gitignore heartbeat/lock files; freeze T0/T1 per class) to cut per-worker
  cacheWrite. **Real** cross-worker sharing is unlocked only on the native-API worker path (Pillar 3-B),
  where `cache_control` + measurable `cache_read_input_tokens` make it verifiable.

## Pillar 3 — ProviderAdapter cache-emit layer (5 archetypes)
The full fleet collapses to **5 archetypes**. The adapter (existing `providers/` + `ProviderAdapter`
seam, `tmux.ts:104`) realizes the segmented artifact into each provider's cache dialect.

| Archetype | Providers (examples) | Emit / lifecycle | Verify field |
|-----------|----------------------|------------------|--------------|
| **A · IMPLICIT-AUTO** | OpenAI, DeepSeek, Gemini-impl, Mistral, xAI, GLM, Groq, Together, Fireworks, Qwen-impl, Claude-1P-CLI | no marker; keep prefix byte-stable + emit tenant cache-key | `prompt_tokens_details.cached_tokens` (DeepSeek: `prompt_cache_hit_tokens`) |
| **B · EXPLICIT-MARKER** | Anthropic-API/Bedrock/Vertex, Qwen-explicit, OpenRouter(Claude) | place `cache_control` breakpoint(s) at T0/T1 boundaries (≤4) | `cache_read_input_tokens` |
| **C · EXPLICIT-RESOURCE** | Gemini-CachedContent, Kimi/Moonshot-explicit | **create → reference → delete** lifecycle; storage is billed while alive | `cachedContentTokenCount` |
| **D · LOCAL-KV** | vLLM (APC default-on), llama.cpp, Ollama | byte-exact prefix + keep model loaded; `cache_salt` per tenant | $0 (latency only) |
| **E · NONE** | Cohere | no-op; flag honestly that optimization does nothing | — |

**Universal lever:** the byte-stable tiered prefix pays off in 4 of 5 (A auto-detects, B/C anchor
markers to it, D requires byte-exact); only E is a no-op. So one prompt-builder serves all; the adapter
only chooses *how* to cache. **Archetype-C hazard:** Kimi explicit bills **¥24/M create + ¥10/M-token/
minute storage + ¥0.02/hit**; Gemini explicit **$1–4.5/M-token/hour** — so on parallel fan-out the
adapter MUST run create→use→**delete**, or storage cost compounds. The cache-archetype classification is
**core logic** (not data) — it never comes from the catalog source.

> Provider matrix (mechanism, discount, TTL, min-prefix, hit-field, concurrency caveat) as of
> 2026-06-26, sourced from each provider's official docs + models.dev, with UNCONFIRMED items flagged
> (xAI/Together discount, some TTL/min-token), is retained in the design thread and folded into the
> archetype table above; re-verify per-provider numbers before coding an adapter (caching facts drift).
> Notable points: OpenAI auto ≥1024 tok, `prompt_cache_key`, 5–10min→1h TTL, ~15 req/min/prefix overflow;
> DeepSeek "context cache on disk" ≥64-tok unit, free write; Qwen implicit(0.2×)+explicit(`cache_control`
> 0.1×/1.25× create, 5-min reset-on-hit); Kimi explicit `POST /v1/caching` cache_tag + `role:"cache"`
> (storage-billed) **and** K2 auto; Gemini implicit(2.5+, ≥2048/4096) + explicit CachedContent (storage
> $/M/hr, default 1h); Mistral now caches (10%-of-input, ≥64 tok); GLM auto ~0.18-0.2× (free, limited-time);
> Groq auto 0.5× (~2h); Together/Fireworks auto (default-on); Cohere NONE; vLLM APC default-on V1 (prefill-
> only, `cache_salt`); llama.cpp `cache_prompt`/slots; Ollama byte-exact prefix + `num_keep`.

## Pillar 4 — Catalog-source layer (swappable, NOT seated in core)
External catalogs are an **information-receiver** layer, never a core dependency. models.dev was one
*example* (it exposes `cost.cache_read`/`cost.cache_write` per model across 144 providers / 5308 models
at `https://models.dev/api.json`); OpenRouter `/models` is another; a local file or a customer's private
registry is another.

```
ModelCatalogSource (port)            →  Internal Model/Provider Registry (core SSOT)
  ├─ LocalStaticSource (.deckent/cost-config.json)  [DEFAULT · offline · air-gapped]
  ├─ ModelsDevSource   (api.json)                   [optional enrichment]
  ├─ OpenRouterSource  (/models)                    [optional enrichment]
  └─ CustomRegistrySource (enterprise private)      [override]
```

- **Runtime depends only on the internal registry.** Sources run at **sync-time** enrichment, never in
  the hot path. If models.dev is down / schema-changed / air-gapped, core runs on LocalStatic.
- **Precedence merge** reuses the existing `config.ts` 3-layer pattern: `custom > local-override >
  models.dev/openrouter enrichment > built-in default`.
- **Normalize at the adapter boundary.** `ModelsDevSource` maps `cost.cache_read` →the internal field;
  each source maps its own schema. Adding a new provider/model = a source adapter (or one local-override
  line), **without touching core**. ID-mapping note: `kimi=moonshotai`, `qwen=alibaba`, `grok=xai`,
  `together=togetherai`, `fireworks=fireworks-ai`.

## Pillar 5 — Cost model: two regimes, real economics
Fix `cost-calculator.ts` to be regime- and provider-aware, fed by the internal registry (Pillar 4),
measured from real usage (Pillar 3 verify fields), not the `0.70` hardcode.

- **Subscription/limit regime** (Claude CLI today): limit ≈ `in·$in + out·$out + cacheWrite·1.25$in`;
  **cacheRead ≈ free**. Optimization target = **minimize cacheWrite** (prefix stabilization + real
  cross-worker share on the API path), not minimize total tokens. The "limit-burn" unit (cacheRead
  excluded) becomes a core usage metric (sprint retro/status/dashboard column), per F1-TOK.
- **$-API per-token regime** (native-API workers + all other providers): standard economics from the
  archetype table — cacheRead discounted (≈0.1–0.5× by provider), cacheWrite a premium (A: free; B:
  1.25×/2×; C: storage/time). Per-model prices come from the registry; hit-ratio is **measured** from
  the provider's `cached_tokens`/`cache_read_input_tokens`, never assumed.
- **Local regime** (D): `$0`, optional compute-cost estimate later.

## Pillar 6 — Protected-set & determinism guarantees (build-time check)
Make the v2 design's "attestation: NONE" a **checkable code-level invariant**, not an LLM claim.

- **Structure ADR operative-state.** Today soft/hard, exceptions, flag-gating live in prose
  (`authority-enforcer.ts:22` is soft-only by comment; ADR-008-W residual is a comment). Add
  machine-readable fields to the ADR record (`enforcement_level: 'soft'|'hard'`, `exceptions: string[]`,
  `flag_gating`). The `<!-- worker-operative -->` markers (`adr-selector.ts:411`) are a half-step;
  finish it. **Pre-condition** for any diff-check (and for the Auditor to stop issuing false NO_GOs).
- **Protected-set diff test.** A deterministic test asserts the protected set in the compiled prompt
  diff-equals the source (scope, goNogo, verify-precedence, operative-ADR) — sits beside
  `prompt-determinism.test.ts` as `prompt-protected-set.test.ts`. If it fails → emit the uncompiled
  prompt (`compilation: SKIPPED`), never a smaller-but-wrong one.
- **Guarantee verify-precedence presence.** Today it is conditional (`prompt-god-template.ts:953`,
  emitted only when `verificationMode==='targeted'`) and can silently drop. Make it protected =
  unconditional.

---

## Architecture / components
- **`prompt-god-template` hardening** — tiered T0/T1/T2 segmentation + leading-T0 reorder
  (flag-gated); protected-set relocation rules; determinism preserved.
- **`ProviderCacheAdapter`** (new, per provider; extends the existing `ProviderAdapter` seam) — one of 5
  archetypes; contract = `emit(segmentedPrompt, tenantKey) → providerPayload`, `lifecycle()` (C:
  create/delete), `extractCacheUsage(raw) → {cacheReadTokens, cacheCreationTokens}`.
- **`ModelCatalogSource` port + adapters** (`LocalStatic`/`ModelsDev`/`OpenRouter`/`Custom`) →
  normalize → **internal registry** (extend `core/model-registry.ts`); precedence merge via the
  `config.ts` pattern. Sync-time only.
- **`cost-calculator` rewrite** — regime-aware (subscription/$-API/local), registry-fed, measured
  hit-ratio; kill the `0.70`/`8000` hardcodes.
- **ADR operative-state schema** (`memory-store` + `adr-seed` + `adr-selector`) — structured fields.
- **`prompt-protected-set.test.ts`** + verify-precedence-always test.
- **Agentic-path parity** (`agentic-worker-runner.buildSystemPrompt`) — same protected-set invariants.

## Data flow
catalog-source (sync) → normalize → **internal registry** (prices + cache-fields + archetype) → at spawn:
`buildTaskPrompt` emits **tiered segmented artifact** (T0/T1 byte-stable per tenant-class + T2 tail) →
`ProviderCacheAdapter.emit(artifact, tenantKey)` realizes the archetype (A none / B breakpoint / C
create→delete / D byte-exact / E no-op) → worker runs → adapter `extractCacheUsage` reads the real
hit-field → `cost-calculator` (regime-aware, registry-priced, measured ratio) → result/observability
(feeds the Worker Output Contract spec's `tokenUsage`/`cost`).

## Error handling
- Catalog source unreachable / schema-drift → fall back to LocalStatic; never block the hot path; log
  honestly.
- Provider reports no cache usage → mark `cacheReadTokens` source as unmeasured (CLI path), never fake a
  number (kill the `inputTokens×4` heuristic on paths where the real field exists).
- Archetype-C create/delete failure → never leave a billed cache alive (best-effort delete + ledger).
- Protected-set diff fails → emit uncompiled prompt + flag; never ship a rule-dropped prompt.
- Unsupported provider/archetype → fail honestly (Law #2), never silent-default to "Claude".

## Testing
- Per-archetype adapter unit tests (A/B/C/D/E): emit shape, C lifecycle (create→use→delete, no leaked
  storage), `extractCacheUsage` per provider hit-field. Catalog-source: normalize per source, precedence
  merge, offline fallback (models.dev absent → LocalStatic). Cost-calculator: both regimes (subscription
  burn-unit with cacheRead=free; $-API per-model with measured ratio; local=$0). Tiered-prefix: byte
  identity across tasks of one class, variation isolated to T2, determinism preserved. Protected-set diff
  + verify-precedence-always. Agentic-path parity. All hermetic (tmpdir, no network in tests — sources
  mocked).

## Implementation phases (decomposition for the plan → DIRECTIVES Task 12–22)
1. **Catalog-source port + LocalStatic + internal-registry merge** (offline-first spine; no external
   dependency). Add `ModelsDev`/`OpenRouter` adapters as optional enrichment. (Task 12–14)
2. **Cost-model rewrite** (regime-aware, registry-fed) — kill the `0.70`/`8000` hardcodes; subscription
   burn-unit metric. (Highest ROI; closes the systematic mis-estimate.) (Task 16, dep 13+15)
3. **ProviderCacheAdapter (5 archetypes)** — emit/lifecycle/extractCacheUsage; start A+B+D (cover the
   live fleet), add C (Gemini/Kimi) with the delete-lifecycle guard, E as no-op. (Task 15, 17, 18)
4. **Tiered-prefix segmentation** (T0/T1/T2 + leading-T0 reorder, flag-gated) — the cross-regime,
   multi-tenant prerequisite for real cache hits. (Task 19)
5. **Protected-set guarantees** (ADR operative-state schema → diff-test + verify-precedence-always). (Task 19+20)
6. **Agentic-path parity** (Ollama `buildSystemPrompt` under the same invariants). (Task 21)

Each phase is independently shippable; 1→2 (registry feeds cost), 4 underpins 3's cache hits, 5 depends
on the ADR-operative-state schema. Pairs with the Worker Output Contract spec (token/cost capture is the
shared consumer of Pillar 3+5).
