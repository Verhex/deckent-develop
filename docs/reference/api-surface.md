# API Surface Contract

*This file defines inter-agent contracts. Brain creates, all agents read.*

---

## HTTP API Endpoints

The Deckent HTTP server (`deckent serve`) exposes these endpoints.

### Authentication & Authorization

All endpoints except those marked **EXEMPT** require bearer authentication via the `Authorization: Bearer <token>` header. The bearer can be:
- A static API token (configured via `api_auth_token` or `DECKENT_API_TOKEN` env var)
- A JWT issued by the dashboard OIDC flow (when `dashboard_oidc.enabled: true`)

The auth-gate middleware verifies the token before the endpoint is invoked. Unauthenticated requests to protected endpoints receive `401 Unauthorized`.

### GET /api/auth/me

**Authentication:** Required (auth-gate). The bearer has already been validated by the middleware.

**Purpose:** Return the authenticated caller's identity and role claims.

**Request:**
```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response (200 OK):**

OIDC JWT bearer:
```json
{
  "authenticated": true,
  "mode": "oidc",
  "sub": "user-uuid-or-identifier",
  "email": "user@example.com",
  "name": "Full Name",
  "preferredUsername": "username",
  "role": "admin"
}
```

Static token bearer:
```json
{
  "authenticated": true,
  "mode": "static"
}
```

**Response Fields:**
- `authenticated` — Always `true` (auth middleware blocks unauthenticated requests)
- `mode` — Token type: `"oidc"` (JWT with claims) or `"static"` (opaque token, no claims)
- `sub` — OIDC: unique user identifier from JWT claim (present when available)
- `email` — OIDC: email address from JWT claim (present when available)
- `name` — OIDC: user's display name from JWT claim (present when available)
- `preferredUsername` — OIDC: preferred username from JWT claim (present when available)
- `role` — OIDC: user's role from JWT claim or config RBAC (present when available); values: `"admin"`, `"operator"`, `"viewer"`

**Security Notes:**
- The bearer token itself is never included in the response.
- Claims are extracted from the JWT without re-verifying the signature (auth middleware already verified).
- Role is derived from JWT claims only — never from unauthenticated sources.
- For static tokens, `mode: "static"` signals that no claims are available (this is intentional).

**Errors:**
- `401 Unauthorized` — No bearer or invalid token (caught by auth-gate middleware before reaching this endpoint)

---

### POST /api/auth/oidc/exchange

**Authentication:** **EXEMPT** — This endpoint is called during the login flow before a bearer token exists.

**Purpose:** Exchange an authorization code from the OIDC authorize redirect for an id_token. Called by the dashboard after the IdP redirect.

**Activation:** Only available when `dashboard_oidc.enabled: true` in config. When disabled, the endpoint returns `404 Not Found`.

**Request:**
```
POST /api/auth/oidc/exchange
Content-Type: application/json

