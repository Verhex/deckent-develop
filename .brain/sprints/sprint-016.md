# Sprint 016 — Watch Mode, Worker Logs, Agent Detail

**Date:** 2026-03-18
**Status:** COMPLETE
**Tasks:** 5 (all GO)
**Tests:** 967 → 987 (+20)
**Coverage:** 97.5%

## Results
- `deckent watch` CLI: live tmux split (dashboard + worker panes)
- Worker log capture via tmux pipe-pane → .tasks/task-{id}.log
- `deckent start --watch` flag (setupWatchWindow before runSprint)
- GET /api/worker/:taskId/log endpoint + AgentDetail React component
- inferModelFromDirective() heuristic: opus/sonnet/haiku by complexity
- buildPlanPrompt enriched model selection criteria
- .brain/ dogfooding: sprint-015.md, ADR-013, MEMORY.md updated

## Learnings
- MCP deckent_start times out — runSprint is sync/blocking, needs background job
- .tasks/ cleanup not triggered via MCP flow — cleanup only runs in full lifecycle
- getNextSprintId fragile — depends on .brain/sprints/ files, needs config-based fallback
- Dashboard state can go stale between sprints — needs reset on new sprint start
- React test infra missing — no happy-dom/jsdom setup, dashboard tests skipped
- inferModelFromDirective works: text patterns + scope.filesWrite count heuristic
- setupWatchWindow (non-blocking) vs createWatchLayout (blocking attach) separation
