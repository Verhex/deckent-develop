# providers#1 — providers (bedrock, claude, codex, gemini adapters)

Code-only audit (read-only). Files fully read: `src/providers/bedrock.ts` (422 LoC),
`src/providers/claude.ts` (577 LoC), `src/providers/codex.ts` (496 LoC),
`src/providers/gemini.ts` (764 LoC). Every zero-caller claim grep-verified across
`src/` + `tests/` (def + test refs excluded from "production caller" count).

## Findings

### unwired (zero production caller — grep-verified)

- [unwired|high] Anthropic prompt-cache helpers have ZERO production callers — `src/providers/claude.ts:465,488,548` — `export const CACHE_CONTROL_EPHEMERAL`, `export function parseCacheUsage`, `export function attachCacheControlToMessages`; grep across `src/` finds refs only in claude.ts (def + its own doc-comment) and `tests/providers/claude-prompt-cache.test.ts`. The block header (`claude.ts:434-453`) self-admits "wired by **future** API-mode adapters … Today the Claude CLI subscription path uses prompt-content hashing." — three exported helpers + 3 types (`CacheUsageInfo`, `AnthropicMessageLike`, `AttachCacheControlOptions`) ship with no runtime consumer.

- [unwired|high] `GEMINI_TIER_MODELS` is fully dead — `src/providers/gemini.ts:73` — `export const GEMINI_TIER_MODELS = {…}`; grep `GEMINI_TIER_MODELS` over `src/`+`tests/` returns ONLY the def line (zero importers, not even a test). Its `@deprecated` note (`gemini.ts:69-72`) says "Kept for backward compatibility with existing imports" — but there are no imports; the stated reason is false. Dead code masquerading as a back-compat shim.

- [unwired|medium] `CODEX_TIER_MODELS` has no production importer — `src/providers/codex.ts:43` — `export const CODEX_TIER_MODELS`; the ONLY importers are `tests/providers/codex.test.ts:21` and `tests/providers/codex-integration.test.ts:3`. `@deprecated` claims "Kept for backward compatibility with existing imports" (`codex.ts:42`) yet every real import was migrated away — only tests still reference it.

- [unwired|medium] `getModelForTier()` is test-only on codex + gemini — `src/providers/codex.ts:399`, `src/providers/gemini.ts:536` — the deprecation notes on the TIER_MODELS consts (`codex.ts:40`, `gemini.ts:70`) tell callers to "use adapter.getModelForTier() instead", but grep shows the method is invoked nowhere in `src/` — only in `tests/providers/codex*.test.ts` + `tests/providers/ollama.test.ts`. Both the deprecated const AND its advertised replacement are production-unused.

- [unwired|medium] Gemini REST/endpoint helper cluster is test-only — `src/providers/gemini.ts:488,516,546,568,600,674,681` — `buildStreamCommand`, `validateApiKey`, `getCliVersion`, `buildApiScript`, `buildStreamingApiScript`, `getStreamingEndpoint`, `getEndpoint`; grep finds no `src/` caller for any — refs live only in `tests/providers/gemini.test.ts` (+ `tests/e2e/provider-smoke.test.ts` for `getEndpoint`). `buildApiScript`/`buildStreamingApiScript` are `@deprecated "Kept for REST API fallback"` (`gemini.ts:566,598`) but no fallback path invokes them.

- [unwired|low] `detectCliVariant()` is test-only — `src/providers/codex.ts:307` — `detectCliVariant(): CodexCliVariant` (and the `CodexCliVariant` type, `codex.ts:53`); grep shows callers only in `tests/providers/codex.test.ts` + `codex-integration.test.ts`. Rust-vs-Node detection is computed but never consumed by spawn/command-build logic.

- [unwired|low] `ClaudeAdapter.getBackend()` has no production caller — `src/providers/claude.ts:116` — `getBackend(): ClaudeBackend`; grep `.getBackend()` over `src/` matches only the unrelated private `spawn-backend.ts:186` method; the public accessor is referenced solely in `tests/providers/claude.test.ts`.

### dormant (defined-but-unreachable / no-op gate)

- [dormant|medium] Claude `mcp` backend is a permanently-throwing dead branch — `src/providers/claude.ts:130-132,219-221,244-256` — `if (this.backend === 'mcp') throw new ProviderError(MCP_NOT_IMPLEMENTED_MESSAGE)`; every `mcp`-branch (spawn throw, `isAvailable→false`, `diagnoseAvailability→unavailable`) is a no-op gate for a backend "deferred past Sprint 048" (`claude.ts:74`). Selectable via `claude_backend` config but guaranteed-unusable — a config knob that only ever errors.

