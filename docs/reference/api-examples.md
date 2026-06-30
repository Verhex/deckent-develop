# Deckent HTTP API — Integration Examples

The Deckent HTTP API server runs on `http://127.0.0.1:3100` by default (localhost-only). Start it with:

```sh
deckent serve            # API-only, port 3100
deckent serve --port 4000
deckent web              # API + web dashboard
```

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [GET Endpoints — cURL Examples](#2-get-endpoints--curl-examples)
3. [POST Endpoints — cURL Examples](#3-post-endpoints--curl-examples)
4. [JavaScript / TypeScript Fetch Examples](#4-javascript--typescript-fetch-examples)
5. [SSE Subscription Example](#5-sse-subscription-example)
6. [Error Handling](#6-error-handling)
7. [Dashboard Polling vs SSE](#7-dashboard-polling-vs-sse)

---

## 1. Authentication

**All `/api/*` endpoints require a Bearer token** — both GET and POST. The bearer is verified before any route handler runs (`server.ts:454`). Configure the token in `.deckent/config.json`:

```json
{
  "api_auth_token": "your-secret-token-here"
}
```

Or via environment variable (takes precedence over config):

```sh
export DECKENT_API_TOKEN=your-secret-token-here
```

Generate a cryptographically random token:

```sh
node -e "require('node:crypto').randomBytes(32, (_, b) => console.log(b.toString('hex')))"
```

Include the token in all requests:

```sh
# GET request with token
curl http://localhost:3100/api/status \
  -H "Authorization: Bearer your-secret-token-here"

# POST request with token
curl -X POST http://localhost:3100/api/start \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Loopback auto-mint:** When no token is configured and the server binds to `127.0.0.1` (the default), a random token is minted at startup and injected into `index.html` as `window.__DECKENT_API_TOKEN__`. The dashboard reads this automatically — which is why the dashboard works without explicit token configuration on localhost. Remote callers and CLI tools always need an explicit token.

**SSE endpoints:** Because `EventSource` cannot set `Authorization` headers, SSE endpoints also accept `?token=<token>` as a query parameter:

```sh
# SSE subscription with token in query string (for EventSource clients)
curl -N "http://localhost:3100/api/events?token=your-secret-token-here"
```

**Response on missing token (401):**
```json
{
  "error": "Unauthorized"
}
```

---

## 2. GET Endpoints — cURL Examples

### `GET /api/status`

Returns the current `DashboardState` JSON — sprint phase, worker agents, progress counters, alerts, and usage metrics. Returns an idle response (not 404) when no sprint is active.

```sh
curl http://localhost:3100/api/status \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "sprint": {
    "id": "sprint-025",
    "number": 25,
    "phase": "EXECUTE",
    "status": "ACTIVE"
  },
  "agents": [
    {
      "id": "w-025-001",
      "role": "worker",
      "status": "CODING",
      "model": "sonnet",
      "tmuxWindow": "w-025-001",
      "taskId": "025-001",
      "currentAction": "Writing unit tests"
    }
  ],
  "progress": { "done": 3, "active": 5, "blocked": 0, "total": 8 },
  "alerts": [],
  "auditorLastScan": "2026-03-20T10:00:30.000Z",
  "violations": 0,
  "updatedAt": "2026-03-20T10:00:30.000Z"
}
```

---

### `GET /api/sprint`

Returns the latest sprint log with metrics and task list.

```sh
curl http://localhost:3100/api/sprint \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "id": "sprint-024",
  "metrics": {
    "tasks": "8",
    "completed": "8",
    "noGoRate": "0%",
    "coverage": "94%",
    "duration": "47m"
  },
  "tasks": [
    "025-001: Auth middleware refactor — DONE",
    "025-002: Add retry logic — DONE"
  ]
}
```

---

### `GET /api/history`

Returns an array of all sprint log summaries, oldest to newest.

```sh
curl http://localhost:3100/api/history \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
[
  { "sprint": "sprint-001", "tasks": "4", "completed": "4", "noGoRate": "0%", "coverage": "87%", "duration": "22m" },
  { "sprint": "sprint-002", "tasks": "6", "completed": "5", "noGoRate": "16%", "coverage": "91%", "duration": "38m" }
]
```

---

### `GET /api/config`

Returns the current project configuration from `.deckent/config.json`.

```sh
curl http://localhost:3100/api/config \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "mode": "performance",
  "language": "en",
  "projectName": "my-app",
  "modes": {
    "performance": {
      "max_workers": 8,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true
    }
  }
}
```

---

### `GET /api/doctor`

Runs all system health checks and returns results.

```sh
curl http://localhost:3100/api/doctor \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "ok": true,
  "checks": [
    { "name": "node", "passed": true, "message": "Node.js v24.x", "required": true },
    { "name": "git", "passed": true, "message": "git version 2.43.0", "required": true },
    { "name": "tmux", "passed": true, "message": "tmux 3.3a", "required": true },
    { "name": "claude", "passed": true, "message": "Claude CLI found", "required": true },
    { "name": "workspace", "passed": true, "message": ".deckent/ initialized", "required": false }
  ]
}
```

---

### `GET /api/memory`

Returns the contents of `.brain/exports/memory.md` (auto-generated from `memory.db` — not `.brain/MEMORY.md`) as a JSON-wrapped string.

```sh
curl http://localhost:3100/api/memory \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "content": "# Memory\n\n- structuredClone is available in Node 18+\n- Config validation collects all errors\n"
}
```

---

### `GET /api/debt`

Returns the contents of `.brain/exports/debt.md` (auto-generated from `memory.db`) as a JSON-wrapped string.

```sh
curl http://localhost:3100/api/debt \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "content": "| ID | Description | Priority | Sprint | Resolved |\n|---|---|---|---|---|\n| DEBT-001 | Missing edge-case tests | NORMAL | sprint-003 | false |\n"
}
```

---

### `GET /api/job/:jobId`

Polls the status of a background sprint job started via `POST /api/start`.

```sh
curl http://localhost:3100/api/job/job-1711000000000 \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Status: running**
```json
{
  "id": "job-1711000000000",
  "status": "running"
}
```

