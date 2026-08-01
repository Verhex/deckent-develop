# A09 — Reference API Deep-Verify

**Sprint:** 345  
**Task:** 345-009  
**Auditor:** w-345-009 (doc-writer agent)  
**Date:** 2026-06-28  
**Files Verified:**  
- `docs/reference/api.md` (2341 lines)  
- `docs/reference/api-endpoints.md` (157 lines)  
- `docs/reference/api-examples.md` (969 lines)  
- `docs/reference/api-surface.md` (452 lines)  
**Source verified against:** `src/api/server.ts`, `src/api/*.ts`, `src/agents/worker.ts`, `src/core/task-types.ts`, `src/core/monitoring-types.ts`

---

## 1. Executive Summary

All four reference docs contain **actionable inaccuracies** relative to the current codebase. The most critical gap is a **pervasive authentication model mismatch**: `api.md` and `api-examples.md` both assert that all GET endpoints require no authentication, but `server.ts` routes every `/api/*` GET through `bearerAuthMiddleware` after Sprint 191. Secondary gaps include stale line-number references in `api-endpoints.md`, a rate-limiter class name mismatch, missing coverage of ~15 endpoints added after Sprint 189, and minor schema drift in `api-surface.md`. None of these are regressions introduced by sprint-345 — all were pre-existing.

**Verdict by file:**

| File | State | Critical Issues |
|------|-------|----------------|
| `api.md` §11 (HTTP API) | **DRIFT** | Auth model wrong (GET exempt claim false); stale 404 error text; missing config-key name; missing 8 status codes; ~15 endpoints undocumented |
| `api-endpoints.md` | **DRIFT** | Last verified Sprint 189; stale line references; rate-limiter name wrong; 15+ endpoints missing; auth claim for terminal endpoints stale |
| `api-examples.md` | **DRIFT** | Auth claim wrong (apiToken config key vs api_auth_token); `GET /api/memory` source path stale; auth "NOT required" label wrong on all GET examples |
| `api-surface.md` | **MOSTLY CORRECT** | Task/result/lock schemas verified; minor: `TaskResult.rubricScores` marked deprecated in code; `TaskResult.crossVerify` schema documented but not in task-types.ts interface; sprint phases list missing `TRANSITION` and `MANUAL_REVIEW_REQUIRED` statuses |

---

## 2. Endpoint Verification vs `src/api/server.ts`

### 2.1 Endpoints Present in Code but Missing from `api-endpoints.md`

`api-endpoints.md` was last verified against Sprint 189. The following endpoints exist in the current codebase but receive **no documentation** in that file:

