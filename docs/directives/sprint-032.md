# DIRECTIVES — Sprint 032 (UX: Progress Bar, Sprint Summary, Notifications, Agent/Skill Visibility)

## Goal: Polish end-user experience with real-time progress during sprint execution, rich sprint summaries with categorized changes and agent performance, a notification system (terminal bell, webhook, Discord, Slack), full agent/skill visibility across all CLI output, and an interactive post-sprint review mode. 30 tasks — all opus model, effort high.

---

## Task 1: Progress Renderer — Core
- Model: opus
- Effort: high
- Files: src/cli/helpers/progress.ts (new), tests/cli/helpers/progress.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
ProgressRenderer class: renders a live-updating progress bar to terminal. render(state: ProgressState): clears previous output, draws progress bar + worker table + queue. ProgressState: {totalTasks, completedTasks, activeTasks: WorkerProgressEntry[], queuedTasks: string[], phase: SprintPhase, elapsedMs: number, etaMs: number}. WorkerProgressEntry: {taskId, workerId, agentName, status: AgentStatus, currentFile: string, progressPercent: number}. Bar format: [===========----------] 4/8 tasks 52% ETA ~120s. Terminal width detection via process.stdout.columns (fallback 80). 15+ tests.

### Tests
- Bar renders correct percentage
- Width adapts to terminal
- Worker table shows agent names
- Queue section shows waiting tasks
- 15+ tests

---

## Task 2: ETA Calculator
- Model: opus
- Effort: high
- Files: src/cli/helpers/eta-calculator.ts (new), tests/cli/helpers/eta-calculator.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
ETACalculator class: calculateETA(completedTasks, totalTasks, elapsedMs, taskDurations: number[]). Uses rolling average of completed task durations. Handles edge cases: no completed tasks -> "calculating...", single task -> linear projection, varied durations -> weighted recent average (last 3 tasks weighted 2x). formatETA(etaMs): returns "~30s", "~2m", "~5m 30s". recalculate() called on each task completion. 15+ tests.

### Tests
- Linear projection with uniform tasks
- Weighted average with varied durations
- "calculating..." when no data
- formatETA produces readable strings
- 15+ tests

---

## Task 3: Worker Status Updates
- Model: opus
- Effort: high
- Files: src/cli/helpers/worker-status.ts (new), tests/cli/helpers/worker-status.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
WorkerStatusTracker class: integrates with heartbeat file polling to provide real-time worker status for progress display. pollWorkerStatus(tasksDir): reads all .hb files, returns WorkerProgressEntry[] for active workers. Calculates progressPercent from heartbeat sequence + status transitions (CODING=0-50%, TESTING=50-80%, DOCUMENTING=80-100%). Detects stale workers (no heartbeat update in 2 min). Polling interval configurable (default 3s). 15+ tests.

### Tests
- Heartbeat parsed to progress entry
- Status transitions map to percentages
- Stale worker detected
- Missing .hb file handled gracefully
- 15+ tests

---

## Task 4: Queue Visualization
- Model: opus
- Effort: high
- Files: src/cli/helpers/queue-display.ts (new), tests/cli/helpers/queue-display.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
QueueDisplay class: formats queued (PENDING) tasks for progress renderer. formatQueue(pendingTasks: Task[], maxDisplay: number): shows task IDs + titles, truncated to maxDisplay (default 5) with "+ N more" suffix. formatDependencyWait(task, blockedBy: string[]): "031-005 waiting on 031-002, 031-003". Integrates with ParallelPipelineManager wave display: "Wave 2: 3 tasks waiting for Wave 1". 10+ tests.

### Tests
- Queue formatted with task titles
- Truncation with "+ N more"
- Dependency wait shown
- Wave display correct
- 10+ tests

---

## Task 5: Terminal Width Adaptation
- Model: opus
- Effort: high
- Files: src/cli/helpers/terminal-utils.ts (new), tests/cli/helpers/terminal-utils.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
Terminal utility functions. getTerminalWidth(): returns process.stdout.columns or 80. truncateString(str, maxWidth): truncates with "..." suffix. fitTable(columns: ColumnDef[], data: Row[], width): auto-sizes columns to fit terminal width (proportional allocation, minimum per column). clearLines(count): ANSI escape to clear N lines for progress re-render. isInteractive(): checks process.stdout.isTTY. Non-interactive mode falls back to simple line output. 10+ tests.

### Tests
- Truncation adds "..."
- Table fits terminal width
- Column proportions correct
- Non-interactive fallback works
- 10+ tests

---

