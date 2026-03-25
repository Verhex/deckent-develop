# deckent — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 600 lines max in .brain/ (MEMORY 200, RETRO 100, sprint log 80 per file)

## Providers
- Default: Claude (tmux backend, session auth)
- Optional: Codex (set OPENAI_API_KEY), Gemini (set GOOGLE_API_KEY)
- Config: brain_provider, worker_provider, fallback_provider in .deckent/config.json
- Model equivalence: opus↔gpt-5↔gemini-2.5-pro, sonnet↔gpt-4.1↔gemini-2.5-flash, haiku↔gpt-5-mini↔gemini-2.0-flash
- Planning mode: brain_planning = 'ai' | 'structured' | 'auto'

## Agents & Skills
- 8 built-in agents: security-auditor, test-writer, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer
- 10 built-in skills: typescript-expert, testing-expert, documentation-writer, etc.
- Agent pool: .deckent/agents/*/agent.json — LRU eviction (max 50 temp, 5 sprint age)
- Skill registry: .deckent/skills/*/skill.json — AST sandbox validation
- Task routing: task-router.ts assigns agent + skills + provider per task

## MCP Integration
- 10 tools: init, set_directives, plan, start, status, doctor, retro, history, analyze_project, sync
- 5 resources: dashboard, directives, memory, debt, config
- Registration: `claude mcp add deckent -- npx deckent mcp`

## Context
@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: tsc
Test: npx vitest run
Lint: tsc --noEmit

## Boot
@.deckent/workspace/BOOT.md
