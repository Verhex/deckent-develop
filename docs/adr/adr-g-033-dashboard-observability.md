# ADR-G-033: Dashboard (Observability Surface)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=god-level observability dashboard run-proven live (Layout shell + reachable pages + sprint-start **detach** + stale-while-revalidate live-data + REST-poll WorkerGrid with SSE bridge at DashboardPage + evolution/coverage endpoints; Tier-1 Proof-of-Function smoke per ADR-G-009) → tomorrow=**observability-only contract** — interactive chat relocates to the Desktop app (DESK-1); the dashboard never becomes the primary surface (the native terminal, ADR-G-034, is primary)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-080 · ADR-078 (Part D) · ADR-082 (Parts B/C) · ADR-083 (Dalga D) · **Supersedes:** —
**Crosswalk:** ADR-080 + ADR-078(D) + ADR-082(B/C) + ADR-083(D) → ADR-G-033

> **Meta-note:** This ADR governs deckent's **web dashboard**. Per the 2026-06-29 strategic pivot, the dashboard is the **observability surface** — *"the dashboard explains."* The **primary** management+usage surface is the native agentic terminal (ADR-G-034, tool-driven, full-control-without-fatigue); **interactive** chat is forward-relocated to the Desktop app (DESK-1, Electron). The dashboard is a read/monitor plane, not the product's control center. The "Today" section records the god-level dashboard as built and run-proven; the "Tomorrow" section reframes its role under the pivot.

---

## Context

Through Sprints 215–221 the dashboard was driven from a functional-skeleton to a god-level surface, but every step exposed the gap between *files-on-disk* and *user-reachable, freeze-free, live* — exactly the `wired ≠ working` law (ADR-G-009). A real-binary browser audit (`npx deckent serve`, 2026-06-01) and follow-up run-verify passes surfaced a cluster of defects that a no-MVP product (ADR-G-016) cannot ship:

- **Sprint-start froze the dashboard.** `src/api/server.ts` called `runSprint(...)` *inside* the `POST /api/start` HTTP handler. `runSprint` is a long-running async operation that blocked the Node.js event loop, so the serve process stopped answering any further HTTP request — the UI fell into an unrecoverable skeleton-loading state. ADR-G-009's smoke gate did not cover the sprint-start path, so the freeze went undetected until a manual session.
- **Hollow pages.** Sprint 215 wrote four page files (`EvolutionPage`, `NervousPage`, `EnterprisePage`, `MemoryExplorerPage`) to disk, but `App.tsx` carried only 7 routes and `Sidebar.tsx` only 6 links — none of the four were reachable. A DONE verdict based on file-existence, not navigation, is a Tier-1 wire-gap by ADR-G-009.
- **Chat was status-only.** `ChatPage.tsx` dispatched every message to the `status` intent regardless of input; the real `POST /api/chat` round-trip was never called from the browser.
- **Static worker grid + stale status.** `WorkerGrid` loaded a fixed first-6 and never reflected later spawn/done transitions; `StatusPage` showed done work as still "working"; `History` always reported 0% coverage; the debt page had no filter; `EnterprisePage` showed empty data without an injected Bearer token; an auditor alert ("CLAUDE.md not updated") repeated as SPAM.
- **Skeleton-grade UX.** No stale-while-revalidate fetching, inconsistent dark/light tokens, layout shift on data load, no connection-loss recovery — below the god-level bar of ADR-G-016 / no-MVP (ADR-G-016).

Underneath the bug-fixing, the dashboard's *role* also moved. The 2026-06-29 pivot makes the **native terminal** the primary surface and recasts the dashboard as **observability-only**. The implementation work below is real and run-proven; the pivot does not delete it — it **reframes** what the dashboard is *for*, and routes interactive control to the terminal (ADR-G-034) and Desktop (DESK-1).

---

## Decision (Today)

The dashboard is a **god-level observability surface**: a freeze-free React SPA (Vite + ADR-D-001 TS/ESM) that renders live sprint, worker, evolution, memory, nervous, and enterprise state through a single **Layout** shell (App.tsx wires `Layout`; `AppShell.tsx` exists as an alternative shell but is not the mounted one), with detached sprint-start and a stale-while-revalidate live-data spine. No new runtime dependency was introduced (ADR-D-005 / ex-010); no-emoji — lucide-react icons only — is the RULE (brand consistency, ADR-G-010), with 2 residual ⚠ drift sites (WorkerGrid / DirectivesEditor) tracked as born DASH-EMOJI-FIX.

### 1. AppShell + Information Architecture

