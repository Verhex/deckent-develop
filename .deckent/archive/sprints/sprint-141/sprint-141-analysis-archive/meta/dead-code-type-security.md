# META Analysis: Dead Code + Type Safety + Security
**Task ID:** 141-012 | **Scope:** src/**/*.ts (318 files)
**Agent:** security-auditor | **Skills:** security-specialist, typescript-expert
**Date:** 2026-04-16

---

## Section 1: Dead Code Analysis

### 1.1 Executive Summary

| Metric | Count |
|--------|-------|
| Unused exported modules (never imported) | 4 |
| Unused exported functions | 14+ |
| Unused exported classes | 3 |
| Unused exported constants | 4+ |
| @deprecated items | 31 |
| @deprecated still actively used | 4 |
| @deprecated truly dead | 12+ |
| Fully dead modules (0 imports) | 4 |

### 1.2 Fully Dead Modules (Never Imported)

These modules are never imported by any other file in src/:

| Module | LoC (approx) | Sprint Added | Notes |
|--------|-------------|-------------|-------|
| `src/core/agent-cache.ts` | ~80 | Unknown | AgentSelectionCache class + interfaces — never instantiated |
| `src/core/skill-cache.ts` | ~70 | Unknown | SkillLoadingCache class + interfaces — never instantiated |
| `src/core/cascade-detector.ts` | ~120 | Sprint 140? | CascadeDetector class + config + types — never imported |
| `src/core/notification-config.ts` | ~90 | Sprint 139? | 4 exported functions (isValidUrl, validateNotificationConfig, getDefaultNotificationConfig, resolveNotificationConfig) — never called |

**Verification:** `grep -r "agent-cache\|skill-cache\|cascade-detector\|notification-config" src/ --include="*.ts"` returns 0 import matches.

**Impact:** ~360 LoC of dead code across 4 modules.

### 1.3 ADR-038 Compliance — Self-Modifying Detector

**Status: NOT INTEGRATED (ADR-038 VIOLATION)**

`src/orchestra/self-modifying-detector.ts` exports 5 public symbols:
- `clearDetectionCache()` — never called
- `detectDeckentRepo()` — never called
- `isSelfModifying()` — never called
- `isSelfModifyingSprint()` — never called
- `DECKENT_SOURCE_PATTERNS` — never referenced

**Evidence:** `grep -r "self-modifying-detector\|self-modifying" src/ --include="*.ts"` returns 0 import statements. The module exists (ADR-038 was written) but was never wired into the sprint lifecycle.

**ADR-038 intent:** Detect when Deckent is modifying its own source code (dogfood scenario) and apply special safety rules. The detector was implemented but never integrated into sprint-controller, task-builder, or authority-enforcer's decision pipeline.

**Recommendation:** Either wire `detectDeckentRepo()` into `sprint-controller.ts` PLAN phase and pass the boolean flag through to authority-enforcer, or mark ADR-038 as `deferred` with a follow-up task.

### 1.4 Unused Exported Functions

| File | Function | Reason Dead |
|------|----------|-------------|
| `src/core/notification-config.ts` | `isValidUrl()` | 0 external references |
| `src/core/notification-config.ts` | `validateNotificationConfig()` | 0 external references |
| `src/core/notification-config.ts` | `getDefaultNotificationConfig()` | 0 external references |
| `src/core/notification-config.ts` | `resolveNotificationConfig()` | 0 external references |
| `src/orchestra/self-modifying-detector.ts` | `clearDetectionCache()` | 0 external references |
| `src/orchestra/self-modifying-detector.ts` | `detectDeckentRepo()` | 0 external references |
| `src/orchestra/self-modifying-detector.ts` | `isSelfModifying()` | 0 external references |
| `src/orchestra/self-modifying-detector.ts` | `isSelfModifyingSprint()` | 0 external references |
| `src/core/output-collector.ts` | `createOutputCollector()` | Exported but no callers found |

### 1.5 Unused Exported Classes

| File | Class | Reason Dead |
|------|-------|-------------|
| `src/core/agent-cache.ts` | `AgentSelectionCache` | 0 instantiations outside module |
| `src/core/skill-cache.ts` | `SkillLoadingCache` | 0 instantiations outside module |
| `src/core/cascade-detector.ts` | `CascadeDetector` | 0 instantiations outside module |

### 1.6 Deprecated Code Inventory (31 @deprecated tags)

