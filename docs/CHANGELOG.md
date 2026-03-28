# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-beta.3-sprint70] - 2026-03-27

### Added

- Model İsimleri Güncelliği + Doğrulama

### Changed

- Plan Tier Generalizasyonu — Claude-Specific → Genel (completed with tech debt)
- Init Wizard Genel Provider Seçimi (completed with tech debt)
- README.md Güncel Özellikler (completed with tech debt)
- sprint-controller.ts God Object Split — Faz 1 (completed with tech debt)


_Tasks: 5 total, 5 done, 4 tech debt, 0 no-go_

## [0.2.0-beta.3] - 2026-03-27

### Added

- `deckent upgrade --local <path.tgz>` — closed beta development workflow
- `.deckent/workspace/IDENTITY.md` — stack detection sonuçlarıyla proje kimliği
- `.deckent/docs/` — quick-start.md, directives-guide.md, config-reference.md (TR/EN)
- TempSkill + TempAgent init sırasında otomatik oluşturma
- DECKENT.md Workflow Guide + DIRECTIVES Format + Providers bölümleri
- Subprocess heartbeat periodic update (setInterval 15s)
- Fallback .result file on worker exit
- Review archive/ fallback — cleanup sonrası task'lar hala erişilebilir
- Scope parser explicit `Files:` / `Scope:` label parsing

### Fixed

- **BUG-3**: Claude CLI spawn ENOENT on Windows — `shell: true` 7 dosyada
- **BUG-4,12**: Worker rules hardcoded tsc/vitest → stack-aware komutlar
- **BUG-6**: Stack detection sadece --auto'da çalışıyordu → her zaman çalışır
- **BUG-7**: Doctor FAIL+OK çelişkisi → optional provider'lar SKIP olarak gösterilir
- **BUG-8**: Python projede framework `next` algılanıyordu → dil guard eklendi
- **BUG-9**: IDENTITY.md dangling reference → workspace IDENTITY.md oluşturuluyor
- **BUG-10**: DECKENT.md `Build: tsc` Python projede → empty string falsy fix
- **BUG-11**: DIRECTIVES.md boş placeholder → stack-aware örnek task şablonu
- **BUG-13**: Brain rules yanlış limitler → 200→300, 600→900
- **BUG-14**: TempAgent "mixed" dilde oluşturulmuyor → detectedLanguages eşleşme
- **BUG-15**: BOOT.md kullanıcı ipucu yok → TR/EN kullanıcı-dostu
- **BUG-16**: `ps -o` Windows'ta hata → platform guard
- **BUG-19**: UTF-8 encoding Windows → LANG + PYTHONIOENCODING env vars
- **BUG-21**: Doctor healthScore=0 tüm check passed → `c.ok` → `c.passed`
- **BUG-22**: Review "No tasks found" → archive/ fallback
- **BUG-23**: Heartbeat 28x stale → periodic update
- **BUG-24**: Worker .result yazmıyor → fallback on exit
- **BUG-25**: Scope parser Files/Scope ignorluyor → explicit parsing
- **BUG-26**: Task log boş Windows → closeSync child exit handler

### Changed

- Version bump: 0.2.0-beta.1 → 0.2.0-beta.3
- Worker prompt: hardcoded `tsc --noEmit`/`npx vitest run` kaldırıldı → DECKENT.md referansı
- allowedTools: `Edit`, `Glob`, `Grep` worker tool'larına eklendi
- FullStackResult: `detectedLanguages` field eklendi

_Sprint 070: 8 tasks, 8 done, 15 bug fix. Sprint 071: 8 tasks, 8 done, 7 bug fix. 0 regression._

---

## [0.2.0-beta.1-sprint69] - 2026-03-27

### Added

- Skill Stats Tracking — uses/successRate/avgCoverage
- Outcome-Based Ogrenme Guclendirme — Agent/Skill Bonus

### Changed

- Agent Secim Hassasiyeti — test-writer Exclude + Intent Weights (completed with tech debt)
- Skill Secim Butcesi — Dinamik maxTokens + Priority (completed with tech debt)


_Tasks: 6 total, 4 done, 2 tech debt, 2 no-go_

## [0.2.0-beta.1-sprint68] - 2026-03-26

### Added

- DECKENT.md AI-Native Rehber Genisletme
- deckent init Multi-Ortam Adapter
- V2 Routing E2E Dogrulama Testi

### Changed

- MCP Server Instructions — AI System Prompt Injection (completed with tech debt)
- Tool Descriptions + Annotations Zenginlestirme (completed with tech debt)
- deckent_help Tool — Runtime Capabilities + State (completed with tech debt)


_Tasks: 6 total, 6 done, 3 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint67] - 2026-03-26

### Added

- Job State Sprint Sonuçları — finalizeSprint → job file

### Changed

- Fix debt: Tech debt from 064-004-fix: Added 11 targeted tests to tests/cli/helpers/output. (completed with tech debt)
- Retro Detay Zenginlestirme — Worker Notes Aktarimi (completed with tech debt)
- any Kullanimi Temizligi — 10 Adet, 7 Dosya (completed with tech debt)
- V2 Routing Dogrulama — Audit + IDENTITY Guncelleme (completed with tech debt)


_Tasks: 6 total, 5 done, 4 tech debt, 1 no-go_

## [0.2.0-beta.1-sprint66] - 2026-03-26

### Added

- Phantom Modüller — prompt-token-optimizer + ecosystem-intelligence
- PlannerTask Interface + enrichScope + api-surface Contract
- Stale Heartbeat Root Cause + Config routing_engine Validation
- V1+V2 Paralel Dogrulama + decision-engine Analizi

### Changed

- Manifest v2 Batch Update — 20 Dosya (completed with tech debt)
- MCP Dokumantasyon Tutarlilik — 16 Tool + 9 Resource (completed with tech debt)
- Housekeeping — gitignore + IDENTITY Sayilari (completed with tech debt)


_Tasks: 7 total, 7 done, 3 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint65] - 2026-03-26

### Added

- history Trend + retro Archive

### Changed

- plan — AI Planner Timeout Configurable (completed with tech debt)
- config — autoMigrateOnLoad + Modes Nesting (completed with tech debt)
- cleanup — Çift Geçiş, Sahte Sprint, destroy Session, .gitignore (completed with tech debt)
- spawn — Scope Enforcement + Multi-Provider (completed with tech debt)
- analyze — Wrapper Birleştirme + Monorepo (completed with tech debt)
- Dokümantasyon — CHANGELOG/SPRINT-LOG Restore + cli-deep-analysis Final (completed with tech debt)


_Tasks: 7 total, 7 done, 6 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint64] - 2026-03-26

### Added

- No completed tasks


_Tasks: 14 total, 0 done, 0 tech debt, 14 no-go_

## [0.2.0-beta.1-sprint62] - 2026-03-26

### Added

- ci-guardian Agent Tanımı + PROMPT.md
- beforeSprint Hook — Pre-Sprint CI Validation
- afterTask Hook — Task-Level Regression Detection
- afterSprint Hook — Sprint CI Raporu
- CI Learning — Sprint-to-Sprint Öğrenme

### Changed

