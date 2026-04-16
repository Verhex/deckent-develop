# META — Error Handling + TODO/FIXME Inventory
**Task ID:** 142-047 | **Model:** opus | **Effort:** max

---

# SECTION 1: ERROR HANDLING ANALYSIS

## 1.1 Error Class Hierarchy

The project has a **dual error hierarchy** with two top-level base classes, plus many standalone error classes:

### Primary: DeckentError (src/core/errors.ts:3)
- `DeckentError extends Error` — structured error with `code`, `suggestion`, `docLink`, `whatHappened`, `why`, `howToFix[]`
- `OutputCollectorError extends DeckentError` (src/core/output-collector.ts:20)
- `DependencyCycleError extends DeckentError` (src/orchestra/parallel-pipeline.ts:11)

### Secondary: BrainError (src/orchestra/sprint-lifecycle.ts:64)
- `BrainError extends Error` — sprint orchestration error with `phase?: SprintPhase`
- Used in: sprint-controller, sprint-phases, sprint-planner, start, test-run
- Does NOT extend DeckentError

### Standalone Error Classes (extends Error directly)
| Error Class | Location | Purpose |
|---|---|---|
| `TaskClaimError` | src/agents/worker.ts:37 | Worker task claim failure |
| `ScopeViolationError` | src/agents/worker.ts:46 | Scope boundary violation |
| `InvalidStateTransitionError` | src/agents/worker.ts:1522 | Task state machine violation |
| `ApiError` | src/dashboard/src/lib/api.ts:1 | Dashboard API client error |
| `TmuxError` | src/orchestra/tmux.ts:22 | tmux session management failure |
| `SpawnBackendError` | src/orchestra/spawn-backend.ts:68 | Spawn backend failure |
| `CredentialNotFoundError` | src/core/credentials.ts:34 | Missing credential |
| `CredentialStorageError` | src/core/credentials.ts:41 | Credential storage failure |
| `UnknownModelError` | src/core/task-types.ts:66 | Unknown model ID (extends TypeError) |
| `AnthropicApiError` | src/core/anthropic-http-client.ts:92 | Anthropic API failure |
| `CredentialEncryptionError` | src/core/credential-encryption.ts:14 | AES-256-GCM encryption failure |
| `PluginError` | src/core/plugin.ts:36 | Plugin execution failure |
| `PluginSecurityError` | src/core/plugin.ts:43 | Plugin sandbox violation |
| `CostConfigError` | src/core/cost-config-loader.ts:148 | Cost config parse failure |
| `CircularDependencyError` | src/core/marketplace/dependency-resolver.ts:25 | Dependency cycle |
| `DependencyConflictError` | src/core/marketplace/dependency-resolver.ts:32 | Version conflict |
| `MarketplaceAuthError` | src/core/marketplace/marketplace-auth.ts:27 | Marketplace auth failure |
| `RegistryNetworkError` | src/core/marketplace/registry-client.ts:43 | Registry network failure |
| `RegistryRateLimitError` | src/core/marketplace/registry-client.ts:50 | Rate limit exceeded |
| `SkillSandboxError` | src/core/marketplace/skill-sandbox.ts:22 | Skill sandbox violation |
| `ConfigValidationError` | src/core/config.ts:101 | Config validation failure |
| `LockError` | src/core/file-lock.ts:24 | File lock failure |
| `ProviderError` | src/core/provider.ts:85 | Provider base error |
| `ProviderNotFoundError` | src/core/provider.ts:95 | Missing provider (extends ProviderError) |
| `ProviderUnavailableError` | src/core/provider.ts:102 | Unavailable provider (extends ProviderError) |

### Hierarchy Assessment
- **P1 — Fragmented hierarchy:** 25 error classes; only 2 extend `DeckentError`, 2 extend `ProviderError`. The remaining 21 extend `Error` directly. This means:
  - No unified `catch (e instanceof DeckentError)` strategy works across the codebase
  - `BrainError` vs `DeckentError` is a split that could cause confusion
  - `ErrorRegistry` codes (DECKENT_E001-E066) are only used with `DeckentError`, not `BrainError`
