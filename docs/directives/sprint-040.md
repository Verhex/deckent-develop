# DIRECTIVES — Sprint 040 (Worker Feedback Loop + Human-Friendly Output)

## Goal: Transform workers from "write and hope" to "write, verify, fix, verify again" with an internal feedback loop. Simultaneously overhaul ALL user-facing output (CLI, MCP, dashboard, logs) to be human-friendly — clear language, actionable messages, no raw JSON dumps. Deckent must be understandable by anyone, not just developers who built it. Use context7 for any external documentation research.

---

## Task 1: Worker Internal Verify Loop — tsc Check
- Model: opus
- Effort: high
- Files: src/agents/worker.ts, src/orchestra/task-builder.ts (buildWorkerPrompt), tests/agents/worker-feedback.test.ts (new)
- Scope: src/agents/, src/orchestra/, tests/agents/

### Description
CORE FEATURE. After worker writes code, it must run `tsc --noEmit` BEFORE marking task done. If tsc fails, worker reads the error output and fixes the code. Max 3 retries. Flow:
```
write code → tsc --noEmit → FAIL? → read errors → fix → tsc again (max 3)
                           → PASS? → proceed to test phase
```
Implementation:
1. Add `verifyCompilation(projectRoot): { success: boolean, errors: string[] }` to worker.ts
2. Update buildWorkerPrompt: inject clear instruction "After writing code, run tsc --noEmit. If it fails, read the errors and fix your code. Repeat up to 3 times."
3. Worker heartbeat updates during verify: status = 'VERIFYING', currentAction = 'Type checking (attempt 2/3)'
4. If all 3 retries fail: selfAssessment = 'NO_GO', notes include compilation errors
20+ tests.

### Tests
- Worker runs tsc after writing code
- tsc failure triggers retry
- Max 3 retries enforced
- Successful tsc proceeds to test phase
- Heartbeat shows VERIFYING status
- All retries fail → NO_GO with error details
- 20+ tests

---

## Task 2: Worker Internal Verify Loop — Test Check
- Model: opus
- Effort: high
- Files: src/agents/worker.ts, src/orchestra/task-builder.ts, tests/agents/worker-feedback.test.ts
- Scope: src/agents/, src/orchestra/, tests/agents/

### Description
CORE FEATURE. After tsc passes, worker runs tests. If tests fail, worker reads output and fixes. Max 3 retries. Flow:
```
tsc PASS → vitest run → FAIL? → read test output → fix code/tests → vitest again (max 3)
                       → PASS? → proceed to result writing
```
Implementation:
1. Add `verifyTests(projectRoot, scope): { success: boolean, failedTests: string[], output: string }` to worker.ts
2. Update buildWorkerPrompt: "After tsc passes, run vitest. If tests fail, read the output, identify the failing test, fix the code or test, and retry."
3. Worker reads vitest output, identifies specific failing test names and error messages
4. Heartbeat: status = 'TESTING', currentAction = 'Running tests (attempt 2/3) — fixing: utils.test.ts'
5. If all 3 retries fail: selfAssessment = 'NO_GO', notes include failed test names and errors
20+ tests.

### Tests
- Worker runs vitest after tsc passes
- Test failure triggers retry
- Worker reads specific failing test names
- Max 3 retries enforced
- Heartbeat shows which test is being fixed
- All retries fail → NO_GO with test details
- 20+ tests

---

## Task 3: Worker Feedback Metrics
- Model: opus
- Effort: normal
- Files: src/agents/worker.ts, src/core/types.ts, tests/agents/worker-feedback.test.ts
- Scope: src/agents/, src/core/, tests/agents/

### Description
Track feedback loop effectiveness. Extend TaskResult with:
```typescript
interface TaskResult {
  // ...existing fields
  feedbackLoop?: {
    tscAttempts: number;        // How many tsc runs (1 = first pass)
    testAttempts: number;       // How many vitest runs
    tscErrorsFixed: number;     // Total tsc errors auto-fixed
    testFailuresFixed: number;  // Total test failures auto-fixed
    totalRetryTimeMs: number;   // Time spent in retry cycles
  };
}
```
Brain uses this data in RETRO to track "self-healing rate": percentage of tasks that needed retries vs first-pass success. Higher self-healing rate = system is catching its own mistakes. 15+ tests.