**Status: completed**
```json
{
  "id": "job-1711000000000",
  "status": "completed",
  "result": { "id": "sprint-025", "number": 25, "status": "COMPLETE" }
}
```

**Status: failed**
```json
{
  "id": "job-1711000000000",
  "status": "failed",
  "error": "Brain planning failed: DIRECTIVES.md not found"
}
```

---

### `GET /api/worker/:taskId/log`

Returns the task JSON and terminal log for a specific worker.

```sh
curl http://localhost:3100/api/worker/025-003/log \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"
```

**Example response:**
```json
{
  "taskId": "025-003",
  "task": {
    "id": "025-003",
    "title": "Add retry logic",
    "status": "EXECUTING",
    "model": "sonnet"
  },
  "log": "Starting task 025-003\nReading task file...\nWriting execution plan..."
}
```

---

### `GET /api/events` (SSE)

Opens a Server-Sent Events stream. The server pushes `DashboardState` JSON updates whenever `.dashboard` changes. Also pushes typed live-event frames (`event: hb`, `event: result`) from the live-event bridge (DASH-RT-1).

```sh
# cURL — use Authorization header
curl -N http://localhost:3100/api/events \
  -H "Authorization: Bearer $DECKENT_API_TOKEN"

# EventSource clients cannot set headers — use ?token= query param instead
curl -N "http://localhost:3100/api/events?token=$DECKENT_API_TOKEN"
```

**Stream output:**
```
data: {"sprint":{"id":"sprint-025","number":25,"phase":"EXECUTE","status":"ACTIVE"},...}

data: {"sprint":{"id":"sprint-025","number":25,"phase":"EVALUATE","status":"EVALUATING"},...}
```

