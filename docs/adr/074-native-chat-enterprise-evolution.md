# ADR-074: Native Chat Real Round-Trip + Enterprise RBAC/Audit/Rate + F5 Evolution Wire

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 211

---

## Context

### F2 — Native Chat Mock Round-Trip Gap

Sprint 203-204 delivered `chat-native.ts` with tool-use loop, streaming, multi-turn, and resume capabilities. However, the provider call path remained partially mocked — the `ProviderAdapter` was not fully wired through the live registry, and MCP tool dispatch was stubbed. This meant:

1. **No live adapter resolution** — `chat-native.ts` called a provider interface but did not resolve through `ProviderAdapter` + `ProviderRegistry` (subscription CLI spawn path). Real round-trip was missing.
2. **No MCP tool dispatch** — tool-call responses were not routed to the deckent MCP tool registry (e.g. `deckent_status`, `deckent_memory_query`). Results never fed back into the loop.
3. **Partial session persistence** — `appendChatTurn` existed but `--resume` did not load the last N turns from `memory.db` on startup.

The chat path was architecturally sound but functionally incomplete for a real user session.

### F4 — Enterprise RBAC/Audit/Rate Enforcement Gap

Sprints 205-210 delivered the enterprise skeleton: `rbac.ts` (role hierarchy, `can()`, `PERMISSION_MATRIX`), `audit-writer.ts` (`writeAuditEvent`), `audit-query.ts` (`queryAudit`), `enterprise-config.ts` (`EnterpriseConfig`, `parseEnterprise`). Three gaps remained:

1. **No runtime enforcement** — `rbac.ts` provided `can()` but no `enforceRbac()` wrapper that checked `config.rbac.enabled` and applied NO_OP when disabled. Sprint/flow entry points were unguarded.
2. **No compliance export** — audit events were written and queryable, but no `exportAuditLog(format, filter)` function produced SOC2/GDPR-grade JSON or CSV reports with HMAC chain verification.
3. **No rate/resource limits** — multi-tenant abuse protection (`rate-limiter.ts`, token-bucket or sliding-window per-tenant) was absent, leaving F4-003 unimplemented.

### F5 — Evolution Wire Dormant

Sprint 208 added `evolvePrompt` (rule-based outcome→prompt suggestion) and `adaptive-agent.ts` (adaptation skeleton). Both were 0-caller dormant as of Sprint 210:

1. **`prompt-evolution.ts`** had `evolvePrompt` but no caller wire to `outcome-tracker`. Sprint outcome patterns were not feeding prompt improvement suggestions.
2. **`adaptive-agent.ts`** adaptation was not confirmed wired to routing/outcome — caller evidence was partial.
3. **No cross-sprint trend analysis** — no module read last N sprint outcomes and identified improving/degrading patterns (agent success trends, NO_GO patterns, skill effectiveness).

---

## Decision

### Part A — F2 Native Chat Real Round-Trip (Sprint 211 Tasks 1-4)

**ProviderAdapter round-trip wire (`chat-native.ts`):**

`chat-native.ts` loop now resolves the active provider through `ProviderRegistry` (subscription CLI spawn path, API mode still deferred per `[[project_api_mode_deferred_post_beta]]`). The mock adapter is replaced by a real `ProviderAdapter` call. Test coverage uses a mock adapter (not real spawn) to verify the round-trip contract.

**MCP tool dispatch wire:**

Tool-call responses from the LLM are dispatched to the deckent MCP tool registry. Read-only tools (`deckent_status`, `deckent_memory_query`) are called; results are injected back into the conversation loop as `tool_result` messages.

**Session persist + resume:**

Each turn is written to `memory.db` via `MemoryStore.appendChatTurn`. `--resume` loads the last session's turns (`getChatHistory`) on startup, restoring multi-turn context window. Truncation applies when history exceeds context limit.

**End-to-end smoke verification:**

`scripts/chat-native-smoke.mjs` simulates the full flow (mock provider + mock tool) end-to-end: user input → adapter → tool dispatch → response → persist → exit. No real subprocess spawn required.

### Part B — F4 Enterprise RBAC/Audit/Rate (Sprint 211 Tasks 5-8)

**RBAC runtime enforcement (`enforceRbac`):**

`rbac.ts` exports `enforceRbac(role, action, tenantId?)` — when `config.rbac.enabled` is true, calls `can()` and throws on denial; when false, returns NO_OP (backwards-compatible). Sprint/flow entry points import this helper.

**Audit compliance export (`audit-export.ts`):**

`exportAuditLog(format: 'json' | 'csv', filter: AuditFilter)` produces a compliant audit report. JSON output is a structured array with HMAC chain verification. CSV output is RFC-4180 with header row. Filter supports tenant, action, and time-range fields. Reads via `audit-query.ts`.

**Rate/resource limit guard (`rate-limiter.ts`):**

Token-bucket sliding-window per-tenant rate limit. `checkLimit(tenantId, action)` returns `{ allowed: boolean, remaining: number, resetAt: number }`. Integrates with `enterprise-config.flow.maxConcurrent`. Enterprise-feature guard — NO_OP when enterprise config absent.

**RBAC CLI grant/revoke (`rbac.ts` CLI):**

`deckent rbac grant <user> <role>` and `revoke` commands complete the RBAC CLI surface (check/roles were Sprint 210-014). Role assignments persist to config/store.