- ci-testing Skill Tanımı + SKILL.md (completed with tech debt)
- CI Dashboard Entegrasyonu (completed with tech debt)
- GitHub Actions Workflow İyileştirme (completed with tech debt)


_Tasks: 8 total, 8 done, 3 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint61] - 2026-03-26

### Added

- Plan Standalone Provider Bootstrap (P0)

### Changed

- Agent List Display Fix + History Agent Column (P1) (completed with tech debt)
- Brain Budget Decay + Memory Temizliği (P0) (completed with tech debt)
- Open Debt Cleanup (debt-059-008-fix) (P1) (completed with tech debt)
- Framework Detection + Analyzer Fix (P2) (completed with tech debt)
- Remaining CLI Polish (completed with tech debt)

### Fixed

- Agent Assignment Persistence Fix (P0 CRITICAL)
- Agent Stats Update Fix (P0 CRITICAL)


_Tasks: 8 total, 8 done, 5 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint60] - 2026-03-26


### Changed

- CLI Komut + Flag Doğrulama (completed with tech debt)
- Agent Pool + Skill Pool Doğrulama (completed with tech debt)
- MCP Tool + Resource Doğrulama (completed with tech debt)
- Sprint Lifecycle + Format Tutarlılık Doğrulama (completed with tech debt)
- Doctor + Config + Provider Doğrulama (completed with tech debt)

### Fixed

- Fix debt: Tech debt from 057-012-fix: All agent/skill/plugin/marketplace/archive-debt impr


_Tasks: 6 total, 6 done, 5 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint59] - 2026-03-25


### Changed

- cli-deep-analysis.md Full [DONE] Marking + Doğrulama (completed with tech debt)
- Prompt Boilerplate Azaltma + Worker Guide (completed with tech debt)
- spawn+kill+run Multi-Provider Desteği (completed with tech debt)
- doctor+watch Provider-Aware Fix (completed with tech debt)
- MCP Resources Expansion (+4 resources) (completed with tech debt)
- MCP Tool Quality — Enrichment + Error Handling (completed with tech debt)
- Format Tutarlılığı + Dead Code Temizliği (completed with tech debt)
- Sync Genişleme (Gemini/Cursor/Codex Adapters) (completed with tech debt)
- Doc Updater Fix + CHANGELOG Konsolidasyonu (completed with tech debt)

### Fixed

- Agent Activation Fix — forceModel Agent Bypass Kaldır
- Skill Selection Fix — Task-Specific Seçim + Truncation
- Scope & GO/NO-GO Fix — filesWrite + Criteria Enrichment


_Tasks: 13 total, 12 done, 9 tech debt, 1 no-go_

## [0.2.0-beta.1-sprint58] - 2026-03-25

### Added

- agent+skill+plugin+marketplace+archive-debt Completeness
- dashboard+attach+watch+cross-cutting


_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint57] - 2026-03-25

### Added

- status Overhaul — Standalone, ETA, NO_COLOR, fs.watch, Verbose
- retro+explain Quality — Dil, Trend, Agent/Skill Perf, Learnings
- usage Overhaul — Real Tokens, Race Condition, Live Usage, Filters
- history Overhaul — --json, --last, Agent/Skill, Dead Code, Format
- config Quality — list/keys, autoMigrate, Validation, Comment, Env Var
- review+finalize Overhaul — Interactive, Retry, Guard, Duplicate
- serve Security — Rate Limit, Body Size, DeepMerge, Auth, Versioning

### Changed

- doctor Improvements — tmux Conditional, .deck Check, Auth, Hints (completed with tech debt)
- cleanup+decay Overhaul — Auto Decay, Combo, Lock Guard, Archive (completed with tech debt)
- run+test+web Flags — Timeout, Keep, Sandbox, CI, MIME (completed with tech debt)
- sync+onboard+upgrade Polish (completed with tech debt)


_Tasks: 13 total, 11 done, 4 tech debt, 2 no-go_

## [0.2.0-beta.1-sprint56] - 2026-03-25

### Added

- init UX — Auto Lang, Recommendation, Re-init, Error Recovery

### Changed

- Doc Updater Referans Fix + CHANGELOG Konsolidasyonu (completed with tech debt)
- init Bug Fix — deepMerge + .deck Security + Provider Wizard (completed with tech debt)
- plan Core — Async Usage, Dry-Run, Idempotency, Safeguard (completed with tech debt)
- plan Quality — Parser, i18n, Context Priority, Error Logging (completed with tech debt)
- start Core — Wait Timeout, Spawn Retry, Zero-Config, Phase Persistence (completed with tech debt)
- start Quality — Provider Cache, Dashboard Usage, Cleanup Finally, --watch Alt (completed with tech debt)


_Tasks: 20 total, 7 done, 7 tech debt, 13 no-go_

## [0.2.0-beta.1-sprint55] - 2026-03-25

### Fixed

- Retro Parse/Write Format Uyumsuzluğu Fix + --compare Bug (P0 KRİTİK)
- Kill Komutu Task Status + Lock Temizliği + --all Flag (P0 KRİTİK)

### Changed

- readLanguage + readJsonSafe Tam DRY Temizliği (completed with tech debt)
- Config Set Nested Key + Import DeepMerge + Config Get (completed with tech debt)
- Spawn Komutu Prompt Zenginleştirme + Status Kontrolü (completed with tech debt)
- Doctor --json + Retro --json Flag'leri (completed with tech debt)
- Cleanup --dry-run Flag'i (completed with tech debt)
- Agent Delete + Edit Komutları (completed with tech debt)
- Skill Enable/Disable + Delete Komutları (completed with tech debt)
- Explain --sprint Flag + Goal Bilgisi + Dil Desteği (completed with tech debt)


_Tasks: 10 total, 10 done, 10 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint54] - 2026-03-25

### Changed

- Agent Activation — systemPrompt + Worker Injection (completed with tech debt)
- Brain Self-Learning — Config Suggestions + Pattern Detection (completed with tech debt)
- Rich Sprint Output + README Update (completed with tech debt)
- docs/ Reorganization + .claude/rules/ Update (completed with tech debt)

_Tasks: 4 total, 4 done, 4 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint53] - 2026-03-25

### Added

- Skill Injection — 10 Skill'i Worker'lara Inject Et

### Changed

- Self-Healing Bootstrap — Auto-Migration on Startup (completed with tech debt)


_Tasks: 8 total, 2 done, 1 tech debt, 6 no-go_

## [0.2.0-beta.1-sprint52] - 2026-03-25


### Changed

- Dashboard Full Expansion (completed with tech debt)


_Tasks: 1 total, 1 done, 1 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint51] - 2026-03-25

### Added

- Getting Started Guide

### Changed

- Full Config Expansion (completed with tech debt)
- Config Documentation (Inline Comments) (completed with tech debt)
- Dashboard Config Editor (completed with tech debt)
- VitePress Setup (completed with tech debt)
- CLI Reference (Auto-Generated) (completed with tech debt)
- Config Migration Helper (completed with tech debt)
- Deploy Configuration (completed with tech debt)


_Tasks: 8 total, 8 done, 7 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint50] - 2026-03-25


### Changed