- **P2 — BrainError lacks ErrorRegistry integration:** BrainError uses plain `message` + `phase` without error codes. Sprint failures don't benefit from `formatHumanError()`.

---

## 1.2 ErrorRegistry Usage

The `ErrorRegistry` (src/core/errors.ts:499-549) defines 46 error codes:
- DECKENT_E001-E010: Core infrastructure errors
- DECKENT_E020-E039: CLI error codes
- DECKENT_E040-E055: Orchestra error codes
- DECKENT_E060-E066: Agent error codes

**Usage statistics:**
- ErrorRegistry.createError() — 50 call sites across src/
- Primarily used in CLI commands (agent.ts, skill.ts, config.ts) and agents (worker.ts, prompt-analytics.ts, shared-context.ts)
- Moderately used in orchestra (multi-agent.ts, handoff-protocol.ts, rollback.ts, sprint-pid-manager.ts)
- NOT used in: MCP tools (they catch generic Error), monitor/, dashboard/, providers/

---

## 1.3 try/catch Patterns — Quantitative Analysis

### Total catch blocks: ~370 across 105 files

| Pattern | Count | Files | Assessment |
|---|---|---|---|
| `catch (e) {` (untyped) | ~350 | 96 | **Dominant** — TypeScript defaults to `any` |
| `catch (err: unknown) {` (typed) | 20 | 9 | **Best practice** — only 5.4% of catches |
| `catch (error) {` (untyped, different name) | ~80 | 25 | Same as above, naming variant |

### Files with typed `catch (err: unknown)`:
- src/api/server.ts — 7 occurrences (best in codebase)
- src/agents/worker.ts — 5 occurrences
- src/orchestra/heartbeat-daemon.ts — 2 occurrences
- src/orchestra/sprint-pid-manager.ts — 1
- src/orchestra/connector.ts — 1
- src/core/observability.ts — 1
- src/core/file-lock.ts — 1
- src/cli/commands/heartbeat.ts — 1
- src/dashboard/src/pages/ConfigPage.tsx — 1

**P1 — 94.6% of catch blocks use untyped parameters.** TypeScript strict mode treats `catch` parameters as `unknown` by default (since TS 4.4 with `useUnknownInCatchVariables`), but explicit `unknown` annotation improves code clarity and reviewer confidence.

---

## 1.4 Error Propagation Patterns

### Pattern A: debugLog + swallow (DOMINANT — ~250 sites)
```typescript
try { someOperation(); } catch (e) { debugLog('context:operation', e); }
```
**Assessment:** This is the primary propagation strategy in orchestra/ and core/. It logs to debug channel and silently continues. Used intentionally for non-critical side-effect operations (dashboard updates, PID writes, file cleanup).

**Locations with highest density:**
| File | catch-and-log count |
|---|---|
| src/orchestra/sprint-finalizer.ts | 33 |
| src/orchestra/sprint-lifecycle.ts | 28 |
| src/orchestra/sprint-phases.ts | 23 |
| src/core/stack-detector.ts | 19 |
| src/orchestra/sprint-docs-updater.ts | 12 |
| src/orchestra/sprint-controller.ts | 11 |
| src/orchestra/sprint-planner.ts | 14 |
| src/orchestra/spawn-backend-docker.ts | 6 |
| src/core/plugin-hooks.ts | 9 |
| src/orchestra/result-collector.ts | 6 |

**Risk:** When a critical sub-operation fails silently in sprint-finalizer (e.g., `finalizeSprint:writeRetrospective`, `finalizeSprint:updateProjectIdentity`), the sprint continues as "successful" but data integrity may be compromised. The `debugLog` calls are only visible with `DEBUG=deckent*` env var.

### Pattern B: printError + process.exitCode = 1 (CLI — ~40 sites)
```typescript
try { await cliOperation(); } catch (error) { printError(error); process.exitCode = 1; }
```
**Assessment:** Consistent pattern across CLI commands. `printError()` (111 calls across 32 files) handles formatting. Good: sets exitCode instead of hard `process.exit(1)`. Allows cleanup.

