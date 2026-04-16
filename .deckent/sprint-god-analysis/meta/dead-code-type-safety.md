# META — Dead Code + Type Safety Analysis

**Task ID:** 142-043 | **Model:** opus | **Effort:** max | **Scope:** src/**/*.ts
**Date:** 2026-04-16 | **Total Source Files:** 317 | **Total LoC:** 74,429

---

## Section 1: Dead Code Inventory

### 1.1 ADR-038 Confirmed Dead Code — Deprecated V1 Routing Pipeline

These modules are explicitly `@deprecated` since Sprint 066, superseded by V2 intent-based routing.
They form an internal dependency cluster (decision-engine imports steps, replay imports engine) but
**no external production code imports any of them**. The only barrel export (orchestra/index.ts) does NOT
re-export any of these. They are 100% dead code.

| File | LoC | Status | Evidence |
|------|-----|--------|----------|
| `src/orchestra/decision-engine.ts:1` | 169 | DEAD — @deprecated Sprint 066 | 0 production imports (only deprecated modules reference it) |
| `src/orchestra/decision-replay.ts:1` | 149 | DEAD — @deprecated Sprint 066 | 0 production imports |
| `src/orchestra/decision-steps/scope-step.ts:1` | 91 | DEAD — @deprecated Sprint 066 | Only imported by dead decision-engine.ts |
| `src/orchestra/decision-steps/agent-step.ts:1` | 82 | DEAD — @deprecated Sprint 066 | Only imported by dead decision-engine.ts |
| **Subtotal** | **491** | | |

**Severity: P1** — These files add 491 LoC of maintenance burden with zero runtime value. Safe to delete.

### 1.2 Orphan Orchestra Modules — No Importers

These modules exist in `src/orchestra/` but are never imported by any production code.
No barrel export in `orchestra/index.ts` references them either.

| File | LoC | Status | Evidence |
|------|-----|--------|----------|
| `src/orchestra/batch-stats.ts:1` | 140 | DEAD | 0 importers in entire src/ |
| `src/orchestra/handoff-protocol.ts:1` | 151 | DEAD | 0 importers in entire src/ |
| `src/orchestra/brain-context.ts:1` | 267 | DEAD | 0 importers in entire src/ |
| `src/orchestra/shared-memory.ts:1` | 142 | DEAD | 0 importers in entire src/ |
| `src/orchestra/pattern-reader.ts:1` | 163 | DEAD | Only imported by itself via pattern-recorder (which is itself only imported by dead pattern-reader) — circular dead reference |
| `src/orchestra/multi-agent.ts:1` | 120 | DEAD | 0 production importers (references "shared-context" text only) |
| `src/orchestra/sprint-estimator.ts:1` | 277 | DEAD | 0 importers in entire src/ |
| **Subtotal** | **1,260** | | |

**Severity: P1** — 1,260 LoC of orphan modules. `brain-context.ts` (267 LoC) and `sprint-estimator.ts` (277 LoC)
are the largest. All safe to delete pending test file cleanup.

### 1.3 Orphan Agents Modules — Never Imported

The `src/agents/` directory contains an "evolution pipeline" (genealogy, retirement, A/B testing, analytics,
drift detection, etc.) that appears to have been **designed but never wired into production**.

| File | LoC | Status | Evidence |
|------|-----|--------|----------|
| `src/agents/prompt-rollback.ts:1` | 150 | DEAD | 0 importers (only imports prompt-version.ts) |
| `src/agents/adaptive-agent.ts:1` | 213 | DEAD | 0 importers (config has `adaptiveAgentEnabled: false` default, but no code path activates it) |
| `src/agents/agent-genealogy.ts:1` | 187 | DEAD | 0 importers |
| `src/agents/agent-retirement.ts:1` | 206 | DEAD | 0 importers |
| `src/agents/cross-sprint-analyzer.ts:1` | 242 | DEAD | 0 importers |
| `src/agents/permission-guard.ts:1` | 219 | DEAD | 0 importers |
| `src/agents/prompt-ab-test.ts:1` | 9 | DEAD — stub | 0 importers, only 9 lines (empty placeholder) |
| `src/agents/prompt-analytics.ts:1` | 473 | DEAD | 0 importers |
| `src/agents/prompt-evolution.ts:1` | 132 | DEAD | 0 importers |
| `src/agents/prompt-metrics.ts:1` | 5 | DEAD — stub | 0 importers, only 5 lines (empty placeholder) |
| `src/agents/specialization-drift.ts:1` | 107 | DEAD | 0 importers |
| `src/agents/prompt-version.ts:1` | 226 | SEMI-DEAD | 2 importers, but both (prompt-rollback, prompt-analytics) are themselves dead |
| `src/agents/shared-context.ts:1` | 120 | SEMI-DEAD | 1 importer (multi-agent.ts), which is dead |
| **Subtotal** | **2,289** | | |

