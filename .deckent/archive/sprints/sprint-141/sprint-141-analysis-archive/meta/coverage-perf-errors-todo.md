# Analysis: Cross-Cutting Meta Report
**Task ID:** 141-014 | **Sprint:** 140 | **Date:** 2026-04-16

## Overview

This report covers 4 cross-cutting analyses of the entire `src/` and `tests/` codebase:
1. Test Coverage Mapping — src/X.ts → tests/X.test.ts
2. Performance — Synchronous I/O inventory and hot path identification
3. Error Handling — try/catch uniformity, silent swallows, BrainError types
4. TODO/FIXME/HACK inventory — categorized comment census

---

## Section 1: Test Coverage Mapping

### 1.1 Summary Statistics

| Metric | Value |
|--------|-------|
| Total src files (excl. node_modules, dashboard, .d.ts) | 303 |
| Total test files (tests/**/*.test.ts) | 562 |
| src files with matching test file | 263 (87%) |
| Orphan src files (no matching test) | 40 (13%) |
| Orphan test files (no matching src) | 314 (56%) |
| Overall coverage ratio | 87% |

**Note:** The high orphan test count (314) is expected and normal. Many test files cover
cross-cutting concerns, integration scenarios, or test subsystems via alternate names
(e.g., `tests/orchestra/brain-agent.test.ts` tests `src/orchestra/brain.ts`).

### 1.2 Orphan src Files — No Corresponding Test File

These 40 source files have no `tests/<basename>.test.ts` counterpart. They may be covered
indirectly by integration tests, or may be genuinely undertested.

**CLI Commands (untested by name):**
- `src/cli/commands/checkpoint.ts` — Memory V2-era command, no dedicated test
- `src/cli/commands/cost.ts` — Cost tracking command, no dedicated test
- `src/cli/commands/docs.ts` — Sprint docs management, no dedicated test
- `src/cli/commands/finalize.ts` — Sprint finalize, no dedicated test
- `src/cli/commands/heartbeat.ts` — HB daemon CLI command, no dedicated test
- `src/cli/commands/memory.ts` — Memory V2 CLI (rebuild/export/stats), no dedicated test
- `src/cli/commands/recall.ts` — Memory V2 recall CLI, no dedicated test
- `src/cli/commands/remember.ts` — Memory V2 remember CLI, no dedicated test
- `src/cli/commands/resume.ts` — Sprint resume CLI, no dedicated test
- `src/cli/commands/set-directives.ts` — Directives CLI, no dedicated test
- `src/cli/entry.ts` — CLI entry point; tested via bin-entry-validation but no unit test
- `src/cli/helpers/process.ts` — Process helper, no dedicated test
- `src/cli/version-info.ts` — Version display, no dedicated test

**Core Types/Modules:**
- `src/core/memory-types.ts` — Memory V2 interfaces (types-only, untestable directly)
- `src/core/mode-presets.ts` — ModelStrategy + MODE_PRESETS, no dedicated test
- `src/core/monitoring-types.ts` — Monitoring interfaces (types-only)
- `src/core/plugin-loader.ts` — Plugin loader, no dedicated test
- `src/core/sprint-types.ts` — Sprint interfaces (types-only)
- `src/core/task-types.ts` — Task interfaces + UnknownModelError (no dedicated test)

**MCP Resources (no dedicated tests):**
- `src/mcp/resources/debt.ts`
- `src/mcp/resources/directives.ts`
- `src/mcp/resources/memory.ts`
- `src/mcp/resources/tasks.ts`

**MCP Tools (no dedicated tests):**
- `src/mcp/tools/agent-list.ts`
- `src/mcp/tools/checkpoint.ts`
- `src/mcp/tools/directives.ts`
- `src/mcp/tools/docs.ts`
- `src/mcp/tools/skill-list.ts`

**API:**
- `src/api/auth.ts` — HTTP auth middleware, no dedicated unit test (covered via server tests)

