# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
