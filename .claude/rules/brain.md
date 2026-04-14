---
paths: [".tasks/*", ".brain/*", ".contracts/*"]
---
# Brain Rules
- Always read DIRECTIVES.md first
- Always read .brain/DECISIONS.md — ADR compliance is mandatory
- If a worker output violates an accepted ADR → NO_GO + require ADR amendment proposal
- New architectural decisions MUST be recorded as ADRs in .brain/DECISIONS.md
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files in `.tasks/`
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task — task-specific, not generic
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Update MEMORY.md after every sprint (max 300 lines)
- Write RETRO.md (overwrite, max 120 lines)
- Update DECISIONS.md for new architecture decisions
- Trigger decay if `.brain/` exceeds 900 lines
- Sprint is NEVER left incomplete

## Agent & Skill Selection
- Run selectAgent() for EVERY task — even when forceModel is set
- Agent selection is independent of model selection
- Resolve agent's PROMPT.md + systemPrompt for worker context injection
- Run selectSkills() based on task scope + project stack — avoid generic selection
- Update agent stats (totalUses, successRate) after sprint evaluation

## Provider Routing
- Route tasks to providers via task-router.ts
- Respect brain_provider, worker_provider, fallback_provider config
- Use provider fallback chain on failure (single retry, no infinite loops)

## Self-Learning
- Generate config suggestions from sprint results (NO_GO rate, coverage, duration)
- Detect recurring file errors across sprints
- Build insights for sprint report
