# META — Security + Performance Analysis
**Task ID:** 142-044 | **Model:** opus | **Effort:** max | **Analyst:** security-auditor

---

# PART 1: SECURITY ANALYSIS

## Executive Summary

The Deckent codebase demonstrates **strong cryptographic practices** (AES-256-GCM, timing-safe token comparison) and **good credential hygiene** (no hardcoded secrets, proper .gitignore). However, several architectural security gaps exist: shell injection in tmux spawn, path traversal in MCP tools, soft-enforced RBAC, and API auth disabled by default.

**Overall Security Score: 68/100**

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Shell injection (tmux), Path traversal (checkpoint, docs) |
| HIGH | 5 | Soft RBAC, API auth default-off, ADR-038 privilege escalation, unvalidated taskId, IPC no integrity |
| MEDIUM | 8 | CORS, missing headers, SSRF webhooks, brute force, SHA-1 cache, plugin signatures, debug mode, token lifecycle |
| LOW | 6 | Lock file race, error path disclosure, rate limit spoofing, heartbeat exec, directive injection, keyring chmod |
| INFO/GOOD | 12 | AES-256-GCM ✓, timingSafeEqual ✓, secret redaction ✓, telemetry off ✓, etc. |

---

## 1. SQL Injection Analysis (A03: Injection)

### 1.1 better-sqlite3 Parameterization Status

**Verdict: FUNCTIONALLY SAFE — all user data is parameterized.**

The primary DB layer (`memory-store.ts`, `memory-query.ts`) uses better-sqlite3's parameter binding consistently. However, 8 instances of SQL string interpolation exist as a code quality anti-pattern.

#### Safe Patterns (All user data properly parameterized):
| File | Lines | Pattern | Verdict |
|------|-------|---------|---------|
| `src/core/memory-store.ts` | 175-177 | `WHERE name=?` + `.get(name)` | SAFE |
| `src/core/memory-store.ts` | 208-210 | `WHERE name=?` + `.get(name)` | SAFE |
| `src/core/memory-store.ts` | 249-251 | `WHERE version = ?` + `.get(SCHEMA_VERSION)` | SAFE |
| `src/core/memory-store.ts` | 253-255 | `VALUES (?, datetime('now'))` + `.run(SCHEMA_VERSION)` | SAFE |
| `src/core/memory-store.ts` | 280-292 | Named params `@id, @type, @source` + `.run({id, type, ...})` | SAFE |
| `src/core/memory-store.ts` | 294-296 | `VALUES (?, ?)` + `.run(id, tag)` | SAFE |
| `src/core/memory-store.ts` | 298-300 | `VALUES (?, ?, ?)` + `.run(id, to_id, rel_type)` | SAFE |
| `src/core/memory-store.ts` | 302-305 | `VALUES (?, ?, ?, ?, ?, ?)` | SAFE |
| `src/core/memory-store.ts` | 345-347 | `WHERE id = ?` + `.get(id)` | SAFE |
| `src/core/memory-store.ts` | 468-471 | `WHERE id = ?` conditional SQL | SAFE |
| `src/core/memory-store.ts` | 476-478 | `WHERE type = ?` + `.all(type)` | SAFE |
| `src/core/memory-store.ts` | 485-487 | `WHERE entry_id = ?` | SAFE |
| `src/core/memory-store.ts` | 506-514 | `WHERE from_id = ?` / `WHERE to_id = ?` | SAFE |
| `src/core/memory-store.ts` | 520-522 | `WHERE entry_id = ?` | SAFE |
| `src/core/memory-store.ts` | 529-548 | `WHERE id = ?` updates | SAFE |
| `src/core/memory-store.ts` | 557-562 | `WHERE sprint_num < ?` decay | SAFE |
| `src/core/memory-query.ts` | 200-204 | Named params `@fts_query, @limit` | SAFE |
| `src/core/memory-query.ts` | 241-245 | Named params with binds | SAFE |

