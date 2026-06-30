# API Endpoint Inventory

> **Scope:** Deckent dashboard HTTP API (`src/api/server.ts`) + embedded terminal endpoints (`src/api/terminal/*`).
> **Auth model:** Bearer token required for **all** `/api/*` endpoints (GET and POST alike) except explicitly exempt paths. Token is sourced from `DECKENT_API_TOKEN` env, `config.api_auth_token`, or auto-minted on loopback (see `src/api/auth.ts` and `server.ts:454`). Health endpoints (`/health`, `/api/health`) and the OIDC exchange endpoint (`/api/auth/oidc/exchange`) are exempt. SSE endpoints accept a `?token=` query parameter because `EventSource` cannot send `Authorization` headers. Set `DECKENT_API_AUTH_DISABLED=1` to disable auth entirely (server still prints a warning; terminal auth still enforces).
> **Versioning:** `/api/v1/<path>` is rewritten to `/api/<path>` (single-version backward-compat alias, `server.ts:415-417`).
> **CORS:** Localhost only — origin must match `http://(localhost|127\.0\.0\.1):\d+`; wildcard `*` is never allowed.
> **Rate limit:** `SlidingWindowRateLimiter` per IP, default 100 req/min, configurable via `HttpServerOptions.rateLimit` (set to 0 to disable). Loopback callers are exempt by default (`exemptLoopback: true`). Only `/api/*` paths are subject to limiting.
> **Source last verified:** Sprint 346 (2026-06-28) — vs `src/api/server.ts`.

---

