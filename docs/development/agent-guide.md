# Agent Guide

Comprehensive guide to deckent's agent system — from built-in agents to custom creation, selection algorithm, adaptive behavior, and performance tracking.

## 1. What Are Agents?

Agents are specialized worker personas in deckent's orchestration system. Each agent carries domain-specific instructions, trigger keywords, and model preferences that enable more effective task execution.

Unlike generic workers that use a one-size-fits-all prompt, agents bring focused expertise to specific task types. When Brain plans a sprint and assigns tasks, it routes each task to the most suitable agent using the v2 routing engine (`src/core/routing-engine.ts`).

Key concepts:
- **Agent = Persona + Prompt + Triggers + Activation Rules + Stats**
- Agents are NOT separate processes — they are prompt configurations applied to worker processes
- Each agent has an `agent.json` configuration and a `PROMPT.md` with specialized instructions
- The default `generic` worker is used when no agent matches a task

## 2. Built-in Agents (15 Agents)

All 15 built-in agents are defined as JSON manifests in `src/core/builtins/agents/<name>/agent.json` (loaded by the `AgentPoolManager` in `src/core/agent-pool.ts`):

### security-auditor
Specializes in security-related tasks: vulnerability scanning, authentication fixes, injection prevention, CSRF/XSS mitigation, OWASP compliance.
Triggers: `security`, `auth`, `vulnerability`, `jwt`, `xss`, `csrf`, `injection`

### doc-writer
Handles documentation tasks: README updates, API docs, changelogs, guides, inline documentation. Follows the documentation-writer skill conventions.
Triggers: `docs`, `readme`, `documentation`, `changelog`, `guide`, `api docs`

### bug-fixer
Focused on debugging, regression fixes, and hotfixes. Diagnoses root causes and applies minimal-diff repairs.
Triggers: `fix`, `bug`, `error`, `crash`, `regression`, `hotfix`

### code-reviewer
Performs code review and refactoring: code quality improvements, pattern enforcement, maintainability.
Triggers: `review`, `refactor`, `cleanup`, `quality`, `lint`

### refactorer
Specializes in structural refactoring, code modernization, and technical debt cleanup.
Triggers: `refactor`, `cleanup`, `migrate`, `modernize`, `tech debt`

### api-builder
Designs and implements API endpoints: REST routes, request validation, response formatting, error handling, OpenAPI specs.
Triggers: `api`, `endpoint`, `route`, `rest`, `schema`, `request`, `response`

### performance-analyzer
Targets performance improvements: profiling, memory leak detection, caching strategies, bundle optimization, async tuning.
Triggers: `performance`, `optimize`, `slow`, `memory`, `profiling`, `benchmark`

### ci-guardian
Manages CI/CD health: test regression detection, pipeline fixes, build stability, hermetic test enforcement (ADR-087).
Triggers: `ci`, `pipeline`, `test`, `build`, `coverage`, `hermetic`

### architect
System design and module management: cross-cutting concerns, dependency analysis, architectural patterns.
Triggers: `architecture`, `design`, `module`, `dependency`, `cross-cutting`

### architecture-planner
Architecture planning, ADR authoring, roadmap planning. Writes Architecture Decision Records.
Triggers: `plan`, `roadmap`, `adr`, `architectural decision`

### accessibility-auditor
WCAG compliance, a11y testing, accessibility reviews for UI components.
Triggers: `accessibility`, `a11y`, `wcag`, `aria`

### data-engineer
Data pipeline design, ETL, data modeling, query optimization.
Triggers: `data`, `pipeline`, `etl`, `query`, `database`

### devops-engineer
CI/CD pipelines, Docker configurations, deployment scripts, infrastructure setup.
Triggers: `devops`, `deploy`, `docker`, `infrastructure`, `github actions`

### frontend-designer
UI/UX components, React, Vite, Tailwind, responsive design, dashboard control plane.
Triggers: `frontend`, `ui`, `design`, `react`, `component`, `dashboard`

### migration-specialist
Framework and library migrations: version upgrades, API changes, dependency updates, breaking change resolution.
Triggers: `migration`, `upgrade`, `migrate`, `deprecation`, `breaking change`

## 3. Agent Selection Algorithm (v2 Routing)

Agent selection uses the three-layer v2 routing engine (`src/core/routing-engine.ts:routeTaskV2`). This runs during `planSprint()` in `src/orchestra/sprint-planner.ts`.

### Layer 1 — Intent Classification (`src/core/intent-classifier.ts`)
Classifies the task's primary intent from scope and description:
- `implementation`, `documentation`, `security`, `testing`, `refactoring`, `architecture`, `devops`, `frontend`, `data`, `performance`, `accessibility`, `api`

### Layer 2 — Activation Engine (`src/core/activation-engine.ts`)
Evaluates structured activation rules per agent. Each agent has an `activation` config with rules, `minScore` threshold, and optional `excludes`.

### Layer 3 — Routing Engine (`src/core/routing-engine.ts`)
Combines intent signal, activation score, agent-task affinity, and history bonus into a final routing decision with confidence score.

```
routeTaskV2(task, agentPool, skillPool, options)
  → RoutingDecision { agent, skills, confidence, routingVersion: 'v2' }
```

