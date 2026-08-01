# Canonical Work-Model Foundation — Design Spec (2026-06-08)

> **Goal:** One canonical, enterprise-grade work-model that every surface (CLI `run`/`start`, MCP, autonomous) and subsystem (planner, router, rubric, ADR-selector, policy-gate) shares — replacing 5 incompatible `TaskType` enums + 3 divergent execution paths with ONE source of truth. Foundation for MASTER-PLAN §14 Cluster A (WM-1..6); everything else (process-mode, multi-tenancy, governance, ERP) rides on this.
>
> **Decisions (Alperen):** hybrid two-axis EnvironmentType (domain × execution-context) · RequirementProfile (capability + resource) · **core-first delivery** (additive types first → migrate consumers one-by-one). No MVP — full model, enterprise-grade, million-user.

## 1. The problem (code-verified)
- **5 incompatible `TaskType` enums**, each a different taxonomy re-derived independently: `decision-types.ts:8` (7: code/test/doc/security/refactor/devops/config), `rubric-registry.ts:21` (3, ADR-053: audit/document-write/code-development), `task-router.ts:55` (5: code/test/doc/design/unknown), `adr-selector.ts:45` (10: core-dev/docs/test/cli/mcp/security/observability/orchestra/provider/dashboard), `routing-types.ts` (inline IntentType). `Task` has **no `type` field** — kind is recomputed ephemerally at evaluation time.
- **3 divergent execution paths** with no shared input contract: CLI `run` (full agent/skill, `spawnWorkerMultiProvider`), MCP `run` (`provider:'claude'` hardcoded, `SpawnBackendFactory`), autonomous `runTaskMode` (generic, no agent/skill).
- `EnvironmentType`/`RequirementProfile`/`ExecutionRequest` = absent.

## 2. Canonical types (the SSOT — `src/core/work-model.ts`, new)
```ts
// The fundamental nature of a unit of work. ONE taxonomy; subsystems MAP from it.
export type TaskKind =
  | 'code-development' | 'test' | 'documentation' | 'audit'
  | 'security' | 'refactor' | 'devops' | 'config'
  | 'design' | 'data' | 'generic';

// Hybrid two-axis: WHAT domain × WHERE/how it runs.
export type WorkDomain = 'code-repo' | 'erp' | 'messaging' | 'web' | 'data-pipeline' | 'generic';
export type ExecutionContext = 'local-dev' | 'ci' | 'docker' | 'air-gapped' | 'production-tenant';
export interface EnvironmentType { domain: WorkDomain; context: ExecutionContext; }

// What the work NEEDS — drives policy/routing/governance/capability-broker.
export type Capability =
  | 'fs-read' | 'fs-write' | 'network' | 'db-query' | 'db-write'
  | 'erp-read' | 'erp-write' | 'shell' | 'approval' | 'provider-pin'
  | 'gpu' | 'tenant-scope' | 'mcp-tool';
export type ResourceNeed = 'memory-high' | 'gpu' | 'network-isolation' | 'secrets' | 'long-running';
export interface RequirementProfile { capabilities: Capability[]; resources: ResourceNeed[]; }

// The canonical INPUT contract — unifies run/start/autonomous across CLI+MCP.
export interface ExecutionRequest {
  description: string;
  kind: TaskKind;
  environment: EnvironmentType;
  requirements: RequirementProfile;
  scope: TaskScope;            // reuse existing TaskScope
  projectRoot: string;
  goNogo?: GoNoGoCriteria;
  effort?: TaskEffort;
  priority?: TaskPriority;
  provider?: ProviderName;     // NO hardcode — explicit or resolved, never assumed 'claude'
  model?: ModelType;
  authMode?: 'subscription' | 'api';
  agentId?: string;
  skillIds?: string[];
  autoApprove?: boolean;
  timeoutMs?: number;
}
```

## 3. Reconciliation mapping (adapters — legacy enum → canonical)
Each legacy enum gets a pure `toTaskKind(legacyValue): TaskKind` adapter so consumers migrate gradually without breaking. Examples: decision `code`→`code-development`, `doc`→`documentation`; rubric `code-development`→`code-development`, `document-write`→`documentation`; router `design`→`design`, `unknown`→`generic`; adr-selector `core-dev`→`code-development`, `dashboard`→`design`. Reverse helpers (`taskKindToRubric`, `taskKindToAdrDomain`, `taskKindToIntent`) let each subsystem derive its view from the ONE canonical kind. `EffectClass` (existing `rubric-registry.ts:375` `getEffectClass`) maps from `(TaskKind, EnvironmentType, RequirementProfile)` — no longer scope-shape-only.

## 4. Migration sequence (core-first; each its own dogfood sprint, verified+reported)
1. **WM-2a (THIS sprint, additive, zero-callsite-change):** create `work-model.ts` (all canonical types + 5 legacy→canonical adapters + reverse helpers) + add **OPTIONAL** `type?: TaskKind` to `Task` (backward-compatible) + hermetic tests. **Dead until a consumer migrates — scored as "foundation laid", NOT "WM-2 done".**
2. **WM-2b:** migrate `rubric-registry` to consume canonical `TaskKind` (first real consumer — proves the SSOT) + set `Task.type` at plan-time in task-builder.
3. **WM-2c:** migrate `task-router` + `adr-selector` + `decision-types` callsites to derive from canonical kind (delete the duplicate taxonomies).
4. **WM-1:** `ExecutionRequest` + a `buildExecutionRequest`/`resolveToTask` builder; migrate CLI `run` → MCP `run` → autonomous `runTaskMode` to the one path.
5. **WM-5:** provider-free hard-enforce (remove MCP-run `provider:'claude'`, inject agent/skill in autonomous, guard `CLAUDE_AUTH_REQUIRED`, stop claude-only docker args leaking to codex/gemini).
6. **WM-6:** wire `getEffectClass` into autonomous policy-gate (risk-tagged actually parks).

## 5. Type-design rules (enterprise-grade, backward-safe)
- **New `Task` fields OPTIONAL** — `Task` is built from JSON (planner writes, worker reads), a path NOT tsc-checked; a required field would break runtime construction while tsc stays green. All additions backward-compatible.
- **After ANY core-touching sprint** (`task-types.ts`/planner/router/evaluator), verify deckent can still **plan→spawn→evaluate a trivial 1-task sprint** (orchestration smoke) — tsc-green ≠ deckent-still-orchestrates.
- Pure functions for all adapters (no side-effects, fully unit-testable). i18n N/A (internal types, no user-facing strings).

## 6. Testing
Hermetic unit tests: every legacy→canonical mapping (all 5 enums, every value), reverse-helper round-trips, `ExecutionRequest` shape validation, `EnvironmentType`/`RequirementProfile` construction, `getEffectClass` derivation from the triple. No spawnSync, tmpdir if any I/O.

## 7. ADR
A new ADR (ADR-087 candidate: "Canonical Work-Model — ExecutionRequest + TaskKind SSOT + two-axis Environment + RequirementProfile") records this; supersedes the 5-enum fragmentation, extends ADR-053 (TaskType taxonomy) to its realized single-source form. Written when WM-2c lands (first consumers migrated), not at the additive step.
</content>
