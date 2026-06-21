# agents#3 — agents subsystem (prompt-evolution / prompt-metrics / prompt-rollback / prompt-version / scope-guard / shared-context)

Read-only, code-only audit of 6 files (every line read). Zero-caller / dormant claims grep-verified over `src/` excluding the definition file and tests. No source modified.

Files audited:
- `src/agents/prompt-evolution.ts` (`PromptEvolutionLog`)
- `src/agents/prompt-metrics.ts` (re-export stub → `prompt-analytics`)
- `src/agents/prompt-rollback.ts` (`PromptRollback`)
- `src/agents/prompt-version.ts` (`PromptVersionManager`)
- `src/agents/scope-guard.ts` (`isPathInScope`)
- `src/agents/shared-context.ts` (`SharedContext`)

## Findings

### unwired

- [unwired|high] `PromptEvolutionLog` has zero production callers (agents-side) — `src/agents/prompt-evolution.ts:40` — grep `PromptEvolutionLog` over `src/` returns ONLY the class def (`prompt-evolution.ts:40`); the two `from '...prompt-evolution.js'` imports in `src/` (`src/orchestra/sprint-reporter.ts:309,311`) resolve to `./prompt-evolution.js` = `src/orchestra/prompt-evolution.ts`, a different file. — `recordEvolution`/`getEvolutionTimeline`/`getEventCount`/`clearEvents` are never invoked in production; the agent evolution history file (`.deckent/agents/{id}/evolution.json`) is never written. Only caller is `tests/agents/prompt-evolution.test.ts`.

- [unwired|medium] `prompt-metrics.ts` re-export stub has zero production importers — `src/agents/prompt-metrics.ts:3` — grep `from ['"].*prompt-metrics(.js)?['"]` over `src/` = no matches. Every production consumer imports `PromptMetrics`/`PromptMetricsReport` directly from `prompt-analytics.js` (`src/api/evolution-endpoint.ts:6`; `src/dashboard/src/pages/EvolutionPage.tsx:37`). — The backward-compat shim (`export { PromptMetrics } from './prompt-analytics.js'`) is routed through by no `src/` module; it is kept loaded only by 3 test imports (`tests/agents/prompt-metrics.test.ts:2`, `tests/integration/collaboration-adaptive.test.ts:24`, `tests/core/non-null-safety.test.ts:14`). Dead shim.

- [unwired|high] `SharedContext` class is never instantiated in production — `src/agents/shared-context.ts:13` — grep `new SharedContext(` repo-wide hits ONLY tests (`tests/agents/shared-context.test.ts`, `tests/core/error-handling-unification.test.ts:288,299`, `tests/orchestra/multi-agent.test.ts`); zero `src/` instantiation. Its only `src/` reference is a type-only import + parameter annotation in `src/orchestra/multi-agent.ts:4,73`, and that consumer is itself dead (grep `from ['"].*multi-agent['"]` / `coordinateMultiAgent` over `src/` = no matches). — The entire atomic key-value API (`write`/`read`/`readAll`/`remove`/`clear`/`size`/`has`) and its `DECKENT_E062`/`E063` guards never execute in production.

### dormant

- [dormant|high] `PromptVersionManager` write-side never called in production (createVersion / updateVersionStats) — `src/agents/prompt-version.ts:33` (`createVersion`), `:132` (`updateVersionStats`) — grep `.createVersion(` and `.updateVersionStats(` over `src/` = no matches; only `.activateVersion(` is called and solely by `src/agents/prompt-rollback.ts:78` (itself dormant — see below). — Because versions are never created in production, `listVersions` (read by the wired route at `src/api/evolution-endpoint.ts:49`) returns `[]` for every agent. The versioning/pruning machinery (`_pruneOldVersions` MAX_VERSIONS=10, `_setCurrentVersion`, `_writePromptFile`) is defined but never exercised by a live writer. Read-side wired, write-side dead.

- [dormant|high] `PromptRollback` is transitively dormant — its sole consumer has no production caller — `src/agents/prompt-rollback.ts:30` — `PromptRollback` is imported only by `src/orchestra/prompt-evolution.ts:10`, used only inside `evolvePromptCheckRollback` (`src/orchestra/prompt-evolution.ts:183,195,205`). grep `evolvePromptCheckRollback` over `src/` = definition only (`prompt-evolution.ts:183`), zero callers (only `tests/orchestra/prompt-rollback-wire.test.ts`). The wired retro path (`collectPromptEvolutionSuggestion` → `wirePromptEvolutionFromOutcomes`/`evolvePromptFromSprintOutcomes` → `evolvePrompt`, `prompt-evolution.ts:144,148`) does NOT touch rollback. — `shouldRollback`/`rollbackPrompt`/`canRollback`/`logRollback` and the constants `ROLLBACK_SUCCESS_THRESHOLD=0.5`/`ROLLBACK_MIN_USES=3` (`prompt-rollback.ts:25-26`) never run at runtime; they gate a path unreachable in production.

