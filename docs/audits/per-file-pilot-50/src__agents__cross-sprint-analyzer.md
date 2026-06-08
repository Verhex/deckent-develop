# Audit: `src/agents/cross-sprint-analyzer.ts`

> Sprint 186/187 per-file pilot audit (Task 186-005). Doc-only; no source edits.
> Source verified: `wc -l` = **242** lines (DIRECTIVES quote "243 LoC" off-by-one, includes trailing newline).

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/agents/cross-sprint-analyzer.ts` |
| LoC (wc -l) | 242 |
| Module type | ESM `.ts`, single named-class export (no default) |
| Runtime deps | `node:fs`, `node:path` only — no third-party imports |
| Exported symbols | `class CrossSprintAnalyzer`, `interface SprintEntry`, `interface CrossSprintReport`, `interface SprintRange` |
| Public methods | `constructor(projectRoot)`, `analyze(agentId, range)` |
| Private methods (underscore-prefix, not `#`) | `_loadEntries`, `_inRange`, `_uniqueSprintIds`, `_computeSuccessTrend`, `_computeCoverageTrend`, `_computeTaskTypeDistribution`, `_computeBestWorstTaskType`, `_generateSuggestions`, `_emptyReport` |
| Constants | `LEARNING_DIR = '.brain/learning'`, `SUCCESS_EVALUATIONS = Set('DONE','GO_WITH_TECH_DEBT')`, `LOW_SUCCESS_THRESHOLD = 0.5`, `LOW_COVERAGE_THRESHOLD = 60`, `DECLINING_WINDOW = 3` |
| Reverse deps (production `src/`) | **0** — `grep -rn "CrossSprintAnalyzer" src/` returns only its own definition |
| Reverse deps (tests) | 1 — `tests/agents/cross-sprint-analyzer.test.ts` (246 LoC, 1:1 test-to-source ratio) |
| Reverse deps (docs/archives) | sprint-033 directives, sprint-141 archive, sprint-171 deep-module audit, sprint-god-analysis archive — historical only |
| Writer counterpart | `src/orchestra/pattern-recorder.ts` writes `.brain/learning/{sprintId}.json` (the file format this analyzer consumes) |
| Side effects | Read-only filesystem I/O (`existsSync`, `readdirSync`, `readFileSync`) — never writes |
| Async | None — fully sync (ADR-005 deprecated but tolerated for sub-module read paths) |
| Error model | Bare `try/catch` swallowing — invalid JSON files and missing dir return empty arrays silently (no logging, no throw) |

## 2. Baglam — Architectural Context

- **Sprint origin:** Originally drafted in Sprint 033 (`docs/directives/sprint-033.md`) as part of the agent-learning pipeline. Carried forward verbatim through Sprint 141 audit and Sprint 171 deep-module review.
- **Role:** Read-side of a small two-actor pipeline:
  - **Producer:** `pattern-recorder.ts` (orchestra layer) → appends `LearningEntry[]` to `.brain/learning/{sprintId}.json` after each sprint.
  - **Consumer:** `CrossSprintAnalyzer` (this file) → loads N sprints, computes per-agent trends and improvement suggestions.
- **Architectural placement:** Lives under `src/agents/` despite being a pure analytical helper with no agent-spawn lifecycle, no IPC, no heartbeat — it does not behave like the other `agents/` siblings (`worker.ts`, `worker-lifecycle.ts`, `worker-verify.ts`). Closer in shape to `orchestra/` (read-only analytics over orchestra-produced data).
- **No ADR ownership:** No accepted ADR explicitly defines the learning pipeline data shape; `LearningEntry` and `SprintEntry` are shaped by convention between `pattern-recorder.ts` writer and this reader (informal contract; brittle).
- **Memory V2 disconnect:** Project memory has migrated to `.brain/memory.db` (SQLite, ADR-046 / Memory V2). `.brain/learning/*.json` is **outside** that store — it is an orphan file-based subsystem that decay/export pipelines do not touch.

## 3. Debt Risk

