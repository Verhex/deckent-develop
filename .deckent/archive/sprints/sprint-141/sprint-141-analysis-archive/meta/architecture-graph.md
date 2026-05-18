# Architecture Graph & Circular Dependency Analysis

**Task ID:** 141-011 | **Date:** 2026-04-16 | **Agent:** architect  
**Scope:** src/**/*.ts (354 files, 11 modules)

---

## 1. Module Inventory

| Module | Files | Description |
|--------|-------|-------------|
| core/ | 78 | Types, config, utilities, memory V2, agent/skill pools |
| orchestra/ | 82 | Sprint lifecycle, planning, evaluation, routing, tmux |
| cli/ | 75 | 40+ commands, helpers, entry point |
| dashboard/ | 51 | React + Vite + Tailwind web dashboard |
| mcp/ | 37 | MCP server: 22 tools + 8 resources |
| agents/ | 16 | Worker execution, prompt engineering |
| providers/ | 5 | Claude, Codex, Gemini, Sandbox, Subprocess |
| monitor/ | 4 | Auditor, dashboard manager, sprint state |
| api/ | 4 | HTTP API server, SSE, rate limiting |
| extensions/ | 1 | VS Code extension |
| root | 1 | src/index.ts re-export |
| **Total** | **354** | |

---

## 2. Module Dependency Matrix

Cross-module import counts (Source → Target):

```
                core  orchestra  cli  monitor  api  agents  providers  dashboard
core              -      1*       -     -       -     -        3†         -
orchestra       168      -        2     6       -     4        1          -
cli             104     36        -     2       2     1        -          -
mcp              52     11        2     3       -     -        -          -
monitor          10      2        -     -       -     -        -          -
api               6      2        2     -       -     1        -          -
agents            7      2        1     -       -     -        -          -
providers        15      1        -     -       -     -        -          -
dashboard         1      -        -     -       -     -        -          -
```

*Key edges:*
- `core → orchestra`: 1 edge (provider.ts → connector.js) — **CYCLE SOURCE**
- `core → providers†`: 3 lazy/dynamic imports in provider.ts (await import)
- `orchestra → core`: 168 edges — heaviest dependency (types.js: 54, utils.js: 38, constants.js: 32)
- `cli → core`: 104 edges — second heaviest
- `cli → orchestra`: 36 edges (brain.js: 7, tmux.js: 6, sprint-controller.js: 4)

---

## 3. Coupling Metrics (Robert C. Martin)

| Module | Ca (Afferent) | Ce (Efferent) | I (Instability) | Classification |
|--------|--------------|---------------|-----------------|----------------|
| core | 363 | 4 | 0.01 | **Stable/Abstract** (good — foundation) |
| orchestra | 55 | 181 | 0.77 | Unstable (acceptable — orchestration layer) |
| cli | 7 | 145 | 0.95 | **Very Unstable** (expected — leaf/UI layer) |
| mcp | 0 | 68 | 1.00 | **Maximally Unstable** (expected — edge layer) |
| dashboard | 0 | 1 | 1.00 | **Maximally Unstable** (expected — UI layer) |
| monitor | 11 | 12 | 0.52 | Balanced |
| api | 2 | 11 | 0.85 | Unstable (expected — edge layer) |
| agents | 6 | 10 | 0.63 | Balanced |
| providers | 4 | 16 | 0.80 | Unstable |

**Analysis:**
- `core` has excellent stability (I=0.01) with 363 incoming and only 4 outgoing — this is the desired foundation pattern
- `mcp` and `dashboard` are maximally unstable (I=1.00) — correct for edge/UI layers that should depend on internals but not be depended upon
- `orchestra` at I=0.77 is appropriate for an orchestration layer
- The one concerning metric is `core → orchestra` (Ce=1 for core into orchestra), which creates the primary circular dependency

---

## 4. Module-Level Circular Dependencies

### 4.1 Primary Cycle: core ↔ orchestra

```
core/provider.ts ──import──→ orchestra/connector.js
orchestra/connector.ts ──import type──→ core/provider.js (type-only)
orchestra/connector.ts ──import type──→ core/task-types.js (type-only)
```