**Severity: P1** — 2,289 LoC of agent evolution pipeline never integrated. The entire cluster
(`prompt-rollback → prompt-version`, `prompt-analytics → prompt-version`, `multi-agent → shared-context`,
etc.) can be removed as a unit. `prompt-analytics.ts` at 473 LoC is the largest dead file in the project.

### 1.4 Orphan Core Module

| File | LoC | Status | Evidence |
|------|-----|--------|----------|
| `src/core/anthropic-http-client.ts:1` | 336 | DEAD | 0 importers in entire src/ |
| **Subtotal** | **336** | | |

**Severity: P2** — May have been intended for direct Anthropic API calls but never wired. 336 LoC.

### 1.5 Orphan Dashboard Analytics

| File | LoC | Status | Evidence |
|------|-----|--------|----------|
| `src/dashboard/analytics/agent-comparison-data.ts:1` | 120 | DEAD | 0 importers in src/ (no component uses it) |
| `src/dashboard/analytics/analytics-data.ts:1` | 165 | DEAD | 0 importers |
| `src/dashboard/analytics/skill-heatmap-data.ts:1` | 146 | DEAD | 0 importers |
| `src/dashboard/analytics/success-chart-data.ts:1` | 112 | DEAD | 0 importers |
| **Subtotal** | **543** | | |

**Severity: P2** — Dashboard analytics data modules are never imported by any component or page.
Likely intended for a future analytics dashboard feature that was never connected.

### 1.6 @deprecated Functions Still In Active Use

These functions are marked `@deprecated` but are **still actively imported and called** in production code.
They cannot be safely removed without migration.

| Function | Location | Importers | Note |
|----------|----------|-----------|------|
| `parseDebtTable()` | `src/core/utils.ts:205` | sprint-finalizer.ts, sprint-phases.ts, archive-debt.ts, core/index.ts | Still used for .md DEBT.md parsing — **Memory V2 migration incomplete** |
| `generateDebtTable()` | `src/core/utils.ts:241` | archive-debt.ts, core/index.ts | Used by `archive-debt` CLI command |
| `evaluateTask()` (simple) | `src/orchestra/result-evaluator.ts:79` | Multiple | Deprecated in favor of `evaluateWithRubric()` but still exported |
| `buildWorkerCommand()` (legacy) | `src/orchestra/tmux.ts:128` | Unknown | Deprecated, kept for backward compat |

**Severity: P2** — `parseDebtTable`/`generateDebtTable` are the most critical: they represent incomplete V2 migration.
Debt management still falls back to .md file parsing instead of DB-first. This is a Memory V2 compliance gap.

### 1.7 @deprecated Constants Still Present

| Constant | Location | Note |
|----------|----------|------|
| `SCAN_INTERVAL` | `src/core/constants.ts:94` | @deprecated — use `config.scan_interval` |
| `HEARTBEAT_TIMEOUT` | `src/core/constants.ts:96` | @deprecated — use `config.heartbeat_timeout` |
| `LOCK_STALE_THRESHOLD` | `src/core/constants.ts:98` | @deprecated — use `config.lock_stale_threshold` |
| `MEMORY_BUDGET` | `src/core/constants.ts:104` | @deprecated — use `config.memory_budget` |
| `DECAY_AFTER_SPRINTS` | `src/core/constants.ts:108` | @deprecated — use `config.decay_after_sprints` |
| `memory_backend` | `src/core/config-types.ts:157` | @deprecated — use `memory.backend` |
| `decay_after_sprints` (root) | `src/core/config-types.ts:160` | @deprecated — use `memory.decay_after_sprints` |
| `brain_model` | `src/core/config-types.ts:402` | @deprecated — use `brain_tier` |
| `worker_model` | `src/core/config-types.ts:404` | @deprecated — use `worker_tier` |
| `KnownModel` | `src/core/token-counter.ts:10` | @deprecated — use `ModelType` from task-types.ts |