`src/dashboard/src/components/Layout.tsx` is the mounted top-level shell (App.tsx routes render inside `<Layout />`; `AppShell.tsx` is a designed alternative that is not currently wired): a header + sidebar + content with a dark/light token system propagated via `data-theme`, a single-source nav (`nav-items.ts` → `navGroups`/`navItems`), and an embedded terminal dock (`TerminalPanel`). The eight god-level surfaces are reachable through the Layout navigation:

```xml
<dashboard-surfaces nav="Layout (nav-items.ts SSOT)" reachable="8" routes="~21 (18 protected; the '11' was a Sprint-221 snapshot)">
  <page id="sprint"     route="/status"          source="StatusPage"          state="live sprint phase + per-task done/working/no_go"/>
  <page id="overview"   route="/"                source="home/dashboard"      state="sprint summary + KPI"/>
  <page id="evolution"  route="/evolution"       source="EvolutionPage"       state="genealogy tree · retirement timeline · prompt-diff (→ ADR-G-032)"/>
  <page id="memory"     route="/memory-explorer" source="MemoryExplorerPage"  state="FTS5 search · ADR timeline · debt table (→ ADR-G-035)"/>
  <page id="enterprise" route="/enterprise"      source="EnterprisePage"      state="tenant · RBAC · audit · rate-limit — full CRUD (POST+DELETE) wired dashboard-side (→ ADR-G-031; backend enforcement-authoritativeness is the remaining gap)"/>
  <page id="nervous"    route="/nervous"         source="NervousPage"         state="pending-approval · accept/reject · panic-guard · detector status (→ ADR-G-022)"/>
  <page id="terminal"   route="(dock, NOT a route)" source="TerminalPanel"     state="multi-session PTY dock embedded in Layout — not a /terminal nav route (→ ADR-G-029)"/>
  <page id="chat"       route="/chat"            source="ChatPage"            state="round-trip + slash (→ relocates to DESK-1 — see Tomorrow)"/>
  <!-- App.tsx carries ~21 routes total (18 protected); the "11" figure is a Sprint-221 snapshot (ADR-080 §2) -->
</dashboard-surfaces>
```

### 2. Sprint-Start DETACH — never block the serve event-loop

`src/api/sprint-job-runner.ts` exports `startSprintDetached(sprintId, root)`, which spawns the sprint as a **detached child** (`detached: true, stdio: 'ignore'`) and immediately `child.unref()`s it; `POST /api/start` in `server.ts` calls it **instead of** `runSprint`. The HTTP response returns before the sprint begins executing — the serve event loop is never blocked, and the dashboard stays responsive throughout a long sprint. A detached child (not a Worker thread, which shares the same libuv loop for I/O) is the clean isolation boundary. This is the load-bearing invariant of this ADR: **the observability surface must never freeze the process that serves it.**

### 3. Live-Data Spine — stale-while-revalidate + SSE WorkerGrid + theme tokens

- **`src/dashboard/src/lib/use-live-data.ts`** — SSE/polling hook with stale-while-revalidate semantics: serves cached data immediately on mount, revalidates in the background, shows a *reconnecting* indicator (not a skeleton) on connection loss, and aborts in-flight requests on unmount via `AbortController`. Achieved in ~80 LoC (no React Query / SWR — ADR-D-005).
- **`src/dashboard/src/components/WorkerGrid.tsx`** — consumes `use-live-data` via **REST polling (3s interval) as its source of truth**, so the worker list is real-time: the fixed-6 limit is removed and later spawn/done transitions render live (ADR-082 Dalga B). NOTE: SSE push is handled at the **DashboardPage** level, not inside WorkerGrid — the "SSE WorkerGrid" phrasing is a Sprint-221 snapshot. This grid is the dashboard projection of per-worker live state (the dashboard endpoint of WORKER-LIVE-TRACE, ADR-G-025).
- **`StatusPage.tsx`** — task state (done/working/no_go) and phase indicator are real-time (ADR-082 Dalga B); **`RefreshButton.tsx`** adds user-triggered refetch with a 10 s cooldown.
- **`src/dashboard/src/lib/theme.ts`** — centralized design-token map (color/spacing/radius/shadow, dark+light) consumed via CSS custom properties; no hard-coded hex in components (ADR-G-010 brand/output consistency).

### 4. Reachable Pages — wire + backing endpoints

