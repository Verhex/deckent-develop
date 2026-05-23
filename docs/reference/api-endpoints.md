# API Endpoint Inventory

> **Scope:** Deckent dashboard HTTP API (`src/api/server.ts`) + embedded terminal endpoints (`src/api/terminal/*`).
> **Auth model:** Bearer token from `DECKENT_API_TOKEN` env or `config.api_auth_token` (see `src/api/auth.ts`). Health endpoints are exempt. Terminal endpoints mint a **separate** localhost token (independent of `DECKENT_API_AUTH_DISABLED`).
> **Versioning:** `/api/v1/<path>` is rewritten to `/api/<path>` (single-version backward-compat alias, `server.ts:285-287`).
> **CORS:** Localhost only — origin must match `http://(localhost|127.0.0.1):<port>`; wildcard `*` is never allowed.
> **Rate limit:** Token-bucket per IP, default 100 req/min, configurable via `HttpServerOptions.rateLimit` (set to 0 to disable; `server.ts:843`).
> **Source last verified:** Sprint 189 (2026-05-22).

---

## 1. Health & Discovery

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/health` | exempt | Liveness probe — returns `{status, timestamp}` | indirectly (no React fetch; used by ops/CI) |
| GET | `/api/health` | exempt | Liveness probe alias under the `/api/` namespace | indirectly |

Implementation: `src/api/server.ts:328`. Both paths are listed in `bearerAuthMiddleware` `exemptPaths` and bypass the rate limiter when accessed at `/health` (only `/api/*` routes are rate-limited).

---

## 2. Sprint & Status Read-Side

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/status` | required | Live dashboard JSON (sprint, agents, progress, alerts). Falls back to an IDLE snapshot + last sprint summary when no active sprint exists | `DashboardPage.tsx:111`, `StatusPage.tsx:21` |
| GET | `/api/sprint` | required | Latest sprint markdown log parsed as JSON (`id, metrics, tasks`); 404 when no sprint logs | dashboard component reads via `/api/status` fallback; direct callers in CLI tooling |
| GET | `/api/history` | required | Array of all parsed sprint logs (newest last) | `HistoryPage.tsx:52` (`useApi<SprintHistoryRecord[]>("/api/history")`) |
| GET | `/api/tasks` | required | Array of `.tasks/task-*.json` payloads (empty array when directory missing) | `StatusPage.tsx:36` |
| GET | `/api/memory` | required | `{content}` from `.brain/exports/memory.md` (auto-generated DB export) | `MemoryPage.tsx:13` |
| GET | `/api/debt` | required | `{content}` from `.brain/exports/debt.md` (auto-generated DB export) | `MemoryPage.tsx:14` |
| GET | `/api/job/:jobId` | required | Async job status for `/api/start`-spawned sprints — `{id, status, result?, error?}`; 404 when not found | not used by current dashboard; reserved for polling clients |
| GET | `/api/worker/:taskId/log` | required | `{taskId, log, task}` worker output capture (returns 404 if the task JSON is missing) | `AgentDetail.tsx:62` |

Implementation: `src/api/server.ts:335`–`447`.

---

## 3. Configuration & Diagnostics

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/config` | required | Active project config (`.deckent/config.json`); 404 when missing | `ConfigPage.tsx:228`, `LanguageProvider.tsx:27` |
| GET | `/api/config/defaults` | required | Default config snapshot from `createDefaultConfig()` | `ConfigPage.tsx:229` |
| GET | `/api/doctor` | required | Result of `runDoctorChecks()` (Node/git/auth/deps probes) | `ConfigPage.tsx:244` |
| POST | `/api/config` | required | Deep-merges JSON body into existing config, validates via `validatePartialConfig()`, writes file; returns merged config or `422` with `details[]` on validation error | `ConfigPage.tsx:275`, `LanguageProvider.tsx:38` |

Implementation: `src/api/server.ts:373`–`391`, `680`–`708`.

---

## 4. Sprint Control (Mutating)

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| POST | `/api/start` | required | Starts a sprint in the background; returns `202` with `{jobId, status}`. Returns `409` if a running job already exists. Validated body: `{autoApprove?: boolean}` | `NewSprintModal.tsx:75` |
| POST | `/api/plan` | required | Plans a sprint synchronously, returning the plan envelope. Body: `{directive?, mode?: 'ai'\|'structured'\|'auto'}` | `NewSprintModal.tsx:62` |
| POST | `/api/set-directives` | required | Writes `DIRECTIVES.md`; returns `{success, taskCount}`. Body: `{content: string (>=1 char)}` | `NewSprintModal.tsx:58` |
| POST | `/api/cleanup` | required | Archives task files and locks; returns `409` if any task is `EXECUTING`/`CLAIMED` | `DashboardPage.tsx:132` |
| POST | `/api/kill/:workerId` | required | Kills a worker via `killWorker()`. `workerId` must match `^[a-zA-Z0-9-]+$`; dashboard uses `all` to kill every worker. Returns `{success: true}` | `DashboardPage.tsx:149, 165` |
| POST | `/api/chat` | required | Dashboard chat reply (`{message}` → `{reply}`); recognises `status`/`help` commands via `buildChatReply()` | `ChatPage.tsx:273` |

Implementation: `src/api/server.ts:518`–`623`, `592`–`604`, `625`–`678`.

---

## 5. Streaming (SSE)

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/api/events` | required | Server-Sent Events stream of dashboard JSON updates. Initial `retry: 3000` directive, lazy file watcher on `.dashboard`. Each update is delivered as `data: <json>\n\n` | `useSSE.ts:11`, `Layout.tsx:125`, `DashboardPage.tsx:100`, `StatusPage.tsx:14`, `ChatPage.tsx:241` |

Implementation: `src/api/server.ts:449`–`461`. SSE clients are tracked in `Set<ServerResponse>` and torn down on client `close` or `api.close()`.

---

## 6. Webhooks (Inbound)

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| POST | `/api/webhooks/:connector/:key` | webhook key | Inbound message webhook (Discord/Telegram/WhatsApp). Validates connector id via `isValidConnectorId()` and key against `.deck` secrets (`DECKENT_WEBHOOK_KEY` or `DECKENT_WEBHOOK_KEY_<CONNECTOR>`). Body shape is connector-specific (see `parseWebhookPayload`). Returns `{ok: true}` | not used (server-to-server endpoint) |

Implementation: `src/api/server.ts:711`–`755`. Returns `400` (missing connector/key/invalid payload), `401` (invalid webhook key).

---

## 7. Embedded Terminal (Sprint 175, ADR-062)

> **Auth note:** These endpoints **always** require a separate `Bearer` token minted at server start (`terminalToken` in `createHttpServer`). They DELIBERATELY ignore `DECKENT_API_AUTH_DISABLED` (constant-time SHA-256 compare via `LocalTokenAuthProvider`). Available only when `terminalBackend` is supplied to `createHttpServer` and `config.terminal.enabled !== false`.

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| POST | `/api/terminal/sessions` | terminal token | Creates a PTY session — body `{kind?: SessionKind, tool?, args?: string[]}`. Returns `201` with the session record or `409` on quota/limit | `terminal-api.ts:40` |
| GET | `/api/terminal/sessions` | terminal token | Lists active PTY sessions | `terminal-api.ts:50` |
| DELETE | `/api/terminal/sessions/:id` | terminal token | Kills a session; returns `{ok: true}` | `terminal-api.ts:55` |
| GET (Upgrade) | `/api/terminal/ws` | terminal token | WebSocket upgrade for live PTY bridge. Token is read from `Sec-WebSocket-Protocol` (browsers cannot set `Authorization` on WS). Closes with code `4401` on unauthorised, `4429` on outbound quota | `useTerminalSocket.ts:27` |

Implementation: `src/api/server.ts:919`–`988` (REST routes), `src/api/terminal/ws-gateway.ts:38`–`92` (WS upgrade). The localhost-only token injection into `index.html` (`<script>window.__DECKENT_TERMINAL_TOKEN__</script>`) at lines 990–1009 is a one-way bridge and not a standalone endpoint.

---

## 8. Static & SPA Fallback

| METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED |
|--------|------|------|-------------|----------------|
| GET | `/` and any non-`/api/*` path | none | Serves dashboard build (`staticDir` option) with strict path traversal guard; falls back to `index.html` for SPA routes | served to the React app shell |

Implementation: `src/api/server.ts:463`–`496`. When `terminalToken` is active and the request is from `127.0.0.1`/`::1`, the served `index.html` has a `<script>window.__DECKENT_TERMINAL_TOKEN__=…</script>` injected before `</head>`.

---

## 9. Status Code Reference

| Code | Scenario |
|------|----------|
| 200 | Normal GET success / mutating POST success (`/api/set-directives`, `/api/kill/:workerId`, `/api/chat`, `/api/cleanup`, `/api/webhooks/*`) |
| 201 | Terminal session create |
| 202 | `/api/start` accepted, sprint runs in background |
| 400 | Invalid JSON body, missing path param (`workerId`, `connector`, `key`), Zod validation failure on `/api/plan`, `/api/start`, `/api/set-directives`, invalid `workerId` regex |
| 401 | Missing bearer token (or missing terminal token), invalid webhook key |
| 403 | Wrong bearer token (auth middleware), CORS preflight from disallowed origin, static path traversal attempt |
| 404 | Resource not found (job, task, sprint log, memory/debt export, config, generic GET) |
| 405 | Unknown HTTP method (anything other than GET/POST/OPTIONS) |
| 409 | `/api/start` while a sprint is running, `/api/cleanup` with active tasks, terminal session create rejected |
| 413 | Body exceeds `MAX_BODY_SIZE` (1 MB) |
| 422 | `/api/config` validation failure with `details[]` |
| 429 | Rate limit exceeded (`/api/*` only) |
| 500 | Handler exception (`Cleanup failed`, `Plan failed`, `Kill failed`, generic) |

---

## 10. Auth Middleware Behaviour (`src/api/auth.ts`)

- Resolution priority: explicit `configToken` > `DECKENT_API_TOKEN` env var > `null`.
- When `null` and `DECKENT_API_AUTH_DISABLED !== '1'`: **all non-exempt requests get 401** (secure by default).
- When `DECKENT_API_AUTH_DISABLED === '1'`: middleware bypasses (stderr warning printed once). Terminal auth does NOT honour this bypass.
- Bearer extraction expects `Authorization: Bearer <token>`. Missing scheme/value → 401, mismatch → 403 (constant-time SHA-256 compare via `timingSafeEqual`).

## 11. Rate Limiting (`src/api/server.ts:51-83` + `src/api/rate-limiter.ts`)

- The inline `RateLimiter` class in `server.ts` (used by `createHttpServer`) is a fixed-window-per-IP counter (`maxRequests` per `windowMs`).
- The richer `src/api/rate-limiter.ts` exposes `{allowed, remaining, retryAfter}` with a background cleanup timer; not yet wired into `createHttpServer` but ready for the v2 middleware refactor.
- Only paths starting with `/api/` are subject to limiting; `/health`, static assets and webhook handlers under `/api/webhooks/` ALL share the same per-IP bucket.

## 12. Coverage Gaps Surfaced By This Inventory

These observations were noticed while writing this file and are **not fixed in this task** (each is filed for Sprint 190 follow-up):

- `/api/sprint`, `/api/job/:jobId` and `/api/worker/:taskId/log` have no direct callers in the current React tree; consider archiving or documenting their CLI/automation consumers.
- `/api/webhooks/:connector/:key` lives in a separate trust boundary (HMAC-like compare via `validateWebhookKey`) but still goes through the global rate limiter — confirm this is intentional under burst load.
- The static-file SPA fallback path is reachable without auth; this is by design (asset hosting) but should be re-checked when the bearer token rotates.
- Terminal routes use a side-channel auth middleware (`LocalTokenAuthProvider`) and bypass the main `bearerAuthMiddleware`; the inventory above reflects this dual-stack reality.

---

*Last updated 2026-05-22 — Sprint 189, Task 189-011 (`src/api/server.ts`, `src/api/auth.ts`, `src/api/terminal/*`).*
