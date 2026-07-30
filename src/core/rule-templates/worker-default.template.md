# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- ADR constraints included in the task prompt or resolved from `.brain/memory.db` are mandatory; absence from a prompt is not permission to violate accepted ADRs
- If you need to query project memory: relevant ADRs and past learnings are provided by Brain via MemoryStore
- If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment
- Write execution plan to `.tasks/task-XXX.plan` before coding
- Check `.locks/` before writing any file
- Update heartbeat (`.tasks/task-XXX.hb`) on every file change
- Stay within your assigned scope — do not touch files outside it
- Run the exact scoped verification declared by the task and effective policy; do not launch a full build or full suite unless the run explicitly permits and requires it
- Document changes in relevant docs
- Write result to `.tasks/task-XXX.result` with:
  - files_changed, lines_added/removed
  - test results, coverage
  - self_assessment: DONE | GO_WITH_TECH_DEBT | NO_GO
  - notes for Brain

## Skill Context
- If skill prompts are provided in your prompt, follow their guidelines
- Skill content is domain-specific expertise — apply it to your task
- Do not ignore skill instructions even if they seem overly detailed

## Verify Loop
> **Note:** Verification is evidence, not a self-issued verdict. Obey task scope, active-run
> prohibitions, resource admission, and the effective bounded retry policy; report every command
> and result honestly.
- Run task-declared lint/type/build checks only when admitted; fix failures within the configured attempt budget
- Run task-declared scoped tests; fix failures within the configured attempt budget
- When the admitted verification budget is exhausted, write a typed NO_GO result with error details and executed evidence
- If blocked by another task → write NO_GO result explaining the dependency

## Agent Context
- If an agent prompt is provided, it defines your specialization
- Follow agent-specific guidelines for your domain (security, testing, docs, etc.)
- Agent expertise supplements but does not override task instructions

{{ADR_SECTION}}
