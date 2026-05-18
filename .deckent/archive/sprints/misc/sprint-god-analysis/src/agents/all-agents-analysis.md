# God Analysis: src/agents/ (16 files, 4345 LoC total)

---

# Analysis: src/agents/index.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 18 | **Effort:** max

## 1. Amaci
Barrel re-export module for the `src/agents/` directory. Re-exports all public API symbols from `worker.ts` -- the primary worker module. This file serves as the single entry point for consumers who need worker functionality (task claiming, locking, heartbeat, result writing). It is the sole barrel; other agent-tier modules (adaptive-agent, prompt-*, etc.) are imported directly by consumers.

## 2. Public API
All symbols are re-exports from `./worker.js`:
- `readTask` -- JSDoc: via worker.ts (present)
- `claimTask` -- JSDoc: via worker.ts (present)
- `writeTaskPlan` -- JSDoc: via worker.ts (present)
- `acquireLock` -- JSDoc: via worker.ts (@deprecated, present)
- `releaseLock` -- JSDoc: via worker.ts (@deprecated, present)
- `releaseAllLocks` -- JSDoc: via worker.ts (@deprecated, present)
- `checkLock` -- JSDoc: via worker.ts (@deprecated, present)
- `createHeartbeat` -- JSDoc: via worker.ts (present)
- `writeHeartbeat` -- JSDoc: via worker.ts (present)
- `writeResult` -- JSDoc: via worker.ts (present)
- `updateTaskStatus` -- JSDoc: via worker.ts (present)
- `isWithinScope` -- JSDoc: via worker.ts (present)
- `readWorkerLog` -- JSDoc: via worker.ts (present)
- `TaskClaimError` -- class export
- `LockError` -- class re-export from core/file-lock.ts
- `ScopeViolationError` -- class export

**Notable omissions from barrel:** `atomicWriteFileSync`, `finalizeHeartbeat`, `writeFinishedHeartbeat`, `verifyTests`, `verifyCompilation`, `runTestVerifyLoop`, `runCompilationLoop`, `calculateProgress`, `parseVitestOutput`, `parseCompilationErrors`, `getVerifyCommands`, `isDocOnlyScope`, `enforceVerifyLoop`, `checkWorkerAuthority`, `emitWorkerQuestion`, all formatting functions, `WorkerStateMachine`, `WorkerSideChannel`, `ChannelRegistry`, verify-delta functions, feedback loop functions. These are only accessible via direct import from `worker.ts`.

## 3. Ic Bagimliliklar
- `./worker.js` -- sole import. No circular dependency risk.

## 4. Dis Bagimliliklar
None (pure re-export).

## 5. Complexity
Zero logic. 1 export statement. Cyclomatic complexity: 1.

## 6. Type Safety
No issues. Pure re-export. No `any`, no `@ts-ignore`, no unsafe casts.

## 7. ADR Compliance
- ADR-008: Correct -- does not import from brain/orchestra.
- ADR-010: N/A (no dependencies).
- All other ADRs: N/A.

## 8. Test Coverage
No dedicated `tests/agents/index.test.ts` exists. Not strictly needed since it is a pure re-export. Consumers test the re-exported functions via `worker.test.ts` and related files.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
The barrel is incomplete -- many worker.ts exports are NOT re-exported. This is by design (only the "classic" worker API is exposed), but creates a confusing split where consumers sometimes import from `src/agents/index.ts` and sometimes from `src/agents/worker.ts` directly.

## 11. Security
N/A -- pure re-export.

## 12. Memory V2 Uyumu
N/A -- no memory interaction.

## 13. i18n
N/A.

## 14. Dokumantasyon Tutarliligi
No JSDoc on the barrel itself. No module-level comment explaining what is and is not re-exported. The incomplete re-export list could confuse new contributors.

## 15. Performance
N/A -- barrel module, loaded once.

## 16. Oneriler
- **P3:** Consider adding a module-level comment explaining the re-export policy and listing intentionally omitted symbols.
- **P3:** Consider whether the incomplete barrel creates confusion; either export everything or document why not.

## Verdict: ANALYZED

---

# Analysis: src/agents/adaptive-agent.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 213 | **Effort:** max

## 1. Amaci
Analyzes prompt effectiveness for agents based on recent sprint results and suggests prompt improvements. The `AdaptiveAgent` class provides two methods: one to measure an agent's success rate over the last 3 sprints and detect weaknesses (high NO_GO rate, low coverage, declining performance, tech debt accumulation, inconsistent coverage), and another to suggest prompt additions to address detected weaknesses. It is a planning-time analysis tool used by the Agent/Skill Evolution Pipeline. It never auto-applies changes.

## 2. Public API
- `interface PromptDiff { original, suggested, reasoning, changedSections }` -- JSDoc: MISSING
- `interface EffectivenessResult { successRate, needsImprovement, weaknesses }` -- JSDoc: MISSING
- `interface ResultEntry { evaluation, coverage, sprintId }` -- JSDoc: MISSING
- `class AdaptiveAgent` -- JSDoc: MISSING (class-level)
  - `analyzePromptEffectiveness(agentId, recentResults): EffectivenessResult` -- JSDoc: present
  - `suggestPromptChange(agentId, currentPrompt, weaknesses): PromptDiff` -- JSDoc: present

## 3. Ic Bagimliliklar
None -- zero imports from any other module. Fully self-contained.

## 4. Dis Bagimliliklar
None -- no node_modules, no native modules. ADR-010 compliant.

## 5. Complexity
- 2 public methods + 5 weakness detection functions (lambda in WEAKNESS_PATTERNS array).
- `suggestPromptChange` is the most complex (line 144-212): iterates weaknesses, appends sections. Rough cyclomatic: ~7.
- `analyzePromptEffectiveness` (line 99-137): filtering, success rate. Rough cyclomatic: ~4.

## 6. Type Safety
No `any`, no `@ts-ignore`, no `as unknown`, no non-null `!`, no unsafe casts. All types are explicit.

## 7. ADR Compliance
- ADR-008: Correct -- no brain import.
- ADR-010: Correct -- zero dependencies.
- ADR-033 (product vision): Neutral -- analysis tool, not telemetry.
- Memory V2: N/A -- does not interact with memory. Data is passed in via parameters.

## 8. Test Coverage
- `tests/agents/adaptive-agent.test.ts` exists. Tests cover:
  - Empty results, single sprint, multiple sprints, weakness detection patterns.
  - suggestPromptChange with various weakness combinations.
  - Good coverage overall.
- No Memory V2 mocks needed (module does not use DB).

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `_agentId` parameter in both methods is prefixed with underscore, indicating it is intentionally unused. However, it still occupies the API signature. Not dead code per se, but signals future intent.
- All 5 WEAKNESS_PATTERNS are actively used in the detection loop.

## 11. Security
No external input handling, no injection risk. Pure computation on in-memory data.

## 12. Memory V2 Uyumu
N/A -- does not interact with .brain/ or any storage. Data arrives via function parameters.

## 13. i18n
All strings are English-only (weakness labels, suggestion text). No TR/EN localization. This is expected for internal analysis output.

## 14. Dokumantasyon Tutarliligi
- Method JSDoc is present and accurate.
- Interface-level JSDoc is MISSING for all 3 exported interfaces.
- The module header comment accurately describes behavior.

## 15. Performance
No I/O operations at all. Pure in-memory computation. No performance concerns.

## 16. Oneriler
- **P3:** Add JSDoc to exported interfaces for API documentation completeness.
- **P3:** Consider using `agentId` parameter (currently unused) or removing the underscore prefix if it's only there for future use.

## Verdict: ANALYZED

---

# Analysis: src/agents/prompt-version.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 226 | **Effort:** max

## 1. Amaci
Manages versioned prompt history for agents. Each agent can have up to 10 prompt versions stored as JSON files under `.deckent/agents/{id}/versions/`. Supports creating new versions, activating specific versions, listing all versions, and pruning old versions beyond the MAX_VERSIONS cap. Used by the prompt evolution pipeline and rollback system. When a version is created or activated, it also writes the PROMPT.md file for the agent.

