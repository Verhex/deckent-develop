# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
