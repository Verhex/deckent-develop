# Project Identity

## What Is This Project
- Name: deckent
- Type: AI agent orchestration CLI
- Language: TypeScript (ESM)
- Runtime: Node.js >=18
- Author: Alperen @ Verhex

## Architecture
- **orchestra/** (36 modules): Sprint lifecycle, planning, evaluation, routing
  - brain.ts → re-export layer, sprint-controller.ts → full lifecycle
  - planner.ts, task-builder.ts, result-evaluator.ts, task-router.ts
  - debt-manager.ts, sprint-reporter.ts, tmux.ts, spawn-backend.ts
- **core/** (42 modules): Types, config, utilities, agent/skill pools
  - types.ts + domain-types, config.ts (3-layer merge), provider.ts
  - agent-pool.ts (8 built-in, LRU), skill-pool.ts + skill-registry.ts (AST sandbox)
- **agents/** (16 modules): Worker execution, prompt engineering
- **providers/** (5 modules): Claude, Codex, Gemini adapters
- **api/** (3 modules): HTTP API server, SSE, rate limiting
- **mcp/**: MCP server — 16 tools + 9 resources, stdio transport
- **cli/** (33+ commands): Full CLI with helpers, entry point
- **dashboard/**: React + Vite + Tailwind web dashboard

## Current State
- Test Count: 11,918+
- Coverage: 96.0%
- Last Sprint: sprint-067
- Total Sprints: 67
- Completed Tasks: 111
- No-Go Rate: 0.0%

## Active Configuration
- Build: tsc
- Test: npx vitest run
- Lint: tsc --noEmit
- Providers: Claude (default), Codex, Gemini
- Planning: ai | structured | auto
- Routing Engine: **v2** (intent-based, default since sprint-067)
- Agents: 8 built-in + ci-guardian
- Skills: 10 built-in + ci-testing

## Key Rules
- See .brain/DECISIONS.md for 22 architecture decision records (ADR-001 through ADR-022)
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
- mcp/index.ts → 16 tools + 9 resources
- api/server.ts → HTTP API + SSE (16 endpoints)

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