## 2. Public API
- `interface PromptVersion { version, content, reason, createdAt, stats: { uses, successRate } }` -- JSDoc: MISSING
- `class PromptVersionManager` -- JSDoc: MISSING (class-level)
  - `constructor(projectRoot: string)` -- private field
  - `createVersion(agentId, content, reason): PromptVersion` -- JSDoc: present
  - `getVersion(agentId, version): PromptVersion | null` -- JSDoc: present
  - `getCurrentVersion(agentId): PromptVersion | null` -- JSDoc: present
  - `listVersions(agentId): PromptVersion[]` -- JSDoc: present
  - `activateVersion(agentId, version): boolean` -- JSDoc: present
  - `updateVersionStats(agentId, version, evaluation): void` -- JSDoc: present

## 3. Ic Bagimliliklar
None -- imports only from Node.js built-ins.

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync)
- `node:path` (join)
ADR-010 compliant (Node built-ins only).

## 5. Complexity
- 6 public methods + 7 private helper methods.
- `listVersions` (line 88-113) is the most complex: directory listing, regex matching, JSON parsing with error handling. Rough cyclomatic: ~6.
- `_pruneOldVersions` (line 209-225): simple loop with deletion.

## 6. Type Safety
- No `any`, no `@ts-ignore`.
- `JSON.parse(content) as PromptVersion` at line 70 and line 100: `as` cast without validation. Risk of malformed data.
- `JSON.parse(content) as { currentVersion?: number }` at line 196: `as` cast without validation.

## 7. ADR Compliance
- ADR-008: Correct -- no brain import.
- ADR-010: Correct -- Node built-ins only.
- ADR-005 (deprecated sync I/O): Uses sync I/O throughout (readFileSync, writeFileSync). This is consistent with the project's ADR-005 deprecation -- the project historically uses sync I/O and has accepted this pattern.

## 8. Test Coverage
- `tests/agents/prompt-version.test.ts` exists. Tests cover:
  - Version creation, listing, activation, pruning, stats update.
  - Good coverage. No Memory V2 mocks needed.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
No unused exports. All methods are referenced by prompt-rollback.ts and prompt-analytics.ts.

## 11. Security
- `agentId` is used directly in file paths without sanitization: `join(this.projectRoot, AGENTS_DIR, agentId)`. A malicious agentId like `../../etc` could cause directory traversal. However, agentIds are generated by the system, not user input.
- JSON parse of untrusted file content uses bare `as` cast without schema validation.

## 12. Memory V2 Uyumu
N/A -- file-based versioning system, not related to brain memory.

## 13. i18n
No user-facing strings. Internal JSON storage.

## 14. Dokumantasyon Tutarliligi
- Method JSDoc is present and accurate.
- `PromptVersion` interface lacks JSDoc.
- Module header comment is accurate.

## 15. Performance
- 11 sync I/O calls across the class (readFileSync x4, writeFileSync x3, existsSync x3, readdirSync x1).
- `listVersions` reads all version files sequentially. For 10 versions max, this is acceptable.
- `_pruneOldVersions` calls `listVersions` again (double read). Minor inefficiency.

## 16. Oneriler
- **P2:** Add input validation for `agentId` to prevent directory traversal attacks.
- **P3:** `_pruneOldVersions` could accept the already-loaded versions list to avoid double disk read.
- **P3:** Consider Zod validation for JSON.parse results instead of bare `as` casts.

## Verdict: ANALYZED

---

# Analysis: src/agents/prompt-rollback.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 150 | **Effort:** max

## 1. Amaci
Provides automatic rollback to the best historical prompt version when the current version is underperforming. Works in conjunction with `PromptVersionManager` to detect when a prompt's success rate drops below 50% after at least 3 uses, find the best historical version, activate it, and log the rollback event. Rollback logs are stored in `.deckent/agents/{id}/rollback-log.json`.

## 2. Public API
- `interface RollbackResult { rolledBackTo, reason }` -- JSDoc: MISSING
- `interface RollbackLogEntry { timestamp, fromVersion, toVersion, reason }` -- JSDoc: MISSING
- `class PromptRollback` -- JSDoc: MISSING (class-level)
  - `constructor(projectRoot: string)`
  - `shouldRollback(agentId, currentStats): boolean` -- JSDoc: present
  - `rollbackPrompt(agentId): RollbackResult | null` -- JSDoc: present
  - `canRollback(agentId): boolean` -- JSDoc: present
  - `logRollback(agentId, fromVersion, toVersion, reason): void` -- JSDoc: present
  - `getRollbackLog(agentId): RollbackLogEntry[]` -- JSDoc: present

## 3. Ic Bagimliliklar
- `./prompt-version.js` -- imports `PromptVersionManager`. No circular risk.

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync, writeFileSync, mkdirSync)
- `node:path` (join)
ADR-010 compliant.

## 5. Complexity
- 5 public methods + 2 private helpers.
- `rollbackPrompt` (line 54-91) is the most complex: iterates versions, selects best, activates, logs. Rough cyclomatic: ~6.

## 6. Type Safety
- `JSON.parse(content)` at line 143 with `Array.isArray` check then `as RollbackLogEntry[]` cast. Partial validation (array check) but individual entries are not validated.
- No `any`, no `@ts-ignore`.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct.
- ADR-037: N/A (not an RBAC-relevant module).

## 8. Test Coverage
- `tests/agents/prompt-rollback.test.ts` exists. Tests cover:
  - shouldRollback logic, rollbackPrompt success/failure, canRollback, log reading.
  - Good coverage.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `_agentId` in `shouldRollback` is unused (prefixed with underscore). The parameter exists for API consistency but wastes space.

## 11. Security
- Same directory traversal concern as prompt-version.ts (agentId in path).
- Rollback log is append-only, written atomically.

## 12. Memory V2 Uyumu
N/A -- file-based prompt management, not brain memory.

## 13. i18n
No user-facing strings.

## 14. Dokumantasyon Tutarliligi
- Method JSDoc is present and accurate.
- Interface JSDoc is MISSING.

## 15. Performance
- 4 sync I/O operations: readFileSync, writeFileSync, existsSync, mkdirSync.
- Acceptable for the rollback use case (rare operation).

## 16. Oneriler
- **P3:** Add Zod schema validation for rollback log entries.
- **P3:** Consider using the `agentId` parameter in `shouldRollback` or remove underscore prefix.

## Verdict: ANALYZED

---

# Analysis: src/agents/specialization-drift.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 107 | **Effort:** max

## 1. Amaci
Detects when an agent's actual task execution drifts from its declared specialization keywords. Compares trigger keywords (from agent config) against actual task type/title tokens from recent results. Produces a drift score (0 = aligned, 1 = drifted) and a recommendation ('keep', 'respecialize', or 'create_new_agent'). Used by the promotion pipeline and agent evolution system.

## 2. Public API
- `interface RecentResult { taskType, taskTitle, evaluation }` -- JSDoc: MISSING
- `interface DriftReport { agentId, originalSpecialization, currentSpecialization, driftScore, recommendation }` -- JSDoc: MISSING
- `class SpecializationDriftDetector` -- JSDoc: MISSING (class-level)
  - `detect(agentId, triggerKeywords, recentResults): DriftReport` -- JSDoc: present
  - `_extractActualKeywords(results): string[]` -- JSDoc: present (public-prefixed private)
  - `_computeDriftScore(originalSet, actualKeywords): number` -- JSDoc: present (public-prefixed private)
  - `_computeRecommendation(driftScore): string` -- JSDoc: present (public-prefixed private)

## 3. Ic Bagimliliklar
None -- fully self-contained.

## 4. Dis Bagimliliklar
None -- ADR-010 compliant.

## 5. Complexity
- 1 public method + 3 internal methods (prefixed `_` but not truly private).
- `_extractActualKeywords` (line 66-76): tokenization logic. Rough cyclomatic: ~3.
- `_computeDriftScore` (line 82-97): set overlap calculation. Rough cyclomatic: ~4.

## 6. Type Safety
No `any`, no `@ts-ignore`, no unsafe casts. All types are explicit.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct (no deps).

## 8. Test Coverage
- `tests/agents/specialization-drift.test.ts` exists. Tests cover drift detection with various keyword overlaps.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
No unused exports.