See [Section 5](#5-sse-subscription-example) for JavaScript usage.

---

## 3. POST Endpoints — cURL Examples

All POST endpoints require `Content-Type: application/json` and the Bearer token when auth is configured.

### `POST /api/start`

Starts a full sprint in the background. Returns a `jobId` immediately (HTTP 202).

```sh
# Start sprint (workers require manual approval)
curl -X POST http://localhost:3100/api/start \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{}'

# Start sprint with auto-approved workers (--dangerously-skip-permissions)
curl -X POST http://localhost:3100/api/start \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"autoApprove": true}'
```

**Response (202 Accepted):**
```json
{
  "jobId": "job-1711000000000",
  "status": "started"
}
```

Poll `GET /api/job/:jobId` to track completion.

**Conflict (409) — sprint already running:**
```json
{
  "error": "Sprint already running"
}
```

---

### `POST /api/plan`

Generates a sprint plan synchronously from `DIRECTIVES.md`. Returns the planned `Sprint` object.

```sh
# Plan with default mode (from config)
curl -X POST http://localhost:3100/api/plan \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{}'

# Plan with AI planner
curl -X POST http://localhost:3100/api/plan \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"mode": "ai"}'

# Plan with structured parser
curl -X POST http://localhost:3100/api/plan \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"mode": "structured"}'
```

**Example response:**
```json
{
  "id": "sprint-025",
  "number": 25,
  "status": "PLANNING",
  "phase": "PLAN",
  "tasks": [
    {
      "id": "025-001",
      "title": "Refactor auth middleware",
      "model": "sonnet",
      "effort": "normal",
      "priority": "HIGH"
    }
  ],
  "workers": [],
  "startedAt": "2026-03-20T10:00:00.000Z"
}
```

---

### `POST /api/kill/:workerId`

Kills a running worker tmux window by worker ID.

```sh
curl -X POST http://localhost:3100/api/kill/w-025-003 \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Success response:**
```json
{
  "success": true
}
```

**Invalid workerId (400):**
```json
{
  "error": "Invalid workerId"
}
```

---

### `POST /api/set-directives`

Replaces the contents of `DIRECTIVES.md`. Returns the count of `## Task` blocks found.

```sh
curl -X POST http://localhost:3100/api/set-directives \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# DIRECTIVES — Sprint 26\n\n## Task 1: Update readme\n- Scope: docs/\n\n## Task 2: Fix lint errors\n- Scope: src/"
  }'
```

**Response:**
```json
{
  "success": true,
  "taskCount": 2
}
```

---

### `POST /api/config`

Merges the provided fields into `.deckent/config.json`. Existing fields not in the body are preserved.

```sh
# Change the active mode
curl -X POST http://localhost:3100/api/config \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"mode": "economic"}'

# Change language
curl -X POST http://localhost:3100/api/config \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"language": "tr"}'

# Multiple fields
curl -X POST http://localhost:3100/api/config \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"mode": "balanced", "language": "en"}'
```

**Response:** Full merged config object (same as `GET /api/config`).

---

## 4. JavaScript / TypeScript Fetch Examples

### Setup

```ts
const BASE_URL = 'http://localhost:3100';
const TOKEN = process.env.DECKENT_API_TOKEN ?? '';

// All /api/* endpoints require auth — both GET and POST
const headers = (extra: HeadersInit = {}): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  ...extra,
});

// For GET requests without a body
const authHeaders = (): HeadersInit => TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
```

---

### GET /api/status

```ts
interface DashboardProgress {
  done: number;
  active: number;
  blocked: number;
  total: number;
}

interface DashboardState {
  sprint: { id: string; number: number; phase: string; status: string };
  agents: { id: string; role: string; status: string; model: string; tmuxWindow: string }[];
  progress: DashboardProgress;
  alerts: { level: string; message: string; timestamp: string }[];
  updatedAt: string;
}

async function getStatus(): Promise<DashboardState> {
  const res = await fetch(`${BASE_URL}/api/status`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
  return res.json() as Promise<DashboardState>;
}

const state = await getStatus();
console.log(`Sprint ${state.sprint.id} — phase: ${state.sprint.phase}`);
console.log(`Progress: ${state.progress.done}/${state.progress.total} tasks done`);
```

---

### GET /api/history

```ts
interface SprintSummary {
  sprint: string;
  tasks: string;
  completed: string;
  noGoRate: string;
  coverage: string;
  duration: string;
}

async function getHistory(): Promise<SprintSummary[]> {
  const res = await fetch(`${BASE_URL}/api/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return res.json() as Promise<SprintSummary[]>;
}

const history = await getHistory();
history.forEach((s) => {
  console.log(`${s.sprint}: ${s.completed}/${s.tasks} tasks, coverage ${s.coverage}`);
});
```

---

### POST /api/start + job polling

```ts
async function startSprint(autoApprove = false): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/start`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ autoApprove }),
  });
  if (res.status === 409) throw new Error('Sprint already running');
  if (!res.ok) throw new Error(`Start failed: ${await res.text()}`);
  const data = await res.json() as { jobId: string; status: string };
  return data.jobId;
}

async function pollJob(jobId: string, intervalMs = 5000): Promise<unknown> {
  while (true) {
    const res = await fetch(`${BASE_URL}/api/job/${jobId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Job poll failed: ${res.status}`);
    const job = await res.json() as { id: string; status: string; result?: unknown; error?: string };

    if (job.status === 'completed') return job.result;
    if (job.status === 'failed') throw new Error(`Sprint failed: ${job.error}`);

    console.log(`Job ${jobId}: ${job.status}...`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Usage:
const jobId = await startSprint(true);
console.log(`Sprint started, jobId: ${jobId}`);
const result = await pollJob(jobId);
console.log('Sprint complete:', result);
```

---

### POST /api/plan

```ts
type PlanMode = 'ai' | 'structured' | 'auto';

async function planSprint(mode?: PlanMode): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/plan`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(mode ? { mode } : {}),
  });
  if (!res.ok) throw new Error(`Plan failed: ${await res.text()}`);
  return res.json();
}