| Endpoint | Source File | Sprint Added (approx) |
|----------|-------------|----------------------|
| `GET /api/workers` | `server.ts:580` | ~190 |
| `GET /api/agents` | `server.ts:605` | ~190 |
| `GET /api/routing/distribution` | `server.ts:620` | ~200+ |
| `GET /api/directives` | `server.ts:841` | ~210+ |
| `GET /api/chat/stream` (SSE) | `server.ts:699` | ~219 |
| `GET /api/output-stream` (SSE) | `output-stream.ts` | ~230 |
| `GET /api/workers/:taskId/logs/stream` (SSE) | `worker-logs.ts` | ~284 |
| `GET /api/evolution/genealogy` | `evolution-endpoint.ts:25` | ~200+ |
| `GET /api/evolution/retirement` | `evolution-endpoint.ts:33` | |
| `GET /api/evolution/prompt-metrics` | `evolution-endpoint.ts:41` | |
| `GET /api/memory/search` | `memory-search-endpoint.ts:26` | ~216 |
| `GET /api/nervous/pending` | `nervous-endpoint.ts:124` | ~230+ |
| `GET /api/nervous/status` | `nervous-endpoint.ts:130` | |
| `GET /api/nervous/recommendations` | `nervous-endpoint.ts:141` | |
| `POST /api/nervous/recommendations/dismiss/:id` | `nervous-endpoint.ts:150` | |
| `POST /api/nervous/accept/:taskId` | `nervous-endpoint.ts:159` | |
| `POST /api/nervous/reject/:taskId` | `nervous-endpoint.ts:169` | |
| `GET /api/autonomous/pending` | `autonomous-endpoint.ts:145` | ~240+ |
| `GET /api/autonomous/backlog` | `autonomous-endpoint.ts:156` | |
| `GET /api/autonomous/status` | `autonomous-endpoint.ts:180` | |
| `GET /api/autonomous/lineage/:id` | `autonomous-endpoint.ts:115` | |
| `POST /api/autonomous/approve/:id` | `autonomous-endpoint.ts:191` | |
| `POST /api/autonomous/reject/:id` | `autonomous-endpoint.ts:199` | |
| `GET /api/missions` | `missions-route.ts:46` | ~250+ |
| `GET /api/missions/:id` | `missions-route.ts:50` | |
| `POST /api/missions` | `missions-route.ts:62` | |
| `POST /api/missions/:id` | `missions-route.ts:78` | |
| `GET /api/process/status/:id` | `process-endpoint.ts:51` | ~260+ |
| `GET /api/process/result/:id` | `process-endpoint.ts:51` | |
| `POST /api/process/submit` | `process-endpoint.ts:68` | |
| `POST /api/reactive/webhook` | `reactive-endpoint.ts:33` | ~270+ |
| `GET /api/enterprise/tenants` + mutations | `enterprise-endpoint.ts` | ~269 |
| `GET /api/enterprise/rbac` + mutations | `enterprise-endpoint.ts` | |
| `GET /api/enterprise/audit` | `enterprise-endpoint.ts` | |
| `GET /api/enterprise/rate` | `enterprise-endpoint.ts` | |
| `GET /api/coverage` | `coverage-endpoint.ts:60` | ~280+ |
| `GET /api/kpi` | `kpi-endpoint.ts:95` | ~331 |
| `GET /api/kpi/trend` | `kpi-trend-endpoint.ts:106` | ~332 |
| `GET /api/docs/health` | `docs-health-endpoint.ts:44` | ~ADR-090 |
| `GET /api/auth/me` | `auth-me-endpoint.ts:154` | ~277 |
| `POST /api/auth/oidc/exchange` | `oidc-callback-endpoint.ts` | ~277 |
| `POST /api/directives` (alias) | `server.ts:984` | ~210+ |
| `POST /api/kill/all` | `server.ts:958` | ~200+ |
| `GET /api/config/defaults` | `server.ts:541` | ~180+ |

### 2.2 Endpoints Documented but Verified Present in Code

The following endpoints documented in `api-endpoints.md` and `api.md` were verified present in `server.ts` with correct methods:

| Endpoint | Verification |
|----------|-------------|
| `GET /health` and `GET /api/health` | `server.ts:459` ✓ |
| `GET /api/status` | `server.ts:493` ✓ |
| `GET /api/sprint` | `server.ts:521` ✓ |
| `GET /api/history` | `server.ts:528` ✓ |
| `GET /api/config` | `server.ts:533` ✓ |
| `GET /api/doctor` | `server.ts:547` ✓ |
| `GET /api/memory` | `server.ts:553` ✓ |
| `GET /api/debt` | `server.ts:561` ✓ |
| `GET /api/tasks` | `server.ts:570` ✓ |
| `GET /api/job/:jobId` | `server.ts:637` ✓ |
| `GET /api/worker/:taskId/log` | `server.ts:649` ✓ |
| `GET /api/events` (SSE) | `server.ts:668` ✓ |
| `POST /api/start` | `server.ts:877` ✓ |
| `POST /api/plan` | `server.ts:906` ✓ |
| `POST /api/chat` | `server.ts:935` ✓ |
| `POST /api/kill/:workerId` | `server.ts:970` ✓ |
| `POST /api/kill/all` | `server.ts:958` ✓ (not in docs) |
| `POST /api/set-directives` | `server.ts:984` ✓ |
| `POST /api/cleanup` | `server.ts:1003` ✓ |
| `POST /api/config` | `server.ts:1058` ✓ |
| `POST /api/webhooks/:connector/:key` | `server.ts:1089` ✓ |
| `POST /api/terminal/sessions` | `server.ts:1551` ✓ |
| `GET /api/terminal/sessions` | `server.ts:1580` ✓ |
| `DELETE /api/terminal/sessions/:id` | `server.ts:1587` ✓ |