| # | Risk | Severity | Evidence | Impact |
|---|------|----------|----------|--------|
| D1 | Zero production callers — class is exported but never instantiated in `src/` | High | `grep -rn "CrossSprintAnalyzer" src/` ⇒ only definition site (lines 41, 43) | Pure dead code from runtime perspective; every test pass is testing a feature nothing consumes. |
| D2 | Silent error swallowing in `_loadEntries` (two empty `catch` blocks, lines 89–91 and 109–111) | Medium | Lines 87–91, 95–111 | Corrupted `.brain/learning/*.json` files are invisible — analyzer reports "no data" indistinguishably from "no entries" and "all entries malformed". |
| D3 | Informal data contract with `pattern-recorder.ts` — `LearningEntry` shape is duplicated implicitly (entry.agentId, entry.evaluation, entry.coverage, entry.taskType, entry.durationMs) | Medium | Lines 99–106 (reader) vs. `src/orchestra/pattern-recorder.ts` (writer) | Any field rename or addition on the writer side silently degrades reader without TypeScript catching it (raw JSON, no shared schema). |
| D4 | String-comparison range filter on sprint IDs (`sprintId >= range.from && sprintId <= range.to`) | Medium | Lines 117–120 | Lexicographic comparison works only while IDs share the `sprint-NNN` zero-padded form. Three-digit → four-digit transition (sprint-999 → sprint-1000) breaks ordering — "sprint-1000" < "sprint-999" lexicographically. |
| D5 | `_computeBestWorstTaskType` — when only one task type exists, both `best` and `worst` resolve to it (worstRate initialized to 2, bestRate to -1, but a single type wins both) | Low | Lines 152–182 | Misleading output for low-diversity agents. |
| D6 | "Declining trend" detection (lines 209–215) treats flat plateaus as "decreasing" (`val <= recent[i-1]`) | Low | Lines 209–214 | A streak of `[0.5, 0.5, 0.5]` qualifies as "declining"; suggestion triggers even when no decline. The follow-up check (`recent[last] < recent[0]`) catches identical sequences but allows e.g. `[0.6, 0.6, 0.5]` to fire correctly. Still, "isDecreasing" name is misleading. |
| D7 | Non-deterministic tie-break in best/worst — `Map` iteration order is insertion order, so first-inserted task type with equal success rate wins both slots | Low | Lines 169–179 | Subtle reporting drift when distributions are balanced. |
| D8 | No pagination / size guard — reads every `.json` file in `.brain/learning/` into memory each call | Low | Lines 82–115 | Grows linearly forever; expected to become noticeable past sprint 500+. |

## 4. Dead Code Candidates

| Candidate | Evidence | Disposition |
|-----------|----------|-------------|
| **Entire `CrossSprintAnalyzer` class (production)** | `grep -rn "new CrossSprintAnalyzer\|CrossSprintAnalyzer(" src/` returns 0 matches outside the class definition itself. No CLI command, no MCP tool, no `orchestra/` integration imports it. | **Strong dead-code candidate.** Either (a) wire it into `sprint-reporter` / `retro` flow, (b) expose as a CLI subcommand (`deckent recall --agent <id> --range <from-to>`), or (c) delete per ADR-038 Dead Code Disposition policy. |
| `interface SprintRange` (exported) | Only the in-file `analyze()` method consumes it; the test re-imports it but never re-exports. | Demote to non-exported local interface or inline into `analyze()` signature when D1 is resolved. |
| `_emptyReport` | Used only by `analyze()` early-return path (line 53). | Keep — small, documents the empty-state contract. |
| `_taskTypeDistribution` underscore-prefixed parameter (line 187) | Parameter is read in lines 218–225 even though prefix conventionally means "unused". | Rename to `taskTypeDistribution` to match actual usage. Low-impact stylistic debt. |
| Underscore-prefix "private" convention vs TypeScript `private` keyword | Methods use `_name()` instead of `private _name()` (lines 82, 117, 122, 126, 135, 144, 152, 184, 230) | Inconsistent with rest of codebase. Either drop underscore + add `private`, or use ECMAScript `#name`. |

## 5. Documentation Gaps

| Area | Gap | Suggested fix |
|------|-----|---------------|
| Module header | Two-line comment only ("Analyzes agent performance across multiple sprints. Reads from `.brain/learning/`."). No mention of writer, no link to `pattern-recorder.ts`. | Expand header to point at `pattern-recorder.ts` and note Memory V2 disconnect (Section 2). |
| `LearningEntry` shape | No type alias for the *raw* JSON shape consumed in `_loadEntries`. Shape is implicit in `entry.agentId`, `entry.evaluation`, etc. (lines 99–106). | Add `interface RawLearningEntry` exported from a shared module (or import from `pattern-recorder.ts`). |
| Threshold constants | `LOW_SUCCESS_THRESHOLD = 0.5`, `LOW_COVERAGE_THRESHOLD = 60`, `DECLINING_WINDOW = 3` — magic numbers without rationale comments. | One-line `// Why 0.5: …` annotations or a top-of-file rationale block. |
| Public API JSDoc | Only `analyze()` has a JSDoc (`/** Analyze agent performance across a range of sprints. */`). Interfaces have no `@property` docs. | Add JSDoc to each exported interface field, especially `improvementSuggestions` semantics. |
| Failure modes | No documentation of silent-catch behavior (D2). | Document that `_loadEntries` returns `[]` for missing dir, unreadable dir, non-array files, and individual file parse failures — undistinguished. |
| Sprint-ID format assumption | Lexicographic range filter (D4) is undocumented. | Note "Requires zero-padded `sprint-NNN` IDs; do not mix `sprint-99` and `sprint-100`." |

