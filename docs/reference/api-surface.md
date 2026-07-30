# API Surface Contract

*Canonical transport/runtime contract map. Code types and schemas linked by each section are the
machine authority; this document is their reviewable projection, not a second state authority.*

Deckent is a provider-neutral Agent OS / AI runtime ecosystem. Goal → Mission → Flow → Run →
WorkItem → Attempt → Operation is the canonical execution ontology. Legacy sprint/task/process
surfaces remain adapters or projections while they converge on that kernel; HTTP, Terminal,
Desktop, CLI, MCP, connectors, dashboard, Brain, and workers must not invent parallel authority.

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

### POST /api/approvals/:id/decision

**Authentication:** Required, plus a fresh OIDC step-up at the decision
boundary. Passing the ordinary API bearer middleware is not sufficient for
attended execution.

**Activation:** `approval.api_decide: true` and a ready
`approval.authority` production composition. Missing approval custody,
disabled/incomplete OIDC composition, static bearer, auth-disabled mode or an
unsupported platform cannot authorize the request.

**Request:**

```http
POST /api/approvals/<request-id>/decision
Authorization: Bearer <fresh-oidc-assertion>
Idempotency-Key: <caller-stable-key>
Content-Type: application/json

{
  "decision": "allow",
  "reason": "optional bounded reason"
}
```

`decision` uses the ApprovalBroker action vocabulary. The endpoint re-verifies
signature, pinned algorithm, issuer, audience, expiry, `sub`, exact tenant,
`auth_time`, and configured ACR/AMR policy. Verified claims are converted into
a durable request/action/channel-bound live-session lease; client-supplied
actor fields are never identity authority.

**Success (200):**

```json
{
  "success": true,
  "decision": {},
  "idempotent": false
}
```

The returned `decision` is the canonical signed ApprovalDecision envelope.
Repeating the same command with the same `Idempotency-Key` returns
`idempotent: true`; a different command for an already-settled request does not
rewrite the first decision.

**Errors:**

- `400` — invalid request id/body or missing `Idempotency-Key`
- `401` — missing fresh OIDC Bearer assertion
- `403` — endpoint disabled or verified assertion/identity/policy rejected
- `404` — request not found
- `409` — request already terminal or expired
- `503` — runtime-wide attended approval authority is not composed

The endpoint records a decision only. Final dispatch independently revalidates
the signed decision, active session, expiry and exact immutable proposal
(tenant/project/run/task/attempt/provider/API model/backend/budget/policy plus
task/prompt/scope/acceptance digests), then creates a first-writer dispatch
claim. API, Goal-v2, CLI run/task-mode, MCP run, sprint and process execution
consume the same injected authority. Static token, localhost, TTY, REPL/RPC
literal actors and MCP stdio cannot decide an attended execution request.

---

## Build/Clean Active-Execution Admission

`npm run clean` and every `npm run build` are protected by the read-only
admission in `scripts/clean.mjs`. The admission runs before any `dist/` entry is
removed. There is no force flag, environment bypass, or caller-selected
destructive root.

The admission authority is
`deckent.clean.active-execution.v1`. It inspects the physical project root with
bounded reads from:

- `.tasks/task-*.json`, task heartbeats, and durable worker PID records;
- `.deckent/sprint-state.json`, `.deckent/sprint-active.json`, sprint
  coordinator PID records, and the MCP launch anchor at
  `.deckent/state/active-sprint.json`;
- the config-resolved autonomous backlog (default
  `.deckent/autonomous/backlog.json`);
- the mixed-writer `.deckent/runtime/jobs/*.json` store and
  `.deckent/runtime/run-flow-store/*.{events,handle}.jsonl`;
- Mission v2 state and engine lease truth in
  `.deckent/autonomous/autonomous.db`;
- `.deckent/bot.pid`;
- `.deckent/runtime/invocations.db`, opened read-only only when a raw `PENDING`
  task needs settlement reconciliation.

Missing optional runtime directories are clear evidence for a clean clone.
Unreadable, malformed, symlinked, oversized, unsupported, or contradictory
evidence is a `HOLD`; permission errors are not treated as absence. The
inspection never repairs state, deletes stale markers, starts/stops a process,
or creates/migrates either SQLite database. Approval-only RunFlow snapshots and
the pending flow/event-dispatch queues do not claim an execution and are not
active-execution authorities; the event/handle logs become relevant at
`START_REQUESTED`.

### Stable decision envelope

The read-only `inspectActiveExecutions(projectRoot)` export and direct clean
entrypoint use this versioned projection:

```json
{
  "schemaVersion": 1,
  "authority": "deckent.clean.active-execution.v1",
  "decision": "ALLOW",
  "code": "CLEAN_ACTIVE_EXECUTION_CLEAR",
  "projectRootDigest": "<sha256(realpath(projectRoot))>",
  "reasons": [],
  "projections": [],
  "inspected": {
    "taskFiles": 0,
    "heartbeatFiles": 0,
    "workerPidFiles": 0,
    "sprintPidFiles": 0,
    "processEntries": 0,
    "receiptRows": 0,
    "jobFiles": 0,
    "runFlowFiles": 0,
    "missionRows": 0
  }
}
```

A refusal has `decision: "HOLD"` and top-level code
`E_CLEAN_ACTIVE_EXECUTION_HOLD`. Each reason has a stable `code`, `surface`,
`subject`, optional `observedStatus`/`detailCode`, and project-relative
`evidenceRefs`. Reason and projection arrays are deterministically ordered.
The envelope is output-bounded to 256 reasons and 512 projections; exceeding
either bound produces a typed fail-closed limit reason instead of an unbounded
payload.
Direct successful clean emits `CLEAN_COMPLETED` and embeds the admission
envelope; direct refusal emits the HOLD envelope to stderr and exits non-zero.

Representative reason families:

| Family | Meaning |
|---|---|
| `E_CLEAN_TASK_*` | Raw task is active, invalid, receipt-less, non-terminal, ambiguous, or conflicts with disk artifacts |
| `E_CLEAN_RECEIPT_*` | Receipt DB/binding/schema/integrity/evidence bound is unavailable or invalid |
| `E_CLEAN_WORKER_*` | Heartbeat/PID says active or cannot be interpreted safely |
| `E_CLEAN_SPRINT_*` | Lifecycle state, marker, MCP launch anchor, or coordinator is active/stale/ambiguous |
| `E_CLEAN_PROCESS_*` | Autonomous/process backlog is running, invalid, or cannot be located safely |
| `E_CLEAN_RUN_JOB_*` | Mixed job record is malformed or a fresh RUNNING launch cannot yet be reconciled |
| `E_CLEAN_RUN_FLOW_*` | Canonical event fold/handle is invalid, starting, live, or liveness is unknown |
| `E_CLEAN_MISSION_*` | Mission v2 work/lease is active, incoherent, unreadable, or unsupported |
| `E_CLEAN_BOT_*` | Bot PID is alive or cannot be interpreted safely |

### Raw-to-effective task status projection

Raw `DRAFT`, `DONE`, and `NO_GO` task files do not by themselves represent a
live execution. `CLAIMED`, `EXECUTING`, `TESTING`, `DOCUMENTING`, `PAUSED`, and
`MANUAL_REVIEW_REQUIRED` are resumable/active and therefore HOLD.

A raw `PENDING` task remains HOLD unless the invocation ledger proves the
canonical effective status `NOT_DISPATCHED`. That projection requires all of
the following:

1. `sha256(realpath(projectRoot))` resolves to exactly one project binding and
   the reverse project binding resolves to the same root.
2. The bounded, newest-first task receipt view has a fully shaped schema-v1
   `worker-execution` receipt for the exact task and project. Its canonical
   payload JSON, persisted payload hash, IDs, timestamps, selection/backend/auth
   fields, fallback chain, reachability, and limit evidence must validate.
3. Its complete ordered event stream is exactly
   `dispatch_rejected -> consumer_settled`; sequence, canonical semantic payload
   hashes, previous hashes, and final event hash must all validate. Both events
   preserve the same canonical settlement `occurredAt`; a caller-supplied
   conflicting consumer timestamp is not a terminal settlement.
4. The consumer event is
   `outcome: "accepted"`, `taskDisposition: "not_dispatched"`, has a known
   non-`none` reason code, and carries bounded canonical evidence references.
5. Exactly one view is settled `NOT_DISPATCHED`. More than one settled view is
   ambiguous. To stay aligned with `TaskSettlementAuthority`, one settled view
   remains authoritative when another view is only a rejected, unsettled head;
   dispatch-started or transport-settled conflicts remain HOLD.
6. No heartbeat exists for the task; such an artifact contradicts a
   never-dispatched settlement.

A receipt database is not required when no raw `PENDING` task needs this
projection. A missing database or binding for such a task is fail-closed.

### Sprint/process interpretation

- A live sprint state or live coordinator PID is HOLD.
- A `.deckent/sprint-active.json` marker is correlated with the same sprint's
  active state/PID. An unbound or terminal marker is reported as a typed stale
  HOLD, not silently trusted as live and not silently discarded.
- The MCP launch anchor must carry a valid job/source/child-PID/IPC-path/time
  envelope. A live child is active; a dead child is a stale HOLD.
- `running` autonomous backlog entries are active. `pending`, `parked`, `done`,
  and `failed` entries are not by themselves active.