const plan = await planSprint('structured');
console.log('Plan generated:', plan);
```

---

### POST /api/set-directives

```ts
async function setDirectives(content: string): Promise<{ success: boolean; taskCount: number }> {
  const res = await fetch(`${BASE_URL}/api/set-directives`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`set-directives failed: ${await res.text()}`);
  return res.json() as Promise<{ success: boolean; taskCount: number }>;
}

const directives = `# DIRECTIVES — Sprint 26

## Task 1: Improve error messages
- File: src/cli/helpers/messages.ts
- Scope: src/cli/

## Task 2: Add integration tests
- File: tests/integration/smoke.test.ts
- Scope: tests/integration/
`;

const { taskCount } = await setDirectives(directives);
console.log(`Directives set. ${taskCount} tasks found.`);
```

---

### POST /api/config

```ts
async function updateConfig(patch: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/config`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Config update failed: ${await res.text()}`);
  return res.json();
}

const merged = await updateConfig({ mode: 'economic', language: 'en' });
console.log('Config updated:', merged);
```

---

### GET /api/worker/:taskId/log

```ts
async function getWorkerLog(taskId: string): Promise<{ taskId: string; log: string | null; task: unknown }> {
  const res = await fetch(`${BASE_URL}/api/worker/${taskId}/log`);
  if (res.status === 404) throw new Error(`Task ${taskId} not found`);
  if (!res.ok) throw new Error(`Worker log failed: ${res.status}`);
  return res.json() as Promise<{ taskId: string; log: string | null; task: unknown }>;
}

const { log, task } = await getWorkerLog('025-003');
console.log('Task:', task);
console.log('Last log lines:', log?.split('\n').slice(-10).join('\n'));
```

---

### POST /api/kill/:workerId

```ts
async function killWorker(workerId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/kill/${workerId}`, {
    method: 'POST',
    headers: headers(),
    body: '{}',
  });
  if (!res.ok) throw new Error(`Kill failed: ${await res.text()}`);
}

await killWorker('w-025-003');
console.log('Worker killed');
```

---

## 5. SSE Subscription Example

`GET /api/events` streams `DashboardState` updates using the [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) protocol.

### Browser (EventSource)

`EventSource` cannot send `Authorization` headers, so pass the token as a `?token=` query parameter:

```html
<!DOCTYPE html>
<html>
<body>
  <pre id="out"></pre>
  <script>
    const out = document.getElementById('out');
    const token = window.__DECKENT_API_TOKEN__ ?? 'your-token-here';

    // Localhost: the dashboard auto-injects window.__DECKENT_API_TOKEN__
    // Remote: pass the token explicitly via ?token=
    const url = `http://localhost:3100/api/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      const state = JSON.parse(event.data);
      out.textContent = JSON.stringify(state, null, 2);
    };

    es.onerror = () => {
      console.warn('SSE connection lost, EventSource will reconnect automatically');
    };

    // Clean up when page unloads
    window.addEventListener('beforeunload', () => es.close());
  </script>
</body>
</html>
```

### Node.js (fetch + ReadableStream)

```ts
import { createParser, type ParsedEvent } from 'eventsource-parser';

const TOKEN = process.env['DECKENT_API_TOKEN'] ?? '';