### inconsistent

- [inconsistent|medium] Two divergent `SharedContextEntry` type definitions for the same concept — `src/agents/shared-context.ts:7` vs `src/orchestra/prompt-god-template.ts:112` — `agents/shared-context.ts` exports `SharedContextEntry { agentId, value, timestamp }`; `prompt-god-template.ts` exports a different `SharedContextEntry { key, writerId, value }`. The LIVE inter-worker shared-context read path (`src/orchestra/task-builder.ts:1287 readSharedContext`, importing the type from `prompt-god-template.js` at `task-builder.ts:27`) builds entries via `new SharedMemory(projectRoot, ...)` (`task-builder.ts:1291`) — a separate store — and never touches the `agents/shared-context.ts` `SharedContext` class. — The `agents/shared-context.ts` class + its `SharedContextEntry` were superseded by `SharedMemory` + prompt-god-template's `SharedContextEntry`; the duplicate name with a different shape is a divergence that explains the dead class above.

- [inconsistent|medium] Comment asserts a live rollback wire that does not exist — `src/orchestra/prompt-evolution.ts:164-166` (cross-file evidence for `src/agents/prompt-rollback.ts`) — the docblock states `evolvePromptCheckRollback` is "the real external caller that activates the dormant prompt-rollback module in the evolution flow", yet `evolvePromptCheckRollback` has zero production callers (see dormant finding above). — The comment documents an activation that never happens; it misrepresents `prompt-rollback`'s wiring status.

### dead-test

- [dead-test|medium] `PromptEvolutionLog` suite is mock-only over dead code — `tests/agents/prompt-evolution.test.ts:6` (`vi.mock('node:fs')`) — the suite fully mocks `node:fs` and exercises `PromptEvolutionLog`, a class with zero production callers. — Green tests imply agent evolution-logging is covered, but the class is never constructed in production; the suite validates an unwired module against a mocked filesystem.

- [dead-test|low] Retro-wire test exercises a wire with no production caller — `tests/orchestra/prompt-evolution-retro-wire.test.ts:79` (cross-file corroboration for `prompt-rollback`/`prompt-version` dormancy) — asserts `collectPromptEvolutionSuggestion(...)` works and (header lines 2-4) frames the F5 loop as "a real retro consumer", but grep shows `collectPromptEvolutionSuggestion` has zero `src/` callers beyond its def (`src/orchestra/sprint-reporter.ts:338`). — The test certifies a "wire" that nothing in the live retro path invokes, masking the prompt-evolution/rollback/version chain's dormancy.

### root-cause

- [root-cause|high] `/api/evolution/prompt-metrics` silently serves empty data (hardcoded-empty fallback) — `src/agents/prompt-version.ts:88-90` (`listVersions` returns `[]` when the versions dir is missing) consumed at `src/api/evolution-endpoint.ts:49-51` — because `createVersion` is never called in production (dormant finding above), `listVersions(agent.id)` returns `[]` for every agent and `metrics.collectMetrics(agent.id, [], experiment)` produces a structurally-valid but empty/zero metrics report. No error, log, or signal is emitted. — The route returns HTTP 200 with empty reports that read as "healthy"; the true cause is the unwired write-side, hidden by the silent `[]` fallback. Same root cause makes the dashboard `EvolutionPage` prompt-diff table permanently empty.

## Summary

10 findings across the 6 agents#3 files. The cluster is dominated by an **unwired/dormant prompt-evolution feature family**: `PromptEvolutionLog` (agents-side) has zero production callers; the `prompt-metrics.ts` re-export stub is bypassed by every real consumer; `PromptVersionManager`'s write-side (`createVersion`/`updateVersionStats`) is never invoked, so the wired `/api/evolution/prompt-metrics` route silently serves empty data; and `PromptRollback` is transitively dead because its only consumer `evolvePromptCheckRollback` has no production caller (the live retro path skips rollback). `SharedContext` is fully production-dead — never instantiated outside tests — and superseded by `SharedMemory`, leaving two divergent `SharedContextEntry` types. Tests give false confidence (`vi.mock('node:fs')` over the dead `PromptEvolutionLog`; a retro-wire test certifying an uncalled wire). The one genuinely LIVE, hard-wired module in this cluster is **`scope-guard.ts` `isPathInScope`** — imported and called by `src/agents/agentic-worker-runner.ts:34,443` for hard write/edit scope enforcement (no findings; correct and reachable). Severity: 4 high, 5 medium, 1 low. Highest-impact root cause: the prompt-versioning write-side is never wired, so the entire F5 prompt-evolution surface (API + dashboard) shows empty-but-green data.
