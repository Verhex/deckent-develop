<!-- Dil: TR | Teknik terimler EN -->
@DECKENT.md

# Project: deckent

## ⚠️ Quality Bar — Direct Hand-Coding (MANDATORY, applies to ME)
Bu bölüm, deckent üzerinde **doğrudan kod yazdığım her an** (hybrid dogfood, REPL/TUI/CLI el-kodlama)
bağlayıcıdır. deckent **god-level, enterprise-grade** bir üründür — ona yakışır şekilde çalış.
Kalite her seferinde kullanıcının prompt'uyla düzeltilmemeli; **ilk seferde doğru** olmalı.
MVP ve temel seviye iş ve işçilik planlamıyorum. Her zaman milyonlarca kişiye hitap edecek bir proje olduğunun farkında ilerliyorum.

- **i18n-FIRST — kullanıcıya görünen string'i ASLA hardcode etme.** Tüm user-facing metin
  `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr) üzerinden gelir. Mekanizma
  modülleri (TUI/render/controller) **string-free** olur → label'lar caller'dan enjekte edilir,
  İngilizce default. Hardcode TR/EN = teknik borç, kabul edilmez.
- **No tech debt by default.** Kısa-yol/placeholder/MVP YOK. Bir şeyi eksik bırakıyorsan
  açıkça işaretle + nedenini söyle; sessizce borç bırakma.
- **Proof-of-function.** User-surface değişiklik → gerçek-binary run-verify (mock-only yetmez).
  Test hermetik (tmpdir, async spawn, no spawnSync), CI yeşil korunur.
- **Surgical + mevcut-pattern.** Var olan i18n/config/routing sistemlerini kullan, yeniden icat etme.
- **Riskli/görsel kod kör-default-on edilmez** — flag-gated + doğrula, sonra default.
- Şüphe varsa: "Bu god-level/enterprise mi, i18n-temiz mi, borç bırakıyor mu?" diye sor — sonra yaz.

## Rules
@DIRECTIVES.md
@.brain/exports/summary.md

## Architecture
- **orchestra/** — Sprint lifecycle, planning, evaluation, routing (76 modules)
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
- **core/** — Types, config, utilities, agent/skill pools (90 modules)
  - types.ts + *-types.ts: all type definitions (task, config, sprint, monitoring, routing)
  - config.ts: 3-layer config merge (defaults → global → project)
  - agent-pool.ts: AgentPoolManager, 15 built-in agents, LRU eviction
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
  - memory-store.ts: MemoryStore class — SQLite DB-first memory (CRUD, FTS5, tags, relations, decay, history)
  - memory-query.ts: searchMemory() — dual-layer FTS5 search (original + turkishNormalize), buildAutoQuery()
  - memory-normalize.ts: turkishNormalize() — i18n text normalization for FTS5 (TR/EN/DE %100)
  - memory-types.ts: MemoryEntryV2, CreateEntryInput, MemoryQueryParams, MemorySearchResult interfaces
  - memory-export.ts: DB → .md snapshot generation (summary, decisions, memory, debt)
  - memory-import.ts: .md → DB migration parser (parseDecisionsMd, parseMemoryMd, parseDebtMd)
- **agents/** — Worker execution, prompt engineering (20 modules)
  - worker.ts: task claim, file locking, heartbeat, result write
  - adaptive-agent.ts: runtime agent adaptation
- **nervous/** — Proactive meta-orchestrator (ADR-040): observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history
- **monitor/** — Auditor scan loop, dashboard manager, sprint-state tracking
- **connectors/** — External messaging adapters: Discord, Telegram, WhatsApp, incoming-router
- **providers/** — Claude, Codex, Gemini adapters (5 modules)
- **api/** — HTTP API server, SSE, rate limiting (4 modules)
- **mcp/** — MCP server: 33 tools + 8 resources, stdio transport
- **cli/** — 55+ commands, helpers, entry point
- **dashboard/** — React + Vite + Tailwind web dashboard
- **extensions/vscode/** — VS Code extension host integration

## Commands
Build: `npm run build` (tsc + copy-assets) | Full: `npm run build:all` (+ dashboard vite build)
Test: `npm test` (vitest run) | Watch: `npm run test:watch` | Coverage: `npm run test:coverage`
Test Dashboard: `npm run test:dashboard` (vitest.dashboard.config.ts)
Lint: `npm run lint` (tsc --noEmit) | ADR: `npm run lint:adr` | Errors: `npm run lint:errors` | Links: `npm run lint:link`
Dev: `npm run dev` (tsc --watch)
Publish gate: `npm run validate:publish` — Alperen runs `npm publish` manually (see memory: npm publish approval)

## Agent Instructions
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Contracts
@docs/reference/api-surface.md

## Identity
@.deckent/workspace/IDENTITY.md

## Gotchas
- **ESM imports**: `.js` uzantısı zorunlu (Node16 resolution). `import { foo } from './bar'` çalışmaz, `'./bar.js'` gerekir.
- **MCP server restart**: `dist/` rebuild sonrası long-lived MCP process eski kodu cache'ler. `/mcp restart` veya Claude Code yeniden başlat.
- **`deckent_start` fire-and-forget**: MCP stdio aynı process'te runSprint Promise event loop'u bloke edebilir. Long sprint için CLI `deckent start` tercih edilir.
- **Scope enforcement**: Worker `scope.filesWrite` dışına yazamaz — ADR-037 RBAC **compile-time lint + audit-trail**; runtime **advisory/soft** (V1.0 Layer-2 kasıtlı eksik — ihlal `git diff --stat` ile Auditor tarafından izlenir + warn/emit edilir, **bloke ETMEZ**; hard-flip post-GA V2). Honest-gate worker tarafında self-flag eder (örn. BOUNDARY_VIOLATION → NO_GO), Brain FIX/cascade uygular.
- **Sprint kill/cleanup**: Alperen onayı olmadan `deckent_kill`, `deckent_cleanup` (canlı sprint), `rm .tasks/*` YASAK (memory: feedback_deckent_kill_approval_required).

## Live Status
Canlı sprint, debt, agent performance ve ADR durumu için: `@.brain/exports/summary.md` (auto-generated her sprint sonu).
Komutlar: `deckent status`, `deckent history`, `deckent retro`, `deckent recall "<sorgu>"`.

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Sprint | sprint-269 |
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Duration | ~35dk (usage-limit kesintisi + CC retry) |
| Coverage | N/A |

## Active Debt
_No tech debt record._

## Agent Performance
| Agent | Tasks | Done | Success |
|-------|-------|------|--------|
| api-builder | 2 | 2 | 100% |
| frontend-designer | 1 | 1 | 100% |
| bug-fixer | 1 | 1 | 100% |
| doc-writer | 1 | 1 | 100% |
