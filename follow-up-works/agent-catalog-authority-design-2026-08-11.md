# Agent Catalog Authority — design and owner decision points

**Date:** 2026-08-11
**MASTER row:** 7011 (`AGENT-CATALOG-AUTHORITY-001`)
**Decision owner:** Alperen
**Audience:** Deckent runtime, orchestration, CLI/MCP/API surface and docs-generation owners
**Status:** proposal only — this document changes no production code, no configuration, no manifest and no ADR

## Decision boundary

This document **proposes**; it **decides nothing**. Every item under "Owner decision points" (§7) is open until Alperen records an answer. No slice in §6 is admitted work until its decision dependencies are closed.

Two things are deliberately separated throughout:

- **Measured** — reproduced from the tree at this commit, with a file path, a line number or a shell command in the appendix. Cited as `path:line`.
- **Proposed** — a design that does not exist in the code today. Never written in the present tense.

Where the code does not have a surface, this document says so. It does not invent one. That is the row's own NO-GO condition and it is honored literally: §1.5 records that `GET /api/agents` has **no in-repo consumer**, and §1.4 records that no dedicated terminal catalog view exists.

## Evidence basis

| Evidence class | What it establishes | Limitation |
|---|---|---|
| Live tree measurement | Directory counts, drift counts, git tracking and ignore status, manifest field values. | Reproducible only against this commit; the appendix gives the exact commands. |
| Source citation | Which module reads which path, with what precedence, and what it does with an invalid record. | Line numbers drift with edits; each citation also names the symbol so it survives a shift. |
| Row 7011 measured claim | "AgentPoolManager provides an effective fallback chain, but the CLI, MCP and docs surfaces raw-scan directories instead of consuming one authority; 18 agent-specific built-in/project drift items exist; a clean checkout and a long-lived machine-local runtime disagree about the effective catalog." | Re-measured independently in §2 rather than restated. All three sub-claims reproduce. |
| Proposal | §3 authority model, §4 read model, §5 determinism contract, §6 slices. | None of it is current behavior. |

---

## 1. Call-site inventory — every current agent-discovery site

The catalog is discovered in **three structurally different ways** today. The split, not the count, is the finding.

### 1.1 The de-facto authority: `AgentPoolManager`

`src/core/agent-pool.ts` is the only module that implements a layered resolution. Its `loadAgents()` (`src/core/agent-pool.ts:551`) composes four reads in a fixed order:

1. `.deckent/agents/` — persistent project layer, never evicted (`agent-pool.ts:556-557`, constant `AGENTS_DIR` at `agent-pool.ts:266`).
2. `.tasks/agents/` — sprint-scoped temp layer with LRU eviction to `maxTempAgents` (default 50) (`agent-pool.ts:560-587`, constant `TEMP_AGENTS_DIR` at `agent-pool.ts:267`).
3. `src/core/builtins/agents/` — builtin fallback, applied **only to ids absent from the pool** (`_loadBuiltinFallback`, `agent-pool.ts:635-690`).
4. `.deckent/stats/catalog-stats.json` — a gitignored stats sidecar overlaid last (`_applyStatsSidecarOverlay`, `agent-pool.ts:599-611`).

Two behaviors inside this chain matter for §3:

- The builtin fallback is **gated on `.deckent/config.json` existing** (`agent-pool.ts:636`), and resolves the builtin directory **relative to the running module's own location**, not to `projectRoot` (`resolveBuiltinAgentsDir`, `agent-pool.ts:48-52`). A globally installed Deckent therefore falls back to the *installation's* builtins, not the project's.
- A directory literally named `archive` is skipped by a **hardcoded directory-name check**, not by any state field: `if (entry.name === 'archive') continue;` (`agent-pool.ts:714`, inside `_loadFromDir` at `agent-pool.ts:698`).

Callers that consume this authority:

| Surface | Call site | Entry point |
|---|---|---|
| CLI — capability counts | `src/cli/commands/help.ts:165` (`listAgents().length`) | `deckent --help` capability banner |
| CLI — catalog lint | `src/cli/commands/agent.ts:241` (`loadAgents()`) | `deckent agent lint` |
| API — agent list | `src/api/server.ts:972-973` (`listEnabled()`) | `GET /api/agents` |
| API — prompt evolution | `src/api/evolution-endpoint.ts:42,47` (`listEnabled()`) | `GET /api/evolution/prompt-metrics` |
| Docs generator — stats table | `src/orchestra/managed-docs/content-generators.ts:664-665` (`listAgents()`) | managed CLAUDE.md stats section |
| Docs generator — template scope | `src/orchestra/managed-docs/template-renderer.ts:34-35` (`listAgents()`) | `agentCount` / `agentCountBuiltin` template variables |
| Orchestration — routing plan | `src/orchestra/routing-plan-adapter.ts:75` (`loadAgents()`) | routing plan adaptation |
| Orchestration — planning | `src/orchestra/sprint-planner.ts:744-745` (`loadAgents()`) | PLAN phase |
| Orchestration — FIX cascade | `src/orchestra/sprint-phases.ts:3272-3273` (`loadAgents()`) | FIX phase re-dispatch |
| Orchestration — finalize | `src/orchestra/sprint-finalizer.ts:3238,3259` (`getAgent()`) | catalog stats settlement |
| Orchestration — prompt gate | `src/orchestra/prompt-gate.ts:399` (`agentPool.get(agentId)`) | worker prompt admission |
| MCP — mutation | `src/mcp/tools/catalog-parity.ts:70,74,100` (`getAgent()`, `saveAgent()`, `saveTempAgentToPool()`) | `deckent_agent_manage` |
| Routing availability | `src/core/agent-pool.ts:791` (`getActiveAgentIds()`) | routing fallback chain |

### 1.2 Raw-scan sites that bypass the authority

