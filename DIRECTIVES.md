# DIRECTIVES — Sprint 10 (Coverage, Refactor, API, Dashboard)

## Hedef: Branch coverage to 90%+, sprint ID extraction, HTTP API with SSE, terminal dashboard

## Task 1: Branch coverage >= 90%
- Current branch coverage: 89.72%. Target: >= 90%
- Low-coverage branches to target:
  - src/mcp/tools/status.ts (75% branch): add test for JSON parse error path (catch block line 33-40)
  - src/mcp/resources/debt.ts (57.89% branch): add tests for parseDebtTable edge cases (lines 13-18, 21, 44)
  - src/mcp/tools/init.ts (70% branch): add tests for existing file detection paths (lines 27-28, 109-112)
  - src/mcp/tools/start.ts (60% branch): add test for BrainError catch path
  - src/mcp/tools/directives.ts (66.66% branch): add test for empty content edge case
  - src/mcp/tools/retro.ts (75% branch): add test for missing retro path
  - src/core/constants.ts (66.66% branch): add test for package.json read failure fallback
  - src/core/utils.ts (80% branch): add tests for edge cases
  - src/cli/commands/analyze.ts (33.33% stmt): add tests for formatAnalysisResult and action handler
- Create NEW test files only, do NOT modify existing test files
- Dosya: tests/mcp/branch-coverage.test.ts, tests/cli/analyze-coverage.test.ts, tests/core/branch-coverage.test.ts
- Kapsam: tests/mcp/, tests/cli/, tests/core/

## Task 2: Extract getNextSprintId() utility
- In src/orchestra/brain.ts planSprint() lines 344-357, the sprint numbering logic is inline
- Extract to a new exported function: getNextSprintId(projectRoot: string): string
- Place in src/core/utils.ts (shared utility pattern, like countBrainLines)
- Function should: scan .brain/sprints/ directory, find max sprint-NNN.md number, return sprint-{max+1 padded to 3 digits}
- If no sprints dir or empty, return sprint-001
- Update planSprint() to call getNextSprintId() instead of inline logic
- Add tests to verify: empty dir → sprint-001, existing sprints → correct increment, non-sequential files handled
- Dosya: src/core/utils.ts, src/orchestra/brain.ts, tests/core/utils-sprint-id.test.ts, tests/orchestra/brain.test.ts

## Task 3: HTTP API with SSE + deckent serve command
- Create src/api/server.ts with createHttpServer(projectRoot: string, port?: number)
- Use only node:http (NO express, NO ws package — zero new dependencies)
- Endpoints:
  - GET /api/status → reads .deckent/.dashboard JSON file, returns it with Content-Type application/json
  - GET /api/sprint → reads latest sprint log from .brain/sprints/, returns JSON with id, metrics, tasks
  - GET /api/history → reads all sprint logs, returns JSON array
  - GET /api/events → SSE stream (Content-Type text/event-stream), watches .dashboard file with fs.watch, pushes data: {json} on change
- Create src/api/watcher.ts with watchDashboard(filePath: string, onChange: callback)
  - Uses node:fs watch (NOT chokidar — zero deps)
  - Debounce: 500ms to avoid rapid fire
- Create src/cli/commands/serve.ts with registerServe(program: Command)
  - Command: deckent serve [--port 3100]
  - Starts HTTP server, prints listening URL, handles SIGINT/SIGTERM gracefully (server.close())
- Register in src/cli/index.ts: import registerServe, call registerServe(program)
- Create tests with mocked node:http and node:fs
- Dosya: src/api/server.ts, src/api/watcher.ts, src/cli/commands/serve.ts, src/cli/index.ts, tests/api/server.test.ts, tests/cli/serve.test.ts

## Task 4: deckent dashboard (terminal TUI)
- Create src/cli/commands/dashboard.ts with registerDashboard(program: Command)
- Command: deckent dashboard [--interval 2000]
- Reads .deckent/.dashboard JSON file directly (no dependency on HTTP server)
- Box-drawing UI with Unicode characters (established project pattern):
  - Sprint info box: ID, phase, status (╔═══╗ style)
  - Worker table: ID, task title, status, elapsed time
  - Progress bar: completed/active/pending/total with visual bar
  - Alerts section: level, message, timestamp (if any)
- Auto-refresh with setInterval (default 2000ms), clear screen between renders
- Handle SIGINT/SIGTERM for clean exit (clearInterval + process.exit)
- If .dashboard file not found, print "No active sprint. Run deckent start first."
- Register in src/cli/index.ts: import registerDashboard, call registerDashboard(program)
- Dosya: src/cli/commands/dashboard.ts, src/cli/index.ts, tests/cli/dashboard.test.ts

## Kalite Kuralları
- Mevcut testler regresyona uğramamalı (720 test)
- tsc --noEmit clean kalmalı
- Her görev için testler yazılmalı
- SIFIR yeni runtime dependency eklenecek