- [dormant|low] Bedrock spawn-mode methods are inert stubs — `src/providers/bedrock.ts:362-377` — `spawn()` throws, `kill()` is a `// No-op`, `listWorkers(): string[] { return []; }`, `buildCommand(): string { return ''; }`. HTTP-only by design (`bedrock.ts:4`), but the consequence is BedrockAdapter can never back a sprint worker (workers `spawn`, they don't `send`) — it is reachable only via the chat/`send()` path, and only when AWS creds are present (`src/core/provider.ts:913-922`).

- [dormant|low] `createBedrockAdapter(_root, …)` ignores its first argument — `src/providers/bedrock.ts:386` — `export function createBedrockAdapter(_root: string, opts?…)` then `return new BedrockAdapter(opts)`; `_root` is "accepted for API consistency … but is not used" (`bedrock.ts:381-385`) and the live call site passes it anyway: `createBedrockAdapter(root)` (`src/core/provider.ts:922`). Silently-discarded parameter.

### inconsistent (conflicting default / divergent path)

- [inconsistent|high] Planner sends the wrong (deckent-alias) model id while spawn sends the wire apiId — `src/providers/codex.ts:389` vs `:419` — `buildPlannerCommand` builds `args: ['exec','--full-auto', prompt, '--model', model]` (raw alias), but `buildArgs` (spawn path) uses `modelRegistry.get(model)?.apiId ?? model` because "the premium codex id `gpt-5` … is rejected" by a ChatGPT subscription (`codex.ts:414-419`). `buildPlannerCommand` IS live — `src/orchestra/planner.ts:337-338` calls `adapter.buildPlannerCommand(prompt, model)` — so planner invocations ship the exact rejected `gpt-5` alias the spawn path was fixed to avoid.

- [inconsistent|high] Gemini spawn path uses unconditional `yolo` while the string-builder gates it for security — `src/providers/gemini.ts:458` vs `:480-482` — `buildArgs()` (called by `spawn()`, `gemini.ts:264`) hardcodes `'--approval-mode','yolo','--skip-trust'` for EVERY spawn, but `buildCommand()` only emits `--approval-mode yolo --skip-trust` when `opts?.autoApprove`, else `--approval-mode default`. The `buildCommand` comment cites "security review, Agent/Subprocess Permission Bypass … yolo is NOT emitted unconditionally" (`gemini.ts:469-477`) — yet the real host-spawn path (buildArgs) auto-approves all edit/write tools unconditionally. Divergent security posture between the two code paths.

- [inconsistent|medium] Gemini model id differs across build paths (raw vs apiId) — `src/providers/gemini.ts:458` vs `:478` — `buildArgs` emits `-m model` (raw deckent id), `buildCommand` emits `-m ${apiId}` (`modelRegistry.get(model)?.apiId ?? model`). Codex converts to apiId in `buildArgs` (`codex.ts:419`); gemini does NOT — so the gemini spawn + planner paths ship the raw id while only its string-builder uses the wire apiId. Same class of bug codex fixed, still live in gemini's spawn path.

- [inconsistent|medium] `getModelForTier()` collapses all tiers to one fallback that contradicts the per-tier const — `src/providers/codex.ts:400` vs `:44-46` — the method returns `getModelForProviderTier('codex', tier) ?? 'gpt-4.1'` for EVERY tier, while `CODEX_TIER_MODELS` keeps per-tier fallbacks: premium `?? 'gpt-5'`, economy `?? 'gpt-4.1-mini'`. On a registry miss, `getModelForTier('premium')` yields `gpt-4.1` (a silent downgrade) where the const yields `gpt-5`; economy diverges `gpt-4.1` vs `gpt-4.1-mini`. Two sources of truth disagree for the same (provider,tier).

- [inconsistent|medium] `reasoningEffort` honored in spawn but dropped by `buildCommand` (codex) and absent (gemini) — `src/providers/codex.ts:363-374` vs `:423-424` — `buildArgs` appends `-c model_reasoning_effort=${opts.reasoningEffort}` when set, but `buildCommand`'s param type is `Pick<…,'allowedTools'|'autoApprove'>` (no `reasoningEffort`) and `_opts` is unused → effort silently lost on the command-string path. Claude's `buildCommand` DOES thread effort (`claude.ts:349,359,379-381`); gemini's does not (`gemini.ts:463-466`). Reasoning-effort support is non-uniform across the three buildCommand impls.

- [inconsistent|low] Adapter-seeded heartbeat `workerId` disagrees with the worker's self-reported id — `src/providers/codex.ts:447` / `src/providers/gemini.ts:704` — `writeHeartbeat` seeds `workerId: 'codex-'+taskId` / `'gemini-'+taskId`, while the worker prompt instructs the spawned CLI to write `workerId "w-<taskId>"`. The two never reconcile; whichever wins depends on whether the CLI overwrites the seed.

### dead-test (skipped / mock-only-on-dead-surface)

- [dead-test|medium] Real-CLI integration suites are environment-gated and skip on a fresh-checkout/CI — `tests/providers/codex-integration.test.ts:24`, `tests/providers/gemini-integration.test.ts:17` — `describe.skipIf(!codexAvailable)(…)` / `describe.skipIf(!hasGemini)(…)`. CI has no `codex`/`gemini` binary (hermetic clean machine), so these whole suites — the only place `getModelForTier`/`detectCliVariant`/`CODEX_TIER_MODELS` are exercised against the real CLI — never execute in CI; coverage there is illusory.

- [dead-test|low] Tests assert on production-unwired symbols (coverage of dead code) — `tests/providers/codex.test.ts:489-499,505-509`, `tests/providers/gemini.test.ts:141-155,298-299` — describe blocks for `CODEX_TIER_MODELS`, `getModelForTier()`, `buildStreamCommand`, `getEndpoint` all mock `spawnSync`/registry and assert shapes of symbols that have zero production callers (see unwired findings). Green tests guarding code nothing ships — masks the dead-code status.

### root-cause (advisory-soft / trust-without-verify / silent-fallback / hardcoded-0)

- [root-cause|high] Claude availability = binary-present, with NO auth verification (trust-without-verify) — `src/providers/claude.ts:285-288` — `const available = binaryFound; … authStatus = binaryFound ? 'ok' : 'missing'`. A `claude` binary that is installed-but-logged-out reports `available:true, authStatus:'ok'`. The code self-documents the gap: "Caller should still run `claude config get account` for stricter auth probing" (`claude.ts:282-284`) — i.e. the adapter knowingly skips the auth probe and trusts binary presence as auth. Root cause of "provider reported ready, worker then fails on auth".

- [root-cause|medium] Codex subscription auth decided by an output substring match — `src/providers/codex.ts:344` — `if (result.status === 0 && result.stdout?.includes('logged in')) return 'subscription'`. Auth state is inferred from the literal string `"logged in"` in `codex auth status` stdout; any CLI wording change (locale, version) silently flips auth to `'none'`. Brittle trust-on-substring rather than a structured check.

- [root-cause|medium] Codex/Gemini heartbeats are write-once seeds with hardcoded-0 progress metrics — `src/providers/codex.ts:444-460` / `src/providers/gemini.ts:700-716` — `writeHeartbeat()` is called exactly once at spawn (`codex.ts:142`, `gemini.ts:278`) with `filesChangedCount: 0, sequence: 0` and is never refreshed by the adapter. Liveness then depends entirely on the spawned CLI honoring the prompt's "update periodically" instruction; if it does not, the auditor's `>2min` stale-heartbeat rule fires on a healthy long-running worker (false positive) — the `sequence:0`/`filesChangedCount:0` seed never advances from the adapter side.

- [root-cause|low] Bedrock token usage silently defaults to 0 on missing/non-numeric fields — `src/providers/bedrock.ts:211-214` — `inputTokens: typeof u['input_tokens'] === 'number' ? u['input_tokens'] : 0` (same for `output_tokens`). A response whose usage block is absent or malformed yields `{inputTokens:0, outputTokens:0}` indistinguishable from a real zero-token call — hardcoded-0 metric that can under-report cost without surfacing the parse miss.

- [root-cause|low] All four adapters probe availability with synchronous `spawnSync`, against the async-I/O standard — `src/providers/claude.ts:224,262`, `src/providers/codex.ts:192,216,309,340`, `src/providers/gemini.ts:362,548,650` — every `--version`/auth probe blocks the event loop. ADR-087 + the repo's own hermeticity rule state "No spawnSync for subprocesses — use async spawn … spawnSync blocks the event loop and causes CI timeouts." Bounded by a 5s timeout so impact is limited, but it is a uniform deviation from the stated standard across the provider cluster.

## Summary

Audited 4 provider adapters (2,259 LoC). **23 findings**: 7 unwired, 3 dormant,
6 inconsistent, 2 dead-test, 5 root-cause.

- **Largest cluster = unwired/dead surface.** Whole helper families ship with zero
  production callers: Claude prompt-cache helpers (3 fns + 3 types), `GEMINI_TIER_MODELS`
  (fully dead — no importer anywhere), `CODEX_TIER_MODELS` + `getModelForTier()`
  (test-only), and 7 Gemini REST/endpoint helpers (test-only, 2 `@deprecated`). Several
  `@deprecated` notes cite "existing imports" that no longer exist — stale rationale.
- **Highest-risk = inconsistent build paths.** `buildPlannerCommand` (codex) ships the
  raw `gpt-5` alias the spawn path was explicitly fixed to avoid, and it is live via
  `planner.ts:337`. Gemini's `spawn()` auto-approves all tools (`yolo`) unconditionally
  while its own `buildCommand` gates the same flags "for security review" — a real
  divergent-posture gap. Model-id (raw vs apiId) and `reasoningEffort` handling differ
  across spawn / buildCommand / buildPlannerCommand within and across adapters.
- **Root causes** center on trust-without-verify (Claude `available = binaryFound` with no
  auth probe; Codex `"logged in"` substring), write-once hardcoded-0 heartbeats on
  codex/gemini, silent-0 token usage on bedrock, and a cluster-wide `spawnSync` deviation
  from ADR-087.

Source unchanged (read-only audit). All file:line references verified against the
current tree; all zero-caller claims grep-confirmed over `src/` + `tests/`.