**Severity: P3** — Backward compat constants. Low risk but should be tracked for eventual removal.

### 1.8 Legacy V1 Memory Import Functions (Still Used for `memory rebuild`)

| Function | Location | Used By |
|----------|----------|---------|
| `parseDecisionsMd()` | `src/core/memory-import.ts:54` | `src/cli/commands/memory.ts` (rebuild command) |
| `parseMemoryMd()` | `src/core/memory-import.ts:121` | `src/cli/commands/memory.ts` (rebuild command) |
| `parseDebtMd()` | `src/core/memory-import.ts:174` | `src/cli/commands/memory.ts` (rebuild command) |

**Severity: P3** — These are intentionally kept for the `deckent memory rebuild` command, which re-imports
.md backups into the DB. They are NOT dead code — they serve the migration/recovery use case.

### 1.9 `countBrainLines` — Fully Removed

The legacy `countBrainLines()` function has been **fully removed from source**. Only JSDoc comments reference it
as historical context ("replaces legacy countBrainLines"). **No code invocation exists.** This is correct.

- `src/cli/helpers/output.ts:9` — comment only
- `src/cli/commands/doctor.ts:217` — comment only
- `src/cli/commands/cleanup.ts:20` — comment only
- `src/mcp/tools/cleanup.ts:11` — comment only

### 1.10 Dead Code Summary

| Category | Files | LoC | Severity |
|----------|-------|-----|----------|
| ADR-038: V1 routing pipeline | 4 | 491 | P1 |
| Orphan orchestra modules | 7 | 1,260 | P1 |
| Orphan agents evolution pipeline | 13 | 2,289 | P1 |
| Orphan core module | 1 | 336 | P2 |
| Orphan dashboard analytics | 4 | 543 | P2 |
| **Total Dead Code** | **29 files** | **4,919 LoC** | |
| @deprecated still active | 4 functions | N/A | P2 |
| @deprecated constants | 10 | N/A | P3 |

**Dead code ratio: 4,919 / 74,429 = 6.6% of total source LoC.**

---

## Section 2: Type Safety Audit

### 2.1 Summary Counts

| Pattern | Count | Severity |
|---------|-------|----------|
| Explicit `any` type annotation | 2 | LOW |
| `as unknown` casts | 47 | MEDIUM |
| `as <Type>` casts (non-const, non-unknown) | 446 | HIGH |
| `@ts-ignore` | 0 | CLEAN |
| `@ts-expect-error` | 0 | CLEAN |
| Non-null assertion `!.` | 28 | MEDIUM |
| **Total type safety issues** | **523** | |

### 2.2 Explicit `any` Type Annotations (2 instances)

| File | Line | Context |
|------|------|---------|
| `src/core/memory-query.ts:165` | `db: any` | FTS5 query helper — `db` parameter typed as `any` instead of `DatabaseType` |
| `src/core/memory-query.ts:221` | `db: any` | Structured query helper — same issue |

**Analysis:** Only 2 explicit `any` annotations in the entire 74K LoC codebase is excellent. Both are in
`memory-query.ts` where the `better-sqlite3` `Database` type is available via import but not used for these
helper functions. These should be typed as `DatabaseType` (already imported in `memory-store.ts`).

**Severity: P2** — Easy fix, high value. `any` in a DB query function risks SQL injection or malformed queries.

### 2.3 `as unknown` Casts (47 instances)

`as unknown` is typically used as a two-step cast (`value as unknown as TargetType`) to bypass TypeScript's
type narrowing. While safer than `as any`, it still circumvents the type system.