### Pattern C: MCP tool JSON error response (~20 sites)
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: JSON.stringify({ error: true, message }) }] };
}
```
**Assessment:** Highly uniform across MCP tools. Good: always returns structured error. Good: always does `instanceof Error` check. Minor inconsistency: some tools prefix message (e.g., "Failed to analyze project:"), others don't.

### Pattern D: console.warn/error (rare — 8 sites)
```typescript
console.warn(`[event-stream] writeEvent failed: ${err instanceof Error ? err.message : String(err)}`);
console.error(...)
```
**Locations:**
- src/orchestra/event-stream.ts:189 — console.warn (writeEvent)
- src/orchestra/event-stream.ts:240 — console.warn (readEvents)
- src/orchestra/sprint-planner.ts:267 — console.error
- src/orchestra/sprint-planner.ts:274 — console.error
- src/orchestra/sprint-planner.ts:354 — console.error
- src/agents/worker.ts:298 — console.warn (.plan missing)
- src/agents/worker.ts:784 — console.warn (ADR-037 violation)
- src/orchestra/rollback.ts:136 — console.warn (stash pop)

**P2 — console.warn/error bypasses the debugLog system.** These 8 sites always emit output regardless of DEBUG env var. For event-stream this is intentional (fail-safe notification), but sprint-planner's console.error calls should arguably use debugLog for consistency.

### Pattern E: throw new BrainError (critical phase failures — 7 sites)
Used ONLY for sprint-halting errors:
- src/orchestra/sprint-controller.ts:253 — EVALUATE phase timeout
- src/orchestra/sprint-phases.ts:190 — CI validation failure (PLAN)
- src/orchestra/sprint-phases.ts:218 — planSprint failure (PLAN)
- src/orchestra/sprint-phases.ts:272 — spawn failure (SPAWN)
- src/orchestra/sprint-planner.ts:290 — AI planner failure
- src/orchestra/sprint-planner.ts:345 — circular dependency

**Assessment:** BrainError is correctly reserved for phase-halting failures. Caught at top level in start.ts, test-run.ts, and MCP start tool.

### Pattern F: throw ErrorRegistry.createError() (input validation — ~50 sites)
Used for user-facing validation errors in CLI commands, agents, and orchestra modules.

### Pattern G: .catch(() => {}) — Silent promise swallow (5 sites in dashboard)
- src/dashboard/src/pages/DashboardPage.tsx:135,152,168
- src/dashboard/src/i18n/LanguageProvider.tsx:32,42

**P2 — Silent promise rejection swallow.** These 5 dashboard sites completely discard promise rejections. While React component errors may be intentionally swallowed to avoid unhandled rejection crashes, they should at least log to console.

### Pattern H: .catch(() => defaultValue) — Graceful degradation (~10 sites)
```typescript
const config = await loadConfig(root).catch(() => ({ language: 'en' }));
const existing = await fsPromises.readFile(path, 'utf-8').catch(() => '');
```
**Assessment:** Good pattern for optional data loading. Used in kill.ts, spawn.ts, attach.ts, sprint-finalizer.ts.

---

## 1.5 Silent Swallow Anti-Pattern Detection

### Empty catch bodies: 0

No `catch (e) {}` or `catch () {}` patterns found in the codebase. This is excellent.

### .catch(() => {}) (Promise variant): 5 sites (all in dashboard)
Listed above in Pattern G. These are the functional equivalent of silent swallow for promise rejections.

### debugLog-only swallows (borderline): ~250 sites
These are NOT true silent swallows since they log to debug channel. However, they effectively swallow errors in production (where DEBUG is not set). The most concerning are in sprint-finalizer.ts where critical post-sprint operations (writing retrospective, updating identity, decay, agent stats) can fail silently.

---

## 1.6 Error Handling Uniformity Assessment

| Module | Primary Pattern | Typed catches | ErrorRegistry | Assessment |
|---|---|---|---|---|
| src/mcp/tools/ | JSON error response | 0/22 | 0 | Uniform, no ErrorRegistry |
| src/cli/commands/ | printError + exitCode | 0/~50 | ~30 | Uniform |
| src/orchestra/ | debugLog + swallow | 0/~200 | ~10 | Consistent but too silent |
| src/core/ | mixed | 3/~50 | ~10 | Mixed patterns |
| src/agents/ | typed catch + ErrorRegistry | 5/6 | 7 | Best in codebase |
| src/api/ | typed catch + sendError | 7/7 | 0 | Excellent typing |
| src/monitor/ | debugLog | 0/~10 | 0 | Consistent |
| src/dashboard/ | .catch(() => {}) | 1/~10 | 0 | Poorest handling |

---

## 1.7 process.exit() Usage (29 sites)

| File | exit(0) | exit(1) | Assessment |
|---|---|---|---|
| src/cli/entry.ts | 1 | 1 | Top-level SIGINT + unhandled rejection |
| src/cli/index.ts | 2 | 0 | --version, --help |
| src/cli/commands/cost.ts | 0 | 8 | EXCESSIVE — should use process.exitCode |
| src/cli/commands/resume.ts | 0 | 4 | Should use process.exitCode |
| src/cli/commands/status.ts | 2 | 0 | Watch mode cleanup |
| src/cli/commands/output.ts | 1 | 0 | Output follow mode |
| src/cli/commands/web.ts | 1 | 1 | Server lifecycle |
| src/cli/commands/serve.ts | 1 | 1 | Server lifecycle |
| src/cli/commands/dashboard.ts | 1 | 0 | Server lifecycle |
| src/cli/commands/heartbeat.ts | 1 | 0 | Daemon mode |
| src/mcp/server.ts | 0 | 1 | Top-level crash handler |
| src/agents/worker.ts | 1 | 0 | Worker completion |
| src/providers/gemini.ts | 0 | 2 | Generated child process code |
| src/providers/sandbox.ts | 1 | 0 | Sandbox test (spawn) |

**P2 — cost.ts uses process.exit(1) instead of process.exitCode = 1:** 8 hard exits in cost.ts bypass cleanup. Every other CLI command uses `process.exitCode = 1` pattern. resume.ts has the same issue (4 hard exits).

---

## 1.8 Summary Findings — Error Handling

| Finding | Severity | Count | Recommendation |
|---|---|---|---|
| Fragmented error hierarchy (25 classes, 2 bases) | P2 | 25 classes | Migrate standalone errors to extend DeckentError |
| Untyped catch parameters (94.6%) | P2 | ~350 sites | Enable `useUnknownInCatchVariables` or annotate |
| debugLog-only swallow in critical paths | P2 | ~33 (finalizer) | Add fallback behavior or aggregate error report |
| Dashboard silent promise swallow | P2 | 5 sites | Add console.error fallback |
| BrainError not integrated with ErrorRegistry | P2 | 1 class | Add error codes to BrainError |
| console.warn/error bypassing debugLog | P3 | 8 sites | Migrate to debugLog |
| process.exit(1) instead of process.exitCode | P3 | 12 sites | Refactor cost.ts, resume.ts |
| MCP tools don't use ErrorRegistry codes | P3 | 22 tools | Consider adding error codes to MCP responses |

---

# SECTION 2: TODO/FIXME/HACK/XXX/NOTE INVENTORY

## 2.1 src/ Directory

### Exact matches found:

| # | File:Line | Marker | Content | Severity |
|---|---|---|---|---|
| 1 | src/core/plugin-hooks.ts:257 | (comment) | `// Match lines like: path/to/file.ts(line,col): error TSXXXX: ...` | N/A — false positive, pattern description |

