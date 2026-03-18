# Project: deckent

## Rules
@DIRECTIVES.md
@.brain/MEMORY.md

## Architecture
- Brain: src/orchestra/brain.ts (orchestrator — only module that imports from other orchestration modules)
- Planner: src/orchestra/planner.ts (AI task planning — imports only from core/)
- Workers: src/agents/worker.ts (scoped task execution)
- Auditor: src/monitor/auditor.ts (monitoring, boundary scanning)
- Config: brain_planning = 'ai' | 'structured' | 'auto'

## Commands
Build: tsc
Test: npx vitest run
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
