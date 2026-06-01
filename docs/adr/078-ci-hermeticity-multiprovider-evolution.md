# ADR-078: CI-Hermeticity Standard + 8-Provider Runtime + Active Identity-Mutation Loop + Dashboard God-Level

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 215

---

## Context

### CI-Hermeticity Gap

Sprint 214 fixed the immediate CI failures (commit `b67c000`), but the root-cause pattern — tests reading gitignored local state (`.deckent/config.json`, `.brain/memory.db`, `~/.deckent`) — was not structurally prevented. A new test written without awareness of the rule would silently re-couple to local state and break CI on the next push.

Three specific gaps remained:

1. **No local CI reproducer** — no `npm run test:ci-sim` command to hide gitignored files and run the full suite locally before pushing. Developers could not reproduce CI failures on their own machine.
2. **No lint guard** — no automated check to detect `readFileSync('.deckent/config.json')` without a skip-if-absent guard in test files. A new hermetic violation would only surface in CI (minutes of feedback loop, not seconds).
3. **No HOME isolation helper** — some tests leaked credential/config dotfiles to the project root by running with the real HOME. No `withSandboxHome()` utility existed to redirect HOME to a tmpdir per-test.

### 8-Provider Fleet Wire-Gap (F1-009)

Sprint 214 built `OpenAICompatibleAdapter` (`src/providers/openai-compatible.ts`) with presets for DeepSeek, Qwen/DashScope, and GLM/Zhipu. The adapter, PROVIDER_MAP extension, and ProviderName type widening were all complete. However a disk-verify finding confirmed that **nothing in `provider.ts` called `registerProvider` for these adapters** — the providers existed in code but were never registered into the runtime registry. DeepSeek/Qwen/GLM were built but dormant (not selectable at runtime).

Two additional gaps accompanied the bootstrap gap:
- **Subscription→API overflow** — when a subscription provider hits its rate/quota limit, workers had no automatic path to overflow to an equivalent API provider. `authMode` was a static per-task field; no dynamic overflow logic existed.
- **Per-worker auth/provider uniformity** — task JSON `authMode` field existed but the `provider` + `authMode` resolution chain was not applied uniformly across Sprint/Task/Process modes in `task-router.ts`.

### F5-008 Identity-Mutation Loop Gap

Sprint 212 wired the *suggestion* path for agent evolution: `adaptive-agent` produces adaptation suggestions → `outcome-tracker` records them. Sprint 214 introduced `agent-genealogy.ts` and `agent-retirement.ts` as live modules with external callers. However the **closed-loop** — low success rate triggers an actual mutation of the agent's identity (prompt rewrite + skill repertoire change), which is then recorded in the genealogy and creates a new versioned variant — was not implemented. The mutation stayed at the "proposal" stage; no `applyAdaptation` was called.

### Dashboard God-Level (F7) Gap

Sprint 214 addressed F7-003 layout-level (responsive grid, ThemeProvider dark/light, sidebar/header structure — ~45% complete). The remaining god-level surfaces were untouched:

- F7-004 terminal: multi-session management, command history ring buffer, clipboard helper — ~60% complete
- F7-006 enterprise view: multi-tenant list, RBAC role matrix, audit log table, rate-limit status — UI completely absent despite F4 backend at 100%
- F7-007 memory/ADR/debt explorer: FTS5 search, ADR timeline, debt table — ~20% complete
- F7-009 nervous UI: pending-approval list, accept/reject actions, panic-guard badge, detector status — not built
- F7-010 evolution dashboard: agent genealogy tree, retirement timeline, prompt-diff viewer — not built (backend modules live, no frontend)

The evolution backend (F5 modules) also lacked a dedicated HTTP API to expose `agent-genealogy`, `agent-retirement`, and `prompt-metrics` data to the dashboard.

---

## Decision

### Part A — CI-Hermeticity Standard

Three artifacts establish the hermeticity standard as a permanent, enforced discipline:

**`scripts/test-ci-sim.mjs` (`npm run test:ci-sim`):** Renames `.deckent/config.json`, `.brain/memory.db`, and `.brain/` to temporary backup names before running `CI=1 vitest run`, then restores them in a `try/finally` block regardless of outcome. This script exactly reproduces the CI environment locally — developers can run it before pushing to catch non-hermetic tests within seconds. The restore-on-fail guarantee means no state is ever lost even when the suite crashes.

