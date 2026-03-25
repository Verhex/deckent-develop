@DECKENT.md

# Project: deckent

## Rules
@DIRECTIVES.md
@.brain/MEMORY.md

## Architecture
- **orchestra/** — Sprint lifecycle, planning, evaluation, routing (36 modules)
  - brain.ts: orchestrator (re-export layer, imports from sprint-controller)
  - sprint-controller.ts: full sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP)
  - planner.ts: AI task planning (imports only from core/)
  - task-builder.ts: task creation, directive parsing, worker prompt building
  - result-evaluator.ts: GO/NO-GO/TECH_DEBT evaluation
  - task-router.ts: provider + agent + skill routing per task
  - debt-manager.ts: DEBT.md I/O, decay, pattern management
  - sprint-reporter.ts: retro, learnings, agent/skill performance
  - tmux.ts: tmux session management, worker spawn/kill
  - spawn-backend.ts: subprocess worker backend (non-tmux)
- **core/** — Types, config, utilities, agent/skill pools (42 modules)
  - types.ts + *-types.ts: all type definitions (task, config, sprint, monitoring)
  - config.ts: 3-layer config merge (defaults → global → project)
  - agent-pool.ts: AgentPoolManager, 8 built-in agents, LRU eviction
  - skill-pool.ts + skill-registry.ts: 10 built-in skills, sandbox AST validation
  - provider.ts: ProviderAdapter interface, multi-provider registry
- **agents/** — Worker execution, prompt engineering (16 modules)
  - worker.ts: task claim, file locking, heartbeat, result write
  - adaptive-agent.ts: runtime agent adaptation
- **providers/** — Claude, Codex, Gemini adapters (5 modules)
- **api/** — HTTP API server, SSE, rate limiting (3 modules)
- **mcp/** — MCP server: 10 tools + 5 resources, stdio transport
- **cli/** — 33+ commands, helpers, entry point
- **dashboard/** — React + Vite + Tailwind web dashboard

## Commands
Build: tsc
Test: npx vitest run
Test Dashboard: npx vitest run --config src/dashboard/vitest.config.ts
Test Coverage: npx vitest run --coverage
Lint: tsc --noEmit
Dev: tsc --watch

## Agent Instructions
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Contracts
@.contracts/api-surface.md

## Identity
@.deckent/workspace/IDENTITY.md