## 11. Security
No external input or I/O. Pure computation.

## 12. Memory V2 Uyumu
N/A.

## 13. i18n
No user-facing strings.

## 14. Dokumantasyon Tutarliligi
Method JSDoc is present. Interface JSDoc is MISSING.

## 15. Performance
No I/O. Pure in-memory computation. No concerns.

## 16. Oneriler
- **P3:** Methods prefixed `_` should be `private` for proper encapsulation. They are tested directly in tests, which suggests test coupling.
- **P3:** Consider stemming or lemmatization for more accurate keyword matching.

## Verdict: ANALYZED

---

# Analysis: src/agents/permission-guard.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 219 | **Effort:** max

## 1. Amaci
Validates agent modification attempts to enforce security boundaries: prevents self-modification (agents cannot modify their own source), tool escalation (non-brain agents cannot modify .claude/settings or .mcp/), unauthorized agent config changes (only Brain can modify agent configs), and auditor source code writes. Implements ADR-037 RBAC at the file-path level. Logs blocked attempts to `.deckent/logs/permission-guard.log`. Accepts injectable FS for testability.

## 2. Public API
- `type AgentRole = 'brain' | 'auditor' | 'worker'` -- JSDoc: MISSING
- `interface ModificationAttempt { agentId, agentRole, targetPath, action, timestamp }` -- JSDoc: MISSING
- `interface ValidationResult { allowed, reason }` -- JSDoc: MISSING
- `interface PermissionGuardFS { existsSync, readFileSync, appendFileSync, mkdirSync }` -- JSDoc: MISSING
- `class PermissionGuard` -- JSDoc: MISSING (class-level)
  - `constructor(projectRoot, options?: { logDir?, fs? })` -- no JSDoc
  - `validateAgentModification(attempt): ValidationResult` -- JSDoc: present, detailed rule description
  - `getLogPath(): string` -- JSDoc: present

## 3. Ic Bagimliliklar
None (imports only from Node built-ins).

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync, appendFileSync, mkdirSync)
- `node:path` (join, resolve, normalize, sep)
ADR-010 compliant.

## 5. Complexity
- 2 public methods + 5 private methods.
- `validateAgentModification` (line 76-108): chains 4 rule checks. Rough cyclomatic: ~5.
- `_checkSelfModification` (line 119-141): iterates self-paths with startsWith. Rough cyclomatic: ~4.
- Most complex: `_normalizePath` (line 193-202) -- path normalization with platform-aware conversion.

## 6. Type Safety
No `any`, no `@ts-ignore`, no unsafe casts. Clean typing throughout.

## 7. ADR Compliance
- **ADR-037:** This IS the RBAC enforcement module -- direct implementation. Correctly implements 4 rules.
- **ADR-008:** Correct -- no brain import.
- **ADR-039:** Related -- self-modification detection is one of the rules.

## 8. Test Coverage
- `tests/agents/permission-guard.test.ts` exists. Tests cover:
  - Self-modification blocking for all 3 roles.
  - Tool escalation blocking.
  - Agent config modification permissions.
  - Auditor source write blocking.
  - Injectable FS for testing.
  - Good coverage.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `readFileSync` is imported but NOT used in the current code. It's part of `PermissionGuardFS` interface but the class never calls `this.fs.readFileSync`. Unused import/interface member.

## 11. Security
- **Strong:** Path normalization prevents basic traversal attacks.
- **Concern:** The self-modification check at line 132 uses `targetPath.startsWith(ownPath.replace('.ts', ''))` which could match unintended files (e.g., `src/agents/worker-ipc.ts` would match the `src/agents/worker` prefix from the worker role's self-paths). This is by design (workers cannot modify worker-*.ts) but the pattern is fragile.
- **Concern:** Brain is fully trusted for tool config modification (line 145) -- no additional validation.

## 12. Memory V2 Uyumu
N/A -- permission system, not memory-related.

## 13. i18n
Reason strings are English-only. Internal logging.

## 14. Dokumantasyon Tutarliligi
- `validateAgentModification` has excellent inline rule documentation.
- Interface-level JSDoc is MISSING.

## 15. Performance
- Logging is best-effort (try/catch). mkdirSync per log write is potentially wasteful -- could be cached.
- No hot-path concerns.

## 16. Oneriler
- **P2:** Remove unused `readFileSync` from the FS interface and import.
- **P2:** The `startsWith(ownPath.replace('.ts', ''))` self-modification pattern is fragile -- consider exact match or regex.
- **P3:** Cache the log directory existence check to avoid repeated mkdirSync calls.

## Verdict: ANALYZED

---

# Analysis: src/agents/cross-sprint-analyzer.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 242 | **Effort:** max

## 1. Amaci
Analyzes agent performance across multiple sprints by reading from `.brain/learning/` directory. Produces a `CrossSprintReport` with success trends, coverage trends, task type distribution, best/worst task types, and improvement suggestions. Used by the agent evolution pipeline to identify agents needing prompt changes or retirement.

## 2. Public API
- `interface SprintEntry { sprintId, evaluation, coverage, taskType, durationMs? }` -- JSDoc: MISSING
- `interface CrossSprintReport { agentId, sprintsAnalyzed, successTrend, coverageTrend, taskTypeDistribution, bestTaskType, worstTaskType, improvementSuggestions }` -- JSDoc: MISSING
- `interface SprintRange { from, to }` -- JSDoc: MISSING
- `class CrossSprintAnalyzer` -- JSDoc: MISSING (class-level)
  - `constructor(projectRoot: string)`
  - `analyze(agentId, sprintRange): CrossSprintReport` -- JSDoc: present
  - `_loadEntries(agentId, range): SprintEntry[]` -- public-prefixed private
  - `_inRange(sprintId, range): boolean`
  - `_uniqueSprintIds(entries): string[]`
  - `_computeSuccessTrend(entries, sprintIds): number[]`
  - `_computeCoverageTrend(entries, sprintIds): number[]`
  - `_computeTaskTypeDistribution(entries): Record<string, number>`
  - `_computeBestWorstTaskType(entries): { best, worst }`
  - `_generateSuggestions(successTrend, coverageTrend, distribution, entries): string[]`
  - `_emptyReport(agentId): CrossSprintReport`

## 3. Ic Bagimliliklar
None -- imports only from Node built-ins.

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync, readdirSync)
- `node:path` (join)
ADR-010 compliant.

## 5. Complexity
- 1 public method + 9 internal methods.
- `_loadEntries` (line 82-115): file I/O, JSON parsing, filtering. Most complex. Rough cyclomatic: ~8.
- `_generateSuggestions` (line 184-228): 4 heuristic checks. Rough cyclomatic: ~6.

## 6. Type Safety
No `any`, no `@ts-ignore`. `JSON.parse(fs.readFileSync(...))` at line 96 without explicit cast is followed by `Array.isArray` check. Entries are cast implicitly via property access.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct.
- **Memory V2 concern:** Reads from `.brain/learning/` directory which is a file-based legacy path. This is NOT the DB-first approach. However, this module reads LEARNING data, which is not part of the Memory V2 schema (learning files are separate from the entries table). This is an architectural gray area.

## 8. Test Coverage
- `tests/agents/cross-sprint-analyzer.test.ts` exists.
- Tests mock file system for learning directory reads.
- Good coverage.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `_taskTypeDistribution` parameter in `_generateSuggestions` (line 187) is prefixed with underscore but actually used at line 218-225. This is misleading naming -- the underscore prefix conventionally means "unused" but the parameter IS used.

## 11. Security
No external input. File reads from known project-internal paths.

## 12. Memory V2 Uyumu
**Partial concern:** Reads from `.brain/learning/` (file-based). This is not part of the Memory V2 DB schema, but the data is agent performance tracking data, not ADR/memory/debt. The .brain/learning/ directory may or may not exist in current projects. The module gracefully handles missing directory.

## 13. i18n
Suggestion strings are English-only. Internal analysis output.

## 14. Dokumantasyon Tutarliligi
- Only `analyze()` has JSDoc. All internal methods and interfaces lack JSDoc.
- Module header comment accurately describes purpose.

