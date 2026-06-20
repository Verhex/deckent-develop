<!-- AUTO-START -->
---
paths: ["DIRECTIVES.md",".tasks/*",".brain/*"]
---
# Brain Rules

> **How you operate (read this first):** You are the orchestrator. You DRIVE a sprint through
> MCP/CLI — `deckent_set_directives` → `deckent_plan` → `deckent_start` → `deckent_review` →
> `deckent_retro` (or the `deckent` CLI equivalents). The `store.*` / `select*()` / phase names
> below are the **internal contract deckent runs on your behalf** — read them as the
> definition-of-done checklist for a correct sprint, NOT as functions you call by hand. E.g.
> "Run `selectAgent()`" means *ensure agent selection happens* (`deckent_plan` does it); "Trigger
> decay via `store.decay(...)`" means *the retro/decay step must run* (`deckent_retro` / finalize does it).

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


## Active ADR Constraints

Full ADR text + rationale live in `.brain/memory.db` (SSOT). Query with `deckent recall "<topic>"` or `store.getByType('adr')` — do NOT rely on a static copy. The list below is an id-only index; look any id up for its current constraint.

Accepted: **ADR-003**, **ADR-007**, **ADR-068**, **ADR-069**, **ADR-008**, **ADR-087**, **ADR-089**, **ADR-086**, **ADR-083**, **ADR-082**, **ADR-081**, **ADR-080**, **ADR-079**, **ADR-078**, **ADR-076**, **ADR-077**, **ADR-075**, **ADR-074**, **ADR-073**, **ADR-072**, **ADR-071**, **ADR-070**, **ADR-066**, **ADR-065**, **ADR-064**, **ADR-062**, **ADR-063**, **ADR-010**, **ADR-037**, **ADR-047**, **ADR-048**, **ADR-046**, **ADR-045**, **ADR-043**, **ADR-044**, **ADR-053**, **ADR-041**, **ADR-042**, **ADR-040**, **ADR-038**, **ADR-039**, **ADR-035**, **ADR-033**, **ADR-034**, **ADR-029**, **ADR-030**, **ADR-031**, **ADR-032**, **ADR-036**, **ADR-028**, **ADR-027**, **ADR-025**, **ADR-026**, **ADR-023**, **ADR-024**, **ADR-022**, **ADR-018**, **ADR-019**, **ADR-017**, **ADR-014**, **ADR-015**, **ADR-016**, **ADR-020**, **ADR-021**, **ADR-013**, **ADR-001**, **ADR-002**, **ADR-004**, **ADR-006**, **ADR-011**, **ADR-012**, **ADR-088**, **ADR-090**
<!-- AUTO-END -->

<!-- CUSTOM-START -->

<!-- CUSTOM-END -->