- npm Publish Dry Run & Fix (completed with tech debt)
- README.md Overhaul (completed with tech debt)
- bin Entry Validation (completed with tech debt)
- CHANGELOG.md Update (completed with tech debt)
- npm Publish Pipeline Validation (completed with tech debt)


_Tasks: 5 total, 5 done, 5 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint48] - 2026-03-24

### Added

- Doc-Only Task Verify Skip

### Changed

- Claude MCP Backend Stub Completion (completed with tech debt)
- Sandbox Mode Graceful Handling (completed with tech debt)
- API Mode Usage Integration (completed with tech debt)
- Subprocess Worker Log Enhancement (completed with tech debt)
- Coverage Metric Preservation (completed with tech debt)
- Blueprint Section Numbers Update (completed with tech debt)
- RELEASE-NOTES-BETA.md Final Update (completed with tech debt)


_Tasks: 8 total, 8 done, 7 tech debt, 0 no-go_

## [0.2.0-beta.1-sprint47] - 2026-03-24

### Added

- No completed tasks


_Tasks: 10 total, 0 done, 0 tech debt, 10 no-go_

## [0.2.0-beta.1-sprint46] - 2026-03-24

### Added

- Rich Output Integration into finalizeSprint

### Changed

- Router Integration into Sprint Lifecycle (completed with tech debt)
- Codex Adapter — Real CLI Integration (completed with tech debt)
- Claude Adapter — MCP Server Mode Option (completed with tech debt)
- .deck Secret Loading in Provider Auth (completed with tech debt)
- Provider Health in deckent doctor (completed with tech debt)
- Environment-Aware deckent init (completed with tech debt)
- Sprint 044 Module Smoke Tests (completed with tech debt)


_Tasks: 10 total, 8 done, 7 tech debt, 2 no-go_

## [0.1.0-sprint42] - 2026-03-23


### Changed

- npm Publish Validation (completed with tech debt)
- Global Install E2E Test (completed with tech debt)
- Provider Adapter Smoke Tests (completed with tech debt)


_Tasks: 8 total, 3 done, 3 tech debt, 5 no-go_

## [0.2.0-beta.1] — 2026-03-23 (Stabilization — Beta Ready)

### Added
- **CHANGELOG**: Sprint 035-042 entries in semver format
- **RELEASE-NOTES-BETA.md**: Beta release notes with features, metrics, getting started, known limitations, and roadmap
- **npm Publish Validation**: `scripts/validate-publish.ts` and `npm run validate:publish` for automated publish checks
- **E2E Tests**: Global install flow and first-sprint journey tests (`tests/e2e/`)
- **Provider Smoke Tests**: Adapter smoke tests for Claude, Codex, and Gemini without real API calls

### Changed
- Version bumped from 0.1.0 to 0.2.0-beta.1
- All open tech debt items closed or documented in DECISIONS.md
- Documentation final review pass (README, QUICKSTART, CONFIG-REFERENCE, CONTRIBUTING)

### Fixed
- Test suite stabilized: 0 failures on Linux/WSL
- All flaky tests resolved (timing, concurrency, platform-specific)

_Sprint 042: Stabilization — Beta Ready_

## [0.1.0-sprint041] — 2026-03-23 (Human-Friendly Output Complete)

### Added
- **Dashboard SprintSummary**: Human-friendly SprintSummary component for web dashboard
- **CLI Doctor Enhancement**: Human-friendly health check output with categorized results
- **RETRO Enhancement**: Human-readable retrospective format with comparison metrics
- **Error Messages**: Human-context error messages with suggestions and fix hints
- **Worker Logs**: Human-readable progress output for worker execution logs

### Changed
- MCP tool responses reformatted to human-friendly format (with tech debt)

### Fixed
- debugLog() helper function tech debt from Sprint 033 resolved

_Tasks: 7 total, 7 done, 1 tech debt, 0 no-go | Coverage: 94.3%_

## [0.1.0-sprint040] — 2026-03-23 (Worker Feedback Loop + Human-Friendly Output)

### Added
- **Worker Verify Loop**: Internal tsc and test verification within worker execution
- **Worker Feedback Metrics**: Worker self-assessment metrics collection
- **Human-Friendly Sprint Complete**: Colored, categorized sprint completion output
- **Human-Friendly Init Wizard**: Interactive init wizard with guided setup

### Changed
- CLI status output reformatted to human-friendly format (with tech debt)

### Fixed
- Worker prompt overhaul: human-readable instructions and agent/skill injection fix

_Tasks: 13 total, 7 done, 1 tech debt, 6 no-go | Coverage: 92.1%_

## [0.1.0-sprint039] — 2026-03-22 (Provider Fixes)

### Fixed
- **Codex Adapter**: Real CLI integration fix for Codex provider adapter

_Tasks: 19 total, 1 done, 0 tech debt, 18 no-go | Coverage: 95.0%_

## [0.1.0-sprint038] — 2026-03-22 (Multi-Provider Infrastructure)

### Added
- **ModelType Extended**: 8 model variants across 3 providers (Claude, Codex, Gemini)
- **Codex Adapter**: OpenAI Codex provider adapter with usage tracking
- **Gemini Adapter**: Google Gemini provider adapter with usage tracking
- **Provider-Aware Model Selection**: model-selector.ts routes across all 3 providers
- **spawnWorkers Routing**: Worker spawn routing based on provider/model assignment
- **Planner Decoupling**: planner.ts decoupled from tmux/subprocess specifics
- **tmux Decoupling**: tmux.ts platform abstraction layer
- **Subprocess Decoupling**: subprocess backend abstraction improvements
- **CLI Entrypoint Fix**: Side-effect-free entrypoint via buildProgram() + entry.ts
- **Platform Support Matrix**: macOS/Linux/WSL2 support matrix documented
- **bootstrapProviders()**: Single startup point for provider detection and registration

### Changed
- ModelType enum extended with Codex and Gemini model variants
- ProviderRegistry supports dynamic provider registration
- Config supports per-provider API key and endpoint configuration

_Tasks: 20 total, 20 done, 0 tech debt, 0 no-go — +476 tests (8073 → 8555)_

## [0.1.0-sprint037] — 2026-03-22 (Security, Performance, Plugin System)

### Added
- **Timing-Safe Auth**: Constant-time comparison for authentication tokens (SHA-256 hash)
- **Credential Redaction**: Automatic redaction of API keys, Bearer tokens, and URL passwords from logs
- **Skill Sandbox AST**: TypeScript compiler API second-pass for eval/Function/child_process detection
- **DIRECTIVES Validation**: Zod schema validation (DirectiveSchema + DirectiveTaskSchema) before task creation
- **Plugin System**: Full install lifecycle (npm/git/local + rollback), runtime hooks (beforeSprint/afterTask/afterSprint)
- **PROJECT-IDENTITY.md**: Permanent project identity file, never decayed, updated every sprint
- **finalizeSprint()**: Dedicated sprint finalization function + `deckent finalize` CLI command
- **Config Mode Aliases**: performance/balanced/economic/unlimited mapped to canonical mode names

### Changed
- Memory budget increased from 300 to 600 lines
- Decay threshold extended from 3 to 5 sprints
- RETRO max lines increased from 60 to 100
- Sprint log max lines increased from 50 to 80
- Agent pool uses LRU eviction (max 50 temp, 5 sprint age) with batch read

