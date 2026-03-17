# Project: Deckent

## Identity
AI agent orchestration system by Verhex.
Deckent plans, assigns, monitors, and completes development work using multiple AI agents in parallel.
Domain: deckent.agency | Author: Alperen @ Verhex

## Vision & Architecture
Deckent is a self-evolving AI agent orchestration system. It is NOT a ChatGPT wrapper or simple task runner.
For full architecture, vision, and implementation details: @DECKENT-MASTER-BLUEPRINT.md

Key architecture:
- Brain (Opus): orchestrator — plans, evaluates, learns, adapts
- Auditor (Sonnet): immune system — monitors, detects patterns, writes dashboard
- Workers (per-task model): builders — plan→code→test→doc→report
- Memory: 3-tier system in .brain/ (MEMORY.md → sprint logs → archive)
- Orchestration: tmux dynamic windows, claude -p headless mode
- Sprint lifecycle: Directive→Plan→Spawn→Execute→Evaluate→Fix→Retro→Decay→Transition

Inspiration: OpenClaw (workspace, memory, skills), Cowork (agentic loop, plugins), Claude Code (CLAUDE.md, rules, Agent Teams)

## Rules
- TypeScript strict mode, ESM modules, Node 18+
- All imports use `.js` extensions (Node16 resolution)
- Tests with vitest, aim >90% coverage
- Never leave a sprint incomplete — pause and resume if limits hit
- Workers stay within assigned scope (directories/files)
- Brain evaluates every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Memory budget: `.brain/` must stay under 300 lines (excluding archive)
- Auditor never writes source code
- Workers CANNOT write to .brain/ (Blueprint Section 15)
- Heartbeat every 15s, stale after 120s
- Tech debt escalates: 2 sprints → HIGH, 3+ sprints → CRITICAL
- Cross-dependency rule: if A's NO-GO caused by B's output, B gets priority fix

## Imports
@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Instructions
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Project Status
- Sprint 1-5 COMPLETE (644 tests, 0 regression, 94.83% coverage)
- Core orchestration engine built (brain, auditor, worker, tmux, CLI)
- resolveDebt() lifecycle verified
- Decay mechanism (runDecay), doctor health checks, start pre-flight
- Current: Sprint 6 planning

## Commands
Build: `npm run build`
Test: `npm test`
Lint: `npm run lint`
Dev: `npm run dev`
Coverage: `npm run test:coverage`

## Communication
- Respond in Turkish. Technical terms may remain in English.
- Kod yorumları İngilizce kalabilir (açık kaynak uyumluluk).
- Sprint raporları ve retrospektifler Türkçe yazılır.

## Tools
- Use context7 MCP for library documentation lookup
- Use sequential-thinking MCP for complex planning decisions
- Reference DECKENT-MASTER-BLUEPRINT.md for all architectural questions
