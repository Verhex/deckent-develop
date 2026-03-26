# Agent System

Deckent's agent system allows tasks to be routed to specialized worker personas. Each agent carries its own prompt, triggers, and model preferences, enabling more effective task execution through domain expertise.

## What Are Agents?

Agents are specialized worker personas that bring domain-specific knowledge and instructions to task execution. Instead of using a single generic worker prompt for every task, deckent can match tasks to the most suitable agent based on keyword triggers in the task title and description.

Each agent consists of:
- **agent.json** -- configuration, triggers, model, and statistics
- **PROMPT.md** -- specialized instructions injected into the worker prompt

When no agent matches a task, the default `generic` worker is used.

## Built-in Agents

Deckent ships with the following built-in agents:

### security-auditor

Specializes in security-related tasks: vulnerability scanning, authentication fixes, injection prevention, CSRF/XSS mitigation. Uses opus model by default for thorough analysis.

Triggers: `security`, `vulnerability`, `jwt`, `authentication`, `xss`, `csrf`, `injection`, `auth`

### test-writer

Focused on creating and improving tests: unit tests, integration tests, test coverage improvements, spec files. Ensures tests follow project conventions and achieve target coverage.

Triggers: `test`, `unit test`, `integration test`, `coverage`, `spec`, `vitest`, `jest`

### doc-writer

Handles documentation tasks: README updates, API docs, changelogs, guides, and inline documentation. Produces clear, consistent documentation following project style.

Triggers: `readme`, `documentation`, `docs`, `changelog`, `api docs`, `guide`

### code-reviewer

Performs code review and refactoring: code quality improvements, linting fixes, dead code removal, pattern enforcement. Focuses on maintainability and readability.

Triggers: `review`, `refactor`, `code quality`, `lint`, `clean up`, `dead code`

### performance-optimizer

Optimizes runtime performance: query optimization, caching strategies, bundle size reduction, memory leak fixes. Measures before and after.

Triggers: `performance`, `optimize`, `cache`, `memory leak`, `bundle size`, `slow`

### migration-specialist

Handles migration tasks: database migrations, framework upgrades, API version bumps, dependency updates. Ensures backward compatibility.

Triggers: `migration`, `upgrade`, `migrate`, `database`, `schema`, `dependency update`

### api-designer

Designs and implements API endpoints: REST, GraphQL, WebSocket interfaces. Follows API design best practices and ensures proper validation.

Triggers: `api`, `endpoint`, `rest`, `graphql`, `websocket`, `route`, `controller`

### devops-agent

Manages CI/CD, deployment, and infrastructure tasks: GitHub Actions, Docker, environment configuration, monitoring setup.

Triggers: `ci`, `cd`, `deploy`, `docker`, `github actions`, `pipeline`, `infrastructure`

### ci-guardian (Sprint 062)

A CI-aware agent that integrates with the sprint lifecycle through plugin hooks. Handles pre-sprint CI validation (beforeSprint), task-level regression detection (afterTask), and sprint CI reporting (afterSprint). Works with the ci-testing skill for comprehensive CI integration and sprint-to-sprint learning.

Triggers: `ci`, `test`, `regression`, `coverage`, `pipeline`, `build`, `lint`, `workflow`

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
code-reviewer -> test-writer -> security-auditor
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