### Tests
- feedbackLoop populated in result
- tscAttempts counts correctly
- testAttempts counts correctly
- Brain reads feedbackLoop in evaluation
- Retro includes self-healing rate metric
- 15+ tests

---

## Task 4: Worker Prompt Overhaul — Human Instructions
- Model: opus
- Effort: high
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Current buildWorkerPrompt produces technical instructions. Rewrite to be clear, structured, and foolproof:
```
## Your Task
[Title] — [Description in plain language]

## What To Do
1. Read the task scope carefully
2. Write the code changes
3. Verify: run `tsc --noEmit` — fix any errors (max 3 attempts)
4. Test: run `npx vitest run [scope]` — fix any failures (max 3 attempts)
5. Document: update relevant docs if needed
6. Report: write your result file

## Scope Rules
- You may ONLY modify files in: [directories]
- You may ONLY write to: [filesWrite]
- DO NOT touch files outside your scope

## Result File
Write to: .tasks/task-[id].result
Format: [clear JSON template with comments]

## If Something Goes Wrong
- tsc fails after 3 attempts → write NO_GO result with error details
- tests fail after 3 attempts → write NO_GO result with failing test names
- blocked by another task → write NO_GO result explaining the dependency
```
15+ tests.

### Tests
- Prompt includes all 6 steps
- Scope rules clearly stated
- Result file path correct
- Error handling instructions present
- Prompt is readable by non-expert
- 15+ tests

---

## Task 5: CLI Output — Human-Friendly Status
- Model: opus
- Effort: high
- Files: src/cli/commands/status.ts, src/cli/helpers/output.ts, tests/cli/commands/status.test.ts
- Scope: src/cli/, tests/cli/

### Description
Current `deckent status` shows raw metrics. Rewrite to tell a story:
```
Sprint 040 — Worker Feedback Loop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Progress: 7/12 tasks done (58%)
Active: 3 workers running
Time: 12 min elapsed, ~8 min remaining

What's happening:
  ✅ Task 1 (tsc verify loop) — Done in 4 min
  ✅ Task 2 (test verify loop) — Done in 6 min, 1 retry needed
  🔄 Task 5 (CLI output) — Writing code (2 min)
  🔄 Task 6 (MCP output) — Running tests, attempt 2/3
  🔄 Task 7 (dashboard) — Type checking
  ⏳ Task 8 (retro format) — Waiting for Task 7
  ⏳ Task 9-12 — Queued

Issues:
  ⚠️ Task 3 had 2 test retries — may need attention

Next: Tasks 8-12 will start as workers free up
```
No JSON, no technical jargon. A human reads this and knows exactly what's happening. 15+ tests.

### Tests
- Progress shows percentage and fraction
- Active worker count shown
- Time elapsed and ETA shown
- Each task has clear emoji status
- Issues highlighted with warning
- Queue shown for pending tasks
- 15+ tests

---

## Task 6: CLI Output — Human-Friendly Sprint Complete
- Model: opus
- Effort: normal
- Files: src/cli/commands/start.ts, src/orchestra/sprint-reporter.ts, tests/cli/commands/start.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/

### Description
When sprint completes, show a clear summary:
```
Sprint 040 Complete!
━━━━━━━━━━━━━━━━━━━

Results: 11/12 tasks succeeded, 1 needs attention
Time: 35 minutes total
Tests: 8,704 → 8,892 (+188 new tests)
Code: +1,245 lines added, -380 removed

What went well:
  ✅ 8 tasks completed on first try
  ✅ 3 tasks self-healed (fixed their own errors)
  ✅ No boundary violations

What needs attention:
  ⚠️ Task 9 (dashboard chart) — NO_GO: vitest timeout
     → Added to tech debt, will auto-fix next sprint

Self-healing rate: 75% (3/4 retries succeeded)

Next steps:
  → Run `deckent retro` for detailed retrospective
  → Run `deckent status --debt` to see tech debt
  → Ready for next sprint
```
15+ tests.

