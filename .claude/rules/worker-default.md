---
paths: ["src/**", "tests/**"]
---
# Worker Rules
- Read your task file first (`.tasks/task-XXX.json`)
- Write execution plan to `.tasks/task-XXX.plan` before coding
- Check `.locks/` before writing any file
- Update heartbeat (`.tasks/task-XXX.hb`) on every file change
- Stay within your assigned scope — do not touch files outside it
- Run `tsc --noEmit` and `vitest run` before marking done
- Document changes in relevant docs
- Write result to `.tasks/task-XXX.result` with:
  - files_changed, lines_added/removed
  - test results, coverage
  - self_assessment: DONE | GO_WITH_TECH_DEBT | NO_GO
  - notes for Brain