#### String Interpolation Anti-Pattern (Code Quality, Not Vulnerability):
| File | Line | Issue | Risk |
|------|------|-------|------|
| `src/core/memory-store.ts` | 491-499 | `WHERE t.tag IN (${placeholders})` — placeholders are literal `?` | MINIMAL |
| `src/core/memory-query.ts` | 174-177 | FTS5 MATCH `${escaped}` — escaped then parameterized as `@fts_query` | LOW |
| `src/core/memory-query.ts` | 268-270 | `IN (${placeholders})` — placeholders are `@type_0, @type_1` | MINIMAL |
| `src/core/memory-query.ts` | 277-279 | `IN (${placeholders})` — source filter | MINIMAL |
| `src/core/memory-query.ts` | 286-288 | `IN (${placeholders})` — status filter | MINIMAL |
| `src/core/memory-query.ts` | 313-328 | `IN (${tagPlaceholders})` — tags filter | MINIMAL |
| `src/core/memory-query.ts` | 340-357 | `IN (${tagPlaceholders})` — standalone tags | MINIMAL |

**Note:** While these interpolations use internally-generated placeholder names (not user input), the pattern violates the principle of never interpolating into SQL strings. The `escapeFts5Query()` function at `memory-query.ts:25-40` wraps tokens in double quotes and removes dangerous FTS5 operators — this is adequate but should be documented.

#### DDL Statements (Static, No User Input):
- `memory-store.ts:89` — `CREATE TABLE IF NOT EXISTS schema_version`
- `memory-store.ts:147-156` — `CREATE INDEX IF NOT EXISTS` (9 indexes)
- `memory-store.ts:214-244` — `CREATE TRIGGER` (3 FTS5 triggers)

All DDL is static string — no user input involved.

---

## 2. Input Validation Analysis

### 2.1 HTTP API (`src/api/`)

#### CRITICAL: Shell Injection via Unsanitized taskId
- **File:** `src/orchestra/tmux.ts:113-123`
- **Severity:** CRITICAL
- **Issue:** `buildWorkerCommand()` constructs shell commands with `taskId` and file paths embedded via template literals. The `taskId` is interpolated into a JSON string that becomes part of a shell trap command.
- **Attack Vector:** A crafted taskId like `$(malicious-command)` would be embedded in `fallbackJson` via `JSON.stringify()`, then inserted into the shell trap at line 122.
- **Code:**
  ```typescript
  const resultFile = join(tasksDir, `task-${taskId}.result`);
  const fallbackJson = JSON.stringify({
    taskId, workerId: `w-${taskId}`, filesChanged: [], ...
  });
  const trap = `RFILE=${resultFile}; trap '[ -f $RFILE ] || echo '"'"'${fallbackJson}'"'"' > $RFILE' EXIT`;
  ```
- **Mitigation:** Validate taskId against `/^[\w-]+$/` regex before shell interpolation.

#### CRITICAL: Path Traversal in MCP Checkpoint Tool
- **File:** `src/mcp/tools/checkpoint.ts:50-52`
- **Severity:** CRITICAL
- **Issue:** `sprintId` and `phase` parameters are interpolated into file paths without boundary validation.
- **Code:**
  ```typescript
  const filePath = join(dir, `checkpoint-${sprintId}-${phase}.json`);
  // No check: resolve(filePath).startsWith(resolve(dir))
  ```
- **Attack:** `sprintId="../../.env"` escapes the checkpoints directory.

#### CRITICAL: Path Traversal in MCP Docs Tool
- **File:** `src/mcp/tools/docs.ts:108-114`
- **Severity:** CRITICAL
- **Issue:** `file` parameter used with `join(root, file)` without path containment check.
- **Attack:** `file="../../../etc/passwd"` accesses files outside project root.

#### HIGH: Unvalidated taskId in API Endpoint
- **File:** `src/api/server.ts:408-415`
- **Severity:** HIGH
- **Issue:** `GET /api/worker/:taskId/log` extracts taskId from URL without `WORKER_ID_RE` validation, unlike the `/api/kill/:workerId` endpoint (line 559) which does validate.
- **Code:**
  ```typescript
  const taskId = url.slice('/api/worker/'.length, -'/log'.length);
  if (!taskId) { sendError(res, 400, 'Missing taskId'); return; }
  // No WORKER_ID_RE.test(taskId) — inconsistent with /api/kill
  const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  ```

#### MEDIUM: Missing Security Headers
- **File:** `src/api/server.ts` (response handlers)
- **Severity:** MEDIUM
- **Missing:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`

#### MEDIUM: Permissive CORS
- **File:** `src/api/server.ts:279-282`
- **Severity:** MEDIUM
- **Issue:** Accepts any `http://localhost:*` or `http://127.0.0.1:*` origin, reflecting it back. Could allow CSRF from other localhost ports.