### 2.3 `/api/v1/` Versioning Alias

The `server.ts:417` normalizes `/api/v1/<path>` → `/api/<path>`. `api-endpoints.md` documents this correctly in its header note (`server.ts:285-287`). The line reference is stale (actual: `server.ts:415-417`).

---

## 3. Authentication Model — Critical Discrepancy

### 3.1 What the Docs Say

**`api.md` §11 (line 1708):**
> "POST endpoints are protected by an optional Bearer token. GET endpoints (including `/api/events`) do **not** require authentication."

**`api.md` §11, every GET endpoint:**
> "**Authentication:** Not required."

**`api-examples.md`** repeats this claim throughout Section 2.

### 3.2 What the Code Does

`server.ts:454-455`:
```ts
if (url.startsWith('/api/') && authMiddleware) {
  if (!authMiddleware(req, res)) return;
}
```

This runs **before all GET route handlers**, meaning **all `/api/*` GET endpoints require a valid bearer token** (or `DECKENT_API_AUTH_DISABLED=1`). Exempt paths are explicitly listed: `['/health', '/api/health', '/api/auth/oidc/exchange']`.

SSE endpoints (`/api/events`, `/api/chat/stream`, `/api/workers/` prefix) accept a `?token=` query parameter fallback because `EventSource` cannot send headers — but they are **not auth-exempt**; they still require the token, just delivered differently.

The auto-mint behavior (loopback + no configured token → minted token injected into `index.html`) means the dashboard works without explicit configuration, which may explain why the "not required" claim appeared. But this is a convenience for localhost UI, not an absence of auth.

### 3.3 Config Key Mismatch

`api-examples.md` line 31 documents the config key as:
```json
{ "apiToken": "your-secret-token-here" }
```

The actual config key (`src/api/auth.ts:9, 95`) is `api_auth_token` (snake_case). `api-endpoints.md` §10 correctly states `config.api_auth_token`.

`api.md` line 1717 uses yet a third form:
```json
{ "api_token": "your-secret-token" }
```

The canonical key across all resolution layers is `api_auth_token`.

---

## 4. SSE Endpoint Verification

### 4.1 `/api/events` (Dashboard SSE)

**Documented behavior (api.md §11):**
- `text/event-stream` response ✓
- `retry: 3000` initial directive ✓ (code: `server.ts:676`)
- Lazy watcher initialization ✓ (code: `server.ts:677-678`)
- `data: <json>\n\n` format ✓

**Gap:** api.md states "Authentication: Not required." — **WRONG** (see §3 above).

**Gap:** api.md does not mention the live-event bridge (`DASH-RT-1`, Sprint 284) that pushes typed `event: hb` / `event: result` frames in addition to the dashboard-snapshot `data:` messages. The frame format (`formatLiveEventFrame`) is not documented anywhere in reference docs.

### 4.2 `/api/chat/stream` (Chat SSE)

Entirely absent from `api-endpoints.md` and `api.md`. Present in code at `server.ts:699`. Accepts user message via `?message=` query param (GET with query string, not POST body). Pushes `{type, message}` JSON frames.

### 4.3 `/api/output-stream` (Worker Output SSE)

Entirely absent from `api-endpoints.md` and `api.md`. Handled by `output-stream.ts`, mounted at `server.ts:688`. Provides live log fan-out for the dashboard.

### 4.4 `/api/workers/:taskId/logs/stream` (Worker Log SSE, DASH-RT-2)

Absent from all reference docs. Added Sprint 284. Matched by `matchWorkerLogStream` in `worker-logs.ts`. Path validation: `^[A-Za-z0-9_-]+$` (`server.ts:758`); 403 on path traversal attempt.

---

## 5. Rate Limiter Verification

### 5.1 Class Name

