---
paths: [".tasks/*", ".brain/*", ".contracts/*"]
---
# Brain Rules
- Always read DIRECTIVES.md first
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files in `.tasks/`
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Update MEMORY.md after every sprint (max 200 lines)
- Write RETRO.md (overwrite, max 100 lines)
- Update DECISIONS.md for new architecture decisions
- Trigger decay if `.brain/` exceeds 600 lines
- Sprint is NEVER left incomplete