**Result: 0 genuine TODO/FIXME/HACK/XXX markers in src/**

This is remarkably clean. The entire src/ directory with ~200+ TypeScript files has zero TODO/FIXME/HACK/XXX comments.

---

## 2.2 tests/ Directory

| # | File:Line | Marker | Content | Severity |
|---|---|---|---|---|
| 1 | tests/cli/commands.test.ts:1209 | TODO | `it.skip('creates config with selected mode — TODO: update mock for language-first init flow')` | P2 — Planned: skipped test waiting for mock update |
| 2 | tests/orchestra/dependency-pipeline.test.ts:456 | TODO(sprint-142) | `// TODO(sprint-142): Sprint 139 Task 028 dependency scheduler (Kahn's...)` | P2 — Planned: deferred to sprint-142 |
| 3 | tests/orchestra/dependency-pipeline.test.ts:561 | TODO(sprint-142) | `// TODO(sprint-142): Same scheduler-semantics drift as the sibling test` | P2 — Planned: deferred to sprint-142 |

**Result: 3 TODO markers in tests/ (0 FIXME, 0 HACK, 0 XXX)**

---

## 2.3 docs/ Directory

### Genuine TODO/FIXME references:

| # | File:Line | Marker | Context | Severity |
|---|---|---|---|---|
| 1 | docs/directives/sprint-034.md:362 | TODO | `Bu adapter tam fonksiyonel degil, temel yapi + TODO'lar` — Sprint 34 historical, Codex adapter had TODOs | P3 — Archived: sprint-034 directive (historical) |
| 2 | docs/directives/sprint-102.md:14 | TODO | `open TODO/FIXME sayisi, test coverage trend` — sprint-102 watch feature spec referencing TODO counting | N/A — specification text, not a TODO |
| 3 | docs/directives/sprint-102.md:27 | TODO | `TODO count (high), coverage drop (critical)` — sprint-102 priority scoring spec | N/A — specification text |
| 4 | docs/directives/sprint-102.md:40 | TODO | `"3 oneri var: 1) Fix 5 TODO, 2) Update deps..."` — sprint-102 interactive UX spec | N/A — specification text |
| 5 | docs/directives/sprint-101.md:144 | TODO | `deckent do --file TODO.md` — sprint-101 do command spec | N/A — specification text |
| 6 | docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md:579 | TODO | `Simdi bu liste TODO/task-level; ADR-level degil` — sprint-132 bridge note | P3 — Archived: sprint-132 context |
| 7 | docs/audits/sprint-132/W3-reliability.md:49 | TODO | `1 adet it.skip() test: "creates config with selected mode — TODO: update mock..."` | P2 — Active: cross-references tests/cli/commands.test.ts:1209 |
| 8 | docs/audits/sprint-132/W3-reliability.md:223 | TODO | `Skip'lenmis test kapatilmali — commands.test.ts:1190 TODO guncellenip test aktif edilmeli` | P2 — Active: action item from sprint-132 audit |
| 9 | docs/analysis/full-audit.md:31 | TODO | `TODO/FIXME/HACK | 0 | TEMIZ` — previous audit found 0 | N/A — historical audit result |
| 10 | docs/archive/full-audit-pre036.md:31 | TODO | `TODO/FIXME/HACK | 0 | TEMIZ` — previous audit found 0 | N/A — historical audit result |
| 11 | docs/superpowers/plans/2026-04-13-config-backup-rotation.md:633 | TODO | `Placeholder scan: No TBD/TODO/"add validation"` — plan quality check | N/A — meta reference |
| 12 | docs/superpowers/plans/2026-04-13-sprint-136-plan.md:1070 | TODO | `Placeholder scan: TBD/TODO yok` — plan quality check | N/A — meta reference |
| 13 | docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md:992 | TODO | `hicbir code step'inde TBD/TODO/FIXME yok` — plan quality check | N/A — meta reference |
| 14 | docs/SPRINT-LOG.md:3592 | TODO | `META — Test Coverage Map + Performance + Error Handling + TODO inventory` — sprint-141 task title | N/A — meta reference |
| 15 | docs/CHANGELOG.md:28 | TODO | `META — Test Coverage Map + Performance + Error Handling + TODO inventory` — changelog entry | N/A — meta reference |

**Result:** 2 active action items (docs/audits/sprint-132), 1 historical (sprint-034), remainder are meta-references/specifications.

---

## 2.4 TODO/FIXME Inventory Summary

### Active Items (require action)

| # | Location | Content | Severity | Recommendation |
|---|---|---|---|---|
| 1 | tests/cli/commands.test.ts:1209 | Skipped test needing mock update for language-first init flow | P2 | Update mock and enable test |
| 2 | tests/orchestra/dependency-pipeline.test.ts:456 | TODO(sprint-142): dependency scheduler semantics | P2 | Scheduled for sprint-142 |
| 3 | tests/orchestra/dependency-pipeline.test.ts:561 | TODO(sprint-142): scheduler-semantics drift | P2 | Scheduled for sprint-142 |
| 4 | docs/audits/sprint-132/W3-reliability.md:49,223 | Action item: re-enable skipped test | P2 | Same as item #1 |

### Metrics

| Category | Count |
|---|---|
| TODO in src/ | **0** |
| TODO in tests/ | **3** |
| FIXME in entire codebase | **0** |
| HACK in entire codebase | **0** |
| XXX in entire codebase | **0** |
| Active action items | **4** (3 unique) |
| Archived/historical | **3** |
| Meta-references (not actionable) | **10** |

---

# SECTION 3: CROSS-CUTTING OBSERVATIONS

## 3.1 Error Handling Maturity Model

| Level | Description | Codebase Status |
|---|---|---|
| L1: No crashes | Application doesn't crash on errors | YES (extensive try/catch) |
| L2: User-friendly messages | Errors shown to users are clear | YES (CLI via printError, MCP via JSON) |
| L3: Structured error codes | Programmatic error identification | PARTIAL (ErrorRegistry exists but only covers 50/370 catch sites) |
| L4: Error aggregation | Errors collected and reported | NO (debugLog is fire-and-forget) |
| L5: Error recovery | Automatic retry/fallback | PARTIAL (sprint FIX phase for task-level, no catch-level retry) |

## 3.2 Positive Findings

1. **Zero silent swallow in src/** — No `catch (e) {}` or `catch () {}` patterns.
2. **Zero TODO/FIXME/HACK in src/** — Production code is remarkably clean.
3. **Consistent MCP error pattern** — All 22 tools use the same JSON error response format.
4. **Consistent CLI error pattern** — All CLI commands use `printError()` + `process.exitCode = 1`.
5. **ErrorRegistry is well-designed** — 46 codes with structured metadata (whatHappened, why, howToFix).
6. **BrainError correctly scoped** — Only used for sprint-halting phase failures.
7. **debugLog pattern provides traceability** — Named contexts (e.g., 'finalizeSprint:writeRetrospective') make debugging possible.

## 3.3 Sprint 142+ Recommendations

| Priority | Item | Effort |
|---|---|---|
| P1 | Enable `useUnknownInCatchVariables` in tsconfig.json | Low |
| P2 | Migrate BrainError to extend DeckentError with error codes | Medium |
| P2 | Add error aggregation to sprint-finalizer (collect all debugLog failures, report at end) | Medium |
| P2 | Fix process.exit(1) in cost.ts and resume.ts | Low |
| P2 | Re-enable skipped test (commands.test.ts:1209) | Low |
| P2 | Add console.error to dashboard .catch(() => {}) sites | Low |
| P3 | Gradually migrate standalone Error subclasses to extend DeckentError | High (long-term) |
| P3 | Add ErrorRegistry codes to MCP tool error responses | Medium |
| P3 | Migrate console.warn/error calls to debugLog in sprint-planner | Low |

---

## Verdict: ANALYZED

**Error handling:** Solid defensive coding (370 catch blocks, zero silent swallows), consistent patterns per module. Main gap: fragmented hierarchy and no error aggregation in critical paths.

**TODO/FIXME:** Exceptionally clean. 0 markers in src/, 3 planned items in tests/, 0 FIXME/HACK/XXX anywhere.