_Tasks: 16 total, 16 done, 0 tech debt, 0 no-go — +258 tests (7815 → 8073)_

## [0.1.0-sprint036] — 2026-03-22 (Architectural Cleanup)

### Added
- **sprint-controller.ts**: Sprint lifecycle management extracted from brain.ts
- **result-evaluator.ts**: Task result evaluation logic extracted from brain.ts
- **usage-manager.ts**: Usage tracking and budget management extracted from brain.ts
- **Type Modules**: types.ts split into task-types, config-types, monitoring-types, sprint-types + barrel

### Changed
- **brain.ts God Object Split**: 1312 → 58 lines, now a pure re-export layer with backward compatibility
- **spawn-backend.ts**: Moved from core/ to orchestra/ (layer violation fix)
- **Non-null Assertions**: 48 `!` operators replaced with guard clauses, `.at()`, and `?? fallback` across 29 files
- **Type Casts**: Replaced with enum literals (`TaskStatus.DONE`) and type guards
- **Barrel Cleanup**: orchestra/index.ts reduced from 30+ to 22 public API exports with @internal JSDoc
- **Auditor Queue**: shift() O(n) replaced with descending sort + pop() O(1)
- **PromptAnalytics**: prompt-metrics + prompt-ab-test unified into single class

_Tasks: 11 total, 11 done, 0 tech debt, 0 no-go — +315 tests_

## [0.1.0-sprint035] — 2026-03-22 (Beta Cleanup Wave 1+2)

### Added
- **readJsonSafeAsync()**: Async variant of readJsonSafe for non-blocking JSON file reads
- **Utility Extraction**: readFileIfExists, listFilesWithExtension, safeMapGet moved to utils.ts
- **Error Registry Expansion**: Error codes E039-E053 with fix suggestions

### Changed
- **readJsonSafe Migration**: 13 inline JSON.parse calls replaced with readJsonSafe()
- **Error Handling Unification**: 11 generic throw statements replaced with DeckentError + ErrorRegistry
- **Silent Catch Logging**: debugLog() helper with DECKENT_DEBUG env gate across 8 catch blocks
- **parseBody Type Safety**: 5 Zod schemas (Start/Plan/Directives/Config/Kill) + parseBodyWithSchema()
- **EventEmitter Fix**: Dedicated _ipcEmitter with setMaxListeners(0), removed process EventEmitter usage

### Fixed
- **tmux Worker Crash Recovery**: Agent-based subprocess fallback for crashed tmux workers

_Sprint 035: Beta Cleanup Wave 1+2_

## [0.1.0-sprint33] - 2026-03-22

### Added

- CHANGELOG Version Format
- SECURITY.md Location
- PR Template Deckent-Specific
- FUNDING.yml Update
- Utility Function Extraction

### Changed

- EventEmitter MaxListeners Fix (completed with tech debt)
- Onboard Test Timeout Fix (completed with tech debt)
- README Badge Update (completed with tech debt)
- File Extension Constant Usage (completed with tech debt)
- Sprint Observation Docs Archive (completed with tech debt)
- CI Coverage Gate (completed with tech debt)
- parseBody Type Safety (completed with tech debt)

### Fixed

- CI Workflow Test Fix — publish
- CI Workflow Test Fix — release


_Tasks: 17 total, 14 done, 7 tech debt, 3 no-go_

## [0.1.0-sprint33] — 2026-03-22 (Integration + Marketplace + Analytics)

### Added
- **Integration Tests**: Full agent+skill E2E, TypeScript/React project, Python/FastAPI project, monorepo, error recovery
- **Skill Marketplace**: Registry client (search/detail/publish), CLI search+publish, rating system, dependency resolver, marketplace auth
- **Adaptive Agent Advanced**: Cross-sprint analyzer, specialization drift detector, agent retirement, prompt evolution log, agent genealogy
- **Analytics Data**: Sprint analytics, usage graphs, success charts, agent comparison, skill heatmap data
- **Performance**: Agent selection cache (LRU 100), skill loading cache (500KB), token counter, lazy loader, batch stats
- **Security**: Skill sandbox (quarantine suspicious skills), permission guard (block agent self-modification)
- **Documentation**: AGENT-GUIDE.md, MARKETPLACE-GUIDE.md

### Changed
- package.json: +4 keywords (agents, skills, marketplace, analytics)

## [0.1.0-sprint32] — 2026-03-22 (UX Polish)

### Added
- **Progress System**: Live progress bar, ETA calculator (weighted average), worker status tracker, queue display, terminal width adaptation
- **Rich Sprint Summary**: Categorized file changes, agent performance table, recommendation engine (max 5), sprint comparison with delta
- **Notification System**: Terminal bell, webhook (POST+retry), Discord embeds (color-coded), Slack Block Kit
- **Interactive Review**: `deckent review` command — approve/reject/retry per task, --auto mode, review reports
- **Selective Retry**: Queue failed tasks for next sprint, generate retry directives
- **Theme System**: Consistent colors (success/error/warning/info/muted/accent), NO_COLOR/FORCE_COLOR support
- **Output Modes**: --quiet (errors only), --verbose (debug), --normal (default)
- **Progress Persistence**: Save/load progress state for reconnect

### Changed
- Dashboard: skills column added, agent visibility improved
- Status command: agent/skill assignment sections, --verbose flag
- Retro command: rich format default, --raw for original, --compare for delta
- History command: --agent and --skill filters
- MCP status: agentAssignments + skillAssignments in response
- types.ts: notifications config on DeckentConfig

## [0.1.0-sprint31] — 2026-03-22 (Brain Decision Engine)

### Added
- **Decision Engine**: 6-step pipeline (analyze -> agent -> skill -> model -> effort -> scope)
- **Task Analyzer**: Infers task type (code/test/doc/security/refactor/devops/config), complexity scoring
- **Decision Logger**: Persist decisions to .tasks/decisions/ for debugging and replay
- **Decision Replay**: Re-run decisions with same inputs, diff comparison
- **Learning Loop**: PatternRecorder/PatternReader — record agent+skill+model evaluations per sprint
- **Combination Scorer**: Score historical combos (success*2 - fail*3 - recency penalty)
- **Learning Decay**: Remove old learning data, compact to summary
- **Learning Migration**: Convert PATTERNS.md to learning format, export/import
- **Parallel Pipeline**: Topological sort into dependency-aware execution waves
- **Shared Memory**: Key-value inter-worker communication with TTL
- **Conflict Resolver**: Detect same-file-write/scope-overlap, resolution strategies
- **Result Merger**: Combine worker results (deduplicate, weighted coverage)
- **Handoff Protocol**: Artifact handoffs between dependent tasks
- **Adaptive Agent**: Prompt effectiveness analysis, improvement suggestions
- **Prompt A/B Testing**: Compare prompt variants (min 4 samples, 50/50 split)
- **Prompt Versioning**: Max 10 versions with activate/prune
- **Prompt Rollback**: Auto-rollback bad prompts (<50% success after 3 uses)
- **Prompt Metrics**: Performance dashboard (trend, best/worst version)
- **Brain Context**: Stack/agent/skill/history enrichment for planning
- **Decision Config**: DecisionEngineConfig, LearningConfig, CollaborationConfig

