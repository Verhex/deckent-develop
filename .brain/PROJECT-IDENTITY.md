# Project Identity

## What Is This Project
- Name: deckent
- Type: AI agent orchestration CLI
- Language: TypeScript (ESM)
- Runtime: Node.js >=18
- Author: Alperen @ Verhex

## Architecture
- **orchestra/** (47 modules): Sprint lifecycle, planning, evaluation, routing
  - brain.ts → re-export layer, sprint-controller.ts → full lifecycle
  - sprint-phases.ts → extracted phase functions (Sprint 072 god object split)
  - sprint-utils.ts → shared sprint utilities (Sprint 075 god object split faz 2)
  - result-collector.ts → result collection, IPC+fs.watch loop (Sprint 076 god object split faz 3)
  - planner.ts, task-builder.ts, result-evaluator.ts, task-router.ts
  - debt-manager.ts, sprint-reporter.ts, tmux.ts, spawn-backend.ts
- **core/** (49 modules): Types, config, utilities, agent/skill pools
  - types.ts + domain-types, config.ts (3-layer merge), provider.ts
  - agent-pool.ts (8 built-in, LRU), skill-pool.ts + skill-registry.ts (AST sandbox)
- **agents/** (16 modules): Worker execution, prompt engineering
- **providers/** (5 modules): Claude, Codex, Gemini adapters
- **api/** (3 modules): HTTP API server, SSE, rate limiting
- **mcp/**: MCP server — 17 tools + 9 resources, stdio transport
- **cli/** (32 commands): Full CLI with helpers, entry point
- **dashboard/**: React + Vite + Tailwind (6 pages, SSE indicator, language switcher)
  - i18n/LanguageProvider.tsx, i18n/en.ts, i18n/tr.ts (Sprint 079)

## Current State
- Test Count: 12
- Coverage: 96.0%
- Last Sprint: sprint-076
- Total Sprints: 76
- Completed Tasks: 189
- No-Go Rate: 0.0%

## Active Configuration
- Build: tsc
- Test: npx vitest run
- Lint: tsc --noEmit
- Providers: Claude (default), Codex, Gemini
- Planning: ai | structured | auto
- Routing Engine: **v2** (intent-based, default since sprint-067)
- Agents: 9 built-in (security-auditor, test-writer, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian)
- Skills: 11 built-in (including ci-testing)

## Key Rules
- See .brain/DECISIONS.md for 26 architecture decision records (ADR-001 through ADR-026)
- Brain is the ONLY orchestrator — workers never plan
- Sprint lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
- Memory budget: 900 lines max in .brain/ (increased sprint-067)
- Routing engine: v2 default since sprint-067 (intent-based 3-layer engine)
- CLI/MCP feature parity: ADR-022 — every command must exist in both environments

## Module Map
- orchestra/brain.ts → re-export layer (imports sprint-controller)
- orchestra/sprint-controller.ts → full sprint lifecycle (8 phases)
- orchestra/planner.ts → AI task planning (Zod-validated)
- orchestra/task-router.ts → intent-based routing v2 (3-layer engine, DEFAULT)
- core/config.ts → 3-layer config merge with autoMigrateOnLoad
- core/intent-classifier.ts → Layer 1: task intent classification
- core/activation-engine.ts → Layer 2: structured activation rules
- core/routing-engine.ts → Layer 3: unified routing (routeTaskV2), confidence scoring
- core/agent-pool.ts → AgentPoolManager, LRU eviction (max 50 temp)
- core/skill-pool.ts → skill selection, stack detection
- core/provider.ts → ProviderAdapter interface, multi-provider registry
- agents/worker.ts → task claim, file locking, heartbeat, verify loop
- cli/entry.ts → buildProgram() + 33+ commands
- mcp/index.ts → 17 tools + 9 resources (Sprint 080)
- api/server.ts → HTTP API + SSE (17 endpoints: GET /api/status, /api/tasks, etc.)

## Sprint 067 Learnings
- V2 routing engine is now the DEFAULT (`config.routing_engine ?? 'v2'`)
- V1 keyword-based routing is LEGACY — only activated via explicit config
- npm package size reduced: 768KB → <500KB via .npmignore optimization
- `any` usage cleanup: 10 occurrences in 7 files replaced with proper types
- Job state enrichment: finalizeSprint() writes tasks + metrics to job file
- Retro detail enrichment: worker notes (first 150 chars) written to RETRO.md
- Task status PENDING → EXECUTING update on worker spawn
- cleanup_delay: 180s — task files preserved for post-sprint inspection
- Scope parser: .deckent/, .brain/, root files now recognized
- goNogo criteria: extracted from DIRECTIVES Kanıt/Proof lines

## Sprint 078-080 Achievements (Documentation & Dashboard)
- Sprint 078: Blueprint/ANA-PLAN senkronizasyonu, memory budget 600→900, MCP 16→17 tools
- Sprint 079: Dashboard i18n (LanguageProvider, 90+ TR/EN keys), /api/tasks endpoint, README-TR.md, VISION-EN.md
- Sprint 080: SSE connection indicator (connected/connecting/disconnected), ConfigPage improvements, 6-page dashboard with language switcher
- New modules: i18n/LanguageProvider.tsx, i18n/en.ts, i18n/tr.ts
- New files: README-TR.md (466 lines), VISION-EN.md (110 lines)
- Test count: 12,198 (12,182 passed + 15 skipped + 1 fail)
- All sprints GO or GO_WITH_TECH_DEBT (0 NO_GO rate)
