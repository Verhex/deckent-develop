# Dashboard Guide

The deckent dashboard is a web UI served alongside the API. Per the 2026-06-29 scope-freeze
+ observability pivot (row 211, DASH-1), the dashboard's target role is an **observation
surface**: sprint state, worker activity, memory, debt, and approval history, all live and
read-only. Decisions and interactive control — approving or rejecting a proposed action,
running commands, driving a sprint — belong in the **terminal** (the embedded Terminal dock
described below, or a CLI/MCP session). Chat's long-term home is a planned standalone desktop
app (DESK-1, row 301 — not yet built); the dashboard's Chat page is scope-frozen, not growing
further.

## Scope & Direction (2026-06-29 pivot)

This reframe is a direction, not a finished migration — it's honest about where today's
dashboard still diverges from it:

- **Observation-only by design**: most pages (Dashboard, Status, History, Workers, Debt,
  Evolution, Missions, Memory, Memory Explorer, Config, Settings, Directives, Docs Health,
  Enterprise) are read-only monitors — they display state polled from the API and take no
  action beyond their own config-editing purpose.
- **New read-only pattern — `ApprovalsPanel`**: the runtime-wide `ApprovalBroker` queue
  (ADR-G-033) is surfaced through `src/dashboard/src/components/ApprovalsPanel.tsx`, a
  poll-only view over `GET /api/approvals` with no accept/deny control anywhere in the
  component — the deciding surface is the terminal or a connector (e.g. Telegram), never
  this panel. See [ApprovalsPanel](#approvalspanel-read-only) below.
- **Still migration-pending** (pre-dates the pivot, not yet realigned): the **Chat** page is
  a live two-way chat surface; the **Nervous** page has working Accept / Reject / Dismiss
  buttons that call `/api/nervous/accept`, `/api/nervous/reject`, `/api/nervous/dismiss`; the
  **Autonomous** page has working Approve / Reject buttons that call
  `/api/autonomous/:kind/:id`. These predate this reframe and are not yet decision-free —
  treat them as the known gap the pivot is closing, not as the target end-state.
- **Decisions and chat → terminal**: use the embedded [Terminal](#terminal) or a CLI/MCP
  session to approve/reject requests, start sprints, and hold conversations. The dashboard is
  where you *watch* that state change, not where you drive it.

## Starting the Dashboard

```bash
deckent serve --port 3000
```

Open `http://localhost:3000` in a browser. An API token is automatically minted and injected
into the dashboard on startup — no manual auth step required.

To run on a custom port:

```bash
deckent serve --port 8080
```

The serve process runs in the foreground. The dashboard stays responsive even when a sprint
is running because sprint execution is detached from the serve event loop.

## Panel Inventory (disk-verified)

The left nav is generated from one source of truth, `src/dashboard/src/nav-items.ts` —
enforced by `src/dashboard/src/__tests__/nav-single-source.test.tsx`, which fails if a route
in `App.tsx` has no matching nav entry. `nav-items.ts` groups every live nav route into three
sections that mirror the pivot line above: **Talk**, **Watch**, **Manage**. Two more pages sit
outside the nav entirely (the OIDC auth flow), and one route is reachable only by typing its
URL directly. 20 pages total.

### Talk — 1 page

#### 1. Chat (`/chat`)

Send messages to deckent and get real-time responses. The chat backend connects to the
`/api/chat` endpoint. Supports multi-turn conversation. Live nervous system notifications
appear in the sidebar panel on this page.

Send a message with Enter. Shift+Enter inserts a newline.

**Pivot status**: scope-frozen. This page is not gaining new features going forward — the
target home for interactive conversation is the planned desktop app (DESK-1), not the web
dashboard. Until DESK-1 ships, use the [Terminal](#terminal) for anything beyond a quick
status question.

### Watch — 9 pages (the observation surface)

#### 2. Dashboard (`/`)

The sprint control panel. Shows:

- **Sprint phase timeline** — PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
- **Worker grid** — each active worker card with task title, status, and a kill button
- **Progress bar** — done / active / queued tasks
- **Alerts** — auditor warnings and critical flags
- **New Sprint button** — opens the sprint creation modal

Use this page to monitor a running sprint and to start new ones.

#### 3. Status (`/status`)

Live sprint status view. Shows the current sprint ID, phase, task breakdown (PENDING /
EXECUTING / DONE / NO_GO), worker list, and resource usage metrics.

#### 4. History (`/history`)

Sprint history log. Lists past sprints with their outcome (DONE, NO_GO, GO_WITH_TECH_DEBT),
task counts, duration, and timestamps. Click any sprint row to expand details.

#### 5. Workers (`/workers`)

Active and recent worker view. Lists each worker with its task, backend (docker/tmux/subprocess),
heartbeat status, and elapsed time. Provides per-worker kill controls.

#### 6. Debt (`/debt`)

Technical debt tracker. Lists open debt items recorded by workers (GO_WITH_TECH_DEBT
self-assessments). Each entry shows the debt description, originating sprint, and whether
it has been resolved.

#### 7. Evolution (`/evolution`)

Agent and skill evolution pipeline. Shows the promotion pipeline: temp agents/skills earn
promotion to permanent status based on outcome data. Displays agent performance metrics,
success rates, and activation rule recommendations.

#### 8. Nervous (`/nervous`)

The Nervous System proactive meta-orchestrator view. Displays pending approval requests
from the detector-decision-proposer pipeline. Shows current observer state and active
detector configurations.

**Pivot status**: migration-pending. This page still has working Accept / Reject / Dismiss
buttons that call `/api/nervous/accept`, `/api/nervous/reject`, `/api/nervous/dismiss` — a
pre-pivot decision surface that has not yet been realigned to observation-only.

##### ApprovalsPanel (read-only)

`src/dashboard/src/components/ApprovalsPanel.tsx` is a separate, newly-landed component that
implements the target end-state for this kind of view: a poll-only monitor
(`GET /api/approvals`, 5s cadence) over the runtime-wide `ApprovalBroker` queue (ADR-G-033),
grouped into pending / approved / denied sections with masked-args-only summaries (raw args
never reach the browser). There is deliberately no accept/deny/decide control anywhere in the
component — a decision on one of these requests is only ever made from the terminal or a
connector (e.g. Telegram). As of this writing the component and its backing endpoint are
built and tested but not yet mounted to a route in `App.tsx` / `nav-items.ts` — nav wiring is
a follow-up, not a claim made here.

#### 9. Autonomous (`/autonomous`)

Autonomous engine control surface. View the autonomous mission backlog and the engine's
start/stop state. Integrates with the nervous system to surface pending engine decisions.

**Pivot status**: migration-pending. This page still has working Approve / Reject buttons
that call `/api/autonomous/:kind/:id` — the same known gap as the Nervous page above.

#### 10. Missions (`/missions`)

Mission tracking for autonomous engine runs. Lists active and completed missions with their
outcomes, task counts, and durations. Provides a history view of all autonomous runs
initiated by the engine.

### Manage — 7 pages

#### 11. Memory (`/memory`)

Displays the brain memory snapshot — ADR entries, sprint learnings, patterns, and debt.
Data is loaded from `/api/memory/search`. Use the search box to filter by keyword.

#### 12. Memory Explorer (`/memory-explorer`)

Advanced memory search and inspection. Allows browsing memory entries by type (adr, memory,
pattern, retro, debt), filtering by tag, sprint range, and status. Supports full-text
search with Turkish normalization via the FTS5 backend.

#### 13. Config (`/config`)

Read and edit `.deckent/config.json` from the browser. Shows all configuration keys with
their current values. Changes are saved via the API — no need to edit the file manually.

#### 14. Settings (`/settings`)

Dashboard preferences: theme (light/dark), language (EN/TR), and display options. Settings
are persisted in browser local storage.

#### 15. Directives (`/directives`)

View and edit `DIRECTIVES.md` from the browser. Use this page to draft your next sprint's
goals before invoking `deckent plan`. The editor saves changes via the API.

#### 16. Docs Health (`/docs-health`)

Documentation health dashboard. Shows broken links, stale source references, and coverage
gaps detected by the docs-health scanner. Use this page to monitor documentation quality
across the project and track outstanding documentation debt.

#### 17. Enterprise (`/enterprise`)

Enterprise features: multi-tenant isolation, RBAC role assignments, audit log query,
and scheduled flow management. Connect to the enterprise API endpoints configured in
`.deckent/config.json`.

### Outside the nav

#### 18. Login (`/login`)

OIDC login page. Shown when `dashboard_oidc.enabled: true` in config and the user is not
authenticated. Redirects to the configured IdP for SSO login.

#### 19. Callback (`/auth/callback`)

OIDC callback handler. Receives the authorization code from the IdP after login and
exchanges it for an id_token via `POST /api/auth/oidc/exchange`.

#### 20. KPI (`/kpi`)

Sprint KPI scorecard. Displays cost, token usage, cache hit rate, retry rate, task
completion rate, and quality metrics for a sprint. Data is sourced from the
`deckent_kpi` MCP tool and the sprint retrospective record.

This route is registered in `App.tsx` but is not part of `nav-items.ts` today — its only
in-repo linker (`Sidebar.tsx` / `AppShell.tsx`) is not mounted by `App.tsx`, so the page is
reachable only by typing `/kpi` directly. A fuller dead-area inventory across the dashboard is
tracked separately (row 214, DASH-D3); this doc only flags what's directly relevant here.

## Starting a Sprint via the DIRECTIVES Editor

1. Navigate to the Dashboard page (`/`).
2. Click **New Sprint** — the sprint creation modal opens.
3. The modal contains the **DIRECTIVES editor** — a textarea pre-loaded with the current
   `DIRECTIVES.md` content.
4. Edit the directives to describe your sprint goals and tasks.
5. The **Start Sprint** button is disabled when the directives textarea is empty — fill it
   before proceeding.
6. Click **Start Sprint**. The sprint starts as a detached process; the dashboard does not
   freeze.
7. The sprint phase timeline on the Dashboard page updates in real time via SSE.

## Chat

The chat page (`/chat`) connects to the deckent chat backend:

```
POST /api/chat
Authorization: Bearer <token>
{ "message": "What is the current sprint status?" }
```

The assistant response appears in the chat thread. Conversation history is maintained
within the session. Nervous system alerts are streamed alongside chat responses. As noted
above, this endpoint and page are scope-frozen — new conversational capability is planned
for the desktop app (DESK-1), not this HTTP surface.

## Terminal

The dashboard includes an embedded **Terminal** (ADR-062) docked at the bottom of every
page. Per the pivot above, this is the dashboard's decision surface: approve or reject an
`ApprovalBroker` request, start a sprint, or hold a conversation from here rather than from
one of the migration-pending pages listed in the panel inventory. Click the terminal bar to
expand it, or use the maximize control to take over the viewport. It opens an interactive
PTY session in the project directory so you can run `deckent` commands and shell tooling
without leaving the browser.

- **WS gateway** — the terminal streams over a WebSocket gateway (`src/api/terminal/ws-gateway.ts`)
  authenticated with the same Bearer token as the rest of the dashboard.
- **Command guard** — input passes through a command guard (`src/api/terminal/command-guard.ts`)
  that blocks destructive patterns before they reach the PTY.
- **Audit trail** — every session is recorded to a tamper-evident audit chain
  (`src/api/terminal/audit-integrity.ts`) so terminal activity is attributable and reviewable.
- **Tabs** — multiple terminal tabs can run concurrently; each tab is an independent PTY session.

The Terminal dock is available on all pages, making it convenient to start a sprint,
check `deckent status`, or tail worker logs while watching the live UI update.

## Authentication

All API calls from the dashboard use a Bearer token injected at serve startup. If you
see `401 Unauthorized` responses:

1. Restart `deckent serve` — a new token is minted.
2. Hard-refresh the browser to reload the injected token.

For OIDC-based authentication (enterprise), configure `dashboard_oidc` in
`.deckent/config.json`. The login flow uses PKCE with RS256 token verification.

## Troubleshooting

**Sprint start freezes the dashboard** — upgrade to deckent v1.0.0-beta.1+. Earlier
versions ran the sprint in the serve process. Current versions use a detached child process.

**Evolution / Nervous / Enterprise / Workers / Directives / Memory Explorer page shows content
from another page** — rebuild the dashboard bundle: `npm run build:all`. The production
bundle is in `src/dashboard/dist/`.

**Chat returns only status info** — the chat backend at `/api/chat` must be wired. Check
`deckent doctor` for backend health.

**Dashboard shows "Unauthorized" after restart** — the Bearer token is re-minted on each
`deckent serve` invocation. Hard-refresh the browser (Ctrl+Shift+R) after restarting serve.
