# ADR-G-034: Native Agentic Terminal

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=product-surface contract (bare `deckent` = native agentic terminal; risky actions confirm-gated) → tomorrow=TOOL progressive-disclosure + in-terminal WORKER-LIVE-TRACE + runtime-wide ApprovalBroker + scope-via-TOOL enforcement
**Status:** accepted (provisional — primary terminal-surface shipped; slash-mode-filter + NL-dispatch not wired to the default Ink path [SLASH-MODE-WIRE / NL-DISPATCH-DECISION], slash-registry is a static catalog not capability-derived) · **Date:** 2026-06-30 · **Absorbs:** ADR-081 (Native Agentic Deckent) + ADR-074 Part-A (native-chat round-trip) + ADR-082 Part-A (real-LLM-wire) + ADR-083 (REPL-UX + provider-parity + local-model) + ADR-086 (Native CLI Parity F11)
**Crosswalk:** 081 (+074A+082A+083+086) → ADR-G-034

> **Pivot note (2026-06-29):** The terminal is deckent's **PRIMARY management + usage surface** — tool-driven, full-control + non-tiring, full-functionality is non-negotiable (flexibility/cutting-corners is not acceptable). Work happens *from the terminal*, not via memorized CLI subcommands — but without forcing it (CLI/MCP remain optional access). At the level of Claude Code / Hermes / Codex / OpenClaw. The dashboard (ADR-G-033) is observability-only; the terminal is where you *do*.

---

## Context

`deckent` with no arguments originally printed help. Across Sprints 219–224 it became a real native agentic REPL: bare `deckent` → conversational agentic terminal with real LLM round-trip, natural-language→action dispatch, token streaming, a confirm-gate for risky actions, session persistence, a live slash-registry, a status-line, an enterprise-command bridge, provider-parity across a 5-fleet (incl. local Ollama), and claude-code-grade polish (terminal-mode input, brand thinking-indicator, an agentic write/edit/read/bash tool layer, permission-memory). The view evolved to **Ink** (React-for-CLI) as the default. The 2026-06-30 review consolidates this lineage into the surface that the strategic pivot makes **primary**.

---

## Decision (Today)

### 1. Bare `deckent` = native agentic terminal

```xml
<native-terminal default-view="ink">
  <launch>bare `deckent` → agentic REPL (shouldLaunchDefaultRepl); --help/--version/
    subcommands preserved; non-TTY graceful.</launch>
  <agentic>Default surface = slash + model-emitted &lt;deckent_tool&gt; dispatch via
    McpToolDispatcher; agentic-DO tool layer (write/edit/read/bash, provider-agnostic),
    scope-bounded to session cwd. NL → deckent action dispatch (status/recall/plan,
    classified pre-provider) is OPT-IN — `agenticDispatch` defaults to false and the Ink
    path does not enable it → born NL-DISPATCH-DECISION.</agentic>
  <safety>confirm-gate for risky actions (start/kill/cleanup/write → y/a/N);
    safe actions (status/recall) auto. Permission-memory (.deckent/settings.local.json,
    gitignored) — claude-code-style "always".</safety>
  <session>turns persisted to memory.db; reopening resumes context.</session>
  <stream>F2 token-by-token streaming (SSE); thinking-indicator (kraken brand).</stream>
  <slash>slash-registry from a static canonical SLASH_CATALOG (kod-içi single source of
    truth; buildSlashRegistry() = SLASH_CATALOG.slice() — NOT capability-catalog-derived):
    /help /status /recall /plan /nervous /clear /exit + enterprise group (/audit /rbac
    /flow /cost). Mode-based hiding (visible in enterprise, hidden in user) is DESIGNED
    (resolveChatMode/filterRegistryByMode) but the Ink path currently passes the FULL
    registry (run.tsx:235) — hiding not yet wired → born SLASH-MODE-WIRE.</slash>
  <status-line>config-driven (provider + active-process + cwd); customizable, can be off.</status-line>
</native-terminal>
```

