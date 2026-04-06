# Dashboard Guide — Status Monitoring & HTTP API

> Reference: [ARCHITECTURE.md](ARCHITECTURE.md) | [API.md](API.md) | [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)

---

## Overview

Deckent provides two dashboard interfaces:

1. **Terminal TUI** — `deckent status` / `deckent status --watch`
2. **Web Dashboard** — `deckent web` → React SPA at `localhost:3100`

Both read from the `.dashboard` file, which the Auditor overwrites every 30 seconds during a sprint.

---

## Terminal TUI Dashboard

### Commands

```bash
# One-time status snapshot
deckent status

# Watch mode — refreshes every 2 seconds
deckent status --watch

# Raw JSON output (pipe-friendly)
deckent status --json
```

### Display Sections

The terminal dashboard (`src/cli/commands/status.ts`) renders:

- **Sprint info**: ID, phase, status
- **Progress bar**: `done / active / blocked / total`
- **Agent table**: worker ID, model, status, current action, task ID
- **Alerts**: CRITICAL / WARNING / INFO with timestamps
- **Usage**: 5-hour % and weekly % consumption

Watch mode uses `setInterval(2000)` — clears the screen and re-renders on each tick.

### Exit Watch Mode

Press `Ctrl+C` to exit watch mode.

---

## Web Dashboard

### Setup & Launch

```bash
# Start the HTTP server + serve the React SPA
deckent web

# Custom port
deckent web --port 8080

# API only (no static files)
deckent web --api-only
```

Default URL: `http://localhost:3100`

The React frontend is built with Vite + Tailwind CSS. Source: `src/dashboard/`.

### Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Live agent status, progress, alerts |
| History | `/history` | Sprint history with metrics |
| Settings | `/settings` | Edit config and directives |
| Memory | `/memory` | View `.brain/MEMORY.md` content |

### Real-Time Updates (SSE)

The web dashboard connects to `GET /api/events` (Server-Sent Events). The server watches `.dashboard` for file changes and pushes new data to all connected clients:

```
client → GET /api/events
server → watches .dashboard file
auditor writes .dashboard → server sends `data: {...}\n\n` to all clients
```

The SSE watcher is initialized lazily on first client connection (`watchDashboard()` in `src/api/watcher.ts`).

---

## HTTP API Reference

Base URL: `http://localhost:3100`

All endpoints return `application/json`. POST endpoints accept `application/json` bodies.

### GET Endpoints

| Endpoint | Description | Returns |
|----------|-------------|---------|
| `GET /api/status` | Current dashboard state | `DashboardState` JSON |
| `GET /api/sprint` | Latest sprint log | Sprint metrics + task list |
| `GET /api/history` | All sprint logs | Array of sprint records |
| `GET /api/config` | Project config | `.deckent/config.json` contents |
| `GET /api/doctor` | Health checks | Array of `DoctorCheck` results |
| `GET /api/memory` | Brain memory | `{ content: string }` |
| `GET /api/debt` | Tech debt table | `{ content: string }` (markdown) |
| `GET /api/job/:jobId` | Background job status | `{ id, status, result?, error? }` |
| `GET /api/worker/:taskId/log` | Worker tmux log | `{ taskId, log, task }` |
| `GET /api/events` | SSE stream | `text/event-stream` (real-time dashboard updates) |

### POST Endpoints

| Endpoint | Body | Description |
|----------|------|-------------|
| `POST /api/start` | `{ autoApprove?: boolean }` | Start a sprint (background job) |
| `POST /api/plan` | `{ mode?: 'ai'\|'structured'\|'auto' }` | Plan sprint, return task list |
| `POST /api/kill/:workerId` | (none) | Kill a worker tmux window |
| `POST /api/set-directives` | `{ content: string }` | Overwrite `DIRECTIVES.md` |
| `POST /api/config` | `Record<string, unknown>` | Merge-update project config |

### CORS

All endpoints include `Access-Control-Allow-Origin: *`. OPTIONS preflight is handled.

---

## DashboardState Schema

