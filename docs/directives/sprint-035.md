# DIRECTIVES — Sprint 035 (Beta Cleanup Wave 1+2: Basic Fixes + Utility Extraction)

## Goal: Fix all P0 blockers, trivial P1-P3 fixes, extract shared utilities, and unify error handling. 17 tasks — foundation for all subsequent waves.

---

## Task 1: EventEmitter MaxListeners Fix
- Model: sonnet
- Effort: low
- Files: src/agents/worker-ipc.ts
- Scope: src/agents/

### Description
P0-001. worker-ipc.ts:224-228 uses `process` as EventEmitter without setMaxListeners. Create dedicated EventEmitter instance instead of using process. Set maxListeners to 0 (unlimited) or calculate based on expected worker count. This prevents MaxListenersExceededWarning in 10+ worker scenarios. 5+ tests.

### Tests
- Dedicated EventEmitter created (not process)
- No MaxListenersExceededWarning with 20 concurrent workers
- Existing IPC message routing still works
- 5+ tests

---

## Task 2: CI Workflow Test Fix — publish
- Model: sonnet
- Effort: low
- Files: tests/workflows/publish.test.ts
- Scope: tests/workflows/

### Description
P0-002. Test expects `npm test` step but workflow uses staged `npx vitest run`. Update test regex to accept both patterns: `/npm test|npx vitest run/`. Verify no other assertions depend on exact step format. 3+ tests.

### Tests
- Regex matches both `npm test` and `npx vitest run`
- Existing test assertions still pass
- 3+ tests

---

## Task 3: CI Workflow Test Fix — release
- Model: sonnet
- Effort: low
- Files: tests/github/workflows/release.test.ts
- Scope: tests/github/

### Description
P0-003. Same issue as Task 2 but for release workflow. Update test regex to `/npm test|npx vitest run/`. 3+ tests.

### Tests
- Regex matches both patterns
- 3+ tests

---

## Task 4: Onboard Test Timeout Fix
- Model: sonnet
- Effort: normal
- Files: tests/cli/commands/onboard.test.ts
- Scope: tests/cli/

### Description
P1-006. Onboard test has timeout/mock issues causing CI flakiness. Review mock setup for readline, system-profile detection, and subscription detection. Ensure all async operations are properly mocked with deterministic responses. Add explicit timeout configuration. 5+ tests.

### Tests
- All onboard test scenarios pass deterministically
- No timeout in CI environment
- Mock setup covers all async paths
- 5+ tests

---

## Task 5: README Badge Update
- Model: sonnet
- Effort: low
- Files: README.md
- Scope: ./

### Description
P1-007. README test badge shows `tests-3609` but actual count is 7,177+. Update badge to reflect current test count. Also update any other stale metrics in README (lines of code, coverage percentage, command count). Use dynamic badge URL if possible (shields.io with CI integration).

### Tests
- Badge shows correct test count
- No stale metrics in README

---

## Task 6: CHANGELOG Version Format
- Model: sonnet
- Effort: normal
- Files: docs/CHANGELOG.md
- Scope: docs/

### Description
P1-008. CHANGELOG uses inconsistent version format (`0.1.0-sprint33` vs semver). Standardize all entries to proper semver: `0.1.0-alpha.33` format. Add version header template for future sprints. Ensure latest entry is at the top.

### Tests
- All version entries follow semver format
- Latest entry is first

---

## Task 7: File Extension Constant Usage
- Model: sonnet
- Effort: low
- Files: src/cli/helpers/worker-status.ts, src/cli/commands/run.ts, src/monitor/auditor.ts
- Scope: src/cli/, src/monitor/

### Description
P2-003. Three files hardcode file extensions (`.hb`, `.json`, `.result`, etc.) instead of using `TASK_FILE_EXTENSIONS` from constants.ts. Replace all hardcoded extension filters with the constant. Remove duplicate extension array in run.ts.

### Tests
- All three files use TASK_FILE_EXTENSIONS
- No hardcoded extension strings remain
- Existing filtering behavior unchanged
- 5+ tests

---

## Task 8: Sprint Observation Docs Archive
- Model: sonnet
- Effort: low
- Files: docs/
- Scope: docs/

### Description
P2-008. Move 8 sprint observation files (sprint-018 through sprint-025 observations) to `docs/archive/observations/`. Create archive directory if not exists. Update any internal links that reference these files.

### Tests
- Files moved to archive
- No broken internal links

---

## Task 9: CI Coverage Gate
- Model: sonnet
- Effort: normal
- Files: .github/workflows/ci.yml
- Scope: .github/

### Description
P2-011. Add coverage threshold enforcement to CI. After test jobs complete, check coverage percentage against threshold (90%). Fail CI if coverage drops below threshold. Use vitest coverage output parsing. Add coverage badge to README.

### Tests
- CI fails when coverage below threshold
- CI passes when coverage above threshold
- Coverage badge URL correct
- 5+ tests

---

## Task 10: SECURITY.md Location
- Model: sonnet
- Effort: low
- Files: SECURITY.md, docs/SECURITY.md
- Scope: ./

### Description
P3-006. SECURITY.md is in docs/ but GitHub expects it at root. Create root SECURITY.md that either copies or symlinks to docs/SECURITY.md. Ensure GitHub security advisories page finds it.