### 2. Provider-parity (5-fleet) + local-model

`resolveChatAdapter` is the intended single entry point mapping all providers (claude/codex/gemini/ollama/openai-compat) to an adapter via one contract — though the bare-REPL boot still uses an inline `buildReplProvider` (entry.ts) instead (the minor drift noted in Consequences → born PROVIDER-SSOT). **Ollama-local is first-class** (zero-API-key, localhost:11434, explicit NET-error) — the "tomorrow deckent-AI with a local model" foundation. Provider fallback chain config-driven (`chat_provider ?? brain_provider ?? 'claude'` + optional `local_fallback`).

### 3. User / Enterprise mode

`resolveChatMode`: `user` (default, simple — chat + basic slash) | `enterprise` (audit/rbac/flow/cost slash visible). Capability is **always present**; mode is INTENDED to filter `/help` visibility ("kullanılmasa da kullanılabilir") — but `filterRegistryByMode` is not yet wired into the Ink/legacy path (they render the full registry today) → born SLASH-MODE-WIRE.

---

## Intent / Roadmap (Tomorrow)

- **TOOL progressive-disclosure** (Hermes-rolemodel + better): deckent's functions move to a tool-surface; core tool-set eager + a searchable bridge (search/describe/call). Terminal is tool-driven; CLI/MCP optional. (MASTER-PLAN: TOOL-1/TOOL-2.)
- **WORKER-LIVE-TRACE** in-terminal (ADR-G-025): live per-worker run-status footer (TERM-LIVE).
- **Runtime-wide ApprovalBroker integration** (APR): risky tool/worker actions emit → terminal live → suspend/resume; multi-channel relay.
- **Scope-enforcement via TOOL, not prompt** (TOOL-SCOPE): worker out-of-scope is tool-gated → shrinks worker prompts (WP-OPT).
- **Desktop app** (ADR-G-033/DESK): interactive chat moves to the Electron desktop app later; the native terminal stays the power surface.

---

## Consequences

**(+)** The product's primary individual surface is a real, agentic, multi-provider, polished terminal at parity with the best CLIs — the pivot's "terminal runs" thesis is shipped. Local-model foundation enables offline/air-gapped + cost-free dogfooding. Enterprise capability is reachable but unobtrusive.

**(−)** TOOL progressive-disclosure, WORKER-LIVE-TRACE, ApprovalBroker integration, and TOOL-SCOPE are roadmap (the "must be BETTER than Hermes at tool+terminal" bar is forward work). Several pieces are delivered-but-not-default: the `src/agent/*` native-agent engine is flag-gated (`DECKENT_NATIVE_AGENT=1` / `--native`, default OFF — M4 cutover pending); `entry.ts` keeps an inline `buildReplProvider` vs the `resolveChatAdapter` SSOT (born PROVIDER-SSOT); the mode-filter + NL-dispatch are not wired to the default Ink path (born SLASH-MODE-WIRE / NL-DISPATCH-DECISION). Dashboard-chat is being de-emphasized in favor of this surface + the desktop app.

---

## References / Absorbed

- **Absorbs:** ADR-081 + ADR-074A + ADR-082A + ADR-083 + ADR-086.
- **Cross-ref:** ADR-G-033 (dashboard = observability; chat→DESK) · ADR-G-025 (WORKER-LIVE-TRACE) · ADR-G-008 (provider-parity/fleet) · ADR-G-022 (/nervous) · ADR-G-031 (enterprise slash) · ADR-G-009 (proof-of-function for surface tasks).
- **Born / MASTER-PLAN:** TERM-* · TOOL-1/2 (progressive-disclosure) · APR (ApprovalBroker) · TOOL-SCOPE · WP-OPT · DESK-1.
- **Memory:** `project_deckent_native_terminal_agent` · `project_hermes_deckent_direction_2026_06`.