- A live bot PID is active. A provably dead PID is stale evidence and does not
  by itself HOLD; an invalid or unprobeable PID does.

### Job, RunFlow, and Mission v2 reconciliation

`.deckent/runtime/jobs/` has two SSOT writers and is discriminated before
validation:

- `sprint-finalizer` owns terminal `<sprintId>.json` completion summaries.
  These intentionally omit `jobId`/`startedAt`; sprint-state remains their
  lifecycle authority. A terminal `completionRecord.flowId`, when present, is
  also a RunFlow closure.
- MCP `JobState` records carry a filename-matching `jobId`, status, and
  `startedAt`. Legacy epoch-millisecond strings and current ISO timestamps are
  both recognized. The row is a polling/notification projection, not a
  process handle: a `RUNNING` row inside the 15-minute launch-race window is an
  unknown-authority HOLD; an older uncorroborated row projects to `STALE`.
  Actual task, sprint/IPC, PID, or RunFlow evidence independently decides
  whether execution is live.

RunFlow event logs are sequence- and timestamp-checked and folded with the
canonical state-machine transitions and revision/plan-digest CAS rules.
`STARTING` is active. A detached handle with a live PID is active; an unknown
probe or missing PID remains fail-closed. A provably dead PID projects to
`STALE_DEAD` and does not alone block a build. A canonical terminal event or
terminal job closure wins over an older handle, matching the user-facing
jobs-directory reconciliation. Contradictory terminal closures, invalid
transitions, and event/handle job conflicts HOLD.

Mission v2 inspection opens `autonomous.db` read-only and validates the
`missions`, `work_items`, and singleton `mission_engine_lease` schema. A
`running` work item or unexpired engine lease is active. `pending`/`parked`
work is queued, while `done`/`failed`/`blocked` is terminal. The store
deliberately retains `claimed_at`/`claimed_by` as historical audit fields after
claimed work settles, so a coherent pair on terminal work is valid; running
work without the pair, or queued work retaining a pair, is incoherent and
HOLD. Mission status `pending`/`active` alone is not execution proof.

### Surface and authority boundary

This admission is currently authoritative only for the local
`scripts/clean.mjs` → `npm run clean` → `npm run build` chain.
`GET /api/status` reconciles dashboard presentation state; it is not a build
admission endpoint. CLI/MCP status, desktop, dashboard, and remote API clients
do not currently expose or override this exact decision envelope and must not
claim that a project is build-safe. A future surface must consume the same
authority contract rather than recreate a weaker projection.

External container/tmux/process enumeration without corresponding durable
Deckent evidence is not represented as an independent cross-platform authority.
Unsupported or contradictory durable evidence is HOLD; this contract does not
invent a platform-specific “no external process exists” claim. Test
hermeticity is a separate unconditional refusal:
`DECKENT_TEST_HERMETICITY=1` returns `E_HERMETIC_DIST_CLEAN` before runtime
evidence can change that result.

---

## .tasks/ File Format (JSON)

Each task is stored as `.tasks/task-{id}.json`:
```json
{
  "id": "001-001",
  "title": "string",
  "description": "string",
  "model": "string (exact registry-validated provider API model ID)",
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
  "sprintId": "string (optional legacy adapter identity)",
  "createdAt": "ISO 8601 (optional)",
  "updatedAt": "ISO 8601 (optional)",
  "assignedWorker": "string (optional)",
  "assignedAgent": "string (optional — agent id or 'generic')",
  "assignedSkills": ["string (optional skill ids)"],
  "provider": "string (optional registered ProviderName; resolved and validated at runtime)",
  "forceModel": "string (optional exact registry model ID)",
  "forceEffort": "low | normal | high (optional — set when DIRECTIVES specifies effort)",
  "forceAgent": "string (optional — agent id override from DIRECTIVES or AI planner)",
  "forceSkills": ["string (optional skill id overrides from DIRECTIVES or AI planner)"],
  "excludeAgent": ["string (optional agent ids to exclude from routing)"],
  "excludeSkills": ["string (optional skill ids to exclude from routing)"],
  "authMode": "subscription | api (optional; credential custody is resolved by effective config and the selected provider adapter)",
  "routingMeta": {
    "taskDNA": "object (optional)",
    "confidence": "string | number (optional)",
    "routingVersion": "v2 | v3 (optional)",
    "workType": "string (optional)",
    "provenance": "string (optional)",
    "personaSlices": ["string (optional)"],
    "storySummary": "string (optional)",
    "escalation": "string (optional)",
    "rerouteCount": "number (optional)",
    "overrideWarnings": ["string (optional)"],
    "scopeDerivation": {
      "extraFiles": ["string"],
      "extraDirs": ["string"],
      "reason": "string"
    }
  },
  "type": "TaskKind (optional — WM-2a per-task kind override)",
  "backend": "docker | tmux | subprocess (optional registered execution backend override)",
  "modelEffort": "string (optional; validated against selected provider/model capability)",
  "fixMode": "verify-only | amend | re-implement (optional)",
  "smoke": "{ command: string; expect: string } (optional Tier-1 proof-of-function directive, ADR-G-009)",
  "actor": "ActorContext (optional)",
  "budget": "ExecutionBudget (optional durable per-task ceiling)",
  "budgetPolicy": "TaskExecutionBudgetPolicySnapshot (optional plan-time provenance; never an execution permit)"
}
```

