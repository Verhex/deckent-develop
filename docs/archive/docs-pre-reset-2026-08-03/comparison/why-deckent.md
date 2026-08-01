# Why Deckent

Deckent is a multi-agent sprint orchestrator for software work.

It turns a written sprint directive into scoped tasks, routes those tasks to
specialized agents, monitors execution, and records the outcome in project
memory. The core model is deliberately explicit: Brain plans, Workers execute
inside assigned scope, and Auditor monitors the result.

## What Deckent Is

Deckent organizes AI-assisted development as a sprint lifecycle instead of a
single chat session. A sprint moves through planning, worker execution,
evaluation, repair, retrospective, memory decay, and cleanup.

The main roles are:

- **Brain** plans the sprint, creates task files, routes work, and evaluates
  final results.
- **Workers** complete assigned tasks within their declared file and directory
  scope.
- **Auditor** checks for scope violations, stale execution, and result quality
  signals.

This structure makes the work reviewable. Plans, heartbeats, results, memory
exports, and Architecture Decision Records (ADRs) are stored as project
artifacts instead of disappearing into an opaque session.

## Distinctive Capabilities

### Mixed-Fleet Multi-Provider Execution

Deckent can route work across multiple provider backends. The project supports
provider-aware configuration for Brain, Worker, and fallback roles, plus
provider-agnostic tiers for model selection.

This lets a sprint use a mixed fleet: one task can run on one provider while
another task runs on a different provider, with the sprint lifecycle remaining
the common control plane.

### Agent And Skill Pool

Deckent separates vertical agents from horizontal skills.

Agents represent work roles such as documentation, security review, API work,
frontend design, migration, and architecture. Skills represent reusable
capabilities such as TypeScript, testing, documentation, security, performance,
database migration, DevOps, and system architecture.

The routing layer combines task intent, agent definitions, skill definitions,
and provider selection so each task receives a role and capability set that
matches the work.

### DB-First Memory

Deckent Memory V2 uses SQLite as the source of truth. Markdown memory files are
generated exports, not the primary database.

The memory model includes searchable entries, tags, relations, history, schema
versioning, and full-text search. This gives Brain a compact project context
while keeping longer-term project knowledge queryable and reviewable.

### ADR Governance

Deckent treats accepted ADRs as mandatory architecture constraints. Workers read
the active decision set before making changes, and a change that violates an
accepted ADR requires an explicit NO_GO result or an ADR amendment path.

This keeps implementation work connected to the project's recorded architecture
instead of relying on ad hoc memory.

### Dependency Wave Execution

Deckent builds a dependency graph from task declarations and executes work in
topological waves. Tasks with no unmet dependencies run in parallel; tasks that
depend on earlier results wait for those results before starting. The algorithm
is based on Kahn's topological sort and is applied automatically when the
dependency pipeline is enabled.

This means related tasks that can proceed in parallel do so without manual
scheduling, while dependent tasks are blocked until their inputs are ready.

### Evolutionary Agent And Skill Pipeline

Agents and skills in deckent can be promoted, demoted, and replaced over time
based on observed outcomes. A temporary agent that consistently performs well
on a class of tasks can be promoted to a permanent built-in. One that
underperforms on its assigned role can be demoted and replaced.

The outcome tracker records task results, sprint evaluations, and quality scores
per agent and per skill. This data feeds the promotion pipeline so the project's
agent roster improves across sprints rather than staying fixed.

### Nervous System

Deckent includes a proactive meta-orchestrator layer called the Nervous System.
It runs independently of active sprints and monitors the project state for
conditions that warrant attention: potential conflicts, risky patterns, resource
signals, or emerging anomalies.

When the Nervous System detects something that may need a decision, it proposes
an action. The authority matrix governs what it can do autonomously and what
requires human approval. This keeps the orchestration layer active between
sprints without requiring constant user attention.

### Autonomous And Reactive Operation

Deckent includes an autonomous engine built around backlog-driven execution,
reactive signals, approval gates, and risk-aware policies. Low-risk work can be
handled under policy, while risk-tagged operations can wait for approval.

The same Brain, Worker, Auditor, memory, and ADR model applies: autonomous work
still needs scoped execution, recorded results, and reviewable governance.

### Open Source, MIT Licensed

Deckent is MIT licensed and designed as an open system. Its agent, skill,
provider, memory, CLI, MCP, and documentation surfaces are project-visible and
designed to be extended.

The positioning is simple: Deckent gives teams a structured, inspectable way to
run AI development work across tools, providers, and project contexts while
keeping the workflow portable and project-owned.

## When Deckent Fits

Deckent is a good fit when you want:

- Multi-step work planned as explicit tasks.
- Several specialized agents working in parallel.
- Provider flexibility inside one sprint.
- Scope boundaries for worker changes.
- Reviewable task results and audit signals.
- Project memory that persists across sprints.
- ADRs to govern implementation choices.
- An open, extensible orchestration layer.

Deckent does not replace engineering judgment or promise that every task can be
safely automated. It is a coordination layer for making agentic work more
structured, inspectable, and governable.
