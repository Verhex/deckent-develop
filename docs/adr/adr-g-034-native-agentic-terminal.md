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

## Amendment (2026-07-06) — Delivered/Future matrix (P0 ground-truth pass)

Alperen-kararı 2026-07-06 (ground-truth-snapshot P0,
`docs/analysis/ground-truth-snapshot-2026-07-06.md` §Terminal/§Approval/§Tool Surface, plus
the same-day orphan-deliverables sweep `docs/analysis/orphan-deliverables-2026-07.md`,
Sprint 374 Task 374-004): the §Intent/Roadmap block above lists "TOOL progressive-disclosure",
"WORKER-LIVE-TRACE", "Runtime-wide ApprovalBroker integration" and "Scope-enforcement via
TOOL" as undifferentiated future work. Code-verified today, several of these have shipped
(behind flags, default-off) while others remain genuinely unbuilt or built-but-unwired. This
amendment replaces the flat roadmap read with a delivered/flag-gated/future matrix; it does
not change §Decision (Today) or the surviving roadmap items themselves.

| Item | Real status (2026-07-06) | Evidence |
|---|---|---|
| Tool progressive-disclosure (search/describe/plan) | **Delivered, wired** | `src/core/tool-search.ts`, `src/core/tool-core.ts`; consumed by `src/cli/repl/native-tool-registry.ts:24-25` (`ToolSearchIndex`, `summarizeEagerSchema`/`deferredIndexLine`), which `src/cli/repl/run.tsx:11` imports (`buildNativeToolRegistry`) |
| REPL meta-tools surface | **Delivered, flag-gated default-off** | `src/cli/repl/native-tool-registry.ts`; gate `tool_surface.enabled` (`src/core/config-types.ts:199-204`, default `false`) |
| Tool-call execution (`deckent_call_tool`) | **Fail-closed by design, not yet live-execution** | `native-tool-registry.ts:65-69,226-230,309` — `NOT_WIRED_EXEC` is the default `execImpl`; a caller must inject a real one or the call is denied. Still an accurate "plan/risk-gate ready, execution seam is separate work" split |
| TOOL-REG availability/schema-override/shadow-policy slices | **Implemented + tested, NOT wired into the live registry chain** | `src/core/tool-availability.ts`, `tool-schema-override.ts`, `tool-shadow-policy.ts` — confirmed zero production callers by the 374-004 orphan sweep (§4.5); each has its own test file but is not yet consumed by `native-tool-registry.ts` or any dispatcher |
| Scope-enforcement via TOOL (TOOL-SCOPE) | **Implemented + tested, NOT wired** — same orphan status, not merely "not started" | `src/core/tool-scope-gate.ts`; 374-004 §4.5 confirms zero production callers. Downgrade from "roadmap" (implies unbuilt) to "built, unwired" is the accurate framing |
| WORKER-LIVE-TRACE (in-terminal live per-worker run-status) | **Distinct, not yet built** — do not conflate with the live-footer below | No file implements a per-worker run-status footer; remains genuine roadmap |
| Runtime-wide ApprovalBroker (core) | **Delivered, wired** | `src/core/approval-broker.ts`, `-contract.ts`, `-store.ts`, `-policy.ts`, `-worker-gate.ts`, `-relay.ts`, `-eventstream.ts`; `tests/integration/approval-chain.test.ts` |
| Approval terminal card + live footer | **Delivered, flag-gated default-off** | `src/cli/repl/approval-card.tsx`, `src/cli/helpers/live-footer.ts`, wired into `src/cli/repl/app.tsx`; gates `repl_surface.enabled` and `repl_surface.approvals` (`config-types.ts:210-216`, both default `false`) |
| Approval cross-process feed | **Delivered, wired** | `src/core/approval-store-watch.ts` + `src/cli/repl/run.tsx`; `tests/cli/repl/approval-xproc-wire.test.ts` |
| Approval dashboard/API history | **Delivered, wired** | `src/api/approval-history-endpoint.ts` + `src/api/server.ts`; `tests/api/approval-history-wire.test.ts` |
| Approval fallback path | **Implemented + tested, NOT wired** | `src/core/approval-fallback.ts` — zero production callers confirmed by 374-004 §4.6 |
| Desktop app | **Not started** | No `src/extensions/vscode/` `package.json`/`activate()` exists yet either (a separate, also-unpackaged prototype per 374-004 §4.8); Desktop app itself remains unstarted roadmap |

**Reading:** "flag-gated default-off" and "implemented + tested but unwired" are different
statuses that this ADR's original roadmap language collapsed into one bucket. A flag-gated
feature is one config change away from being live; an unwired module needs an integration
task (a caller/seed-point) before a flag can even matter. TOOL-SCOPE and the TOOL-REG
availability/schema-override/shadow-policy slices are the latter — real, tested code with
no follow-up task yet opened to connect them.

**Status impact:** this amendment does not change the ADR's own `Status:` provisional
qualifier (SLASH-MODE-WIRE / NL-DISPATCH-DECISION remain open per the existing header). It
narrows the roadmap bullet list in §Intent/Roadmap and the "(−)" paragraph in §Consequences
from a single undifferentiated "roadmap" bucket into the matrix above.

---

## References / Absorbed

- **Absorbs:** ADR-081 + ADR-074A + ADR-082A + ADR-083 + ADR-086.
- **Cross-ref:** ADR-G-033 (dashboard = observability; chat→DESK) · ADR-G-025 (WORKER-LIVE-TRACE) · ADR-G-008 (provider-parity/fleet) · ADR-G-022 (/nervous) · ADR-G-031 (enterprise slash) · ADR-G-009 (proof-of-function for surface tasks).
- **Born / MASTER-PLAN:** TERM-* · TOOL-1/2 (progressive-disclosure) · APR (ApprovalBroker) · TOOL-SCOPE · WP-OPT · DESK-1.
- **Memory:** `project_deckent_native_terminal_agent` · `project_hermes_deckent_direction_2026_06`.