`api-endpoints.md` §11 calls it "inline `RateLimiter` class" and "fixed-window-per-IP counter." The actual class in `server.ts:85` is `SlidingWindowRateLimiter` — a **sliding window**, not a fixed window. The distinction matters: a sliding window prevents burst replay at window boundaries.

### 5.2 Defaults

- Default: 100 req/min ✓ (code: `server.ts:99`)
- Window: 60 000 ms ✓
- Loopback exempt by default ✓ (code: `server.ts:102`, `exemptLoopback: true`)
- Only `/api/*` paths rate-limited ✓ (code: `server.ts:422`)

### 5.3 `src/api/rate-limiter.ts`

`api-endpoints.md` §11 mentions a "richer `src/api/rate-limiter.ts`" that "not yet wired." This file exists. The claim remains accurate.

### 5.4 Snapshot Endpoint

`SlidingWindowRateLimiter.snapshot()` (`server.ts:126`) feeds `GET /api/enterprise/rate` — not mentioned in any rate-limit documentation.

---

## 6. api-surface.md — Schema Verification

### 6.1 `.tasks/task-{id}.json` Schema

**Verified against** `src/core/task-types.ts` (interface `Task`) and `src/core/monitoring-types.ts`.

| Field documented | Present in `Task` interface | Notes |
|------------------|-----------------------------|-------|
| `id`, `title`, `description`, `model`, `effort`, `priority`, `reason` | ✓ | |
| `scope.directories/filesRead/filesWrite` | ✓ | |
| `dependencies`, `goNogo`, `status`, `sprintId` | ✓ | |
| `assignedAgent`, `assignedSkills` | ✓ | |
| `provider`, `forceModel`, `forceEffort`, `forceAgent`, `forceSkills` | ✓ | |
| `excludeAgent`, `excludeSkills` | ✓ | |
| `authMode` | ✓ | |
| `routingMeta.taskDNA/confidence/routingVersion` | ✓ | |
| `createdAt`, `updatedAt` | ✓ | |
| **Missing from doc** | `type?: TaskKind` | WM-2a field |
| **Missing from doc** | `backend?: 'docker'\|'tmux'\|'subprocess'` | Per-task spawn backend (Sprint 252) |
| **Missing from doc** | `modelEffort?: string` | Reasoning effort (Sprint 252 F1-RE) |
| **Missing from doc** | `fixMode?: 'verify-only'\|'amend'\|'re-implement'` | Sprint 196 |
| **Missing from doc** | `smoke?: { command: string; expect: string }` | Tier-1 PoF (ADR-079) |
| **Missing from doc** | `actor?: ActorContext` | Sprint 196 |
| **Missing from doc** | `rerouteCount` in routingMeta | Sprint 252+ |

### 6.2 `.tasks/task-{id}.result` Schema

**Verified against** `src/core/task-types.ts` (interface `TaskResult`).

| Field documented | Present in `TaskResult` interface | Notes |
|------------------|------------------------------------|-------|
| `taskId`, `filesChanged`, `linesAdded`, `linesRemoved`, `testsPassed`, `coverage` | ✓ | |
| `selfAssessment`, `notes` | ✓ | |
| `tokenUsage.inputTokens/outputTokens/cacheReadTokens/provider/model` | ✓ | |
| `rubricScores.correctness/test_coverage/scope_compliance/documentation` | ✓ | **DEPRECATED** — marked `@deprecated` in `task-types.ts:492` since Sprint 146. Doc should note this. |
| `sharedNotes`, `handoffNotes` | ✓ | Correctly documented with condition notes |
| `crossVerify.verifier/verdict/reason` | Documented but **NOT in `task-types.ts` `TaskResult` interface** | `crossVerify` may be in a module-augmentation or added at runtime. Not found as a typed field in the canonical interface. Advisory: confirm source. |
| `workerId` | **In interface** — missing from api-surface.md result schema | `TaskResult.workerId: string` |
| `agentId`, `skillIds` | **In interface** — missing from api-surface.md | Sprint 146+ |
| `feedbackLoop` | **In interface** — missing from api-surface.md | Sprint 165+ |
| `cost` | **In interface** — missing from api-surface.md | Worker Output Contract §1.4 |
| `evaluationDecision` | **In interface** — missing from api-surface.md | Brain-set field |
| `completedAt`, `durationMs` | ✓ in interface, NOT in api-surface.md result table | Minor gap |

