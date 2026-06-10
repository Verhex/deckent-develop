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
  "status": "DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED",
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
    "routingVersion": "v1 | v2 (optional — routing engine version used)"
  }
}
```

## Result File Format

Each completed task writes `.tasks/task-{id}.result`:
```json
{
  "taskId": "001-001",
  "filesChanged": ["src/file.ts", "tests/file.test.ts"],
  "linesAdded": 120,
  "linesRemoved": 30,
  "testsPassed": true,
  "coverage": 95.2,
  "selfAssessment": "DONE | GO_WITH_TECH_DEBT | NO_GO",
  "notes": "Brief summary of what was done",
  "tokenUsage": {
    "inputTokens": 15420,
    "outputTokens": 3200,
    "cacheReadTokens": 89000,
    "provider": "claude",
    "model": "opus"
  },
  "rubricScores": {
    "correctness": 90,
    "test_coverage": 85,
    "scope_compliance": 100,
    "documentation": 70
  },
  "evaluationDecision": "DONE | GO_WITH_TECH_DEBT | NO_GO",
  "crossVerify": {
    "verifier": "string (provider name that performed the verification)",
    "verdict": "refuted | confirmed | unclear (adversarial verification outcome)",
    "reason": "string (explanation of the verdict)"
  }
}
```

**Note on `crossVerify` field:**

- **When present:** Only written to `.result` when `config.cross_verify.enabled: true` AND the task was high-stakes (or any task if `high_stakes_only: false`) AND a verifier provider was available.
- **When absent:** Omitted from the result entirely if cross-verify is disabled or verification was skipped.
- **Verdict meanings:**
  - `refuted` — The verifier found issues with the task result; advisory warning that the task may need review.
  - `confirmed` — The verifier independently validated the task result; advisory confirmation.
  - `unclear` — The verifier output was inconclusive or uninterpretable; no strong signal either way.
- **Impact on decision:** The `crossVerify` field is advisory only. Task `selfAssessment` and `evaluationDecision` are NOT downgraded based on this field. Human/Brain review decides next steps (FIX retry, approval, or acceptance as-is).

## Sprint Phases

Sprint lifecycle follows these phases in order:
1. **PLAN** — Brain reads DIRECTIVES, plans tasks, writes task JSON files
2. **SPAWN** — Workers spawned via tmux or subprocess, auditor scan loop starts
2a. **WAVE_BUILD** — When `dependency_pipeline_enabled: true` (`config.ts:600` default `true`; added Sprint 156, confirmed Sprint 169 H5 per ADR-045; deckent-dev project overrides to `false` via `.deckent/config.json` — Brain manages waves manually per ADR-047), tasks are sorted into dependency waves via Kahn's topological algorithm; each wave runs in parallel, subsequent waves unblock only after all blocking tasks reach DONE. ADR-045.
3. **EXECUTE** — Workers execute tasks, write heartbeats (.hb files)
4. **EVALUATE** — Brain waits for results, evaluates (GO/NO-GO/TECH_DEBT)
5. **FIX** — Failed tasks retried (optional, configurable timeout)
6. **RETRO** — Retrospective written to the memory.db `retro` entry
7. **DECAY** — Memory trimmed if .brain/ exceeds budget
8. **CLEANUP** — Task files archived, locks released, sprint complete

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
      "kind": "task | sprint | capability",
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
      "lastResult": "{ ok: boolean, reason: string } | null"
    }
  ]
}
```

### Validation Rules (`validateBacklogEntry`)

Hand-written validation (ADR-010, no schema dependency) — returns the first violation:
- `id` and `title` must be non-empty strings
- `kind` ∈ `task | sprint | capability`; `policy` ∈ `auto | approval-required | risk-tagged`; `status` ∈ valid set
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