## 15. Performance
- Reads all JSON files in `.brain/learning/` directory sequentially. Could be slow with many files.
- 3 sync I/O operations per file.

## 16. Oneriler
- **P2:** Consider migrating learning data to Memory V2 DB (entries with type='learning') for consistency with DB-first architecture.
- **P3:** Fix misleading underscore prefix on `_taskTypeDistribution` parameter that is actually used.
- **P3:** All `_`-prefixed methods should be `private`.

## Verdict: ANALYZED

---

# Analysis: src/agents/prompt-evolution.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 132 | **Effort:** max

## 1. Amaci
Records and retrieves prompt evolution history for agents. Stores evolution events (created, improved, reverted, specialized, merged) in `.deckent/agents/{id}/evolution.json`. Provides timeline formatting and event management. Used by the promotion pipeline to track agent prompt lineage over time.

## 2. Public API
- `type EvolutionType = 'created' | 'improved' | 'reverted' | 'specialized' | 'merged'` -- JSDoc: MISSING
- `interface StatsAtTime { successRate, totalUses, avgCoverage }` -- JSDoc: MISSING
- `interface EvolutionEvent { type, version, timestamp, triggerReason, statsAtTime }` -- JSDoc: MISSING
- `interface EvolutionTimeline { agentId, events, totalEvolutions, latestVersion }` -- JSDoc: MISSING
- `class PromptEvolutionLog` -- JSDoc: MISSING (class-level)
  - `recordEvolution(agentId, event): void` -- JSDoc: present
  - `getEvolutionTimeline(agentId): EvolutionTimeline` -- JSDoc: present
  - `formatTimeline(timeline): string` -- JSDoc: present
  - `getEventCount(agentId): number` -- JSDoc: present
  - `clearEvents(agentId): void` -- JSDoc: present

## 3. Ic Bagimliliklar
None.

## 4. Dis Bagimliliklar
- `node:fs`, `node:path`. ADR-010 compliant.

## 5. Complexity
- 5 public methods + 2 internal methods.
- `formatTimeline` (line 74-92): string formatting loop. Rough cyclomatic: ~3.
- Overall low complexity.

## 6. Type Safety
- `JSON.parse(fs.readFileSync(...))` at line 115 with `Array.isArray` check, then `as EvolutionEvent[]` cast. Partial validation.

## 7. ADR Compliance
- ADR-008: Correct. ADR-010: Correct.

## 8. Test Coverage
- `tests/agents/prompt-evolution.test.ts` exists. Good coverage.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
No unused exports.

## 11. Security
- Same agentId path traversal concern as other prompt modules.

## 12. Memory V2 Uyumu
N/A -- agent-specific evolution data, not brain memory.

## 13. i18n
English-only formatting strings.

## 14. Dokumantasyon Tutarliligi
Method JSDoc present. Interface JSDoc MISSING.

## 15. Performance
2 sync I/O operations per method call. `getEventCount` loads all events just to count them (inefficient but acceptable for small datasets).

## 16. Oneriler
- **P3:** `getEventCount` could read file size or use a lightweight check instead of full parse.
- **P3:** Add interface-level JSDoc.

## Verdict: ANALYZED

---

# Analysis: src/agents/agent-retirement.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 206 | **Effort:** max

## 1. Amaci
Evaluates agents for retirement based on performance criteria (success rate below 30%, at least 5 sprints, at least 10 uses). Built-in agents cannot be retired, only disabled. Retired agents are moved from `.deckent/agents/{id}/` to `.deckent/agents/.retired/{id}/` with both the agent config and a retirement record preserved. Supports reinstatement (moving back to active pool) and listing all retired agents.

## 2. Public API
- `interface RetirementStats { successRate, totalUses, sprintsParticipated }` -- JSDoc: MISSING
- `interface RetirementConfig { minSuccessRate, minSprints, minUses }` -- JSDoc: MISSING
- `interface RetirementResult { shouldRetire, reasons }` -- JSDoc: MISSING
- `interface RetiredAgentRecord { id, retiredAt, reason, stats, source }` -- JSDoc: MISSING
- `class AgentRetirement` -- JSDoc: MISSING (class-level)
  - `evaluateForRetirement(agentId, stats, source, config?): RetirementResult` -- JSDoc: present
  - `retire(agentId, reason): boolean` -- JSDoc: present
  - `reinstate(agentId): boolean` -- JSDoc: present
  - `listRetired(): RetiredAgentRecord[]` -- JSDoc: present

## 3. Ic Bagimliliklar
None.

## 4. Dis Bagimliliklar
- `node:fs`, `node:path`. ADR-010 compliant.

## 5. Complexity
- 4 public methods + 0 private helpers.
- `retire` (line 93-146): reads agent file, creates retirement record, moves files, deletes original. Most complex. Rough cyclomatic: ~6.
- `evaluateForRetirement` (line 58-88): 3 threshold checks. Rough cyclomatic: ~5.

## 6. Type Safety
- Line 119: `(agentData.stats as Record<string, unknown>).successRate as number ?? 0` -- double `as` cast. Unsafe. If `stats` structure is different, this silently produces undefined before the `?? 0`.
- Line 127: `agentData.source as 'builtin' | 'user' | 'learned' ?? 'user'` -- `as` cast. Operator precedence issue: `as` binds tighter than `??`, so this is actually `(agentData.source as 'builtin' | 'user' | 'learned') ?? 'user'`.
- Line 99: `JSON.parse(fs.readFileSync(...))` cast to `Record<string, unknown>` -- acceptable generic type.
- `_agentId` parameter in `evaluateForRetirement` is unused.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct.
- ADR-037: Retirement is Brain-only operation. No RBAC check in this module (relies on caller).

## 8. Test Coverage
- `tests/agents/agent-retirement.test.ts` exists. Tests cover evaluation, retirement, reinstatement, listing.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `_agentId` parameter in `evaluateForRetirement` is unused.

## 11. Security
- `fs.rmSync(agentDir, { recursive: true, force: true })` at line 144: destructive operation. If `agentId` were attacker-controlled, this could delete arbitrary directories. System-generated IDs mitigate risk.
- Path traversal concern with agentId.

## 12. Memory V2 Uyumu
N/A.

## 13. i18n
English-only reason strings.

## 14. Dokumantasyon Tutarliligi
Method JSDoc present. Interface JSDoc MISSING.

## 15. Performance
- `retire` performs 5 sync I/O operations (read, mkdir x2, writeFileSync x2, rmSync).
- `listRetired` reads all directories and files sequentially.

## 16. Oneriler
- **P1:** Fix unsafe double-cast at lines 118-127. Use proper type narrowing or Zod validation.
- **P2:** Add agentId validation to prevent path traversal in `retire` and `reinstate`.
- **P3:** Consider archiving to Memory V2 DB for audit trail (retired agent records).

## Verdict: ANALYZED

---

# Analysis: src/agents/shared-context.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 120 | **Effort:** max

## 1. Amaci
Enables agents to share key-value data atomically via a JSON file at `.tasks/shared-context.json`. Workers can write data that other workers can read during the same sprint. Uses atomic write pattern (temp file + rename) for crash safety. Provides CRUD operations: write, read, readAll, remove, clear, size, has. Used for inter-worker communication during sprint execution.

## 2. Public API
- `interface SharedContextEntry { agentId, value: unknown, timestamp }` -- JSDoc: MISSING
- `class SharedContext` -- JSDoc: MISSING (class-level)
  - `constructor(projectRoot: string)`
  - `write(agentId, key, value): void` -- JSDoc: present, with input validation
  - `read(key): SharedContextEntry | undefined` -- JSDoc: present
  - `readAll(): Record<string, SharedContextEntry>` -- JSDoc: present
  - `clear(): void` -- JSDoc: present
  - `remove(key): boolean` -- JSDoc: present
  - `size(): number` -- JSDoc: present
  - `has(key): boolean` -- JSDoc: present

## 3. Ic Bagimliliklar
- `../core/errors.js` -- imports `ErrorRegistry`. Correct dependency direction.

## 4. Dis Bagimliliklar
- `node:fs`, `node:path`. ADR-010 compliant.

