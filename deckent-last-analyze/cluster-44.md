# core#22 — core code-audit (system-profile, task-types, telemetry, tenant-context, token-counter, token-quota, types, utils)

> Read-only structural audit. 8 files read in full. Every finding carries `file:line` + proving snippet.
> Zero-caller/dormant claims grep-verified across `src/` (def + test excluded) and whole-repo (excl `dist/`).
> Categories: unwired | dormant | inconsistent | dead-test | root-cause.

## Findings

### unwired (zero production callers — grep-verified)

- [unwired|high] TelemetryCollector class has zero production callers — `src/core/telemetry.ts:11` — `export class TelemetryCollector {` — grep `TelemetryCollector` (excl dist) matches only the def + `tests/core/telemetry.test.ts:9,17`. No `new TelemetryCollector` anywhere in `src/`. The entire opt-in telemetry feature is inert scaffolding — never instantiated, enabled, flushed, or read in production.

- [unwired|high] TokenCounter class has zero production instantiation — `src/core/token-counter.ts:70` — `export class TokenCounter {` — grep `new TokenCounter` matches only `tests/core/token-counter.test.ts:9,76,154`; the only other `TokenCounter` reference is a stale mock at `tests/core/agent-pool.test.ts:19`. No prod file imports/instantiates it. The full prompt-/context-budget estimator (`estimatePromptSize`, `isWithinBudget`, `estimateTaskContextBudget`) is test-only.

- [unwired|medium] MODEL_API_IDS constant has zero production callers — `src/core/task-types.ts:86` — `export const MODEL_API_IDS: Record<string, string> = Object.fromEntries(` — grep `MODEL_API_IDS` (excl dist) hits only the def + `tests/core/model-types.test.ts`. Superseded by `modelRegistry` (`MODEL_API_IDS` was the Sprint-072 P1-9 surface; runtime now resolves API ids via the registry).

- [unwired|medium] resolveApiModelId has zero production callers — `src/core/task-types.ts:95` — `export function resolveApiModelId(model: ModelType): string {` — grep hits only the def + `tests/core/model-types.test.ts`. Duplicates `modelRegistry.resolveApiId` (body just delegates to it after a `has()` check).

- [unwired|medium] tenantPath() function has zero callers — `src/core/tenant-context.ts:91` — `export function tenantPath(relativePath: string, projectRoot?: string): string {` — the only `tenantPath` use in `src/` is `src/core/flow-registry.ts:103` `const tenantPath = join(this.baseDir, tenantDir.name);` — a **local variable**, not this export. The exported helper is never imported.

- [unwired|medium] ALL_PROVIDER_NAMES constant has zero production callers — `src/core/types.ts:28` — `export const ALL_PROVIDER_NAMES: readonly ProviderNameExt[] = [` — grep `ALL_PROVIDER_NAMES` (excl dist) matches only `src/core/types.ts:28`. Runtime provider-name lists are derived elsewhere from `Object.keys(PROVIDER_MODEL_MAP)` (`task-builder.ts:40`, `config.ts:384`, `provider.ts`).

- [unwired|low] formatDate has zero production callers — `src/core/utils.ts:287` — `export function formatDate(date: Date | string, lang: string): string {` — grep `\bformatDate\b` in `src/` matches only the def; consumers live exclusively in `tests/core/utils-date.test.ts` + `tests/core/non-null-safety.test.ts`.

- [unwired|low] formatRelativeTime has zero production callers — `src/core/utils.ts:333` — `export function formatRelativeTime(date: Date, lang: string): string {` — grep `formatRelativeTime` in `src/` matches only the def + its own doc-comment; the only non-def references are `tests/core/utils-date.test.ts` and a mock at `tests/orchestra/sprint2-debt.test.ts:103`.

- [unwired|low] shouldRemoveResolvedDebt has zero production callers — `src/core/utils.ts:186` — `export function shouldRemoveResolvedDebt(` — grep in `src/` matches only the def; real callers are `tests/core/utils-decay.test.ts` only (+ mock at `sprint2-debt.test.ts:97`). Debt-decay retention moved to the DB (`MemoryStore.decay`, ADR-088).