## 6. ADR Compliance Check

| ADR | Status | Compliance | Notes |
|-----|--------|------------|-------|
| ADR-001 — TypeScript + ESM | accepted | ✅ Pass | `.ts`, explicit types, no `any`. |
| ADR-002 — Node16 module resolution | accepted | ✅ Pass | No relative imports in this file (only `node:` built-ins). |
| ADR-003 — vitest over Jest | accepted | ✅ Pass | Tested via `tests/agents/cross-sprint-analyzer.test.ts` (vitest). |
| ADR-005 — Synchronous I/O | **deprecated** | ⚠️ Borderline | Uses `fs.readFileSync`, `fs.readdirSync`, `fs.existsSync` — ADR-005 has been deprecated (project trend is async), but no superseding ADR explicitly forbids sync in analytical helpers. Acceptable for now; flag for future async migration. |
| ADR-006 — spawnSync Security Pattern | accepted | n/a | No subprocess spawning. |
| ADR-008 — Brain Merkezi Import (one-way deps) | accepted | ✅ Pass | Imports only `node:fs`, `node:path` — no brain/orchestra back-imports. Itself is not imported by `brain.ts` either (D1). |
| ADR-009 — DEBT.md Markdown Table Format | accepted | n/a | This file produces no debt table; its own debt is captured in Section 3 of this audit. |
| ADR-010 — Single runtime dependency (commander.js) | accepted | ✅ Pass | Zero npm deps in this file. |
| ADR-019 — Language-Agnostic Worker Verify | accepted | n/a | Not a verify path. |
| ADR-035 — Verification Protocol Standard | accepted | n/a | Not a verify/result writer. |
| ADR-037 — Brain-Auditor-Worker Authority Matrix RBAC V1.0 | accepted | n/a | Read-only utility; no boundary semantics. |
| ADR-038 — Dead Code Disposition | accepted | ⚠️ **Direct candidate** | Production caller absent (D1). Sprint 188 should classify: keep+wire vs. delete. |
| ADR-039 — Self-Modifying Task Detection | accepted | n/a | Not on the self-modify path. |
| ADR-041 — Agent Taxonomy (Horizontal Skills vs Vertical Agents) | accepted | ⚠️ Naming drift | File lives under `src/agents/` but is a horizontal analytical helper, not a "vertical agent". Better fit: `src/orchestra/` (analytics on orchestra-produced data) or `src/core/`. |
| ADR-044 — Sprint State Observability Contract | accepted | ⚠️ Possible producer | If wired, this could feed observability; currently disconnected. |
| ADR-046 — Brain Self-Update / Memory V2 | accepted | ⚠️ Misalignment | Memory V2 is DB-first (`.brain/memory.db`). This file reads `.brain/learning/*.json` — outside the DB; not exported, not decayed. Pipeline orphan. |

## 7. Refactor Recommendations

> Listed roughly by ROI (highest first).

1. **R1 — Resolve dead-code status (Section 4 D1).**
   Pick one in Sprint 188:
   - (a) Wire into `sprint-reporter.ts` retro phase: call `analyzer.analyze(agentId, recentRange)` for top-N agents and append `improvementSuggestions` to RETRO; or
   - (b) Expose as CLI: `deckent learning analyze --agent <id> --from sprint-NNN --to sprint-MMM`; or
   - (c) Delete the file + test, per ADR-038. (Defensible — Memory V2 supersedes the file-based learning store.)
2. **R2 — Migrate to Memory V2 (ADR-046).**
   If kept, source data should come from `MemoryStore.query({ type: 'memory' | 'pattern', sprint_range })` instead of raw `.brain/learning/*.json`. Eliminates orphan file subsystem and D4 (lexicographic sprint IDs are replaced by `sprint_num INTEGER`).
3. **R3 — Replace silent catches (D2) with `debug-log.ts`.**
   At minimum, log parse failures with file path; promote to warning when >10% of files fail to parse.