## 5. Complexity
- 7 public methods + 2 private helpers.
- All methods are simple. `_writeAtomic` (line 112-118) uses tmp+rename pattern. Max cyclomatic: ~3.

## 6. Type Safety
- `value: unknown` in `SharedContextEntry` -- correctly typed as `unknown` rather than `any`.
- `JSON.parse(content)` at line 102 with type checking (`typeof`, `Array.isArray`). Good validation.
- No `any`, no `@ts-ignore`.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct (only `../core/errors.js`).
- ADR-006: Uses `writeFileSync` + `renameSync` for atomic writes (not spawnSync).

## 8. Test Coverage
- `tests/agents/shared-context.test.ts` exists. Comprehensive tests for CRUD operations.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
No unused exports.

## 11. Security
- Input validation: key and agentId are validated as non-empty strings.
- `value: unknown` allows arbitrary data -- no schema validation. Acceptable for inter-worker KV store.

## 12. Memory V2 Uyumu
N/A -- sprint-scoped temporary data, not persistent memory.

## 13. i18n
No user-facing strings.

## 14. Dokumantasyon Tutarliligi
Method JSDoc present and accurate. Interface/class JSDoc MISSING.

## 15. Performance
- Every `read`, `readAll`, `size`, `has` call reads the entire JSON file from disk. For high-frequency reads, this is a hot path concern. However, shared context is typically small and read infrequently.
- `_readAll` is called on every operation -- no caching. By design (multi-process safety).

## 16. Oneriler
- **P3:** Consider documenting the trade-off of no-cache multi-process safety vs read performance.
- **P3:** Interface and class-level JSDoc should be added.

## Verdict: ANALYZED

---

# Analysis: src/agents/agent-genealogy.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 187 | **Effort:** max

## 1. Amaci
Tracks parent-child relationships between agents in a genealogy tree stored at `.deckent/agents/genealogy.json`. Supports registering agents with optional parents, building a family tree (roots + edges), finding common ancestors, getting descendants (BFS), and checking children/parent relationships. Used by the promotion pipeline when agents are cloned or specialized from existing agents.

## 2. Public API
- `interface GenealogyNode { agentId, parentId, createdAt, reason }` -- JSDoc: MISSING
- `interface FamilyTree { roots, nodes, edges }` -- JSDoc: MISSING
- `class AgentGenealogy` -- JSDoc: MISSING (class-level)
  - `registerAgent(agentId, parentId, reason): void` -- JSDoc: present
  - `removeAgent(agentId): boolean` -- JSDoc: present
  - `buildFamilyTree(): FamilyTree` -- JSDoc: present
  - `findCommonAncestor(agentA, agentB): string | null` -- JSDoc: present
  - `getDescendants(agentId): string[]` -- JSDoc: present
  - `getChildren(agentId): string[]` -- JSDoc: present
  - `getParent(agentId): string | null` -- JSDoc: present
  - `hasAgent(agentId): boolean` -- JSDoc: present

## 3. Ic Bagimliliklar
None.

## 4. Dis Bagimliliklar
- `node:fs`, `node:path`. ADR-010 compliant.

## 5. Complexity
- 8 public methods + 3 internal methods.
- `_getAncestorChain` (line 149-163): while-loop with cycle detection. Rough cyclomatic: ~5.
- `getDescendants` (line 101-118): BFS with queue. Rough cyclomatic: ~4.
- `findCommonAncestor` (line 83-96): two ancestor chain computations. Rough cyclomatic: ~3.

## 6. Type Safety
- `JSON.parse(fs.readFileSync(...))` at line 170: validated with typeof/isArray checks then `as` cast. Acceptable.
- No `any`, no `@ts-ignore`.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct.

## 8. Test Coverage
- `tests/agents/agent-genealogy.test.ts` exists. Tests cover registration, tree building, common ancestor, descendants, reinstatement.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `getDescendants` uses `queue.shift()` which is O(n) for arrays. Not dead code, but suboptimal.
- `descendants.includes(id)` at line 110 is O(n) per check. For large trees, could use Set.

## 11. Security
No external input concerns.

## 12. Memory V2 Uyumu
N/A.

## 13. i18n
No user-facing strings.

## 14. Dokumantasyon Tutarliligi
Method JSDoc present. Interface JSDoc MISSING.

## 15. Performance
- Every method calls `_loadNodes()` which reads the entire genealogy file from disk. No caching.
- `registerAgent` and `removeAgent` do read-modify-write cycle.
- For small agent pools (16 built-in + few temp), this is acceptable.

## 16. Oneriler
- **P3:** Use `Set` instead of `Array.includes` in `getDescendants` for O(1) lookup.
- **P3:** Interface-level JSDoc should be added.

## Verdict: ANALYZED

---

# Analysis: src/agents/prompt-analytics.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 473 | **Effort:** max

## 1. Amaci
Unified module combining prompt A/B testing (`PromptABTester`) and metrics collection (`PromptMetrics`) into a single `PromptAnalytics` facade. Manages experiments where two prompt variants are compared (50/50 random assignment), records results per variant, analyzes experiments with a combined score (70% success rate + 30% coverage), and collects version-level metrics with trend detection. This is the canonical import point for all prompt performance analysis, replacing the earlier separate prompt-ab-test.ts and prompt-metrics.ts modules.

## 2. Public API
- `interface ExperimentResult { variant, evaluation, coverage, sprintId }` -- JSDoc: MISSING
- `interface Experiment { id, agentId, variantA, variantB, results, status, createdAt }` -- JSDoc: MISSING
- `interface ExperimentAnalysis { winner, confidencePercent, sampleSize, aStats, bStats }` -- JSDoc: MISSING
- `interface PromptMetricsReport { agentId, currentVersion, totalVersions, currentSuccessRate, bestVersion, worstVersion, experimentStatus, trend }` -- JSDoc: MISSING
- `class PromptABTester` -- JSDoc: MISSING (class-level)
  - `createExperiment(agentId, variantA, variantB): Experiment` -- JSDoc: present
  - `getActiveExperiment(agentId): Experiment | null` -- JSDoc: present
  - `getExperiment(experimentId): Experiment | null` -- JSDoc: present
  - `assignVariant(experimentId): 'A' | 'B'` -- JSDoc: present
  - `recordResult(experimentId, variant, evaluation, coverage, sprintId): void` -- JSDoc: present
  - `analyzeExperiment(experimentId): ExperimentAnalysis` -- JSDoc: present
  - `completeExperiment(experimentId): void` -- JSDoc: present
- `class PromptMetrics` -- JSDoc: MISSING (class-level)
  - `collectMetrics(agentId, versions, experiment?): PromptMetricsReport` -- JSDoc: present
  - `formatMetricsReport(report): string` -- JSDoc: present
- `class PromptAnalytics` -- JSDoc: present (class-level)
  - Delegates to `PromptABTester` and `PromptMetrics`.
  - `collectMetricsWithExperiment(agentId, versions): PromptMetricsReport` -- JSDoc: present

## 3. Ic Bagimliliklar
- `../core/errors.js` -- ErrorRegistry for experiment errors.
- `./prompt-version.js` -- imports `PromptVersion` type. No circular risk.

## 4. Dis Bagimliliklar
- `node:fs`, `node:path`. ADR-010 compliant.

## 5. Complexity
- 3 classes with 18 total public methods.
- `analyzeExperiment` (line 152-200): statistical analysis with combined scoring. Most complex. Rough cyclomatic: ~7.
- `_calculateTrend` (line 381-397): window-based trend detection. Rough cyclomatic: ~4.

## 6. Type Safety
- `JSON.parse(content) as Experiment` at line 261: unvalidated cast. Could receive malformed data.
- `PromptVersion` type import is type-only. Good practice.
- No `any`, no `@ts-ignore`.

## 7. ADR Compliance
- ADR-008: Correct.
- ADR-010: Correct.

## 8. Test Coverage
- `tests/agents/prompt-analytics.test.ts` exists -- tests the unified class.
- `tests/agents/prompt-ab-test.test.ts` and `tests/agents/prompt-metrics.test.ts` also exist for the re-export stubs (backward compatibility).

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- `_experimentId` parameter in `assignVariant` (line 122) is unused -- random 50/50 regardless of experiment. The parameter exists for API signature consistency.