**Root cause:** `core/provider.ts` line 6 imports `Connector` class from `orchestra/connector.js`.  
**Severity:** MEDIUM — This is a **value import** (not type-only), so it creates a real runtime circular dependency.  
**Recommendation:** Move `Connector` class to `core/connector.ts` or create a `core/provider-types.ts` interface that `orchestra/connector.ts` implements. This would eliminate the primary cycle.

### 4.2 Transitive Cycles (all derived from primary)

All module-level cycles flow through the `core ↔ orchestra` edge:

| Cycle | Path |
|-------|------|
| 2-node | core → orchestra → core |
| 3-node | core → orchestra → providers → core |
| 3-node | core → orchestra → monitor → core |
| 3-node | core → orchestra → cli → core |
| 4-node | core → orchestra → cli → api → core |
| 3-node | agents → core → orchestra → agents |
| 3-node | orchestra → providers → orchestra (via core) |
| 3-node | orchestra → monitor → orchestra (via core) |
| 3-node | orchestra → cli → orchestra |
| 3-node | cli → api → cli |

**Note:** `cli → api → cli` is an independent 2-module cycle:
- `cli/commands/serve.ts` → `api/server.js`
- `api/server.ts` → `cli/commands/history.js`, `cli/commands/doctor.js`

### 4.3 File-Level Cycles

**No file-level circular dependencies detected.** All 354 source files form a DAG at the file level. The module-level cycles exist because different files within a module import different files in another module, creating apparent cycles when viewed at module granularity.

---

## 5. ADR-008 Compliance Report

**ADR-008:** "Brain is the ONLY module that imports from tmux, auditor, worker. Planner imports ONLY from core/."

### 5.1 tmux.ts Import Violations (10 violations)

| Violating File | Import Target | Rule Violated |
|---------------|---------------|---------------|
| api/server.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/commands/attach.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/commands/kill.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/commands/review.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/commands/spawn.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/commands/start.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/commands/watch.ts | orchestra/tmux | tmux imported outside orchestra |
| cli/entry.ts | orchestra/tmux | tmux imported outside orchestra |
| providers/claude.ts | orchestra/tmux | tmux imported outside orchestra |
| mcp/tools/run.ts | orchestra/spawn-backend | spawn-backend outside orchestra |

### 5.2 tmux.ts Intra-Orchestra Violations (4 non-brain files)

| Violating File | Rule |
|---------------|------|
| orchestra/spawn-backend.ts | tmux imported from non-brain orchestra file |
| orchestra/sprint-lifecycle.ts | tmux imported from non-brain orchestra file |
| orchestra/sprint-spawner.ts | tmux imported from non-brain orchestra file |
| orchestra/sprint-utils.ts | tmux imported from non-brain orchestra file |

### 5.3 spawn-backend Violations (3 violations)

| Violating File | Import Target |
|---------------|---------------|
| cli/commands/cleanup.ts | orchestra/spawn-backend-docker |
| cli/commands/init.ts | orchestra/spawn-backend-docker |
| cli/commands/kill.ts | orchestra/spawn-backend |

### 5.4 Worker Import Violations (2 violations)

| Violating File | Import Target |
|---------------|---------------|
| api/server.ts | agents/worker (readWorkerLog) |
| cli/commands/spawn.ts | agents/worker |

### 5.5 Planner Import Violation (1 violation)

| Violating File | Import Target | Rule |
|---------------|---------------|------|
| orchestra/sprint-planner.ts | monitor/auditor | Planner should only import from core/ |

**Total ADR-008 violations: 20**

**Recommendation (P1):** These violations have accumulated over ~100 sprints. The `cli/` violations are pragmatic (CLI needs direct tmux access for attach/kill/watch). Consider either:
1. Amending ADR-008 to allow CLI → tmux for operational commands, or
2. Creating a `core/backend-facade.ts` that wraps tmux/spawn-backend and is importable from CLI

---

## 6. Memory V2 Import Chain Analysis

### 6.1 Module Dependency DAG (Memory V2)

```
memory-types.ts (leaf — no imports)
    ↑
memory-normalize.ts (leaf — no imports from src/)
    ↑
memory-store.ts ─── imports ──→ memory-types.ts, memory-normalize.ts, better-sqlite3
    ↑
memory-query.ts ─── imports ──→ memory-store.ts (type-only), memory-normalize.ts, memory-types.ts
    ↑
memory-export.ts ── imports ──→ memory-store.ts (type-only), memory-types.ts
    ↑
memory-import.ts ── imports ──→ memory-types.ts (only CreateEntryInput)
```