### Changed
- types.ts: decision_engine, learning, collaboration config fields on DeckentConfig
## [0.1.0-sprint30] - 2026-03-21

### Added

- **Fix debt: Tech debt from 027-003: Verification report written to tmp-test/rollback-verify.**: DONE
- **Fix debt: Tech debt from 027-004: Comprehensive verification report written to tmp-test/ip**: DONE
- **Subprocess Backend Verification**: GO_WITH_TECH_DEBT
- **No-Tmux Verification**: GO_WITH_TECH_DEBT
- **Provider Abstraction Analysis**: GO_WITH_TECH_DEBT
- **Sprint 27 Feature Summary**: GO_WITH_TECH_DEBT
- **Tasks**: 6 total, 6 done, 4 tech debt, 0 no-go
## [0.1.0-sprint30] — 2026-03-22 (Skill System)

### Added
- **Skill Type System**: SkillDefinition, ProjectStack, SkillSelectionResult, SkillCategory types
- **Skill Pool Manager**: Load, save, validate, stats tracking from .deckent/skills/
- **Stack Detector**: Auto-detect project technology (TypeScript/React/Python/Rust/Go/Docker) with cache
- **Skill Selector**: Multi-factor scoring (stack+keyword+agent), composition resolver, max 3 skills
- **Skill Registry**: Local skill index foundation for future marketplace
- **10 Built-in Skills**: typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer
- **CLI Commands**: `deckent skill list`, `deckent skill create`, `deckent skill install`
- **Skill Documentation**: docs/SKILLS.md

### Changed
- brain.ts planSprint (now async): auto-detects project stack, selects skills per task
- task-builder.ts buildWorkerPrompt: injects SKILL.md content (1500 char/skill, 4000 total cap)
- model-selector.ts: Layer 4d skill model preference (highest among skills wins)
- sprint-reporter.ts: skill performance table in RETRO.md
- config.ts: skills config (enabled, maxPerTask, autoDetectStack, preferredSkills)
- types.ts: assignedSkills on Task, skillIds on TaskResult, SkillConfig on DeckentConfig

## [0.1.0-sprint29] — 2026-03-22 (Agent Pool Core)

### Added
- **Agent Type System**: AgentDefinition interface, AgentPool, AgentSelectionResult types
- **Agent Pool Manager**: Load, save, validate, stats tracking, temp agent lifecycle
- **Agent Selector**: Keyword+scope scoring algorithm, threshold filtering, tie-break by success rate
- **8 Built-in Agents**: security-auditor (opus), test-writer (sonnet), doc-writer (sonnet), code-reviewer (opus, read-only), refactorer (sonnet), bug-fixer (opus, 1.5x effort), api-builder (sonnet), performance-analyzer (opus)
- **Shared Context**: Inter-agent communication via .tasks/shared-context.json (atomic writes)
- **Multi-Agent Pipeline**: Sequential agent execution with shared context propagation
- **CLI Commands**: `deckent agent list`, `deckent agent create`, `deckent agent enable/disable`
- **Agent Documentation**: docs/AGENTS.md with 8 sections

### Changed
- brain.ts planSprint: auto-selects specialized agent per task based on keywords and scope
- task-builder.ts buildWorkerPrompt: injects agent PROMPT.md before task content (2000 char limit)
- worker.ts: agent ID included in heartbeat and result files
- sprint-reporter.ts: agent performance table in RETRO.md
- Dashboard: agent column with color coding (cyan=specialized, dim=generic)
- types.ts: assignedAgent on Task, agentId on TaskResult/Heartbeat/AgentInfo
## [0.1.0-sprint28] — 2026-03-21 (npm Publish Prep)

### Added
- **Error Registry**: DeckentError class + ErrorRegistry with 10 error codes and fix suggestions
- **Telemetry Infrastructure**: TelemetryCollector (opt-in, PII sanitization, GDPR-ready)
- **TUI Wizard Framework**: WizardStep interface (select/input/confirm) for interactive CLI
- **Error Handler**: Centralized CLI error handling with colored output and suggestions
- **Version Info**: Enhanced `--version` with Node.js, OS, tmux, claude status + `--version-json`
- **Publish Scripts**: prepublish.ts, build-verify.ts, pack-test.ts, publish.ts
- **.npmignore**: Excludes .brain/, .tasks/, .locks/, tests/, src/ from npm package
- **SECURITY.md**: Security policy with vulnerability reporting process
- **RELEASE-CHECKLIST.md**: 11-step release checklist
- **Landing Page Content**: Marketing content for deckent.agency

### Changed
- **onboard command**: Stub replaced with interactive wizard (Claude detection, system profile, config recommendation)
- **upgrade command**: Stub replaced with real npm update (version check, --check flag)
- **README.md**: Complete English rewrite with badges, comparison table, architecture diagram
- **CONTRIBUTING.md**: English update with dev guides (add CLI command, add MCP tool)
- **docs/QUICKSTART.md, API.md, CONFIG-REFERENCE.md**: English polish with curl examples
- **doctor.ts**: Enhanced error messages with platform-specific install suggestions
- **Changelog updater**: Keep a Changelog format (Added/Changed/Fixed categories)
- **Doctor output**: Traffic light format [PASS]/[FAIL]/[WARN] with colors

### Fixed
- brain.test.ts changelog format expectations updated for Keep a Changelog
- Doctor test expectations updated for [PASS]/[FAIL] format
- Onboard test updated for real implementation output

## [0.1.0-sprint27] — 2026-03-21 (Technical Gap Closure)

### Added
- **Provider Abstraction**: ProviderAdapter interface, ProviderRegistry singleton, ClaudeAdapter
- **SpawnBackend Abstraction**: TmuxBackend, SubprocessBackend, SpawnBackendFactory (config-driven)
- **Subprocess Backend**: Workers via child_process.spawn — tmux no longer required
- **Usage Tracking**: UsageTracker class with sprint-based JSON storage in .deckent/usage/
- **Coverage Validation**: parseCoverageFromVitest, validateCoverage with 5% threshold
- **Rollback Mechanism**: Git safety points (deckent-backup-{sprintId}), auto-rollback on all NO_GO
- **Worker IPC**: WorkerChannel + ChannelRegistry for process.send-based communication
- **Zero-Config Mode**: `deckent start "description"` — single-line natural language sprint
- **Sandbox Foundation**: SandboxSpawnBackend with memory limits and scope enforcement
- **Global Config**: ~/.deckent/config.json with project merge (project takes priority)
- **Credentials Management**: Secure key storage in ~/.deckent/credentials/ (0600 permissions)
- 13 new source modules, 167 new tests (3442 → 3609)

### Changed
- brain.ts reads config.spawn_backend and uses SpawnBackendFactory.create()
- evaluateResult integrates coverage validation (doc tasks skip)
- spawnWorkers supports SpawnBackend abstraction (backward compatible)
- tmux is now optional — subprocess backend available for non-tmux environments

### Fixed
- brain-ipc.test.ts task ID mismatch in channel registration
- brain-usage.test.ts OOM — removed heavy runSprint integration, kept unit tests
- ESM require() → direct import in spawn-backend.ts (TmuxBackend + SubprocessBackend)
## [0.1.0-sprint26] - 2026-03-20