## 11. Security
- `generateId()` uses `Math.random().toString(36).slice(2, 8)` -- not cryptographically secure but acceptable for experiment IDs (not security-sensitive).

## 12. Memory V2 Uyumu
N/A -- experiment data stored in `.deckent/experiments/`, not in brain DB.

## 13. i18n
English-only metric formatting strings.

## 14. Dokumantasyon Tutarliligi
- `PromptAnalytics` class has JSDoc. Other classes and all interfaces lack class-level JSDoc.
- Method JSDoc is present throughout.

## 15. Performance
- `getExperiment` (line 108-116) scans ALL agent directories to find an experiment by ID. This is O(agents * experiments) and could be slow with many agents/experiments. A reverse index would help.
- `_loadExperiments` reads all JSON files in an experiment directory.

## 16. Oneriler
- **P2:** `getExperiment` global scan is inefficient. Consider maintaining a lightweight index or requiring agentId in the lookup.
- **P3:** Add Zod validation for experiment JSON parsing.
- **P3:** The `assignVariant` method ignores its parameter -- consider removing the parameter or using it for deterministic assignment.

## Verdict: ANALYZED

---

# Analysis: src/agents/prompt-ab-test.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 9 | **Effort:** max

## 1. Amaci
Backward-compatible re-export stub. Exports types (`ExperimentResult`, `Experiment`, `ExperimentAnalysis`) and the `PromptABTester` class from the unified `prompt-analytics.ts` module. Exists so that consumers who imported from `prompt-ab-test.ts` before the unification continue to work without changes.

## 2. Public API
- Re-exports: `ExperimentResult`, `Experiment`, `ExperimentAnalysis` (type), `PromptABTester` (class)

## 3. Ic Bagimliliklar
- `./prompt-analytics.js` -- sole dependency.

## 4. Dis Bagimliliklar
None. ADR-010 compliant.

## 5. Complexity
Zero logic. Pure re-export. Cyclomatic: 1.

## 6. Type Safety
Clean.

## 7. ADR Compliance
All compliant.

## 8. Test Coverage
- `tests/agents/prompt-ab-test.test.ts` exists. Tests the re-exported class works correctly.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
This entire file could be considered a candidate for removal if all consumers are updated to import from prompt-analytics.ts directly. However, it serves backward compatibility.

## 11. Security
N/A.

## 12. Memory V2 Uyumu
N/A.

## 13. i18n
N/A.

## 14. Dokumantasyon Tutarliligi
Module header comment explains purpose. Sufficient.

## 15. Performance
N/A.

## 16. Oneriler
- **P3:** Consider deprecation annotation to guide consumers toward direct import from prompt-analytics.ts.

## Verdict: ANALYZED

---

# Analysis: src/agents/prompt-metrics.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 5 | **Effort:** max

## 1. Amaci
Backward-compatible re-export stub. Exports `PromptMetricsReport` type and `PromptMetrics` class from the unified `prompt-analytics.ts` module. Same rationale as prompt-ab-test.ts.

## 2. Public API
- Re-exports: `PromptMetricsReport` (type), `PromptMetrics` (class)

## 3. Ic Bagimliliklar
- `./prompt-analytics.js` -- sole dependency.

## 4. Dis Bagimliliklar
None. ADR-010 compliant.

## 5. Complexity
Zero logic. Pure re-export. Cyclomatic: 1.

## 6. Type Safety
Clean.

## 7. ADR Compliance
All compliant.

## 8. Test Coverage
- `tests/agents/prompt-metrics.test.ts` exists. Tests the re-exported class.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
Same as prompt-ab-test.ts -- backward compat stub.

## 11. Security
N/A.

## 12. Memory V2 Uyumu
N/A.

## 13. i18n
N/A.

## 14. Dokumantasyon Tutarliligi
Module header comment explains purpose.

## 15. Performance
N/A.

## 16. Oneriler
- **P3:** Consider deprecation annotation.

## Verdict: ANALYZED

---

# Analysis: src/agents/worker-ipc.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 369 | **Effort:** max

## 1. Amaci
Provides typed IPC (Inter-Process Communication) between Brain and Worker processes when workers are spawned via `child_process.fork()`. Three main classes: `WorkerChannel` (parent/Brain side -- wraps ChildProcess), `WorkerSideChannel` (child/Worker side -- wraps `process`), and `ChannelRegistry` (manages multiple channels keyed by taskId). Supports message types: HEARTBEAT, STATUS_REQUEST/RESPONSE, PAUSE, RESUME, KILL, QUESTION, ANSWER. Also re-exports file-based IPC functions from `../orchestra/ipc-registry.js` for backward compatibility (Sprint 135 T-004 migration).

## 2. Public API
- `type IPCMessageType` -- 7 values -- JSDoc: MISSING
- `interface IPCMessage { type, taskId, payload?, timestamp }` -- JSDoc: MISSING
- `interface HeartbeatPayload { status, currentAction?, filesChangedCount?, sequence? }` -- JSDoc: MISSING
- `interface StatusResponsePayload { status, pid?, uptime?, memoryUsage? }` -- JSDoc: MISSING
- `type IPCMessageHandler = (message: IPCMessage) => void` -- JSDoc: MISSING
- `class WorkerChannel` -- JSDoc: present (detailed usage examples)
  - `constructor(proc, taskId)`, `onMessage()`, `send()`, `sendHeartbeat()`, `requestStatus()`, `pause()`, `resume()`, `kill()`, `close()`, `isClosed()`, `supportsIPC()`
- `class WorkerSideChannel` -- JSDoc: present
  - `constructor(taskId, emitter?)`, `send()`, `onMessage()`, `close()`, `supportsIPC()`, `isClosed()`
- `class ChannelRegistry` -- JSDoc: present
  - `register()`, `get()`, `has()`, `remove()`, `closeAll()`, `listTaskIds()`, `size()`
- `function isIPCMessage(value): value is IPCMessage` -- type guard. JSDoc: MISSING
- Re-exports from `../orchestra/ipc-registry.js`: `getQuestionPath`, `getAnswerPath`, `writeQuestionFile`, `readQuestionFile`, `writeAnswerFile`, `readAnswerFile`, `cleanupQuestionFiles`, `askBrain`

## 3. Ic Bagimliliklar
- `../orchestra/ipc-registry.js` -- re-export for backward compatibility. One-way dependency (agents -> orchestra). This is technically an ADR-008 consideration but ipc-registry is a utility, not the brain module.

## 4. Dis Bagimliliklar
- `node:child_process` (ChildProcess type only, not spawning)
ADR-010 compliant.

## 5. Complexity
- 3 classes with 19 total methods + 1 standalone function.
- `WorkerChannel._dispatch` (line 183-197): message routing with type guard. Rough cyclomatic: ~4.
- `WorkerSideChannel` constructor listener (line 232-245): nested handler dispatch. Rough cyclomatic: ~4.
- Overall moderate complexity.

## 6. Type Safety
- Line 60: `process as unknown as ChildProcess` -- documented in JSDoc as intentional for worker-side usage. `as unknown` is a double cast. This is a known TypeScript limitation (process is not ChildProcess but supports similar IPC).
- Line 231: `process as unknown as NodeJS.EventEmitter` -- same pattern. Both are flagged but intentional.
- `isIPCMessage` type guard (line 202-210) properly validates structure.
- `obj['type']` bracket notation at lines 205-207 avoids index signature issues.

## 7. ADR Compliance
- ADR-008: The re-export from `../orchestra/ipc-registry.js` creates a dependency from agents -> orchestra. Strictly, ADR-008 says "Brain imports from tmux, auditor, worker" but doesn't explicitly forbid agents -> orchestra utilities. The dependency is unidirectional and non-circular.
- ADR-010: Correct.
- ADR-035: Event stream integration is handled by worker.ts (which calls writeEvent), not this module.