#### MEDIUM: taskId Validation Inconsistency
- **File:** `src/api/server.ts:410 vs 559`
- **Severity:** MEDIUM
- **Issue:** `/api/worker/:taskId/log` lacks WORKER_ID_RE validation; `/api/kill/:workerId` has it.

### 2.2 MCP Tools (`src/mcp/tools/`)

#### LOW: Directives Tool Accepts Arbitrary Content
- **File:** `src/mcp/tools/directives.ts:49-56`
- **Issue:** Zod validates `content: z.string().min(1)` but no max length or content sanitization.
- **Risk:** DoS via enormous directive files; malicious directives could confuse planning engine.

### 2.3 CLI Args (`src/cli/`)

- **Commander.js** handles type validation for declared options.
- No command injection found in CLI argument processing.
- File path arguments are generally passed to `join()` without explicit path traversal protection, but CLI runs in user context so risk is lower than MCP/API.

---

## 3. Secret Detection & Credential Exposure

### 3.1 Hardcoded Secrets: **NONE FOUND**

Extensive pattern search across entire `src/`:
- `sk_`, `pk_`, `ghp_` prefixes — 0 results
- Literal API key assignments — 0 results
- Base64-encoded secrets — 0 results
- Webhook URLs with tokens — 0 results
- Test files use dummy values: `'secret'`, `'sk-test'`, `'my-secret-token'`

### 3.2 Credential Encryption: **SECURE**

| Aspect | Status | Details |
|--------|--------|---------|
| Algorithm | ✓ AES-256-GCM | `src/core/credential-encryption.ts:23` |
| IV Generation | ✓ 12-byte random | `randomBytes(IV_BYTES)` per operation |
| Auth Tag | ✓ Verified | `decipher.setAuthTag(tag)` before decrypt |
| Master Key | ✓ 32-byte random | Stored in `~/.deckent/.keyring` with 0o600 |
| File Permissions | ✓ 0o600/0o700 | Applied to all credential files |
| Key Priority | ✓ Env > File | `DECKENT_MASTER_KEY` > `.keyring` > auto-generate |

### 3.3 Environment Variable Handling: **SECURE**

- API keys resolved via env vars only (never CLI args)
- `.deck` file in `.gitignore`
- Docker containers receive keys via `-e` flags (not logged)
- Provider priority chain: `DECKENT_*_API_KEY` > standard env vars

### 3.4 Secret Redaction in Output: **IMPLEMENTED**

- **File:** `src/cli/helpers/output.ts:65-97`
- Redacts: `sk-*` API keys, Bearer tokens, password URLs, environment variable values
- Applied consistently across output helpers

### 3.5 .gitignore Coverage: **COMPLETE**

| Pattern | Status |
|---------|--------|
| `.env`, `.env.*` | ✓ Ignored |
| `.deck` | ✓ Ignored |
| `*.pem`, `*.key` | ✓ Ignored |
| `credentials.json` | ✓ Ignored |
| `.brain/memory.db` | ✓ Ignored |
| `node_modules` | ✓ Ignored |
| `dist/` | ✓ Ignored |

---

## 4. Authentication & Authorization

### 4.1 HTTP API Authentication

#### Bearer Token: **SECURE**
- **File:** `src/api/auth.ts:28-52`
- Uses `timingSafeEqual()` — prevents timing attacks ✓
- Tokens hashed with SHA-256 before comparison ✓
- Generic error messages — no token leakage ✓

#### HIGH: Auth Disabled by Default
- **File:** `src/api/server.ts:741-746`
- **Issue:** If no `DECKENT_API_TOKEN` or `config.api_auth_token` is set, auth is completely bypassed.
- **Code:** `if (!token) return true;` in `checkAuth()`
- **Risk:** Default unauthenticated access to entire HTTP API.
- **Mitigation:** Warning is printed to stderr, but should fail-secure.

#### MEDIUM: No Token Lifecycle Management
- **File:** `src/api/server.ts:73-98`
- Tokens are permanent (no expiration)
- No refresh token rotation
- No revocation mechanism
- No token binding to user/client

