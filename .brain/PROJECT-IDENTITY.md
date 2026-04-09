# Project Identity

## What Is This Project
- Name: deckent
- Type: AI agent orchestration CLI
- Language: TypeScript (ESM)
- Runtime: Node.js >=18
- Author: Alperen @ Verhex

## Architecture
- **orchestra/** (65 modules): Sprint lifecycle, planning, evaluation, routing
  - brain.ts → re-export layer, sprint-controller.ts → full lifecycle
  - sprint-phases.ts → extracted phase functions (Sprint 072 god object split)
  - sprint-utils.ts → shared sprint utilities (Sprint 075 god object split faz 2)
  - result-collector.ts → result collection, IPC+fs.watch loop (Sprint 076 god object split faz 3)
  - planner.ts, task-builder.ts, result-evaluator.ts, task-router.ts
  - debt-manager.ts, sprint-reporter.ts, tmux.ts, spawn-backend.ts
- **core/** (58 modules): Types, config, utilities, agent/skill pools
  - types.ts + domain-types, config.ts (3-layer merge), provider.ts
  - agent-pool.ts (16 built-in, LRU), skill-pool.ts + skill-registry.ts (AST sandbox)
  - model-registry.ts (ModelRegistry class, 13 models, 3 providers, tier-based routing)
  - mode-presets.ts (ModelStrategy, MODE_PRESETS: performance/balanced/economic/api)
- **agents/** (16 modules): Worker execution, prompt engineering
- **providers/** (5 modules): Claude, Codex, Gemini adapters
- **api/** (3 modules): HTTP API server, SSE, rate limiting
- **mcp/**: MCP server — 21 tools + 8 resources, stdio transport (verified sprint-093)
- **cli/** (35 commands): Full CLI with helpers, entry point
- **dashboard/**: React + Vite + Tailwind (6 pages, SSE indicator, language switcher)
  - i18n/LanguageProvider.tsx, i18n/en.ts (~282 keys), i18n/tr.ts (~282 keys)
  - ConfigPage i18n tam kapsam (Sprint 084), AgentDetail geniş panel (Sprint 084)

## Current State
- Test Count: 12,193+
- Coverage: 96.0%
- Last Sprint: sprint-128
- Total Sprints: 128
- Completed Tasks: 323
- No-Go Rate: 0.0%

## Active Configuration
- Build: tsc
- Test: npx vitest run
- Lint: tsc --noEmit
- Providers: Claude (default), Codex, Gemini
- Planning: ai | structured | auto
- Routing Engine: **v2** (intent-based, default since sprint-067)
- Agents: 16 built-in (security-auditor, test-writer, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, data-engineer, devops-engineer, frontend-designer, migration-specialist, accessibility-auditor)
- Skills: 21 built-in (typescript-expert, testing-expert, documentation-writer, security-specialist, performance-optimizer, api-builder, devops-engineer, database-migration, react-specialist, python-expert, ci-testing, accessibility-expert, anthropic-sdk, code-simplifier, docker-expert, frontend-design, git-expert, graphql-expert, migration-expert, monorepo-expert, system-architect)

## Key Rules
- See .brain/DECISIONS.md for 28 architecture decision records (ADR-001 through ADR-028)
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
- cli/entry.ts → buildProgram() + 35+ commands
- mcp/index.ts → 21 tools + 8 resources (Sprint 089: usage kaldırıldı)
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
- Sprint 078: Blueprint/ANA-PLAN senkronizasyonu, memory budget 600→900, MCP 17→19 tools
- Sprint 079: Dashboard i18n (LanguageProvider, 90+ TR/EN keys), /api/tasks endpoint, README-TR.md, VISION-EN.md
- Sprint 080: SSE connection indicator (connected/connecting/disconnected), ConfigPage improvements, 6-page dashboard with language switcher
- New modules: i18n/LanguageProvider.tsx, i18n/en.ts, i18n/tr.ts
- New files: README-TR.md (466 lines), VISION-EN.md (110 lines)
- Test count: 12,239 (12,223 passed + 15 skipped + 1 fail)
- Dashboard tests: 413 (14 files, 41 yeni live-data testleri Sprint 084)
- All sprints GO or GO_WITH_TECH_DEBT (0 NO_GO rate)

## Sprint 084 Achievements (Dashboard Fix + i18n + Tests + Build)
- AgentDetail panel: w-[600px] sm:w-[700px], text-sm, h-[350px] log, break-words
- ConfigPage i18n: 79 yeni key, fieldT() helper, TR/EN tam geçiş
- Canlı veri test suite: 41 test (SSE, WorkerCard, ActivityFeed, SprintPhaseTimeline)
- Build otomasyon: build:dashboard, build:all, postbuild npm scripts

## Sprint 093-094 Achievements (Stats Sync + RETRO Skill Tablosu + Sprint Bildirim)
- Agent/Skill Stats Sync (V2→manifest): finalizeSprint() artık agent.json ve manifest.json stats'larını güncelliyor (totalUses, successRate, avgQualityScore, qualityTaskCount)
- RETRO.md Skill Performance tablosu: buildSkillPerformance() guard fix — skillMap boş/undefined durumunda güvenli fallback
- avgQualityScore persist fix: EntityPerformance'a qualityTaskCount eklendi, formül düzeltildi
- Sprint bitişinde otomatik output: finalizeSprint() sonunda .deckent/jobs/{sprintId}.json yazılıyor (Job Completion Notification)
- Sprint 094: Stats Sync doğrulama + Usage son kalıntı temizliği (docs/reference/cli.md)

## Sprint 087-088 Achievements (Stabilizasyon + Otonom Adaptasyon + Perfect Beta)
- Sprint 087 Stabilizasyon: Otonom adaptasyon, self-improvement, öğrenme döngüsü kapatma
- Sprint 088 Task 1 — Sprint Timeout Reformu: `sprint_timeout_minutes: 0` = sınırsız, config-types.ts + result-collector.ts + sprint-controller.ts güncellemeleri
- Sprint 088 Task 2 — Heartbeat Daemon: `src/orchestra/heartbeat-daemon.ts` yeni modül, `deckent heartbeat [--daemon] [--interval <min>] [--stop]` CLI komutu
- Sprint 088 Task 3 — Human Checkpoints: `human_checkpoints: ['plan','evaluate','fix']` config, `waitForHumanApproval()` dosya bazlı onay/red, sprint-controller.ts entegrasyonu
- Sprint 088 Task 4 — Docs Final Polish: Badge'lar, yeni özellikler, karşılaştırma tablosu, IDENTITY güncellemeleri
- Self-improvement durumu: Faz 0+1 tamamlandı, Faz 2 devam ediyor
- Version: v0.3.0-beta.3