**Orchestra Modules:**
- `src/orchestra/ci-reporter.ts` — CI reporting, no dedicated test
- `src/orchestra/managed-docs/doc-cache.ts` — Doc cache, no dedicated test
- `src/orchestra/managed-docs/plugin-loader.ts` — Plugin loader, no dedicated test
- `src/orchestra/managed-docs/template-renderer.ts` — Template renderer, no dedicated test
- `src/orchestra/model-selector.ts` — Model selection, covered via model-selector-* tests
- `src/orchestra/spawn-backend-mock.ts` — Mock backend for tests (test infrastructure itself)
- `src/orchestra/sprint-docs-updater.ts` — Sprint docs, no dedicated test
- `src/orchestra/sprint-metrics.ts` — Sprint metrics, no dedicated test
- `src/orchestra/sprint-phases.ts` — Sprint phases, no dedicated test
- `src/orchestra/sprint-planner.ts` — Sprint planner, no dedicated test (covered via planner*)
- `src/orchestra/sprint-retro-writer.ts` — Retro writer, no dedicated test

### 1.3 Coverage Concerns by Priority

**HIGH PRIORITY (critical path, no tests by name):**
- `src/cli/commands/memory.ts` — Memory V2 central command, no test
- `src/cli/commands/recall.ts` — Memory V2 recall, no test
- `src/cli/commands/remember.ts` — Memory V2 remember, no test
- `src/orchestra/sprint-planner.ts` — Core planning logic, relies on planner-*.test.ts indirectly
- `src/orchestra/sprint-phases.ts` — Sprint lifecycle phases, no direct test
- `src/orchestra/sprint-retro-writer.ts` — Retro writing, no direct test
- `src/mcp/resources/memory.ts` — MCP memory resource, no direct test
- `src/mcp/resources/debt.ts` — MCP debt resource, no direct test

**MEDIUM PRIORITY (functional, no tests):**
- `src/cli/commands/checkpoint.ts` — Checkpoint approval/rejection
- `src/cli/commands/resume.ts` — Sprint resume (MVP feature Sprint 138)
- `src/orchestra/managed-docs/template-renderer.ts` — Template rendering
- `src/orchestra/sprint-docs-updater.ts` — Sprint doc generation
- `src/api/auth.ts` — Auth middleware (covered indirectly by server-auth tests)

**LOW PRIORITY (types-only or infrastructure):**
- `src/core/memory-types.ts`, `src/core/sprint-types.ts`, `src/core/task-types.ts`
- `src/orchestra/spawn-backend-mock.ts` (test infrastructure itself)
- `src/cli/entry.ts` (integration-tested via binary)

### 1.4 Notable Orphan Test Files (representative)

The 314 orphan test files cover cross-cutting concerns. Key notable groups:

| Category | Count | Notes |
|----------|-------|-------|
| tests/cli/commands/*.test.ts | ~70 | Feature-specific CLI tests |
| tests/orchestra/*.test.ts | ~50 | Brain integration tests |
| tests/integration/*.test.ts | ~30 | Full pipeline integration |
| tests/core/*-overhaul.test.ts | ~15 | Sprint-specific enhancement tests |
| tests/e2e/*.test.ts | 10 | End-to-end pipeline tests |
| tests/docs/*.test.ts | 25 | Documentation validation tests |
| tests/scripts/*.test.ts | 10 | Build/publish script tests |
| tests/mcp/tools/*.test.ts | 5 | MCP tool-specific tests |

---

## Section 2: Performance — Synchronous I/O Inventory

### 2.1 Overall Sync I/O Totals

| Operation | Total Occurrences (src/) |
|-----------|--------------------------|
| `readFileSync` | 432 |
| `writeFileSync` | 307 |
| `spawnSync` | 130 |
| `execSync` | 17 |
| **Total sync I/O** | **886** |

### 2.2 Sync I/O by Module Area

| Module | readFileSync | writeFileSync | spawnSync | execSync |
|--------|-------------|---------------|-----------|----------|
| src/cli/ | 138 | 77 | 46 | 2 |
| src/orchestra/ | 121 | 111 | 44 | 2 |
| src/core/ | 74 | 56 | 22 | 2 |
| src/mcp/ | 56 | 20 | 0 | 0 |
| src/agents/ | 24 | 25 | 0 | 4 |
| src/monitor/ | 11 | 8 | 9 | 0 |
| src/api/ | 6 | 3 | 0 | 0 |
| src/providers/ | 0 | 7 | 9 | 0 |

### 2.3 Top Files by Sync I/O (readFileSync)

| File | readFileSync count |
|------|--------------------|
| `src/cli/commands/doctor.ts` | 13 |
| `src/cli/commands/skill.ts` | 11 |
| `src/cli/commands/status.ts` | 10 |
| `src/core/file-lock.ts` | 9 |
| `src/mcp/tools/status.ts` | 8 |
| `src/cli/commands/init.ts` | 8 |
| `src/orchestra/sprint-docs-updater.ts` | 7 |
| `src/core/stack-detector.ts` | 7 |
| `src/cli/commands/config.ts` | 7 |
| `src/orchestra/sprint-pid-manager.ts` | 6 |

### 2.4 Top Files by Sync I/O (writeFileSync)

| File | writeFileSync count |
|------|---------------------|
| `src/cli/commands/init.ts` | 18 |
| `src/agents/worker.ts` | 10 |
| `src/orchestra/sprint-docs-updater.ts` | 8 |
| `src/orchestra/spawn-backend-docker.ts` | 8 |
| `src/mcp/tools/init.ts` | 8 |
| `src/orchestra/sprint-lifecycle.ts` | 7 |
| `src/cli/commands/skill.ts` | 7 |
| `src/orchestra/sprint-pid-manager.ts` | 5 |
| `src/orchestra/spawn-backend-mock.ts` | 5 |
| `src/core/utils.ts` | 5 |

### 2.5 Top Files by spawnSync

| File | spawnSync count |
|------|-----------------|
| `src/orchestra/tmux.ts` | 13 |
| `src/cli/commands/upgrade.ts` | 11 |
| `src/orchestra/spawn-backend-docker.ts` | 10 |
| `src/cli/commands/doctor.ts` | 10 |
| `src/monitor/auditor.ts` | 9 |
| `src/cli/commands/sync.ts` | 6 |
| `src/core/subscription.ts` | 5 |
| `src/core/plugin-hooks.ts` | 4 |
| `src/core/analyzer.ts` | 4 |
| `src/cli/commands/start.ts` | 4 |

### 2.6 HIGH SEVERITY — Sync I/O in Hot Paths (Loops)

**CRITICAL: `src/core/file-lock.ts` — readFileSync in multiple scan loops**
- Lines 174, 200, 231, 267: `for (const file of files) { readFileSync(lockPath) }`
- `getAllLocks()` scans all `.lock` files synchronously — called by auditor every 30s
- `releaseAllLocks()` also scans all locks synchronously
- `listStaleLocks()` and `checkLockConflicts()` both do full scan with readFileSync per lock
- **Impact:** With 50 concurrent workers, this is 50x readFileSync per auditor cycle

**HIGH: `src/monitor/auditor.ts` — readFileSync in heartbeat scan loop**
- Line 265-275: `for (const file of files) { readHeartbeatCached(hbPath) }`
- Sprint 139 added HB caching via mtime checking (`readHeartbeatCached`) — mitigates hot path
- Secondary loop at line 1604: reads file contents inside `filesToCheck` loop for ADR compliance
- **Impact:** Mitigated by cache but still allocates per-loop on cache miss

**HIGH: `src/core/stack-detector.ts` — multiple readFileSync in nested loops**
- Lines 514, 572, 592: `for (const fileName of filesToCheck) { readFileSync(filePath) }`
- Called during `analyzeProject` — single invocation but reads 7+ files sequentially
- Lines 225-234: nested `for` over directory entries with language detection

**MEDIUM: `src/orchestra/sprint-docs-updater.ts` — scan loop with sync reads**
- Scans test directories with `readdirSync` then reads content synchronously
- Called at end of sprint during retro phase — not on critical path

**MEDIUM: `src/core/ci-learning.ts` line 93 — loop with readFileSync**
- `for (const file of files) { readFileSync(file) }` — reads CI artifacts

**MEDIUM: `src/agents/worker.ts` — multiple writeFileSync in tight sequence**
- Heartbeat updates via `atomicWriteFileSync` (Sprint 139 fix with fsync)
- Lines 241, 270 — heartbeat writes are intentionally synchronous for atomicity

### 2.7 LOW SEVERITY — Acceptable Sync I/O

The following patterns are acceptable (one-off init, startup, or CLI display):
- `src/cli/commands/init.ts`: 18 writeFileSync — project initialization (one-time)
- `src/mcp/tools/init.ts`: similar init pattern
- `src/cli/commands/doctor.ts`: reads config/status files for display — user-initiated
- `src/api/server.ts`: reads sprint files for API responses (acceptable per request)

### 2.8 spawnSync Usage Analysis

**ADR-006 Pattern — Compliant:**
- `src/orchestra/tmux.ts` (13 uses): tmux session management via spawnSync — ADR-006 compliant
- `src/monitor/auditor.ts` (9 uses): git diff, ps, docker checks — ADR-006 boundary
- `src/cli/commands/doctor.ts` (10 uses): health checks (tsc, git, node) — acceptable

**QUESTIONABLE (ADR-006 compliance check needed):**
- `src/cli/commands/upgrade.ts` (11 uses): upgrade process — spawns npm/git processes
  - High count, should be reviewed for async alternatives
- `src/core/subscription.ts` (5 uses): subscription checks — consider async
- `src/core/analyzer.ts` (4 uses): project analysis — consider async

---

## Section 3: Error Handling Analysis

### 3.1 try/catch Block Count by Module

| Module | try blocks | catch blocks | Imbalance |
|--------|-----------|--------------|-----------|
| src/core/ | 159 | 135 | -24 |
| src/orchestra/ | 329 | 304 | -25 |
| src/cli/ | 226 | 203 | -23 |
| src/agents/ | 41 | 34 | -7 |
| src/mcp/ | 82 | 74 | -8 |
| src/monitor/ | 35 | 33 | -2 |
| src/providers/ | 19 | 16 | -3 |
| src/api/ | 13 | 12 | -1 |
| **Total** | **904** | **811** | **-93** |

The imbalance (-93) is expected: `try/finally` blocks without catch, and nested try blocks
sharing a single catch.

### 3.2 Bare Catch Blocks (} catch {) — Total: 422

Bare `} catch {` blocks (no error variable binding) total **422** across src/.

#### 3.2.1 Annotated Silent Catches (Intentional)
Many bare catches have inline comments indicating intent:
```
} catch { /* ignore */ }
} catch { /* non-fatal */ }
} catch { /* skip malformed */ }
} catch { /* noop */ }
} catch { /* best effort */ }
} catch { /* start fresh */ }
} catch { /* use default */ }
} catch { /* fall through */ }
```

These represent ~120 of the 422 instances and are acceptable.

#### 3.2.2 Unexplained Silent Catches (No Comment) — ~302 instances

Files with highest density of unexplained bare catches:

**`src/monitor/auditor.ts`** — 25+ bare catches
- Most are at scan loop boundaries (non-fatal file reads)
- Sprint 139 added fail-safe patterns — generally acceptable
- Concern: line 1580 `} catch { /* DB failed, fall through to V1 */ }` — V1 fallback should be removed (Memory V2 migration)

**`src/cli/commands/doctor.ts`** — 15+ bare catches
- Pattern: `} catch { return 0; }`, `} catch { /* skip malformed */ }`
- Generally acceptable for health-check display

**`src/cli/commands/watch.ts`** — 6 bare catches
- Lines 14, 26, 38, 50, 69, 81 — all file read operations
- No explanation for most

**`src/agents/worker.ts`** — 4 bare catches
- Lines 354, 1023, 1080, 1388
- Worker is critical path — bare catches here are higher risk

**`src/cli/commands/upgrade.ts`** — 7 bare catches
- Lines 115, 136, 154, 171, 207, 228, 353 — upgrade operations
- Silent failures in upgrade flow could leave project in inconsistent state

**`src/core/agent-pool.ts`** — 4 bare catches
- Lines 119, 218, 256, 284 — agent manifest loading
- Missing agents should be logged, not silently skipped

#### 3.2.3 Specific High-Risk Silent Swallows

```
src/core/memory-query.ts:211      } catch {   ← FTS5 search failure silently returns empty
src/orchestra/sprint-finalizer.ts:343  } catch {  ← Sprint finalization error — should not be silent
src/orchestra/sprint-finalizer.ts:411  } catch {  ← Same
src/agents/worker.ts:1023         } catch {   ← Worker execution error — HIGH RISK
src/agents/worker.ts:1388         } catch {   ← Worker result write error — HIGH RISK
src/orchestra/task-builder.ts:737 } catch {   ← Task building failure silently continues
src/orchestra/authority-enforcer.ts:426 } catch { ← ADR-037 enforcement failure — should log
src/core/provider.ts:238          } catch {   ← Provider availability check silence
```

### 3.3 `.catch()` Chain Swallows

**Silent `.catch(() => {})` or `.catch(_ => {})` patterns:**
- `src/mcp/tools/start.ts:150` — `.catch(err => {` (this one logs the error, acceptable)
- `src/cli/commands/run.ts:276` — `.catch(() => ({} as Config))` — silent config load failure
- `src/api/server.ts:519` — `.catch((err: unknown) => {` — logs error, acceptable
- `src/api/server.ts:784` — `.catch((err: unknown) => {` — logs error, acceptable

### 3.4 BrainError Type Analysis

**Definition:** `BrainError extends Error` defined in `src/orchestra/sprint-lifecycle.ts:64`

```typescript
export class BrainError extends Error {
  constructor(message: string, public phase: SprintPhase) {
    super(message);
    this.name = 'BrainError';
  }
}
```

**Key characteristics:**
- Has `phase: SprintPhase` field — enables phase-aware error handling
- NOT exported from `src/core/` — only accessible via `src/orchestra/`
- Exported from barrel: `src/orchestra/index.ts:59`

**Throw sites:**
| File | Line | Usage |
|------|------|-------|
| `src/orchestra/sprint-planner.ts` | 290 | AI planner failure |
| `src/orchestra/sprint-planner.ts` | 345 | Circular dependency detection |
| `src/orchestra/sprint-phases.ts` | 190 | Planning/CI validation failure |
| `src/orchestra/sprint-phases.ts` | 218 | Planning failure |
| `src/orchestra/sprint-phases.ts` | 272 | Spawn failure after retry |
| `src/orchestra/sprint-controller.ts` | 253 | General orchestration failure |

**Catch sites:**
| File | Usage |
|------|-------|
| `src/cli/commands/start.ts:436` | `if (error instanceof BrainError)` — user-visible output |
| `src/cli/commands/test-run.ts:262` | Same pattern |
| `src/mcp/tools/start.ts:5` | Import only — not caught distinctly |

**Findings:**
- BrainError is only used in the PLAN/SPAWN phases — no EXECUTE/EVALUATE/FIX phase errors use it
- `src/mcp/tools/start.ts` imports BrainError but does not catch it specifically — all errors caught generically
- BrainError phase field is not used in display logic in `start.ts` — only message is shown
- **Gap:** No BrainError subclasses for different failure categories (network, config, timeout)

### 3.5 Custom Error Class Ecosystem

| Class | Location | Extends |
|-------|----------|---------|
| `DeckentError` | `src/core/errors.ts` | Error |
| `BrainError` | `src/orchestra/sprint-lifecycle.ts` | Error |
| `SpawnBackendError` | `src/orchestra/spawn-backend.ts` | Error |
| `TmuxError` | `src/orchestra/tmux.ts` | Error |
| `DependencyCycleError` | `src/orchestra/parallel-pipeline.ts` | DeckentError |
| `LockError` | `src/core/file-lock.ts` | Error |
| `ConfigValidationError` | `src/core/config.ts` | Error |
| `ProviderError` | `src/core/provider.ts` | Error |
| `ProviderNotFoundError` | `src/core/provider.ts` | ProviderError |
| `ProviderUnavailableError` | `src/core/provider.ts` | ProviderError |
| `PluginError` | `src/core/plugin.ts` | Error |
| `PluginSecurityError` | `src/core/plugin.ts` | Error |
| `AnthropicApiError` | `src/core/anthropic-http-client.ts` | Error |
| `UnknownModelError` | `src/core/task-types.ts` | TypeError |
| `OutputCollectorError` | `src/core/output-collector.ts` | DeckentError |
| `CredentialNotFoundError` | `src/core/credentials.ts` | Error |
| `CredentialStorageError` | `src/core/credentials.ts` | Error |
| `CredentialEncryptionError` | `src/core/credential-encryption.ts` | Error |
| `CostConfigError` | `src/core/cost-config-loader.ts` | Error |
| Marketplace errors (5) | `src/core/marketplace/` | Error |

**Architectural concern:** `BrainError` and `DeckentError` are parallel hierarchies — no shared
base. This means catching `DeckentError` does not catch `BrainError` and vice versa. Inconsistent
error hierarchy.

### 3.6 V1 Fallback Error Swallow — Memory V2 Gap

```
src/monitor/auditor.ts:1580: } catch { /* DB failed, fall through to V1 */ }
```

This is a **Memory V2 violation** — the auditor has a V1 fallback for ADR compliance checking.
When MemoryStore DB query fails, it silently falls through to reading DECISIONS.md file directly
(V1 pattern). This violates ADR-040 DB-first principle and should be removed.

---

## Section 4: TODO/FIXME/HACK Inventory

### 4.1 Summary

| Pattern | Count (src/) | Count (tests/) | Total |
|---------|-------------|-----------------|-------|
| TODO | 3 | 3 | 6 |
| FIXME | 0 | 0 | 0 |
| HACK | 0 | 0 | 0 |
| XXX | 0 | 0 | 0 |
| TSXXXX | 1 | 0 | 1 |

**Note:** The total count of explicit TODO/FIXME/HACK markers in **src/ and tests/** is very low
(~7). This is because the codebase uses inline comments, Sprint tracking, and ADR system for
technical debt rather than scattered TODO comments. Most debt is captured in
`.brain/exports/debt.md` and the DB.

### 4.2 src/ TODO Inventory

**1. `src/core/plugin-hooks.ts:257`**
```
// Match lines like: path/to/file.ts(line,col): error TSXXXX: ...
```
- **Type:** Code comment (regex pattern note, not a TODO)
- **Category:** Informational — not actual debt
- **Priority:** N/A

**2. `src/dashboard/node_modules/@jridgewell/gen-mapping/src/gen-mapping.ts:308`**
```
// TODO: implement originalScopes/generatedRanges
```
- **Type:** Third-party library TODO (inside node_modules)
- **Category:** External — not Deckent code
- **Priority:** Irrelevant

**3. `src/dashboard/node_modules/@jridgewell/remapping/src/source-map-tree.ts:102`**
```
// TODO: Eventually support sourceRoot...
```
- **Type:** Third-party library TODO (inside node_modules)
- **Category:** External
- **Priority:** Irrelevant

**4. `src/dashboard/node_modules/@jridgewell/remapping/src/build-source-map-tree.ts:70`**
```
// TODO: We should eventually support async loading of sourcemap files.
```
- **Type:** Third-party library TODO (inside node_modules)
- **Category:** External
- **Priority:** Irrelevant

### 4.3 tests/ TODO Inventory

**1. `tests/orchestra/dependency-pipeline.test.ts:456`**
```typescript
// TODO(sprint-142): Sprint 139 Task 028 dependency scheduler (Kahn's
// algorithm topological + detectScopeCollisions, +620 LoC, Sprint 135 T-005 5. canlı dogfood)
```
- **Context:** Test for chain dependency scheduler, marked for Sprint 142 follow-up
- **Category:** PLANNED — sprint-tagged future work
- **Priority:** Medium — dependency scheduler is a Sprint 139 feature needing test alignment
- **Action:** Sprint 142 test update task

**2. `tests/orchestra/dependency-pipeline.test.ts:561`**
```typescript
// TODO(sprint-142): Same scheduler-semantics drift as the sibling test
```
- **Context:** Companion TODO to above — scheduler-semantics drift
- **Category:** PLANNED — sprint-tagged
- **Priority:** Medium — same as above
- **Action:** Sprint 142 batch fix with item 1

**3. `tests/cli/commands.test.ts:1209`**
```typescript
it.skip('creates config with selected mode — TODO: update mock for language-first init flow', ...)
```
- **Context:** Skipped test waiting for mock update (language-first init flow change)
- **Category:** URGENT — skipped test reduces coverage of init flow
- **Priority:** HIGH — `it.skip` means real behavior is untested
- **Action:** Immediate: update init mock or remove skip

### 4.4 Additional Implicit Technical Debt Markers

While not using `TODO`/`FIXME` keywords, the following comment patterns indicate technical debt:

**Sprint-tagged future work:**
- `// Sprint 139 fix for Sprint 138 false positive stale alert pattern` (auditor.ts:155)
- `// Sprint 139: Use mtime-cached reader...` (auditor.ts:270)
- `// Sprint 139: Multi-signal stale detection...` (auditor.ts:272)
- These are documentation of existing fixes — not debt

**`@deprecated` markers (planned removal):**
- Functions marked `@deprecated` should be inventoried in a separate ADR-038 review

**V1 fallback comments:**
```
src/monitor/auditor.ts:1580: /* DB failed, fall through to V1 */
```
- This is an implicit debt marker — V1 fallback violates Memory V2 migration goals

**"TEMP" patterns in code (not in comments):**
```
src/orchestra/spawn-backend-mock.ts — entire file is "mock" (temporary test infrastructure)
```

### 4.5 Sprint-Tagged Technical Debt (Non-Comment Form)

The following patterns appear in tests with sprint references suggesting planned work:

| Location | Reference | Type |
|----------|-----------|------|
| `tests/orchestra/dependency-pipeline.test.ts:456` | sprint-142 | PLANNED |
| `tests/orchestra/dependency-pipeline.test.ts:561` | sprint-142 | PLANNED |
| `tests/cli/commands.test.ts:1209` | `it.skip` | URGENT |

### 4.6 Category Summary

| Category | Count | Description |
|----------|-------|-------------|
| **URGENT** | 1 | `it.skip` test that should be fixed (commands.test.ts:1209) |
| **PLANNED** | 2 | Sprint-142 tagged TODOs (dependency-pipeline.test.ts) |
| **EXTERNAL** | 3 | Third-party library TODOs (node_modules, ignore) |
| **INFORMATIONAL** | 1 | Code comment mistaken for TODO (plugin-hooks.ts) |

---

## Verdict: ANALYZED

All 4 analyses completed. Key findings:

1. **Coverage (87%):** 40 orphan src files, mostly CLI commands and MCP resources. Memory V2 CLI commands (recall, remember, memory) have no dedicated tests — HIGH priority for Sprint 142.

2. **Performance (886 sync I/O calls):** `src/core/file-lock.ts` scan loops are the hottest path — 4 functions each scanning all lock files with readFileSync per file. `src/orchestra/tmux.ts` has 13 spawnSync calls. Auditor scan loop is mitigated by Sprint 139 mtime cache.

3. **Error Handling:** 422 bare `} catch {` blocks. ~302 have no explanatory comment. `src/agents/worker.ts` lines 1023 and 1388 are HIGH RISK silent swallows. Memory V2 violation at `auditor.ts:1580` (V1 fallback). `BrainError` and `DeckentError` are parallel hierarchies — no common base.

4. **TODO/FIXME (minimal):** Only 1 urgent item: `tests/cli/commands.test.ts:1209` (skipped test). 2 planned Sprint-142 items. Codebase has excellent comment hygiene — debt tracked in DB/ADR system.

---

*Generated: 2026-04-16 | Worker: w-141-014 | Task: 141-014*