### Part C — F5 Evolution Wire (Sprint 211 Tasks 9-12)

**prompt-evolution → outcome-tracker wire:**

`prompt-evolution.ts` `evolvePrompt` is called from the sprint post-evaluation phase. It reads outcome patterns from `outcome-tracker` (success rate, NO_GO patterns per agent/task type) and generates rule-based prompt improvement suggestions (no LLM call). Suggestions are logged; not auto-applied.

**adaptive-agent runtime wire:**

`adaptive-agent.ts` adaptation is confirmed wired to routing/outcome. Agent success rate triggers skill addition/removal suggestions at sprint boundary. Wire verified with caller evidence.

**Cross-sprint trend analyzer (`cross-sprint-analyzer.ts`):**

Reads last N sprint outcome entries from `memory.db`. Computes per-agent success trends, skill effectiveness scores, and NO_GO pattern recurrence. Returns a structured trend report (improving / degrading / stable per dimension).

**Evrim CLI (`deckent evolve report`):**

`src/cli/commands/evolve.ts` — `deckent evolve report` displays cross-sprint trends and prompt-evolution suggestions. Registered in `src/cli/index.ts` via `registerEvolve` import+call (pattern from ADR-012).

---

## Consequences

**Positive:**
- F2 native chat is functionally complete for real user sessions (provider round-trip + tool dispatch + session resume). Conversational maturity reaches ~80%.
- F4 enterprise hardening is complete: RBAC enforcement, audit compliance export (SOC2/GDPR-grade), and rate limiting are all available behind the `enterprise-config.rbac.enabled` flag.
- F5 evolution wire makes `prompt-evolution` and `adaptive-agent` live callers — sprint outcomes now feed improvement suggestions continuously.
- Cross-sprint trend analysis enables data-driven routing and agent tuning decisions.

**Negative:**
- F2 round-trip is subscription-CLI only (API mode deferred post-beta per `[[project_api_mode_deferred_post_beta]]`). Streaming canlı (real SSE stream from provider) is a follow-up item.
- `enforceRbac` is advisory when `config.rbac.enabled: false` — hard-block is opt-in. V2 post-GA will flip default.
- `rate-limiter.ts` is a limit-check module (not a real throttle queue); actual request queuing is a follow-up.
- Evolution suggestions are advisory (not auto-applied) — requires human review cycle before automation.

---

## Alternatives Considered

- **Fake DONE on F2 round-trip** — marking chat as live without wiring the real `ProviderAdapter` was the Sprint 210 state. Rejected: users would encounter mock responses in production.
- **Hard-block RBAC always** — removing the NO_OP bypass. Rejected: backwards-incompatible for existing single-tenant deployments without `enterprise-config`.
- **LLM-based prompt evolution** — using Claude to suggest prompt rewrites. Rejected: circular dependency (orchestrator calling AI to tune AI prompts adds latency and API cost); rule-based outcomes are sufficient for V1.
- **Separate audit export CLI** — making compliance export a standalone `deckent audit export` command. Deferred: core export logic lands in `audit-export.ts`; CLI wrapper is a follow-up.

---

## References

- Sprint 211 — F2 native chat real round-trip + F4 enterprise RBAC/audit/rate + F5 evolution wire
- ADR-062: Embedded Web Terminal (ws-gateway compatibility for chat round-trip)
- ADR-069: Event-Driven Triggers + RBAC (F4 foundation)
- ADR-071: F3 Autonomous Mode + F4 Enterprise RBAC/Tenant/Audit (F4 skeleton)
- ADR-037: Brain-Auditor-Worker Authority Matrix RBAC V1.0
- `src/cli/commands/chat-native.ts`, `src/core/rbac.ts`, `src/core/audit-export.ts`, `src/core/rate-limiter.ts`
- `src/orchestra/prompt-evolution.ts`, `src/agents/adaptive-agent.ts`, `src/orchestra/cross-sprint-analyzer.ts`

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (chat + enterprise + evolution üçü de ürün yüzeyi).

**Re-verified:** Part-B tam — `enforceRbac` (`rbac.ts:120`, disabled→NO_OP) + `exportAuditLog` (`audit-export.ts:40`) + `rate-limiter.ts` ✓ · Part-C tam — `cross-sprint-analyzer.ts` + `evolve.ts` + `prompt-evolution.ts` (runtime-wiring ADR-075/S212 teyitli) ✓.

**Part-A evrim-zinciri:** chat-native'in gerçek-LLM round-trip'i sonraki ADR'lerle olgunlaştı — **ADR-081** (çıplak `deckent` = native agentic Ink-REPL) → **ADR-082** (Native-LLM-Wire canlı) → **ADR-083** (provider-parity) → Sprint 280 `/mcp` broker-wire (G1). CLI-native-chat bugün gerçek, agentic ve multi-provider'dır.

**⚠️ Ayrım-notu (yüzey karışmasın):** 2026-06-11 UX-denetiminin **"dashboard Chat HOLLOW"** bulgusu (NL→"Anlamadım", `project_dashboard_chat_audit_20260611` #1) bu ADR'nin CLI-chat'i DEĞİLDİR — ayrı yüzey olan **dashboard ChatPage**, mevcut `/api/chat/stream` backend'ine NL yönlendirmiyor (S219 endpoint canlı, sayfa command-router'da takılı). Fix Chat/Dashboard product-sprint'inde. md+db senkron (Alperen ADR-review).
