# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- ADRs are injected into your prompt automatically from `.brain/memory.db` — they are mandatory constraints
- If you need to query project memory: relevant ADRs and past learnings are provided by Brain via MemoryStore
- If your implementation would violate an accepted ADR → stop, write NO_GO, propose ADR amendment
- Write execution plan to `.tasks/task-XXX.plan` before coding
- Check `.locks/` before writing any file
- Update heartbeat (`.tasks/task-XXX.hb`) on every file change
- Stay within your assigned scope — do not touch files outside it
- Run project-specific lint/build and test suite before marking done
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
> **Honesty note (ADR-037 V1.0):** Bu Verify Loop bir **prompt talimatıdır, kod-enforce DEĞİL**. `enforceVerifyLoop`/`runTestVerifyLoop` runtime'da çağrılmaz (0-caller, hard-flip post-GA V2). Worker disiplinine + Auditor advisory izlemeye dayanır.
- Run lint/build check after code changes — fix errors (max 3 attempts; use project-specific command)
- Run test suite after code changes — fix failures (max 3 attempts; use project-specific command)
- If both fail after 3 attempts → write NO_GO result with error details
- If blocked by another task → write NO_GO result explaining the dependency

## Agent Context
- If an agent prompt is provided, it defines your specialization
- Follow agent-specific guidelines for your domain (security, testing, docs, etc.)
- Agent expertise supplements but does not override task instructions

{{ADR_SECTION}}
