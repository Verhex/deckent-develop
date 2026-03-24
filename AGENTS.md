@DECKENT.md

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

## Providers
- Default: Claude (tmux backend, session auth)
- Optional: Codex (set OPENAI_API_KEY), Gemini (set GOOGLE_API_KEY)
- Config: brain_provider, worker_provider, fallback_provider in .deckent/config.json
- Model equivalence: opus↔gpt-5↔gemini-2.5-pro, sonnet↔gpt-4.1↔gemini-2.5-flash, haiku↔gpt-5-mini↔gemini-2.0-flash

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