### Added

- **readJsonSafe Import Migration Tamamlama**: GO_WITH_TECH_DEBT
- **package.json files + keywords Tamamlama**: GO_WITH_TECH_DEBT
- **CODEOWNERS İyileştirme**: DONE
- **dependabot.yml İyileştirme**: DONE
- **Release Workflow İyileştirme**: DONE
- **Security Template + FUNDING.yml İyileştirme**: DONE
- **debt-manager.test.ts Test Tamamlama**: DONE
- **task-builder.test.ts Test Tamamlama**: GO_WITH_TECH_DEBT
- **CLI init.test.ts Test Tamamlama**: DONE
- **CLI archive-debt.test.ts Test Tamamlama**: DONE
- **Tasks**: 35 total, 35 done, 16 tech debt, 0 no-go
## [0.1.0-sprint25] - 2026-03-20

### Added

- **readJsonSafe/readFileSafe Shared Utility**: DONE
- **result-watcher pendingResolve Timer Fix**: DONE
- **package.json files Field Düzeltme**: GO_WITH_TECH_DEBT
- **CODEOWNERS Dosyası**: GO_WITH_TECH_DEBT
- **dependabot.yml**: GO_WITH_TECH_DEBT
- **GitHub Actions Release Workflow**: GO_WITH_TECH_DEBT
- **Security Issue Template**: GO_WITH_TECH_DEBT
- **FUNDING.yml**: GO_WITH_TECH_DEBT
- **brain.ts readJsonSafe Import Migration**: GO_WITH_TECH_DEBT
- **debt-manager.ts readJsonSafe Import Migration**: GO_WITH_TECH_DEBT
- **Tasks**: 97 total, 62 done, 32 tech debt, 35 no-go
## [0.1.0-sprint23] - 2026-03-18

### Fixed

- **AI planner post-validation fallback**: AI planner eksik görev döndürürse (`plannerResult.tasks.length < directiveTaskCount`) structured fallback'e düşüyor — ilk kez 12/12 görev planlandı
- **CI hardcoded path fix**: `tools-enrichment-batch2.test.ts` absolute path → `__dirname` bazlı relative path

### Added

- 12 task (12 done, 4 tech debt, 0 no-go) — ilk 12-görevli sprint, task queue wave mekanizması doğrulandı
- 11 doğrulama dokümanı (`tmp-test/`): Sprint 22 özelliklerinin kapsamlı validasyonu
- +30 test (1392→1422), 55 test dosyası
- Planning mode: `fallback` (AI yetersiz → structured fallback)

## [0.1.0-sprint22] - 2026-03-18

### Fixed

- **runDecay DEBT.md resolved retention**: `shouldRemoveResolvedDebt()` + `parseSprintNumber()` — resolved entry'ler 3 sprint boyunca korunuyor (DEBT-002 artık decay'de silinmiyor)

### Added

- **Auto Setup Wizard** (`src/cli/auto-setup.ts`): `generateSetupRecommendation()` — subscription, sistem profili ve proje boyutuna göre otomatik yapılandırma önerisi
- **MCP Enrichment** (10/10 tool): `enrichResponse()` altyapısı (`src/mcp/helpers/enrich.ts`) — tüm tool response'larına `_enriched: { summary, hints, timestamp }` ekleniyor
- **CLI Hints System** (`src/cli/helpers/hints.ts`, `messages.ts`): `getContextualHints()` faz bazlı öneriler, `getMessage()` lokalize mesajlar (tr/en)
- **doctor --profile**: Sistem profili gösterimi (CPU, RAM, recommended workers, subscription)
- `SetupRecommendation` interface (`types.ts`)
- +132 test (1260→1392), 0 regresyon

## [0.1.0-sprint21] - 2026-03-18

### Added

- **System Profile** (`src/core/system-profile.ts`): `getSystemProfile()` — CPU, RAM, recommended workers tespiti
- **Subscription Detection** (`src/core/subscription.ts`): `detectSubscription()` — Claude plan tespiti (max_20x/max_5x/pro/api/unknown)
- **Layered Model Selection** (`src/orchestra/brain.ts`): `resolveTaskModel()` — scope, complexity, plan, usage'a göre katmanlı model seçimi (opus/sonnet/haiku)
- **Auto Workers**: `resolveEffectiveWorkers()` — config "auto" ise sistem profiline göre worker sayısı
- **deckent test** CLI: `npx vitest run` wrapper
- **deckent run** CLI: Arbitrary komut çalıştırma
- **Planner task queue fix**: `planSprint` artık max_workers'dan bağımsız tüm görevleri planlıyor (spawnWorkers parallelism sınırını uygular)
- +137 test (1123→1260), 28 CLI komut, 0 regresyon

## [0.1.0-sprint20] - 2026-03-18

### Added

