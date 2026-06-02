# Deckent — Master Plan

> **Status:** CANONICAL — this is the single source of truth for vision, current state, remaining work, business plan, and sequencing.
> **Last reconciled:** 2026-06-01 (Sprint 215 complete; CI-hermeticity permanent + 8-provider fleet + dashboard god-level + evolution moat closed).
> **Version:** v1.0.0-beta.1 · **Beta GA window:** 2026-06-01 (OSS public beta).
> **Supersedes (now historical, preserved for provenance):** `docs/ROADMAP-GOD-LEVEL.md`, `docs/vision/roadmap.md`, `docs/release/roadmap.md`, `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md`, `docs/release/beta-tracker.md`. Those documents used pre-Sprint-211 sprint numbering (189–200) that never executed 1:1 — this plan is the reconciled reality.

---

## 1. North Star & Vision

**Deckent is an install-and-run AI agent orchestrator that lives on your machine, runs your sprints, and never calls home.**

Three immovable pillars (Alperen-approved 2026-05-31):

1. **Provider-free** — any LLM: cloud subscription *or* local Ollama, with a zero-API-key option. No vendor lock.
2. **Conversational** — native chat REPL (`deckent chat`), the way `claude` works, reachable from terminal, web UI, and IDE.
3. **Three-face (Trinity)** — one engine, three audiences: developer / company / individual.

**License & model:** MIT, free forever. No "pro" tier, no "team" plan, no enterprise edition with gated features. The same code that runs the dogfood loop runs in a 10,000-employee company (ADR-033 Product-Not-Service).

**The moat — evolutionary architecture:** Deckent learns from every sprint. Brain reads its own retros, routing outcomes feed agent/skill selection, prompt-evolution and adaptive-agent tune behavior over time. This self-improvement loop — not any single feature — is the core differentiator.