Each of these re-implements discovery against a path literal. None of them sees the builtin fallback layer, the temp layer, the stats overlay, or the manifest validation.

| Surface | Call site | What it scans | What it therefore cannot see |
|---|---|---|---|
| CLI — `agent list` / `agent show` | `loadAllAgents()`, `src/cli/commands/agent.ts:92-110`; consumed at `agent.ts:318` | `readdirSync('.deckent/agents')`, requires `agent.json` | Builtin-only agents; `.tasks/agents/` temps; sidecar stats. Does **not** skip `archive`. |
| MCP tool | `readAgents()`, `src/mcp/tools/agent-list.ts:32-66` | `join(root, DECKENT_DIR, 'agents')` | Same as above. Also re-derives type from `source`/`persistent` (`agent-list.ts:27-31`) instead of reading provenance. |
| MCP resource | `src/mcp/resources/agents.ts:20-40` | `readdirSync` without `withFileTypes` | Same as above; emits raw manifest JSON with no schema normalization. |
| MCP help catalog | `src/mcp/tools/help.ts:56` | describes `deckent://agents` as ".deckent/agents/" | Documents the raw path as the authority. |
| Auditor ground truth | `measureAgentsCount()`, `src/monitor/auditor.ts:1097-1106` | `readdirSync('src/core/builtins/agents')` | Project overrides, temps, learned agents. |
| Planner ground truth | `plannerMeasureAgentsCount()`, `src/orchestra/planner.ts:1583-1592` | same builtin dir | same |
| Task-builder ground truth | `measureAgentsCountFs()`, `src/orchestra/task-builder.ts:993-1002` | same builtin dir | same |
| Promotion | `src/orchestra/promotion-pipeline.ts:151-160` | constructs `.deckent/agents/temp-{id}` and `.deckent/agents/{id}` directly | pool state, validation |
| Retirement | `src/agents/agent-retirement.ts:37-38` | `.deckent/agents` + `.deckent/agents/.retired` | pool state |
| Prompt versioning | `src/agents/prompt-version.ts:18` | own `AGENTS_DIR` literal | pool state |
| Prompt rollback | `src/agents/prompt-rollback.ts:23,102` | own `AGENTS_DIR` literal | pool state |
| Prompt evolution | `src/agents/prompt-evolution.ts:35` | own `AGENTS_DIR` literal | pool state |
| Genealogy | `src/agents/agent-genealogy.ts:25` | own `AGENTS_DIR` literal | pool state |
| Temp generation | `src/orchestra/temp-agent-generator.ts:16,387` | own `AGENTS_DIR` literal | pool state |
| Builtin→shadow manifest sync | `src/core/agent-manifest-sync.ts:22,75,158` | duplicates `resolveBuiltinAgentsDir` file-locally (`agent-manifest-sync.ts:72-78`) | — (writer, not reader) |
| Builtin→shadow prompt sync | `src/core/agent-prompt-sync.ts:3-15,145-150` | same duplication | — (writer, not reader) |
| CLI `sync` | `src/cli/commands/sync.ts:712-755` | writes `.deckent/agents/<id>/{PROMPT.md,agent.json}` | — (writer, not reader) |
| Routing vocabulary | `src/core/routing/vocabulary-builtin.ts:345` | glob `.deckent/agents/**` | — |
| Self-modify guard | `src/orchestra/self-modifying-detector.ts:41` | path prefix `.deckent/agents/` | — |
| Prompt pointer | `src/orchestra/prompt-god-template.ts:637-645` | bare literal `` `.deckent/agents/${agentId}/PROMPT.md` `` | — (intentionally pure; documented as mirroring `getAgentPrompt` step 1) |

**Measured:** the string `.deckent/agents` is independently redefined as a module constant in at least ten modules — `agent-pool.ts:266`, `cli/commands/agent.ts:46`, `temp-agent-generator.ts:16`, `prompt-rollback.ts:23`, `prompt-version.ts:18`, `prompt-evolution.ts:35`, `agent-genealogy.ts:25`, `agent-retirement.ts:37`, `agent-manifest-sync.ts:22`, `mcp/resources/agents.ts:6` — plus an eleventh inline construction at `mcp/tools/agent-list.ts:34`.

### 1.3 Worker prompt assembly — a *separate* resolution chain

Prompt resolution does **not** reuse `loadAgents()`. `getAgentPrompt()` (`src/core/agent-pool.ts:1151`) walks its own four-step order (documented at `agent-pool.ts:1134-1152`):

1. `.deckent/agents/<id>/PROMPT.md`
2. `.tasks/agents/<id>/PROMPT.md`
3. `src/core/builtins/agents/<id>/PROMPT.md` — **only** when the id has no persistent or temp `agent.json` record at all (`agent-pool.ts:1189-1192`), and only in an initialized project
4. `agent.json::systemPrompt` — degraded, emits a `console.warn` (`agent-pool.ts:1215-1218`)

Result: an agent can be **present in the pool but prompt-less**, or **prompt-resolvable but absent from the pool**. The two chains have different builtin-fallback conditions. This is the sharpest reason the row asks for one read model.

`src/orchestra/prompt-god-template.ts:644` hardcodes step 1's path as a display pointer, with a comment acknowledging it mirrors `getAgentPrompt` by hand.

### 1.4 Terminal

**Measured, absent surface.** A bounded search of `src/cli` for `listAgents|loadAllAgents|AgentPoolManager|deckent://agents` returns only `help.ts:17,165` and `agent.ts:92,234,241,318`. There is no separate terminal/TUI agent-catalog view. The terminal surface *is* the `deckent agent` command family plus the `--help` count — and those two disagree with each other by construction, because `help.ts:165` goes through the authority while `agent.ts:318` goes through the raw scan.

### 1.5 Dashboard

