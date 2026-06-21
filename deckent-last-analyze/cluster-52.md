# monitor#2 — monitor/index.ts + monitor/sprint-state.ts

## Findings

- [dormant|low] Barrel `monitor/index.ts` bypassed by all internal callers — `src/monitor/index.ts:1-12` — `export { createAlert, scanHeartbeats, … } from './auditor.js'` — Zero internal `from '…/monitor/index'` imports in `src/`; every caller imports directly from `monitor/auditor.ts` (e.g. `src/orchestra/sprint-phases.ts:79`, `src/orchestra/result-evaluator.ts:1947`, `src/orchestra/sprint-planner.ts:104`). The barrel's sole consumer is `src/index.ts:3` (`export * from './monitor/index.js'`), which re-exports to the public package API. The barrel itself adds no internal routing value and is silently invisible to all intra-repo callers.

- [dormant|medium] `sprint-active.json` Source-1 branch unreachable — `src/monitor/sprint-state.ts:35-46` — `const activePath = join(projectRoot, SPRINT_ACTIVE_FILE); if (existsSync(activePath)) { … return data.sprintId … }` — `sprint-active.json` is **never written** anywhere in `src/` (grep `src/` for `sprint-active` yields only `sprint-state.ts` itself). Every production call falls through to Source 2 silently. The "explicit override/new format" documented in the JSDoc (line 26-28) has no writer-side implementation. Tests exercise the branch by manually creating the file (e.g. `tests/monitor/sprint-state.test.ts:68`), masking the missing writer.

- [dormant|low] `SprintActiveFile` interface unreachable — `src/monitor/sprint-state.ts:14-17` — `interface SprintActiveFile { sprintId?: string; }` — Defined solely for the dead `sprint-active.json` branch (line 39: `const data = JSON.parse(raw) as SprintActiveFile`). Not exported; not referenced anywhere outside this file. If the dead branch were removed, this interface would have zero callers.

- [inconsistent|high] Triple `getCurrentSprintId` with divergent resolution logic — Three independent implementations read different files and return semantically incompatible sprint IDs:
  1. `src/monitor/sprint-state.ts:33` — checks `sprint-active.json` FIRST, then `sprint-state.json`
  2. `src/core/event-stream.ts:227` — checks ONLY `sprint-state.json` (`join(projectRoot, DECKENT_DIR, 'sprint-state.json')`)
  3. `src/cli/commands/watch.ts:32` — reads `config.json`.`last_sprint_id` (entirely different source)

  Callers split across sources: `cli/commands/status.ts:10`, `cli/commands/output.ts:12`, `mcp/tools/status.ts:9`, `mcp/tools/watch.ts:8`, `connectors/chat-bridge.ts:32`, `connectors/connector-bootstrap.ts:32` → import from `monitor/sprint-state.ts`. `orchestra/sprint-phases.ts:148`, `orchestra/sprint-controller.ts:344`, `orchestra/sprint-spawner.ts:99`, `orchestra/sprint-finalizer.ts:90`, `nervous/bootstrap.ts:18` → import from `core/event-stream.ts`. `cli/commands/watch.ts:32` uses its own private copy reading `config.json`. Sprint ID seen by CLI/MCP status ≠ sprint ID used by the orchestrator in certain edge states (e.g. when `sprint-active.json` exists only in theory or when `config.last_sprint_id` is stale).

- [inconsistent|medium] Triple `SPRINT_STATE_FILE` constant — Same path constant duplicated in three private scopes with no shared import:
  - `src/monitor/sprint-state.ts:19` = `join('.deckent', 'sprint-state.json')` (private `const`)
  - `src/orchestra/sprint-utils.ts:40` = `'.deckent/sprint-state.json'` (exported at line 45)
  - `src/api/status-reconcile.ts:24` = `'.deckent/sprint-state.json'` (private `const`, with comment at line 23: `// Path must match SPRINT_STATE_FILE in orchestra/sprint-utils.ts`)

  The comment in `status-reconcile.ts:23` explicitly acknowledges the fragility. `monitor/sprint-state.ts` constructs the path with `join()` while the other two use a string literal — both evaluate to the same value but drift is possible if any is renamed.

- [inconsistent|low] Duplicate `SprintStateFile` interface — Defined privately in two files with divergent shape:
  - `src/monitor/sprint-state.ts:5-12` — fields: `sprintId`, `phase`, `status`, `startedAt`, `updatedAt`, **`taskIds?: string[]`**
  - `src/api/status-reconcile.ts:28-34` — fields: `sprintId`, `status`, `phase`, `startedAt`, `updatedAt` (no `taskIds`)

  Neither is exported. The `monitor` variant has an extra optional `taskIds` field that `api` doesn't. Any consumer that switches sources would silently lose `taskIds` access.

- [root-cause|medium] `sprint-active.json` writer absent — silent-fallback on every call — `src/monitor/sprint-state.ts:33-63` — JSDoc at line 26-27 documents "Resolution order: 1. `.deckent/sprint-active.json` (if present and parseable)". But no write path for this file exists in `src/` (`grep -rn "sprint-active" src/` returns only `sprint-state.ts` lines 14, 20, 26, 34). Source 1 silently degrades to Source 2 on every real invocation. The test suite (`tests/monitor/sprint-state.test.ts:61-88`) validates the priority logic but cannot detect the missing writer — it manually constructs the file via `writeFileSync`. The net effect is that the documented "override" mechanism is aspirational dead-state and the priority comment in the JSDoc is misleading.

- [root-cause|low] `core/event-stream.ts:getCurrentSprintId` — trust-without-verify on JSON shape — `src/core/event-stream.ts:232` — `const state = JSON.parse(raw) as { sprintId?: string }; return state.sprintId ?? null;` — No schema validation; trusts that whatever is in `sprint-state.json` is a valid JSON object with an optional `sprintId` string. A corrupted or truncated file that parses as a non-object (e.g. `null`, a number, or an array) would silently return `null` without any log or alert. Compare with the `monitor/sprint-state.ts` version (lines 54-55) which has the same trust-cast `as SprintStateFile` pattern.

## Summary

`monitor/index.ts` is a pass-through barrel with no internal consumers — all intra-repo callers bypass it via direct imports to `monitor/auditor.ts`; the only use is the public-API re-export chain in `src/index.ts`. `monitor/sprint-state.ts` is used and wired (5 callers in CLI/MCP/connectors), but carries three structural problems: (1) a **dormant Source-1 branch** for `sprint-active.json` that is never reachable because the file has no writer; (2) **three divergent `getCurrentSprintId` implementations** across `monitor/sprint-state`, `core/event-stream`, and `cli/commands/watch` — callers get different sprint IDs depending on their import path; (3) **three independent copies of `SPRINT_STATE_FILE`** and two private copies of `SprintStateFile` with divergent field sets. The root cause is incremental evolution without consolidation: the `monitor` module was introduced as a canonical source of truth, but `core/event-stream` and `cli/commands/watch` retained their own private copies. No sources are truly dead at the call-graph level, but behavioral divergence is high risk.