#### MEDIUM: No Brute Force Protection by Default
- **File:** `src/api/server.ts:270-277`
- Rate limiter is optional (disabled if `rateLimitMax = 0`)
- Default: 100 requests/minute — allows ~1.67 attempts/second
- No progressive delay or account lockout

### 4.2 RBAC (Authority Enforcer)

#### HIGH: Soft Enforcement Mode
- **File:** `src/orchestra/authority-enforcer.ts:5-7, 239-249`
- **Issue:** RBAC violations are logged as warnings only — never block actions.
- **Code:** Sprint 139 comment: "Soft enforcement mode — violations are logged but DO NOT block."
- **Plan:** Hard enforcement planned for Sprint 140+ (not yet implemented).

#### HIGH: ADR-038 Self-Modifying Sprint Privilege Escalation
- **File:** `src/orchestra/authority-enforcer.ts:294-304`
- **Issue:** When `isSelfModifyingSprint=true`, workers can write to any `src/**` path regardless of assigned scope.
- **Risk:** Non-Deckent projects setting this flag bypass all scope restrictions.

---

## 5. OWASP Top 10 Compliance Summary

| OWASP | Category | Status | Key Findings |
|-------|----------|--------|-------------|
| A01 | Broken Access Control | ⚠️ HIGH | Soft RBAC, ADR-038 escalation, lock file no integrity |
| A02 | Cryptographic Failures | ✅ GOOD | AES-256-GCM correct; SHA-1 used for cache (LOW) |
| A03 | Injection | ⚠️ CRITICAL | Shell injection (tmux), Path traversal (checkpoint, docs); SQL safe |
| A04 | Insecure Design | ⚠️ HIGH | Trust boundary not enforced, IPC no integrity |
| A05 | Security Misconfiguration | ⚠️ HIGH | API auth default-off, debug mode info leak |
| A06 | Vulnerable Components | ✅ GOOD | All deps up-to-date (Apr 2026) |
| A07 | Authentication Failures | ⚠️ MEDIUM | No brute force protection, no token lifecycle |
| A08 | Data Integrity Failures | ⚠️ MEDIUM | Plugin signatures optional, task results unsigned |
| A09 | Logging Failures | ✅ GOOD | Secret redaction ✓, event stream ✓, telemetry off ✓ |
| A10 | SSRF | ⚠️ MEDIUM | Webhook URLs not validated (discord, slack, generic) |

### SSRF Detail (A10):
- **File:** `src/core/notification-providers/webhook.ts:39-67`
- **File:** `src/core/notification-providers/discord.ts:66-88`
- **File:** `src/core/notification-providers/slack.ts:44-51`
- **Issue:** User-supplied webhook URLs passed directly to `httpClient.post()` without validation.
- **Attack:** `http://169.254.169.254/latest/meta-data/` (AWS metadata), `http://localhost:3100/api/start` (self-trigger)

---

## 6. Additional Security Findings

### 6.1 IPC File-Based Communication Lacks Integrity
- **File:** `src/orchestra/ipc-registry.ts:75-115`
- Question/answer files are plain JSON with no HMAC/signature.
- A filesystem-level attacker could inject fake answers.

### 6.2 Plugin Sandbox (Positive)
- **File:** `src/core/marketplace/skill-sandbox.ts:31-168`
- Two-pass scanning: regex (fast) + TypeScript AST (accurate)
- Detects `eval()`, `Function()`, `child_process`, obfuscated patterns
- Properly blocks dangerous module imports

### 6.3 Lock File Race Condition
- **File:** `src/core/file-lock.ts:59-115`
- Between `existsSync` check and `openSync(O_EXCL)`, another process could manipulate lock.
- `O_EXCL` flag provides atomic creation guarantee — the pre-check is redundant but not harmful.

### 6.4 Telemetry: **OFF by default**
- **File:** `src/core/telemetry.ts:56`
- `TELEMETRY_ENABLED = false` — no data sent externally.
- Sanitization removes paths and email-like strings.

### 6.5 Observability: **LOCAL only**
- **File:** `src/core/observability.ts`
- "ZERO network calls" — all metrics written to local `.deckent/metrics.jsonl`
- No credential capture in error messages.

---

# PART 2: PERFORMANCE ANALYSIS

## Executive Summary