**`scripts/lint-test-hermeticity.mjs`:** Scans `tests/**/*.ts` files for direct `readFileSync` calls targeting `.deckent/config.json` or `.brain/memory.db` without a skip-if-absent guard or fixture pattern. Reports violations as `file:line` pairs. Can be integrated into CI as a pre-push lint. Maintains an allowlist for files that explicitly use skip-if-absent patterns.

**`tests/helpers/sandbox-home.ts`:** Exports `withSandboxHome(fn)` (async wrapper) and `useSandboxHome()` (beforeEach/afterEach hook factory). Each call redirects `process.env.HOME` to a unique `os.tmpdir()/deckent-sandbox-<uuid>` directory and cleans it up after the test. No project root or real HOME directory is touched. Nested calls are independent. Used by credential, PTY, and config tests.

These three artifacts are anchored in `.claude/rules/karpathy-discipline.md` under the "Test Hermeticity" section so future workers encounter the rule before writing tests.

**Routing standard:** CI-related tasks (test infra, pipeline fixes, hermetic reproducer) are routed to **ci-guardian agent** + **ci-testing skill** via `activation-engine.ts`. This ensures the routing engine selects the right specialization for CI hygiene work automatically.

### Part B — 8-Provider Bootstrap-Register + Overflow + Per-Worker Auth