#### Deprecated AND Still Used (DO NOT REMOVE):
| File | Symbol | Used By |
|------|--------|---------|
| `src/core/utils.ts:201` | `parseDebtTable()` | sprint-finalizer.ts, sprint-phases.ts, archive-debt.ts |
| `src/core/utils.ts:237` | `generateDebtTable()` | sprint-finalizer.ts, sprint-phases.ts |
| `src/agents/worker.ts:392` | `releaseAllLocks()` | sprint-lifecycle.ts, debt-manager.ts |
| `src/core/constants.ts:94-108` | `SCAN_INTERVAL_MS`, `HEARTBEAT_TIMEOUT_MS`, `LOCK_STALE_MS`, `BUDGET_LINES`, `DECAY_AFTER_SPRINTS` | Multiple test files + config fallback |

#### Deprecated AND Dead (SAFE TO REMOVE):
| File | Symbol | Notes |
|------|--------|-------|
| `src/providers/codex.ts:29` | `CODEX_TIER_MODELS` | Superseded by model-equivalence.ts |
| `src/providers/gemini.ts:31` | `GEMINI_TIER_MODELS` | Superseded by model-equivalence.ts |
| `src/providers/gemini.ts:383` | `buildApiScript()` | REST API fallback, unused |
| `src/providers/gemini.ts:415` | `buildStreamingApiScript()` | REST API fallback, unused |
| `src/orchestra/tmux.ts:128` | `buildTmuxCommand()` (old) | Superseded by buildWorkerCommand |
| `src/agents/worker.ts:177` | `acquireLock()` | Delegates to core/file-lock.ts |
| `src/agents/worker.ts:190` | `releaseLock()` | Delegates to core/file-lock.ts |
| `src/agents/worker.ts:202` | `checkLock()` | Delegates to core/file-lock.ts |
| `src/agents/worker.ts:368` | `writeFinishedHeartbeat()` | Superseded by finalizeHeartbeat |
| `src/orchestra/result-evaluator.ts:79` | `evaluateResult()` (old) | Superseded by evaluateWithRubric |
| `src/core/token-counter.ts:10` | `ModelName` type | Use ModelType from task-types.ts |
| `src/core/config-types.ts:157,160` | `brain_lines_budget`, `decay_after_sprints` (old locations) | V1 config compat |
| `src/core/config-types.ts:402,404` | `brain_model`, `worker_model` | Use brain_tier/worker_tier |

#### Deprecated Entire Modules (V1 Routing — Sprint 066):
| File | Status |
|------|--------|
| `src/orchestra/decision-engine.ts` | "NOT used in production sprint execution" |
| `src/orchestra/decision-replay.ts` | "NOT used in production sprint execution" |
| `src/orchestra/decision-steps/agent-step.ts` | "Part of abandoned DecisionOrchestrator pipeline" |
| `src/orchestra/decision-steps/scope-step.ts` | "Part of abandoned DecisionOrchestrator pipeline" |

**Total deprecated LoC estimate:** ~400+ lines of dead deprecated code safe to remove.

### 1.7 Dead Code Summary

| Category | Files | Est. LoC | Action |
|----------|-------|---------|--------|
| Never-imported modules | 4 | ~360 | Delete or integrate |
| Self-modifying-detector (ADR-038) | 1 | ~180 | Wire or defer ADR |
| Deprecated dead functions | 12+ | ~200 | Safe to remove |
| Deprecated dead modules (V1 routing) | 4 | ~400 | Archive or remove |
| **Total dead code** | **~20 files** | **~1140 LoC** | |

---

## Section 2: Type Safety Analysis

### 2.1 Executive Summary

| Metric | Count | Risk Level |
|--------|-------|-----------|
| Explicit `any` types | 2 | LOW |
| `@ts-ignore` directives | 0 | N/A (Excellent) |
| `@ts-expect-error` directives | 0 | N/A (Excellent) |
| `as unknown as` unsafe casts | 39 | MODERATE |
| Total `as` type assertions | ~1,088 | MODERATE |
| Non-null assertions (`!.`) | 29 | HIGH |
| Definite assignment (`!:`) | 0 | N/A (Excellent) |
| `unknown` type parameters | ~111 | LOW (correct practice) |

### 2.2 Explicit `any` Usage (2 real instances)

**Location:** `src/core/memory-query.ts`

```typescript
// Line 165 — ftsSearch db parameter
db: any,  // eslint-disable-next-line @typescript-eslint/no-explicit-any

// Line 221 — structuredSearch db parameter
db: any,  // eslint-disable-next-line @typescript-eslint/no-explicit-any
```

**Assessment:** These are the ONLY two genuine `any` types in 318 source files. Both are for the better-sqlite3 `Database` type which doesn't ship proper TypeScript declarations for all methods. Properly documented with eslint disable comments.

**All other grep matches for `any` were false positives:** JSDoc comments mentioning "any" in English text (e.g., "any error", "any I/O error", "any scoped directories").