**Measured, absent consumer.** `GET /api/agents` is produced at `src/api/server.ts:971`. A bounded search for `/api/agents` across `src/**/*.{ts,tsx}` returns **only that producer** — no dashboard page, hook or component fetches it.

The dashboard's agent-shaped views read different sources entirely:

- `src/dashboard/src/components/RoutingDistribution.tsx:103` — default `apiUrl = "/api/routing/distribution"`, served from `.deckent/routing/learnings.json` (`src/api/server.ts:986-996`), i.e. routing *outcomes*, not the catalog.
- `src/dashboard/analytics/agent-comparison-data.ts:3-21` — an `AgentPerformance` shape keyed by `agentId`, sourced from performance data.
- `WorkerGrid.tsx` / `WorkersPage.tsx` — worker heartbeats (`src/api/server.ts:955-966`), not agents.

**Consequence to record, not to fix here:** the dashboard renders agent *ids* it has never validated against any catalog. A retired or renamed id appears as a live row. This is a genuine gap the row's authority model would close, and it is stated as a gap because the code has no consumer to cite.

---

## 2. Measured divergence

All three of row 7011's sub-claims reproduce.

### 2.1 Layer sizes

| Layer | Path | Measured |
|---|---|---|
| Shipped built-in | `src/core/builtins/agents/` | **21** directories |
| Project (this machine) | `.deckent/agents/` | **24** entries: 21 builtin shadows + `archive/` + `temp-react-specialist/` + `temp-react-ts-specialist/` |
| Sprint-scoped temp | `.tasks/agents/` | absent |
| Archive | `.deckent/agents/archive/` | **3** entries: `temp-react-specialist`, `temp-react-ts-specialist`, `test-writer-removed-sprint-148` |
| Retirement store | `.deckent/agents/.retired/` | **absent** — the directory `agent-retirement.ts:38` names has never been created |
| Genealogy | `.deckent/agents/genealogy.json` | **absent** — the file `agent-genealogy.ts:3` names has never been created |

### 2.2 The 18 drift items

Comparing each builtin `agent.json` / `PROMPT.md` byte-for-byte against its `.deckent/agents/<id>/` shadow:

- **12** `agent.json` drift: `accessibility-auditor`, `api-builder`, `bug-fixer`, `ci-guardian`, `code-reviewer`, `devops-engineer`, `doc-writer`, `frontend-designer`, `integration-engineer`, `migration-specialist`, `performance-analyzer`, `security-auditor`
- **6** `PROMPT.md` drift: `bug-fixer`, `ci-guardian`, `devops-engineer`, `migration-specialist`, `refactorer`, `security-auditor`
- **0** missing shadows

**12 + 6 = 18** — exactly the count row 7011 names.

Sampled cause: for `doc-writer` the only differing field is `capabilitiesProvisional` (absent in the builtin, `true` in the shadow) — written by the provisional-v3 capability migration visible at `src/cli/commands/sync.ts:755`. The drift is therefore **legitimate machine-local state stored in a git-tracked file**, not corruption. That is the design problem: there is no place for runtime-derived fields to live other than the shipped-shadow file, so the shadow can never be byte-clean.

The three-way sync at `src/core/agent-manifest-sync.ts:1-14` already classifies this correctly — case (b), "shadow locally edited → keep local + conflict". Eighteen standing conflicts is the steady state, not an incident.

### 2.3 Clean checkout vs machine-local runtime

**Measured git status of `.deckent/agents/`:**

- 48 tracked files: 21 shadows × 2 files, plus 2 sync-state files, plus 4 files under `archive/`.
- `.deckent/agents/temp-*/` is **gitignored** (`.gitignore:51`). `temp-react-specialist/` and `temp-react-ts-specialist/` exist on this machine and in **no** checkout.
- `.deckent/stats/` is **gitignored** (`.gitignore:230`), so the stats overlay layer is machine-local by construction.

Effective catalog size, same code, two environments:

| Reader | Clean checkout | This machine |
|---|---|---|
| `AgentPoolManager.listAgents()` | **21** (`archive` skipped; no `temp-*`) | **23** (+2 gitignored temps) |
| `deckent agent list` (`loadAllAgents`) | **21** | **23** |
| `deckent_agent_list` (MCP) | **21** | **23** |
| `measureAgentsCount()` (auditor / planner / task-builder) | **21** | **21** |

The failure mode is worse than a mismatch: on a clean checkout the ground-truth checker and the user-facing surfaces **agree at 21**, so CI is green. The disagreement appears only on a long-lived machine, where the checker still says 21 and every user-facing surface says 23. The drift is structurally invisible to the environment that would catch it.

Row 7011's third claim reproduces exactly.

### 2.4 State-model evidence from live manifests

Two manifests demonstrate why enabled / routable / invalid / provenance must be distinct fields rather than inferred:

**`.deckent/agents/temp-react-specialist/agent.json`** — `source: "learned"`, `enabled: true`, `persistent: false`, `manifestVersion: 2`, has `systemPrompt`, **no `capabilities` block**, and the directory contains **only** `agent.json` (no `PROMPT.md`).

Consequences, each traceable:
- `getAgentPrompt` step 1 misses, step 2 misses, step 3 is **blocked** by `hasPersistentRecord` (`agent-pool.ts:1189-1191`), so it lands on step 4 and emits the degraded `console.warn`.
- `deckent agent lint` puts it in `withoutCapabilities` and drops it from routing candidates (`src/cli/commands/agent.ts:245-250`).
- MCP labels it `temp` via `resolveAgentType` (`agent-list.ts:27-31`, `persistent !== true`), while the API reports `source: "learned"` (`server.ts:975`). **Two surfaces, two different provenance words for the same agent.**
- It is `enabled: true` and therefore inside `getActiveAgentIds()` (`agent-pool.ts:791-800`).

