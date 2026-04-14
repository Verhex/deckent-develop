<!-- Dil: TR | Teknik terimler EN -->
@DECKENT.md

# Project: deckent

## Rules
@DIRECTIVES.md
@.brain/MEMORY.md

## Architecture
- **orchestra/** — Sprint lifecycle, planning, evaluation, routing (65 modules)
  - brain.ts: orchestrator (re-export layer, imports from sprint-controller)
  - sprint-controller.ts: full sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP)
  - planner.ts: AI task planning (imports only from core/)
  - task-builder.ts: task creation, directive parsing, worker prompt building, Agent:/Skills: override parsing
  - result-evaluator.ts: GO/NO-GO/TECH_DEBT evaluation
  - task-router.ts: provider + agent + skill routing per task
  - debt-manager.ts: DEBT.md I/O, decay, pattern management
  - sprint-reporter.ts: retro, learnings, agent/skill performance
  - tmux.ts: tmux session management, worker spawn/kill
  - spawn-backend.ts: subprocess worker backend (non-tmux)
  - outcome-tracker.ts: routing outcome recording, learning bonuses, synergy matrix
  - quality-assessor.ts: multi-dimensional quality scoring (correctness, coverage, scope, completeness)
  - mid-sprint-adapter.ts: real-time rerouting on task failure (FIX phase)
  - rule-evolver.ts: auto-generate activation rules from outcome data
  - temp-skill-generator.ts: template-based project-conventions skill generation
  - promotion-pipeline.ts: temp→permanent agent/skill promotion, demotion
  - sprint-utils.ts: shared utilities for sprint phases, task analysis, timing helpers
  - result-collector.ts: waitForResults, processQueue, collectResults, result aggregation + IPC
- **core/** — Types, config, utilities, agent/skill pools (58 modules)
  - types.ts + *-types.ts: all type definitions (task, config, sprint, monitoring, routing)
  - config.ts: 3-layer config merge (defaults → global → project)
  - agent-pool.ts: AgentPoolManager, 16 built-in agents, LRU eviction
  - skill-pool.ts + skill-registry.ts: 21 built-in skills, sandbox AST validation
  - provider.ts: ProviderAdapter interface, multi-provider registry
  - routing-types.ts: TaskDNA, ActivationConfig, RoutingDecision, SkillBudget types
  - intent-classifier.ts: Layer 1 — task intent classification from scope/description
  - activation-engine.ts: Layer 2 — structured activation rules with exclude support
  - routing-engine.ts: Layer 3 — unified routing (routeTaskV2), confidence scoring, override resolution
  - condition-evaluator.ts: path-based condition engine ($gt, $contains, $and, $or)
  - manifest-migrator.ts: V1→V2 manifest migration for agents/skills
  - model-registry.ts: ModelRegistry class, 13 models, 3 providers, tier-based routing
  - mode-presets.ts: ModelStrategy, MODE_PRESETS (performance/balanced/economic/api)
- **agents/** — Worker execution, prompt engineering (16 modules)
  - worker.ts: task claim, file locking, heartbeat, result write
  - adaptive-agent.ts: runtime agent adaptation
- **providers/** — Claude, Codex, Gemini adapters (5 modules)
- **api/** — HTTP API server, SSE, rate limiting (3 modules)
- **mcp/** — MCP server: 21 tools + 8 resources, stdio transport
- **cli/** — 35+ commands, helpers, entry point
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

## Sprint Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-137 |
| Toplam Task | 6 |
| Tamamlanan | 6 |
| Tech Debt | 1 |
| No-Go | 0 |
| Süre | 35dk 52sn |
| Coverage | 14.9% |

## Active Debt
_Açık teknik borç yok._

## Agent Performance (Sprint 134)
| Agent | Tasks | Done | Tech Debt | Note |
|-------|-------|------|-----------|------|
| architect | 5 | 3 | 2 | T-001/T-005/T-011 DONE; T-010/T-014 GO_WITH_TECH_DEBT |
| refactorer | 4 | 3 | 1 | T-003/T-004/T-010 DONE; T-009 GO_WITH_TECH_DEBT (864 LoC over) |
| bug-fixer | 2 | 2 | 0 | T-002/T-006 DONE |
| architecture-planner | 1 | 1 | 0 | T-007 ADR-033 + roadmap.md |
| code-reviewer | 1 | 1 | 0 | T-008 mock audit (62 files) |
| doc-writer | 2 | 1 | 1 | T-015 manually completed; T-013 GO_WITH_TECH_DEBT |

## Agent Performance
| Agent | Tasks | Done | Başarı |
|-------|-------|------|--------|
| architect | 3 | 3 | 100% |
| test-writer | 1 | 1 | 100% |
| doc-writer | 1 | 1 | 100% |
| bug-fixer | 1 | 1 | 100% |
