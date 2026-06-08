# DIRECTIVES — Sprint 041 (Human-Friendly Output Completion)

## Goal: Complete the 6 remaining human-friendly output tasks from Sprint 040. Every user-facing output must tell a clear story — no raw JSON, no technical jargon, actionable messages with next steps. Sprint sonunda deckent finalize çalıştır.

---

## Task 1: MCP Tool Response — Human-Friendly Format
- Model: opus
- Effort: high
- Files: src/mcp/tools/status.ts, src/mcp/tools/start.ts, src/mcp/tools/plan.ts, src/mcp/tools/doctor.ts, src/mcp/tools/retro.ts, src/mcp/tools/history.ts, src/mcp/helpers/format.ts (new), tests/mcp/helpers/format.test.ts (new)
- Scope: src/mcp/, tests/mcp/

### Description
Every MCP tool response must include both `data` (JSON for programmatic use) AND `summary` (human-readable string for Claude Code chat display). Create `src/mcp/helpers/format.ts`:
- `formatStatusResponse(data)` → "Sprint 040: 7/12 done, 3 active workers, ~8 min remaining"
- `formatPlanResponse(data)` → "Planned 12 tasks: 4 opus (complex), 8 sonnet (standard). Estimated 35 min."
- `formatStartResponse(data)` → "Sprint started! 4 workers launched. Watch: deckent status --watch"
- `formatDoctorResponse(data)` → "System healthy. 2 providers ready (Claude, Codex). 1 open debt item."
- `formatRetroResponse(data)` → "Sprint 040: 92% success. Self-healing rate 75%. 3 tasks auto-fixed."
- `formatHistoryResponse(data)` → "Last 5 sprints: 95% avg success rate, trending up."
- `formatErrorResponse(error)` → "Something went wrong: [clear message]. Try: [suggested fix]"
Update ALL MCP tool handlers to use formatters. 20+ tests.

### Tests
- Each formatter produces readable one-line summary
- Summary included in every tool response
- Data field preserved for programmatic use
- Error responses include fix suggestions
- Empty data handled gracefully
- 20+ tests

---

## Task 2: Dashboard — Human-Friendly SprintSummary Component
- Model: opus
- Effort: high
- Files: src/dashboard/src/pages/StatusPage.tsx, src/dashboard/src/components/SprintSummary.tsx (new), src/dashboard/src/components/TaskCard.tsx (new)
- Scope: src/dashboard/

### Description
Replace raw data tables with a storytelling dashboard:
1. SprintSummary component at top:
   - Large progress bar with percentage and fraction (7/12 = 58%)
   - "What's happening now" in plain text
   - Estimated time remaining
   - Self-healing indicator: "3 tasks auto-fixed their errors"
2. TaskCard component for each task:
   - Color-coded: green=done, blue=active, yellow=retry, red=no-go, gray=queued
   - Shows current action: "Writing code", "Running tests (attempt 2/3)", "Waiting for Task 3"
   - Expandable details: files changed, test results, retry history
3. Provider breakdown panel: "2 tasks on Claude, 1 on Codex"
4. Issues alert: yellow banner for tasks needing attention
10+ tests.

### Tests
- SprintSummary renders progress bar with correct percentage
- TaskCard shows correct color per status
- Active tasks show current action
- Provider breakdown counts correct
- Self-healing count displayed
- 10+ tests

---

## Task 3: CLI Doctor — Human-Friendly Health Check
- Model: opus
- Effort: normal
- Files: src/cli/commands/doctor.ts, tests/cli/commands/doctor.test.ts
- Scope: src/cli/, tests/cli/

### Description
Rewrite deckent doctor output to be welcoming and actionable:
```
Deckent Health Check
━━━━━━━━━━━━━━━━━━━

Your System:
  ✅ Node.js v22.1.0 — Good
  ✅ Claude CLI v2.1 — Ready (session auth)
  ✅ Codex CLI v1.0 — Ready (API key set)
  ❌ Gemini — Not configured (set GOOGLE_API_KEY to enable)
  ✅ tmux v3.4 — Available
  ✅ Git v2.43 — Clean working tree

Your Project:
  ✅ Deckent initialized
  ✅ Memory: 347/600 lines (57% — healthy)
  ✅ Last sprint: sprint-040 (completed)
  ⚠️ 2 open tech debt items

Recommendation:
  Everything looks good! Start a sprint: deckent start
  💡 Set GOOGLE_API_KEY to enable Gemini workers.
```
Each check category (System, Project) clearly labeled. Recommendations context-aware. 10+ tests.