The `.dashboard` file and `/api/status` response follow this structure:

```json
{
  "sprint": {
    "id": "sprint-019",
    "number": 19,
    "phase": "EXECUTE",
    "status": "RUNNING"
  },
  "agents": [
    {
      "id": "w-019-001",
      "role": "worker",
      "status": "EXECUTING",
      "model": "sonnet",
      "tmuxWindow": "w-019-001",
      "taskId": "019-001",
      "currentAction": "Writing tests",
      "spawnedAt": "2026-03-18T10:00:00.000Z"
    }
  ],
  "progress": {
    "done": 2,
    "active": 5,
    "blocked": 0,
    "total": 8
  },
  "alerts": [
    {
      "level": "WARNING",
      "message": "Stale lock: src/core/types.ts by w-019-002",
      "source": "w-019-002",
      "timestamp": "2026-03-18T10:01:00.000Z"
    }
  ],
  "updatedAt": "2026-03-18T10:02:00.000Z"
}
```

### Sprint Phases

| Phase | Description |
|-------|-------------|
| `DIRECTIVE` | Waiting for directives |
| `PLAN` | Brain is planning tasks |
| `SPAWN` | Spawning worker tmux windows |
| `EXECUTE` | Workers running, auditor scanning |
| `EVALUATE` | Brain grading results |
| `FIX` | Handling NO-GO tasks |
| `RETRO` | Writing retrospective |
| `DECAY` | Compressing memory |
| `TRANSITION` | Sprint complete, awaiting next |

### Alert Levels

| Level | Meaning |
|-------|---------|
| `CRITICAL` | Stale agent (>2 min heartbeat), deadlock |
| `WARNING` | Stale lock (>5 min), boundary violation |
| `INFO` | Informational events |

---

## Auditor — Data Source

The dashboard data is written by the Auditor (`src/monitor/auditor.ts`) every 30 seconds during a sprint. The scan cycle:

1. `scanHeartbeats()` — reads `.tasks/*.hb` files, detects stale agents (>2 min)
2. `checkBoundaryViolations()` — runs `git diff --stat`, flags out-of-scope changes
3. `checkStaleLocks()` — reads `.locks/*.lock`, detects locks held >5 min
4. `detectDeadlocks()` — Kahn's algorithm on task dependency graph
5. `detectPatterns()` — logs recurring violations to `PATTERNS.md`
6. `writeScanToDashboard()` — merges all results, overwrites `.dashboard`

The auditor runs **in-process** within `runSprint()` — not as a separate tmux window. It starts with `startScanLoop()` between SPAWN and EXECUTE phases, and stops with `clearInterval()` after EXECUTE.

---

## Background Jobs

`POST /api/start` returns immediately with a `jobId`. Poll for status:

```bash
# Start sprint
curl -X POST http://localhost:3100/api/start \
  -H 'Content-Type: application/json' \
  -d '{"autoApprove": true}'
# → { "jobId": "job-1710756000000", "status": "started" }

# Poll job status
curl http://localhost:3100/api/job/job-1710756000000
# → { "id": "job-...", "status": "running" | "completed" | "failed" }
```

Only one sprint job can run at a time. Starting a second returns HTTP 409.

---

## Programmatic Usage

```ts
import { createHttpServer } from 'deckent/api';

const api = createHttpServer('/path/to/project', 3100, '/path/to/dist');

// Close server
await api.close();
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `/api/status` returns 404 | No sprint running — no `.dashboard` file exists |
| Dashboard shows 0 progress | Sprint just started; auditor updates every 30s |
| SSE events not arriving | Check that `.dashboard` file is being written; verify `deckent web` is running |
| Port 3100 already in use | Use `--port <other>` flag |
| `deckent web` shows no UI | Run `npm run build` in `src/dashboard/` to build React assets |

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more.

---

*Source: `src/api/server.ts`, `src/monitor/auditor.ts`, `src/cli/commands/status.ts`, `src/dashboard/` | Blueprint Sections 6, 7, 12*
