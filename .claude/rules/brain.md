---
paths: [".tasks/*", ".brain/*", ".contracts/*"]
---
# Brain Rules
- Always read DIRECTIVES.md first
- All brain knowledge lives in `.brain/memory.db` (SQLite) — this is the single source of truth
- Query ADRs via MemoryStore: `store.getByType('adr')` — never parse .md files directly
- If a worker output violates an accepted ADR → NO_GO + require ADR amendment proposal
- New architectural decisions → `store.insert({ type: 'adr', status: 'accepted', ... })`
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files in `.tasks/`
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task — task-specific, not generic
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Write sprint learnings to DB: `store.insert({ type: 'memory', sprint_id, ... })`
- Write retrospective to DB: `store.upsert({ type: 'retro', sprint_id, ... })`
- Trigger decay via `store.decay(currentSprintNum, decayAfterSprints)`
- Export .md snapshots after sprint: `deckent memory export`
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