**Top offenders:**

| File | Count | Context |
|------|-------|---------|
| `src/core/config-migration.ts` | 8 | Config schema migrations — dynamic key access on config objects |
| `src/orchestra/sprint-finalizer.ts` | 4 | Evaluation type coercions, config access |
| `src/core/task-types.ts` | 2 | `ALL_MODELS as unknown as readonly ModelType[]` — runtime enum workaround |
| `src/core/agent-pool.ts` | 3 | JSON → AgentDefinition parsing |
| `src/core/skill-pool.ts` | 2 | JSON → SkillDefinition parsing |
| `src/core/cost-config-loader.ts` | 1 | Config validation return |
| `src/orchestra/planner.ts` | 2 | Zod parse result coercion, model enum |
| `src/orchestra/task-builder.ts` | 1 | MODEL_ENUM_VALUES cast |
| `src/orchestra/sprint-phases.ts` | 2 | Config access for fix_phase_timeout, cleanup_delay_ms |
| `src/orchestra/managed-docs/managed-doc-runner.ts` | 1 | Sprint type coercion |
| `src/orchestra/managed-docs/doc-cache.ts` | 1 | JSON parse result |
| `src/mcp/tools/status.ts` | 3 | Dashboard state parsing |
| `src/mcp/tools/explain.ts` | 3 | Response enrichment |
| `src/mcp/tools/config.ts` | 2 | Config value access |
| `src/mcp/tools/run.ts` | 1 | ALL_MODELS enum |
| `src/mcp/tools/analyze.ts` | 1 | Analysis result |
| `src/agents/worker-ipc.ts` | 1 | Process cast |
| `src/cli/helpers/wizard.ts` | 1 | readline output |
| `src/cli/commands/status.ts` | 1 | Task evaluation access |
| `src/cli/commands/start.ts` | 2 | Config access |
| `src/cli/commands/config.ts` | 1 | Config value access |
| `src/core/marketplace/skill-sandbox.ts` | 2 | Directory entry parsing |
| `src/orchestra/doc-updaters/metrics-updater.ts` | 1 | Sprint result access |

**Severity: P2** — The `config as unknown as Record<string, unknown>` pattern appears frequently in
sprint-phases.ts, start.ts, config.ts. This suggests the `DeckentConfig` type doesn't expose certain fields
that are accessed at runtime. The root cause may be incomplete type definitions in `config-types.ts`.

**Recurring Pattern:** `ALL_MODELS as unknown as [string, ...string[]]` appears 3 times (task-types.ts,
task-builder.ts, planner.ts). This is a workaround for Zod's `z.enum()` requiring a tuple type while
`modelRegistry.getAllModelIds()` returns `string[]`. Could be fixed with a proper Zod schema builder.

### 2.4 `as <Type>` Casts (446 instances — top 20 files)

| File | Cast Count | Primary Pattern |
|------|------------|-----------------|
| `src/core/config-migration.ts` | 19 | Dynamic config object access (`as Record<string, unknown>`) |
| `src/orchestra/coverage-validator.ts` | 14 | Coverage report parsing |
| `src/monitor/dashboard-manager.ts` | 14 | Dashboard state serialization |
| `src/core/memory-store.ts` | 12 | SQLite query results (`as EntryRow`) |
| `src/cli/commands/init.ts` | 12 | Config generation, framework detection |
| `src/orchestra/task-builder.ts` | 11 | Zod validation, force-model coercion |
| `src/core/config.ts` | 11 | Deep merge, provider name validation |
| `src/monitor/auditor.ts` | 10 | Task file parsing, Git diff processing |
| `src/core/file-lock.ts` | 9 | JSON parse → LockInfo |
| `src/providers/gemini.ts` | 8 | API response parsing |
| `src/orchestra/temp-skill-generator.ts` | 8 | Template generation |
| `src/mcp/tools/init.ts` | 7 | Config setup |
| `src/core/plugin.ts` | 7 | Manifest validation |
| `src/cli/commands/skill.ts` | 7 | Skill listing |
| `src/cli/commands/review.ts` | 7 | Sprint review results |
| `src/cli/commands/doctor.ts` | 7 | Health check results |
| `src/cli/commands/config.ts` | 7 | Config operations |
| `src/agents/worker.ts` | 7 | Task state management |
| `src/providers/codex.ts` | 6 | API response parsing |
| `src/orchestra/sprint-lifecycle.ts` | 6 | Task/heartbeat state |