**`.deckent/agents/archive/test-writer-removed-sprint-148/agent.json`** — `id: "test-writer"`, `source: "builtin"`, `enabled: true`.

Consequences:
- The **directory name and the `id` disagree**. Nothing enforces the relationship.
- The manifest still declares `enabled: true`. Archival is expressed *only* by physical location plus the hardcoded `entry.name === 'archive'` check at `agent-pool.ts:714`.
- Raw-scan surfaces (`cli/commands/agent.ts:92`, `mcp/tools/agent-list.ts:32`, `mcp/resources/agents.ts:20`) have **no** archive skip. They are saved from listing it only because `.deckent/agents/archive/agent.json` does not exist — a one-level accident. A sibling archived agent placed one directory shallower would surface as live in CLI and MCP while being invisible to the pool.
- The id `test-writer` is the same one the auditor's own comment cites as the historical miscount case (`src/monitor/auditor.ts:1383`).

---

## 3. Proposed layered authority model

> Nothing in §3 exists today. Every layer name below maps to a path that already exists; the *model* over those paths is the proposal.

### 3.1 The four layers

| # | Layer | Backing store (existing) | Mutability | Ships in the package |
|---|---|---|---|---|
| L0 | **Shipped built-in** | `src/core/builtins/agents/<id>/` (resolved via `resolveBuiltinAgentsDir`, `agent-pool.ts:48`) | read-only at runtime | yes |
| L1 | **Project override** | `.deckent/agents/<id>/` (git-tracked) | owner/committed | no — per project |
| L2 | **Learned / runtime** | `.deckent/agents/temp-*/` (gitignored, `.gitignore:51`), `.tasks/agents/` (sprint-scoped), `.deckent/stats/catalog-stats.json` (gitignored) | machine-local, orchestrator-written | no |
| L3 | **Archive** | `.deckent/agents/archive/<slug>/` | append-mostly | partially tracked today |

**Proposed precedence (default, owner-decidable — see D1):**

```
L1 project override  >  L2 learned/runtime  >  L0 shipped built-in
L3 archive is never resolvable — it is a separate namespace, not a low-precedence layer
```

This is deliberately **not** what the code does today. Today L2's `.tasks/agents/` overwrites L1 for a colliding id (`agent-pool.ts:585-586` — the temp pool is written into the pool *after* the persistent layer, so a temp wins), while L0 only fills genuine gaps (`agent-pool.ts:657`). The proposed order makes a committed project decision beat an inferred runtime one. **D1 is exactly this reversal, and it is the owner's call, not this document's.**

Field-level composition, proposed: L2 may only override the **runtime-derived** field set (`stats`, `capabilitiesProvisional`, last-used markers). It may not override identity, prompt, tool grants, or routing declarations. This is what would let §2.2's 18 conflicts drop to zero without deleting information — the provisional flag moves out of the git-tracked shadow and into L2.

### 3.2 Stable agent identity

Proposed rules:

- `id` is the sole identity. It is immutable for the life of the agent and unique across L0/L1/L2.
- Directory name **must equal** `id`. Violations are an `invalid` load, not a silent rename. This is the `test-writer-removed-sprint-148` case in §2.4.
- Archive entries keep their original `id` and add a distinct archive slug; the slug is metadata, never identity.
- Identity is case-sensitive and must match the existing CLI validator `/^[a-zA-Z0-9][a-zA-Z0-9-]*$/`, ≤64 chars (`src/cli/commands/agent.ts:65-67`) — a rule that today is enforced only on the `agent add` path, not on load.
- `temp-` is currently overloaded: it is a gitignore glob (`.gitignore:51`), a promotion prefix (`catalog-parity.ts:106`), a cleanup predicate (`agent-pool.ts:821`) and part of ids. The proposal is that `temp-` stop carrying semantics and the layer be read from an explicit field. **D3 covers this.**

### 3.3 Versioned schema

Current shape: `AgentDefinition` at `src/core/agent-types.ts:17-38` with `manifestVersion?: 1 | 2` (`agent-types.ts:35`). Live manifests carry `manifestVersion: 2` plus undeclared additive fields — `capabilities` (validated separately at `agent-pool.ts:500+`) and `capabilitiesProvisional` (undeclared in the interface entirely, but written by `sync.ts:755` and present on 12 shadows).

Proposed:

- `schemaVersion` becomes **required** on write, defaulted-on-read for legacy manifests.
- Additive-field policy is explicit and matches the severity model the code already has: an unknown/malformed *additive* field yields `severity: 'warning'` and the agent still loads; a malformed *core* field yields `severity: 'skip'` (the existing `InvalidManifestEntry` contract, `agent-pool.ts:377-388`).
- Every layer's records are validated by the **same** validator. Today L0 is validated (`agent-pool.ts:667`) and so is L1 — but the raw-scan surfaces in §1.2 validate nothing.
- A version the runtime does not know is `invalid`, never silently coerced, and never dropped without a diagnostic. The existing `debugLog('agent-pool:invalid-manifest', …)` (`agent-pool.ts:479-481`) is the pattern to keep.

### 3.4 States

Four orthogonal facets. They are conflated today; the proposal is to keep them separate and require every surface to render them separately.