- [unwired|low] Three of four model type-guards have zero production callers — `src/core/task-types.ts:128` `export function isClaudeModel`, `:146` `export function isGeminiModel`, `:166` `export function isValidModel` — grep in `src/` shows only their defs; only the sibling `isOpenAIModel` is consumed (`src/providers/codex.ts:102`).

- [unwired|low] computeBackoff re-export is unconsumed — `src/core/token-quota.ts:76` — `export { computeBackoff };` — no importer pulls `computeBackoff` from `token-quota.js` (consumers import `shouldThrottle` via `provider-overflow.ts:20`, `nextDelayMs, sleep` via `sprint-spawner.ts:34`, and the `RateLimitState` type). The companion `export type { RateLimitState };` (line 77) IS consumed; only the value re-export is dead.

- [unwired|low] calcRecommendedMaxWorkers export consumed only internally — `src/core/system-profile.ts:9` — `export function calcRecommendedMaxWorkers(freeMemMB: number, cpuCores: number): number {` — exported and re-exported (`src/core/index.ts:14`) but the sole production caller is the same file's `getSystemProfile` (`system-profile.ts:22`); external use is test-only (`tests/core/system-profile.test.ts`). (`getSystemProfile` itself is widely used — not flagged.)

### dormant (defined-but-unreachable / no-op gate in production)

- [dormant|high] withTenant() is never called in production → AsyncLocalStorage scope is dead — `src/core/tenant-context.ts:68` — `export function withTenant<T>(` … `:74` `return _tenantStore.run(ctx, fn);` — grep `withTenant` (excl dist) shows zero `src/` callers (only `tests/core/tenant-runtime.test.ts` + `tests/core/flow-registry-tenant.test.ts`). Because `_tenantStore.run()` never executes in prod, `currentTenant()` (`:82-83` `return _tenantStore.getStore() ?? resolveTenant(projectRoot);`) ALWAYS takes the `?? resolveTenant` fallback → every prod lookup resolves to the `'local'`/env tenant. (Docs `adr/071` + `decisions.md:7226` claim `withTenant`/`tenantPath` are consumed by flow-registry; the code shows flow-registry uses `currentTenant`, not `withTenant`, so the scoping is inert.)

- [dormant|medium] parseDebtTable / generateDebtTable are @deprecated with no production call-site — `src/core/utils.ts:205` `export function parseDebtTable(content: string): DebtItem[] {` and `:241` `export function generateDebtTable(items: DebtItem[]): string {` — grep `parseDebtTable\(`/`generateDebtTable\(` in `src/` finds NO call — only the defs plus historical comments `src/core/debt-store.ts:51` ("DB-first replacement for `parseDebtTable(...)`") and `src/orchestra/sprint-state-tracker.ts:116` ("was parseDebtTable"). Live only in the test suite. Both carry `@deprecated Memory V2 stores debt in SQLite DB`.

- [dormant|medium] TelemetryCollector.record() is a permanent no-op — `src/core/telemetry.ts:33` — `record(...)` opens with `if (!this.enabled) return;`, `enabled` defaults `false` (`:13`), and `enable()` (`:23`) is never called in production (class never instantiated). Every `record()`/`flush()` path is unreachable at runtime. (Pairs with the unwired class above.)

- [dormant|low] utils.formatDuration reachable in prod only via dead formatRelativeTime — `src/core/utils.ts:308` — `export function formatDuration(ms: number, lang: string): string {` — its only intra-`src` caller is `formatRelativeTime` (`utils.ts:339`), which is itself unwired (see above). No prod module imports `formatDuration` from `core/utils.js` (the many live callers import their own variants — see inconsistent below).

### inconsistent (duplicate / divergent / conflicting definitions)