The codebase contains **1,718 synchronous I/O operations** across 179 source files. Of these, **152 (8.8%)** execute on hot paths where latency directly impacts sprint throughput. The primary bottlenecks are in the auditor scan loop (52 sync ops per cycle), worker task execution (30 ops), and sprint lifecycle transitions (37 ops).

**Overall Performance Score: 62/100**

---

## 7. Synchronous I/O Census

### 7.1 Total Counts

| Operation | Count | Hot Path | Cold Path | Primary Files |
|-----------|-------|----------|-----------|---------------|
| `existsSync` | 613 | 47 | 566 | auditor.ts (16), worker.ts (8), sprint-lifecycle.ts (10) |
| `readFileSync` | 324 | 16 | 308 | auditor.ts (5), worker.ts (5), sprint-lifecycle.ts (3) |
| `writeFileSync` | 228 | 24 | 204 | worker.ts (10), sprint-lifecycle.ts (7), auditor.ts (4) |
| `readdirSync` | 167 | 26 | 141 | auditor.ts (10), sprint-lifecycle.ts (6), cleanup.ts (5) |
| `mkdirSync` | 139 | 8 | 131 | sprint-lifecycle.ts (3), heartbeat-daemon.ts (3) |
| `spawnSync` | 102 | 9 | 93 | auditor.ts (9) — Docker/tmux/git checks |
| `unlinkSync` | 73 | 15 | 58 | sprint-lifecycle.ts (8), heartbeat-daemon.ts (5) |
| `statSync` | 25 | 2 | 23 | auditor.ts (2) — heartbeat age check |
| `renameSync` | 11 | 5 | 6 | worker.ts (3) — atomic writes, auditor.ts (2) |
| `copyFileSync` | 9 | 0 | 9 | Retro archival, test setup |
| `rmSync` | 26 | 0 | 26 | Skill removal, agent retirement |
| `accessSync` | 1 | 0 | 1 | doctor.ts:794 — write permission check |
| **TOTAL** | **1,718** | **152** | **1,566** | |

### 7.2 Hot Path Breakdown by File

| File | Total Sync I/O | Criticality |
|------|---------------|-------------|
| `src/monitor/auditor.ts` | **52** | EXTREME — runs on every 30-second scan cycle |
| `src/orchestra/sprint-lifecycle.ts` | **37** | HIGH — sprint transitions |
| `src/agents/worker.ts` | **30** | HIGH — task execution critical path |
| `src/orchestra/heartbeat-daemon.ts` | **19** | HIGH — heartbeat read/cleanup loop |
| `src/mcp/tools/kill.ts` | **14** | MEDIUM — worker kill operations |
| `src/mcp/tools/cleanup.ts` | **13** | MEDIUM — sprint cleanup |

---

## 8. Hot Path Analysis

### 8.1 TIER 1 — EXTREME IMPACT (Loop-bound, synchronous latency cascades)

#### Auditor Scan Loop (`src/monitor/auditor.ts`)
- **52 sync I/O operations** per scan cycle (runs every 30 seconds)
- `readdirSync` × 10: Scans `.tasks/`, `.locks/`, heartbeat directories
- `existsSync` × 16: Checks task files, heartbeat files, lock files
- `readFileSync` × 5: Reads task JSON, heartbeat files
- `spawnSync` × 9: Docker health, tmux session detection, git diff, test runs
- `writeFileSync` × 4: Dashboard state, alert files
- **Impact:** On a sprint with 48 tasks, the auditor could spend 200-500ms per scan cycle on disk I/O alone.

#### Worker Task Execution (`src/agents/worker.ts`)
- **30 sync I/O operations** per task
- `writeFileSync` × 10: Plan file, heartbeat updates, result file, task state
- `existsSync` × 8: Lock checks, file existence, scope validation
- `readFileSync` × 5: Task JSON, lock files, existing content
- `renameSync` × 3: Atomic result writes (temp → final)
- **Impact:** Each worker blocks its thread during file operations. With 6 concurrent workers, contention on `.tasks/` directory is likely.

#### Sprint Lifecycle (`src/orchestra/sprint-lifecycle.ts`)
- **37 sync I/O operations** per sprint transition
- `existsSync` × 10: Phase completion checks
- `unlinkSync` × 8: Heartbeat/lock/temp file cleanup
- `writeFileSync` × 7: Sprint state updates
- `readdirSync` × 6: Directory scans for cleanup
- **Impact:** Sprint phase transitions (EVALUATE→FIX→RETRO→CLEANUP) accumulate 50-200ms of sync I/O.