### Tests
- System checks show versions
- Provider status with auth method
- Memory percentage calculated
- Recommendations based on actual state
- Missing provider shows setup tip
- 10+ tests

---

## Task 4: RETRO Format — Human-Readable Retrospective
- Model: opus
- Effort: normal
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Rewrite writeRetrospective to produce readable markdown:
```markdown
# Sprint 040 Retrospective

## Summary
Completed 7/13 tasks in 41 minutes. Self-healing rate: 75%.

## Highlights
- Worker feedback loop operational — 3 tasks auto-fixed errors
- Agent/skill injection now working in sprint-controller
- NO_GO rate dropped from 94.7% to 46.2%

## Issues
- 6 tasks NO_GO — mostly output formatting (non-blocking)
- MCP format task needs dedicated helper module

## Metrics
| What | Value |
|------|-------|
| Tasks completed | 7/13 |
| Self-healed | 3 |
| New tests | +364 |
| Code changes | +4,026 / -753 |
| Sprint time | 41 min |

## Learnings
- Worker verify loop dramatically reduces false NO_GO
- Agent/skill injection was dormant for 10 sprints — always verify feature connectivity
```
Include self-healing rate from feedbackLoop metrics. 10+ tests.

### Tests
- Summary line includes task count, time, self-healing rate
- Highlights section non-empty
- Issues section lists NO_GO tasks
- Metrics table formatted correctly
- Learnings extracted from sprint data
- 10+ tests

---

## Task 5: Error Messages — Human Context
- Model: opus
- Effort: normal
- Files: src/core/errors.ts, src/cli/helpers/error-handler.ts, tests/core/errors.test.ts
- Scope: src/core/, src/cli/, tests/core/

### Description
Every DeckentError should display:
```
❌ Sprint planning failed [DECKENT_E003]

What happened:
  Brain couldn't read your DIRECTIVES.md file.

Why:
  The file is empty or doesn't contain any task definitions.

How to fix:
  1. Open DIRECTIVES.md
  2. Add at least one task: ## Task 1: [description]
  3. Run `deckent plan` again

Docs: https://docs.deckent.dev/directives
```
Add to ErrorRegistry entries: `whatHappened: string`, `why: string`, `howToFix: string[]`. Update handleError in error-handler.ts to format these fields. Update ALL existing error codes (10+) with human-friendly messages. 15+ tests.

### Tests
- Error shows whatHappened in plain language
- Error shows why
- Error shows howToFix steps
- All error codes have human messages
- Fallback for unknown errors
- 15+ tests

---

## Task 6: Worker Logs — Human-Readable Progress
- Model: opus
- Effort: normal
- Files: src/agents/worker.ts, src/cli/commands/attach.ts, tests/agents/worker-log.test.ts (new)
- Scope: src/agents/, src/cli/, tests/agents/

### Description
Worker log output (visible via deckent attach, dashboard, .tasks/*.log) must be structured:
```
[040-003] Starting: Planner Provider Decoupling
[040-003] Scope: src/orchestra/planner.ts (1 file)
[040-003] Writing: 3 files modified
[040-003] Verify: tsc --noEmit... ✅ Pass
[040-003] Test: vitest run... ❌ 2 failures
[040-003] Fix: planner.test.ts (assertion mismatch)
[040-003] Test: retry 2/3... ✅ Pass
[040-003] Done: DONE (1 retry, 4 min)
```
Create `formatWorkerLog(taskId, action, detail, emoji?): string` helper. Apply to all worker lifecycle events: start, scope read, file write, tsc, vitest, retry, result. 10+ tests.

### Tests
- Log format consistent across all events
- Emoji status indicators correct
- Retry attempts numbered
- Final result includes timing
- Non-emoji fallback for --no-color mode
- 10+ tests