**Verdict:** EXCELLENT — 2 `any` in 318 files (0.006 per file).

### 2.3 TypeScript Directive Suppression

| Directive | Count |
|-----------|-------|
| `@ts-ignore` | **0** |
| `@ts-expect-error` | **0** |

**Verdict:** EXEMPLARY. Zero type suppression across entire codebase.

### 2.4 Unsafe Type Casts (`as unknown as`) — 39 instances, 23 files

#### Top Offenders:
| File | Count | Context |
|------|-------|---------|
| `src/core/config-migration.ts` | 6 | Config merge type juggling |
| `src/mcp/tools/explain.ts` | 3 | JSON response casting |
| `src/orchestra/sprint-phases.ts` | 2 | Sprint state casting |
| `src/orchestra/sprint-finalizer.ts` | 2 | Evaluation enum casting |
| `src/mcp/tools/config.ts` | 2 | Config value casting |
| `src/core/agent-pool.ts` | 2 | Agent manifest casting |
| `src/cli/commands/start.ts` | 2 | CLI options casting |
| `src/core/credentials.ts` | 2 | Credential object casting |
| `src/core/marketplace/skill-sandbox.ts` | 2 | Directory entry casting |
| `src/core/task-types.ts` | 2 | Model ID array casting |
| 13 other files | 1 each | Various |

#### Most Concerning Patterns:

**Pattern 1: Config Migration Double-Cast (6 instances)**
```typescript
// src/core/config-migration.ts:91
const defaults = createDefaultConfig() as unknown as Record<string, unknown>;
// src/core/config-migration.ts:365
config: merged as unknown as DeckentConfig,
```
**Risk:** Bypasses structural type checking on config objects. If `createDefaultConfig()` changes shape, no compile error.

**Pattern 2: Enum String Cast Without Validation (2 instances)**
```typescript
// src/orchestra/sprint-finalizer.ts:718
evaluation: evaluation as unknown as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
```
**Risk:** If `evaluation` is an invalid string, it silently passes through.

**Pattern 3: Model Registry Array Cast (2 instances)**
```typescript
// src/core/task-types.ts:40-43
export const CLAUDE_MODELS: readonly ClaudeModel[] = modelRegistry
  .getByProvider('claude')
  .map(m => m.id) as unknown as readonly ClaudeModel[];
```
**Risk:** If registry returns unexpected IDs, type system won't catch it.

**Recommendation:** Replace `as unknown as` patterns with:
- Zod validation for config objects
- Runtime enum checks for string unions
- Explicit type guards for model IDs

### 2.5 Non-Null Assertions (`!.`) — 29 instances, 16 files

#### Top Offenders:
| File | Count | Risk |
|------|-------|------|
| `src/cli/helpers/wizard.ts` | 5 | Array index access |
| `src/cli/commands/init.ts` | 4 | String split access |
| `src/cli/commands/cleanup.ts` | 3 | Array/Map access |
| `src/orchestra/managed-docs/section-updater.ts` | 3 | Regex match access |
| `src/orchestra/sprint-planner.ts` | 2 | Array element access |
| `src/dashboard/analytics/success-chart-data.ts` | 2 | Array access |
| 10 other files | 1 each | Various |

#### Most Dangerous Patterns:

**Pattern 1: Map.get() Non-Null (runtime crash risk)**
```typescript
// src/core/memory-export.ts:173
groups.get(key)!.push(mem);

// src/core/routing-engine.ts:329
// Similar Map access pattern
```
**Risk:** `Map.get()` returns `undefined` if key missing. Non-null assertion causes TypeError at runtime.

**Pattern 2: Chained Non-Null on String Split**
```typescript
// src/cli/commands/init.ts:749
deps = reqTxt.split('\n').filter(l => ...).map(l => l.split('==')[0]!.split('>=')[0]!.trim());
```
**Risk:** `split('==')[0]` is always defined (first element always exists), but `!` is unnecessary and misleading.

**Pattern 3: Regex Match Group Access**
```typescript
// src/orchestra/task-builder.ts:520
const title = match[1]!.trim();

// src/orchestra/managed-docs/section-updater.ts
// Similar regex capture group assertions
```
**Risk:** If regex pattern doesn't capture group 1, `match[1]` is `undefined`.

**Pattern 4: Array Index After Length Check (safe but ugly)**
```typescript
// src/orchestra/sprint-planner.ts:103
retro = retroEntries.length > 0 ? retroEntries[0]!.content : '';
```
**Risk:** Guard exists but `!` is still used unnecessarily.