## 1. Health & Discovery

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/health` | **exempt** | Liveness probe — returns `{status, timestamp}` | indirectly (ops/CI) |
| GET | `/api/health` | **exempt** | Liveness probe alias under the `/api/` namespace | indirectly |

Implementation: `src/api/server.ts:459`. Both paths are listed in `bearerAuthMiddleware` `exemptPaths` and bypass the rate limiter when accessed at `/health` (only `/api/*` routes are rate-limited).

---

## 2. Sprint & Status Read-Side

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/status` | required | Live dashboard JSON (sprint, agents, progress, alerts). Returns `200` with `{idle: true, sprint: {phase: 'IDLE'}, lastSprint: {...}}` when no active sprint — **never returns 404** | `DashboardPage.tsx:111`, `StatusPage.tsx:21` |
| GET | `/api/sprint` | required | Latest sprint markdown log parsed as JSON (`id, metrics, tasks`); 404 when no sprint logs | dashboard component reads via `/api/status` fallback; direct callers in CLI tooling |
| GET | `/api/history` | required | Array of all parsed sprint logs (newest last) | `HistoryPage.tsx:52` |
| GET | `/api/tasks` | required | Array of `.tasks/task-*.json` payloads (empty array when directory missing) | `StatusPage.tsx:36` |
| GET | `/api/workers` | required | Array of active workers from `.tasks/*.hb` heartbeat files, joined with task metadata (`workerId, taskId, status, sequence, timestamp, taskTitle, taskStatus`) | `WorkerList` dashboard component |
| GET | `/api/memory` | required | `{content}` from `.brain/exports/memory.md` (auto-generated DB export, not `.brain/MEMORY.md`) | `MemoryPage.tsx:13` |
| GET | `/api/debt` | required | `{content}` from `.brain/exports/debt.md` (auto-generated DB export) | `MemoryPage.tsx:14` |
| GET | `/api/job/:jobId` | required | Async job status for `/api/start`-spawned sprints — `{id, status, result?, error?}`; 404 when not found | polling clients |
| GET | `/api/worker/:taskId/log` | required | `{taskId, log, task}` worker output capture (404 if task JSON missing) | `AgentDetail.tsx:62` |

Implementation: `src/api/server.ts:493`–`665`.

---

## 3. Configuration & Diagnostics

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/config` | required | Active project config (`.deckent/config.json`); 404 when missing | `ConfigPage.tsx:228`, `LanguageProvider.tsx:27` |
| GET | `/api/config/defaults` | required | Default config snapshot from `createDefaultConfig()` | `ConfigPage.tsx:229` |
| GET | `/api/doctor` | required | Result of `runDoctorChecks()` (Node/git/auth/deps probes) | `ConfigPage.tsx:244` |
| POST | `/api/config` | required | **Deep-merges** JSON body into existing config via `deepMerge()`, validates via `validatePartialConfig()`, writes file; returns merged config or `422` with `details[]` on validation error | `ConfigPage.tsx:275`, `LanguageProvider.tsx:38` |

Implementation: `src/api/server.ts:541`–`557`, `1058`–`1086`.

---

## 4. Sprint Control (Mutating)

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| POST | `/api/start` | required | Starts a sprint in the background; returns `202` with `{jobId, status: 'started'}`. Returns `409` if a running job already exists. Validated body: `{autoApprove?: boolean}` | `NewSprintModal.tsx:75` |
| POST | `/api/plan` | required | Plans a sprint synchronously, returning the plan envelope. Body: `{directive?, mode?: 'ai'\|'structured'\|'auto'}` | `NewSprintModal.tsx:62` |
| GET | `/api/directives` | required | Returns `{content}` of `DIRECTIVES.md` (symmetric read of the POST endpoint) | `NewSprintModal.tsx:55` |
| POST | `/api/directives` | required | Alias for `POST /api/set-directives`; writes `DIRECTIVES.md`; returns `{success, taskCount}`. Body: `{content: string (>=1 char)}` | `NewSprintModal.tsx:58` |
| POST | `/api/set-directives` | required | Canonical path for writing `DIRECTIVES.md`; returns `{success, taskCount}`. Body: `{content: string}` | same as above |
| POST | `/api/cleanup` | required | Archives task files and locks; returns `409` if any task is `EXECUTING`/`CLAIMED` | `DashboardPage.tsx:132` |
| POST | `/api/kill/:workerId` | required | Kills a named worker via `killWorker()`. `workerId` must match `^[a-zA-Z0-9-]+$`; returns `{success: true}` | `DashboardPage.tsx:149` |
| POST | `/api/kill/all` | required | Kills all active workers; returns `{success: true, killed: string[]}` | `DashboardPage.tsx:165` |
| POST | `/api/chat` | required | Dashboard chat reply (`{message}` → `{reply}`); recognises `status`/`help` commands | `ChatPage.tsx:273` |

Implementation: `src/api/server.ts:877`–`1001`.

---

## 5. Streaming (SSE)

SSE endpoints accept a `?token=<token>` query parameter in addition to the `Authorization: Bearer` header because `EventSource` (browser API) cannot set custom headers. The token is validated with the same constant-time compare as the Bearer path.

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/events` | required (`?token=` ok) | Server-Sent Events stream of dashboard JSON snapshots. Sends `retry: 3000` on connect, then `data: <json>\n\n` on each `.dashboard` change. Also pushes typed frames (`event: hb`, `event: result`) via the live-event bridge (DASH-RT-1, Sprint 284) | `useSSE.ts:11`, `Layout.tsx:125` |
| GET | `/api/chat/stream` | required (`?token=` ok) | Chat SSE stream. User message supplied via `?message=` query param (GET with query string — `EventSource` cannot POST). Pushes `{type, message}` JSON frames. Returns `data: {"type":"error"}` when no chat adapter is configured | `ChatPage.tsx` |
| GET | `/api/output-stream` | required | Worker output fan-out SSE (Sprint 230). Provides live log streaming for the dashboard. Returns `503` when the output collector is unavailable | `OutputPanel` dashboard component |
| GET | `/api/workers/:taskId/logs/stream` | required (`?token=` via `/api/workers/` prefix) | Live tail of `.tasks/task-<id>.log` for a specific worker (DASH-RT-2, Sprint 284). `taskId` validated against `^[A-Za-z0-9_-]+$`; returns `403` on path traversal attempt | `AgentDetail` log pane |

Implementation: `src/api/server.ts:668`–`765`.

---

## 6. Agent & Routing

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/agents` | required | Lists enabled agents from agent pool — `{id, name, source, enabled, totalUses, successRate}[]` | `AgentsPage` |
| GET | `/api/routing/distribution` | required | Agent and skill routing distribution from `learnings.json` — `{agents, skills, warnings, totalOutcomes}` | `RoutingPage` |

Implementation: `src/api/server.ts:605`–`633`.

---

## 7. Evolution Endpoints

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/evolution/genealogy` | required | Agent genealogy graph |
| GET | `/api/evolution/retirement` | required | Retired agent records |
| GET | `/api/evolution/prompt-metrics` | required | Prompt evolution metrics |

Implementation: `src/api/evolution-endpoint.ts`.

---

## 8. Memory & Search

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/memory/search` | required | FTS5 full-text search over `.brain/memory.db`. Query via `?q=<term>` | `MemoryPage.tsx` |

Implementation: `src/api/memory-search-endpoint.ts`.

---

## 9. Nervous System

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/nervous/pending` | required | Pending nervous-system recommendations |
| GET | `/api/nervous/status` | required | Nervous system status |
| GET | `/api/nervous/recommendations` | required | All recommendations |
| POST | `/api/nervous/recommendations/dismiss/:id` | required | Dismiss a recommendation |
| POST | `/api/nervous/accept/:taskId` | required | Accept a nervous-system task proposal |
| POST | `/api/nervous/reject/:taskId` | required | Reject a nervous-system task proposal |

Implementation: `src/api/nervous-endpoint.ts`.

---

## 10. Autonomous Engine

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/autonomous/pending` | required | Pending autonomous backlog entries |
| GET | `/api/autonomous/backlog` | required | Full autonomous backlog |
| GET | `/api/autonomous/status` | required | Autonomous engine status |
| GET | `/api/autonomous/lineage/:id` | required | Lineage for an autonomous task |
| POST | `/api/autonomous/approve/:id` | required | Approve a parked autonomous entry |
| POST | `/api/autonomous/reject/:id` | required | Reject a parked autonomous entry |

Implementation: `src/api/autonomous-endpoint.ts`.

---

## 11. Missions

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/missions` | required | List all missions |
| GET | `/api/missions/:id` | required | Get a specific mission |
| POST | `/api/missions` | required | Create a mission |
| POST | `/api/missions/:id` | required | Update a mission |

Implementation: `src/api/missions-route.ts`.

---

## 12. Process

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/process/status/:id` | required | Status of a process job |
| GET | `/api/process/result/:id` | required | Result of a completed process job |
| POST | `/api/process/submit` | required | Submit a new process job |

Implementation: `src/api/process-endpoint.ts`.

---

## 13. Reactive

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| POST | `/api/reactive/webhook` | required | Reactive trigger webhook |

Implementation: `src/api/reactive-endpoint.ts`.

---

## 14. Enterprise

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/enterprise/tenants` | required | List tenants |
| POST/PUT/DELETE | `/api/enterprise/tenants[/:id]` | required | Create/update/delete a tenant |
| GET | `/api/enterprise/rbac` | required | RBAC policy |
| POST/PUT/DELETE | `/api/enterprise/rbac[/:id]` | required | Mutate RBAC |
| GET | `/api/enterprise/audit` | required | Audit log |
| GET | `/api/enterprise/rate` | required | Rate-limiter snapshot (`SlidingWindowRateLimiter.snapshot()`) — one row per active IP |

Implementation: `src/api/enterprise-endpoint.ts`.

---

## 15. Coverage & KPI

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/coverage` | required | Coverage history and brain budget |
| GET | `/api/kpi` | required | Sprint KPI scorecard (`?sprint=&tenantId=`) |
| GET | `/api/kpi/trend` | required | KPI trend over time (`?kpiId=&n=&tenantId=`) |

Implementation: `src/api/coverage-endpoint.ts`, `src/api/kpi-endpoint.ts`, `src/api/kpi-trend-endpoint.ts`.

---

## 16. Auth & Identity

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/auth/me` | required | Authenticated caller's identity and role claims (`{authenticated, mode, sub?, email?, name?, role?}`) |
| POST | `/api/auth/oidc/exchange` | **exempt** | OIDC SSO token exchange (login flow — no bearer yet). Config-gated: `404` when `dashboard_oidc.enabled: false`. See `api-surface.md` for full schema |

Implementation: `src/api/auth-me-endpoint.ts`, `src/api/oidc-callback-endpoint.ts`.

---

## 17. Docs Health

| METHOD | PATH | AUTH | DESCRIPTION |
|--------|------|------|-------------|
| GET | `/api/docs/health` | required | Doc-tracking health — `{rows: DocStatusRow[], heatmap: {bucket,state,count}[], generatedAt}` (ADR-090) |

Implementation: `src/api/docs-health-endpoint.ts`.

---

## 18. Webhooks (Inbound)

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| POST | `/api/webhooks/:connector/:key` | webhook key | Inbound message webhook (Discord/Telegram/WhatsApp). Validates connector id via `isValidConnectorId()` and key against `.deck` secrets (`DECKENT_WEBHOOK_KEY` or `DECKENT_WEBHOOK_KEY_<CONNECTOR>`). Body shape is connector-specific (see `parseWebhookPayload`). Returns `{ok: true}` | server-to-server only |

Implementation: `src/api/server.ts:1089`–`1133`. Returns `400` (missing connector/key/invalid payload), `401` (invalid webhook key).

---

## 19. Embedded Terminal (Sprint 175, ADR-062)

> **Auth note:** These endpoints **always** require a separate `Bearer` token minted at server start (`terminalToken` in `createHttpServer`). They DELIBERATELY ignore `DECKENT_API_AUTH_DISABLED` (constant-time SHA-256 compare via `LocalTokenAuthProvider`). Available only when `terminalBackend` is supplied to `createHttpServer` and `config.terminal.enabled !== false`.

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| POST | `/api/terminal/sessions` | terminal token | Creates a PTY session — body `{kind?: SessionKind, tool?, args?: string[]}`. Returns `201` with the session record or `409` on quota/limit | `terminal-api.ts:40` |
| GET | `/api/terminal/sessions` | terminal token | Lists active PTY sessions | `terminal-api.ts:50` |
| DELETE | `/api/terminal/sessions/:id` | terminal token | Kills a session; returns `{ok: true}` | `terminal-api.ts:55` |
| GET (Upgrade) | `/api/terminal/ws` | terminal token | WebSocket upgrade for live PTY bridge. Token is read from `Sec-WebSocket-Protocol` (browsers cannot set `Authorization` on WS). Closes with code `4401` on unauthorised, `4429` on outbound quota | `useTerminalSocket.ts:27` |

Implementation: `src/api/server.ts:1527`–`1605` (REST routes), `src/api/terminal/ws-gateway.ts` (WS upgrade).

---

## 20. Static & SPA Fallback

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/` and any non-`/api/*` path | none | Serves dashboard build (`staticDir` option) with strict path traversal guard; falls back to `index.html` for SPA routes. When `index.html` is missing, serves a "Dashboard not built" help page (200, not 404) | served to the React app shell |

Implementation: `src/api/server.ts:768`–`812`. On loopback with a token active, the served `index.html` has `window.__DECKENT_API_TOKEN__` and `window.__DECKENT_TERMINAL_TOKEN__` injected before `</head>`.

---

## 21. Status Code Reference

| Code | Scenario |
|------|----------|
| 200 | Normal success (GET and POST alike) |
| 201 | Terminal session create (`POST /api/terminal/sessions`) |
| 202 | `/api/start` accepted, sprint runs in background |
| 400 | Invalid JSON body, missing path param (`workerId`, `connector`, `key`), Zod validation failure on `/api/plan`, `/api/start`, `/api/set-directives`, invalid `workerId` regex |
| 401 | Missing bearer token, invalid webhook key |
| 403 | Wrong bearer token (auth middleware), CORS preflight from disallowed origin, static path traversal attempt, worker-log stream invalid task id |
| 404 | Resource not found (job, task, sprint log, memory/debt export, config, generic GET) |
| 405 | Unknown HTTP method (anything other than GET/POST/OPTIONS/DELETE) |
| 409 | `/api/start` while a sprint is running, `/api/cleanup` with active tasks, terminal session create rejected (quota) |
| 413 | Body exceeds `MAX_BODY_SIZE` (1 MB) |
| 422 | `/api/config` validation failure with `details[]` |
| 429 | Rate limit exceeded (`/api/*` only, remote IPs) |
| 500 | Handler exception (`Cleanup failed`, `Plan failed`, `Kill failed`, generic) |
| 503 | `/api/output-stream` when the output collector is unavailable |

---

## 22. Auth Middleware Behaviour (`src/api/auth.ts`)

- **All `/api/*` routes require auth** (GET and POST alike) — applied at `server.ts:454` before any route handler.
- Exempt paths (bearer gate bypassed): `/health`, `/api/health`, `/api/auth/oidc/exchange`.
- SSE query-token paths (accept `?token=` in addition to `Authorization: Bearer`): `/api/events`, `/api/chat/stream`.
- SSE query-token prefix (dynamic segment): `/api/workers/` (covers `/api/workers/:taskId/logs/stream`).
- Resolution priority: explicit `configToken` > `DECKENT_API_TOKEN` env var > `config.api_auth_token` > loopback auto-mint.
- Loopback auto-mint: when no token is configured and the server binds to `127.0.0.1`/`::1`, a random token is minted and injected into `index.html`. This is a convenience for localhost development only — not an absence of auth.
- When `DECKENT_API_AUTH_DISABLED === '1'`: middleware bypasses (stderr warning printed). Terminal auth does NOT honour this bypass.
- Bearer extraction expects `Authorization: Bearer <token>`. Missing scheme/value → 401, mismatch → 403 (constant-time SHA-256 compare via `timingSafeEqual`).

## 23. Rate Limiting (`src/api/server.ts:85-135`)

- The `SlidingWindowRateLimiter` class in `server.ts` (used by `createHttpServer`) implements a **sliding window** per-IP counter (`maxRequests` per `windowMs`). Unlike a fixed-window counter, the sliding window prevents burst replay at window boundaries.
- Default: 100 req/min per remote IP. Loopback callers are exempt by default (`exemptLoopback: true`) — the owner's dashboard legitimately exceeds this budget via per-page fetch fan-out and SSE reconnects.
- Configurable via `HttpServerOptions.rateLimit` (0 disables) and `rateLimitExemptLoopback`.
- Only paths starting with `/api/` are subject to limiting; static asset requests are exempt.
- The richer `src/api/rate-limiter.ts` exposes `{allowed, remaining, retryAfter}` with a background cleanup timer — available but not yet wired into `createHttpServer`.
- `SlidingWindowRateLimiter.snapshot()` feeds `GET /api/enterprise/rate` for live monitoring.

---

*Last updated 2026-06-28 — Sprint 346, Task 346-009 (verified vs `src/api/server.ts`, `src/api/auth.ts`, `src/api/terminal/*`).*
