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

When the brain assigns tasks to workers, it runs the agent selection algorithm:

1. Load all enabled agents from `.deckent/agents/`
2. For each task, combine `title` and `description` into a search string
3. For each agent, count how many of its triggers appear in the search string (case-insensitive)
4. The agent with the highest trigger match count wins
5. If no agent has any trigger matches, the task is assigned to `generic`

Tie-breaking: when multiple agents have the same score, the first one in directory order wins. To ensure deterministic selection, use specific, non-overlapping triggers.

## Multi-Agent Pipelines

For complex tasks, multiple agents can be chained in a pipeline:

```
code-reviewer -> bug-fixer -> security-auditor
```

Pipeline execution:
1. Steps execute sequentially in the defined order
2. Each step receives a shared context with all prior step results
3. On failure, the pipeline aborts by default (configurable with `continueOnError`)
4. The final context contains all step outputs for evaluation

Pipelines are defined per-task when the brain determines that a task benefits from multiple perspectives.

## Agent Stats and Learning

Each agent tracks its performance:

- **uses**: total number of times the agent has been assigned to a task
- **successRate**: percentage of tasks that received DONE evaluation (vs GO_WITH_TECH_DEBT or NO_GO)

After each sprint, the brain updates agent stats. Over time, the selection algorithm can factor in success rates to prefer agents that consistently produce good results for matching tasks.

View agent stats:

```bash
deckent agent list
```

## Temp Agents

Temporary agents can be created for a single sprint and discarded afterward. This is useful for one-off specialized work:

1. Create a temp agent: `deckent agent create temp-sprint-029`
2. Configure its triggers and prompt for the specific sprint tasks
3. Run the sprint -- tasks will be matched to the temp agent
4. Delete the agent directory after the sprint completes

Temp agents follow the same selection algorithm as permanent agents. They are not automatically cleaned up -- manual removal is required.

## Configuration

Agent behavior is configured at multiple levels:

**Project-level** (`.deckent/config.json`):
- `agent_selection`: `"auto"` (default), `"manual"`, or `"disabled"`
- When `"disabled"`, all tasks use the generic worker

**Agent-level** (`agent.json`):
- `enabled`: toggle agent on/off without deleting
- `model`: preferred model for this agent's tasks
- `triggers`: keywords for automatic selection

**CLI commands**:
- `deckent agent list` -- view all agents and their stats
- `deckent agent list --json` -- JSON output for programmatic use
- `deckent agent create <name>` -- scaffold a new custom agent
- `deckent agent enable <name>` -- re-enable a disabled agent
- `deckent agent disable <name>` -- disable an agent without deleting