4. **R4 — Extract shared `LearningEntry` type (D3).**
   Move the interface to `src/agents/learning-types.ts` (or `src/core/learning-types.ts`) and import in both `pattern-recorder.ts` and `cross-sprint-analyzer.ts`. Adds compile-time contract.
5. **R5 — Fix sprint-ID comparison (D4).**
   Parse `parseInt(sprintId.split('-')[1], 10)` and compare numerically; or rely on `sprint_num` once R2 is done.
6. **R6 — Add JSDoc on exported interfaces + public method (Section 5).**
7. **R7 — Tighten `_computeBestWorstTaskType` (D5, D7).**
   When only one task type exists, set `worst = null` (and adjust types). Add deterministic tie-breaker (alphabetical fallback) for D7.
8. **R8 — Rename `_taskTypeDistribution` parameter to `taskTypeDistribution`** (cosmetic) and either adopt `private` keyword or `#` private-field syntax consistently.
9. **R9 — Trend-detection naming/logic refinement (D6).**
   Rename `isDecreasing` → `isMonotonicNonIncreasing`; require strict `<` for at least one adjacent pair before flagging "declining".
10. **R10 — Add a coverage threshold guard.**
    Move `60`, `0.5`, `3` into a single `LearningConfig` object so policy can be tuned without code edits; load defaults from `config.ts` if exposed.

## 8. Sprint 188 Follow-up Items

| # | Item | Suggested owner | Type |
|---|------|-----------------|------|
| F1 | **Decision gate: keep-and-wire vs. delete** `CrossSprintAnalyzer`. Brain to take a call per ADR-038. | Brain | governance / decision |
| F2 | If keep → wire `runManagedDocUpdates` or `sprint-reporter` retro path to call `analyze()` for top-N agents. | bug-fixer / refactorer | feature wiring |
| F3 | If delete → remove `src/agents/cross-sprint-analyzer.ts` + `tests/agents/cross-sprint-analyzer.test.ts` (488 LoC reclaim). | refactorer | dead-code purge |
| F4 | Either way: migrate `.brain/learning/*.json` reads to Memory V2 (ADR-046). | data-engineer | architectural |
| F5 | Extract shared `LearningEntry` type module. | refactorer | low-risk hygiene |
| F6 | Fix lexicographic sprint-ID comparison (D4). | bug-fixer | correctness |
| F7 | Replace silent catches with `debug-log.ts` warnings (D2). | bug-fixer | observability |
| F8 | Fix `best === worst` collision and add deterministic tie-break (D5, D7). | bug-fixer | correctness |
| F9 | Rename file/move to `src/orchestra/cross-sprint-analyzer.ts` (ADR-041 taxonomy alignment) — only if F1 chooses "keep". | refactorer | taxonomy |
| F10 | Add JSDoc on `analyze()` result fields and `improvementSuggestions` strings. | doc-writer | docs |

## 9. Summary

`src/agents/cross-sprint-analyzer.ts` is a **well-formed, well-tested, but currently orphan** 242-LoC analytical helper. It computes per-agent trend reports (success rate, coverage, task-type distribution, improvement suggestions) by reading `.brain/learning/{sprintId}.json` files written by `src/orchestra/pattern-recorder.ts`.

The dominant finding is **D1 (zero production callers)**: outside its own test suite, no file in `src/` instantiates `CrossSprintAnalyzer`. Combined with the Memory V2 architectural shift (ADR-046 — knowledge now lives in `.brain/memory.db`), the `.brain/learning/*.json` substrate this file depends on is itself an orphan subsystem outside the export/decay/import pipeline.

Sprint 188 should make a binary decision per ADR-038 Dead Code Disposition: **(a) wire into the retro/observability pipeline and migrate to Memory V2**, or **(b) delete file + test (488 LoC reclaim)**. The remaining D2–D8 findings (silent catches, informal contract with `pattern-recorder.ts`, lexicographic sprint-ID comparison, best/worst edge cases, magic numbers) are conditional follow-ups — only worth fixing under option (a).

Code quality otherwise is sound: pure functions, no third-party deps, no side effects, dedicated test file at 1:1 LoC parity. No ADR violations; only naming/taxonomy drift (lives under `src/agents/` but behaves like an `orchestra/` analytics helper) and one borderline issue (sync I/O against deprecated ADR-005). Recommended Sprint 187 disposition: **mark as `dead-code-candidate`; defer fix to Sprint 188 decision gate (F1)**.