### Tests
- Success/failure count clear
- Time and test metrics shown
- Self-healing rate calculated
- What went well section present
- What needs attention section present
- Next steps actionable
- 15+ tests

---

## Task 7: MCP Tool Response — Human-Friendly
- Model: opus
- Effort: high
- Files: src/mcp/tools/status.ts, src/mcp/tools/start.ts, src/mcp/tools/plan.ts, src/mcp/helpers/format.ts (new), tests/mcp/tools/format.test.ts (new)
- Scope: src/mcp/, tests/mcp/

### Description
MCP tool responses are raw JSON. When Claude Code reads these, it should get human-readable summaries alongside data. Create `src/mcp/helpers/format.ts` with formatters:
- `formatStatusResponse(data)` → "Sprint 040: 7/12 done, 3 active workers, ~8 min remaining"
- `formatPlanResponse(data)` → "Planned 12 tasks: 4 opus (complex), 8 sonnet (standard). Estimated 35 min."
- `formatStartResponse(data)` → "Sprint started! 4 workers launched. Watch progress: deckent status --watch"
- `formatErrorResponse(error)` → "Something went wrong: [clear message]. Try: [suggested fix]"

Each MCP tool response includes both `data` (JSON for programmatic use) AND `summary` (human-readable string). 15+ tests.

### Tests
- formatStatusResponse produces readable summary
- formatPlanResponse shows task breakdown
- formatStartResponse shows next actions
- formatErrorResponse includes fix suggestion
- Both data and summary in every response
- 15+ tests

---

## Task 8: Dashboard — Human-Friendly Web UI
- Model: opus
- Effort: high
- Files: src/dashboard/src/pages/StatusPage.tsx, src/dashboard/src/components/SprintSummary.tsx (new)
- Scope: src/dashboard/

### Description
Web dashboard shows raw data tables. Add a SprintSummary component that tells the story:
- Large progress bar with percentage
- "What's happening now" section with live worker status
- Color-coded task list (green=done, blue=active, yellow=warning, gray=queued)
- Self-healing indicator: "3 tasks auto-fixed their errors"
- Estimated time remaining
- Provider breakdown: "2 tasks on Claude, 1 on Codex"
No developer needs to interpret raw JSON or metric tables. 10+ tests.

### Tests
- SprintSummary renders progress bar
- Task colors match status
- Self-healing count shown
- Provider breakdown visible
- ETA displayed
- 10+ tests

---

## Task 9: CLI Doctor — Human-Friendly Health Check
- Model: opus
- Effort: normal
- Files: src/cli/commands/doctor.ts, tests/cli/commands/doctor.test.ts
- Scope: src/cli/, tests/cli/

### Description
Current `deckent doctor` shows checkmarks and technical names. Rewrite:
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
  ✅ Deckent initialized (.deckent/ exists)
  ✅ Memory: 347/600 lines (57% — healthy)
  ✅ Last sprint: sprint-039 (completed)
  ⚠️ 2 open tech debt items (run `deckent status --debt`)

Recommendation:
  Everything looks good! You can start a new sprint with `deckent start`.
  💡 Tip: Set GOOGLE_API_KEY to enable Gemini as a worker provider.
```
10+ tests.

### Tests
- System checks show version numbers
- Provider status with auth method
- Project health with memory percentage
- Recommendations actionable
- Tips contextual (based on missing config)
- 10+ tests

---

## Task 10: CLI Init — Human-Friendly Wizard
- Model: opus
- Effort: normal
- Files: src/cli/commands/init.ts, tests/cli/commands/init.test.ts
- Scope: src/cli/, tests/cli/

### Description
Current init wizard is functional but dry. Make it welcoming:
```
Welcome to Deckent! 🎛️
━━━━━━━━━━━━━━━━━━━━━━

I detected your setup:
  → Node.js v22.1.0
  → Claude CLI (session auth — Max plan)
  → Codex CLI (API key configured)
  → Project: TypeScript + React (detected from package.json)