## 8. Test Coverage
- `tests/agents/worker-ipc.test.ts` exists. Tests cover:
  - WorkerChannel send/receive/close.
  - WorkerSideChannel with injectable emitter.
  - ChannelRegistry CRUD.
  - isIPCMessage type guard.
  - Good coverage.

## 9. TODO/FIXME/HACK inventory
None.

## 10. Dead Code
- The re-exported file-based IPC functions (getQuestionPath, askBrain, etc.) may be dead code if all consumers have migrated to direct import from orchestra/ipc-registry.ts. However, backward compat re-exports are intentional.

## 11. Security
- Handler errors are silently swallowed (line 193, 240). This is intentional for channel stability but could hide important errors.
- No input validation on message payloads (payload is `unknown`).

## 12. Memory V2 Uyumu
N/A -- IPC mechanism, not memory-related.

## 13. i18n
No user-facing strings.

## 14. Dokumantasyon Tutarliligi
- WorkerChannel and WorkerSideChannel have excellent usage examples in JSDoc.
- ChannelRegistry has adequate JSDoc.
- Interface-level JSDoc is MISSING for all message types.

## 15. Performance
- No disk I/O. In-memory message passing via Node.js IPC.
- `Map` used for handler and channel storage -- efficient O(1) lookups.

## 16. Oneriler
- **P2:** Consider whether the orchestra/ipc-registry re-exports are still needed. If consumers have migrated, mark as @deprecated.
- **P3:** Add JSDoc to message type interfaces.
- **P3:** Consider logging swallowed handler errors at debug level instead of silent swallow.

## Verdict: ANALYZED

---

# Analysis: src/agents/worker.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 1669 | **Effort:** max

## 1. Amaci
The central worker module -- the largest file in `src/agents/`. Provides the complete worker lifecycle: task reading/claiming, file locking (delegated to core/file-lock.ts), heartbeat management, result writing (with atomic fsync for Docker crash safety), test verification loops (vitest + tsc with retry), compilation loops, scope validation (with symlink resolution for ADR-034 security), authority checking (ADR-037 soft enforcement), event emission (ADR-035), worker log formatting, Docker SIGTERM graceful shutdown handling, feedback loop tracking, verify-delta honest assessment calibration, and a full Worker Lifecycle State Machine (SPAWNING -> STARTING -> EXECUTING -> ... -> DONE -> EXITED). This file is used by every spawned worker process and by Brain for state tracking.

## 2. Public API
Extensive -- 50+ exports including:
- **Classes:** `TaskClaimError`, `ScopeViolationError`, `InvalidStateTransitionError`, `WorkerStateMachine`
- **Error re-export:** `LockError` from core/file-lock.ts
- **Core functions:** `readTask`, `claimTask`, `writeTaskPlan`, `createHeartbeat`, `writeHeartbeat`, `writeResult`, `updateTaskStatus`, `readWorkerLog`
- **Lock functions (@deprecated):** `acquireLock`, `releaseLock`, `checkLock`, `releaseAllLocks`
- **Verify functions:** `verifyTests`, `verifyCompilation`, `runTestVerifyLoop`, `runCompilationLoop`, `isDocOnlyScope`, `parseVitestOutput`, `parseCompilationErrors`, `getVerifyCommands`, `enforceVerifyLoop`
- **Atomic write:** `atomicWriteFileSync`
- **Heartbeat lifecycle:** `finalizeHeartbeat`, `writeFinishedHeartbeat` (@deprecated), `finalizeHeartbeatOnShutdown`, `fsyncResultFile`
- **Authority:** `checkWorkerAuthority`
- **Events:** `emitWorkerQuestion`
- **Log formatting:** `formatWorkerLog`, `formatScopeLog`, `formatTestLog`, `formatVerifyLog`, `formatDoneLog`, `appendWorkerLog`, `WorkerLogAction` type
- **Feedback loop:** `createFeedbackLoop`, `recordTscAttempt`, `recordTestAttempt`, `calculateSelfHealingRate`, `aggregateFeedbackLoops`
- **Verify delta:** `writeVerifyDeltaBaseline`, `readVerifyDeltaBaseline`, `computeVerifyDelta`, `VERIFY_DELTA_DONE_THRESHOLD`, `VERIFY_DELTA_NO_GO_THRESHOLD`
- **State machine:** `WorkerLifecycleState`, `VALID_TRANSITIONS`, `STOPPABLE_STATES`, `TERMINAL_STATES`, `WorkerStateMachine`, `getWorkerStateMachine`, `createWorkerStateMachine`, `removeWorkerStateMachine`, `isWorkerStoppable`, `getAllWorkerStates`, `clearWorkerStateRegistry`
- **Constants:** `MAX_TEST_RETRIES`, `MAX_COMPILATION_RETRIES`
- **Interfaces:** `CompilationResult`, `CompilationLoopResult`, `VerifyLoopResult`, `VerifyDeltaBaseline`, `VerifyDeltaResult`

All critical public methods have JSDoc documentation.

## 3. Ic Bagimliliklar
- `../core/types.js` -- TaskStatus, AgentStatus, Task, TaskResult, Heartbeat, LockInfo, etc.
- `../core/constants.js` -- TASKS_DIR
- `../core/errors.js` -- ErrorRegistry
- `../core/file-lock.js` -- lock operations (delegated)
- `../core/stack-detector.js` -- detectFullStack, STACK_COMMANDS
- `../cli/helpers/output.js` -- redactSensitive (for log sanitization)
- `../orchestra/authority-enforcer.js` -- checkAuthority, emitAuthorityViolation
- `../orchestra/event-stream.js` -- writeEvent, getCurrentSprintId, CHANNELS

Import chain is deep but unidirectional. No circular dependency risk. The import from `../cli/helpers/output.js` is notable -- a cross-layer dependency (agents -> cli). This is only for `redactSensitive` used in `readWorkerLog`.

## 4. Dis Bagimliliklar
- `node:fs` (extensive: readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, mkdirSync, realpathSync, openSync, closeSync, fsyncSync, renameSync)
- `node:child_process` (execSync for verification, exec via promisify for enforceVerifyLoop)
- `node:util` (promisify)
- `node:path` (join, normalize, sep)
ADR-010 compliant (all Node built-ins).

## 5. Complexity
- 50+ exported functions/classes/constants.
- Most complex functions:
  - `isWithinScope` (line 704-749): symlink resolution, path normalization, scope matching. Rough cyclomatic: ~10.
  - `runTestVerifyLoop` (line 515-547): retry loop with fix callback. Rough cyclomatic: ~5.
  - `runCompilationLoop` (line 659-702): retry loop with heartbeat. Rough cyclomatic: ~5.
  - `enforceVerifyLoop` (line 1252-1314): async double-loop (tsc + vitest). Rough cyclomatic: ~8.
  - `computeVerifyDelta` (line 1411-1472): multi-factor scoring. Rough cyclomatic: ~7.
  - `WorkerStateMachine.transition` (line 1563-1571): state validation. Simple but critical.
- Total function count: ~40.

## 6. Type Safety
- **No `any` in actual type annotations.** The word "any" appears 4 times but only in comments.
- `as unknown as ChildProcess` patterns are in worker-ipc.ts, not here.
- `(err as { stdout: unknown }).stdout` at lines 492-498: chained `as` casts on error object. TypeScript doesn't have great error typing, so this is standard practice.
- `(result as TaskResult & { planWarning?: string }).planWarning = 'missing'` at line 299: ad-hoc type extension. Could use a dedicated type.
- `JSON.parse(raw) as { selfAssessment?: string }` at line 1057: minimal validation before property access.
- No `@ts-ignore` or `@ts-expect-error` anywhere.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Uses `execSync` (line 477, 635) for test/build verification. This is consistent with ADR-006 pattern (synchronous subprocess for verification).
- **ADR-008 (brain import):** Does NOT import brain/sprint-controller. Correct. Imports from orchestra/authority-enforcer and orchestra/event-stream are acceptable (utilities, not brain core).
- **ADR-010:** All Node built-ins. Correct.
- **ADR-034 (multi-project isolation):** `isWithinScope` resolves symlinks via `realpathSync` and denies access if resolved path is outside project root. Correct implementation.
- **ADR-035 (verification protocol):** Emits WORKER->BRAIN:HEARTBEAT, WORKER->BRAIN:RESULT, WORKER->AUDITOR:CODE_VERIFY_REQUEST via event stream. Correct.
- **ADR-037 (RBAC):** `checkWorkerAuthority` implements soft enforcement (logs warning but allows write). Correct for Sprint 139 soft mode.
- **ADR-039 (self-modifying):** `checkWorkerAuthority` accepts `isSelfModifyingSprint` flag. Correct.
- **Memory V2:** No memory interaction. Worker reads tasks from files, not DB. Correct.