**Verdict:** Memory V2 import chain is **CLEAN**. No circular dependencies. Proper layering:
- `memory-types.ts` is a pure type leaf (0 imports)
- `memory-normalize.ts` is a pure utility leaf (0 src/ imports)
- `memory-store.ts` depends only on types + normalize
- `memory-query.ts` and `memory-export.ts` use type-only imports of store
- `memory-import.ts` depends only on types (parsing module, no DB dependency)

### 6.2 Memory V2 Consumers (17 importers)

| Consumer Module | Files Importing memory-store | Purpose |
|----------------|------------------------------|---------|
| cli/ | archive-debt, cleanup, doctor, memory, recall, remember + helpers/output | CLI commands using MemoryStore |
| mcp/ | resources/debt, resources/memory, resources/retro, tools/memory-query, tools/cleanup | MCP tools/resources |
| monitor/ | auditor.ts | ADR compliance check |
| orchestra/ | debt-manager, sprint-planner, sprint-retro-writer, task-builder | Sprint lifecycle |

**memory-query.ts** importers: cli/recall, mcp/tools/memory-query, orchestra/task-builder  
**memory-export.ts** importers: cli/commands/memory  
**memory-import.ts** importers: cli/commands/memory  
**memory-normalize.ts** importers: core/memory-query, core/memory-store (internal only)

### 6.3 Legacy V1 Residue

| Legacy Function | Still in src/? | Status |
|----------------|----------------|--------|
| `countBrainLines` | Referenced in 4 files | **REMOVED** — replaced by `getMemoryEntryCount()` (DB-first) |
| `parseDebtTable` | Yes (utils.ts:205) | **STILL ACTIVE** — used by sprint-finalizer, sprint-phases, archive-debt |
| `generateDebtTable` | Yes (utils.ts:241) | **STILL ACTIVE** — used by archive-debt |
| DECISIONS.md read | memory-import.ts:51 | **CORRECT** — only used for import/migration |
| MEMORY.md read | memory-import.ts:118 | **CORRECT** — only used for import/migration |

**Concern:** `parseDebtTable` and `generateDebtTable` in `utils.ts` are still file-based (.md parsing). These should be migrated to DB-first debt operations via MemoryStore. Currently used in:
- `orchestra/sprint-finalizer.ts` (line 552)
- `orchestra/sprint-phases.ts` (line 558)
- `cli/commands/archive-debt.ts` (lines 60, 156)

---

## 7. Dynamic Import Analysis (Lazy Loading)

The codebase uses `await import()` for performance-sensitive lazy loading:

| Source | Target | Reason |
|--------|--------|--------|
| core/provider.ts | providers/claude.js | Lazy provider loading |
| core/provider.ts | providers/codex.js | Lazy provider loading |
| core/provider.ts | providers/gemini.js | Lazy provider loading |
| core/plugin-hooks.ts | (dynamic path) | Plugin system |
| orchestra/sprint-finalizer.ts | outcome-tracker, quality-assessor, rule-evolver, promotion-pipeline | Post-sprint analysis (not needed during execution) |
| orchestra/sprint-planner.ts | outcome-tracker, intent-classifier, temp-skill-generator, decision-logger | Planning optional features |
| orchestra/sprint-phases.ts | mid-sprint-adapter, outcome-tracker | FIX phase (conditional) |
| orchestra/sprint-controller.ts | tmux.js | Kill worker (conditional) |
| orchestra/managed-docs/plugin-loader.ts | (dynamic path) | Doc plugins |

**Note:** The `core/provider.ts → providers/` dynamic imports are a **good pattern** — they prevent the `core → providers` cycle from being a static dependency, keeping `core` stable.

---

## 8. External Dependency Map

| Module | Node.js stdlib | Third-party |
|--------|---------------|-------------|
| core | fs, path, child_process, crypto, os, url, module, fs/promises | better-sqlite3, typescript |
| orchestra | fs, path, child_process, crypto, os, fs/promises | zod |
| cli | fs, path, child_process, crypto, os, readline, readline/promises | commander, zod |
| mcp | fs, path | @modelcontextprotocol/sdk, zod/v4 |
| dashboard | fs, path | react, react-dom, react-router-dom, recharts, lucide-react, tailwind, vite, cva, clsx |
| monitor | fs, path, child_process, fs/promises | — |
| api | fs, http, crypto, path | zod |
| agents | fs, path, child_process, util | — |
| providers | fs, path, child_process | — |