- [inconsistent|medium] ProviderNameExt is a redundant literal duplicate of ProviderName — `src/core/types.ts:25` — `export type ProviderNameExt = 'claude' | 'codex' | 'gemini' | 'ollama';` — identical to `src/core/task-types.ts:38` `export type ProviderName = 'claude' | 'codex' | 'gemini' | 'ollama';`. The `types.ts:16-19` comment frames `ProviderNameExt` as a stopgap "until full ProviderName widening lives in task-types.ts" — that widening already landed (ProviderName now includes `'ollama'`), so the alias is dead weight.

- [inconsistent|medium] Two divergent getModelTier functions with the same name — `src/core/task-types.ts:159` `export function getModelTier(model: ModelType): number {` (registry numeric tier) vs `src/core/model-equivalence.ts:88` `export function getModelTier(model: MultiProviderModelType): ModelTier {` (different param + return type). `src/orchestra/model-selector.ts:4` imports the task-types version; `src/core/model-tier-guard.ts:20` imports the model-equivalence version. Same name, two semantics — a refactor/rename hazard.

- [inconsistent|medium] core/utils.formatDuration is one of ≥7 divergent formatDuration impls — `src/core/utils.ts:308` `export function formatDuration(ms: number, lang: string): string {` — others: `src/cli/commands/explain.ts:176` (no lang), `src/cli/helpers/sprint-summary-rich.ts:31`, `src/orchestra/sprint-runner-entry.ts:255` (local), `src/orchestra/sprint-metrics.ts:224` (`ms: number | undefined`), `src/dashboard/analytics/agent-comparison-data.ts:115`. Divergent signatures (some i18n-aware, some not) for the same concept; no single canonical helper.

- [inconsistent|low] TokenCounter measures "within budget" against two different budget bases — `src/core/token-counter.ts:118` `const budget = this._budgets[model] ?? DEFAULT_BUDGET;` (where `_budgets[model]` = `min(contextWindow, 200000)` from `buildDefaultBudgets`, `:61`) versus `:193-194` `const modelDef = modelRegistry.get(model); const modelBudget = modelDef?.contextWindow ?? DEFAULT_BUDGET;` (the **uncapped** context window). For a model with contextWindow > 200K, `isWithinBudget` and `estimateTaskContextBudget` can disagree on the same input. (Moot in prod since the class is unwired, but a real internal divergence.)

### dead-test (mock-only / stale / tests over dead production code)

- [dead-test|medium] agent-pool.test.ts mocks TokenCounter that agent-pool no longer uses — `tests/core/agent-pool.test.ts:19` `TokenCounter: vi.fn().mockImplementation(() => ({` — but `src/core/agent-pool.ts` contains no `token-counter`/`TokenCounter` import (grep over the file: no matches). The mock targets a dependency the SUT dropped → stale/dead mock asserting nothing about real wiring.

- [dead-test|low] telemetry.test.ts + token-counter.test.ts are green suites over zero-production-caller classes — `tests/core/telemetry.test.ts:9` `collector = new TelemetryCollector();` and `tests/core/token-counter.test.ts:9` `counter = new TokenCounter();` — both exercise classes with no production callers (see unwired). Tests pass but guard code nothing in `src/` consumes.

- [dead-test|low] format-consistency "integration" test claims a parseDebtTable callsite that doesn't exist — `tests/orchestra/format-consistency.test.ts:143` `it('archive-debt imports parseDebtTable from core/utils (integration)', ...)` (and `:150` for debt-manager) — production has no `parseDebtTable(` call-site (grep: only the deprecated def + comments). The "integration" only asserts the module loads, not that the function is invoked → tautological / stale relative to the DB-first migration.

### root-cause (advisory-soft / trust-without-verify / silent-fallback / synthetic-metric)

- [root-cause|high] nextDelayMs backoff path is dead at its only call-site — silent fallback to the config floor — `src/core/token-quota.ts:54` `export function nextDelayMs(state: RateLimitState | null, estimatedTokens = 0, throttleFloorMs = 0): number {` → `:59-61` `const backoffMs = state === null ? 0 : computeBackoff(...) * 1000;`. The module header (`:4-7`) states it wraps `computeBackoff` "so the dead-code path of `computeBackoff` becomes live (Sprint 198 30k tpm felaketi mitigasyonu)", yet the only callers — `src/orchestra/sprint-spawner.ts:481` and `:779` — invoke `nextDelayMs(null, 0, throttleFloorMs)`. With `state === null`, `backoffMs` is forced to `0`, so `Math.max(floor, 0)` always yields just the configured `throttle_floor_ms`. `sprint-spawner.ts:477` confirms: "No RateLimitState is available at spawn-time (workers own the API call)". The rate-limit-aware backoff (the stated mitigation) never runs in the spawn loop.