**Fallback chain:** v2 routing → `selectAgentByFallback()` → generic worker

### Override Support

The task spec can override routing:
```markdown
- Agent: bug-fixer          # Force a specific agent
- Skills: typescript-expert # Force specific skills
```

Override fields in task JSON: `forceAgent`, `forceSkills`, `excludeAgent`, `excludeSkills`.

## 4. Custom Agents

Create custom agents for project-specific needs:

```bash
deckent agent create my-agent
deckent agent create my-agent --model sonnet --description "My custom agent"
```

This creates `.deckent/agents/my-agent/` with:
- `agent.json` — configuration (triggers, model, activation rules, stats)
- `PROMPT.md` — specialized prompt instructions

### agent.json Structure

```json
{
  "name": "my-agent",
  "type": "custom",
  "enabled": true,
  "model": "sonnet",
  "triggers": ["keyword1", "keyword2"],
  "description": "Custom agent for specific tasks",
  "uses": 0,
  "successRate": 0,
  "createdAt": "2026-06-14T00:00:00.000Z",
  "updatedAt": "2026-06-14T00:00:00.000Z"
}
```

### PROMPT.md Guidelines

- Be specific about the domain expertise
- Include concrete examples and patterns
- Reference project conventions
- Keep under 500 lines for optimal context usage

### Adaptive Agent

The **Adaptive Agent** (`src/agents/adaptive-agent.ts`) performs runtime agent
adaptation: it tailors the resolved agent's prompt and behavior to the live task
context at spawn time. Rather than shipping a single static persona, the adaptive
layer enriches the selected agent with task-specific signals (scope, stack, prior
outcomes), so the same built-in agent behaves differently for a Python data task
versus a TypeScript API task. This keeps the agent roster small while adapting each
worker to the work at hand.

## 5. Agent Pool Management

Agents are stored in two pools:

| Pool | Path | Max | Eviction |
|------|------|-----|----------|
| Persistent (custom) | `.deckent/agents/` | — | Manual disable |
| Temporary (auto-generated) | `.deckent/agents/temp-<id>/` | 50 | LRU eviction (5 sprint age) |

Temporary agents are created by `planSprint()` for project-specific conventions (e.g., a Python expert for a Python project). They are promoted to permanent via the Evolution Pipeline.

### Agent Commands

```bash
deckent agent list                   # All agents in the pool
deckent agent create <name>          # Create a custom agent
deckent agent stats <name>           # Sprint-by-sprint performance
deckent agent info <name>            # Detailed agent configuration
deckent agent enable <name>          # Re-enable a disabled agent
deckent agent disable <name>         # Disable an agent (excluded from routing)
deckent agent delete <name>          # Remove from pool
deckent agent edit <name>            # Edit agent configuration
```

### Retirement

Agents leave the pool through three retirement paths:

- **LRU eviction** — Temporary agents are capped at 50 entries; the least-recently-used
  temp agents (older than 5 sprints) are evicted automatically to keep the pool lean
  (`src/core/agent-pool.ts`). Persistent agents are never evicted.
- **Disable** — `deckent agent disable <name>` removes an agent from routing without
  deleting it; `deckent agent enable <name>` reverses this. Disabled agents are skipped
  by the routing engine but their configuration and history are preserved.
- **Demotion** — Underperforming agents are demoted by the Evolution Pipeline (their
  activation rules are weakened or the agent is disabled) based on outcome data.

## 6. Evolution Pipeline

Agents improve over time through the Evolution Pipeline (`src/orchestra/promotion-pipeline.ts`):

- **Outcome Tracking**: `src/orchestra/outcome-tracker.ts` records routing decisions and their outcomes (DONE/GO_WITH_TECH_DEBT/NO_GO).
- **Adaptive Thresholds**: Activation rules are adjusted based on outcome data.
- **Promotion**: High-performing temp agents are promoted to persistent agents.
- **Demotion**: Underperforming agents have their activation rules weakened or are disabled.
- **Rule Evolution**: `src/orchestra/rule-evolver.ts` auto-generates activation rules from outcome patterns.

## 7. Performance Tracking

Agent performance is tracked at multiple levels:

### Per-Task Metrics
- Task completion status (DONE, GO_WITH_TECH_DEBT, NO_GO)
- Duration in milliseconds
- Test pass rate and coverage percentage

### Per-Sprint Metrics
- Tasks assigned vs completed
- Success rate for the sprint
- Average duration per task

### Historical Metrics
- Cumulative success rate
- Task type distribution
- Trend direction (improving, stable, declining)

### Viewing Performance
```bash
deckent agent stats <name>            # Sprint-by-sprint breakdown for one agent
deckent agent stats <name> --json     # Machine-readable JSON output for tooling
deckent agent list                    # Summary table for all agents
deckent agent list --json             # Machine-readable JSON output
```

The `--json` flag on `deckent agent stats` and `deckent agent list` emits structured
output (counts, success rate, per-sprint history) for scripting and dashboard ingestion.

Brain uses these metrics during planning to make informed agent-task assignments, creating a feedback loop that improves sprint outcomes over time.

---

*Source: `src/core/agent-pool.ts`, `src/core/routing-engine.ts`, `src/cli/commands/agent.ts`*
