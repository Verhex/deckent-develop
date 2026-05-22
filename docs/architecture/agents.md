# Agent System

Deckent's agent system allows tasks to be routed to specialized worker personas. Each agent carries its own prompt, triggers, and model preferences, enabling more effective task execution through domain expertise.

## What Are Agents?

Agents are specialized worker personas that bring domain-specific knowledge and instructions to task execution. Instead of using a single generic worker prompt for every task, deckent can match tasks to the most suitable agent based on keyword triggers in the task title and description.

Each agent consists of:
- **agent.json** -- configuration, triggers, model, and statistics
- **PROMPT.md** -- specialized instructions injected into the worker prompt

When no agent matches a task, the default `generic` worker is used.

## Built-in Agents

Deckent ships **15 built-in agents** (ADR-041 — testing is handled per-task,
not via a dedicated test agent). The canonical list with each agent's
preferred model, primary intent, and activation keywords is **auto-generated**
— see [docs/reference/agents.md](../reference/agents.md) (`npm run docs:ref`).
The list below is a stable overview only.

| Agent | Focus |
|-------|-------|
| `security-auditor` | Security: vulnerabilities, auth, injection, XSS/CSRF |
| `doc-writer` | README, API docs, changelogs, guides, JSDoc |
| `bug-fixer` | Debugging, regressions, hotfixes |
| `code-reviewer` | Code quality, review, best practices |
| `refactorer` | Restructuring, cleanup, modernization |
| `api-builder` | REST / OpenAPI endpoint design |
| `performance-analyzer` | Profiling, optimization, benchmarks |
| `ci-guardian` | CI/CD health, regression, build (plugin-hook aware: beforeSprint / afterTask / afterSprint) |
| `architect` | System design, modules, dependency analysis |
| `architecture-planner` | Architectural planning, ADRs, roadmap |
| `accessibility-auditor` | WCAG, a11y audits |
| `data-engineer` | Data pipelines, ETL, data modeling |
| `devops-engineer` | CI/CD, Docker, deployment, infrastructure |
| `frontend-designer` | UI/UX, components, responsive design |
| `migration-specialist` | Version / framework migration, deprecations |

> Activation keywords and model assignments live in the agent manifests
> (`.deckent/agents/*/agent.json`) and the auto-generated reference above —
> intentionally not duplicated here to avoid drift.

## Creating Custom Agents

Create a new agent using the CLI:

```bash
deckent agent create my-agent
```

This creates:
- `.deckent/agents/my-agent/agent.json` -- agent configuration
- `.deckent/agents/my-agent/PROMPT.md` -- prompt template

Edit `agent.json` to customize triggers, model, and description:

```json
{
  "name": "my-agent",
  "type": "custom",
  "enabled": true,
  "model": "sonnet",
  "triggers": ["keyword1", "keyword2"],
  "description": "What this agent specializes in",
  "uses": 0,
  "successRate": 0
}
```

Edit `PROMPT.md` to define the agent's specialized instructions.

## Agent Selection Algorithm

When the brain assigns tasks to workers, it runs the agent selection algorithm
(`src/core/agent-selector.ts` — `selectAgent()`):

1. Load all enabled agents from `.deckent/agents/` (persistent) and `.tasks/agents/` (sprint-scoped temp)
2. Extract keywords from task `title` + `description` (stopwords and short tokens filtered out)
3. For each enabled agent, compute a weighted score:
   - **+2** for each `triggerKeywords` entry that matches a task keyword
   - **+3** for each `triggerScopes` directory that overlaps with the task's `scope.directories`
   - **+1** for each `triggerFilePatterns` glob that matches a file in `scope.filesWrite`
4. Agents scoring below the minimum threshold (default 3) are discarded
5. The highest-scoring agent wins; ties are broken by `stats.successRate` (higher wins)
6. If no agent meets the threshold, the task falls through an intent-based fallback chain
   (`src/core/routing-engine.ts` — `selectAgentByFallback()`), then defaults to `generic`

Override: set `forceAgent` in the task JSON or DIRECTIVES `Agent:` field to bypass scoring.

## Agent Stats and Learning

Each agent tracks its performance in `agent.json` under `stats`:

- **totalUses**: total number of times the agent has been assigned to a task
- **successRate**: fraction (0.0–1.0) of tasks that received DONE evaluation
- **lastUsedInSprint**: the sprint ID when the agent was last active

After each sprint the brain updates these stats via `AgentPoolManager.updateStats()`.
The selection algorithm already uses `successRate` for tie-breaking; higher-performing
agents naturally win when scores are equal.

View agent stats:

```bash
deckent agent list
deckent agent stats <name>   # sprint-by-sprint breakdown
```

## Temp Agents

Temporary agents can be created for a single sprint and discarded afterward.
Two storage locations exist:

- **Sprint-scoped** (`.tasks/agents/{sprintId}-{name}/`) — created via
  `AgentPoolManager.createTempAgent()`, subject to LRU eviction (default max 50)
- **Persistent temp** (`.deckent/agents/temp-{name}/`) — created via
  `AgentPoolManager.saveTempAgentToPool()`; survive across sprints until explicitly removed

For custom one-off agents created with `deckent agent create`:

1. Create: `deckent agent create temp-sprint-029`
2. Configure triggers and prompt in `.deckent/agents/temp-sprint-029/`
3. Run the sprint — tasks will be matched to the temp agent via the normal scoring algorithm
4. Delete when done: `deckent agent delete temp-sprint-029`

Agents in `.deckent/agents/` are not automatically evicted; manual deletion is required.

## Configuration

Agent behavior is configured at multiple levels:

**Project-level** (`.deckent/config.json`):
- `routing_engine`: `"v1"` (keyword-based `selectAgent`) or `"v2"` (intent + activation engine)
- `agent_min_score`: minimum score threshold for agent selection (default 5, range 2–8)
- To disable agent selection for all tasks: set `enabled: false` in each `agent.json`,
  or omit agents — the fallback chain and `generic` worker are always available

**Agent-level** (`agent.json`):
- `enabled`: toggle agent on/off without deleting
- `model`: preferred model for this agent's tasks
- `triggers`: keywords for automatic selection (maps to `triggerKeywords` in agent-pool)

**CLI commands**:
- `deckent agent list` -- view all agents and their stats
- `deckent agent list --json` -- JSON output for programmatic use
- `deckent agent create <name>` -- scaffold a new custom agent
- `deckent agent enable <name>` -- re-enable a disabled agent
- `deckent agent disable <name>` -- disable an agent without deleting
- `deckent agent delete <name>` -- permanently remove an agent
- `deckent agent edit <name>` -- update model, triggers, description, or sync PROMPT.md
- `deckent agent stats <name>` -- sprint-by-sprint performance breakdown
- `deckent agent info <name>` -- show full agent config and PROMPT.md