**Analysis:** The 446 type casts break down into these patterns:

1. **JSON.parse results** (~120 casts) — `JSON.parse(raw) as T`. TypeScript cannot infer JSON types,
   so these casts are unavoidable. However, many lack runtime validation (no Zod/schema check).
   **Risk: P2** if the JSON structure changes.

2. **Config/Record access** (~100 casts) — `config as Record<string, unknown>`, `obj[field] as T`.
   This pattern is widespread in `config-migration.ts`, `config.ts`, `cost-config-loader.ts`.
   The root cause: config migration functions work with raw JSON objects that don't match the typed schema.
   **Risk: P3** — functional but brittle.

3. **Provider/model enum coercions** (~60 casts) — `value as ProviderName`, `value as ModelType`.
   Used after runtime validation (`includes()` checks). These are safe but verbose.
   **Risk: P3** — could use type guard functions instead.

4. **SQLite query results** (~40 casts) — `db.prepare().get() as RowType`. Better-sqlite3 returns `unknown`,
   so casting is standard practice. Would benefit from a typed wrapper.
   **Risk: P3** — standard pattern for better-sqlite3.

5. **API response parsing** (~30 casts) — `response.json() as T`. No Zod validation at external boundaries.
   **Risk: P1** for `providers/gemini.ts` and `providers/codex.ts` — external API responses should be validated.

### 2.5 Non-Null Assertion Operator `!.` (28 instances)

| File | Line | Expression | Risk |
|------|------|-----------|------|
| `src/core/memory-export.ts` | 173 | `groups.get(key)!.push(mem)` | LOW — key was just set in Map |
| `src/core/routing-engine.ts` | 329 | `finalCandidates[0]!.finalScore` | MEDIUM — array could be empty |
| `src/core/pricing-updater.ts` | 347 | `newData.get(provider)!.set(...)` | LOW — provider was just set |
| `src/orchestra/sprint-metrics.ts` | 566 | `fileSprintMap.get(f)!.add(...)` | LOW — key was just set |
| `src/orchestra/sprint-docs-updater.ts` | 357 | `lines[i]!.includes(sprint.id)` | MEDIUM — index bounds unchecked |
| `src/orchestra/task-builder.ts` | 520 | `match[1]!.trim()` | LOW — regex guaranteed group 1 |
| `src/orchestra/managed-docs/section-updater.ts` | 24 | `match[1]!.length` | LOW — regex guaranteed |
| `src/orchestra/managed-docs/section-updater.ts` | 30 | `lines[j]!.match(...)` | MEDIUM — index bounds |
| `src/orchestra/managed-docs/section-updater.ts` | 31 | `nextMatch[1]!.length` | LOW — conditional check |
| `src/orchestra/sprint-planner.ts` | 103 | `retroEntries[0]!.content` | LOW — guarded by `length > 0` |
| `src/orchestra/sprint-planner.ts` | 117 | `idEntry[0]!.content` | LOW — guarded by `length > 0` |
| `src/orchestra/event-stream.ts` | 259 | `events[events.length - 1]!.sequence` | LOW — guarded by `length > 0` |
| `src/dashboard/analytics/success-chart-data.ts` | 58 | `recent[i]!.successRate` | LOW — loop bounded |
| `src/dashboard/analytics/success-chart-data.ts` | 59 | `recent[i]!.successRate` | LOW — loop bounded |
| `src/cli/helpers/wizard.ts` | 64 | `step.choices[0]!.value` | MEDIUM — choices could be empty |
| `src/cli/helpers/wizard.ts` | 115 | `choices[idx - 1]!.value` | MEDIUM — idx bounds |
| `src/cli/helpers/wizard.ts` | 249 | `available[0]!.name` | MEDIUM — could be empty |
| `src/cli/helpers/wizard.ts` | 272 | `available[0]!.name` | MEDIUM — could be empty |
| `src/cli/helpers/wizard.ts` | 279 | `available[0]!.name` | MEDIUM — could be empty |
| `src/cli/commands/init.ts` | 203 | `match[1]!.toLowerCase()` | LOW — match check |
| `src/cli/commands/init.ts` | 749 | `l.split('==')[0]!.split(...)` | LOW — split always has [0] |
| `src/cli/commands/init.ts` | 906 | `availableProviders[0]!.name` | MEDIUM — could be empty |
| `src/cli/commands/init.ts` | 912 | `availableProviders[1]!.name` | HIGH — no check for 2+ providers |
| `src/cli/commands/cost.ts` | 90 | `byProvider.get(m.provider)!.push(...)` | LOW — key was just set |
| `src/monitor/auditor.ts` | 1601 | `rule.targetFiles!.some(...)` | MEDIUM — optional field |
| `src/mcp/resources/retro.ts` | 26 | `entries[0]!.content` | LOW — guarded |

