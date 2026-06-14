# Dashboard Guide

The deckent dashboard is a web UI served alongside the API. It provides real-time sprint
visibility, a DIRECTIVES editor for starting sprints, native chat, and an embedded terminal.

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

## The 16 Pages

### 1. Dashboard (`/`)

The sprint control panel. Shows:

- **Sprint phase timeline** — PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
- **Worker grid** — each active worker card with task title, status, and a kill button
- **Progress bar** — done / active / queued tasks
- **Alerts** — auditor warnings and critical flags
- **New Sprint button** — opens the sprint creation modal

Use this page to monitor a running sprint and to start new ones.

### 2. Chat (`/chat`)

Send messages to deckent and get real-time responses. The chat backend connects to the
`/api/chat` endpoint. Supports multi-turn conversation. Live nervous system notifications
appear in the sidebar panel on this page.

Send a message with Enter. Shift+Enter inserts a newline.

### 3. Config (`/config`)

Read and edit `.deckent/config.json` from the browser. Shows all configuration keys with
their current values. Changes are saved via the API — no need to edit the file manually.

### 4. Debt (`/debt`)

Technical debt tracker. Lists open debt items recorded by workers (GO_WITH_TECH_DEBT
self-assessments). Each entry shows the debt description, originating sprint, and whether
it has been resolved.

### 5. Directives (`/directives`)

View and edit `DIRECTIVES.md` from the browser. Use this page to draft your next sprint's
goals before invoking `deckent plan`. The editor saves changes via the API.

### 6. Enterprise (`/enterprise`)

Enterprise features: multi-tenant isolation, RBAC role assignments, audit log query,
and scheduled flow management. Connect to the enterprise API endpoints configured in
`.deckent/config.json`.

### 7. Evolution (`/evolution`)

Agent and skill evolution pipeline. Shows the promotion pipeline: temp agents/skills earn
promotion to permanent status based on outcome data. Displays agent performance metrics,
success rates, and activation rule recommendations.

### 8. History (`/history`)

Sprint history log. Lists past sprints with their outcome (DONE, NO_GO, GO_WITH_TECH_DEBT),
task counts, duration, and timestamps. Click any sprint row to expand details.

### 9. Memory (`/memory`)

Displays the brain memory snapshot — ADR entries, sprint learnings, patterns, and debt.
Data is loaded from `/api/memory/search`. Use the search box to filter by keyword.

### 10. Memory Explorer (`/memory-explorer`)

Advanced memory search and inspection. Allows browsing memory entries by type (adr, memory,
pattern, retro, debt), filtering by tag, sprint range, and status. Supports full-text
search with Turkish normalization via the FTS5 backend.

### 11. Nervous (`/nervous`)

The Nervous System proactive meta-orchestrator view. Displays pending approval requests
from the detector-decision-proposer pipeline. Use Accept or Reject buttons to respond to
proposals. Shows current observer state and active detector configurations.

### 12. Settings (`/settings`)

Dashboard preferences: theme (light/dark), language (EN/TR), and display options. Settings
are persisted in browser local storage.

### 13. Status (`/status`)

Live sprint status view. Shows the current sprint ID, phase, task breakdown (PENDING /
EXECUTING / DONE / NO_GO), worker list, and resource usage metrics.

### 14. Workers (`/workers`)

Active and recent worker view. Lists each worker with its task, backend (docker/tmux/subprocess),
heartbeat status, and elapsed time. Provides per-worker kill controls.

### 15. Login (`/login`)

OIDC login page. Shown when `dashboard_oidc.enabled: true` in config and the user is not
authenticated. Redirects to the configured IdP for SSO login.

### 16. Callback (`/auth/callback`)

OIDC callback handler. Receives the authorization code from the IdP after login and
exchanges it for an id_token via `POST /api/auth/oidc/exchange`.

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
within the session. Nervous system alerts are streamed alongside chat responses.

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
