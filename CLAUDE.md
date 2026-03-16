# Project: Deckent

## Identity

AI agent orchestration system by Verhex.
Deckent plans, assigns, monitors, and completes development work using multiple AI agents in parallel.
Domain: deckent.agency | Author: Alperen @ Verhex

## Rules

- TypeScript strict mode, ESM modules, Node 18+
- All imports use `.js` extensions (Node16 resolution)
- Tests with vitest, aim >90% coverage
- Never leave a sprint incomplete — pause and resume if limits hit
- Workers stay within assigned scope (directories/files)
- Brain evaluates every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Memory budget: `.brain/` must stay under 300 lines (excluding archive)
- Auditor never writes source code
- Heartbeat every 15s, stale after 120s
- Tech debt escalates: 2 sprints → HIGH, 3+ sprints → CRITICAL

## Imports

@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Instructions

When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

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