**High-risk non-null assertions:**
- `src/cli/commands/init.ts:912` — `availableProviders[1]!.name` assumes 2+ providers without guard
- `src/core/routing-engine.ts:329` — `finalCandidates[0]!` could crash if no candidates
- `src/cli/helpers/wizard.ts:249,272,279` — `available[0]!` without empty check

**Severity: P2** — 5 high/medium risk non-null assertions that could cause runtime crashes.

### 2.6 `@ts-ignore` and `@ts-expect-error` (0 instances)

**CLEAN** — The project source has zero `@ts-ignore` and zero `@ts-expect-error` annotations.
This is excellent type discipline. Only `node_modules/` contain these (Vite, Babel — 3rd party).

### 2.7 Type Safety Score by Module

| Module | any | as unknown | as Type | !. | Score |
|--------|-----|-----------|---------|-----|-------|
| src/core/ | 2 | 20 | ~160 | 3 | 78/100 |
| src/orchestra/ | 0 | 14 | ~130 | 8 | 80/100 |
| src/cli/ | 0 | 4 | ~60 | 12 | 82/100 |
| src/mcp/ | 0 | 8 | ~30 | 1 | 85/100 |
| src/agents/ | 0 | 1 | ~7 | 0 | 92/100 |
| src/providers/ | 0 | 0 | ~14 | 0 | 88/100 |
| src/monitor/ | 0 | 0 | ~24 | 1 | 86/100 |
| src/api/ | 0 | 0 | ~7 | 0 | 90/100 |
| src/dashboard/ | 0 | 0 | ~14 | 2 | 90/100 |

### 2.8 Missing Zod Validation at Boundaries

External data enters the system through these paths without schema validation:

| Boundary | File | Pattern | Risk |
|----------|------|---------|------|
| Gemini API response | `src/providers/gemini.ts` | `response.json() as T` | P1 — external API |
| Codex API response | `src/providers/codex.ts` | `response.json() as T` | P1 — external API |
| Anthropic API response | `src/core/anthropic-http-client.ts` | `response.json() as T` | P2 — dead code, but pattern risk |
| Task JSON files | `src/agents/worker.ts` | `JSON.parse(raw) as Task` | P2 — file I/O boundary |
| Config files | `src/core/config.ts` | `JSON.parse(raw) as Record` | P3 — validated downstream |
| Lock files | `src/core/file-lock.ts` | `JSON.parse(raw) as LockInfo` | P3 — internal format |

### 2.9 Recurring Anti-Patterns

1. **`config as unknown as Record<string, unknown>` pattern** — Found in `sprint-phases.ts:501,603`,
   `start.ts:228,267`, `sprint-finalizer.ts:663,832,960`. The `DeckentConfig` type is missing fields
   that are accessed at runtime (`fix_phase_timeout`, `cleanup_delay_ms`, `last_sprint_id`, `spawn_backend`).
   **Fix:** Add these fields to `DeckentConfig` in `config-types.ts`.