### Tests
- SECURITY.md exists at root
- Content matches docs/SECURITY.md

---

## Task 11: PR Template Deckent-Specific
- Model: sonnet
- Effort: low
- Files: .github/pull_request_template.md
- Scope: .github/

### Description
P3-007. Current PR template is generic. Replace with Deckent-specific template: checklist items for tests, ADR reference (if architectural change), scope declaration, sprint ID, breaking change flag, documentation update.

### Tests
- Template contains Deckent-specific checklist
- All required sections present

---

## Task 12: FUNDING.yml Update
- Model: sonnet
- Effort: low
- Files: .github/FUNDING.yml
- Scope: .github/

### Description
P3-008. FUNDING.yml is placeholder. Update with GitHub Sponsors link for VerhexIO or remove if not ready. If sponsors not set up, add comment explaining future plans.

### Tests
- FUNDING.yml has valid content or clear placeholder

---

## Task 13: Utility Function Extraction
- Model: opus
- Effort: high
- Files: src/core/utils.ts, tests/core/utils.test.ts
- Scope: src/core/, tests/core/

### Description
P3-001. Extract repeated patterns into shared utilities in utils.ts:
1. `readFileIfExists(path: string): string | null` — existsSync + readFileSync pattern (used 10+ places)
2. `listFilesWithExtension(dir: string, ext: string | string[]): string[]` — readdirSync + filter pattern (used 8+ places)
3. `safeMapGet<K, V>(map: Map<K, V>, key: K, defaultValue: V): V` — Map.get with fallback (used 14+ places)
All functions must be pure, well-typed, and backward compatible. 15+ tests.

### Tests
- readFileIfExists returns content when file exists
- readFileIfExists returns null when file missing
- listFilesWithExtension filters correctly with single ext
- listFilesWithExtension filters correctly with ext array
- safeMapGet returns value when key exists
- safeMapGet returns default when key missing
- 15+ tests

---

## Task 14: readJsonSafe Migration
- Model: opus
- Effort: high
- Files: src/api/server.ts, src/core/config.ts, src/core/skill-registry.ts, src/core/subscription.ts, src/core/global-config.ts, src/dashboard/src/lib/api.ts (and 10+ more)
- Scope: src/

### Description
P2-004. Replace all inline `JSON.parse(readFileSync(path, 'utf-8'))` with `readJsonSafe()` from utils.ts. Currently only 5 files use readJsonSafe while 15+ use inline pattern. Create async variant `readJsonSafeAsync()` for files that need it. Ensure error handling is consistent (return null on failure, never throw). 10+ tests.

### Tests
- All inline JSON.parse replaced with readJsonSafe
- readJsonSafeAsync works for async contexts
- Error returns null, not throw
- 10+ tests

---

## Task 15: Error Handling Unification
- Model: opus
- Effort: high
- Files: src/cli/commands/*.ts, src/orchestra/*.ts, src/agents/*.ts
- Scope: src/cli/, src/orchestra/, src/agents/

### Description
P2-001. Replace generic `throw new Error()` (75+ instances) with `DeckentError` + error codes from ErrorRegistry. DeckentError infrastructure already exists (src/core/errors.ts). For each module:
- CLI: use error codes DECKENT_E020-E039 (command-specific)
- Orchestra: use error codes DECKENT_E040-E059 (orchestration)
- Agents: use error codes DECKENT_E060-E079 (agent/worker)
Register all new codes in ErrorRegistry with message + suggestion + docLink. 20+ tests.

### Tests
- No generic `throw new Error()` in CLI commands
- No generic `throw new Error()` in orchestra modules
- No generic `throw new Error()` in agent modules
- All new error codes registered in ErrorRegistry
- Error messages include actionable suggestions
- 20+ tests

---

## Task 16: Silent Catch Logging
- Model: sonnet
- Effort: low
- Files: src/core/utils.ts
- Scope: src/core/

### Description
P3-003. Three silent catch blocks in utils.ts (lines 41, 47, 107) swallow errors without any logging. Replace with `process.stderr.write()` logging at debug level. Use pattern: `process.stderr.write(\`[deckent:debug] ${context}: ${err}\n\`)`. Only log when DECKENT_DEBUG env is set. 5+ tests.

### Tests
- Silent catches now log when DECKENT_DEBUG=1
- No logging when DECKENT_DEBUG is unset
- Existing behavior (return fallback value) unchanged
- 5+ tests

---

## Task 17: parseBody Type Safety
- Model: sonnet
- Effort: normal
- Files: src/api/server.ts
- Scope: src/api/

### Description
P3-012. `parseBody()` returns `Promise<unknown>`. Add Zod schema validation for each API endpoint's expected body. Create endpoint-specific schemas: `StartBodySchema`, `PlanBodySchema`, `ConfigBodySchema`, `DirectivesBodySchema`, `KillBodySchema`. Validate parsed body against schema before use. Return 400 with descriptive error on validation failure. 10+ tests.

### Tests
- Valid body passes validation
- Invalid body returns 400 with error details
- Missing required fields detected
- Extra fields stripped or ignored
- 10+ tests