| Facet | Values | Meaning | Current code |
|---|---|---|---|
| `enabled` | `true` / `false` | Owner intent: may this agent be used at all. | Exists (`agent-types.ts:31`), filtered at `agent-pool.ts:783`. |
| `routable` | `true` / `false` + reason | Can the router actually dispatch to it *right now*: prompt resolvable, capabilities valid, model resolvable, layer readable. | **Does not exist.** Approximated in three places with three different rules — `getActiveAgentIds()` (`agent-pool.ts:791`, enabled + id-prefix), `agent lint`'s `withoutCapabilities` (`cli/commands/agent.ts:245`), and prompt-gate admission (`prompt-gate.ts:399`). |
| `validity` | `valid` / `warning` / `invalid` | Schema conformance. | Partially exists as `InvalidManifestEntry.severity` (`agent-pool.ts:377-388`), reachable only via `getInvalidManifests()` (`agent-pool.ts:487`). **No surface in §1 renders it.** |
| `provenance` | `builtin` / `project` / `learned` / `archived` + originating layer + resolved path | Where this record actually came from. | `source: 'builtin' \| 'user' \| 'learned'` (`agent-types.ts:32`) — a *declared* field, not an *observed* one, and re-derived incompatibly at `mcp/tools/agent-list.ts:27-31`. |

The `temp-react-specialist` case in §2.4 is the proof that all four are needed: it is `enabled: true`, **not** routable (no prompt, no capabilities), schema-`valid`, and its provenance is reported as `learned` by one surface and `temp` by another.

`archived` is proposed as a **provenance** value, not an `enabled: false` variant, because the two mean different things: disabled is reversible owner intent; archived is a historical record that must never be resolvable. **D5 decides whether archive is retrievable, immutable, or garbage-collectable.**

---

## 4. The single read model

> Proposal. The type below does not exist.

One resolver produces one immutable view. Every surface in §1 consumes that view and **no** surface re-reads a directory.

```ts
// PROPOSED — does not exist in the tree today.
interface AgentCatalogView {
  schemaVersion: number;
  /** Resolved, precedence-applied, one entry per stable id. */
  entries: readonly AgentCatalogEntry[];
  /** Records that failed to load, with reasons — never silently dropped. */
  invalid: readonly InvalidCatalogRecord[];
  /** Every layer actually consulted, in precedence order, with its resolved absolute path. */
  layers: readonly ResolvedLayer[];
  /** Stable, order-independent digest of `entries` + `layers`. */
  digest: string;
}

interface AgentCatalogEntry {
  id: string;                       // stable identity (§3.2)
  definition: AgentDefinition;      // src/core/agent-types.ts:17
  enabled: boolean;                 // §3.4
  routable: { value: boolean; reasons: readonly string[] };
  validity: 'valid' | 'warning' | 'invalid';
  provenance: {
    declared: 'builtin' | 'user' | 'learned';   // manifest field
    layer: 'builtin' | 'project' | 'runtime' | 'archive';  // observed
    resolvedFrom: string;                       // absolute path actually read
    overriddenLayers: readonly string[];        // shadowed lower-precedence hits
  };
  prompt: AgentPromptResolution;    // src/core/agent-pool.ts:1112 — resolved eagerly, in the SAME pass
}
```

Contract, as proposed:

1. **One resolution pass.** `prompt` is resolved in the same pass as the manifest. This is what closes §1.3's two-chain split — no consumer can observe a pool entry whose prompt state is unknown.
2. **No consumer-side filesystem access.** Every `readdirSync` in §1.2 is deleted or delegated. The `AGENTS_DIR` literal survives in exactly one module.
3. **No silent drops.** `invalid` is part of the view and must be renderable. A surface may choose not to show it, but it cannot claim it does not exist.
4. **Read-only.** Mutators (`promotion-pipeline.ts`, `agent-retirement.ts`, `prompt-*`, `temp-agent-generator.ts`, `sync.ts`) keep their write paths and re-resolve after writing. The read model is not a write API.
5. **Provenance is observed, not declared.** `provenance.layer` and `provenance.resolvedFrom` come from the resolver. `provenance.declared` preserves the manifest's own claim. When they disagree, that is a `warning` — and it is exactly the `test-writer` archive case (`source: "builtin"` inside `archive/`).
6. **Cross-platform by construction (Law 2).** Layer resolution goes through path adapters, never string concatenation with `/`. `resolveBuiltinAgentsDir` (`agent-pool.ts:48-52`) already resolves module-relative and works under a global install; that behavior is preserved and extended, not replaced. Case-insensitive filesystems (macOS default, Windows) must be handled explicitly: two ids differing only in case is an `invalid` collision on every platform, not a platform-dependent coin flip.
7. **Multi-tenant / million-project safe (Law 1, Law 2).** The view is keyed by resolved project root; nothing is cached process-globally across roots. Resolution cost stays O(N + layers) syscalls — the existing batched `readdirSync` shape (`agent-pool.ts:695-702`) is the floor, not a regression target.

### 4.1 Surface mapping

| Consumer | Today | Proposed |
|---|---|---|
| `deckent agent list` (`cli/commands/agent.ts:318`) | `loadAllAgents()` raw scan | `view.entries` |
| `deckent agent lint` (`cli/commands/agent.ts:241`) | `loadAgents()` | `view.entries` + `view.invalid` |
| `deckent --help` counts (`cli/commands/help.ts:165`) | `listAgents().length` | `view.entries.length`, split by `provenance.layer` |
| `deckent_agent_list` (`mcp/tools/agent-list.ts:32`) | raw scan + re-derived type | `view.entries`, provenance rendered verbatim |
| `deckent://agents` (`mcp/resources/agents.ts:20`) | raw scan, unnormalized JSON | serialized `AgentCatalogView` |
| `deckent_agent_manage` (`mcp/tools/catalog-parity.ts:70`) | `getAgent()` | `view` for reads; existing mutators for writes |
| `GET /api/agents` (`api/server.ts:972`) | `listEnabled()` | `view.entries` filtered on `enabled && routable.value`, with both facets in the payload |
| `GET /api/evolution/prompt-metrics` (`api/evolution-endpoint.ts:47`) | `listEnabled()` | `view.entries` |
| Docs stats table (`managed-docs/content-generators.ts:664`) | `listAgents()` + `source` count | `view` layer counts |
| Docs template scope (`managed-docs/template-renderer.ts:34`) | `listAgents()` | `view` layer counts |
| Ground truth (`auditor.ts:1097`, `planner.ts:1583`, `task-builder.ts:993`) | `readdirSync` of the builtin dir | `view.layers` — see §5, this is the determinism fix |
| Planning / routing / FIX / finalize / prompt-gate | `loadAgents()` / `getAgent()` | `view` |
| Worker prompt assembly (`agent-pool.ts:1151`, `prompt-god-template.ts:644`) | independent chain | `entry.prompt`; the pointer literal reads `entry.prompt.resolvedFrom` |
| Dashboard | **no consumer (§1.5)** | new consumer of `GET /api/agents` — proposed, and gated on **D6** |