### 6.3 Lock File Schema

**Verified against** `src/core/monitoring-types.ts:108` (`interface LockInfo`).

```typescript
interface LockInfo {
  filePath: string;
  ownerWorkerId: string;
  acquiredAt: string;
  taskId: string;
}
```

api-surface.md documents exactly these four fields. **✓ MATCH.** (Note: `file-lock.ts:87` writes `ttl?: number` as an extension; not reflected in the interface or the doc, which is acceptable since it's an optional implementation detail.)

### 6.4 Heartbeat Schema

`api-surface.md` does not document the heartbeat (`.tasks/task-{id}.hb`) format. The actual `Heartbeat` interface (`src/core/monitoring-types.ts:25`) includes:

```typescript
interface Heartbeat {
  workerId: string;      // documented in api.md types section ✓
  taskId: string;
  status: AgentStatus;
  currentAction: string;
  currentFile?: string;
  timestamp: string;
  filesChangedCount: number;
  sequence: number;
  progress: number;      // NOT in api.md Heartbeat interface doc
  agentId?: string;      // NOT in api.md Heartbeat interface doc
  backend?: 'docker'|'tmux'|'subprocess';  // NOT in api.md Heartbeat interface doc
}
```

`api.md` §1 (line ~244) documents `Heartbeat` without `progress`, `agentId`, or `backend` fields.

### 6.5 Sprint Phases

`api-surface.md` Sprint Phases list:
> PLAN → SPAWN → WAVE_BUILD → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

`SprintPhase` enum (`src/core/sprint-types.ts`, exported via `src/core/types.ts` per `api.md` §1):
> `DIRECTIVE`, `PLAN`, `SPAWN`, `EXECUTE`, `EVALUATE`, `FIX`, `RETRO`, `DECAY`, `TRANSITION`, `COMPLETE`

Discrepancies:
- `DIRECTIVE` — in code, not in api-surface.md phase list
- `TRANSITION` — in code, not in api-surface.md phase list
- `COMPLETE` — in code, not in api-surface.md phase list
- `WAVE_BUILD` — in api-surface.md (with correct note about `dependency_pipeline_enabled`), but not in the enum (it's a logical sub-phase, not an enum value)
- `CLEANUP` — in api-surface.md but not in `SprintPhase` enum (it's `COMPLETE` in the enum)

### 6.6 `TaskStatus` Enum

api-surface.md result-schema documents `status` values:
> `DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED`

`TaskStatus` enum (`src/core/task-types.ts:174`) additionally includes:
- `MANUAL_REVIEW_REQUIRED` — Sprint 195, not documented in api-surface.md

### 6.7 Autonomous Backlog Schema

`api-surface.md` documents `.deckent/autonomous/backlog.json`. Spot-checked against `src/orchestra/autonomous/backlog-types.ts` — **broadly accurate**. The `fanOut.over` field and `planned`/`summary` fields are present in the doc. No critical gaps found in this section.

### 6.8 Module Import Rules (ADR-008)

The api-surface.md Module Import Rules section accurately summarizes the current ADR-008 constraint. Note: the ADR-008 residual violation (`src/core/routing-engine.ts:30` → `ecosystem-intelligence`) is tracked in the ADR itself and is not a documentation gap.

---

## 7. `api.md` — Coverage Note and Specific Issues

### 7.1 Size and Coverage

`api.md` is 2341 lines covering 12 major sections. The HTTP API section (§11) covers ~600 lines and documents the core sprint lifecycle endpoints well. However, it has not been updated since approximately Sprint 189 and is missing the ~35 endpoints added since then (see §2.1 above).

### 7.2 `HttpServerOptions` Interface — Stale

`api.md` §11 `createHttpServer` documents:
```ts
interface HttpServerOptions {
  port?: number;
  staticDir?: string;
  apiToken?: string;
  host?: string;
}
```

Actual `HttpServerOptions` (`server.ts:1154`) includes additional fields:
- `autoGenerateToken?: boolean`
- `rateLimit?: number`
- `rateLimitExemptLoopback?: boolean`
- `terminalBackend?: SessionBackend`
- `oidc?: { issuer, audience?, algorithm, key }`

### 7.3 `HttpApi` Interface — Stale

`api.md` documents:
```ts
interface HttpApi { server: Server; close(): Promise<void>; }
```

Actual `HttpApi` (`server.ts:1145`) also exposes:
- `terminalToken?: string`
- `terminalManager?: PtySessionManager`

### 7.4 Status Code Table — Incomplete

`api.md` status code table (lines 1778-1786) is missing:
- `201` — Terminal session create
- `202` — `/api/start` accepted
- `409` — `/api/cleanup` with active tasks, terminal session create rejected  
- `413` — Body exceeds 1 MB
- `422` — `/api/config` validation failure with `details[]`
- `429` — Rate limit exceeded
- `503` — output-stream collector unavailable

### 7.5 `GET /api/status` — 404 Behavior Changed

`api.md` states: **Error 404:** "No active sprint." The actual behavior (Sprint 269+ `reconcileStatusResponse`): instead of returning 404, the server returns a **200** with `{ idle: true, sprint: { phase: 'IDLE', status: 'IDLE' }, lastSprint: {...} }`. 404 is no longer returned for this endpoint.

### 7.6 CORS Documentation

`api.md` line 1766:
> "All responses include `Access-Control-Allow-Origin` restricted to `http://localhost:*` and `http://127.0.0.1:*`."

Actual behavior (`server.ts:431-433`): the origin is compared against `/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/`. When the request origin matches, that exact origin is echoed back. When no match, the response sets `http://localhost:3100`. This is correct — but "restricted to `http://localhost:*`" is a simplification; the actual restriction is stricter than a wildcard port glob implies.

### 7.7 `POST /api/config` — Merge Strategy Misrepresented

`api.md` line 2243:
> "Keys are merged with the existing config using shallow merge (`{ ...existing, ...body }`)."

Actual code (`server.ts:1067`): uses `deepMerge(existing, parsed.data)` — a **deep merge**, not shallow.

---

## 8. `api-examples.md` — Specific Issues

### 8.1 Authentication Section Config Key

Line 31 uses `"apiToken"` — should be `"api_auth_token"`.

### 8.2 `GET /api/memory` Source Description

Line 204 says "Returns the contents of `.brain/MEMORY.md`." The actual source is `.brain/exports/memory.md` (DB-generated export). The api.md version correctly describes this as the Memory V2 export; api-examples.md has the stale V1 path.

### 8.3 All GET Examples: "Auth Not Required" Labels

Every GET example in Section 2 and the TS fetch examples in Section 4 omit the bearer token. Since Sprint 191 all `/api/*` routes require auth unless `DECKENT_API_AUTH_DISABLED=1`. Example responses may work in auto-minted localhost scenarios, but the docs create incorrect expectations for remote or non-dashboard callers.

### 8.4 SSE Example (Section 5)

Lines 698-700 show:
```js
const es = new EventSource('http://localhost:3100/api/events');
```

This works on localhost (auto-minted token in `index.html`; loopback query-token whitelisted), but a remote client would need `?token=<token>` appended. The example should show both forms.

---

## 9. Link Check

Spot-checked cross-references within the four files:

| Link | Status |
|------|--------|
| `api-surface.md` → `src/orchestra/autonomous/backlog-types.ts` | File exists ✓ |
| `api-surface.md` → `DocTrackingStore` / ADR-090 | ADR-090 in DB; file reference valid |
| `api.md` §11 → `src/api/watcher.ts` | File exists ✓ |
| `api.md` → `src/api/server.ts` line references | Stale (most off by 100-500 lines) |
| `api-endpoints.md` → `src/api/rate-limiter.ts` | File exists ✓ |
| `api-endpoints.md` → `src/api/terminal/ws-gateway.ts:38-92` | File exists; line refs stale |

---

## 10. Issues Summary Table

| ID | File | Severity | Description | Fix Required |
|----|------|----------|-------------|--------------|
| I-01 | api.md, api-examples.md | **CRITICAL** | Auth model wrong: docs claim GET endpoints don't require auth; server requires bearer for all `/api/*` since Sprint 191 | Update auth sections to reflect all-endpoint auth with loopback/SSE exceptions |
| I-02 | api-examples.md | HIGH | Config key `apiToken` should be `api_auth_token` | Update §1 auth example |
| I-03 | api.md §11 | HIGH | `HttpServerOptions` and `HttpApi` interfaces missing fields added post-Sprint 189 | Add `autoGenerateToken`, `rateLimit`, `terminalToken`, etc. |
| I-04 | api.md §11 | HIGH | Status code table missing 201/202/409(cleanup)/413/422/429/503 | Add missing codes |
| I-05 | api.md §11 | HIGH | `POST /api/config` documented as shallow merge; code uses `deepMerge` | Fix to "deep merge" |
| I-06 | api.md §11 | MEDIUM | `GET /api/status` 404 behavior changed to 200+idle; error text stale | Update error behavior |
| I-07 | api-endpoints.md | MEDIUM | Class named `RateLimiter` (fixed-window) but actual is `SlidingWindowRateLimiter` (sliding) | Fix name and description |
| I-08 | api-endpoints.md, api.md | MEDIUM | ~35 endpoints added since Sprint 189 have no documentation | Add endpoint entries |
| I-09 | api-examples.md | MEDIUM | `GET /api/memory` source described as `.brain/MEMORY.md`; actual is `.brain/exports/memory.md` | Update path |
| I-10 | api-endpoints.md | LOW | Line references throughout are stale (code has grown ~600+ lines) | Update line refs |
| I-11 | api-surface.md | LOW | `TaskResult` missing: `workerId`, `agentId`, `skillIds`, `feedbackLoop`, `cost`, `evaluationDecision` | Add fields |
| I-12 | api-surface.md | LOW | `rubricScores` not marked deprecated (deprecated since Sprint 146) | Add deprecation note |
| I-13 | api-surface.md | LOW | Sprint phase list: `DIRECTIVE`/`TRANSITION`/`COMPLETE` missing; `CLEANUP` not an enum value | Align with `SprintPhase` enum |
| I-14 | api-surface.md | LOW | `TaskStatus.MANUAL_REVIEW_REQUIRED` not documented | Add status |
| I-15 | api-surface.md | LOW | `Heartbeat` missing `progress`, `agentId`, `backend` fields | Update heartbeat section |
| I-16 | api-surface.md | LOW | `Task` missing ~8 fields added post-Sprint 189 | Add fields |
| I-17 | api.md §1 | LOW | `Heartbeat` interface missing `progress`, `agentId`, `backend` | Update type docs |
| I-18 | api-surface.md | INFO | `crossVerify` in result schema not found as typed field in `TaskResult` interface; verify source | Confirm or add interface declaration |
| I-19 | api-examples.md | INFO | SSE example shows bare `EventSource()` without `?token=`; misleading for remote callers | Add token-query form |

---

## 11. Verdict

| Doc | Verdict | Priority |
|-----|---------|----------|
| `api.md` §11 (HTTP section) | **STALE — needs update** | HIGH — auth model error misleads all API consumers |
| `api-endpoints.md` | **STALE — needs update** | HIGH — missing 35+ endpoints, wrong rate-limiter class |
| `api-examples.md` | **STALE — needs update** | HIGH — auth claim wrong throughout, config key mismatch |
| `api-surface.md` | **MINOR DRIFT — targeted fixes** | LOW — schema gaps additive, core contract correct |
| `api.md` (non-§11 sections 1-10) | **MOSTLY CURRENT** | LOW — type interfaces accurate except Heartbeat and a few additions |

No source-code changes are required by this audit. All issues are documentation drift.

---

*A09 complete. Evidence: direct comparison of `src/api/server.ts` route handler against each endpoint table; `src/core/task-types.ts`+`monitoring-types.ts` against api-surface.md schemas; `src/api/auth.ts` against auth model claims.*