### 8.2 TIER 2 — HIGH IMPACT (Conditional bottlenecks)

#### Heartbeat Daemon (`src/orchestra/heartbeat-daemon.ts`)
- **19 sync I/O operations** per heartbeat cycle
- `existsSync` × 5: PID file, heartbeat file, daemon state
- `unlinkSync` × 5: Stale heartbeat cleanup
- `writeFileSync` × 3: Heartbeat updates
- `readFileSync` × 3: Heartbeat content parsing
- `mkdirSync` × 3: Directory initialization
- **Impact:** Heartbeat daemon runs in-process; sync I/O blocks the event loop.

#### spawnSync on Auditor Hot Path
- **File:** `src/monitor/auditor.ts:109,120,386,1230,1251,1319`
- `spawnSync('docker', ...)` — Docker container health check
- `spawnSync('tmux', ...)` — tmux session detection
- `spawnSync('git', ...)` — git diff for boundary violations
- **Impact:** Each `spawnSync` call blocks for 50-500ms depending on subprocess startup time. 9 calls per cycle = 450ms-4.5s worst case.

### 8.3 TIER 3 — MODERATE IMPACT (Once-per-sprint operations)

- Sprint cleanup `unlinkSync` × 8 in `sprint-lifecycle.ts` — happens once per sprint
- Archive operations (`copyFileSync`, `renameSync`) — cold path
- Configuration loading (`readFileSync` in `config.ts`) — startup only
- MCP tool handlers — per-request, user-initiated

---

## 9. Performance Anti-Patterns

### 9.1 Redundant existsSync Before Read/Write
Multiple locations follow this pattern:
```typescript
if (existsSync(path)) {
  const content = readFileSync(path, 'utf-8');
  // ...
}
```
**Impact:** Two syscalls instead of one. Should use try/catch on readFileSync instead.

**Locations (hot path only):**
- `src/monitor/auditor.ts:177, 224, 258`
- `src/agents/worker.ts:81, 297, 351`
- `src/orchestra/sprint-lifecycle.ts:149, 160`
- `src/orchestra/heartbeat-daemon.ts:74, 201`

### 9.2 Repeated readdirSync in Same Cycle
The auditor scans the same directories multiple times per cycle:
- `.tasks/` scanned at lines 262, 459, 665
- `.locks/` scanned at lines 711, 817
- **Fix:** Cache directory listing for duration of one scan cycle.

### 9.3 spawnSync for Process Detection
Using `spawnSync` to check if tmux/docker processes are alive:
- `src/monitor/auditor.ts:109` — `spawnSync('tmux', ['has-session'])`
- `src/monitor/auditor.ts:120` — `spawnSync('docker', ['inspect'])`
- **Fix:** Use process signals or file-based health checks instead.

### 9.4 Atomic Write Pattern (Correct but Blocking)
Worker uses `renameSync` for atomic writes — this is correct for durability but blocks the thread:
- `src/agents/worker.ts:279` — result file
- `src/orchestra/sprint-pid-manager.ts:54` — PID file
- **Recommendation:** These are correct uses; async alternatives would sacrifice atomicity guarantees.

---

## 10. Performance Recommendations

### P0 — Critical (Sprint Throughput Impact)
1. **Batch auditor readdirSync calls** — Single directory scan per cycle, cache results
2. **Replace spawnSync with async spawn in auditor** — 9 subprocess calls blocking 30-second scan cycle
3. **Add directory listing cache** (100ms TTL) for `.tasks/` and `.locks/`

### P1 — High Priority
4. **Remove redundant existsSync** before readFileSync — use try/catch pattern
5. **Make heartbeat daemon async** — currently blocks event loop with sync I/O
6. **Debounce worker writeFileSync** for heartbeat updates — reduce from per-file-change to 5-second intervals

### P2 — Medium Priority
7. **Async sprint cleanup** — `unlinkSync` × 8 could be `Promise.all(unlink())` × 8
8. **Lazy config reload** — `config.ts` reads multiple files on startup; cache aggressively
9. **Worker contention reduction** — Stagger worker start times to reduce `.tasks/` directory pressure