**Bootstrap-register (`src/core/provider.ts`):** The provider bootstrap phase now checks for `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, and `ZHIPU_API_KEY` in environment variables and `.deck` secrets (ADR-014). For each present key, the corresponding `OpenAICompatibleAdapter` preset is instantiated and registered via `registerProvider(name, adapter)`. Missing keys are silently skipped — users without DeepSeek keys are unaffected. This is the wire that makes F1-009 runtime-usable: DeepSeek/Qwen/GLM are now selectable at runtime when keys are present.

**Subscription→API overflow (`src/core/provider-overflow.ts`):** New module `resolveWithOverflow(task, registry)` — when a task's primary subscription provider emits a rate/quota-exceeded signal, the function selects an equivalent-tier API provider from the registry as a fallback. The decision is tier-preserving: a `premium` subscription overflow selects a `premium` API provider (not economy). If no equivalent API provider is available, the function degrades gracefully (returns the original provider, no throw). This module integrates with `token-quota.ts` for quota signal detection.

**Per-worker auth resolution (`src/orchestra/task-router.ts`):** The `provider` + `authMode` fields are now resolved first-class for every worker across Sprint/Task/Process modes. Resolution order: DIRECTIVES override (`- Provider:`, `- Auth:`) > config defaults > system default. The resolution is uniform — the same logic path runs regardless of dispatch mode. This pairs with F1-010 overflow so per-worker overflow decisions are consistent.

**Multi-provider smoke (`scripts/multi-provider-fleet-smoke.mjs`):** Registers mock instances of all 8 provider types (claude, codex, gemini, deepseek, qwen, zhipu, ollamaLocal, plus a generic openai-compat) into a registry, routes a mixed task set, and asserts each task lands on the correct adapter. Validates simultaneous coexistence of subscription + API + local providers without interference.

### Part C — Active Identity-Mutation Loop (F5-008)

**`src/orchestra/promotion-pipeline.ts`** extended with `applyAdaptation(agent, proposal, registry)`:

1. When an agent's rolling success rate falls below the configured threshold (default: 60%), `adaptive-agent` has already produced an `AdaptationProposal` (skill additions/removals, prompt delta, specialization hint).
2. `applyAdaptation` applies the proposal: rewrites the agent's `systemPrompt` field, adjusts `assignedSkills`, records the original identity as the parent in `agent-genealogy.ts` via `recordGenealogy(parent, child)`, and writes a new agent variant with a versioned ID (`agentId-v{N+1}`).
3. The mutation is guarded: `requiresApproval: true` in the proposal triggers a nervous-system checkpoint before application (ADR-040). Agents in active tasks are not mutated mid-sprint.
4. The result is an A/B testable variant — both parent and child coexist; the next sprint's routing engine scores both and the winner survives via standard promotion/demotion rules.

This closes the loop: low-success → adaptive-agent proposes → `applyAdaptation` executes → genealogy records → A/B verify. The core moat at scale is now active (not just proposed).

### Part D — Dashboard God-Level

**`src/dashboard/src/components/AppShell.tsx`:** Top-level layout shell replacing ad-hoc layout in individual pages. Defines a CSS grid (header + sidebar + content), responsive breakpoints (mobile: stacked / tablet: side-nav collapsed / desktop: full sidebar), and dark/light token system (`data-theme` attribute propagation). Navigation hierarchy follows information architecture: Sprint → Dashboard → Evolution → Memory → Enterprise → Nervous → Terminal.

**`src/dashboard/src/lib/terminal-sessions.ts`:** Multi-session management (session list, active-session switch, session lifecycle), command history ring buffer (up/down navigation, configurable size), and clipboard helper functions. Designed for the ADR-062 WS gateway interface — session IDs map to PTY instances.

**`src/dashboard/src/pages/EnterprisePage.tsx`:** Tenant list view, RBAC role matrix (admin > operator > viewer columns), audit log table (filterable by tenant/action/time), and rate-limit status per tenant. Consumes existing F4 API endpoints via `useApi`. Read-first (no write actions in V1).

**`src/dashboard/src/pages/MemoryExplorerPage.tsx`:** FTS5 search box (calls `/api/memory/search`), ADR timeline (sorted by sprint, status badge), debt table (open items). Renders ADR content as markdown via `SimpleMarkdown`. Filterable by type (adr/memory/debt/pattern).

**`src/dashboard/src/pages/NervousPage.tsx`:** Pending-approval list (calls `/api/nervous/pending`), accept/reject buttons (calls `nervous_accept`/`nervous_reject` endpoints), panic-guard badge (active/inactive), detector status list. Polls every 30 seconds for new approvals.

**`src/dashboard/src/pages/EvolutionPage.tsx`:** Three tabs — (1) Agent Genealogy Tree: hierarchical node tree from `/api/evolution/genealogy`, child nodes indented by depth; (2) Retirement Timeline: sorted by `retiredAt`, shows id/source/reason/stats; (3) Prompt Diff: table from `/api/evolution/prompt-metrics` showing agentId/version/successRate/trend/experimentStatus.

**`src/api/evolution-endpoint.ts`:** Three read-only GET endpoints registered into `server.ts`:
- `GET /api/evolution/genealogy` — agent family tree from `agent-genealogy.ts`
- `GET /api/evolution/retirement` — retired agents from `agent-retirement.ts`
- `GET /api/evolution/prompt-metrics` — prompt experiment metrics from `prompt-metrics.ts`

All endpoints return empty arrays when no data is present (graceful empty state).

---

## Consequences

**Positive:**
- CI-hermeticity is now a first-class discipline with tooling (`test:ci-sim`), lint enforcement (`lint-test-hermeticity.mjs`), and a reusable helper (`sandbox-home.ts`). Regression from non-hermetic tests is structurally detectable before push.
- DeepSeek/Qwen/GLM are runtime-usable when API keys are present — F1-009 moves from dormant to ~95% complete. Cost advantage (DeepSeek-V3 ~$0.27/M tokens vs Claude Sonnet ~$3/M) is now accessible.
- The evolutionary moat is closed-loop: agents that underperform are now actually mutated (not just annotated) — identity-mutation is live with genealogy tracking and A/B testable variants.
- Dashboard now covers all 7 god-level surfaces (AppShell + terminal-sessions + EnterprisePage + MemoryExplorerPage + NervousPage + EvolutionPage) with F4/F5 data surfaced in UI for the first time.

**Negative:**
- `test:ci-sim` renames files in-place — if the process is killed between rename and restore (SIGKILL, not SIGTERM), the backup files are stranded. Recovery requires manual rename. The try/finally block covers SIGTERM but not SIGKILL.
- `applyAdaptation` mutation is guarded by `requiresApproval` but the checkpoint flow adds latency — high-frequency agents with frequent success drops will queue many approvals. Rate-limiting the mutation frequency (e.g., max one mutation per 3 sprints per agent) is a post-beta refinement.
- Provider overflow relies on a quota-exceeded signal from the adapter — the signal shape is provider-specific and may not be emitted for all failure types (e.g., HTTP 429 vs timeout). Overflow coverage is partial in V1.
- Dashboard pages use `useApi` with polling — no real-time SSE/WS push. F7-004 terminal real-time requires F2-007 streaming (post-beta).

---

## Alternatives Considered

**CI-Hermeticity:**
- **CI-only enforcement (GitHub Actions env guard)** — rejected: feedback loop is minutes (CI) not seconds (local). Local reproducer is the right layer.
- **Vitest `globalSetup` that hides files** — considered: more automated but hides the pattern from developers who need to understand why tests fail locally when files are present. Explicit `test:ci-sim` is more educational.
- **`dotenv-expand` + CI env injection** — rejected: doesn't address `readFileSync` paths at test sites; solves env vars, not file I/O.

**8-Provider Bootstrap:**
- **User-managed YAML provider registry** — rejected: over-engineering for V1; env-key auto-registration is the minimal, correct bootstrap for three known providers.
- **Lazy registration (on first routing request)** — considered: avoids startup cost but complicates provider availability checks and `isAvailable()` semantics. Eager bootstrap at startup is simpler and consistent with Claude/Codex/Gemini registration.

**Identity-Mutation Loop:**
- **Mutation without approval gate** — rejected: uncontrolled identity mutation of active agents could cascade failures across sprints. Checkpoint gate (ADR-040 nervous system) is mandatory.
- **Separate `mutation-engine.ts` module** — rejected: `promotion-pipeline.ts` already owns the promotion/demotion lifecycle; `applyAdaptation` is a natural extension of the same decision surface. YAGNI (ADR-010 simplicity principle).

**Dashboard:**
- **Unified mega-page** — rejected: monolithic page defeats information architecture; seven distinct concerns map cleanly to seven routes.
- **Server-side rendering (SSR)** — rejected: React SPA is the established pattern (Vite + ADR-001 TypeScript); SSR would introduce a new server runtime dependency and is not required for the current read-mostly dashboard.

---

## References

- Sprint 215 — CI-hermeticity kalıcılaştır + 8-provider fleet + dashboard god-level + evrim görünürlüğü
- `scripts/test-ci-sim.mjs` — clean-state CI reproducer (Part A)
- `scripts/lint-test-hermeticity.mjs` — hermeticity lint guard (Part A)
- `tests/helpers/sandbox-home.ts` — HOME isolation helper (Part A)
- `.claude/rules/karpathy-discipline.md` — Test Hermeticity anchor rule (Part A)
- `src/core/provider.ts` — bootstrap auto-register (Part B)
- `src/core/provider-overflow.ts` — subscription→API overflow (Part B)
- `src/orchestra/task-router.ts` — per-worker auth resolution (Part B)
- `scripts/multi-provider-fleet-smoke.mjs` — 8-provider coexistence validation (Part B)
- `src/orchestra/promotion-pipeline.ts` — `applyAdaptation` identity-mutation (Part C)
- `src/orchestra/adaptive-agent.ts` — `AdaptationProposal` source (Part C)
- `src/orchestra/agent-genealogy.ts` — genealogy record target (Part C)
- `src/api/evolution-endpoint.ts` — evolution REST API (Part D)
- `src/dashboard/src/components/AppShell.tsx` — layout shell (Part D)
- `src/dashboard/src/lib/terminal-sessions.ts` — terminal multi-session (Part D)
- `src/dashboard/src/pages/EnterprisePage.tsx` — enterprise UI (Part D)
- `src/dashboard/src/pages/MemoryExplorerPage.tsx` — memory/ADR explorer (Part D)
- `src/dashboard/src/pages/NervousPage.tsx` — nervous system UI (Part D)
- `src/dashboard/src/pages/EvolutionPage.tsx` — evolution dashboard (Part D)
- ADR-077: Multi-Provider 8-Fleet + OpenAI-Compatible HTTP Adapter (bootstrap prerequisite)
- ADR-075: F5 Evolution Runtime Wiring (identity-mutation closes the F5 loop)
- ADR-040: Nervous System Architecture (approval gate for identity mutations)
- ADR-037: Brain-Auditor-Worker Authority Matrix (scope enforcement, hermeticity boundary)
- ADR-014: .deck Secret File System (per-provider key storage for bootstrap)
- ADR-010: Tek Runtime Dependency (no new npm deps in hermeticity tooling or overflow module)
- `[[project_ci_green_root_causes]]` — CI hermeticity root-cause pattern map
- `[[project_test_home_leak]]` — HOME sandbox motivation
- `[[project_deckent_runtime_ecosystem]]` — 8-provider + evolving agent + god-level dashboard vision
- `[[project_dashboard_control_plane]]` — F7 god-level scope