Setting up your AI development team...
  ✅ Created .deckent/ configuration
  ✅ Created .brain/ memory system
  ✅ Set up Claude as brain (Opus), workers (Sonnet)
  ✅ Enabled Codex as secondary worker provider
  ✅ Detected project stack: TypeScript + React

You're ready! Here's what to do next:
  1. Write your goals:  deckent set-directives "Add user authentication"
  2. Plan the sprint:   deckent plan
  3. Start working:     deckent start

Or just tell me what to build:
  deckent start "Add JWT authentication to the Express API"
```
10+ tests.

### Tests
- Detection results shown clearly
- Provider setup explained
- Stack detection mentioned
- Next steps numbered and clear
- Zero-config mode shown
- 10+ tests

---

## Task 11: RETRO Format — Human-Friendly Retrospective
- Model: opus
- Effort: normal
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
RETRO.md is currently developer-facing metrics. Make it readable:
```markdown
# Sprint 040 Retrospective

## Summary
Completed 11/12 tasks in 35 minutes. Self-healing rate: 75%.

## Highlights
- Worker feedback loop working — 3 tasks auto-fixed compilation errors
- New test utilities reduced test setup time
- Provider routing correctly split tasks between Claude and Codex

## Issues
- Task 9 timed out waiting for dashboard build (vitest slow on large components)
- 1 boundary violation detected and auto-corrected by auditor

## Metrics
| What | Value |
|------|-------|
| Tasks completed | 11/12 |
| Self-healed | 3 tasks |
| New tests | +188 |
| Code changes | +1,245 / -380 |
| Sprint time | 35 min |
| NO_GO rate | 8% (1/12) |

## Learnings
- Dashboard component tests need isolated vitest config (slow rendering)
- Codex adapter works well for simple CRUD tasks (3/3 success)
```
10+ tests.

### Tests
- Summary includes task count and time
- Self-healing rate shown
- Highlights section present
- Issues clearly described
- Metrics table readable
- Learnings actionable
- 10+ tests

---

## Task 12: Error Messages — Human-Friendly
- Model: opus
- Effort: normal
- Files: src/core/errors.ts, src/cli/helpers/error-handler.ts, tests/core/errors.test.ts
- Scope: src/core/, src/cli/, tests/core/

### Description
Current DeckentError shows code + message. Add human context:
```
❌ Sprint planning failed [DECKENT_E003]

What happened:
  Brain couldn't read your DIRECTIVES.md file.

Why:
  The file is empty or doesn't contain any task definitions.

How to fix:
  1. Open DIRECTIVES.md in your editor
  2. Add at least one task: ## Task 1: [description]
  3. Run `deckent plan` again

Need help? See: https://docs.deckent.dev/directives
```
Update all 10+ error codes in ErrorRegistry with: `whatHappened`, `why`, `howToFix` fields. Error handler formats these into the readable output above. 15+ tests.

### Tests
- Error shows what happened in plain language
- Error shows why it happened
- Error shows how to fix
- All error codes have human-friendly messages
- Link to docs included
- 15+ tests

---

## Task 13: Log Output — Human-Friendly Worker Logs
- Model: opus
- Effort: normal
- Files: src/agents/worker.ts, src/cli/commands/attach.ts
- Scope: src/agents/, src/cli/

### Description
Worker logs (viewed via `deckent attach` or dashboard) should be human-readable:
```
[Worker 040-003] Starting: Planner Provider Decoupling
[Worker 040-003] Reading task scope: src/orchestra/planner.ts
[Worker 040-003] Writing changes: 3 files modified
[Worker 040-003] Verifying: tsc --noEmit... ✅ Pass
[Worker 040-003] Testing: vitest run... ❌ 2 failures
[Worker 040-003] Fixing: planner.test.ts (assertion mismatch)
[Worker 040-003] Testing: vitest run (retry 2/3)... ✅ Pass
[Worker 040-003] Result: DONE (1 retry needed, 4 min total)
```
Not raw Claude output, but structured progress messages. 10+ tests.

### Tests
- Log shows task start with title
- Log shows file operations
- Log shows verify results with emoji
- Log shows retry attempts
- Log shows final result with timing
- 10+ tests