2. **`ALL_MODELS as unknown as [string, ...string[]]` pattern** — Found in `task-types.ts:40,43`,
   `task-builder.ts:22`, `planner.ts:16`, `mcp/tools/run.ts:28`.
   **Fix:** Create a helper `getModelEnumValues(): [string, ...string[]]` in model-registry.ts.

3. **`JSON.parse(raw) as SpecificType` without validation** — Pervasive (~120 instances).
   For internal formats (task files, lock files), this is acceptable.
   For external boundaries (API responses, user config), Zod schemas should be added.

---

## Section 3: Cross-Reference Findings

### 3.1 Dead Code × Type Safety Intersection

Some dead code modules actually have the worst type safety:
- `src/agents/prompt-analytics.ts` (473 LoC, dead) — contains `as Record<string, unknown>` patterns
- `src/orchestra/brain-context.ts` (267 LoC, dead) — `JSON.parse(raw) as ProjectStack` without validation
- `src/core/anthropic-http-client.ts` (336 LoC, dead) — `response.json() as T` boundary

Removing these dead files would also eliminate ~15 type casts from the count.

### 3.2 Memory V2 Compliance Gaps

| Issue | Location | Severity |
|-------|----------|----------|
| `parseDebtTable()` still in production use | `sprint-finalizer.ts:552`, `sprint-phases.ts:558` | P2 |
| `generateDebtTable()` still in production use | `archive-debt.ts:156` | P2 |
| `db: any` in memory-query.ts | `memory-query.ts:165,221` | P2 |
| `as unknown as Record<string, unknown>` in sprint-phases.ts for debt | `sprint-phases.ts:558` | P3 |

The debt management path still relies on .md file parsing via V1 functions, despite Memory V2 being DB-first.
This is the most significant V2 migration gap found.

---

## Section 4: Recommendations

### P0 — Critical (Sprint 142)
None identified. No security-critical type safety issues in production paths.

### P1 — High Priority (Sprint 142-143)
1. **Delete 29 dead code files (4,919 LoC)** — Remove the V1 routing pipeline, orphan orchestra modules,
   orphan agents evolution pipeline, orphan dashboard analytics, and orphan core module.
   Clean up corresponding test files.
2. **Add Zod validation to Gemini/Codex API responses** — External boundary validation is missing.

### P2 — Medium Priority (Sprint 143-144)
3. **Fix `db: any` in memory-query.ts** — Type the parameter as `DatabaseType` from better-sqlite3.
4. **Complete debt management V2 migration** — Replace `parseDebtTable()`/`generateDebtTable()` callers
   in sprint-finalizer.ts and sprint-phases.ts with MemoryStore DB queries.
5. **Fix high-risk non-null assertions** — Add guards for `init.ts:912`, `routing-engine.ts:329`, `wizard.ts`.
6. **Add missing fields to DeckentConfig** — `fix_phase_timeout`, `cleanup_delay_ms`, `last_sprint_id`,
   `spawn_backend` to eliminate the `config as unknown as Record` pattern.

### P3 — Low Priority (Backlog)
7. **Create `getModelEnumValues()` helper** to eliminate `ALL_MODELS as unknown` pattern.
8. **Gradually replace `JSON.parse() as T` with Zod** at file I/O boundaries.
9. **Remove @deprecated constants** when all consumers are migrated.
10. **Remove JSDoc `countBrainLines` references** — cosmetic cleanup of comment artifacts.

---

## Verdict: ANALYZED

**Overall Type Safety Score: 83/100**
- Strengths: Zero `@ts-ignore`, zero `@ts-expect-error`, only 2 `any` annotations
- Weaknesses: 446 type casts (many justified), 28 non-null assertions, missing external boundary validation

**Overall Dead Code Score: 93.4% clean** (6.6% dead code)
- 29 dead files, 4,919 LoC removable
- Largest cluster: agents evolution pipeline (2,289 LoC)
- Most impactful: V1 routing pipeline (491 LoC, @deprecated since Sprint 066 — 76+ sprints ago)

---

*Generated by Task 142-043 | Model: opus | Sprint: God Analysis*