---

## 5. Determinism contract

The target property: **given the same layer contents, the view is identical — and where it cannot be identical, it says so.**

Four rules, proposed:

**R1 — Layer manifest in the view.** `view.layers` lists every layer consulted, its resolved absolute path, whether it was present, its entry count, and its content digest. A count is never reported without the layer set that produced it. This directly repairs §2.3: the ground-truth checkers stop counting a directory and start reading `view.layers`, so "21 builtin, 23 effective" becomes one expressible fact instead of two contradictory numbers.

**R2 — Environment-invariant core, declared variable tail.** L0 and L1 are checkout-deterministic: same commit → same digest. L2 is machine-local **by design** (`.gitignore:51`, `.gitignore:230`) and is reported separately, never folded into a headline count. `view.digest` is proposed to split into a checkout-deterministic component and a runtime component so CI can assert the first without pretending the second does not exist.

**R3 — Ordering and encoding are fixed.** Entries sort by `id` with a fixed collation (not locale-dependent `localeCompare` as at `mcp/tools/agent-list.ts:65`). JSON serialization uses stable key ordering. Digests are content-based, not mtime-based.

**R4 — Honest failure (Law 2).** An unreadable layer is `present: false, error: <typed>` in `view.layers` — never an empty layer silently. Today six separate `catch {}` blocks swallow read errors into "no agents" (`agent-pool.ts:645-647,658-660,700-703`, `agent-list.ts:59-62`, `mcp/resources/agents.ts:31`, `cli/commands/agent.ts:105-107`). A permission-denied builtin directory is currently indistinguishable from an empty one on every surface.

**Proposed acceptance test for the contract:** resolve the view in a clean checkout and on a machine with L2 populated. Assert (a) the checkout-deterministic digest component is byte-identical, (b) the runtime component differs, (c) every surface's reported count is derivable from `view.layers` without re-reading the filesystem, and (d) the ground-truth checkers and the user-facing surfaces produce numbers that are *reconcilable by construction* rather than coincidentally equal.

---

## 6. Implementation slices

Admission-sized. Each slice names its own proof obligation. **No slice is admitted until its listed decision dependencies are closed by the owner.**

### S0 — Machine-derived call-site census
Emit the §1 inventory as a generated artifact so it cannot silently rot. Read-only.
- **Depends on:** nothing.
- **Proof:** the generated census reproduces every row in §1.1–§1.2, including the eleven `AGENTS_DIR` definition sites; a deliberately added twelfth raw scan makes the check fail.

### S1 — Schema and state model, types only
Land `schemaVersion`, the four state facets (§3.4), and the additive-field severity policy as types plus validators. No reader changes.
- **Depends on:** **D2** (schema/versioning), **D4** (routability definition).
- **Proof:** every current live manifest — 21 builtin, 21 shadow, 2 learned, 3 archived — classifies to an explicit `validity` and `provenance`, with zero silent skips. `test-writer-removed-sprint-148` must classify as a `warning` for id/directory mismatch, not load clean.

### S2 — Resolver behind the existing API
Implement `resolveAgentCatalog()` producing `AgentCatalogView`, and reimplement `loadAgents()` / `getAgent()` / `listAgents()` / `listEnabled()` / `getActiveAgentIds()` on top of it. Public behavior unchanged.
- **Depends on:** S1, **D1** (precedence order).
- **Proof:** existing `tests/core/agent-pool.test.ts` stays green unmodified — including its exact-call-count and ordered-mock assertions, which `agent-pool.ts:565-573` documents as constraining. A layer-precedence table test covers every L0/L1/L2 collision combination. Syscall count does not regress.

### S3 — Prompt resolution folded into the resolver
Resolve `AgentPromptResolution` in the same pass; keep `getAgentPrompt()` as a thin delegate.
- **Depends on:** S2.
- **Proof:** for every id in every layer, standalone `getAgentPrompt()` and `entry.prompt` return identical `{content, source, degraded, resolvedFrom}`. `temp-react-specialist` (prompt-less, §2.4) resolves to the same degraded result through both paths, and the degraded `console.warn` fires exactly once per resolution, not once per consumer.

### S4 — Read-surface migration (CLI + MCP)
Delete `loadAllAgents()` (`cli/commands/agent.ts:92`), `readAgents()` (`mcp/tools/agent-list.ts:32`) and the `mcp/resources/agents.ts:20` scan. Route all three through the view.
- **Depends on:** S2, S3, **D3** (provenance vocabulary).
- **Proof:** on this machine's tree, `deckent agent list`, `deckent --help`, `deckent_agent_list` and `deckent://agents` report the **same** set of ids and the **same** provenance word for `temp-react-specialist` — the §2.4 `learned`/`temp` split is gone. Archive is absent from all four regardless of nesting depth, verified by a fixture that places an archived manifest one level shallower.