- **Fix validation sprint**: Sprint 18'de keşfedilen 6 bug'ın 3'ü doğrulandı
  - Heartbeat timestamp: PASSED (0 stale alert)
  - Dashboard progress: PASSED (done counter doğru)
  - Alert dedup: PASSED (0 duplicate alert)
  - Task queue: FAILED (planner hala max_workers ile sınırlı — Sprint 21'de düzeltildi)
  - Doc task criteria: PARTIAL
  - Model inference: doğrulanamadı
- 6 analiz dokümanı (`tmp-test/`): sistematik fix doğrulama
- 8/14 görev planlandı ve çalıştırıldı (113s)
- 1027 test (doğrulama sprint'i — yeni test yok), 0 regresyon

## [0.1.0-sprint19] - 2026-03-18

### Fixed

- **Heartbeat timestamp**: Worker heartbeat'te doğru UTC zaman damgası — stale agent false positive düzeltildi
- **Dashboard progress**: Done counter `.result` dosyaları oluşunca güncelleniyor (EVALUATE fazını beklemiyor)
- **Alert deduplication**: Aynı alert aynı scan döngüsünde tekrarlanmıyor
- **inferModelFromDirective**: Opus aşırı atama düzeltildi
- **Doc task criteria**: `isDocTask()` — doc scope'ları için coverage check atlanıyor
- **Auto doc update**: `updateProjectDocs()` — sprint sonrası doc dosyaları otomatik güncelleniyor

### Added

- Sprint 18'de keşfedilen 6 bug'ın tamamı ele alındı (6 DONE + 2 GO_WITH_TECH_DEBT)
- +96 test (1027→1123), +1555 satır kaynak kodu, 0 regresyon

## [0.1.0-sprint18] - 2026-03-18

### Added

- **Orchestration smoke test**: First real `runSprint` execution since Sprint 10 — 10 parallel doc tasks planned, 8 executed
- **8 documentation files** (~135 KB total): GLOSSARY, TROUBLESHOOTING, SECURITY, MCP-GUIDE, MEMORY-SYSTEM, SPRINT-LIFECYCLE, CONFIG-REFERENCE, WORKER-GUIDE
- **Sprint observation report**: `docs/SPRINT-18-OBSERVATION.md` — detailed phase-by-phase orchestration analysis
- **6 bugs discovered**: planner max_workers task limit, heartbeat timestamp drift, dashboard progress lag, alert dedup missing, doc task coverage criteria, DEBT.md empty table test
- **End-to-end validation**: PLAN → SPAWN → EXECUTE → EVALUATE → RETRO → CLEANUP completed in 260s with 8 parallel sonnet workers
- **Test suite**: 1027 tests (0 new — doc-only sprint), 97.5% coverage, 0 regressions

## [0.1.0-sprint17] - 2026-03-18

### Added

- **MCP background jobs**: `deckent_start` returns immediately with `jobId`, sprint runs in background via `child_process.fork()` — no MCP timeout
- **`.deckent/jobs/{jobId}.json`**: Job state tracking (RUNNING/COMPLETE/FAILED)
- **`deckent_status`** now includes active job state
- **cleanup() fix**: Covers all task file extensions (.json, .plan, .hb, .result, .paused, .log), sprint prefix guard, stale file detection (24h)
- **Sprint ID safety**: `last_sprint_id` in `.deckent/config.json`, max of config vs file scan — never regresses
- **Dashboard reset**: Fresh `DashboardState` on PLAN phase, sprint ID mismatch triggers reset in auditor
- **React test infra**: `src/dashboard/vitest.config.ts` (happy-dom), AgentDetail + DashboardPage tests
- **`test:dashboard`** npm script: `vitest run --config src/dashboard/vitest.config.ts`
- **Test suite**: 1027 tests (+40 new), 97.5% coverage, 0 regressions

## [0.1.0-sprint16] - 2026-03-18

### Added

- **`deckent watch`** CLI command: Live tmux split view with dashboard and worker panes, `--follow <taskId>` flag
- **Worker log capture**: tmux pipe-pane captures worker stdout to `.tasks/task-{id}.log`
- **`deckent start --watch`**: Creates watch window before sprint runs (non-blocking)
- **`readWorkerLog()`** (`src/agents/worker.ts`): Utility to read worker log files
- **GET `/api/worker/:taskId/log`**: API endpoint returning task JSON + worker log content
- **`AgentDetail`** component: React component with 3s polling, displayed in Sheet panel
- **`inferModelFromDirective()`** (`src/orchestra/brain.ts`): Heuristic model selection for structured planner mode
- **`setupWatchWindow()`** (`src/orchestra/tmux.ts`): Non-blocking watch layout creation
- **.brain/ dogfooding**: sprint-015.md log, ADR-013, MEMORY.md Sprint 15 learnings
- **Test suite**: 987 tests (+20 new), 97.5% coverage, 0 regressions

## [0.1.0-sprint15] - 2026-03-18

### Added

- **DECKENT.md** — Single source of truth for agent configuration (replaces AGENTS.md+CLAUDE.md symlink pattern)
- **`ensureDeckentImport()`** (`src/core/utils.ts`): Shared utility for additive @DECKENT.md injection — never overwrites existing content
- **`DECKENT_FILE` constant** (`src/core/constants.ts`)
- **Init additive injection**: `deckent init` no longer overwrites CLAUDE.md — uses `ensureDeckentImport()` instead
- **Config merge**: Existing `.deckent/config.json` fields preserved during re-init
- **Blueprint-quality rule templates**: brain.md (13 rules + frontmatter), auditor.md (9 rules), worker-default.md (9 rules)
- **`deckent sync`** CLI command: Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference
- **`deckent_sync`** MCP tool (10th tool): Same functionality via MCP
- **`deckent://config`** MCP resource (5th resource): Read project configuration via MCP
- **Self-hosting**: deckent-dev now runs its own `.deckent/` structure (config, workspace, i18n, plugins)
- **DEBT-002 closed**: checkUsage was resolved in sprint-003, debt entry formalized
- **Test suite**: 967 tests (+29 new), 97.5% coverage, 0 regressions

## [0.1.0-sprint12-13] - 2026-03-18

### Added

- **Brain AI Planning** (`src/orchestra/planner.ts`): AI task planning with Zod schema validation, 3 planning modes (ai/structured/auto)
- **BrainPlanningMode**: `'ai' | 'structured' | 'auto'` config field in PlanModeConfig
- **DRAFT task status**: `confirmDraftTasks()` transitions DRAFT → PENDING before spawning
- **Auditor in-process**: `startScanLoop()` runs within Brain's `runSprint` (Phase 2.5), not as separate tmux window
- **`writeScanToDashboard()`**: Merges scan results into dashboard state (alerts, agent statuses)
- **Worker heartbeat prompt**: `buildWorkerPrompt` includes .hb file creation/update instructions
- **.deckent/ structure**: TOOLS.md, BOOT.md, plugins/, i18n/ created by init
- **Test suite**: 938 tests, 97.5% coverage

## [0.1.0-sprint11] - 2026-03-18

### Added

- **Web Dashboard** (`src/dashboard/`): React+Vite+Tailwind, shadcn/ui components
- **4 pages**: DashboardPage, SettingsPage, HistoryPage, MemoryPage
- **14 UI components**: button, card, tabs, select, input, label, separator, sheet, scroll-area, badge, table, textarea, dialog, progress
- **6 main components**: Layout, DebtTable, ThemeProvider, NewSprintModal, SprintChart, SimpleMarkdown
- **SSE integration**: `useSSE` hook, real-time dashboard updates
- **`deckent web`**: Launches HTTP API + web dashboard at localhost:3100
- **Dark/light theme**, mobile responsive with hamburger menu
- **Test suite**: 852 tests, 97% coverage

## [0.1.0-sprint10] - 2026-03-17

### Added

- **HTTP API** (`src/api/server.ts`): 15 endpoints + SSE stream
- **Routes**: GET status/sprint/history/config/doctor/memory/debt/job/events, POST start/plan/kill/set-directives/config
- **Dashboard watcher** (`src/api/watcher.ts`): File watcher with debounce for SSE
- **Terminal dashboard** (`deckent dashboard`): Rich TUI with Unicode box-drawing
- **`deckent serve`**: HTTP API server standalone
- **Sprint ID refactor**: Consistent format across codebase
- **Test suite**: 799 tests, 95% coverage

## [0.1.0-sprint9] - 2026-03-17

### Added

- **Analyzer** (`src/core/analyzer.ts`): Project stack, size, methodology detection
- **9th MCP tool**: `deckent_analyze_project` — analyzes project and returns recommendations
- **CI pipeline**: GitHub Actions workflow
- **Dynamic version**: Reads from package.json at runtime
- **`deckent archive-debt`**: Archive resolved technical debt
- **Enriched sprint history**: Metrics in sprint log display
- **Test suite**: 720 tests, 95% coverage

## [0.1.0-sprint8] - 2026-03-17

### Added

- **CONTRIBUTING.md**: Full contributing guide (setup, standards, testing, PR process)
- **docs/API.md**: Complete programmatic API reference (1491 lines)
- **docs/ARCHITECTURE.md**: Condensed architecture overview
- **docs/ROADMAP.md**: Phase-based roadmap
- **MCP dogfooding**: Used Deckent's own MCP tools during development
- **Test suite**: 669 tests, 95% coverage

## [0.1.0-sprint7] - 2026-03-17

### Added

- **MCP Server** (`src/mcp/`): 8 tools + 4 resources, stdio transport
- **Zero-friction integration**: Auto-registration in .claude/settings.json
- **Test suite**: 669 tests, 95% coverage, 24 new MCP tests

## [0.1.0-sprint6] - 2026-03-16

### Added

- **First dogfooding**: Deckent ran `deckent start` on itself
- Generated README.md in 86 seconds with 1 worker
- End-to-end orchestration loop proven
- **Test suite**: 645 tests, 95% coverage

## [0.1.0-sprint5] - 2026-03-16

### Added

- **Memory decay**: Auto-compress .brain/ when >300 lines
- **Doctor checks**: `runDoctorChecks()` for pre-flight validation
- **`deckent start --dry-run`**: Plan tasks without spawning workers
- **`deckent status --watch`**: Auto-refresh every 2 seconds
- **Barrel excludes**: index.ts files excluded from coverage
- **Test suite**: 644 tests, 94.83% coverage

## [0.1.0-sprint4] - 2026-03-16

### Added

- **Debt resolution lifecycle**: `resolveDebt()`, stale debt cleanup
- **Test suite**: 617 tests, 93% coverage

## [0.1.0-sprint3] - 2026-03-16

### Fixed

- **haiku_allowed**: Semantic fix (true = haiku is allowed as downgrade option)
- **checkUsage regex**: Fixed usage percentage parsing

### Added

- **Test suite**: 540 tests, 92% coverage

## [0.1.0-sprint2] - 2026-03-16

### Changed

- **Async migration**: `sleepSync(Atomics.wait)` → `async sleep(setTimeout)`
- Brain now fully async throughout sprint lifecycle

### Added

- **Test suite**: 480 tests, 91% coverage

## [0.1.0-wave4] - 2026-03-16

### Added

- **CLI Module** (`src/cli/`): 17 komut, 16 komut dosyası, 3 helper — `deckent` CLI arayüzü
- **Entry point** (`src/cli/index.ts`): Shebang + Commander program, 16 register fonksiyonu
- **Init wizard** (`src/cli/commands/init.ts`): Interactive setup — plan seçimi, dil, proje adı, dizin yapısı oluşturma, .gitignore duplicate kontrolü
- **Doctor** (`src/cli/commands/doctor.ts`): Node.js, git, tmux, Claude CLI sağlık kontrolü
- **Terminal dashboard** (`src/cli/commands/status.ts`): Unicode box-drawing ile ASCII dashboard render
- **Sprint commands**: `start` (runSprint + --auto-approve + --sandbox stub), `plan` (plan-only mode), `cleanup`, `retro`
- **Agent commands**: `attach` (tmux), `spawn` (manual worker), `kill` (worker kill)
- **Config commands**: `config` (show), `config set` (validate + write)
- **Info commands**: `usage`, `history` (sprint log table)
- **Stub commands**: `plugin install/list`, `upgrade`, `onboard` — "not yet implemented"
- **Helpers**: `output.ts` (formatDashboard, formatDoctorResult, formatTable, formatProgressBar, formatSprintSummary), `process.ts` (EXIT_CODES, handleCliError, resolveProjectRoot), `prompt.ts` (promptText, promptSelect, promptConfirm)
- **Runtime dependency**: `commander@^13.0.0` (tek runtime dependency)
- **Test suite**: 86 new tests, total 297 (all passing)
- **Coverage**: %92.91 overall; CLI commands %98.33, CLI entry %95.23, CLI helpers %89.47

### Changed

- `vitest.config.ts`: Removed `src/cli/**` from coverage exclude
- `package.json`: Added `commander` as runtime dependency

## [0.1.0-wave3] - 2026-03-16

### Added

- **Brain Module** (`src/orchestra/brain.ts`): 17 exported fonksiyon + 7 internal helper — tam sprint yaşam döngüsü (8 phase), GO/NO-GO değerlendirme, çapraz bağımlılık çözümü, debt escalation (2→HIGH, 3+→CRITICAL), decay mekanizması (300 satır budget), usage-aware sprint planning. `BrainError` error class. `BrainContext`, `ProjectState`, `SprintSizeRecommendation`, `CreateTaskParams` interfaces.
- **Sprint Lifecycle**: `runSprint` master orchestrator — PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP. Her phase try/catch ile korunur, sprint asla yarım kalmaz.
- **DEBT.md Programatic I/O**: `parseDebtTable`/`generateDebtTable` ile markdown tablo formatı korunarak okuma/yazma.
- **Barrel exports**: `src/orchestra/index.ts` updated with 17 brain function exports + 4 type exports
- **Constants**: `DEBT_TABLE_HEADER` added to `src/core/constants.ts`
- **Test suite**: 83 new tests, total 211 (all passing)
- **Coverage**: brain.ts %93.61 statements, %96.42 functions; overall %91.51

## [0.1.0-wave2] - 2026-03-16

### Added

- **tmux Manager** (`src/orchestra/tmux.ts`): 10 fonksiyon — session management, worker spawn/kill, auditor start, attach, send-keys. `SpawnOptions` interface (allowedTools + autoApprove). `TmuxError` error class.
- **Auditor** (`src/monitor/auditor.ts`): 10 fonksiyon — heartbeat scanning, boundary violation detection (git diff), stale lock detection, Kahn's algorithm deadlock detection, dashboard update, pattern detection. Resilient `readJsonSafe` pattern.
- **Worker** (`src/agents/worker.ts`): 12 fonksiyon — task read/claim, plan write, file locking (acquire/release/check/releaseAll), heartbeat create/write, result write with status update, scope validation. `TaskClaimError`, `LockError`, `ScopeViolationError` error classes.
- **Barrel exports**: `src/orchestra/index.ts`, `src/monitor/index.ts`, `src/agents/index.ts`
- **Root re-exports**: `src/index.ts` updated with 3 new module exports
- **Test suite**: 80 new tests (19 tmux + 24 auditor + 37 worker), total 128
- **Coverage**: 90.89% overall (tmux 100%, auditor 95.58%, worker 95.81%)

## [0.1.0-wave1] - 2026-03-16

### Added

- **Constants** (`src/core/constants.ts`): 50+ constants — paths, timing, memory limits, tmux names, task extensions, tech debt escalation, defaults
- **Type system** (`src/core/types.ts`): 8 enums (`TaskStatus`, `TaskEvaluation`, `AgentStatus`, `AlertLevel`, `SprintPhase`, `SprintStatus`, `DebtPriority`), 25+ interfaces covering Task, Sprint, Agent, Config, Dashboard, Memory, Lock, Usage, Plugin, and CLI domains
- **Config loader** (`src/core/config.ts`): 3-layer merge (defaults → global → project), `ConfigValidationError` with detailed error arrays, `deepMerge`, `loadConfig`, `validatePartialConfig`
- **Barrel exports**: `src/core/index.ts`, `src/index.ts`
- **Test suite**: 48 tests across 3 files — constants, types (enum membership), config (load/merge/validate)
- **Coverage**: 91.87% overall (constants 100%, types 100%, config 92.39%)
- **Project scaffold**: `package.json`, `tsconfig.json` (strict, Node16, ES2022), `vitest.config.ts`, `.gitignore`