- **Wire:** four routes added to `App.tsx` (`/evolution`, `/nervous`, `/enterprise`, `/memory-explorer`) and matching lucide-react links to the sidebar; the route table is 11 total and every page is reachable by nav + direct URL (ADR-080 §2).
- **`src/api/evolution-endpoint.ts`** — three read-only GET endpoints registered in `server.ts`: `/api/evolution/genealogy`, `/api/evolution/retirement`, `/api/evolution/prompt-metrics` (graceful empty arrays when no data) — the dashboard window onto the evolution loop (ADR-G-032).
- **`src/api/coverage-endpoint.ts`** — `/api/coverage` reads sprint coverage from memory.db/results so `History` shows real coverage, not a hard-coded 0% (ADR-082 Dalga C).
- **`DebtPage.tsx`** — sprint/severity/status filter dropdowns + search (ADR-082 Dalga C).
- **`EnterprisePage.tsx`** — F4/enterprise endpoints auth-wired with a Bearer token; auditor alerts deduped + provider-neutral (CLAUDE/GEMINI/AGENTS). Now carries **full tenant/RBAC/rate CRUD** (`mutate()` → POST+DELETE `/api/enterprise/{tenants,rbac,rate}`) — the Sprint-221 "read-first V1, no write actions" framing is SUPERSEDED. The remaining gap is not the UI but backend enforcement-authoritativeness of custom RBAC/rate rules + the V2 management-plane (ADR-G-031 gap #1).

### 5. Chat round-trip (Today) — parity with the terminal

`ChatPage.tsx` POSTs to `/api/chat` with a Bearer token and renders the streamed assistant reply, with multi-turn history, loading, and error states; a slash-command input (`/status`, `/recall`) maps to the backend agentic path (ADR-082 Dalga B / ADR-083 Dalga D), reaching parity with the native terminal's slash registry (ADR-G-034). The serve-side `resolveChatAdapter` SSOT (Sprint 269) backs the stream endpoint.

> Note: the chat round-trip is present and wired both client- and serve-side, but is **not** considered fully working today — the live-stream defect is recorded in Consequences (−) and the surface is forward-relocated (Tomorrow).

---

## Intent / Roadmap (Tomorrow)

- **Observability-only contract (the pivot's core reframe).** The dashboard's durable role is **monitoring + explanation** — *"the dashboard explains."* Read/observe surfaces (sprint, worker-live-trace, evolution, memory, nervous, enterprise audit) are the dashboard's mandate; it is **not** the product's control center and **does not** become the primary surface. Primary management+usage is the **native agentic terminal (ADR-G-034)** — tool-driven, deep, full-control-without-fatigue.
- **Interactive chat moves to the Desktop app (DESK-1, Electron, later).** Conversational/agentic interaction graduates off the web dashboard into the desktop client; the dashboard retains at most a read-only conversation view. Until DESK-1 lands, today's `ChatPage` remains as the interim surface (with the known live-stream gap below).
- **Enterprise read → write (V2 management-plane).** The V1 read-first EnterprisePage evolves into a god-level **management plane** with custom-RBAC CRUD, tenant management, and audit-export — tracked as ADR-G-031's enterprise gap (ENT-*), gated behind the enterprise layer (control/governance depth, not feature-gating; ADR-G-016).
- **WorkerGrid → WORKER-LIVE-TRACE.** The live worker grid becomes the dashboard projection of the per-worker live-trace contract (executing → checking → context-understood → writing .plan → evaluating), shared across dashboard/terminal/CLI/MCP (ADR-G-025).
- **Dashboard follow-ups (DASH bucket).** Serve-token-inject for the EventSource auth path, routing-diversity chart, control-panel surfacing, and an onboarding view land under the MASTER-PLAN **DASH** work-item (born from old 072/073/076 side-items).

---

## Consequences

**(+)** Sprint-start no longer freezes the dashboard — the serve process stays responsive across long sprints (detach invariant). All eight god-level surfaces are reachable; evolution/nervous/enterprise/memory data appear in the UI for the first time. The live-data spine eliminates skeleton thrash and recovers gracefully from connection loss; centralized theme tokens give dark/light consistency with zero runtime overhead and no new dependency. The dashboard is now a credible **observability** plane the pivot can build on, and the AppShell IA cleanly separates "Observe / Manage / Converse" so the Tomorrow reframe (chat → Desktop) is a relocation, not a rewrite.

**(−) Status of the Sprint-221 known-defects (most RESOLVED since; verified 2026-07-01)**:
- **chat-HOLLOW — RESOLVED (since):** `resolveChatReply` (chat-handler.ts) now routes a natural-language message to `adapter.send()` with an honest i18n error on failure — no silent classifier fallback — and an EventSource token fallback was added (server.ts:1292). The classifier-only POST + auth-gate defects are fixed. Remaining: full end-to-end chat-working still needs a live-run verify (wiring ≠ working, ADR-G-009).
- **duplicate-sidebar — RESOLVED (since):** nav collapsed to a single source (`nav-items.ts` `navGroups` → `navItems` flatMap) consumed by `Layout.tsx`; the stale `Sidebar.tsx` duplicate is gone, Workers/Directives are reachable.
- **alert-spam ×59 — RESOLVED (since):** `DashboardPage` dedups alerts by key with a running count (`dedupMap`, :274) — the ×59 repeat collapses to one entry.
- **enterprise read-only — SUPERSEDED:** EnterprisePage now has tenant/RBAC/rate CRUD (POST+DELETE); the real gap moved to backend enforcement-authoritativeness + V2 management-plane (ADR-G-031 gap #1), not missing write UI.
- **emoji-drift — OPEN:** 2 raw ⚠ glyphs remain against the no-emoji/lucide-react rule (`WorkerGrid.tsx:26` reconnecting text + `DirectivesEditor.tsx:97` disabled hint) → born DASH-EMOJI-FIX.
- **Structural tradeoffs:** detached sprint-start means the serve process holds no direct reference to the running sprint — status is read via `/api/status` / `.dashboard` (no change from prior behavior); non-SSE pages fall back to fixed-interval polling; `DirectivesEditor` is a plain textarea (no syntax highlighting); the REPL status-line has no dashboard-bar parity yet.

---

## References / Absorbed

- **Absorbs:**
  - **ADR-080** (Dashboard God-Level) — sprint-start detach (`sprint-job-runner.ts`), hollow-page wire (`App.tsx` + `Sidebar.tsx`), chat real round-trip, `DirectivesEditor`, god-level UI foundation (`use-live-data.ts` · `theme.ts` · `Layout.tsx`).
  - **ADR-078 Part D** (Dashboard God-Level) — `AppShell.tsx`, `terminal-sessions.ts`, `EnterprisePage` / `MemoryExplorerPage` / `NervousPage` / `EvolutionPage`, and `src/api/evolution-endpoint.ts`.
  - **ADR-082 Parts B/C** (Dashboard-v2 Canlı) — `WorkerGrid` SSE real-time, `StatusPage`/`RefreshButton`, `coverage-endpoint.ts`, `DebtPage` filters, `EnterprisePage` auth-wire + alert dedup.
  - **ADR-083 Dalga D** (Dashboard claude-code-UX) — `ChatPage` streaming + slash, conversation-centric `Layout` (Observe/Manage/Converse IA).
- **Cross-refs:**
  - **ADR-G-034** (Native Agentic Terminal) — the **primary** management+usage surface; the dashboard is observability-only beside it.
  - **DESK-1** (Desktop app, Electron) — destination for interactive chat (MASTER-PLAN).
  - **ADR-G-022** (Nervous System) — NervousPage consumes pending-approval / accept-reject / detector status.
  - **ADR-G-031** (Enterprise Foundation) — EnterprisePage tenant/RBAC/audit; V1 read-first → V2 management-plane CRUD.
  - **ADR-G-032** (Self-Learning & Evolution Loop) — EvolutionPage + evolution-endpoint are its observability window.
  - **ADR-G-025** (Process Resilience & Live Observability) — WorkerGrid is the dashboard endpoint of WORKER-LIVE-TRACE.
  - **ADR-G-035** (Memory Architecture) — MemoryExplorerPage FTS5 search / ADR timeline / debt table.
  - **ADR-G-029** (Embedded Web Terminal) — the `/terminal` page's PTY/session backend.
  - **ADR-G-009** (Evaluation Integrity / Proof-of-Function) — the dashboard is Tier-1 user-surface; the freeze and hollow-page defects were `wired ≠ working` failures caught by real-binary smoke.
  - **ADR-G-016** (Product Vision) / **ADR-G-010** (Output, Terminal-UX & Brand) — god-level / no-MVP bar; no-emoji + lucide-react + shared theme tokens.
- **Born work-items:** **DASH** (serve-token-inject · routing chart · control-panel surfacing · onboarding view — from old 072/073/076 side-items) · **DASH-EMOJI-FIX** (2 residual ⚠ → lucide-react) · **DESK-1** (Desktop app) — all to MASTER-PLAN. (The old Chat/Dashboard product-sprint items — chat-HOLLOW · duplicate-sidebar · alert-spam · enterprise read→write — are largely resolved; see Consequences.)
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 080/078/082/083), `.analysis/hermes-vs-deckent-direction-decisions.md`, memory `project_hermes_deckent_direction_2026_06` · `feedback_dashboard_no_emoji_lucide` · `feedback_governance_aligns_with_direction_pivot`.