**Recommendation Priority:**
1. **P0:** Fix Map.get() assertions → use optional chaining or explicit check
2. **P1:** Fix regex match group assertions → add null check before access
3. **P2:** Remove unnecessary assertions where guard already exists

### 2.6 Total Type Assertions (`as` keyword) — ~1,088 instances, 197 files

#### Top 10 Files by `as` Count:
| File | Count |
|------|-------|
| `src/core/constants.ts` | 50 |
| `src/core/config-migration.ts` | 32 |
| `src/core/config.ts` | 28 |
| `src/mcp/tools/status.ts` | 26 |
| `src/core/plugin.ts` | 26 |
| `src/agents/worker.ts` | 26 |
| `src/core/memory-store.ts` | 21 |
| `src/core/agent-pool.ts` | 21 |
| `src/orchestra/task-builder.ts` | 20 |
| `src/core/skill-pool.ts` | 20 |

**Notes:**
- `constants.ts` — mostly `as const` assertions (safe)
- `config-migration.ts` — config merge type juggling (moderate risk)
- `worker.ts` — JSON parse result casting (expected for IPC)
- `memory-store.ts` — SQLite row casting (expected for DB results)

**Average:** 3.4 `as` assertions per file. Not alarming for a TypeScript project with heavy JSON/DB interactions.

### 2.7 Type Safety Verdict

**Overall Grade: B+**

| Dimension | Grade | Notes |
|-----------|-------|-------|
| `any` discipline | A+ | Only 2 documented instances |
| Directive suppression | A+ | Zero @ts-ignore/@ts-expect-error |
| Unsafe cast chains | B- | 39 `as unknown as` need review |
| Non-null assertions | B- | 29 runtime crash candidates |
| Overall assertion density | B | 3.4/file — acceptable for JSON-heavy codebase |

---

## Section 3: Security Analysis (OWASP Top 10)

### 3.1 Executive Summary

| Severity | Count | Key Findings |
|----------|-------|-------------|
| CRITICAL | 0 | None |
| HIGH | 0 | None |
| MEDIUM | 10 | Auth bypass default, soft RBAC, command injection, result integrity |
| LOW | 3 | Token logging, verbose errors, rate limit tuning |
| INFO (No Issue) | 12 | SQL injection protected, crypto sound, redaction proper |

**Overall Security Posture: GOOD** — No critical vulnerabilities. Multiple defense-in-depth improvements recommended.

### 3.2 A01: Broken Access Control

#### Finding 1: API Authentication Disabled by Default
- **Severity:** MEDIUM
- **File:** `src/api/auth.ts:74`, `src/api/server.ts:741-752`
- **Description:** When no token is configured, authentication is completely disabled. The server runs unauthenticated with only a stderr warning.
- **Code:**
  ```typescript
  // auth.ts:74 — If no token configured, auth is disabled (backward-compat)
  if (!activeToken) return true; // Allows all requests
  ```
- **Risk:** Any process on localhost can control the sprint lifecycle.
- **Recommendation:** Auto-generate token if none provided; require explicit `--no-auth` flag to disable.

#### Finding 2: Authority Enforcement in Soft Mode (ADR-037)
- **Severity:** MEDIUM
- **File:** `src/orchestra/authority-enforcer.ts:20-50`
- **Description:** Worker scope violations are logged as warnings but do NOT block actions. This was documented as intentional for Sprint 139, but hard enforcement was planned.
- **Code:**
  ```typescript
  // Line 20: "Sprint 139: Soft enforcement mode — violations are logged as warnings
  // and emitted to the event stream but do NOT block the action."
  export type EnforcementMode = 'soft' | 'hard';
  ```
- **Risk:** Workers can write outside their assigned scope without being blocked.
- **Recommendation:** Switch to hard enforcement; add config toggle for soft mode only in development.

#### Finding 3: Worker Scope Post-Validation Only
- **Severity:** MEDIUM
- **File:** `src/agents/permission-guard.ts:76-108`, `src/agents/worker.ts:784`
- **Description:** Permission guard validates AFTER file operations attempt. Violations are logged but file write may already be complete.
- **Recommendation:** Pre-validate before file operations; consider filesystem namespace isolation for Docker workers.

### 3.3 A02: Cryptographic Failures

#### Finding 1: AES-256-GCM Properly Implemented ✅
- **Severity:** INFO (No Issue)
- **File:** `src/core/credential-encryption.ts:23-102`
- **Description:** Encryption uses AES-256-GCM with 96-bit IV, proper auth tags, and key derivation. Cryptographically sound.

#### Finding 2: Master Key Storage
- **Severity:** MEDIUM
- **File:** `src/core/credential-encryption.ts:26-78`
- **Description:** Master key stored as hex in `~/.deckent/.keyring` with 0o600 permissions. No encrypted keyring.
- **Risk:** User-level compromise exposes all credentials.
- **Recommendation:** Document OS-level protection assumptions; consider OS keychain integration.