The normative field types are `Task`, `TaskExecutionBudgetPolicySnapshot`, and their imported
work-model types in `src/core/task-types.ts`. Model/provider values are runtime-registry data and
must not be copied into this document as a static catalog.

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
    "cacheCreationTokens": 1200,
    "provider": "registered-provider-id",
    "model": "exact-provider-api-model-id"
  },
  "cost": {
    "usd": 0.042,
    "currency": "USD",
    "pricingSource": "runtime-pricing-source",
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
    "outcome": "confirmed | refuted | unclear",
    "verifier": "registered provider different from the producer provider",
    "verifierModel": "exact provider API model ID",
    "verdict": "confirmed | refuted | unclear",
    "reason": "string",
    "execution": "CrossVerifyExecutionEvidence (optional)",
    "eligibility": "CrossVerifyEligibilityEvidence (optional)",
    "invocationReceiptRef": "InvocationReceiptRef (optional)",
    "assurance": "typed-host-adjudicated (optional)",
    "adjudicationReceiptRef": "string (optional)"
  }
}
```

**Note on `rubricScores` field:**

- **Deprecated since Sprint 146.** Worker self-reported scores were removed in favour of the Quality Assessor (`assessQuality()` in `quality-assessor.ts`). The field is retained in the interface for backward compatibility with existing result files — do not populate it in new workers.

**Note on `crossVerify` field:**

- `crossVerify` is the typed `CrossVerifyEvidence` union on `TaskResult`
  (`src/core/task-types.ts`). A completed verifier carries semantic outcome plus optional
  host-observed execution, eligibility, invocation, and adjudication evidence. When independent
  verification cannot be admitted, the typed variant is `{ outcome: "unavailable", reason, ... }`;
  Deckent does not self-verify or silently fall back to the producer provider.
- This field is durable evidence, not a worker-issued final verdict. Host/Brain evaluation remains
  the task decision authority and applies the configured cross-provider policy.

**Note on `sharedNotes` field:**

- **When present:** Only written to `.result` when `config.worker_comms?.enabled: true`. Workers can populate this array with structured notes to share with other workers in the same sprint.
- **When absent:** Omitted from the result entirely if worker communications is disabled or no notes were generated.
- **Format:** Array of objects with `key` (string identifier) and `value` (content string). Keys should be descriptive and unique within the task.
- **Usage:** Other workers read these notes from `SharedMemory` when executing dependent tasks, providing cross-worker context without explicit handoff channels.

**Note on `handoffNotes` field:**

- **When present:** Only written to `.result` when `config.worker_comms?.enabled: true` and the task has dependents. Workers can populate this with a free-text message for downstream tasks.
- **When absent:** Omitted from the result entirely if worker communications is disabled or no handoff message was generated.
- **Usage:** When the sprint controller creates a handoff from this task to dependent tasks, the `handoffNotes` are included in the handoff record and injected into dependent workers' prompts under the "Upstream Handoffs" section.

## Sprint Phases

Sprint lifecycle phases — canonical values from `SprintPhase` enum (`src/core/sprint-types.ts`):

1. **DIRECTIVE** — Initial directive-reading phase before planning
2. **PLAN** — Brain reads DIRECTIVES, plans tasks, writes task JSON files
3. **SPAWN** — Workers spawned via the admitted execution backend; auditor scan loop starts. When dependency-pipeline policy is enabled (ADR-G-026), tasks are sorted into dependency waves via Kahn's topological algorithm and each wave executes before subsequent waves unblock.
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
- `exports/summary.md`: Auto-generated context/status projection (read on demand; not runtime authority)
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
- Legacy project-identity export: **Removed** — superseded by `.deckent/workspace/IDENTITY.md` under ADR-G-015. Identity knowledge remains in `memory.db` (decay_exempt).
- `sprints/sprint-NNN.md`: Sprint logs (in DB + file)

## doc_tracking Table (ADR-G-015)

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

### Doc-Tracking Faz 2 surfaces (ADR-G-015)

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

Host-side validation returns the first violation:
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

## Module Import Rules (ADR-D-004)

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
