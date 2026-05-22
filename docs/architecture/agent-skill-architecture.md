# Agent / Skill Architecture & Routing

> **Status:** Current architecture companion. **Last verified:** Sprint 186 (2026-05-22).
>
> **Background:** The agent pool, composable skill system, and intent-based Brain
> routing described here were introduced across Sprints 029–033 and have evolved
> substantially since (notably the Routing v2 engine in Sprint 063 and the
> agent-taxonomy reform in ADR-041). This document describes **what exists now**,
> in present tense. For the broader system view see
> [architecture.md](architecture.md); for the user-facing agent guide see
> [agents.md](agents.md); for the canonical, auto-generated agent list see
> [../reference/agents.md](../reference/agents.md).

This document explains how Deckent matches tasks to specialized worker
**agents** and composes domain **skills**, how the Brain makes the
agent + skill + model + scope decision per task, and where each mechanism
lives in the code.

---

## Table of Contents

1. [Agent Pool](#1-agent-pool)
2. [Skill System](#2-skill-system)
3. [Brain Routing Decision](#3-brain-routing-decision)
4. [Learning Loop](#4-learning-loop)
5. [Promotion & Demotion Pipeline](#5-promotion--demotion-pipeline)
6. [User Experience Surface](#6-user-experience-surface)

---

## 1. Agent Pool

### 1.1 Concept

Every task is executed by a worker, but the worker is not generic. The Brain
selects a specialized **agent persona** for the task and injects that agent's
`PROMPT.md` into the worker prompt. An agent carries a domain system prompt,
activation rules, a preferred model, and performance statistics. When no agent
meets the activation threshold, the task falls back to a `generic` worker.

The three structural roles in the system remain `brain | auditor | worker`
(`AgentRole` in `src/core/monitoring-types.ts`). "Agents" in this document are *worker
personas* layered on top of the `worker` role — they shape the prompt and
routing, not the process model.

### 1.2 Agent Definition

Agents are typed by `AgentDefinition` (`src/core/agent-types.ts`) and stored on
disk, one directory per agent:

```
.deckent/
  agents/
    security-auditor/
      agent.json          # AgentDefinition (triggers, model, stats, activation)
      PROMPT.md            # System prompt injected before the task prompt
    doc-writer/
      agent.json
      PROMPT.md
    ...
.tasks/
  agents/                  # Temporary, per-sprint agents (separate pool)
    {temp-agent}/
      agent.json
      PROMPT.md
```

Loading, validation, selection, persistence, and temp-agent lifecycle are
handled by `AgentPoolManager` in `src/core/agent-pool.ts`. Each agent tracks
`stats` (`totalUses`, `successRate`, `avgCoverage`, `lastUsedInSprint`) via
`createDefaultStats()`.

### 1.3 Built-in Agents

Deckent ships **15 built-in agents**. Per **ADR-041** (Agent Taxonomy —
horizontal skills vs vertical agents), there is **no dedicated test agent**:
testing is handled per-task as a skill/tag concern, and test work routes to
`architect`/`refactorer` via the intent fallback chain.

The 15 built-in agents are:

| Agent | Focus |
|-------|-------|
| `security-auditor` | Security vulnerabilities, auth, injection, XSS/CSRF |
| `doc-writer` | README, API docs, changelogs, guides, JSDoc |
| `bug-fixer` | Debugging, regressions, hotfixes |
| `code-reviewer` | Code quality, review, best practices |
| `refactorer` | Restructuring, cleanup, modernization |
| `api-builder` | REST / OpenAPI endpoint design |
| `performance-analyzer` | Profiling, optimization, benchmarks |
| `ci-guardian` | CI/CD health, regression, build (hook-aware) |
| `architect` | System design, modules, dependency analysis |
| `architecture-planner` | Architectural planning, ADRs, roadmap |
| `accessibility-auditor` | WCAG, a11y audits |
| `data-engineer` | Data pipelines, ETL, data modeling |
| `devops-engineer` | CI/CD, Docker, deployment, infrastructure |
| `frontend-designer` | UI/UX, components, responsive design |
| `migration-specialist` | Version / framework migration, deprecations |

> **Drift note:** Activation keywords and per-agent model preferences live in
> each `agent.json` and are surfaced by the auto-generated reference
> ([../reference/agents.md](../reference/agents.md), `npm run docs:ref`). This
> table is a stable overview only; it intentionally does **not** re-list
> activation keywords, because hand-maintained trigger tables drift from the
> manifests.

### 1.4 Temp Agents & LRU Eviction

Temporary agents created for a single sprint live under `.tasks/agents/`.
`AgentPoolManager` enforces LRU-style eviction with two defaults from
`src/core/agent-pool.ts`:

- `DEFAULT_MAX_TEMP_AGENTS = 50` — maximum number of temp agents kept.
- `DEFAULT_MAX_AGENT_AGE = 5` — a temp agent unused for more than 5 sprints is
  considered stale (`isTempAgentStale()`).

Built-in agents are never evicted. Selection (built-in + temp) goes through the
unified routing engine described in §3.

---

## 2. Skill System

### 2.1 Concept

Skills are composable, domain-specific instruction bundles that are injected
into the worker prompt alongside the selected agent. Unlike agents (one per
task, "who is doing it"), multiple skills can compose on one task ("what
expertise to apply"). Skills are the *horizontal* axis of ADR-041; agents are
the *vertical* axis.

### 2.2 Skill Definition & Storage

Skills are typed by `SkillDefinition` (`src/core/skill-types.ts`), which extends
the plugin manifest model with skill-specific fields: a `SkillCategory`
(`language | framework | tool | domain | workflow`), stack-detection rules,
composition affinity, priority, and a prompt-injection position
(`prepend | append | section`). Each skill is a directory:

```
.deckent/
  skills/
    typescript-expert/
      manifest.json        # SkillDefinition
      SKILL.md             # Domain instructions injected into the prompt
    ...
```

- `src/core/skill-pool.ts` — `SkillPoolManager`: loads/validates skills from
  `.deckent/skills/`, skipping directories with invalid `manifest.json`.
- `src/core/skill-registry.ts` — `SkillRegistry`: JSON-backed central registry
  (register / search / getPopular / getAll / remove).
- `src/core/skill-selector.ts` — composition resolution (`resolveComposition`),
  used by the routing engine.
- `src/core/skill-cache.ts` — skill resolution cache.

### 2.3 Built-in Skills

Deckent ships **21 built-in skills**:

`typescript-expert`, `testing-expert`, `documentation-writer`,
`security-specialist`, `performance-optimizer`, `api-builder`,
`devops-engineer`, `database-migration`, `react-specialist`, `python-expert`,
`ci-testing`, `accessibility-expert`, `anthropic-sdk`, `code-simplifier`,
`docker-expert`, `frontend-design`, `git-expert`, `graphql-expert`,
`migration-expert`, `monorepo-expert`, `system-architect`.

Per-skill triggers, categories, and stack-detection rules live in each
`manifest.json` — see [agents.md](agents.md) for the user-facing guide and
`deckent skill list` for the live registry.

### 2.4 Skill Sandbox Validation

Skills sourced from the marketplace are security-scanned before they may run.
`src/core/marketplace/skill-sandbox.ts` performs a two-pass scan: a fast regex
pass over all files plus an **AST-level scan** of `.ts`/`.js` files
(`scanCodeAST()`) that flags dangerous calls (e.g. `eval`, code-executing
`Function`, dangerous `require` targets) and quarantines violators. AST scanning
degrades gracefully when the TypeScript compiler is unavailable at runtime.

### 2.5 Skill Budget & Composition

Skill composition is bounded so the worker prompt does not overflow. The
routing engine applies a skill budget driven by task size and effort
(`SKILL_BUDGET_BY_SIZE`, `SKILL_TOKEN_BUDGET_BY_EFFORT`,
`DEFAULT_TOKEN_BUDGET_PER_SKILL`, `DEFAULT_TOKEN_BUDGET_TOTAL` in
`src/core/routing-types.ts`) and resolves the final ordered set via
`resolveComposition()` in `src/core/skill-selector.ts`.

---

## 3. Brain Routing Decision

### 3.1 Routing v2 — Three Layers

Routing v2 (introduced Sprint 063) replaced flat keyword scoring with a unified,
intent-based pipeline. The entry point is `routeTaskV2()` in
`src/core/routing-engine.ts`, orchestrated per task through
`src/orchestra/task-router.ts`.

```
Layer 1 — Intent Classification    (src/core/intent-classifier.ts)
  Task scope + title + description → TaskDNA
  { intent, subIntent, operation, size, tags }
  Intents: security | bugfix | refactor | documentation | performance |
           design | devops | config | migration | architecture |
           implementation | unknown
  (ADR-041 / Sprint 148: no 'testing' primary intent — test work is a
   'test-coverage' tag on TaskDNA, not an agent.)
      ↓
Layer 2 — Activation Engine        (src/core/activation-engine.ts)
  Evaluate each agent's / skill's structured ActivationConfig against
  TaskDNA via condition-evaluator.ts ($gt, $contains, $and, $or).
  Exclusions are checked first; excluded entities score 0 and are skipped.
  V1 manifests are migrated on the fly
  (migrateV1AgentToActivation / migrateV1SkillToActivation).
      ↓
Layer 3 — Routing Engine           (src/core/routing-engine.ts)
  routeTaskV2(): combine activation scores + learning bonuses +
  user overrides → RoutingDecision
  { agent, skills[], confidence, intent }
```

### 3.2 Agent Fallback Chain

When no agent clears the activation threshold, selection is deterministic via
`AGENT_FALLBACK_CHAIN` (`src/core/routing-engine.ts`), keyed by intent. For
example: `bugfix → [bug-fixer, refactorer]`, `documentation → [doc-writer]`,
`security → [security-auditor]`, `architecture → [architecture-planner,
architect]`, `unknown → [architect]`. This chain encodes the ADR-041 rule that
testing tasks route to `architect`/`refactorer` (there is no `test-writer`).

### 3.3 Overrides & Confidence

- **User / DIRECTIVES overrides:** `Agent:`, `Skills:`, `Model:` (and exclude
  variants) in DIRECTIVES become `forceAgent` / `forceSkills` / `forceModel` /
  `excludeAgent` / `excludeSkills` on the task JSON. `resolveOverrides()`
  resolves precedence among override sources.
- **Confidence:** `calculateConfidence()` and `assessContextFit()` produce a
  confidence level recorded in `task.routingMeta` (`routingVersion`,
  `confidence`, `taskDNA`), giving the audit trail visibility into *why* a task
  was routed a particular way.

### 3.4 Decision Output

The decision feeds the rest of planning:

1. **Agent** → its `PROMPT.md` is prepended to the worker prompt.
2. **Skills** → each selected `SKILL.md` is injected (position per
   `promptInjection`), within the skill/token budget.
3. **Model** → model resolution (`forceModel` / agent preference / pattern
   upgrade / usage pressure) selects the final tier; tier equivalence across
   providers comes from `src/core/model-registry.ts`.
4. **Scope** → from DIRECTIVES; workers must stay within `scope.directories` and
   `scope.filesWrite` (Auditor monitors via `git diff --stat` — advisory in
   V1.0 per ADR-037, hard-flip post-GA V2).

The full prompt assembly is performed by `buildWorkerPrompt()` in
`src/orchestra/task-builder.ts`.

---

## 4. Learning Loop

Agent and skill selection improves across sprints from real evaluation
outcomes. After each sprint, evaluation results (DONE / GO_WITH_TECH_DEBT /
NO_GO, coverage, duration) are recorded and rolled into entity performance.
`src/orchestra/outcome-tracker.ts` aggregates per-entity outcomes and computes
**learning bonuses** (capped by `LEARNING_BONUS_CAP` in
`src/core/routing-types.ts`) plus an agent↔skill synergy matrix. These bonuses
feed back into Layer 3 scoring so combinations that historically succeeded for a
given intent are preferred and ones that led to NO_GO are penalized.

Agent statistics (`totalUses`, `successRate`, `avgCoverage`,
`lastUsedInSprint`) are persisted back to each `agent.json` and surfaced via
`deckent agent list` and sprint history.

---

## 5. Promotion & Demotion Pipeline

`src/orchestra/promotion-pipeline.ts` (`PromotionPipeline`) automatically
promotes well-performing **temp** agents/skills to permanent and demotes
underperforming ones, using `OutcomeTracker` data.

Default criteria (from `promotion-pipeline.ts`):

| Action | Criteria (defaults) |
|--------|---------------------|
| **Promote** | `minTasks: 8`, `minSuccessRate: 0.85`, `minSprints: 3` |
| **Demote**  | `maxFailRate: 0.50`, `minTasks: 5`, `unusedSprints: 5` |

The pipeline returns a `PromotionResult` (`promote | demote | wait`) per entity
with the reason and the performance snapshot that justified it.

---

## 6. User Experience Surface

Agent and skill information is exposed across every interaction mode:

| Surface | Where agents/skills appear |
|---------|----------------------------|
| **CLI** | `deckent agent list` / `--json`, `deckent skill list`, sprint summary "Agent Performance" section, status dashboard |
| **MCP** | `deckent_agent_list`, `deckent_skill_list`, agent/skill info in `deckent_status` |
| **Web Dashboard** | Sprint/agent visualization (React + Vite) |
| **API** | Sprint detail and history endpoints surface routing + agent stats |

CLI rendering helpers live under `src/cli/helpers/` (status/dashboard
formatting, messages via i18n, structured error handling). Routing decisions
and outcomes are emitted to the structured event stream
(`src/orchestra/event-stream.ts`) so the audit trail and dashboard can show why
a task was routed to a given agent/skill set.

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | Full system architecture overview |
| [agents.md](agents.md) | User-facing agent guide (creation, selection, pipelines) |
| [../reference/agents.md](../reference/agents.md) | Auto-generated canonical agent list (`npm run docs:ref`) |
| [authority-matrix.md](authority-matrix.md) | Brain / Auditor / Worker RBAC (ADR-037) |

---

## ADR References

| ADR | Relevance |
|-----|-----------|
| **ADR-041** | Agent Taxonomy — horizontal skills vs vertical agents; no dedicated test agent (15 built-in agents) |
| **ADR-028** | Decision-Engine V1 → V2 routing migration |
| **ADR-037** | Brain-Auditor-Worker Authority Matrix — scope enforcement (advisory V1.0) |
| **ADR-036** | ADR Governance — ADRs injected into worker prompts as mandatory constraints |

*Facts in this document are derived from source code (single source of truth):
`src/core/agent-pool.ts`, `src/core/agent-types.ts`, `src/core/skill-pool.ts`,
`src/core/skill-registry.ts`, `src/core/skill-selector.ts`,
`src/core/routing-engine.ts`, `src/core/intent-classifier.ts`,
`src/core/activation-engine.ts`, `src/core/marketplace/skill-sandbox.ts`,
`src/orchestra/promotion-pipeline.ts`, `src/orchestra/task-router.ts`.*