**Positioning (Alperen 2026-06-02 — no more "anti-X" framing; compare, don't disparage):** Deckent is the **god-level orchestration + enterprise layer of an open agent**, made **so easy a single user can wield that same power**. One MIT product that scales from one developer on a laptop to a 10,000-employee enterprise — the full strength of multi-agent orchestration, sprint discipline, scope enforcement, memory/learning, and multi-provider freedom, given to everyone. **"Open source for open world."** We respect and *compare* with peers (Devin, Cursor, Claude Code, Cowork, Perplexity, open agent CLIs) on capability — we never frame ourselves as "anti" anyone.

**Data architecture (clarification, 2026-06-01, Alperen):** Two **orthogonal** DB concerns — do not conflate them.
1. **Deckent's own orchestration memory** = `.brain/memory.db` — embedded **SQLite + FTS5**, per-project, zero-config, never-calls-home. Single source of truth for ADR / sprint / retro / pattern / debt. **It STAYS SQLite** — it fits the install-and-run DNA and does **not** migrate to Postgres/Oracle just because a target project uses them. (`.brain/memory.db` gitignored, rebuilt from git-tracked `.brain/exports/*`.)
2. **A target project's data DB** (e.g. an ERP on Postgres/Oracle) is a **connector/capability concern** — accessed via the **Capability Broker (F8 `db.query`/`erp.read`, read-only first)** + RBAC + approval gate. Deckent neither stores its memory there nor lets it replace `memory.db`.
- **Vector DB / embeddings:** optional **post-GA** for semantic recall (DeckentHub 100-skill search, large-memory semantic search). Must use **local embeddings** (Ollama on the RTX 5090) to honor never-calls-home; FTS5 dual-layer normalize is sufficient at current scale.
- **Multi-tenant scale (sub-#3):** per-tenant SQLite isolation / row-level security for SaaS; the single-host product stays embedded SQLite.

**Positioning evolution (2026-06-01, Alperen):** Deckent is no longer just "a product you install" — it is becoming an **AI runtime ecosystem**: one engine that is (a) the individual developer's orchestrator, (b) the individual user's autonomous agent, and (c) the enterprise's god-level orchestration ecosystem — at million-user / million-environment / million-agent scale. Easy install, low requirements, evolving/learning. Enterprise (incl. ERP) is a *runtime target*, not a separate edition (ADR-033 holds).

---

## 2. Trinity — Three Faces (maturity & path to 100%)

| Face | Audience | Mode | Maturity | Gap to 100% |
|------|----------|------|----------|-------------|
| **AI Developer** | Developer | Sprint Mode | **~90%** | F1-004/005 (docker provider-aware) → 95%; F6-004 API activation (post-beta) → 100% |
| **AI System Worker** | Company | Process Mode | **~80%** | F3-004 (k8s pod-exec) + F7-006 (enterprise UI) → 90%+ |
| **AI Assistant** | Individual | Chat Mode | **~80%** | F2 streaming + F7-003 (god-level UI/UX) + native-chat-everywhere surfaces → 90%+ |

> "Today's maturity is uneven, and that is honest." All three faces ship from the same engine; they mature in parallel, not in sequence.

---

## 3. Current State — Ground Truth (Sprint 218, 2026-06-01)

- **Sprint 220** (**220**) — ✅ **DONE** (Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı — **ADR-082** accepted). DALGA A: Native REPL gerçek LLM wire — config-driven `chat_provider ?? brain_provider ?? 'claude'` fallback (220-001); `chat --native --once/--message` headless flag (220-002); agentic dispatch canlı (220-003). DALGA B: Dashboard tam-canlı — `WorkerGrid.tsx` SSE real-time (220-004); `StatusPage.tsx` done→done render (220-005); `RefreshButton.tsx` manuel refresh+cooldown (220-006); `ChatPage.tsx` gerçek `/api/chat` round-trip+akan (220-007). DALGA C: `coverage-endpoint.ts` + `/api/coverage` (220-008); `DebtPage.tsx` filtre dropdown (220-009); `EnterprisePage.tsx` auth-wire+alert-dedup+provider-neutral (220-010). DALGA D: Nervous Faz-1 — `src/nervous/bootstrap.ts` `createNervousSystemIfEnabled` (220-011); 8 low-risk action-handler (220-012); `.deckent/config.json` `enabled:true` (220-013). DALGA E: ADR-082 + MASTER-PLAN güncel (220-015/016). **`deckent` GERÇEKTEN konuşur** (skeleton değil). Nervous aktif. Dashboard god-level tamamlandı. CI yeşil KORUNDU.

- **Sprint 219** (**219**) — ✅ **DONE** (Native Agentic Deckent — **ADR-081** accepted). DALGA A: bare `deckent` → agentic REPL (219-001 `entry.ts` `shouldLaunchDefaultRepl`); `runChatNativeLoop` round-trip run-proven (219-002); REPL UX god-level readline/history/Ctrl-C (219-003). DALGA B: agentic tool-use (219-004 natural-lang→MCP dispatch); riskli aksiyon onay kapısı (219-005); REPL oturum persist/resume memory.db (219-006). DALGA C: F2-007 token-streaming SSE `streamChatMessage` + `/api/chat/stream` + dashboard `chat-stream-client.ts` (219-007/008). DALGA D: dashboard nav tek-kaynak + RENDER-based 10-link test (219-009); cache-bust e2e smoke (219-010). DALGA E: `docs/MASTER-PLAN-TR.md` (219-011) + ADR-081 (219-012). DALGA F: `blueprint.md` baştan-aşağı güncel (219-013); `autonomous-runtime.ts` iskeleti (219-014). DALGA G: `routeTaskV2` plan-time wire (219-015); Smoke field propagation task-builder (219-016). **F2 → ~95%, F7 → ~95%, `deckent` = claude gibi. CI yeşil KORUNDU.**

- **Sprint 218** (**218**) — ✅ **DONE** (Dashboard God-Level — **ADR-080** accepted). DALGA ÖN: git self-mutation guard (ADR-039 `detectDeckentRepo` NO-OP guard, commit 64c97c2f). DALGA 0: sprint-start detach (`sprint-job-runner.ts` `startSprintDetached`, serve event loop no longer blocked, commit 9e2e7d34). DALGA A: 4 hollow pages wired to App.tsx routes + Sidebar.tsx links (EvolutionPage/NervousPage/EnterprisePage/MemoryExplorerPage now reachable); ChatPage real round-trip (`POST /api/chat` Bearer token, not status-only); DirectivesEditor component. DALGA B: god-level UI (`use-live-data.ts` SSE/stale-while-revalidate, `theme.ts` centralised tokens, `Layout.tsx` responsive shell). DALGA C: ADR-080 + dashboard user guide + e2e surface tests. **F7-003/006/009/010 run-proven DONE (Sprint 218).** CI yeşil KORUNDU.

- **Sprint 216** (**216**) — ✅ **DONE** (Proof-of-Function DoD, **ADR-079** accepted; implementation landed Sprint 216). `isUserSurfaceTask` Tier-0/Tier-1 classification + in-sprint Smoke gate (`proof-of-function.ts`) + routing surface bonus + `task-builder` Smoke parse + `test:e2e-surfaces`. **serve dashboard F7-001 FIXED** — localhost API-token auto-mint + inject → `/api/status` 200 (run-proven, not mocked). ⚠️ **Incident:** Sprint 216's uncommitted code was wiped by deckent's worker-spawn `git reset --hard`/stash (Sprint 177 rollback) when sprint-217 launched from the dashboard; reconstructed + committed Sprint 218. **Root bug → Sprint 218 P0:** worker-spawn must not reset the deckent-dev tree (ADR-039 self-modifying exemption).


- **Sprint 211 closed:** 16/16 DONE, 0 tech-debt, 0 NO_GO, 16m19s.
- **Sprint 212 closed:** 15/15 DONE — F5 evolution crowning (6 dormant modules → live callers), routing skew fix (skill→agent affinity signal), doc-reality sync (code-derived module counts), IDE extension scaffold.
- **Sprint 213 killed** — mass synthetic NO_GO due to auth-precedence bug (`spawn-backend-docker.ts` forwarding `ANTHROPIC_API_KEY` unconditionally into containers → CLI API mode → Tier-1 timeout). All tasks cleared; Sprint 214 relaunched with `env -u ANTHROPIC_API_KEY`.
- **Sprint 214 closed:** 20 tasks — P0 auth-precedence fix (ADR-076), user-facing surfaces (serve token-inject + Path A embedded chat), IDE extension real impl (command palette, sidebar, statusbar, settings bridge), F1-009 8-provider (OpenAICompatibleAdapter → DeepSeek/Qwen/GLM, dynamic ProviderName; adapter built but NOT yet bootstrap-registered — dormant, Sprint 215 P0; ADR-077), F7-003 UI/UX pass, chat CLI UX. ADR-076 + ADR-077 filed. (Sprint 215+ can launch without `env -u ANTHROPIC_API_KEY`.)
- **Sprint 215 closed:** 21 tasks (6 waves) — DALGA 0: CI-hermeticity permanent (`test:ci-sim` clean-state reproducer, `lint-test-hermeticity.mjs` guard, `tests/helpers/sandbox-home.ts` HOME isolation, karpathy-discipline Test Hermeticity anchor; ADR-078 Part A). DALGA A: F1-009 bootstrap-register DONE (`provider.ts` registers DeepSeek/Qwen/GLM when keys present; `provider-overflow.ts` subs→API overflow; `task-router.ts` per-worker auth uniform; 8-provider smoke validated; ADR-078 Part B). DALGA B: Dashboard god-level (AppShell responsive/dark/light shell, terminal-sessions multi-session/history/clipboard, EnterprisePage tenant/RBAC/audit UI, MemoryExplorerPage FTS5+ADR timeline). DALGA C: Evolution moat visible (EvolutionPage genealogy+retirement+prompt-diff, `evolution-endpoint.ts` 3 REST endpoints, NervousPage pending-approval/panic UI; `promotion-pipeline.ts` closed-loop identity-mutation `applyAdaptation` live; ADR-078 Part C+D). DALGA D: Routing fix (frontend-design→frontend-designer affinity, diversity guard extended), doc-drift sync (update-readme-stats.mjs, module-count generator). DALGA E: ADR-078 + karpathy-discipline rule. **CI yeşil KORUNDU, 0 failures.** ADR-078 filed.
- **Full test suite (measured):** 18,606 passed / 58 skipped (1,052 files) + dashboard 570 passed. **0 failures.** `tsc --noEmit` clean.
- **Shipped engine:** PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle; 3 backends (docker/tmux/subprocess); 15 agents + 21 skills; routing-engine v2 + skill→agent affinity signal; Memory V2 (SQLite FTS5, dual-layer i18n); 32 MCP tools + 8 resources; 49+ CLI commands; React dashboard (7 pages) + embedded web terminal; VS Code extension (real impl: commands/sidebar/statusbar/settings).
- **Provider-free:** 100% of P0 (Ollama bootstrap, claude-hardcode cleanup, provider-agnostic defaults). **Sprint 214 adds:** OpenAI-compatible HTTP adapter + PROVIDER_MAP built; bootstrap-register pending → dormant (F1-009 ~60%, Sprint 215 P0).
- **F5 wire-gap closed (Sprint 212):** 6 evolutionary modules now have real runtime callers — `prompt-evolution`, `adaptive-agent`, `prompt-rollback`, `agent-genealogy`, `agent-retirement`, `specialization-drift`. Self-improvement loop is live. ADR-075.
- **Known debt carried forward:**
  - **Doc-code drift (partial):** managed-docs generator now code-derived for module counts; README badge and "96% context reduction" claim still need verification (§7 W-H).
  - **F2 streaming:** Path A embedded chat backend connected; real streaming (F2-007) remains post-beta.
  - **F7-003 UI/UX:** Layout responsive/dark-light pass done (Sprint 214); full god-level redesign remains Sprint 216.

> ### ⚠️ User-Visible Reality vs Wiring % — DASHBOARD RUN-AUDIT (Alperen 2026-06-01, evidence-based)
> The F1–F10 percentages measure **internal wiring**, NOT **end-to-end user-working UX**. Real-binary audit on 2026-06-01:
> - **`npx deckent serve` API/token** — ✅ **RUN-PROVEN (Sprint 216-006):** localhost auto-mints API token + injects `__DECKENT_API_TOKEN__` → `/api/status` 200 (Bearer), real data; 401 without (auth enforced). `/api/evolution/genealogy`, `/api/memory/search` 200.
> - **🔴 P0 — sprint-start FREEZES the dashboard:** starting a sprint from the UI runs `runSprint` in the same serve process → event loop blocks → HTTP stops → UI hangs in skeleton-loading. **Fix: detach sprint-start from serve** (child-process/fire-and-forget). *(serve log: `Sprint started via dashboard` → freeze.)*
> - **🔴 Chat hollow** — only answers `status` intent; no real conversational round-trip (216-008 backend exists, ChatPage not wired).
> - **🔴 Missing pages** — sidebar shows 5 (Dashboard/History/Memory/Config/Chat); **Evolution/Nervous/Enterprise (Sprint 215 "DONE") are NOT in sidebar/route** — those F7-006/009/010 DONEs are hollow.
> - **🎨 Design must improve** — current UI is functional-skeleton, not god-level. F7-003 visual/UX redesign (modern, native-speed, zero freeze) is core Sprint 217 work, not cosmetic.
> - **✅ Real:** terminals work; runs from project dir; plan+spawn mechanics work (217-001 docker worker spawned healthy).
>
> **Developer face (Sprint Mode) genuinely works** (216 sprints of dogfood). serve API/data-load is run-proven; the **dashboard is only partially user-working** — full fix is **Sprint 217** under the Proof-of-Function DoD (§11, real browser/HTTP `Smoke:` proof; now live in code so these can't be marked DONE without a real run). Tracked: memory `project_dashboard_realrun_findings`.

---

## 4. Feature Status Matrix (F1–F7, reconciled)

### F1 — Provider Independence — **~95%**
| ID | Item | Status |
|----|------|--------|
| F1-001/002/003/006/007 | Ollama bootstrap, provider-agnostic defaults, claude-hardcode cleanup, token throttle | ✅ DONE |
| F1-004 | Docker provider-aware CLI invocation (binary select + auth + build-arg) | ⬜ P1 |
| F1-005 | Dockerfile.worker multi-CLI (build-arg opt-in) | ⬜ P1 (depends F1-004) |
| F1-008 | **Naive (conversational) chat mode** + intent classifier (CASUAL vs TASK→MCP tool invoke) | ✅ DONE — `src/cli/commands/chat.ts` (`classifyChatIntent`, `buildNaiveSystemPrompt`); delegates tool dispatch to host CLI via MCP auto-attach |
| F1-009 | **8-provider simultaneous fleet** (Alperen 2026-06-01) — run Claude+Gemini+Codex subscriptions + ≥5 API providers (DeepSeek, Qwen, GLM, …) + local Ollama **at the same time**, coordinated | ✅ **~95% (Sprint 215)** — `OpenAICompatibleAdapter` built (fetch `/chat/completions`; DeepSeek/Qwen/GLM presets); `PROVIDER_MAP` + `ProviderName` widened (ADR-077). **Sprint 215:** `provider.ts` bootstrap now calls `registerProvider` when DEEPSEEK/DASHSCOPE/ZHIPU keys present → DeepSeek/Qwen/GLM are runtime-selectable (wire-gap closed). `provider-overflow.ts` `resolveWithOverflow` (subs→API tier-preserving overflow). `task-router.ts` per-worker auth/provider resolution uniform across Sprint/Task/Process. 8-provider smoke validated (`multi-provider-fleet-smoke.mjs`). ADR-078 Part B. **Remaining:** per-provider model-catalog model IDs, e2e mixed-provider sprint test with live keys. |
| F1-010 | **Provider/auth load-balancing** — when a subscription hits its rate/quota limit, overflow that worker to an API provider automatically (subs *and* API together for max throughput) | ⬜ proposed — extends F6 authMode; today `authMode` is a static per-task field, no dynamic subs→api overflow orchestration |

### F2 — Native Chat — **~95%**
| ID | Item | Status |
|----|------|--------|
| F2-001..003 | Tool-use loop, memory integration, streaming+multi-turn+resume | ✅ DONE |
| F2-004 | Real ProviderAdapter round-trip (subscription CLI spawn, live registry) | ✅ DONE (Sprint 211) |
| F2-005 | MCP tool dispatch (deckent_status/memory_query feedback) | ✅ DONE (Sprint 211) |
| F2-006 | Session persist + resume (memory.db) | ✅ DONE (Sprint 211) |
| F2-006d | Session persist + **`deckent chat --resume <sessionId>`** | ✅ DONE — `ChatTurn` (session_id/turn_index/role/content/timestamp) via `MemoryStore.appendChatTurn`/`getChatHistory` with FTS5 `chat:<sessionId>` tags; CLI renders recent turns before launch |
| F2-007 | **Streaming live** (real provider streaming, not mock) | ✅ **DONE (Sprint 219)** — `src/api/chat-stream.ts` `streamChatMessage(message, adapter)` → `AsyncGenerator<ChatStreamEvent>` (chunk + done events); `adapter.stream` fallback; `/api/chat/stream` SSE endpoint wired in `server.ts`. Dashboard `chat-stream-client.ts` tüketir. ADR-081. |
| F2-008 | **Native SDK round-trip** (true standalone, Path C) | ⬜ Q3 2026 |
| F2-009 | **Path A embedded dashboard chat** (host-CLI-free, Sprint-214) | ✅ DONE (Sprint 214) — `chat-backend.ts` bridges browser messages to server-side ProviderAdapter; dashboard ChatPage wired; ADR-076 Part C |

### F3 — Process Mode — **~85%**
| ID | Item | Status |
|----|------|--------|
| F3-001/002/003/005/006/007 | Tenant context, scheduled flows, event triggers, flow runtime, self-dispatch guard | ✅ DONE |
| F3-004 | SessionBackend k8s pod-exec | ⬜ P3 (post multi-tenant Phase 2) |
| F3-008 | **Workflow Composer** — declarative/visual multi-step flow definition on top of scheduled-flow + flow-registry | ⬜ proposed (Copilot analysis, Sprint 212) — flows exist as code; a composable DAG/visual editor is the new layer |

### F4 — Enterprise — **✅ 100%**
| ID | Item | Status |
|----|------|--------|
| F4-001 | RBAC enforcement (`enforceRbac` runtime) + grant/revoke CLI | ✅ DONE (Sprint 207/208/211) |
| F4-002 | Audit compliance export (JSON+CSV+HMAC chain) | ✅ DONE (Sprint 211) |
| F4-003 | Rate/resource limit per-tenant (token-bucket) | ✅ DONE (Sprint 211) |
| F4-004 | Enterprise config schema (opt-in) | ✅ DONE (Sprint 208) |
| — | SSO/OIDC depth, SIEM forwarder, compliance report generator | ⬜ optional post-212 |

### F5 — Evolutionary Architecture — **✅ ~90% (wire-gap closed Sprint 212)**
| ID | Item | Status |
|----|------|--------|
| F5-001 | prompt-evolution → sprint-reporter (rule-based suggestions in retro) | ✅ DONE (Sprint 212 — `collectPromptEvolutionSuggestion` in `sprint-reporter.ts`) |
| F5-002 | adaptive-agent → outcome-tracker (skill add/remove suggestions) | ✅ DONE (Sprint 212 — `adaptAgentRuntime` called in `outcome-tracker.ts`) |
| F5-003 | cross-sprint-analyzer (trend report) + `deckent evolve` CLI | ✅ DONE (genuinely wired) |
| F5-004 | **Real runtime callers** (sprint lifecycle invokes F5-001/002/005) | ✅ DONE (Sprint 212 — ADR-075 — 6 external callers wired) |
| F5-005 | **Dormant evolution modules** → real callers (E-2 `prompt-rollback.ts`, E-4 `agent-genealogy.ts`, E-5 `agent-retirement.ts`, E-6 `specialization-drift.ts`) | ✅ DONE (Sprint 212 — all 4 modules now have external callers in `promotion-pipeline.ts` and `sprint-reporter.ts`) |
| F5-006 | **Evolution visibility** — retro "Next Sprint Behavior Changes" section | ✅ DONE (Sprint 212 — `sprint-retro-writer.ts` behavior-changes section) |
| F5-007 | **Evolution dashboard page** (`/evolution`: genealogy tree + retirement timeline + prompt-diff viewer) | ⬜ Sprint 216 (backend ready, no frontend layer) |
| F5-008 | **Active identity-mutation loop at scale** (Alperen 2026-06-01) — when an agent's success rate drops, actually mutate/refactor its identity (prompt+skill repertoire), not just *suggest*. Toward million customizable, evolvable agents/skills across million environments | ⚠️ **~70% (Sprint 215)** — `promotion-pipeline.ts` extended with `applyAdaptation`: low-success → adaptive-agent proposal → apply (prompt rewrite + skill delta) → `recordGenealogy` (parent/child versioned variant) → nervous checkpoint if `requiresApproval`. Closed-loop is live. **Remaining (post-beta):** A/B variant scoring integration (routing engine picks winner), mutation-frequency rate-limiter (max 1/3 sprints per agent), scale validation across 1000+ agent variants. ADR-078 Part C. |

### F6 — Auth Flexibility — **~50%**
| ID | Item | Status |
|----|------|--------|
| F6-001 | Per-task `- Auth:` override | ⚠️ partial — `readTaskAuthMode` exists; DIRECTIVES `Provider:` parsing + fallback chain (`resolveProviderWithFallback`/`getEquivalentModel`) wired w/ `tests/core/provider-fallback.test.ts`; **missing:** e2e mixed-provider sprint test (Claude brain + Codex worker + Gemini auditor, real MCP dispatch) |
| F6-002 | Hybrid mode (subscription brain + API/local workers) | ⚠️ config exists, not fully wired |
| F6-003 | Auth matrix test (4 combinations) | ⬜ |
| F6-004 | API real activation + tier-aware throttle | ⬜ **POST-BETA** (Tier-1 30K tok/min cap; subscription-only during beta) |
| F6-005 | **Live model catalog** (`model-catalog.ts` models.dev fetch + 24h cache + bundled fallback; `deckent models list/refresh/tier`) | ✅ DONE — 13 bundled models as offline fallback, overlaid by live catalog via `mergeApiIdOverrides`; ADR-023 tier routing preserved |
| F6-006 | **Per-worker auth/provider in task JSON across all 3 modes** (Sprint/Task/Process) — premium architecture so each worker picks subs-or-API-or-local correctly | ⚠️ partial — task JSON `authMode` field exists (api-surface.md); needs first-class per-worker `provider`+`authMode` resolution wired uniformly across Sprint/Task/Process mode + paired with F1-010 overflow |

### F7 — Dashboard & Control Plane — **~95%**
| ID | Item | Status |
|----|------|--------|
| F7-001/002 | API auth fix (localhost auto-inject) + live data parity (SSE/WS) | ✅ DONE |
| F7-005/008 | Sprint control panel + onboarding wizard | ✅ DONE |
| F7-003 | **UI/UX god-level redesign** (modern, responsive, dark/light, info architecture) | ✅ **DONE (Sprint 218, run-proven)** — `Layout.tsx` god-level shell (CSS grid, responsive breakpoints, meaningful loading-state not skeleton); `theme.ts` centralised design tokens (dark/light, color/spacing/radius/shadow); `use-live-data.ts` SSE/stale-while-revalidate (no freeze/skeleton-thrash, graceful reconnect). ADR-080. |
| F7-004 | Terminal hardening (multi-session, history, copy/paste) | ⚠️ ~75% (Sprint 215: `terminal-sessions.ts` — multi-session list/switch, command history ring buffer, clipboard helpers, ADR-062 WS-gateway interface compat) |
| F7-006 | Enterprise view (multi-tenant, RBAC UI) | ✅ **DONE (Sprint 218, run-proven)** — `EnterprisePage.tsx` built Sprint 215; **wired to App.tsx route `/enterprise` + Sidebar.tsx link Sprint 218**. Previously hollow (page existed, no route/link). Now reachable. ADR-080. |
| F7-007 | Memory/ADR/debt explorer (FTS5 search, ADR timeline) | ✅ **DONE (Sprint 218, run-proven)** — `MemoryExplorerPage.tsx` built Sprint 215; **wired to App.tsx route `/memory-explorer` + Sidebar.tsx link Sprint 218**. Previously hollow. Now reachable. ADR-080. |
| F7-009 | **Nervous System UI** — `NervousPage.tsx` + pending-approval / panic-guard badge | ✅ **DONE (Sprint 218, run-proven)** — `NervousPage.tsx` built Sprint 215 with real `POST /api/nervous/*` (pending-approval, accept/reject, panic badge, 30s poll); **wired to App.tsx route `/nervous` + Sidebar.tsx link Sprint 218**. Previously hollow (page existed, no route/link). ADR-080. |
| F7-010 | **Evolution dashboard page** (`/evolution`: genealogy tree + retirement timeline + prompt-diff viewer) | ✅ **DONE (Sprint 218, run-proven)** — `EvolutionPage.tsx` (3 tabs: genealogy tree, retirement timeline, prompt-diff table) + `evolution-endpoint.ts` (3 GET endpoints); **wired to App.tsx route `/evolution` + Sidebar.tsx link Sprint 218**. Previously hollow. ADR-080. |
| F7-011 | **Dashboard nav tek-kaynak + 8-sayfa RENDER-based garanti** | ✅ **DONE (Sprint 219)** — `Sidebar.tsx` `navItems` single-source export; `Layout.tsx` import eder (duplikasyon kaldırıldı). RENDER-based test: gerçek React render → DOM'da 10 link assert (kaynak-grep değil). Cache-bust e2e smoke `scripts/dashboard-e2e-smoke.mjs`. ADR-081. |

### F8 — Capability Broker — **⬜ not built (proposed)**
> *Source: Copilot enterprise-vision analysis (Sprint 212), DNA-filtered & code-verified. A `capability` abstraction above skills/connectors so an agent calls `mail.search` without knowing the backend.*

| ID | Item | Status |
|----|------|--------|
| F8-001 | Capability abstraction layer — `capability.invoke(name, args)` resolving to one of N backends (`mail.search` → IMAP / Graph / Exchange) | ⬜ proposed — no `CapabilityBroker` in `src/`; today routing is provider-level (`provider.ts`) + skill/tool-level, not capability-level |
| F8-002 | Capability registry + per-capability backend selection (config/availability driven) | ⬜ proposed — extends connector-pool pattern (`src/connectors/connector-pool.ts`) |
| F8-003 | Capability-scoped permissions (`workbook.read` style, least-privilege per agent) | ⬜ proposed — finer-grained than current scope.filesWrite / ADR-037 RBAC |

### F9 — MCP Client / Dynamic Discovery — **⬜ not built (proposed, high-value)**
> *Source: Copilot analysis. Today Deckent is an MCP **server** (exposes 32 tools); it cannot **consume** external MCP servers. Making it an MCP **client** opens the whole MCP ecosystem to Deckent agents — DNA-aligned (self-hosted, no vendor lock).*

| ID | Item | Status |
|----|------|--------|
| F9-001 | MCP client — connect to external MCP servers, list/call their tools from within a sprint/chat | ⬜ proposed — no `McpClient` in `src/`; only the server side exists |
| F9-002 | Dynamic tool discovery — register discovered external tools into the routing/tool registry at runtime | ⬜ proposed |
| F9-003 | Trust/approval gate for external MCP tools (risky external calls → checkpoint, reuse nervous approval) | ⬜ proposed — reuses existing approval flow |

### F10 — Policy Engine (maturation) — **⚠️ partial (proposed unification)**
> *Source: Copilot analysis. Unify the three existing decision surfaces into one declarative, self-hosted policy engine (OPA-style) — not a new dependency, a consolidation.*

| ID | Item | Status |
|----|------|--------|
| F10-001 | Unify RBAC (`rbac.ts`/ADR-037) + activation rules (`activation-engine.ts`) + condition evaluator (`condition-evaluator.ts`) under one policy model | ⚠️ pieces exist, not unified |
| F10-002 | Risk-tagged operation gating (`shell.exec`, `mail.send`, `erp.write`, `filesystem.delete` → mandatory approval) | ⬜ proposed — extends checkpoint/nervous approval with operation-risk tags |

---

## 5. Sub-Projects — Agentic-OS Pipeline (#1–#5)

| # | Sub-project | Status | Remaining |
|---|-------------|--------|-----------|
| **#1** | Embedded Web Terminal (PTY + WS gateway + token auth + audit; ADR-062) | ✅ **GA** (Sprint 175) | F7-004 polish |
| **#2** | Self-security (prompt/command guard, planner state-hygiene) | ⬜ **not started** | full scope |
| **#3** | Million-scale (multi-tenant isolation, k8s, mTLS, rate limits) | ⚠️ partial | Only `LocalTokenAuthProvider` (SHA-256 single-token); `verifyClientCert?()` is a no-op seam — **no** `RemoteTokenAuthProvider`/mTLS, **no** audit shard, **no** SQLite row-level security; per-tenant `rate-limiter.ts` is the only landed piece. TPM/HSM (PKCS#11) + Redis cluster aggregation not built. Sprint 185–188 plan was redirected to stability work |
| **#3-ext** | Brain Evolution — retro **"Next Sprint Behavior Changes"** section | ⬜ not built | `sprint-retro-writer.ts` lacks behavior-mutation diff (agent prompt mutation, skill repertoire gained/strengthened/retired, Brain decision-pattern change); ≥3 visible-changes satisfaction threshold not implemented |
| **#3-mesh** | Distributed Agent Mesh — multi-host worker mesh (workers across nodes, not single-host) | ⬜ proposed (Copilot analysis, Sprint 212) | builds on sub-#3 k8s pod-exec (F3-004); today all workers run on one host. Cross-node scheduling + shared memory/lock coordination is the new scope |
| **#4** | Enterprise integrations (RBAC/audit/rate done; SSO/SIEM/compliance) | ✅ core done | SSO/SIEM/compliance depth (optional) |
| **#ERP** | ERP runtime integration (Alperen 2026-06-01) — Deckent runs *inside* enterprise: process automation, file usage, **DB access (read-only first)**, controlled management | ⬜ proposed | builds on Process Mode (F3) + Capability Broker (F8 `db.query`/`erp.read` capabilities, scoped read-only) + RBAC (ADR-037) + approval gate. The concrete "runtime ecosystem" vertical; least-privilege per ADR-037 |
| **#5** | Local LLM (Ollama/CUDA) | ⚠️ partial (adapter live, fully-local preset missing) | `OllamaAdapter` (HTTP probe + spawn) + `OLLAMA_BUILTIN_MODELS` (qwen2.5-coder:32b/7b, llama3:8b, llama3.2:3b) with tier mapping are implemented; missing: `worker_provider:ollama` fully-local sprint preset + data-sovereignty test (closed-network, zero-API-cost). RTX 5090 + CUDA 13.2 + WSL2 ready (32GB VRAM → 70B) |

---

## 6. Native Chat Everywhere (priority arc — Alperen-decided)

The goal: `deckent` works as a native conversational agent the way `claude` does — in the **terminal**, in the **web UI**, and inside **any IDE**. Three architectural paths (A/B/C) and the VSCode extension overlay, not compete.

| Path | What | LoC | Effort | Prereq | ADR-033 fit |
|------|------|-----|--------|--------|-------------|
| **B** (host CLI) | `deckent chat` spawns user's claude/codex/gemini CLI + auto-attaches MCP | ~150 | 0.5 sprint | user CLI installed | ⚠️ partial |
| **A** (embedded) | "Deckent Chat" tab in dashboard, reuses Sprint-175 PTY/WS/auth/audit | ~600 | 1–2 sprint | none | ✅ |
| **C** (native SDK) | Own tool-use loop + REPL via Anthropic/OpenAI/Google SDKs; zero CLI prereq | ~1500 + migration | 3–4 sprint | none | ✅ full (ADR-010 amendment) |
| **IDE ext** | VS Code/JetBrains extension: sidebar, command palette, status bar, `deckent` command | new sub-project | 2+ sprint | none | ✅ |

**Current reality (Sprint 219 update):** Path B is now fully native — bare `deckent` (no args) launches the agentic REPL (`runChatNativeLoop`) directly; `--native` flag still works; `shouldLaunchDefaultRepl` in `entry.ts` handles the routing (219-001, ADR-081). Doğal dil → MCP aksiyon dispatch (219-004), riskli aksiyon onay kapısı (219-005), oturum persist/resume (219-006), god-level REPL UX (219-003) hepsi Sprint 219'da teslim edildi. Path A (dashboard ChatPage) gerçek SSE streaming ile güçlendirildi (219-007/008). Path C ve IDE extension sıradaki yay (Q3 2026).

**Approved sequence (Alperen):**
1. **Stability/hygiene first** — close the F5 wire-gap (real external callers) + fix agent routing skew.
2. **IDE extension** — `extensions/vscode/` from scratch; `deckent` command inside IDEs like `claude`.
3. **Web UI chat tab** — Path A (dashboard-native chat surface).
4. **F2 streaming + native SDK** — Path C (true standalone, zero prerequisite), Q3 2026 arc.

---

## 7. Work Streams (W-A … W-K, reconciled)

Most beta-critical streams already landed across Sprints 189–211. Remaining:

| Stream | Title | Status | Remaining |
|--------|-------|--------|-----------|
| W-A | OSS GA blockers | ✅ done | — |
| W-B | Doc/wire drift fixes | ✅ mostly | doc-reality sync (e.g. extensions/vscode reference) |
| W-C | Native chat (Path B→A→C) | Path B ✅ | Path A + C + IDE ext (see §6) |
| W-D | Dashboard rebirth (UI/UX) | ⬜ | F7-003 god-level redesign |
| **W-E** | **Evolutionary architecture crowning** | ✅ done | F5-004 real callers landed Sprint 212 (ADR-075) — 6 modules live; F5-007 dashboard page remains |
| W-F | Provider repair + local LLM + live catalog | ✅ P0 | F1-004/005, sub-#5 activation |
| W-G | API surface tests | ✅ done | — |
| W-H | Documentation perfection | ⚠️ partial | this consolidation + ref sync |
| W-I | OSS publish pipeline | ⬜ | public repo flip, npm publish (Alperen manual) |
| W-J | Million-user hardening | ⬜ post-beta | OTel/Prometheus, ADR-037 RBAC hard-flip V2 |
| W-K | Dead-code → live-feature wire-up | ⚠️ | overlaps W-E (F5 callers) |
| W-INTEGRITY | Brain integrity hardening (Sprint 192) | ✅ done | — (`worker-liveness.ts` liveness checks, EVALUATE skips DEFERRED, `TaskEvaluation.DEFERRED`, adaptive `runtime_extension`, liveness-gated synthetic-result lint, `NEVER_DISPATCHED` event + retro reporting) |
| W-H (detail) | Documentation deliverables gap | ⚠️ partial | Missing: `docs/cookbook/`, full EN user guide, lifecycle/API-surface diagrams, `why-deckent-vs-X`, demo videos, `docs/benchmark/memory-v2.md` (96% claim), `docs/security/threat-model.md`, `docs/adr-index.md`, `npm run docs:test` |
| W-J (detail) | Performance hardening | ⬜ not built | cold-start <500ms (now ~2s eager imports), lazy-load commands, agent/skill-cache lazy-loader, Memory V2 query index, worker-spawn <3s SLA, `tests/load/`, OTel/Prometheus |
| W-B (detail) | CLI/MCP parity gaps | ⚠️ partial | MCP missing vs CLI: `deckent_agent_manage`/`deckent_skill_manage` (list-only), `deckent_memory_manage` (query-only), `deckent_cost`; ~20 missing options across history/retro/review/run/explain; no `lint-cli-mcp-parity.mjs` guard |
| W-A (detail) | i18n contribution path | ⚠️ partial | Dashboard EN/TR + CLI i18n + content-generators present; missing "add-a-language" contribution guide + MCP tool descriptions hardcoded English (no i18n wrapper) |

---

## 8. Business / Launch / OSS

- **Model:** MIT, free forever, self-hosted. No paid tier, no feature gate, no `deckent.app` account. Enterprise capabilities (multi-tenant, mTLS, k8s, SSO, SIEM, compliance) ship under the same MIT license — **not** a separate Enterprise Edition.
- **Beta:** v1.0.0-beta.1, OSS public beta window **2026-06-01**. First `npm publish` is **manual by Alperen** (policy: `feedback_npm_publish_user_approval`).
- **Distribution:** `npm install -g deckent`; VitePress docs site; public repo flip (`VerhexIO/deckent`) — monorepo vs split decision pending; sensitive-data scrub (git-filter-repo) before flip.
- **Marketing channels:** Show HN, Reddit (r/LocalLLaMA, r/programming, r/opensource), Twitter/X, Turkish dev community, Discord, Dev.to, landing page + demo video.
- **Comparison (capability, not disparagement — Alperen 2026-06-02):** the only OSS tool combining multi-agent parallel execution + sprint lifecycle + scope enforcement + memory/learning + multi-provider + MCP-native, in **one MIT product** that serves both the individual (native `deckent` REPL, zero-config) and the enterprise (multi-tenant, RBAC, audit, ERP — same codebase, **NOT a gated Enterprise Edition**, ADR-033). We compare on merits with Devin, Cursor, Claude Code, Cowork, Perplexity and open agent CLIs; we do not position as "anti" any of them. Tagline: **"Open source for open world."**
- **Single-product model (decided 2026-06-02):** NOT open-core / NOT an Odoo-style separate Enterprise Edition. One MIT codebase; enterprise capabilities are modular layers (`core` + `enterprise-layer`) but **all open & free**. Individual ease (native agentic REPL) and enterprise complexity ship together. ADR-033 holds.
- **Growth target:** million users (god-level, no-MVP scope).
- **DeckentHub (skill marketplace, shipped seed):** `deckent-hub/skills/` holds the 20-skill seed set (spotify-control, telegram-bot, calendar-google, email-imap, weather-forecast, rss-reader, web-scraper, github-issues, slack-notifier, notion-sync, todoist, spotify-playlist, youtube-downloader, reddit-fetcher, twitter-post, screenshot-vision, file-organizer, currency-converter, translator, discord-moderator). `deckent skill publish` = sandbox + Ed25519 sign (`src/core/signature.ts`, @noble/ed25519) + registry push. Hub is a local directory, not yet flipped to a separate `VerhexIO/deckent-hub` repo.
- **DeckentHub growth + governance (planned):** signing infra done, CI `validate-skill.yml` scaffolded, `rating-system.ts` present. **Not built:** moderation queue, CI auto key-rotation, phased registry growth 20→50→100 with vector search. Post-beta maturation track.
- **OSS publish pipeline — decisions outstanding:** Done: `.gitignore` excludes `.brain/`/`.tasks/`/`.locks/`, `package.json bin.deckent`, validate-publish engine/entry-point gates. **Undecided/not built:** monorepo-vs-split flip, sensitive-info scrub (no git-filter-repo/BFG/gitleaks pre-commit), final npm package name, `.github/ISSUE_TEMPLATE/`, PR template, `FUNDING.yml`, landing page.
- **AEGIS public standard track (post-beta, deferred):** ADR-061 Phase 5 names `agentaegis.io` (open standard repo), an AEGIS-compliant-orchestrator certification program, and academic papers (ICSE/FSE 2027, NeurIPS 2026 multi-agent track). Not built — no domain, spec draft, or paper artifacts; deferred until AEGIS Phase 1–4 ship.

---

## 9. Beta Gates (status as of 2026-06-01)

20 of the original gates pass: `tsc` clean, vitest **18,390 passed / 58 skipped (1,021 files) + dashboard 570 passed (0 failures)**, coverage, all MCP tools (32) + CLI commands (49+) functional, `npm pack` clean, cross-platform (macOS/Linux/WSL2), multi-provider abstraction, i18n, Memory V2 stress, zero CRITICAL/HIGH debt, ADR governance, Brain stability, synthetic-NO_GO disk-verify gate.

Recently closed (Sprint 192–211):
- **Synthetic NO_GO KAYNAK 6+7 closure** — ✅ both timeout-synthesis (`gateSyntheticTimeoutResult`) and graceKill panic-guard (`gateSyntheticGraceKillResult`) now call `verifyDiskAgainstClaim`, emit `DISK_VS_CLAIM_MISMATCH`, and reclassify to MANUAL_REVIEW_REQUIRED on disk contradiction. Disk-verify gate 100% closed across both paths.
- **memory.db sprint-log finalize fix + backfill** — ✅ Sprint 197 missing-row bug fixed (`sprint-finalizer.ts` defensive `upsertSprintLog`); reconstruction tool `scripts/backfill-sprint-log-rows.mjs`.

Conditional/open:
- **✅ CI-CD GREEN (months-broken → FIXED Sprint 214, commit `b67c000`):** all GitHub Actions workflows pass — CI (Type Check, Security, every test shard, **Coverage Report 5m15s**, **Build 28s**), Docs, Cross-Platform E2E, Secret Scan. Coverage Report + Build now actually run (were never reached for months). **Root-cause family: green-local ≠ green-CI** (8 fixes): (A) non-hermetic tests reading gitignored `.deckent/config.json` / `.brain/memory.db` → skip-if-absent / MemoryStore mock (`spawn-backend-docker`, `nervous-faz1-smoke`, `tools.test` retro); (B) brittle assertion (`task-builder-skill` `===3000`→`>=3000`); (C) blocking `spawnSync` freezing the vitest worker (`dead-code-audit` → async spawn); (D) **Coverage-job teardown RPC starvation** on the 2-core runner (forks serialising v8 coverage at teardown) → `pool:'forks'` + `maxForks:2` under CI + `teardownTimeout:30s`; (E) 7 vitepress dead-links → GitHub URLs / absolute paths. Full pattern map: memory `project_ci_green_root_causes`. **Remaining hardening (Sprint 215):** `npm run test:ci-sim` (clean-state local reproducer) + CI-hermeticity lint + ci-guardian/ci-testing routing so this never silently regresses.
- **Multi-provider runtime** — abstraction ready; docker backend Claude-only, tmux/subprocess support Codex/Gemini (full docker parity = F1-004/005).
- **Messaging trio** (Discord/Telegram/WhatsApp) — scaffold present, token activation pending.
- **M1–M4 monitoring baseline auto-blocker** — ⬜ not built. Post-beta observability gate.
- **Documentation sync** — MASTER-PLAN consolidation done; remaining: README badge (190+ → 214+), unverified "96% context reduction" claim (no benchmark file), CLAUDE.md/DECKENT.md module-count re-sync (§3).

---

## 10. Sequencing — Sprint 212+ (consolidated, comprehensive)

Per Alperen's direction: **combine sprints, write larger comprehensive tasks** (Deckent handles the scale), keep the small-file/single-responsibility discipline *within* each task. Big-scope sprints, 10 workers, high parallelism.

| Sprint | Theme | Scope |
|--------|-------|-------|
| **212** | **Stability/Hygiene + Evolution crowning** | F5-004 real external callers (prompt-evolution + adaptive-agent wired into sprint lifecycle, scope includes caller modules); agent routing skew fix (skill→agent signal: frontend-design→frontend-designer, security-specialist→security-auditor); doc-reality sync; ≥1 forward task |
| **213** | **Killed** | Killed mid-sprint due to auth-precedence bug — mass synthetic NO_GO. All tasks cleared; Sprint 214 relaunched. |
| **214** | **P0 Auth-fix + User-Facing + IDE ext + 8-provider (DONE)** | Wave 0: auth-precedence fix (ADR-076). Wave A: serve token-inject + Path A embedded chat + chat CLI UX + F7-003 UI/UX. Wave B: VS Code extension real impl (commands/sidebar/statusbar/settings). Wave C: F1-009 8-provider (OpenAICompatibleAdapter + PROVIDER_MAP + bootstrap; ADR-077). Wave D: ADR docs + status. 20 tasks. |
| **215** | **✅ CI-Hermeticity Permanent + 8-Provider Fleet + Dashboard God-Level + Evolution Moat (DONE)** | 21 tasks, 6 waves, 0 failures. DALGA 0: `test:ci-sim` + `lint-test-hermeticity.mjs` + `sandbox-home.ts` + karpathy-discipline anchor. DALGA A: F1-009 bootstrap-register (DeepSeek/Qwen/GLM usable), `provider-overflow.ts`, `task-router.ts` per-worker auth uniform, 8-provider smoke. DALGA B: AppShell + terminal-sessions + EnterprisePage + MemoryExplorerPage. DALGA C: EvolutionPage + evolution-endpoint (3 GET) + NervousPage + `applyAdaptation` identity-mutation closed-loop + ADR-078 Part C. DALGA D: frontend-designer affinity fix + diversity guard + readme/module-count drift. DALGA E: ADR-078 + karpathy-discipline rule. CI yeşil KORUNDU. ADR-078 accepted. |
| **216** | **✅ DONE — Proof-of-Function DoD + serve F7-001** | ADR-079 accepted; `isUserSurfaceTask` Tier-0/Tier-1; in-sprint Smoke gate (`proof-of-function.ts`); serve localhost token auto-mint FIXED (run-proven). |
| **217** | **Killed (placeholder sprint — no impl)** | Sprint launched as placeholder with no task content; NO_GO. Root bug (self-mutation guard) confirmed and fixed in Sprint 218. |
| **218** | **✅ DONE — Dashboard God-Level (hollow → run-proven)** | DALGA ÖN: git self-mutation guard P0. DALGA 0: sprint-start detach (serve no longer freezes). DALGA A: 4 hollow pages wired (route+sidebar), chat real round-trip, DirectivesEditor. DALGA B: god-level UI (use-live-data SSE/stale-while-revalidate, theme tokens, Layout shell). DALGA C: ADR-080 + dashboard guide + e2e tests. F7 → ~95%. |
| **219** | **✅ DONE — Native Agentic Deckent (Agentic-OS + F2 Streaming + Dashboard Kalıcı-Fix)** | DALGA A: `deckent` argümansız → agentic REPL (219-001, ADR-081); `runChatNativeLoop` run-proven (219-002); REPL UX god-level (219-003). DALGA B: doğal dil → MCP aksiyon dispatch (219-004); riskli onay kapısı (219-005); oturum persist (219-006). DALGA C: F2-007 token-streaming SSE `chat-stream.ts` + `/api/chat/stream` (219-007); dashboard akan render (219-008). DALGA D: dashboard nav tek-kaynak + RENDER-based test (219-009); cache-bust e2e smoke (219-010). DALGA E: TR MASTER-PLAN (219-011) + ADR-081 (219-012). DALGA F: blueprint.md güncel (219-013); `autonomous-runtime.ts` iskelet (219-014). DALGA G: `routeTaskV2` wire (219-015); Smoke field propagation (219-016). **ADR-081 accepted.** CI yeşil KORUNDU. |
| **220** | **✅ DONE — Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı (ADR-082)** | DALGA A: `chat_provider ?? brain_provider ?? 'claude'` config-driven native wire — REPL gerçek cevap (220-001); `chat --once/--message` headless (220-002); agentic dispatch canlı (220-003). DALGA B: WorkerGrid SSE real-time (220-004); StatusPage done→done (220-005); RefreshButton cooldown (220-006); ChatPage round-trip+akan (220-007). DALGA C: coverage-endpoint+/api/coverage (220-008); DebtPage filtre (220-009); EnterprisePage auth+dedup+provider-neutral (220-010). DALGA D: Nervous Faz-1 — `createNervousSystemIfEnabled` bootstrap (220-011); 8 action-handler (220-012); config enabled:true (220-013). DALGA E: ADR-082+MASTER-PLAN (220-015/016). **ADR-082 accepted.** `deckent` GERÇEKTEN konuşur. Nervous aktif. CI yeşil KORUNDU. |
| **221+** | **F2 Native SDK (Path C) + Publish Readiness** | Real standalone SDK; zero-prerequisite `npx deckent`; secret-scrub/gitleaks; .github eksikleri; 96%-claim doğrulama; threat-model — Q3 2026 |
| **post-beta** | **Provider/local LLM + million-user hardening** | F1-004/005, sub-#5 Ollama/CUDA fully-local preset, OTel/Prometheus (W-J), ADR-037 hard-flip V2, sub-#2 self-security |
| **post-beta (gated)** | **Voice + Mobile (milestone-gated)** | Voice (STT Whisper, wake-word Porcupine, TTS, real-time streaming) gated behind **10K GitHub stars**; Mobile (React Native iOS/Android MCP client, APNs+FCM push, Contacts/GPS/camera skills) gated behind **50K stars**. Both not built — zero source references |
| **post-beta (if approved)** | **AEGIS methodology (ADR-061)** | Forward-looking spec (status=proposed): 3 layers, 5 roles, 8 artifacts, 9-phase lifecycle, EffectClass-aware verification. Phase 0–5 (orig. Sprint 175–200) never executed — no `src/aegis/`. Phase-1 foundation is the entry point if approved |
| **post-beta (ecosystem)** | **Capability Broker (F8) + MCP Client (F9) + Policy Engine (F10) + Workflow Composer (F3-008) + Agent Mesh (#3-mesh)** | From the Copilot enterprise-vision analysis (Sprint 212), DNA-filtered. F9 (consume external MCP servers) is the highest-value, ecosystem-opening one. All self-hosted, no new SaaS dependency. Sequence after the native-chat arc |

---

## 11. Anchor Rules / DNA / Governance (unchanged)

- **No MVP, ever** — god-level scope; ask "is this god-level?" (`feedback_no_minimum_no_mvp_deckent`).
- **Disk-verify ground truth** — trust the disk, not Brain verdict or worker self-assessment (`feedback_trust_brain_eval_not_worker`).
- **Subscription-first** — API mode forbidden during beta (`project_api_mode_deferred_post_beta`).
- **npm publish = manual Alperen** (`feedback_npm_publish_user_approval`).
- **Karpathy 4-discipline** worker anchor (Think / Simplicity / Surgical / Goal-driven).
- **Wire proof must measure the goal, not the letter** — exclude def-file from caller greps; wire-task scope must include the caller (`feedback_directive_kanit_letter_vs_goal`).
- **Memory budget** 900 lines max in `.brain/`.
- **ADR-033** Product-Not-Service · **ADR-037** RBAC authority matrix · **ADR-041** agent taxonomy · **ADR-040** nervous system · **ADR-062** embedded terminal · **ADR-074** native chat + enterprise + evolution.

---

## 12. Top Risks

1. **F5 stays dormant** — entry-points without callers read as "DONE" but ship dead code; the evolutionary moat is unproven until F5-004 lands real callers. *Mitigation: Sprint 212 priority + per-sprint visible-change evidence.*
2. **Routing collapse** — agent diversity is fragile/non-deterministic; specialization value lost if everything routes to `refactorer`. *Mitigation: skill→agent activation signal (212-008; frontend-design→frontend-designer mapping still incomplete — Sprint 213 plan sent UI to architecture-planner).*
5. **✅ Auth-precedence bug (RESOLVED Sprint 214):** `spawn-backend-docker.ts` env-forwarding is now provider+auth-aware — `ANTHROPIC_API_KEY` is stripped for Claude subscription workers and only forwarded when `authMode=api`. Sprint 215+ launches without `env -u`. ADR-076 Part A. ([[feedback_container_auth_precedence]])
3. **Native-chat scope creep** — IDE extension + Path A + Path C is multi-sprint; risk of half-built surfaces. *Mitigation: strict sequence (hygiene → IDE → web → SDK), one surface fully landed before the next.*
4. **Doc-reality drift** — this consolidation fixes today; re-drift if future status lands only in scattered docs. *Mitigation: MASTER-PLAN is the only roadmap that gets status updates; others are frozen historical.*
6. **✅ Non-hermetic tests / CI red (RESOLVED Sprint 214, commit `b67c000`):** green-local ≠ green-CI (tests reading gitignored `.deckent/config.json` / `.brain/memory.db`, blocking spawnSync, 2-core coverage-teardown RPC starvation) is FIXED — full CI green incl. Coverage + Build. *Residual risk: regression if new tests re-couple to local state; mitigated by Sprint 215 `test:ci-sim` + CI-hermeticity lint.* (memory `project_ci_green_root_causes`)

---

## 13. Explicitly Out-of-Scope (considered & deferred — recorded for zero-loss)

Items surfaced during the Sprint 211 doc-consolidation audit that were intentionally **not** added to the active plan, with reasons (so nothing silently vanishes):

- **Cloud-hosted SaaS offering** — rejected by ADR-033 (Product-Not-Service); permanent non-goal.
- **Microsoft-ecosystem core integration** (Graph / Teams / Outlook / Excel / Word / SharePoint) — from the Copilot analysis; considered & **deferred as optional, post-GA, non-core**. May ship as opt-in `connectors/` (the existing Discord/Telegram/WhatsApp pattern) but must NOT become a core direction — it would dilute the provider-free / self-hosted / anti-Devin DNA. Not an "Enterprise Edition."
- **LangSmith / external trace SaaS** — rejected: violates "never calls home". Use self-hosted OTel + own trace-graph (W-J) instead.
- **"Enterprise Operating Layer" positioning** — the Copilot framing; Deckent stays "install-and-run, MIT, self-hosted", not a managed enterprise platform. Enterprise *capabilities* ship under MIT (no gated edition).
- **Extra provider adapters** (Groq, Fireworks, Together, litellm), **embeddings/RAG**, **SWE-bench harness**, **monorepo planner**, **skill template gallery**, **blog campaign** — P3+/aspirational; Claude/OpenAI/Google/Ollama footprint meets beta GA.
- **`deckentd` daemon, Electron tray, native-window framework** — redundant vs Tauri/PWA + embedded terminal; out of scope.
- **Vector DB, Devin-style wiki semantic indexing, multi-model critique layer, browser/computer-use, deploy capability, progressive-disclosure UX, intent-classifier learning loop, hardware-attested HMAC** — post-GA vision/competitive-gap items with no current code foundation.
- **Verified non-issues** (claimed bugs that don't exist): memory-rebuild CLI split (Bug Z3 — semantics already correct), `auditor.md` PATTERNS.md regression (template clean), dedicated `brain-self-update.ts` module (hooks already dispersed correctly).
- **Already-adequately-represented partials** (Reversibility/EffectClass, TaskType extensibility, ADR-055 Hybrid Scoring, ADR-060 Self-Awareness, Nervous Phase 2/3, context-aware routing, rule-evolver) — folded into existing §3/§4/§5/§7 status text rather than duplicated.

---

*Single source of truth. Update this document — not the superseded roadmaps — when status changes.*
