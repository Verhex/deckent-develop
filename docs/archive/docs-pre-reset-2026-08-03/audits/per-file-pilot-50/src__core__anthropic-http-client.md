# Audit — `src/core/anthropic-http-client.ts`

**Sprint:** 186 (per-file pilot 50 — re-run after Docker worker OOM)
**Auditor:** doc-writer (w-186-031)
**Generated:** 2026-05-21
**Source LoC:** 337
**Status:** ⚠ DEAD-CODE CANDIDATE — only test-file consumer in repo

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/anthropic-http-client.ts` |
| LoC | 337 |
| Module type | ESM, zero-runtime-dependency HTTP client |
| Node runtime | `>=18` (built-in `fetch`, `URL`, `Headers`) |
| Header banner | "Sprint 141 Task 141-SAFE-05" |
| External calls | Anthropic public API — `POST /v1/messages/count_tokens`, `GET /v1/organizations/usage_report/messages`, `GET /v1/organizations/cost_report` |

### Exports (8)

| Symbol | Kind | LoC range | Notes |
|--------|------|-----------|-------|
| `RateLimitState` | interface | 17–38 | 13-field rate-limit snapshot (per-response-type + aggregate) |
| `AnthropicMessage` | interface | 40–43 | role + text or `cache_control` array |
| `CountTokensParams` | interface | 45–50 | `model`, `messages`, `system`, `tools` |
| `CountTokensResult` | interface | 52–55 | `input_tokens` + `rateLimits` |
| `UsageReportOptions` | interface | 57–65 | Admin API query params (RFC 3339 time, bucket_width, group_by, paging) |
| `UsageReportBucket` | interface | 67–82 | Per-model bucket: uncached, cache_creation (5m/1h), cache_read, output |
| `UsageReportResponse` | interface | 84–88 | `{ data, has_more, next_page }` |
| `AnthropicApiError` | class | 92–106 | extends `Error`, `isRateLimited` getter (status === 429) |
| `parseRateLimitHeaders` | function | 121–137 | Extracts 13 headers from `Headers` |
| `countTokens` | function | 209–222 | `POST /v1/messages/count_tokens` |
| `getUsageReport` | function | 235–258 | Admin-API usage report (Team/Enterprise only) |
| `getCostReport` | function | 264–282 | Admin-API cost report (USD) |
| `computeBackoff` | function | 290–316 | Wait-seconds heuristic from `RateLimitState` |
| `timeUntilReset` | function | 322–327 | RFC 3339 → seconds-until helper |
| `exponentialBackoff` | function | 333–336 | 5s → 20s → 80s → 320s (cap 600s) |

### Imports

None — zero-dependency. Uses only Node 18+ globals: `fetch`, `URL`, `Headers`.

### Reverse dependencies (`grep "anthropic-http-client" src/ tests/`)

| Consumer | Type |
|----------|------|
| `tests/core/anthropic-http-client.test.ts` (209 LoC) | unit test |
| `src/**` | **0 matches** — no production consumer |

Note: `src/core/token-counter.ts` has a local heuristic `countTokens(text)` method (line 80, 95, 97, 100, 184, 186) — it does **NOT** import from `anthropic-http-client.ts`. Name collision is incidental.

---

## 2. Bağlam (Architectural Context)

Header comment self-describes purpose: "User Safety Shield" — pre-sprint token estimation, admin-API usage/cost reporting, rate-limit header surveillance. Originally introduced **Sprint 141 Task 141-SAFE-05** (per banner).

Functionally, this module is the **only direct Anthropic-API call surface** in the codebase outside of provider adapters (`src/providers/claude.ts`, `src/providers/codex.ts`, `src/providers/gemini.ts`). Provider adapters wrap CLI subprocess invocations; this client targets the **REST API** directly with `x-api-key` authentication.

ADR-related touchpoints:

- **ADR-010** (Tek Runtime Dependency — commander.js): explicitly cited in the file header — fetch-only design is the literal compliance artifact for ADR-010.
- **ADR-034** (Multi-Project Isolation): not directly referenced, but `apiKey` is a function parameter — no global secret store — which keeps per-project credential boundary intact.
- **ADR-035** (Verification Protocol): `AnthropicApiError` carries structured `status`, `responseBody`, `rateLimits` — surface suitable for honest-gate error propagation, though no production caller verifies this yet.

Adjacent modules of interest (referenced but not imported):
- `src/core/token-counter.ts` — local heuristic estimator (the "first wave" used pre-API).
- `src/core/cost-calculator.ts` (audit pending — task 186-040) — would be the natural consumer of `getCostReport`.
- `src/core/credentials.ts` — owns `sk-ant-...` storage but does **not** route through this client.

---

## 3. Debt Risk

| # | Risk | Severity | Source | Evidence |
|---|------|----------|--------|----------|
| 1 | **Orphan production code** — 0 src-callers, only test file | HIGH | File body | `grep "anthropic-http-client" src/` → 1 match (self) |
| 2 | Admin-API gated to Team/Enterprise; not usable by Pro/Max subscription users | MEDIUM | Comment lines 228–230 | Documented limitation, but no runtime gate / friendly error |
| 3 | `getCostReport` returns `unknown` — no shape validation | MEDIUM | Line 267 | Caller cannot type-narrow safely |
| 4 | `errorBody` swallows JSON-parse failures silently | LOW | Lines 181–186 | `// Ignore parse errors` — debuggability hit on malformed-error responses |
| 5 | No timeout / `AbortSignal` plumbing on `fetch` | MEDIUM | Lines 172–176 | A stuck connection hangs the worker indefinitely (`countTokens` is called on hot path per task description) |
| 6 | `parseInt(value, 10)` accepts leading numerics (e.g. `"100abc"` → 100) | LOW | Line 112 | Anthropic headers are well-formed in practice, but strict mode would be safer |
| 7 | Rate-limit `*-reset` headers parsed as raw string, not `Date` | LOW | Lines 126/129/132/135 | Forces every caller to use `timeUntilReset` helper to interpret |
| 8 | No exponential-jitter randomization on `exponentialBackoff` | LOW | Lines 333–336 | Thundering-herd risk if multiple workers retry simultaneously |
| 9 | `apiKey` passed by value across function boundaries — leak vector if logged | LOW | Lines 209, 235, 264 | No `Object.freeze` / `Symbol`-wrap; relies on caller hygiene |
| 10 | `computeBackoff` defaults to 30s when `requestsReset` is absent — silent magic number | LOW | Line 301, 312 | Should be a named constant + JSDoc |

---

## 4. Dead Code Candidates

**Top-level finding:** Every public export of this module is currently dead (0 production import). The only references are in its own test file.

```bash
$ grep -rn "from.*anthropic-http-client" src/ tests/
tests/core/anthropic-http-client.test.ts:9:  } from '../../src/core/anthropic-http-client.js';
```

| Export | Production consumer | Test consumer | Verdict |
|--------|---------------------|---------------|---------|
| `countTokens` | none | yes | DEAD (test-only) |
| `getUsageReport` | none | (not exercised) | DEAD |
| `getCostReport` | none | (not exercised) | DEAD |
| `parseRateLimitHeaders` | none | yes | DEAD (test-only) |
| `computeBackoff` | none | yes | DEAD (test-only) |
| `timeUntilReset` | none | yes | DEAD (test-only) |
| `exponentialBackoff` | none | yes | DEAD (test-only) |
| `AnthropicApiError` | none | yes | DEAD (test-only) |
| `RateLimitState` type | none | yes (type-import) | DEAD (test-only) |

This places the file inside the **ADR-038 Dead Code Disposition** scope. Three plausible dispositions:

1. **Wire** — connect `cost-calculator.ts` and a planner pre-flight token check to actually call these functions (preserves Sprint-141 intent).
2. **Quarantine** — move to `src/experimental/` or behind a feature flag.
3. **Remove** — delete file + test, log decision in ADR-038 appendix.

Recommend (1) for Sprint 188 — there is real value in pre-sprint token estimation.

---

## 5. Documentation Gaps

| Gap | Where | Suggested fix |
|-----|-------|---------------|
| No JSDoc on `parseRateLimitHeaders` parameter shape requirement (must be `Headers`, not plain object) | Line 121 | Add `@param headers - Fetch API Headers instance` |
| `AnthropicApiError.responseBody` typed as `unknown` with no narrowing example | Line 96 | Document that body matches Anthropic `{type: "error", error: {type, message}}` envelope |
| `UsageReportOptions.bucket_width` literal union `'1d'\|'1h'\|'1m'` undocumented (no comment on default) | Line 60 | Note Anthropic default and recommended values |
| `cache_control.ttl` `'5m'\|'1h'` undocumented | Line 42 | Reference Anthropic prompt-caching docs / explain TTL semantics |
| No usage example in module doc | Lines 1–13 | Add `@example` block showing `countTokens` + back-off pattern |
| `computeBackoff` 1.2x token headroom unexplained magic | Line 307 | Add comment: "20% headroom for tokenizer drift between estimator and actual" |
| `getCostReport` returns `unknown` — no link to Anthropic response schema | Lines 264–282 | Add `// TODO: model schema as CostReportResponse` |
| README / `docs/reference/` does not mention this client exists | n/a | Either document under `docs/reference/api-surface.md` or remove |

---

## 6. ADR Compliance Check

| ADR | Status | Compliance | Evidence |
|-----|--------|-----------|----------|
| ADR-001 (TypeScript + ESM) | accepted | ✅ COMPLIANT | `.ts` file, ESM-default project, named exports |
| ADR-002 (Node16 Module Resolution) | accepted | ✅ COMPLIANT | `.js` extension used by test consumer (`from '...anthropic-http-client.js'`) |
| ADR-003 (vitest over Jest) | accepted | ✅ COMPLIANT | Test file uses `vitest` imports |
| ADR-006 (spawnSync Security Pattern) | accepted | ➖ N/A | No `spawn` calls — pure HTTP |
| ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) | accepted | ✅ COMPLIANT | Lives in `src/core/`, no upward imports |
| ADR-010 (Tek Runtime Dependency — commander.js) | accepted | ✅ COMPLIANT | Zero-runtime-dep — uses Node 18+ built-in `fetch`. Explicit cite on line 10 |
| ADR-034 (Multi-Project Isolation) | accepted | ⚠ PARTIAL | API key is a function parameter (good) — but no per-project boundary helper |
| ADR-035 (Verification Protocol Standard) | accepted | ⚠ PARTIAL | `AnthropicApiError` is structured; no caller currently propagates `rateLimits` to verify-channel |
| ADR-037 (RBAC — Brain/Auditor/Worker Authority) | accepted | ➖ N/A | Module is provider-layer, not authority-layer |
| ADR-038 (Dead Code Disposition) | accepted | ❌ VIOLATION CANDIDATE | Entire file is dead production code — must enter disposition pipeline |
| ADR-046 (Brain Self-Update Hook) | accepted | ➖ N/A | Not invoked from brain hook |
| ADR-048 (Prompt Lifecycle Contract) | accepted | ➖ N/A | No prompt artifacts touched |

---

## 7. Refactor Recommendations

Ordered by ROI:

1. **Wire `countTokens` into planner pre-flight (Sprint 188 R1).** The Sprint 141 design intent ("User Safety Shield" — pre-sprint token estimation) was never connected. `planner.ts` should call `countTokens` per planned task using the assembled prompt to estimate sprint cost before SPAWN.
2. **Add `AbortSignal` plumbing.** Inject `signal?: AbortSignal` into `anthropicFetch` options so callers can enforce per-request timeouts (consistent with `BRAIN_PLAN_TIMEOUT` recent raise).
3. **Type `getCostReport` response.** Add `CostReportResponse` interface modeled on Anthropic schema; remove `unknown`.
4. **Extract magic numbers.** `30s` default backoff, `1.2x` headroom, `4` exponent base, `600s` cap → named constants at top of file with JSDoc rationale.
5. **Add jitter to `exponentialBackoff`.** `Math.min(cap, base * pow(4, attempt) * (0.8 + Math.random() * 0.4))` — eliminates thundering-herd.
6. **Document Admin-API gating at error layer.** When `getUsageReport` returns 403 / 404, wrap with a friendly `AnthropicApiError` message: "Admin API requires Team/Enterprise org — Pro/Max subscribers cannot use this endpoint." Currently only documented in code-comment.
7. **Disposition decision.** If wiring (R1) is not pursued in Sprint 188, file should be moved to `src/experimental/` or removed per ADR-038.
8. **Add usage example block in module header.** Improves discoverability and reduces "what is this for?" cognitive load — the module name does not telegraph "User Safety Shield" intent.

---

## 8. Sprint 188 Follow-up Items

| # | Item | Effort | Owner-suggestion |
|---|------|--------|------------------|
| F1 | **DISPOSITION DECISION** — wire or remove? (ADR-038 trigger) | low (decision) + normal (impl) | Brain (decision), api-builder (wire) |
| F2 | Wire `countTokens` into planner pre-flight to populate per-task `estimatedTokens` field | normal | api-builder + planner module owner |
| F3 | Add `AbortSignal` parameter to `anthropicFetch` + plumb to all 3 public functions | low | typescript-expert |
| F4 | Model `CostReportResponse` shape, replace `unknown` in `getCostReport` | low | typescript-expert |
| F5 | Extract magic numbers (30, 1.2, 4, 600) into named constants with JSDoc | low | code-simplifier |
| F6 | Add jitter to `exponentialBackoff` | low | performance-optimizer |
| F7 | Document Admin-API 403/404 with friendly error wrapper | low | api-builder |
| F8 | Add `@example` block to module header + cross-link from `docs/reference/api-surface.md` | low | doc-writer |
| F9 | Unit-test coverage for `getUsageReport` and `getCostReport` (currently un-tested per inspection) | normal | testing task |
| F10 | Consider migrating to official `@anthropic-ai/sdk` once ADR-010 dependency policy is revisited — current zero-dep design is intentional but limits feature parity (streaming, file API, etc.) | high | architect |

---

## 9. Summary

`src/core/anthropic-http-client.ts` is a **technically sound, well-typed, ADR-010-compliant** zero-dependency HTTP wrapper covering 3 Anthropic API endpoints + 13-field rate-limit header parser + 2 backoff helpers. The code quality is good: structured error class, defensive `null`-tolerant header parsing, idempotent query-param builder.

**However, the module is dead production code.** Zero `src/` consumers reference it; only the dedicated unit-test file (209 LoC) imports its exports. The "User Safety Shield" intent (Sprint 141 Task 141-SAFE-05) was implemented at the client layer but never connected to the planner or cost-tracking surface.

**Headline finding:** This file is an **ADR-038 disposition candidate**. Sprint 188 must decide: **wire** (preferred — there is real value in pre-sprint token estimation) or **remove**. Leaving it as-is grows test-only LoC without product value and risks bit-rot of an external-API contract.

**Secondary findings:** Missing `AbortSignal` plumbing (worker-hang risk), `unknown`-typed cost report response, several un-extracted magic numbers, no jitter on exponential backoff — all LOW/MEDIUM and trivially fixable when (or if) the disposition decision lands on "wire."

**Recommended Sprint 188 entry point:** F1 (disposition decision) → if WIRE → F2 (planner pre-flight) + F3 (AbortSignal). All other items follow.