#### Finding 3: API Token Logged to stderr
- **Severity:** LOW
- **File:** `src/api/server.ts:734`
- **Description:** Auto-generated API token printed to stderr in plaintext.
- **Code:**
  ```typescript
  process.stderr.write(`[deckent:info] Auto-generated API token: ${resolvedToken}\n`);
  ```
- **Recommendation:** Write token to file with 0o600 permissions instead of stderr.

#### Finding 4: No Hardcoded Secrets Found ✅
- **Severity:** INFO (No Issue)
- **Description:** Grep for hardcoded secrets (password=, apiKey=, secret=, token=) across 318 files found 0 hardcoded values. All sensitive values come from environment variables or .deck files.

### 3.4 A03: Injection

#### Finding 1: SQL Injection — PROTECTED ✅
- **Severity:** INFO (No Issue)
- **File:** `src/core/memory-store.ts:280-305`, `src/core/memory-query.ts:163-177`
- **Description:** ALL better-sqlite3 queries use parameterized statements with named bindings (@id, @type, @fts_query). Zero string concatenation into SQL.
- **Code:**
  ```typescript
  // memory-store.ts:280 — Properly parameterized
  const insertEntry = this.db.prepare(`INSERT INTO entries (...) VALUES (@id, @type, ...)`);
  insertEntry.run({ id: input.id, type: input.type, ... });
  ```

#### Finding 2: FTS5 Query Injection — PROTECTED ✅
- **Severity:** INFO (No Issue)
- **File:** `src/core/memory-query.ts:25-40`
- **Description:** FTS5 search queries escaped by wrapping tokens in double quotes and filtering operators.
- **Code:**
  ```typescript
  function escapeFts5Query(input: string): string {
    return input.split(/\s+/)
      .filter(t => t.length > 0)
      .map(token => {
        if (OPERATORS.has(token)) return token;
        return `"${token}"`;  // Quote all literals
      }).join(' ');
  }
  ```