## Task 6: Rich Sprint Summary — Formatter
- Model: opus
- Effort: high
- Files: src/cli/helpers/sprint-summary.ts (new), tests/cli/helpers/sprint-summary.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
RichSprintSummary class: format(sprint, results, evaluations). Produces multi-section output: RESULTS section (done/debt/failed counts + coverage), CHANGES section (file list with +/- line counts, (new) marker for new files, grouped by directory), TESTS section (new test count, test file count, coverage delta from previous sprint). Max 10 files shown, rest collapsed as "... N more files". 15+ tests.

### Tests
- Results section counts correct
- Changes section shows file diffs
- New files marked
- Coverage delta calculated
- 15+ tests

---

## Task 7: Rich Sprint Summary — File Change Categorizer
- Model: opus
- Effort: high
- Files: src/cli/helpers/change-categorizer.ts (new), tests/cli/helpers/change-categorizer.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
ChangeCategorizer class: categorize(filesChanged: string[]). Categories: 'source' (src/**), 'test' (tests/**, *.test.ts), 'config' (*.json, *.yml, *.toml at root), 'docs' (docs/**, *.md), 'build' (dist/**, *.js in root). Returns Map<ChangeCategory, FileChange[]>. FileChange: {path, linesAdded, linesRemoved, isNew: boolean}. formatCategorized(categories): renders grouped file list with section headers. 10+ tests.

### Tests
- Source files categorized
- Test files categorized
- Config files categorized
- Mixed files grouped correctly
- 10+ tests

---

## Task 8: Rich Sprint Summary — Agent Performance Section
- Model: opus
- Effort: high
- Files: src/cli/helpers/agent-performance.ts (new), tests/cli/helpers/agent-performance.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
AgentPerformanceFormatter class: format(evaluations, taskAgentMap: Map<string, string>). Groups tasks by assigned agent. Per agent: name, task count, done/debt/nogo breakdown, average coverage. Highlights underperformers (success rate < 60%). formatAgentTable(entries): aligned table with agent name, tasks, results, coverage columns. Agents without any tasks (generic worker fallback) grouped as "generic worker". 10+ tests.

### Tests
- Tasks grouped by agent
- Success rate calculated
- Underperformer highlighted
- Generic worker fallback grouped
- 10+ tests

---

## Task 9: Rich Sprint Summary — Recommendation Engine
- Model: opus
- Effort: high
- Files: src/cli/helpers/recommendations.ts (new), tests/cli/helpers/recommendations.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
RecommendationEngine class: generate(sprint, evaluations, agentPerformance). Rules: 1) If any NO_GO with scope violation -> "Fix NO_GO task {id}: scope violation detected", 2) If tech debt tasks > 30% -> "Consider dedicated refactor sprint", 3) If agent has < 60% success -> "Consider: {better-agent} for {task-type} tasks", 4) If coverage dropped -> "Coverage regression: run focused test sprint", 5) If all tasks DONE -> "All tasks complete. Run: deckent start to continue". Max 5 recommendations. 10+ tests.

### Tests
- NO_GO recommendation generated
- Tech debt warning generated
- Agent suggestion generated
- Coverage regression detected
- Max 5 recommendations enforced
- 10+ tests

---

## Task 10: Rich Sprint Summary — Comparison with Previous
- Model: opus
- Effort: high
- Files: src/cli/helpers/sprint-comparison.ts (new), tests/cli/helpers/sprint-comparison.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
SprintComparison class: compare(current: SprintMetrics, previous: SprintMetrics|null). Returns SprintDelta: {coverageDelta, successRateDelta, durationDelta, taskCountDelta, improvingMetrics: string[], decliningMetrics: string[]}. formatDelta(delta): renders "+3.1% coverage", "-12s duration", "2 fewer NO_GO tasks". If no previous sprint, returns "First sprint — no comparison available". 10+ tests.

### Tests
- Coverage delta calculated
- Improving metrics identified
- Declining metrics identified
- First sprint handled
- 10+ tests

---

## Task 11: Notification System — Terminal Bell
- Model: opus
- Effort: high
- Files: src/core/notifications.ts (new), tests/core/notifications.test.ts (new)
- Scope: src/core/, tests/core/

### Description
NotificationDispatcher class: dispatch(event: NotificationEvent, config: NotificationConfig). NotificationEvent: {type: 'sprint_complete'|'sprint_failed'|'task_nogo'|'usage_warning', summary: string, details: Record<string, unknown>}. NotificationConfig: {terminal: boolean, webhook?: string, discord?: string, slack?: string}. Terminal bell: process.stdout.write('\x07') on sprint_complete/sprint_failed. Disabled in non-interactive mode. 10+ tests.

### Tests
- Terminal bell fires on sprint_complete
- Bell disabled in non-interactive
- Config missing = no notification
- Multiple event types supported
- 10+ tests

---

## Task 12: Notification System — Webhook Provider
- Model: opus
- Effort: high
- Files: src/core/notification-providers/webhook.ts (new), tests/core/notification-providers/webhook.test.ts (new)
- Scope: src/core/, tests/core/

### Description
WebhookNotificationProvider class: send(url: string, event: NotificationEvent). HTTP POST with JSON body: {event: type, summary, details, timestamp, project: projectName}. Timeout: 5 seconds. Retry: 1 retry on failure (non-200 response or network error). Log success/failure to .deckent/notification-log.json. Headers: Content-Type: application/json, User-Agent: deckent/{version}. 10+ tests.

### Tests
- POST body correct format
- Timeout respected
- Retry on failure
- Success logged
- 10+ tests

---

## Task 13: Notification System — Discord Integration
- Model: opus
- Effort: high
- Files: src/core/notification-providers/discord.ts (new), tests/core/notification-providers/discord.test.ts (new)
- Scope: src/core/, tests/core/

### Description
DiscordNotificationProvider class: send(webhookUrl: string, event: NotificationEvent). Formats as Discord embed: title = event type, description = summary, fields = details entries, color = green (complete), red (failed), yellow (warning). Uses Discord webhook API (POST to webhookUrl with {embeds: [...]}). Footer: "deckent v{version}". 10+ tests.

### Tests
- Embed format correct
- Color matches event type
- Fields populated from details
- Invalid URL handled
- 10+ tests

---

## Task 14: Notification System — Slack Integration
- Model: opus
- Effort: high
- Files: src/core/notification-providers/slack.ts (new), tests/core/notification-providers/slack.test.ts (new)
- Scope: src/core/, tests/core/

### Description
SlackNotificationProvider class: send(webhookUrl: string, event: NotificationEvent). Formats as Slack Block Kit: header block with event type, section block with summary, context block with details. Uses Slack incoming webhook API (POST with {blocks: [...]}). Fallback to simple text format if blocks fail. 10+ tests.

### Tests
- Block Kit format correct
- Header shows event type
- Context shows details
- Fallback to text works
- 10+ tests

---

## Task 15: Notification Configuration
- Model: opus
- Effort: high
- Files: src/core/notification-config.ts (new), tests/core/notification-config.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Add NotificationConfig to DeckentConfig: notifications: {terminal: boolean (default true), webhook?: string, discord?: string, slack?: string, events: ('sprint_complete'|'sprint_failed'|'task_nogo'|'usage_warning')[] (default: ['sprint_complete', 'sprint_failed'])}. validateNotificationConfig(config): URL format validation for webhook/discord/slack. CLI command: deckent config set notifications.discord <url>. 10+ tests.

### Tests
- Config parsed with defaults
- URL validation works
- Events filter respected
- CLI set works
- 10+ tests

---

## Task 16: Dashboard — Agent/Skill Columns
- Model: opus
- Effort: high
- Files: src/cli/helpers/output.ts (extend), tests/cli/helpers/output.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
Extend formatDashboard() to show agent and skill info per worker. New columns in agent table: "Agent" (agent name or "generic"), "Skills" (comma-separated skill names, max 3). If agent pool not initialized, columns show "-". Backward compatible: existing dashboard format preserved when no agents/skills configured. 10+ tests.

### Tests
- Agent column shows agent name
- Skills column shows skill names
- Generic worker shows "generic"
- Backward compatible without agents
- 10+ tests

---

## Task 17: Status Command — Agent/Skill Display
- Model: opus
- Effort: high
- Files: src/cli/commands/status.ts (extend), tests/cli/commands/status.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
Extend deckent status to show agent and skill assignments per task. New section after task list: "Agent Assignments" showing taskId -> agentName mapping. "Skill Assignments" showing taskId -> [skill1, skill2] mapping. Read from task .json files (new fields: assignedAgent, assignedSkills). --verbose flag shows full agent/skill details. 10+ tests.

### Tests
- Agent assignments displayed
- Skill assignments displayed
- --verbose shows details
- No assignments handled gracefully
- 10+ tests

---

## Task 18: Retro Command — Rich Output
- Model: opus
- Effort: high
- Files: src/cli/commands/retro.ts (extend), tests/cli/commands/retro.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
Extend deckent retro to use RichSprintSummary formatter. Instead of raw RETRO.md dump, show formatted highlights: sprint results, agent performance summary, top recommendations, coverage trend (last 3 sprints). --raw flag to show original RETRO.md content. --compare flag to show comparison with previous sprint. 10+ tests.

### Tests
- Rich format shows sections
- --raw shows original content
- --compare shows delta
- Missing retro handled
- 10+ tests

---

## Task 19: History Command — Agent/Skill Enrichment
- Model: opus
- Effort: high
- Files: src/cli/commands/history.ts (extend), tests/cli/commands/history.test.ts (extend)
- Scope: src/cli/, tests/cli/

### Description
Extend deckent history to include agent/skill information. Per sprint entry: show which agents were used, total tasks per agent, success rate per agent. New --agent <name> filter: show only sprints where this agent was used. New --skill <name> filter: show sprints where this skill was active. Data read from .brain/learning/ files. 10+ tests.

### Tests
- Agent info in history entries
- --agent filter works
- --skill filter works
- Missing learning data handled
- 10+ tests

---

## Task 20: MCP — Agent/Skill Enrichment
- Model: opus
- Effort: high
- Files: src/mcp/index.ts (extend), tests/mcp/mcp-tools.test.ts (extend)
- Scope: src/mcp/, tests/mcp/

### Description
Enrich MCP status tool response with agent/skill data. deckent_status response now includes: agentAssignments (taskId -> agentName), skillAssignments (taskId -> skillNames[]), agentStats (per-agent success rates). New MCP resource: deckent://agents (list all agents with stats), deckent://skills (list all skills with stats). 10+ tests.

### Tests
- Status response includes agents
- Status response includes skills
- Agent resource returns pool
- Skill resource returns pool
- 10+ tests

---

## Task 21: Interactive Review — Post-Sprint Mode
- Model: opus
- Effort: high
- Files: src/cli/commands/review.ts (new), tests/cli/commands/review.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
New command: deckent review. Enters interactive post-sprint review mode. Lists all tasks with their evaluation (DONE/TECH_DEBT/NO_GO). User can approve (keep), reject (revert changes), or retry (queue for next sprint). Non-interactive mode: deckent review --auto (auto-approve DONE, auto-retry NO_GO). State written to .tasks/review-{sprintId}.json. 15+ tests.

### Tests
- Review lists all tasks
- Approve keeps changes
- Reject marks for revert
- --auto mode works
- Review state persisted
- 15+ tests

---

## Task 22: Interactive Review — Task Approval/Rejection
- Model: opus
- Effort: high
- Files: src/cli/helpers/review-actions.ts (new), tests/cli/helpers/review-actions.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
ReviewActions class: approveTask(taskId, sprintId) marks task as reviewed and approved. rejectTask(taskId, sprintId, reason) marks as rejected and records reason. getReviewStatus(sprintId): returns Map<taskId, 'approved'|'rejected'|'pending'>. isReviewComplete(sprintId): true when all tasks reviewed. Review data stored in .tasks/review-{sprintId}.json. 10+ tests.

### Tests
- Approve persisted
- Reject with reason persisted
- Status map correct
- isReviewComplete accurate
- 10+ tests

---

## Task 23: Interactive Review — Selective Retry
- Model: opus
- Effort: high
- Files: src/cli/helpers/selective-retry.ts (new), tests/cli/helpers/selective-retry.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
SelectiveRetry class: queueForRetry(taskIds: string[], sprintId: string). Creates retry directives for next sprint (only selected tasks). generateRetryDirectives(taskIds, originalTasks): produces DIRECTIVES.md content with retry tasks (appends "-retry" to title, references original task notes). clearRetryQueue(sprintId). getRetryQueue(sprintId). 10+ tests.

### Tests
- Tasks queued for retry
- Retry directives generated correctly
- Original task notes referenced
- Queue cleared
- 10+ tests

---

## Task 24: Interactive Review — Summary
- Model: opus
- Effort: high
- Files: src/cli/helpers/review-summary.ts (new), tests/cli/helpers/review-summary.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
ReviewSummary class: generate(sprintId, reviewStatus). Produces: total reviewed, approved count, rejected count, retry queued count. Lists rejected tasks with reasons. Lists retry tasks. formatReviewSummary(summary): human-readable output. writeReviewReport(summary, outputPath): writes to .brain/reviews/sprint-{id}-review.md for Brain context in next sprint. 10+ tests.

### Tests
- Summary counts correct
- Rejected tasks listed with reasons
- Report written to .brain/reviews/
- Format readable
- 10+ tests

---

## Task 25: CLI Polish — Color Themes
- Model: opus
- Effort: high
- Files: src/cli/helpers/theme.ts (new), tests/cli/helpers/theme.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
Theme class: provides consistent color functions across all CLI output. Colors: success (green), error (red), warning (yellow), info (blue), muted (gray), accent (cyan). theme.success("text"), theme.error("text") etc. Respects NO_COLOR env var (returns plain text). Respects FORCE_COLOR env var. Detects 256-color support. All existing CLI output modules (output.ts, progress.ts, sprint-summary.ts) use theme instead of direct ANSI codes. 10+ tests.

### Tests
- Colors applied correctly
- NO_COLOR disables colors
- FORCE_COLOR forces colors
- All theme functions return strings
- 10+ tests

---

## Task 26: CLI Polish — Output Modes
- Model: opus
- Effort: high
- Files: src/cli/helpers/output-mode.ts (new), tests/cli/helpers/output-mode.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
OutputMode: 'quiet' | 'normal' | 'verbose'. Global --quiet flag: only errors and final result. Global --verbose flag: full debug output including decision logs, heartbeat polls, file operations. Normal: current behavior. setOutputMode(mode): sets global mode. shouldOutput(level: 'debug'|'info'|'warn'|'error'): checks against current mode. wrapLogger(logger): wraps any output function with mode check. 10+ tests.

### Tests
- Quiet mode suppresses info
- Verbose mode shows debug
- Normal mode is default
- shouldOutput thresholds correct
- 10+ tests

---

## Task 27: CLI Polish — Progress Persistence
- Model: opus
- Effort: high
- Files: src/cli/helpers/progress-persistence.ts (new), tests/cli/helpers/progress-persistence.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
ProgressPersistence class: saves progress state to .tasks/.progress-state.json on each update. On reconnect (deckent status during active sprint), reads saved state to show last known progress. saveProgressState(state: ProgressState). loadProgressState(): returns ProgressState|null. isProgressStale(state, maxAgeMs): true if state older than threshold (default 30s). clearProgressState(). 10+ tests.

### Tests
- State saved and loaded
- Stale detection by age
- Clear removes file
- Missing file returns null
- 10+ tests

---

## Task 28: Integration Test — Progress + Summary E2E
- Model: opus
- Effort: high
- Files: tests/integration/progress-summary.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end test for progress and summary flow. Scenario: 1) Create mock sprint with 4 tasks, 2) Simulate worker heartbeats (write .hb files), 3) WorkerStatusTracker reads heartbeats, 4) ProgressRenderer generates output, 5) ETA calculated, 6) Tasks complete (write .result files), 7) RichSprintSummary generated with changes, agent performance, recommendations, 8) SprintComparison with mock previous sprint. 15+ tests.

### Tests
- Heartbeats drive progress display
- ETA updates as tasks complete
- Summary includes all sections
- Comparison delta correct
- 15+ tests

---

## Task 29: Integration Test — Notification E2E
- Model: opus
- Effort: high
- Files: tests/integration/notification-flow.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end notification test. Scenario: 1) Configure notifications (terminal + webhook + discord), 2) Sprint completes, 3) NotificationDispatcher fires all configured providers, 4) Terminal bell sent, 5) Webhook POST body validated, 6) Discord embed format validated, 7) Slack blocks format validated, 8) Event filter respected (only sprint_complete, not task_nogo). Mock HTTP for webhook/discord/slack. 15+ tests.

### Tests
- All providers fired
- Event filter respected
- Webhook body format correct
- Discord embed format correct
- Slack blocks format correct
- 15+ tests

---

## Task 30: Integration Test — Review Flow E2E
- Model: opus
- Effort: high
- Files: tests/integration/review-flow.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end review flow test. Scenario: 1) Sprint with 5 tasks completes (3 DONE, 1 TECH_DEBT, 1 NO_GO), 2) Enter review mode, 3) Approve 3 DONE tasks, 4) Approve TECH_DEBT task, 5) Reject and retry NO_GO task, 6) Review summary generated, 7) Retry directives created for next sprint, 8) Review report written to .brain/reviews/. Auto mode: approve DONE, auto-retry NO_GO. 15+ tests.

### Tests
- Review state persisted
- Retry directives generated
- Summary counts correct
- Auto mode behavior correct
- Report written
- 15+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests 0 regression
- All tasks opus model, effort high
- All documentation English
- All CLI output respects NO_COLOR and --quiet/--verbose flags