**ADR-010 Check (Single Runtime Dependency — commander.js):**
- `commander` is used only by `cli/` ✅
- `better-sqlite3` is used only by `core/memory-store.ts` ✅ (Memory V2)
- `zod` is used by `orchestra/`, `cli/`, `api/` (validation schema) — pragmatic, not an ADR-010 violation (zod is dev/build-time-like)
- `@modelcontextprotocol/sdk` is used only by `mcp/` ✅
- `typescript` is used only by `core/marketplace/skill-sandbox.ts` (AST analysis) ✅

---

## 9. Most-Imported Files (Hub Analysis)

Top 20 most-imported source files across the codebase:

| File | Import Count | Role |
|------|-------------|------|
| core/types.ts | ~91 | Central type definitions |
| core/constants.ts | ~62 | Constants (BRAIN_DIR, TASKS_DIR, etc.) |
| core/utils.ts | ~49 | Utility functions |
| core/config.ts | ~18 | 3-layer config merge |
| core/provider.ts | ~21 | Provider adapter interface |
| core/errors.ts | ~12 | Error types |
| core/memory-store.ts | ~17 | Memory V2 DB store |
| core/task-types.ts | ~14 | Task-related types |
| orchestra/brain.ts | ~11 | Re-export orchestrator |
| orchestra/tmux.ts | ~13 | tmux session management |
| core/routing-types.ts | ~10 | TaskDNA, routing types |
| orchestra/sprint-controller.ts | ~9 | Sprint lifecycle |
| orchestra/sprint-utils.ts | ~6 | Shared sprint utilities |
| core/skill-types.ts | ~8 | Skill type definitions |
| core/agent-types.ts | ~6 | Agent type definitions |
| core/observability.ts | ~4 | Logging/tracing |
| orchestra/event-stream.ts | ~7 | Structured event stream |
| orchestra/authority-enforcer.ts | ~4 | RBAC enforcement |
| core/memory-types.ts | ~5 | Memory V2 types |
| orchestra/spawn-backend.ts | ~11 | Spawn backend interface |

**core/types.ts** is the single biggest hub — 91 imports. This is expected for a central type file but may indicate it should be split into domain-specific type modules.

---

## 10. Architectural Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EDGE LAYER (I ≈ 1.0)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │   cli/   │  │   mcp/   │  │   api/   │  │    dashboard/     │  │
│  │ 75 files │  │ 37 files │  │ 4 files  │  │    51 files       │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │             │                  │             │
│       ▼              ▼             ▼                  │             │
│  ┌──────────────────────────────────────┐             │             │
│  │     ORCHESTRATION LAYER (I=0.77)     │             │             │
│  │  ┌──────────────┐  ┌──────────────┐  │             │             │
│  │  │  orchestra/   │  │  monitor/    │  │             │             │
│  │  │  82 files     │  │  4 files     │  │             │             │
│  │  └──────┬────────┘  └──────┬──────┘  │             │             │
│  └─────────┼───────────────────┼────────┘             │             │
│            │                   │                      │             │
│            ▼                   ▼                      │             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              FOUNDATION LAYER (I=0.01)                       │   │
│  │  ┌────────────────────────────────────────────────────────┐  │   │
│  │  │                     core/ (78 files)                    │  │   │
│  │  │  types ─ config ─ utils ─ errors ─ constants           │  │   │
│  │  │  memory-store ─ memory-query ─ memory-normalize        │  │   │
│  │  │  agent-pool ─ skill-pool ─ routing-engine              │  │   │
│  │  │  model-registry ─ provider (interface)                 │  │   │
│  │  └────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│            ▲                                                        │
│            │                                                        │
│  ┌─────────┴──────────────────────────────────────┐                 │
│  │           IMPLEMENTATION LAYER (I≈0.7)          │                 │
│  │  ┌──────────────┐  ┌──────────────┐             │                │
│  │  │  providers/   │  │   agents/    │             │                │
│  │  │  5 files      │  │  16 files    │             │                │
│  │  └──────────────┘  └──────────────┘             │                │
│  └─────────────────────────────────────────────────┘                │
│                                                                     │
│  ┌──────────────────────────────────┐                               │
│  │  ISOLATED (extensions/) 1 file   │                               │
│  └──────────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘

LEGEND:
  ──→  Static import direction (points toward dependency)
  ════  Layer boundary
  I     Instability metric (0=stable, 1=unstable)
```

---

## 11. Violation Summary & Recommendations

### P0 — Critical (Architectural Debt)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **core → orchestra cycle** (provider.ts → connector.js) | Runtime circular dep risk, prevents clean layering | Move Connector to core/ or extract interface |

### P1 — High (ADR-008 Violations)

| # | Issue | Count | Fix |
|---|-------|-------|-----|
| 2 | CLI → tmux direct imports | 6 | Create core/backend-facade.ts OR amend ADR-008 |
| 3 | providers/claude → tmux import | 1 | Move tmux functions to a shared interface |
| 4 | api/server → tmux + worker imports | 2 | Route through orchestra/brain.ts |
| 5 | Planner → monitor/auditor import | 1 | Use core/ interface for deadlock detection |
| 6 | spawn-backend imports from CLI | 3 | Route through orchestra/ |

### P2 — Medium (Debt Candidates)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 7 | parseDebtTable/generateDebtTable still file-based | V1 residue, not DB-first | Migrate to MemoryStore debt operations |
| 8 | core/types.ts as mega-hub (91 imports) | Change ripple risk | Split into domain-specific type files |
| 9 | orchestra/shared-memory.ts unused (0 importers) | Dead code | Remove |
| 10 | cli ↔ api bidirectional dep | Coupling concern | Extract shared functions to core/ |

### P3 — Low (Observations)

| # | Issue | Note |
|---|-------|------|
| 11 | Dynamic imports used for lazy loading | Good pattern — keeps core stable |
| 12 | dashboard isolated (only 1 core import) | Excellent boundary isolation |
| 13 | extensions/ fully isolated | Good — no coupling |
| 14 | Memory V2 chain is clean DAG | No issues |

---

## 12. Module Interaction Heatmap

Inter-module import count matrix (darker = more coupling):

```
FROM ↓ / TO →   core  orch   cli  mon  api  agt  prov dash
core              ·    1░     ·    ·    ·    ·    3▒    ·
orchestra       168█   ·      2░   6▒   ·    4▒   1░    ·
cli             104█  36▓     ·    2░   2░   1░    ·    ·
mcp              52▓  11▒    2░   3░    ·    ·     ·    ·
monitor          10▒   2░     ·    ·    ·    ·     ·    ·
api               6▒   2░    2░    ·    ·    1░    ·    ·
agents            7▒   2░    1░    ·    ·    ·     ·    ·
providers        15▒   1░     ·    ·    ·    ·     ·    ·
dashboard         1░   ·      ·    ·    ·    ·     ·    ·

Legend: ░=1-5  ▒=6-15  ▓=16-50  █=51+
```

---

## 13. Verdict

| Aspect | Score | Detail |
|--------|-------|--------|
| Layer separation | 7/10 | Good layering with core as stable foundation; 1 cycle mars it |
| ADR-008 compliance | 4/10 | 20 violations accumulated over ~100 sprints |
| Memory V2 chain | 10/10 | Clean DAG, proper type-only imports, no V1 runtime deps |
| Circular deps (file) | 10/10 | Zero file-level cycles — excellent |
| Circular deps (module) | 6/10 | 1 primary cycle (core↔orchestra), all others derived |
| Hub concentration | 6/10 | core/types.ts at 91 imports is a risk |
| External dep discipline | 9/10 | ADR-010 mostly respected, zod is pragmatic |
| Dynamic import usage | 9/10 | Smart lazy loading for providers and optional features |

**Overall Architecture Health: 7.6/10**

The codebase has a fundamentally sound layered architecture with `core/` as a highly stable foundation (I=0.01) and edge layers properly unstable. The primary concern is the single `core → orchestra` cycle via `provider.ts → connector.js` and the accumulated ADR-008 tmux import violations. Memory V2's import chain is exemplary.

---

*Generated by Task 141-011 | Architect Agent | 354 files analyzed*