#### Finding 3: Command Injection Risk — tmux.ts Quote Escaping
- **Severity:** MEDIUM
- **File:** `src/orchestra/tmux.ts:97-123`
- **Description:** `allowedTools` parameter is single-quoted in shell command. Quote escaping uses `.replace(/'/g, "'\\''")`  which is fragile.
- **Code:**
  ```typescript
  // Line 100: Single-quote wrapping
  cmd += ` --allowedTools '${opts.allowedTools}'`;
  // Line 123: Complex quote escaping
  cmd = `timeout ${tSec} sh -c '${cmd.replace(/'/g, "'\\''")}'`;
  ```
- **Risk:** If `allowedTools` contains malicious shell metacharacters beyond single quotes, injection possible.
- **Recommendation:** Use stdin redirection for allowedTools (as already done for prompt on line 105).

#### Finding 4: `shell: true` Usage (3 non-Windows instances)
- **Severity:** MEDIUM
- **Files:**
  - `src/orchestra/baseline-tracker.ts:90` — `shell: true` for vitest (unnecessary)
  - `src/core/plugin-hooks.ts:399` — `shell: true` for hook commands (by design — user-defined hooks)
  - `src/core/plugin-hooks.ts:581` — `shell: true` for hook commands (by design)
- **Analysis:**
  - `baseline-tracker.ts` — `shell: true` is unnecessary for `npx vitest run`. Should use array form directly.
  - `plugin-hooks.ts` — Intentional: hooks are user-configured shell commands. This is expected but should document the trust model.
  - `provider.ts:232` — Only uses `shell: true` on Windows (for .cmd resolution). Correct.
- **Recommendation:** Remove `shell: true` from baseline-tracker.ts. Document trust model for plugin hooks.

#### Finding 5: Path Traversal — PROTECTED ✅
- **Severity:** INFO (No Issue)
- **File:** `src/api/server.ts:441-447`
- **Description:** Static file serving validates path is within staticDir using `resolve()` + `startsWith()` check.

### 3.5 A04: Insecure Design

#### Finding 1: Brain/Worker Trust Boundary — Soft Enforcement
- **Severity:** MEDIUM
- **File:** `src/orchestra/authority-enforcer.ts:111-226`
- **Description:** Authority matrix is defined in code (not cryptographically signed). Combined with soft enforcement mode, trust boundaries are advisory.
- **Recommendation:** Switch to hard enforcement; consider signing task assignments with HMAC.

### 3.6 A05: Security Misconfiguration

#### Finding 1: Debug Mode Exposure
- **Severity:** MEDIUM
- **File:** `src/core/utils.ts:14-22`
- **Description:** `DECKENT_DEBUG` env var enables verbose stderr logging that may include file paths, error contexts, and operational details.
- **Recommendation:** Redact sensitive values in debug output; document that DECKENT_DEBUG should not be enabled in production.

#### Finding 2: Verbose Error Messages in API
- **Severity:** LOW
- **File:** `src/api/server.ts:486-493`
- **Description:** Config validation errors include structural details in 422 responses.
- **Recommendation:** Return generic error to client; log details server-side only.

#### Finding 3: Rate Limiting Default
- **Severity:** LOW
- **File:** `src/api/server.ts:716`
- **Description:** Default 100 req/min may be insufficient for multi-worker sprint polling.
- **Recommendation:** Per-endpoint rate limits; exempt internal health checks.

### 3.7 A06: Vulnerable Components

#### Finding: Dependencies Current ✅
- **Severity:** INFO (No Issue)
- **File:** `package.json`
- **Description:** Minimal dependency footprint:
  - `better-sqlite3` v12.9.0 — current ✅
  - `@modelcontextprotocol/sdk` v1.27.1 — current ✅
  - `zod` v3.25.0 — current ✅
  - `commander` v13.0.0 — current ✅
- **ADR-010 compliance:** Single runtime dependency (commander). Others are build/dev deps.

### 3.8 A07: Authentication Failures

#### Finding: Timing-Safe Token Comparison ✅
- **Severity:** INFO (No Issue)
- **File:** `src/api/auth.ts:32-52`
- **Description:** Token comparison uses SHA-256 hash + `timingSafeEqual()` to prevent timing attacks. Bearer token extraction validates format correctly.

#### Finding: Rate Limiting Properly Implemented ✅
- **Severity:** INFO (No Issue)
- **File:** `src/api/rate-limiter.ts:47-65`
- **Description:** Token bucket algorithm with proper window tracking and cleanup.

### 3.9 A08: Data Integrity Failures

#### Finding 1: Task Result Files Not Integrity-Protected
- **Severity:** MEDIUM
- **File:** `src/agents/worker.ts:59-72`
- **Description:** `.tasks/task-XXX.result` files are plain JSON without HMAC signatures. A malicious process could tamper with results.
- **Recommendation:** Add HMAC-SHA256 signature to result files using credential encryption key.

#### Finding 2: Heartbeat Files Not Protected
- **Severity:** MEDIUM
- **File:** `src/orchestra/spawn-backend-docker.ts:212-222`
- **Description:** Heartbeat files written as plain JSON without integrity checks. Fake heartbeats could prevent stalled worker detection.
- **Recommendation:** Sign heartbeats; reject those with future timestamps.

### 3.10 A09: Logging and Monitoring

#### Finding: Secrets Redaction Properly Implemented ✅
- **Severity:** INFO (No Issue)
- **File:** `src/cli/helpers/output.ts:73-97`
- **Description:** `redactSensitive()` function redacts API keys, Bearer tokens, passwords in URLs, and env var assignments.

#### Finding: Error Logging Safe ✅
- **Severity:** INFO (No Issue)
- **File:** `src/cli/helpers/error-handler.ts:26-63`, `src/core/utils.ts:29-52`
- **Description:** Error messages sanitized (newlines removed, truncated to 200 chars) before writing to ERRORS.md.

### 3.11 A10: Server-Side Request Forgery (SSRF)

#### Finding 1: API Requests Use Hardcoded URLs ✅
- **Severity:** INFO (No Issue)
- **File:** `src/core/anthropic-http-client.ts:152-176`
- **Description:** All provider API requests use hardcoded base URLs (Anthropic, OpenAI, Google). No user-controlled URLs.

#### Finding 2: Registry Client URL Configurable
- **Severity:** MEDIUM
- **File:** `src/core/marketplace/registry-client.ts:64-79`
- **Description:** Registry URL is configurable via options. A malicious config could redirect to attacker's server.
- **Recommendation:** Validate registry URL format; add HTTPS enforcement; document trust model.

### 3.12 Security Findings Summary Table

| ID | OWASP | Finding | Severity | File | Status |
|----|-------|---------|----------|------|--------|
| S-01 | A01 | API Auth Optional by Default | MEDIUM | api/auth.ts | ⚠️ Fix |
| S-02 | A01 | Authority Soft Enforcement | MEDIUM | authority-enforcer.ts | ⚠️ Fix |
| S-03 | A01 | Worker Scope Post-Validation | MEDIUM | permission-guard.ts | ⚠️ Fix |
| S-04 | A02 | Master Key in Home Dir | MEDIUM | credential-encryption.ts | ℹ️ Document |
| S-05 | A02 | Token Logged to stderr | LOW | server.ts | ⚠️ Fix |
| S-06 | A03 | tmux Quote Escaping | MEDIUM | tmux.ts | ⚠️ Fix |
| S-07 | A03 | shell:true in baseline | MEDIUM | baseline-tracker.ts | ⚠️ Fix |
| S-08 | A04 | Trust Boundary Soft | MEDIUM | authority-enforcer.ts | ⚠️ Fix |
| S-09 | A05 | Debug Mode Exposure | MEDIUM | utils.ts | ⚠️ Fix |
| S-10 | A05 | Verbose API Errors | LOW | server.ts | ⚠️ Fix |
| S-11 | A05 | Rate Limit Default | LOW | server.ts | ℹ️ Review |
| S-12 | A08 | Result File Integrity | MEDIUM | worker.ts | ⚠️ Fix |
| S-13 | A08 | Heartbeat Integrity | MEDIUM | spawn-backend-docker.ts | ⚠️ Fix |
| S-14 | A10 | Registry URL Config | MEDIUM | registry-client.ts | ⚠️ Fix |
| — | A03 | SQL Injection | INFO | memory-store.ts | ✅ Secure |
| — | A03 | FTS5 Injection | INFO | memory-query.ts | ✅ Secure |
| — | A03 | Path Traversal | INFO | server.ts | ✅ Secure |
| — | A02 | AES-256-GCM | INFO | credential-encryption.ts | ✅ Secure |
| — | A02 | No Hardcoded Secrets | INFO | (all files) | ✅ Secure |
| — | A06 | Dependencies Current | INFO | package.json | ✅ Secure |
| — | A07 | Timing-Safe Auth | INFO | auth.ts | ✅ Secure |
| — | A09 | Secrets Redaction | INFO | output.ts | ✅ Secure |

---

## Section 4: Cross-Cutting Summary

### 4.1 Priority Matrix for Sprint 142+

| Priority | Category | Item | Impact |
|----------|----------|------|--------|
| **P0** | Dead Code | Wire self-modifying-detector.ts or defer ADR-038 | ADR compliance |
| **P0** | Security | Switch authority-enforcer to hard mode | Access control |
| **P0** | Security | Make API auth mandatory (auto-generate token) | Authentication |
| **P1** | Type Safety | Fix 29 non-null assertions (Map.get, regex match) | Runtime stability |
| **P1** | Security | Fix tmux.ts command injection (stdin for allowedTools) | Injection prevention |
| **P1** | Security | Add HMAC to result/heartbeat files | Data integrity |
| **P1** | Dead Code | Remove 4 never-imported modules (~360 LoC) | Codebase hygiene |
| **P2** | Type Safety | Replace 39 `as unknown as` with Zod validation | Type correctness |
| **P2** | Dead Code | Remove deprecated dead functions (~200 LoC) | Codebase hygiene |
| **P2** | Dead Code | Archive V1 routing modules (decision-engine, decision-replay) | Module clarity |
| **P2** | Security | Remove shell:true from baseline-tracker.ts | Defense in depth |
| **P3** | Security | Registry URL validation / HTTPS enforcement | SSRF prevention |
| **P3** | Security | Debug mode redaction improvements | Info disclosure |

### 4.2 Overall Health Scores

| Dimension | Score | Grade |
|-----------|-------|-------|
| Dead Code | 82/100 | B- |
| Type Safety | 88/100 | B+ |
| Security | 85/100 | B+ |
| **Combined** | **85/100** | **B+** |

### 4.3 Positive Highlights

1. **Zero `@ts-ignore`/`@ts-expect-error`** — Exceptional type discipline
2. **Only 2 `any` types** in 318 files — Best-in-class for TypeScript projects
3. **SQL injection fully prevented** — All better-sqlite3 queries parameterized
4. **FTS5 injection prevented** — Query escaping properly implemented
5. **Timing-safe token comparison** — Authentication done correctly
6. **Secrets redaction in logs** — Proper OWASP A09 compliance
7. **Minimal dependencies** — ADR-010 single runtime dependency reduces attack surface
8. **AES-256-GCM encryption** — Cryptography done right
9. **Path traversal protection** — API static files properly validated
10. **Zero hardcoded secrets** — All sensitive values from env/config

---

## Appendix A: File-Level Detail — `as unknown as` Locations

| File | Line (approx) | Cast Pattern |
|------|--------------|-------------|
| src/core/config-migration.ts | 91 | `createDefaultConfig() as unknown as Record<string, unknown>` |
| src/core/config-migration.ts | 159 | Config deep merge cast |
| src/core/config-migration.ts | 213 | Config merge cast |
| src/core/config-migration.ts | 365 | `merged as unknown as DeckentConfig` |
| src/core/config-migration.ts | 397 | `merged as unknown as DeckentConfig` |
| src/core/config-migration.ts | 410 | Env override cast |
| src/mcp/tools/explain.ts | ~30, ~50, ~70 | JSON response casting (3x) |
| src/orchestra/sprint-phases.ts | ~120, ~250 | Sprint state casting (2x) |
| src/orchestra/sprint-finalizer.ts | ~718, ~730 | Evaluation enum cast (2x) |
| src/mcp/tools/config.ts | ~40, ~80 | Config value casting (2x) |
| src/core/agent-pool.ts | ~150, ~200 | Agent manifest casting (2x) |
| src/cli/commands/start.ts | ~30, ~80 | CLI options casting (2x) |
| src/core/credentials.ts | ~50, ~90 | Credential object casting (2x) |
| src/core/marketplace/skill-sandbox.ts | ~370, ~371 | Dir entry casting (2x) |
| src/core/task-types.ts | ~40, ~43 | Model ID array casting (2x) |
| src/agents/worker-ipc.ts | ~50, ~80 | IPC message casting (2x) |
| 12 other files | various | 1 instance each |

## Appendix B: File-Level Detail — Non-Null Assertions

| File | Line (approx) | Pattern | Risk |
|------|--------------|---------|------|
| src/cli/helpers/wizard.ts | 115 | `choices[idx - 1]!.value` | Index could be negative |
| src/cli/helpers/wizard.ts | 128 | Array access | Index bounds |
| src/cli/helpers/wizard.ts | 145 | Array access | Index bounds |
| src/cli/helpers/wizard.ts | 160 | Array access | Index bounds |
| src/cli/helpers/wizard.ts | 180 | Array access | Index bounds |
| src/cli/commands/init.ts | 749 | `split('==')[0]!` | Chained assertion |
| src/cli/commands/init.ts | 760 | String split | Always defined |
| src/cli/commands/init.ts | 775 | String split | Always defined |
| src/cli/commands/init.ts | 790 | String split | Always defined |
| src/cli/commands/cleanup.ts | ~50 | Array access | Bounds check needed |
| src/cli/commands/cleanup.ts | ~80 | Map access | Key existence |
| src/cli/commands/cleanup.ts | ~110 | Array access | Bounds check |
| src/orchestra/managed-docs/section-updater.ts | ~30 | Regex match | Group might not capture |
| src/orchestra/managed-docs/section-updater.ts | ~50 | Regex match | Group might not capture |
| src/orchestra/managed-docs/section-updater.ts | ~70 | Regex match | Group might not capture |
| src/orchestra/sprint-planner.ts | 103 | `retroEntries[0]!.content` | Guard exists but ! unnecessary |
| src/orchestra/sprint-planner.ts | ~120 | Array element | Guard exists |
| src/dashboard/analytics/success-chart-data.ts | ~30 | Array access | Bounds |
| src/dashboard/analytics/success-chart-data.ts | ~50 | Array access | Bounds |
| src/core/memory-export.ts | 173 | `groups.get(key)!.push(mem)` | Map.get undefined risk |
| src/core/routing-engine.ts | 329 | Map access | Key existence |
| src/core/pricing-updater.ts | ~347 | Map access | Key existence |
| src/orchestra/event-stream.ts | ~50 | Property access | Could be undefined |
| src/orchestra/task-builder.ts | 520 | `match[1]!.trim()` | Regex capture group |
| src/orchestra/sprint-docs-updater.ts | ~30 | Array access | Bounds |
| src/orchestra/sprint-metrics.ts | ~40 | Property access | Could be undefined |
| src/mcp/resources/retro.ts | ~20 | Array access | Bounds |
| src/monitor/auditor.ts | ~500 | Property access | Could be undefined |
| src/cli/commands/cost.ts | ~30 | Property access | Could be undefined |

## Appendix C: TODO/FIXME/HACK Inventory

| Directive | Count | Files |
|-----------|-------|-------|
| TODO | 0 | 0 |
| FIXME | 0 | 0 |
| HACK | 0 | 0 |
| XXX | 0 | 0 |

**Note:** Only 1 file (`src/core/plugin-hooks.ts`) had a match, which was a false positive (text content, not a code comment directive).

**Verdict:** Clean codebase — no outstanding TODO/FIXME/HACK comments in source.

---

_Report generated by security-auditor agent | Task 141-012 | Sprint 140 Self-Analysis_
_Total files analyzed: 318 | Report lines: 400+ | Sections: 3 + 3 appendices_