async function subscribeToEvents(
  onUpdate: (state: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('http://localhost:3100/api/events', {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

  const parser = createParser((event: ParsedEvent) => {
    if (event.type === 'event' && event.data) {
      try {
        onUpdate(JSON.parse(event.data));
      } catch {
        // ignore malformed event
      }
    }
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

// Usage:
const controller = new AbortController();

subscribeToEvents((state) => {
  console.log('Dashboard update:', JSON.stringify(state, null, 2));
}, controller.signal).catch(console.error);

// Stop after 60 seconds
setTimeout(() => controller.abort(), 60_000);
```

### Node.js (native — no extra dependency)

```ts
import http from 'node:http';

const TOKEN = process.env['DECKENT_API_TOKEN'] ?? '';

function subscribeSSE(onData: (state: unknown) => void): () => void {
  const req = http.get('http://localhost:3100/api/events', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  }, (res) => {
    let buffer = '';

    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const json = line.slice(6).trim();
          if (json) {
            try { onData(JSON.parse(json)); } catch { /* skip */ }
          }
        }
      }
    });

    res.on('error', (err) => console.error('SSE error:', err));
  });

  req.on('error', (err) => console.error('SSE request error:', err));
  return () => req.destroy();
}

const stop = subscribeSSE((state) => {
  console.log('Update received:', state);
});

setTimeout(stop, 30_000); // disconnect after 30s
```

---

## 6. Error Handling

All API endpoints return JSON errors in the form `{ "error": "<message>" }`.

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `200` | OK — successful GET |
| `202` | Accepted — async job started (`POST /api/start`) |
| `400` | Bad Request — invalid body or missing required field |
| `401` | Unauthorized — missing or invalid Bearer token |
| `403` | Forbidden — path traversal attempt on static file |
| `404` | Not Found — resource does not exist |
| `405` | Method Not Allowed — unsupported HTTP method |
| `409` | Conflict — sprint already running |
| `500` | Internal Server Error — unexpected failure |

### Robust TypeScript wrapper

```ts
interface ApiError {
  error: string;
}

class DeckentApiError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(`HTTP ${status}: ${body.error}`);
    this.name = 'DeckentApiError';
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`http://localhost:3100${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...init,
  });

  if (!res.ok) {
    let body: ApiError;
    try {
      body = await res.json() as ApiError;
    } catch {
      body = { error: res.statusText };
    }
    throw new DeckentApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

// Usage:
try {
  const status = await apiFetch<DashboardState>('/api/status');
  console.log(status.sprint.phase);
} catch (err) {
  if (err instanceof DeckentApiError) {
    if (err.status === 404) {
      console.log('No active sprint yet');
    } else if (err.status === 401) {
      console.error('Check your API token');
    } else {
      console.error(`API error ${err.status}: ${err.body.error}`);
    }
  } else {
    throw err;
  }
}
```

---

## 7. Dashboard Polling vs SSE

The API supports two patterns for consuming live dashboard state.

### Polling — `GET /api/status`

Request the current state on a fixed interval.

```ts
function pollDashboard(
  onUpdate: (state: unknown) => void,
  intervalMs = 2000,
): () => void {
  const token = process.env['DECKENT_API_TOKEN'] ?? '';
  const id = setInterval(async () => {
    try {
      const res = await fetch('http://localhost:3100/api/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onUpdate(await res.json());
    } catch {
      // network error — retry on next tick
    }
  }, intervalMs);

  return () => clearInterval(id);
}

const stop = pollDashboard((state) => console.log('Poll:', state), 2000);
setTimeout(stop, 60_000);
```

### SSE — `GET /api/events`

Receive pushed updates only when the dashboard file changes (debounced 500 ms). Requires auth — use `?token=` for `EventSource` (cannot set headers):

```ts
const token = window.__DECKENT_API_TOKEN__ ?? process.env['DECKENT_API_TOKEN'] ?? '';
// Browser: use ?token= (EventSource cannot set Authorization headers)
const es = new EventSource(`http://localhost:3100/api/events?token=${encodeURIComponent(token)}`);
es.onmessage = (e) => console.log('Push:', JSON.parse(e.data));
```

### Comparison

| Aspect | Polling (`/api/status`) | SSE (`/api/events`) |
|--------|------------------------|---------------------|
| Connection | New request per interval | Single persistent connection |
| Latency | Up to `intervalMs` | ~500 ms (debounce) |
| Load | Every N ms regardless of changes | Only on change |
| Reconnect | Automatic (new request each time) | `EventSource` auto-reconnects |
| Auth | Bearer header (or `?token=` for EventSource) | Same |
| Works in Node.js | Yes (native fetch) | Yes (fetch + stream) |
| Works in browser | Yes | Yes (native `EventSource`) |
| Firewall/proxy friendly | Yes | Needs keep-alive support |

**Recommendation:**
- Use **SSE** for live dashboards and UIs — lower overhead, instant updates.
- Use **polling** for simple scripts, CI integration, or environments that don't support keep-alive connections.
- For one-shot reads (build scripts, health checks), use a single `GET /api/status` call.

### Hybrid approach — SSE with polling fallback

```ts
function connectDashboard(onUpdate: (state: unknown) => void): () => void {
  if (typeof EventSource !== 'undefined') {
    // Browser or environments with native EventSource
    const es = new EventSource('http://localhost:3100/api/events');
    es.onmessage = (e) => {
      try { onUpdate(JSON.parse(e.data)); } catch { /* skip */ }
    };
    return () => es.close();
  }

  // Fallback: polling every 2 seconds
  return pollDashboard(onUpdate, 2000);
}
```
