# Agent Guide

Comprehensive guide to deckent's agent system -- from built-in agents to custom creation, selection algorithm, adaptive behavior, retirement, and performance tracking.

## 1. What Are Agents?

Agents are specialized worker personas in deckent's orchestration system. Each agent carries domain-specific instructions, trigger keywords, and model preferences that enable more effective task execution.

Unlike generic workers that use a one-size-fits-all prompt, agents bring focused expertise to specific task types. When Brain plans a sprint and assigns tasks, it matches each task to the most suitable agent based on keyword analysis of the task title and description.

Key concepts:
- **Agent = Persona + Prompt + Triggers + Stats**
- Agents are NOT separate processes -- they are prompt configurations applied to worker processes
- Each agent has a `agent.json` configuration and a `PROMPT.md` with specialized instructions
- The default `generic` worker is used when no agent matches a task

## 2. Built-in Agents (8 Agents)

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
Triggers: `review`, `refactor`, `lint`, `cleanup`, `dead code`, `code quality`

### performance-optimizer
Targets performance improvements: bundle size optimization, runtime profiling, memory leak fixes, caching strategies, lazy loading implementation.
Triggers: `performance`, `optimize`, `bundle`, `cache`, `lazy`, `memory`, `profiling`

### migration-specialist
Handles framework and library migrations: version upgrades, API changes, dependency updates, breaking change resolution.
Triggers: `migration`, `upgrade`, `migrate`, `breaking change`, `deprecation`, `version`

### api-designer
Designs and implements API endpoints: REST routes, GraphQL schemas, request validation, response formatting, error handling.
Triggers: `api`, `endpoint`, `route`, `rest`, `graphql`, `schema`, `request`, `response`

### devops-agent
Manages CI/CD pipelines, Docker configurations, deployment scripts, environment setup, and infrastructure tasks.
Triggers: `ci`, `cd`, `docker`, `deploy`, `pipeline`, `github actions`, `infrastructure`

## 3. Agent Selection Algorithm

When Brain assigns tasks to workers, the agent selection algorithm runs:

1. **Trigger Matching**: Each agent's trigger keywords are compared against the task title and description. A match score is computed based on the number and relevance of keyword hits.

2. **Scoring Formula**:
   ```
   score = (triggerHits * triggerWeight) + (stackBonus) + (historyBonus)
   ```
   - `triggerHits`: Number of matching keywords
   - `triggerWeight`: Agent-specific weight (default 1.0)
   - `stackBonus`: +2 if the agent's preferred stack matches the project
   - `historyBonus`: +1 if the agent has successfully completed similar tasks before

3. **Threshold Check**: An agent must score above the minimum threshold (default: 2) to be considered.

4. **Fallback**: If no agent scores above threshold, the `generic` worker is used.

5. **Conflict Resolution**: When multiple agents score equally, the agent with higher historical success rate is preferred.

## 4. Custom Agents

Create custom agents for project-specific needs:

```bash
deckent agent create my-agent
```

This creates `.deckent/agents/my-agent/` with:
- `agent.json` -- configuration (triggers, model, weight)
- `PROMPT.md` -- specialized prompt instructions

### agent.json Structure

```json
{
  "name": "my-agent",
  "description": "Custom agent for specific tasks",
  "triggers": ["keyword1", "keyword2"],
  "model": "sonnet",
  "weight": 1.0,
  "enabled": true,
  "stats": {
    "tasksCompleted": 0,
    "tasksFailed": 0,
    "avgDuration": 0,
    "successRate": 0
  }
}
```

### PROMPT.md Guidelines

- Be specific about the domain expertise
- Include concrete examples and patterns
- Reference project conventions
- Keep under 500 lines for optimal context usage

## 5. Adaptive Agent Behavior

Agents improve over time through the learning system:

- **Success Tracking**: Each task result updates the agent's stats (tasksCompleted, tasksFailed, avgDuration, successRate).
- **Pattern Detection**: The Auditor identifies recurring patterns -- if an agent consistently fails at certain task types, Brain adjusts future assignments.
- **Model Adjustment**: If an agent's tasks frequently result in NO_GO with a lower model, Brain may upgrade the model for that agent's future tasks.
- **Trigger Refinement**: Over multiple sprints, the system identifies which trigger keywords lead to the best agent-task matches and can suggest trigger updates.

## 6. Agent Retirement

Agents can be retired when they are no longer effective:

- **Automatic Retirement**: If an agent's success rate drops below 30% over 5+ sprints, Brain flags it for review.
- **Manual Retirement**: Disable an agent via configuration:
  ```json
  { "enabled": false }
  ```
- **Archive**: Retired agents remain in `.deckent/agents/` but are excluded from selection.
- **Reinstatement**: Retired agents can be re-enabled by setting `enabled: true` and resetting stats.

## 7. Performance Tracking

Agent performance is tracked at multiple levels:

### Per-Task Metrics
- Task completion status (DONE, GO_WITH_TECH_DEBT, NO_GO)
- Duration in milliseconds
- Test pass rate
- Coverage percentage

### Per-Sprint Metrics
- Tasks assigned vs completed
- Success rate for the sprint
- Average duration per task

### Historical Metrics
- Cumulative success rate
- Task type distribution
- Model usage distribution
- Trend direction (improving, stable, declining)

### Viewing Performance
```bash
deckent agent stats                    # All agents summary
deckent agent stats security-auditor   # Specific agent
deckent agent stats --json             # JSON output
```

Brain uses these metrics during planning to make informed agent-task assignments, creating a feedback loop that improves sprint outcomes over time.