- [root-cause|medium] shouldThrottle decides on synthetic, not real, rate-limit state — `src/core/token-quota.ts:28` `export function shouldThrottle(state: RateLimitState | null, estimatedTokens = 0): boolean {` → `:33` `return computeBackoff(state, estimatedTokens) > 0;`. Its sole reachable path is `provider-overflow.ts:103` (`resolveWithOverflow`) ← `mid-sprint-adapter.ts:95`, where the state is `RATE_LIMIT_EXHAUSTED_STATE` — a hardcoded synthetic snapshot (`src/orchestra/mid-sprint-adapter.ts:33`, `retryAfter=60`) chosen from a notes-string `has429` check (`:89,:93`), NOT from `parseRateLimitHeaders` (`src/core/anthropic-http-client.ts:121`) real headers. `computeBackoff` therefore runs on fabricated input → trust-without-verify / synthetic-metric; live API quota signal is never threaded into the throttle decision.

- [root-cause|low] telemetry.sanitize PII filter is incomplete and drop-not-redact — `src/core/telemetry.ts:56-61` — `if (typeof v === 'string' && (v.includes('@') || v.includes('/home/') || v.includes('/Users/'))) { continue; }` — misses `/root/` home paths, Windows `C:\Users\…`, raw IPs, and API-key-shaped tokens; and it silently `continue`s (drops the whole property) rather than redacting the value. Low real impact (collector never enabled), but a genuine sanitizer gap if ever wired.

## Summary

8 core files audited (all read in full); zero source changes. **24 findings**:
- **unwired (12):** `TelemetryCollector`, `TokenCounter` (whole classes, prod-uncalled), `MODEL_API_IDS`, `resolveApiModelId`, `tenantPath()`, `ALL_PROVIDER_NAMES`, `formatDate`, `formatRelativeTime`, `shouldRemoveResolvedDebt`, the `isClaudeModel/isGeminiModel/isValidModel` guard trio, the `computeBackoff` re-export, and `calcRecommendedMaxWorkers` (internal-only).
- **dormant (4):** `withTenant` (kills the AsyncLocalStorage tenant scope → `currentTenant` always falls back), deprecated `parseDebtTable`/`generateDebtTable` (no prod call-site), `TelemetryCollector.record` no-op gate, `utils.formatDuration` (reachable only via dead `formatRelativeTime`).
- **inconsistent (4):** `ProviderNameExt` ≡ `ProviderName` duplicate; two divergent `getModelTier`; ≥7 divergent `formatDuration` impls; `TokenCounter` dual budget basis (capped vs uncapped).
- **dead-test (3):** stale `TokenCounter` mock in `agent-pool.test.ts`; green suites over unwired `Telemetry`/`TokenCounter`; `format-consistency` integration test asserting a non-existent `parseDebtTable` callsite.
- **root-cause (3):** `nextDelayMs` backoff dead at its sole call-site (state always `null` → only the config floor applies, contradicting the module's stated 30k-tpm mitigation); `shouldThrottle` driven by hardcoded synthetic `RATE_LIMIT_EXHAUSTED_STATE` rather than parsed headers; incomplete drop-not-redact PII sanitizer in telemetry.

Highest-leverage: the **token-quota throttle chain** (`nextDelayMs` floor-only fallback + synthetic `shouldThrottle` state) means the advertised live rate-limit backoff is not exercised in the spawn loop; and the **tenant scope** (`withTenant` uncalled) means multi-tenant isolation is effectively single (`local`) at runtime. The two test-only subsystems (`telemetry`, `token-counter`) are inert scaffolding carrying a maintained-but-unused test surface.