### S5 — API + dashboard
Extend `GET /api/agents` (`api/server.ts:971`) to the view payload; add the first dashboard consumer.
- **Depends on:** S4, **D6** (dashboard scope).
- **Proof:** the endpoint returns `enabled`, `routable` with reasons, `validity` and `provenance` per entry; a dashboard view renders a non-routable agent as non-routable rather than omitting it. i18n-first — every user-facing string via `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr), zero hardcoded labels.

### S6 — Ground truth on `view.layers`
Replace the three duplicated `readdirSync` counters (`auditor.ts:1097`, `planner.ts:1583`, `task-builder.ts:993`) with layer-aware reads.
- **Depends on:** S2, R1.
- **Proof:** the §5 acceptance test passes. A machine with two `temp-*` agents and a clean checkout both produce a self-consistent report; the historical "16 agents vs 15 directories" class of claim (`auditor.ts:1383`) becomes unrepresentable because a count is never emitted without its layer set.

### S7 — Archive as a first-class namespace
Replace the `entry.name === 'archive'` string check (`agent-pool.ts:714`) with the archive layer from §3.1.
- **Depends on:** S2, **D5** (archive semantics).
- **Proof:** an archived record is never resolvable at any nesting depth; its `id` is preserved and reserved against reuse (or explicitly released, per D5); `.retired/` (`agent-retirement.ts:38`) and `genealogy.json` (`agent-genealogy.ts:3`) — both currently non-existent (§2.1) — are either implemented under the archive layer or removed as dead references. Not left dangling.

### S8 — Runtime-field relocation, drift to zero
Move runtime-derived fields (`capabilitiesProvisional`, stats) out of git-tracked L1 shadows into L2, following the existing stats-sidecar precedent (`agent-pool.ts:395-420`).
- **Depends on:** S2, **D1** (field-level precedence).
- **Proof:** the §2.2 measurement re-run reports **0** `agent.json` drift items where the only difference was a runtime-derived field. `agent-manifest-sync.ts`'s three-way conflict list shrinks correspondingly. Remaining drift is genuine authored divergence and is reported as such. The 6 `PROMPT.md` drift items are **out of scope for S8** — they are authored content and need their own owner decision.

### S9 — Enforcement
Lint rule: `.deckent/agents` and `src/core/builtins/agents` path literals are legal in exactly one module.
- **Depends on:** S4, S6, S7.
- **Proof:** the rule fires on a reintroduced raw scan and is green on the migrated tree. S0's census becomes a CI gate.

---

## 7. Owner decision points

Every item is open. This document recommends where it has evidence and abstains where it does not.

### D1 — Precedence order
**Question:** what is the resolution order across L0/L1/L2, and is precedence whole-record or field-level?
**Evidence:** today `.tasks/agents/` (L2) overwrites `.deckent/agents/` (L1) on id collision (`agent-pool.ts:585-586`), while L0 only fills gaps (`agent-pool.ts:657`). The stats sidecar already overrides field-level (`agent-pool.ts:606-608`).
**Options:** (a) L1 > L2 > L0 with field-level L2 override restricted to runtime-derived fields — the §3.1 proposal; (b) preserve today's L2 > L1 > L0 whole-record order and document it; (c) make it configurable per project.
**Recommendation:** (a). It is the only option under which S8 can drive §2.2's drift to zero. It **is** a behavior change to L2/L1 collision handling and must be owner-approved, not inferred.
**Blocks:** S2, S8.

### D2 — Schema versioning and unknown-field policy
**Question:** is `schemaVersion` required on write? What happens to a manifest from a future version? What is core vs additive?
**Evidence:** `manifestVersion?: 1 | 2` is optional (`agent-types.ts:35`); `capabilitiesProvisional` is written to disk (`sync.ts:755`, 12 shadows) but declared nowhere in the interface.
**Options:** (a) required-on-write, defaulted-on-read, unknown-future = `invalid` with a typed diagnostic; (b) advisory version, best-effort coercion; (c) strict — reject any undeclared field.
**Recommendation:** (a). (c) would reject 12 of 21 live shadows today.
**Blocks:** S1.

### D3 — Provenance vocabulary
**Question:** is provenance the manifest's declared `source` or the resolver's observed layer, and what words do surfaces show?
**Evidence:** `source: 'builtin' | 'user' | 'learned'` (`agent-types.ts:32`) vs MCP's re-derived `'built-in' | 'temp'` (`agent-list.ts:27-31`). `temp-react-specialist` reads `learned` on one surface and `temp` on another. `temp-` currently carries semantics in four unrelated mechanisms (§3.2).
**Options:** (a) observed layer is authoritative, declared `source` retained as a separate field, disagreement = `warning`; (b) declared `source` is authoritative and the resolver validates against it; (c) collapse to one field and migrate all manifests.
**Recommendation:** (a). (c) is a migration of every manifest in every project on earth (Law 2) and should not be entered without a separate decision.
**Blocks:** S4.

### D4 — Routability definition
**Question:** what exactly makes an agent dispatchable, and who owns the predicate?
**Evidence:** three incompatible approximations exist — `getActiveAgentIds()` (`agent-pool.ts:791`: `enabled && !id.startsWith('archive')`), `agent lint`'s capability requirement (`cli/commands/agent.ts:245-250`), prompt-gate admission (`prompt-gate.ts:399`).
**Open sub-questions:** does a missing `capabilities` block make an agent non-routable, or only V3-ineligible? Does a degraded prompt (`source: 'system-prompt'`) count as routable? Does an unresolvable `preferredModel` (`resolveDefaultAgentModel`, `agent-types.ts:74-77`, which can throw `E_AGENT_DEFAULT_MODEL_UNAVAILABLE`) make it non-routable, or is that resolved per-run?
**No recommendation.** The last sub-question touches CONFIG-RESOLVED SUPERVISION and belongs to the routing owner, not to this document.
**Blocks:** S1.

### D5 — Archive semantics
**Question:** is archive retrievable, immutable, or garbage-collectable? Are archived ids reserved forever?
**Evidence:** archive is a hardcoded directory name (`agent-pool.ts:714`), invisible to every raw-scan surface only by accident (§2.4). Its manifests carry `enabled: true` and an `id` that disagrees with the directory name. `.retired/` (`agent-retirement.ts:38`) and `genealogy.json` (`agent-genealogy.ts:3`) are referenced in code and **do not exist on disk** (§2.1) — so there are three archive-shaped concepts and one partial implementation.
**Options:** (a) archive is an immutable append-only namespace, ids permanently reserved, restore is an explicit typed operation; (b) archive is a soft-delete with id release after a retention window; (c) archive is diagnostic-only and garbage-collectable.
**Recommendation:** (a) for id reservation specifically — id reuse after archival would make historical routing and sprint records ambiguous. The retrieval and GC halves are genuinely open.
**Also requires:** a decision on whether `.retired/` and `genealogy.json` are implemented or removed. Leaving code that names paths which never materialize is standing debt either way.
**Blocks:** S7.

### D6 — Dashboard scope
**Question:** should the dashboard consume the catalog at all, and if so as monitoring only?
**Evidence:** `GET /api/agents` has **no consumer** (§1.5). The active direction in `CLAUDE.md` is "dashboard = izleme only".
**Options:** (a) add a read-only catalog view showing routability and invalid records; (b) leave the endpoint consumer-less and mark it as an API-integrator surface; (c) remove the endpoint.
**Recommendation:** (a) — an unconsumed endpoint is untested surface, and the dashboard currently renders agent ids it has never validated. But this is a product-direction call.
**Blocks:** S5.

### D7 — Learned-agent promotion policy
**Question:** what promotes an L2 learned agent to L1?
**Evidence:** promotion exists in two disconnected mechanisms — `promotion-pipeline.ts:144-175` (directory copy, sets `source: 'user'`, stamps `_promotedAt`, ensures a `PROMPT.md`) and `deckent_agent_manage action=promote` (`catalog-parity.ts:104-108`, which moves *into* `temp-` rather than out of it — the two use "promote" for opposite directions). Both are gitignore-crossing: L2 is ignored (`.gitignore:51`), L1 is tracked, so promotion is a commit-visible act. There is no quality gate on either path. `temp-react-specialist` is `enabled: true` with no prompt and no capabilities and has been resident indefinitely.
**Open:** what evidence justifies promotion (success rate? sprint count? both — cf. `agent-retirement.ts:44-48`'s `minSuccessRate 0.3 / minSprints 5 / minUses 10`)? Is promotion owner-approved or automatic? Does promotion require a resolvable `PROMPT.md`? Are the two "promote" verbs unified or renamed?
**No recommendation.** This is policy, and it is the decision with the widest blast radius: it determines what enters a committed, shipped catalog.
**Blocks:** S8's field-relocation boundary; should be closed before any automatic promotion is enabled.

### D8 — PROMPT.md authored drift
**Question:** what happens to the 6 `PROMPT.md` files that diverge from their builtins (§2.2)?
**Evidence:** unlike the 12 manifest drifts (a single runtime-derived field), these are authored content differences. `agent-prompt-sync.ts:1-15` correctly keeps local edits and records a conflict.
**Options:** (a) project prompt overrides are legitimate and permanent — declare them, stop reporting them as drift; (b) reconcile back into the builtins; (c) case-by-case review.
**No recommendation** — this needs a read of the six diffs, which is outside this task's evidence scope.
**Blocks:** nothing in §6; S8 explicitly excludes it.

---

## 8. Non-goals and boundary

This document does **not**:

- change any production or configuration file — the row's NO-GO, honored;
- amend, supersede or reinterpret any ADR;
- claim a surface the code does not have — §1.4 and §1.5 record absence as absence;
- decide any D-item in §7;
- authorize any slice in §6.

**Standing gaps recorded, not fixed:** `.deckent/agents/.retired/` and `.deckent/agents/genealogy.json` are named in code and absent on disk (§2.1). The two opposing meanings of "promote" (D7). The dashboard's unvalidated agent ids (§1.5).

---

## Appendix — reproduction

Run from the repository root at this commit.

Layer sizes (§2.1):

```
ls -1 src/core/builtins/agents | wc -l          # 21
ls -1 .deckent/agents | wc -l                   # 24
ls -1 .deckent/agents/archive | wc -l           # 3
ls -d .deckent/agents/.retired                  # absent
ls .deckent/agents/genealogy.json               # absent
```

Drift, 12 + 6 = 18 (§2.2):

```
for d in src/core/builtins/agents/*/; do
  id=$(basename "$d")
  cmp -s "$d/agent.json"  ".deckent/agents/$id/agent.json"  || echo "DRIFT      $id"
  cmp -s "$d/PROMPT.md"   ".deckent/agents/$id/PROMPT.md"   || echo "PROMPT-DRIFT $id"
done
```

Checkout vs machine-local (§2.3):

```
git ls-files .deckent/agents | wc -l                                  # 48
git ls-files .deckent/agents/archive | wc -l                          # 4
git check-ignore -v .deckent/agents/temp-react-specialist/agent.json  # .gitignore:51
git check-ignore -v .deckent/stats/catalog-stats.json                 # .gitignore:230
```

State-model manifests (§2.4):

```
.deckent/agents/temp-react-specialist/agent.json
  -> source=learned enabled=true persistent=false manifestVersion=2
     systemPrompt=present capabilities=absent  (directory holds agent.json only)

.deckent/agents/archive/test-writer-removed-sprint-148/agent.json
  -> id=test-writer  source=builtin  enabled=true   (id != directory name)
```

Link lint (task test condition):

```
node scripts/lint-links.mjs      # exit 0
```