## 8. Test Coverage
Extensive test coverage across 8 test files:
- `tests/agents/worker.test.ts` -- core worker functions
- `tests/agents/worker-edge.test.ts` -- edge cases
- `tests/agents/worker-progress.test.ts` -- calculateProgress
- `tests/agents/worker-log.test.ts` -- log formatting
- `tests/agents/worker-doc-skip.test.ts` -- isDocOnlyScope
- `tests/agents/worker-verify-lang.test.ts` -- stack-aware verification
- `tests/agents/worker-feedback.test.ts` -- feedback loop functions
- `tests/agents/worker-shutdown.test.ts` -- SIGTERM/fsync functions
- `tests/agents/worker-ipc.test.ts` -- IPC (separate module)
- `tests/agents/worker-agent.test.ts` -- agent context

## 9. TODO/FIXME/HACK inventory
None. Clean codebase.

## 10. Dead Code
- **4 @deprecated functions:** `acquireLock`, `releaseLock`, `checkLock`, `releaseAllLocks` (lines 179-399) -- delegates to core/file-lock.ts. These are kept for backward compat but should be removed when consumers migrate.
- `writeFinishedHeartbeat` (line 371) -- @deprecated, delegates to `finalizeHeartbeat`.
- `promisify` import at line 3: only used by `enforceVerifyLoop` (async function). The import is at module scope but only consumed in one function.

## 11. Security
- **Symlink scope bypass prevention:** `isWithinScope` uses `realpathSync` to resolve symlinks and denies access if the resolved path escapes the project root. ELOOP (circular symlinks) is explicitly blocked. Strong security.
- **Command injection risk:** `execSync` at lines 477 and 635 construct commands with `scopeArgs` which is derived from task scope arrays. If scope values contained shell metacharacters, injection could occur. However, scope values are system-generated from task JSON, not user input.
- **Sensitive data redaction:** `readWorkerLog` passes output through `redactSensitive` before returning. Good practice.
- **SIGTERM handler:** `registerSigtermHandler` auto-registers at module load. This is a side effect that could be surprising in test environments.

## 12. Memory V2 Uyumu
Worker.ts does not interact with Memory V2 at all. Worker reads task files from `.tasks/` and writes results there. Memory operations are handled by Brain/sprint-controller. This is correct per the architecture: workers are stateless executors.

## 13. i18n
- Log formatting uses emoji indicators (line 849-860) with plain-text alternatives (line 862-873). No locale-awareness -- English action names hardcoded.
- Console.warn messages are English-only.

## 14. Dokumantasyon Tutarliligi
- Excellent JSDoc throughout. Nearly every exported function has documentation.
- Sprint references in comments are accurate (Sprint 134, 138, 139 references match IDENTITY.md).
- ADR references in comments match actual ADR numbers.
- The file is well-organized with clear section separators.

## 15. Performance
- **Sync I/O:** 25+ sync I/O call sites (readFileSync, writeFileSync, existsSync, execSync, etc.). This is the hot path for worker execution. By design -- workers run synchronously within their task.
- **atomicWriteFileSync** (line 268-280): temp write + fsync + rename. Critical for crash safety. Well-implemented.
- **realpathSync** in `isWithinScope`: called on every scope check. For workers with many file writes, this adds latency. Could be cached per worker session.
- **SIGTERM handler auto-registration** at module load (line 1112): side effect. Runs in all contexts, even non-Docker. The env var check (`DECKENT_TASK_ID`) gates it.
- **Global state:** `_workerStates` Map (line 1610) is module-level global state. Thread-safe in single-process Node.js but could leak between tests if `clearWorkerStateRegistry` is not called.

## 16. Oneriler
- **P1:** The file is 1669 lines -- consider splitting into sub-modules: `worker-verify.ts` (verify loops), `worker-lifecycle.ts` (state machine), `worker-log.ts` (formatting), keeping `worker.ts` as the core task operations + barrel re-export. This would improve maintainability significantly.
- **P2:** The 5 @deprecated functions should be scheduled for removal. They add 100+ lines of dead delegation code.
- **P2:** The cross-layer import from `../cli/helpers/output.js` (redactSensitive) should be moved to `../core/` since it's used by a non-CLI module.
- **P2:** `registerSigtermHandler()` auto-execution at import time is a surprising side effect. Consider making it explicit (called by spawn-backend when creating Docker workers).
- **P3:** Cache `realpathSync` results in `isWithinScope` for repeated scope checks within the same worker session.
- **P3:** Consider validating `scope` arrays for shell metacharacters before passing to `execSync`.

## Verdict: ANALYZED

---

# Summary Statistics

| File | LoC | Complexity | Type Issues | @deprecated | Test File Exists |
|------|-----|-----------|-------------|-------------|-----------------|
| index.ts | 18 | None | 0 | 0 | No (barrel) |
| adaptive-agent.ts | 213 | Low | 0 | 0 | Yes |
| prompt-version.ts | 226 | Medium | 2 casts | 0 | Yes |
| prompt-rollback.ts | 150 | Low | 1 cast | 0 | Yes |
| specialization-drift.ts | 107 | Low | 0 | 0 | Yes |
| permission-guard.ts | 219 | Medium | 0 | 0 | Yes |
| cross-sprint-analyzer.ts | 242 | Medium | 0 | 0 | Yes |
| prompt-evolution.ts | 132 | Low | 1 cast | 0 | Yes |
| agent-retirement.ts | 206 | Medium | 3 unsafe casts | 0 | Yes |
| shared-context.ts | 120 | Low | 0 | 0 | Yes |
| agent-genealogy.ts | 187 | Medium | 1 cast | 0 | Yes |
| prompt-analytics.ts | 473 | Medium | 1 cast | 0 | Yes |
| prompt-ab-test.ts | 9 | None | 0 | 0 | Yes |
| prompt-metrics.ts | 5 | None | 0 | 0 | Yes |
| worker-ipc.ts | 369 | Medium | 2 `as unknown` | 0 | Yes |
| worker.ts | 1669 | High | 3 casts | 5 | Yes (8 files) |

**Total LoC:** 4345
**Total exports:** ~90+
**Total @deprecated:** 5 (all in worker.ts)
**Total `as unknown`:** 2 (both in worker-ipc.ts, intentional)
**Total TODO/FIXME/HACK:** 0
**ADR-008 violations:** 0
**ADR-010 violations:** 0
**Memory V2 concerns:** 1 (cross-sprint-analyzer reads from .brain/learning/ -- legacy file path)
**Interface JSDoc MISSING:** All 16 files lack interface-level JSDoc
**Security findings:** Path traversal risk in agentId-based paths (prompt-version, prompt-rollback, agent-retirement, agent-genealogy), mitigated by system-generated IDs

## Top Priority Recommendations

1. **P1:** Split worker.ts (1669 LoC) into sub-modules for maintainability
2. **P1:** Fix unsafe double-cast in agent-retirement.ts lines 118-127
3. **P2:** Remove 5 @deprecated delegation functions from worker.ts
4. **P2:** Move `redactSensitive` from cli/helpers to core/ (cross-layer import)
5. **P2:** Make SIGTERM handler registration explicit rather than auto-executing at import
6. **P2:** Add agentId validation to prevent directory traversal in file-path-based modules
7. **P2:** Consider migrating .brain/learning/ data to Memory V2 DB
8. **P3:** Add interface-level JSDoc across all 16 files
9. **P3:** Make `_`-prefixed methods properly `private` in specialization-drift, cross-sprint-analyzer, etc.
10. **P3:** Add @deprecated annotations to prompt-ab-test.ts and prompt-metrics.ts re-export stubs