{
  "code": "<authorization-code>",
  "code_verifier": "<pkce-code-verifier>"
}
```

**Request Fields:**
- `code` — Authorization code returned by the IdP's authorization endpoint
- `code_verifier` — PKCE code verifier (must match the code_challenge sent during authorization)

**Response (200 OK):**

Success:
```json
{
  "ok": true,
  "token": "<id_token>",
  "claims": {
    "iss": "https://idp.example.com",
    "sub": "user-id",
    "aud": "client-id",
    "iat": 1234567890,
    "exp": 1234571490,
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

Failure:
```json
{
  "ok": false,
  "code": "invalid_request",
  "reason": "code_verifier mismatch"
}
```

**Response Fields:**
- `ok` — Boolean: `true` for success, `false` for error
- `token` — (Success only) The verified id_token as a JWT string (stored by dashboard in sessionStorage)
- `claims` — (Success only) Parsed JWT claims for display (user identity, role, etc.)
- `code` — (Error only) Stable machine-readable error code (see Error Codes table below)
- `reason` — (Error only, optional) Brief human-readable explanation (never includes sensitive values)

**Error Codes:**

| Code | Meaning |
|------|---------|
| `invalid_request` | Missing or malformed request (code or code_verifier missing, invalid JSON, etc.) |
| `discovery_failed` | Could not fetch or parse IdP's `.well-known/openid-configuration` document |
| `token_exchange_failed` | Token endpoint returned an error or invalid response |
| `id_token_missing` | Token endpoint response did not include an id_token |
| `id_token_invalid` | id_token verification failed (signature invalid, exp expired, iss/aud mismatch, alg:none rejected, etc.) |
| `fetch_unavailable` | (Internal) fetch is unavailable; network I/O cannot proceed |

**Security Notes:**
- **Config-gated:** When `dashboard_oidc` is disabled or missing, this endpoint returns `404 Not Found`.
- **Fail-closed:** All errors return structured failure responses with machine-readable codes. No sensitive values (client_secret, authorization code, id_token) appear in any response body or log.
- **PKCE protection:** The code_verifier is validated against the authorization code's code_challenge. Mismatched or missing verifier → `invalid_request`.
- **Signature verification:** The id_token is verified via JWKS (RS256-pinned). Algorithm-confusion attacks are blocked (alg:none rejected). Issuer and audience claims are validated against the config.
- **Expiration:** id_token expiration (`exp` claim) is checked at exchange time. Expired tokens → `id_token_invalid`.

**Flow (from Dashboard Perspective):**
1. User clicks "Sign in with SSO"
2. Dashboard generates PKCE verifier + challenge (crypto.subtle.digest SHA-256, base64url)
3. Dashboard builds authorize URL and redirects to the IdP
4. IdP prompts user for login and redirect back to `dashboard_oidc.redirect_uri` with `code` query param
5. Dashboard extracts `code` and calls `POST /api/auth/oidc/exchange` with code + code_verifier
6. Backend verifies the code with the IdP's token endpoint and validates the returned id_token
7. If successful, dashboard stores the token in sessionStorage and calls `GET /api/auth/me` to fetch user identity
8. Dashboard sets authenticated state and redirects to home page

---

## .tasks/ File Format (JSON)

Each task is stored as `.tasks/task-{id}.json`:
```json
{
  "id": "001-001",
  "title": "string",
  "description": "string",
  "model": "opus | sonnet | haiku | gpt-5 | gpt-4.1 | gpt-5-mini | gemini-2.5-pro | gemini-2.5-flash",
  "effort": "low | normal | high",
  "priority": "CRITICAL | HIGH | NORMAL | LOW",
  "reason": "string",
  "scope": {
    "directories": ["string[]"],
    "filesRead": ["string[]"],
    "filesWrite": ["string[]"]
  },
  "dependencies": ["string[]"],
  "goNogo": {
    "goCriteria": "string",
    "noGoCriteria": "string",
    "techDebtAcceptable": "string"
  },
  "status": "DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED | MANUAL_REVIEW_REQUIRED",
  "sprintId": "sprint-NNN",
  "createdAt": "ISO 8601",
  "assignedAgent": "string (agent id or 'generic')",
  "assignedSkills": ["string[] (skill ids)"],
  "provider": "claude | codex | gemini",
  "forceModel": "opus | sonnet | haiku (optional — set when DIRECTIVES specifies model)",
  "forceEffort": "low | normal | high (optional — set when DIRECTIVES specifies effort)",
  "forceAgent": "string (optional — agent id override from DIRECTIVES or AI planner)",
  "forceSkills": ["string[] (optional — skill id overrides from DIRECTIVES or AI planner)"],
  "excludeAgent": ["string[] (optional — agent ids to exclude from routing, forceSkills still apply)"],
  "excludeSkills": ["string[] (optional — skill ids to exclude from routing)"],
  "authMode": "'subscription' | 'api' (optional — DIRECTIVES `- Auth:` override; 'api' skips ~/.claude mount and REQUIRES ANTHROPIC_API_KEY; default falls back to config auth_mode)",
  "routingMeta": {
    "taskDNA": "object (optional — TaskDNA used for v2 routing decisions)",
    "confidence": "string (optional — routing confidence score)",
    "routingVersion": "v1 | v2 (optional — routing engine version used)",
    "rerouteCount": "number (optional — number of times this task has been rerouted)"
  },
  "type": "TaskKind (optional — WM-2a per-task kind override)",
  "backend": "'docker' | 'tmux' | 'subprocess' (optional — per-task spawn backend, Sprint 252)",
  "modelEffort": "string (optional — reasoning effort override, Sprint 252 F1-RE)",
  "fixMode": "'verify-only' | 'amend' | 're-implement' (optional — Sprint 196 FIX-phase strategy)",
  "smoke": "{ command: string; expect: string } (optional — Tier-1 proof-of-function directive, ADR-079)",
  "actor": "ActorContext (optional — Sprint 196 task actor context)"
}
```

## Result File Format

Each completed task writes `.tasks/task-{id}.result`:
```json
{
  "taskId": "001-001",
  "workerId": "string (worker that produced this result)",
  "filesChanged": ["src/file.ts", "tests/file.test.ts"],
  "linesAdded": 120,
  "linesRemoved": 30,
  "testsPassed": true,
  "coverage": 95.2,
  "selfAssessment": "DONE | GO_WITH_TECH_DEBT | NO_GO",
  "notes": "Brief summary of what was done",
  "agentId": "string (optional — agent ID that produced this result)",
  "skillIds": ["string[] (optional — skill IDs used during execution)"],
  "completedAt": "ISO 8601 (optional)",
  "durationMs": "number (optional)",
  "feedbackLoop": "FeedbackLoop (optional — tsc/test verify retry metrics, Sprint 165+)",
  "tokenUsage": {
    "inputTokens": 15420,
    "outputTokens": 3200,
    "cacheReadTokens": 89000,
    "provider": "claude",
    "model": "opus"
  },
  "cost": {
    "usd": 0.042,
    "currency": "USD",
    "pricingSource": "anthropic",
    "isLocal": false
  },
  "rubricScores": {
    "correctness": 90,
    "test_coverage": 85,
    "scope_compliance": 100,
    "documentation": 70
  },
  "evaluationDecision": "DONE | GO_WITH_TECH_DEBT | NO_GO (optional — Brain's final evaluation, may differ from selfAssessment)",
  "sharedNotes": [
    {
      "key": "string",
      "value": "string"
    }
  ],
  "handoffNotes": "string (optional message for downstream tasks)",
  "crossVerify": {
    "verifier": "string (provider name that performed the verification)",
    "verdict": "refuted | confirmed | unclear (adversarial verification outcome)",
    "reason": "string (explanation of the verdict)"
  }
}
```

**Note on `rubricScores` field:**

- **Deprecated since Sprint 146.** Worker self-reported scores were removed in favour of the Quality Assessor (`assessQuality()` in `quality-assessor.ts`). The field is retained in the interface for backward compatibility with existing result files — do not populate it in new workers.

**Note on `crossVerify` field:**

- **Advisory only.** The `crossVerify` field is not a typed field in the `TaskResult` interface (`src/core/task-types.ts`) — it is written at runtime when `config.cross_verify.enabled: true` and a verifier provider is available. Task `selfAssessment` and `evaluationDecision` are NOT automatically downgraded based on this field; human/Brain review decides next steps.

**Note on `sharedNotes` field:**

- **When present:** Only written to `.result` when `config.worker_comms?.enabled: true`. Workers can populate this array with structured notes to share with other workers in the same sprint.
- **When absent:** Omitted from the result entirely if worker communications is disabled or no notes were generated.
- **Format:** Array of objects with `key` (string identifier) and `value` (content string). Keys should be descriptive and unique within the task.
- **Usage:** Other workers read these notes from `SharedMemory` when executing dependent tasks, providing cross-worker context without explicit handoff channels.

**Note on `handoffNotes` field:**

- **When present:** Only written to `.result` when `config.worker_comms?.enabled: true` and the task has dependents. Workers can populate this with a free-text message for downstream tasks.
- **When absent:** Omitted from the result entirely if worker communications is disabled or no handoff message was generated.
- **Usage:** When the sprint controller creates a handoff from this task to dependent tasks, the `handoffNotes` are included in the handoff record and injected into dependent workers' prompts under the "Upstream Handoffs" section.

**Note on `crossVerify` field:**

- **When present:** Only written to `.result` when `config.cross_verify.enabled: true` AND the task was high-stakes (or any task if `high_stakes_only: false`) AND a verifier provider was available.
- **When absent:** Omitted from the result entirely if cross-verify is disabled or verification was skipped.
- **Verdict meanings:**
  - `refuted` — The verifier found issues with the task result; advisory warning that the task may need review.
  - `confirmed` — The verifier independently validated the task result; advisory confirmation.
  - `unclear` — The verifier output was inconclusive or uninterpretable; no strong signal either way.
- **Impact on decision:** The `crossVerify` field is advisory only. Task `selfAssessment` and `evaluationDecision` are NOT downgraded based on this field. Human/Brain review decides next steps (FIX retry, approval, or acceptance as-is).

## Sprint Phases

Sprint lifecycle phases — canonical values from `SprintPhase` enum (`src/core/sprint-types.ts`):

1. **DIRECTIVE** — Initial directive-reading phase before planning
2. **PLAN** — Brain reads DIRECTIVES, plans tasks, writes task JSON files
3. **SPAWN** — Workers spawned via tmux, subprocess, or Docker; auditor scan loop starts. When `dependency_pipeline_enabled: true` (ADR-045), tasks are sorted into dependency waves via Kahn's topological algorithm and each wave executes before subsequent waves unblock.
4. **EXECUTE** — Workers execute tasks, write heartbeats (.hb files)
5. **EVALUATE** — Brain waits for results, evaluates (GO/NO-GO/TECH_DEBT)
6. **FIX** — Failed tasks retried (optional, configurable timeout)
7. **RETRO** — Retrospective written to the memory.db `retro` entry
8. **DECAY** — Memory trimmed if .brain/ exceeds budget
9. **TRANSITION** — Inter-phase transition state (e.g. between SPAWN and EXECUTE)
10. **COMPLETE** — Sprint complete; task files archived, locks released

> **Note:** `WAVE_BUILD` is a logical sub-phase within SPAWN (dependency wave sorting), not a `SprintPhase` enum value. `CLEANUP` is not a `SprintPhase` enum value — the cleanup action happens as part of `COMPLETE`.

## Worker Scope Rules

- Workers MUST stay within `scope.directories` and `scope.filesWrite`
- Workers MAY read any file in `scope.filesRead`
- Boundary violations are detected by Auditor via `git diff --stat`

## .brain/ File Formats

### Memory V2 — DB-First (Primary)

All memory operations go through SQLite DB. Markdown files are generated exports.

- `memory.db`: SQLite database — **single source of truth** for all brain knowledge
- `exports/summary.md`: Auto-generated context summary (loaded via @ reference, ~4K chars)
- `exports/decisions.md`: Auto-generated ADR list for git diff/review
- `exports/memory.md`: Auto-generated sprint learnings
- `exports/debt.md`: Auto-generated debt table

### Memory V2 DB Schema

```sql
-- entries: main knowledge table (ADR, memory, sprint, debt, pattern, retro, identity)
-- tags: normalized many-to-many tag association
-- relations: cross-reference (references, supersedes, caused_by, resolves, blocks, depends_on)
-- entry_history: field-level change tracking
-- entries_fts: FTS5 full-text search (8 columns: 4 original + 4 turkishNormalize)
-- schema_version: migration safety
```

### Memory V2 Query API

```typescript
searchMemory(store, {
  text: 'docker heartbeat',          // FTS5 dual-layer search
  type: ['adr', 'memory'],           // filter by entry type
  status: ['accepted'],              // filter by status
  sprint_range: { min: 135 },        // filter by sprint number
  tags_contain: ['security'],        // entries must have ALL tags
  limit: 5,                          // max results
}): MemorySearchResult[]
```

### Legacy .brain/ Files (archived, read-only)

- `archive/pre-v2/DECISIONS.md`: Original 96K ADR file (backup)
- `archive/pre-v2/MEMORY.md`: Original sprint learnings (backup)
- `ERRORS.md`: Error log (still file-based, not in DB)
- `PROJECT-IDENTITY.md`: **Removed** — deprecated since Sprint 166 (ADR-046), superseded by `.deckent/workspace/IDENTITY.md` (managed-docs `identity-md` in `docs.json`). Identity remains in `memory.db` (decay_exempt).
- `sprints/sprint-NNN.md`: Sprint logs (in DB + file)

## doc_tracking Table (ADR-090)

Separate `better-sqlite3` connection to `.brain/memory.db` (does NOT touch `entries` / MemoryStore). Created idempotently (`CREATE TABLE IF NOT EXISTS`) by `DocTrackingStore`.

| Column | Type | Meaning |
|--------|------|---------|
| path | TEXT PK | repo-relative POSIX path |
| content_hash | TEXT | `sha256:…` of body (front-matter excluded); null when EXEMPT/temp |
| last_updated | TEXT | ISO8601 git author-date (mtime fallback) |
| doc_rank | INTEGER | DCR — 0=most critical, unbounded |
| status | TEXT | active\|draft\|temp\|frozen\|superseded |
| stale_score | REAL | 0..100 rank-independent severity |
| priority_score | REAL | 0..100 rank-weighted urgency |
| state | TEXT | FRESH\|DRIFT\|STALE\|CRITICAL_STALE\|EXEMPT |
| signals | TEXT | JSON {content_drift, code_drift, age_days} |
| tracked_code | TEXT | JSON string[] (`tracks` globs) or null |
| first_seen / last_scanned | TEXT | ISO8601 |

`.deckent/settings/docs.json` additive `tracking` block (all optional, merged over defaults): `rankMap`, `defaultRank`, `trackIgnore`, `noFrontmatter`, `scoring{weights{content,code,ageMax},criticalAt,staleAt,maxRank}`, `sizeCapBytes`.

CLI: `deckent docs track scan [--no-write] [--prune] [--check] [--max-rank <n>]` · `docs track status [--stale] [--rank <n>] [--json]` · `docs track sync`.

### Doc-Tracking Faz 2 surfaces (ADR-090)

- **`GET /api/docs/health`** (auth-gated, read-only) → `{ rows: DocStatusRow[], heatmap: {bucket,state,count}[], generatedAt }`. Buckets: `0` / `1-10` / `11-50` / `51-94` / `95+`. Consumed by the dashboard "Docs Health" page (`/docs-health`).
- **MCP `deckent_docs`** actions: `track-scan` (DB-only scan → `{count,stale}`), `track-status` (→ `{docs:[...]}`).
- **CLI `--check`**: `deckent docs track scan --check [--max-rank <n>]` exits non-zero if any `CRITICAL_STALE` doc (optionally `doc_rank <= n`).
- **code-drift**: docs with a `tracks:` front-matter glob get `signals.code_drift` (true when any tracked source file's git author-date is newer than the doc; null when no `tracks`).
- **Config:** `config.doc_tracking.sync_on_finalize` (boolean, default `false`) — DB-only doc-tracking sync at sprint finalize (fail-safe).

## Lock File Format

Lock files in `.locks/`: `{filepath-with-__-separators}.lock`
```json
{
  "filePath": "string",
  "ownerWorkerId": "string",
  "acquiredAt": "ISO 8601",
  "taskId": "string"
}
```

## .deckent/autonomous/backlog.json File Format

The autonomous engine's durable backlog — single source of truth for machine-initiated work items
(`src/orchestra/autonomous/backlog-types.ts`, `backlog.ts`). Git-trackable. A missing file is treated
as an empty backlog (`{ "_version": "1.0", "entries": [] }`).

```json
{
  "_version": "1.0",
  "entries": [
    {
      "id": "string (non-empty, unique — enqueue dedupes by id against entries of ANY status)",
      "title": "string (non-empty)",
      "kind": "task | sprint | capability | process",
      "spec": {
        "description": "string (optional — kind=task: inline description for runTaskMode)",
        "directivesRef": "string (optional — kind=sprint: directives reference)",
        "scopeDir": "string (optional — scope directory)",
        "capabilityTarget": {
          "capability": "string (dotted verb, e.g. 'mail.send' | 'erp.read' | 'db.query')",
          "args": "object (optional — Record<string, unknown>)",
          "connector": "string (optional — backend, e.g. 'imap' | 'graph' | 'odoo' | 'postgres')"
        }
      },
      "policy": "auto | approval-required | risk-tagged",
      "provider": "string (optional)",
      "model": "string (optional)",
      "trigger": "{ type: 'recurring', cron: string } | { type: 'one-off' } | { type: 'reactive', detector: string }",
      "status": "pending | running | parked | done | failed",
      "tenant": "string (optional)",
      "lastRun": "ISO 8601 | null (run COMPLETION time — set only with a non-null lastResult, never on run start)",
      "lastResult": "{ ok: boolean, reason: string } | null",
      "planned": "boolean (optional — goal-planner Phase 1: detail generated JIT at dispatch)",
      "summary": "string (optional — goal-planner one-line WHAT)",
      "fanOut": { "over": "string", "concurrency": "number>=1 (optional — parallel fan-out hint)" }
    }
  ]
}
```

### Validation Rules (`validateBacklogEntry`)

Hand-written validation (ADR-010, no schema dependency) — returns the first violation:
- `id` and `title` must be non-empty strings
- `kind` ∈ `task | sprint | capability | process`; `policy` ∈ `auto | approval-required | risk-tagged`; `status` ∈ valid set
- `trigger.type` ∈ `recurring | one-off | reactive`
- `trigger.type = recurring` → `trigger.cron` (string) is REQUIRED
- `trigger.type = reactive` → `trigger.detector` (string) is REQUIRED
- `spec` must be a plain object (not an array)
- `kind = capability` → `spec.capabilityTarget` is REQUIRED, with a non-empty `capability` string

Invalid entries fail `loadBacklog` hard; invalid work-generator candidates are skipped with a
warning in `enqueueCandidates` (never throws).

### Status Lifecycle

```
pending → running → done | failed
        ↘ parked (policy gate — approval-required / risk-tagged hold)
recurring: done → pending (re-enqueue when next cron cadence after lastRun arrives)
```

- `queryDue` surfaces every `pending` entry — "pending = due now". Recurring cadence is gated at
  FLIP time by `reenqueueRecurring` (done→pending only when the next run after `lastRun` has
  arrived); a never-run recurring entry is pending = first run immediate.
- `applyRecurringReenqueue` persists the flip atomically ONLY when at least one entry changed
  (idle ticks never rewrite the file). A malformed cron leaves the entry `done` with a warning —
  never throws.
- `purgeCompletedBacklog` keeps the 5 most recently completed `done`/`failed` entries (by
  `lastRun`, default `keepRuns = 5`); `pending`/`running`/`parked` entries are never touched.

## Module Import Rules (ADR-008)

- Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker
- Planner imports ONLY from core/ (types, constants) — never from brain
- Auditor reads task files from disk (no brain import)
- Worker reads task files from disk (no brain import)
- Circular dependencies are FORBIDDEN

## Pillar Module Contracts (Sprint 352–354)

The following contracts document internal module boundaries landed across sprint-352/353/354.
Every claim below is disk-verified against the cited `file:line`; anything gated behind a
config-flag seam is labeled **flag-gated (default-off)** — treat unlabeled entries as shipped
and always active. None of the flags below appear in `.deckent/settings/features-manifest.json`
(they are plain `config.<key>?.enabled` seams, not manifest-tracked features).

### TOOL — Registry / Search / Dispatch (ADR-D-004 Layer-1)

Four `src/core/` modules form a strict layering (each tier depends only on the tier below it;
none import from `mcp/`, `cli/`, `orchestra/`, or `agents/`):

1. **TOOL-1** `src/core/tool-registry.ts` — pure catalog (register/get/list/validate tools).
2. **TOOL-2** `src/core/tool-search.ts` (160 lines) — progressive disclosure over TOOL-1.
   - `ToolSearchIndex` class (`src/core/tool-search.ts:108`), constructed with a `ToolRegistry`.
   - `searchTools(query, options?)` (`tool-search.ts:112`) — deterministic tiered scoring:
     exact name match = 3000, name-substring = 2000 + overlap%, token-overlap = 1000 + hits;
     ties broken alphabetically; `options.limit` defaults to 10.
   - `describeTool(name)` (`tool-search.ts:133`) — exact match, returns the real `paramsSchema`
     instance (never a re-derived copy).
   - `planCall(name, args)` (`tool-search.ts:138`) — validates args and labels risk; **never
     executes**.
   - `coreTools()` (`tool-search.ts:152`) — returns the eager-7 set named in
     `CORE_TOOL_NAMES` (`tool-search.ts:91`): `deckent_status`, `deckent_plan`, `deckent_run`,
     `deckent_start`, `deckent_review`, `deckent_help`, `deckent_memory_query`.
3. **TOOL-CORE** `src/core/tool-core.ts` (130 lines) — eager-disclosure surface builder on top
   of TOOL-1 + TOOL-2.
   - `summarizeEagerSchema(schema)` (`tool-core.ts:74`) — derives `{name,type,optional}[]` from
     a tool's real Zod schema (no hand-maintained duplicate).
   - `buildCoreToolSurface(index)` (`tool-core.ts:101`) — maps `index.coreTools()` to abbreviated
     schemas.
   - `deferredIndexLine(allTools, coreNames?)` (`tool-core.ts:118`) — alphabetically sorted
     one-liner naming every non-core tool, for the "+N more tools" first-turn pointer.
4. **TOOL-3** `src/core/tool-dispatch.ts` (221 lines) — first execution-capable layer.
   - `dispatchToolCall(plan, options)` (`tool-dispatch.ts:157`, async) — **never throws**.
     Flow: unknown/invalid plan short-circuits → risk gate via `meetsRiskThreshold` against
     `options.riskThreshold` (default `'moderate'`, `tool-dispatch.ts:33`) → if risk-gated and
     no `options.confirm` seam is supplied, **fail-closed deny** → if `confirm` resolves
     `'allow'`, calls `options.execImpl` seam → every path settles a `DispatchResult` with
     `telemetry` (`tool-dispatch.ts:98-112`) populated.
   - `DISPATCH_STATUSES` (`tool-dispatch.ts:88`): `executed | denied | invalid | unknown_tool | error`.

**Scope containment:** `src/core/tool-scope-gate.ts` (149 lines) — pure, realpath-based
containment check (ADR-G-017/G-020, ADR-D-004 SCOPECHECK-CORE relocation). `createScopeGate(scope,
options?)` (`tool-scope-gate.ts:117`) defaults to `mode: 'advisory'` (`allowed: true` even on a
violation — never blocks); `mode: 'enforce'` blocks. Symlink escapes are resolved via realpath
before containment check.

**Native REPL bridge — flag-gated (default-off):** `src/cli/repl/native-tool-registry.ts` (396
lines), `buildNativeToolRegistry(opts)` (`native-tool-registry.ts:319`). Registers 3 meta-tools
(`deckent_search_tools`, `deckent_describe_tool`, `deckent_call_tool`) only when
`opts.toolSurface.enabled` is true — checked at `native-tool-registry.ts:391`
(`tool_surface.enabled` config seam). When off, tool registration is byte-identical to
pre-sprint-354. Verified by `tests/cli/tool-repl-wire.test.ts:26-30` (structural equality).
`deckent_call_tool`'s handler chains `planCall` → `dispatchToolCall`; with no `execImpl` wired,
calls fail closed with `NOT_WIRED_EXEC` (`native-tool-registry.ts:228`) — real tool execution via
this surface is explicit future work, not yet shipped.

### APR — Approval Contract → EventStream Chain

Twelve `src/core/approval-*.ts` modules (2,337 lines total) plus `pending-approvals.ts`. **No
module in this chain is itself flag-gated** — the chain is core infrastructure; only its
*call sites* (worker tool dispatch, REPL approval card) are flag-gated (see TERM/TOOL sections).

- **Contract** `src/core/approval-contract.ts` (194 lines) — canonical Zod schemas, zero business
  logic. `ApprovalRequest`/`ApprovalDecision` types (`approval-contract.ts:95,113`); 5 requester
  roles, 7 action scopes (`file-read`,`file-write`,`shell-exec`,`git-mutation`,`network`,
  `credential`,`lifecycle`), 5 risk tiers (`none`..`critical`), 4 policy verdicts
  (`auto-approve`,`notify`,`require-approval`,`deny`).
- **Broker** `src/core/approval-broker.ts:107` (class, 339 lines) — event-driven, file-backed
  (`.deckent/approvals/`), atomic tmp+rename writes, multi-process safe via
  `checkForExternalDecisions()` (`approval-broker.ts:301`). `submit()`/`decide()`/`expire()` at
  lines 169/211/251.
- **Relay** `src/core/approval-relay.ts` (193 lines) — fans `'pending'` events to attached
  channels (`attachChannel`, `approval-relay.ts:144`); channels only ever see `maskedArgs`.
- **Masking** `src/core/approval-masking.ts` (118 lines) — `maskArgs()` (line 36) redacts via the
  existing `redactSensitive` regex library; `storeRawArgs()`/`resolveRawArgs()` (lines 77/102)
  persist raw args under `.deckent/approvals/raw/` (mode 0600) behind an opaque
  `rawArgsRef` pointer, with path-traversal validation on resolve.
- **Store** `src/core/approval-store.ts` (class, 358 lines) — restart-survive peer index over the
  same `.deckent/approvals/` directory the broker writes; `index()` (line 277) rebuilds full
  state from disk on every call.
- **Policy** `src/core/approval-policy.ts` — `decidePolicy()` (line 101), pure function,
  first-match-wins over an ordered rule list. **Critical-clamp:** risk `'critical'` can never
  resolve to `'auto-approve'` — clamped to `'deny'` (`approval-policy.ts:98`, `approval-policy.ts:122`).
- **WorkerGate** `src/core/approval-worker-gate.ts` (class, 262 lines) — `guard(action)` (line
  155) is the enforcement point called before risky tool execution; masks args, submits, then
  awaits a decision or the injected fallback resolver (default: `DENY_FALLBACK_RESOLVER`, line 80).
- **Fallback** `src/core/approval-fallback.ts` — `resolveFallback()` (line 106) is pure,
  synchronous, and **total** ("finite-always": always returns one of
  `deny|pause|timeout-default|escalate`, never hangs). Precedence: critical-with-no-escalation
  → deny; expired → timeout-default; escalation channel reachable → escalate; else → bounded pause.
- **EventStream** `src/core/approval-eventstream.ts` (class, 281 lines) — multi-client publish
  stream over the relay. **Backfill:** new subscribers immediately receive all currently-pending
  requests via a cached `pendingById` map. **Backpressure:** per-client bounded async queue,
  drop-oldest on overrun with a coalesced `dropped` marker event.
- **Rules-load** `src/core/approval-rules-load.ts` — `loadApprovalRules()` (line 94), fail-soft
  (malformed rule entries skipped with a warning, never throws); `SAFE_DEFAULT_APPROVAL_RULES`
  (line 54) is the 5-rule fallback set. **Not yet wired** to `src/core/config.ts` — a tracked follow-up.
- **Expiry-driver** `src/core/approval-expiry-driver.ts` (class, 104 lines) — `tick()` (line 70)
  runs `broker.expire()` → `store.index()` → `store.prune()`; its interval timer is `.unref()`'d
  (ADR-G-013 — never keeps the process alive). **Not yet wired** into runtime bootstrap.
- **pending-approvals.ts** (94 lines) — `readPendingApprovals()` (line 92), single-source reader
  merging nervous + autonomous pending approvals for CLI/dashboard/MCP; fail-safe (missing/corrupt
  files yield `[]`).

**Worker-side consumption — flag-gated (default-off):** `src/agents/agentic-worker-tools.ts`'s
`wrapDispatcherWithApprovalGate(baseDispatcher, options)` (`agentic-worker-tools.ts:303`) wraps an
Ollama worker's tool dispatcher so risky calls (`shell-exec`/`git-mutation`/`network` — currently
only `run_bash` is classified via `classifyRiskyToolCall()`, `agentic-worker-tools.ts:248`) pass
through `WorkerApprovalGate.guard()` before dispatch. Gated by `options.enabled` — the
`approval_gate.enabled` config flag (`agentic-worker-tools.ts:279`): `if (!options.enabled) return
baseDispatcher;` (`agentic-worker-tools.ts:307`) returns the exact same dispatcher reference,
zero-overhead, when off. A denied/errored guard call never calls `baseDispatcher` — it returns a
structured `[approval-denied] ...` string so the model can self-correct, mirroring the existing
`[scope-violation]` rejection pattern.

**Data-flow order:** contract (types) → broker (submit/persist) → relay (fan-out) → masking
(redact before submit) → store (restart-survive read index) → policy (decision, not yet wired to
a live call site) → worker-gate (the actual enforcement point) → fallback (timeout/no-response) →
eventstream (read-only delivery to observers, e.g. the REPL approval card) → rules-load / expiry-
driver (config load and TTL housekeeping — both implemented but not yet wired into a runtime
bootstrap path).

### TERM — REPL Surface Cores

- `src/cli/helpers/live-footer.ts` (163 lines) — `buildLiveFooter(state, options)` (line 132),
  pure render, i18n-first via injected `LiveFooterLabels` (no hardcoded strings).
- `src/cli/repl/term-mode.ts` (133 lines) — Ask/Run/Control mode machine.
  `ALLOWED_RISKS_BY_MODE` (line 31) is a cumulative risk ladder: `ask` ⊂ `run` ⊂ `control`.
  `parseTermCommand()` (line 65) parses the single `/term` dispatch line (bare `/term` = status,
  `/term ask|run|control` = switch, anything else = usage) and `applyModeTarget()` (line 86)
  applies the switch — the former `/ask` `/run` `/control` transition commands are retired so
  those names stay free for future first-class commands; `checkActionAllowed()` (line 123)
  returns an `ActionDecision` naming the `suggestedMode` when denied.
- `src/cli/repl/chat-turn-queue.ts` (78 lines) — Hermes "no mid-turn injection" rule.
  `drainAsTurns()` (`chat-turn-queue.ts:66-67`): `if (queue.userTurnActive) return [];` — the
  queue is left untouched and returns nothing while a user turn is in flight; buffered
  background events only surface at turn-end.
- `src/cli/helpers/connect-wizard.ts` (328 lines) — pure `/connect` detection wizard (provider
  CLI auth + MCP attach + IDE detection + Windows shell guidance). `detectRuntime(probes)` (line
  137) and `planConnectSteps()` (line 263) take an injected probe seam — no direct I/O.
- `src/orchestra/directives-builder.ts` (232 lines) — canonical DIRECTIVES.md generator.
  `buildDirectives(intent)` (line 156) has a round-trip contract with the existing
  `parseStructuredDirectives` parser, proven by `tests/orchestra/directives-builder.test.ts:67`
  (`build → parse → reconstructBuildTask` deep-equals the original intent). Fragility guards
  (`directives-builder.ts:52-99`) reject reserved labels/heading text/delimiter collisions in
  user-supplied fields — the "DIRECTIVES zero-fragility foundation".
- `src/cli/repl/dual-stream.ts` (97 lines) — `composeDualStream(input, options)` (line 78) fits
  a status footer + approval-card region into one non-overlapping line-list.
- `src/cli/repl/approval-card.tsx` (286 lines) — Ink component rendering the oldest pending
  `ApprovalRequest` with y/n/a/d decision keys; never renders `rawArgsRef` (line 14), only
  `maskedArgs`.
- `src/cli/helpers/run-state-feed.ts` (213 lines) — `computeLiveFooterState()` (line 93) derives
  live-footer state from `.tasks/task-*.hb` + `.deckent/sprint-state.json`; missing/corrupt input
  degrades to "absent", never throws.

**REPL surface wiring — flag-gated (default-off):** `src/cli/repl/app.tsx`'s `replSurfaceEnabled`
prop (`app.tsx:210-213`, `repl_surface.enabled` config seam). When absent/false, `ReplApp` renders
byte-identical to the pre-sprint-354 component; term-mode/live-footer polling/chat-turn-queue
wiring only activate when true. `dual-stream.ts` and `approval-card.tsx` are implemented and
tested but have **no caller in `src/` yet** — App-level wiring is a tracked follow-up.

### DeckBroker — Task-Scoped Credential Resolution (ADR-G-005)

`src/core/deck-broker.ts` (150 lines) — host-side, mint-once broker over `.deck` secrets.
Constructed once per spawn batch; the `.deck` file path is loaded once at construction
(`deck-broker.ts` via `loadDeckSecrets`) and **never stored on the instance, returned by any
public method, or logged**.

- `resolveForTask(taskId, provider)` (`deck-broker.ts:109`) → `Record<string,string> | null`.
  Three enforced constraints: **task-scoped** (a second call for the same `taskId` is denied,
  reason `'already-consumed'`), **TTL-gated** (`DEFAULT_TTL_MS = 5 * 60_000`, `deck-broker.ts:73`,
  configurable via `opts.ttlMs`), **single-use** (`taskId` is marked consumed after a grant). A
  provider with no configured `.deck` secret returns `null` with reason `'no-secret'` and does
  **not** consume the `taskId` — a later call for a different provider can still succeed.
- `getAuditLog()` (`deck-broker.ts:133`) — returns a copy of an **in-memory only** audit trail
  (never persisted to disk); entries record `taskId`/`provider`/`timestamp`/`outcome`/`reason`,
  never secret values or the `.deck` path.

**Flag-gated (default-off):** minted only when `config.deck_broker?.enabled &&
config.auth_mode !== 'subscription'` (`src/core/provider.ts:1044`, inside `bootstrapProviders()`).
Subscription-mode auth never reads `.deck` at all, so the broker is inapplicable there. When the
flag is off, `bootstrapProviders()` returns `deckBroker: null`.

**Consumption point:** `src/providers/subprocess.ts:249-265` — `SubprocessSpawnBackend.spawn()`
resolves the *current task's own* credential through `opts.deckBroker?.resolveForTask(...)` when a
broker is passed in, and falls through to the pre-existing `opts.env` passthrough when the broker
is absent or denies the resolution (never throws). **Not yet wired end-to-end**: `bootstrapProviders()`
mints the broker, `subprocess.ts` knows how to consume one, but no call site
(`src/orchestra/sprint-spawner.ts`, `src/cli/commands/spawn.ts`) currently threads
`BootstrapResult.deckBroker` into `ProviderSpawnOptions.deckBroker` — this wiring is a tracked
follow-up (`src/core/provider.ts:982-984`).

### trace-extract CLI — Training-Trace Extraction

- `src/training/cc-trace-extractor.ts` (165 lines) — pure parser. `extractFromSession(lines,
  system)` (line 51) reads Claude-Code JSONL transcript lines, segments at real-user-text turns
  (drops thinking blocks), and remaps the core-4 tool names (`Read`/`Write`/`Edit`/`Bash`) to
  `deckent_*` via `mapToolName()` (line 20) / `CORE4` (line 12). Returns two corpora: `aligned`
  (core-4-tools-only segments) and `general` (all segments, non-mappable tool names preserved
  as-is).
- `src/cli/commands/trace-extract.ts` (170 lines) — CLI driver. `registerTraceExtract(program)`
  (line 136) registers a nested `trace extract` subcommand (`trace-extract.ts:138,142`):
  ```
  deckent trace extract <input> [--out <dir>] [--system <text>]
  ```
  `<input>` may be a single `.jsonl` file or a directory (recursed via `collectTranscriptFiles()`,
  line 56). `--out` defaults to `.deckent/training`. Each extracted example is redacted via
  `redactExample()` (line 90, uses the shared `redactSensitive` library) before being appended to
  `<out>/aligned.jsonl` and `<out>/general.jsonl`. Exits 1 if `<input>` does not exist.
- `src/cli/repl/trace-wire.ts` (45 lines) — native-REPL turn recorder, wired into
  `src/cli/repl/run.tsx`. `buildTurnRecorder(opts)` (line 34) returns `undefined` when disabled;
  opt-out via the `DECKENT_TRACE=0` environment variable (not a `features-manifest.json` flag).
  Writes redacted per-turn training examples to `.deckent/traces/<sessionId>.jsonl` (gitignored,
  local-only); write failures are fail-soft (ADR-G-009) and never break the REPL turn.
- `src/training/pipeline.ts` (319 lines) — downstream ShareGPT converter (unsloth/LLaMA-Factory
  format). `traceToShareGpt(trace, policy?)` (line 223) runs convert → redact → truncate → redact
  (double-pass redaction defense-in-depth); `runPipeline(opts)` (line 280) is a streaming
  (readline + write-stream) driver that never materializes a whole file in memory. **Exported but
  not yet wired into the CLI** — no `deckent` command currently invokes `runPipeline()`.

No module in this pillar is behind a `config.*.enabled` flag; `trace-wire.ts`'s only gate is the
`DECKENT_TRACE=0` env-var opt-out described above.