### P3 — Low Priority (Cold Path Optimization)
10. **MCP tool I/O** — Already per-request; sync acceptable
11. **CLI command I/O** — One-shot execution; sync acceptable
12. **Provider setup I/O** — One-time initialization; sync acceptable

---

## 11. Security Remediation Priority Matrix

| Priority | Issue | File | Action |
|----------|-------|------|--------|
| **P0** | Shell injection in tmux | `src/orchestra/tmux.ts:113-123` | Validate taskId regex `/^[\w-]+$/` |
| **P0** | Path traversal checkpoint | `src/mcp/tools/checkpoint.ts:50-52` | Add `resolve().startsWith()` check |
| **P0** | Path traversal docs | `src/mcp/tools/docs.ts:108-114` | Add `resolve().startsWith()` check |
| **P1** | Unvalidated taskId API | `src/api/server.ts:410` | Apply WORKER_ID_RE validation |
| **P1** | RBAC soft enforcement | `src/orchestra/authority-enforcer.ts` | Implement hard mode |
| **P1** | API auth default-off | `src/api/server.ts:741` | Require token; fail-secure |
| **P1** | ADR-038 escalation | `src/orchestra/authority-enforcer.ts:294` | Restrict to Deckent-only |
| **P2** | Missing security headers | `src/api/server.ts` | Add X-Content-Type-Options, etc. |
| **P2** | SSRF webhook URLs | `src/core/notification-providers/*.ts` | URL allowlist/blocklist |
| **P2** | Permissive CORS | `src/api/server.ts:279` | Restrict to exact origins |
| **P2** | No brute force protection | `src/api/server.ts:270` | Enable rate limiting by default |
| **P2** | SHA-1 cache hash | `src/orchestra/managed-docs/doc-cache.ts:26` | Replace with SHA-256 |
| **P3** | IPC no integrity | `src/orchestra/ipc-registry.ts` | Add HMAC to IPC files |
| **P3** | Plugin signatures optional | `src/core/plugin-loader.ts:129` | Require by default |
| **P3** | Token lifecycle | `src/api/server.ts` | Add expiration, rotation |
| **P3** | Error path disclosure | `src/api/server.ts` multiple | Sanitize error messages |

---

## 12. Positive Security Findings (What's Done Right)

| Area | Finding | Status |
|------|---------|--------|
| Credential Encryption | AES-256-GCM with proper IV/tag/key | ✅ EXCELLENT |
| Token Comparison | SHA-256 + timingSafeEqual | ✅ EXCELLENT |
| Secret Redaction | CLI output redacts API keys, Bearer tokens, passwords | ✅ GOOD |
| Telemetry | OFF by default, local-only observability | ✅ EXCELLENT |
| .gitignore | Complete coverage of secrets, DB, env files | ✅ GOOD |
| Dependency Versions | All current as of Apr 2026, no known CVEs | ✅ GOOD |
| SQL Parameterization | All user data properly parameterized in better-sqlite3 | ✅ GOOD |
| Skill Sandbox | Two-pass AST scanning blocks dangerous code | ✅ GOOD |
| File Permissions | 0o600/0o700 on credentials and keyring | ✅ GOOD |
| Event Logging | Authority violations logged to event stream | ✅ GOOD |
| Output Sanitization | Debug logs don't include credential values | ✅ GOOD |
| Hardcoded Secrets | ZERO found across entire src/ | ✅ EXCELLENT |

---

## Verdict: ANALYZED

**Security Risk Level:** MODERATE — Strong crypto and credential handling, but input validation gaps (shell injection, path traversal) and architectural weaknesses (soft RBAC, auth default-off) need remediation.

**Performance Risk Level:** MODERATE — 1,718 sync I/O operations (152 on hot paths). Auditor scan cycle is the primary bottleneck with 52 sync ops including 9 spawnSync calls. Sprint throughput is limited by blocking I/O in worker execution and lifecycle transitions.

**Sprint 142+ Recommendations:**
1. Fix 3 CRITICAL security issues (shell injection, 2× path traversal) — estimated 2 tasks
2. Implement hard RBAC enforcement — 1 task
3. Batch auditor I/O and replace spawnSync — 2 tasks
4. Add security headers + CORS hardening — 1 task
5. SSRF protection for webhook dispatchers — 1 task
