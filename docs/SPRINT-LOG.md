<!-- Dil: TR | Teknik terimler EN -->
# Sprint Log

---

## Sprint 1 / Wave 1 — Core Types & Config

**Status:** COMPLETE
**Date:** 2026-03-16
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 10 (3 source, 2 barrel, 3 test, 2 config) |
| Tests | 48 passing |
| Coverage | 91.87% |
| Type errors | 0 |
| Enums | 8 |
| Interfaces | 25+ |
| Constants | 50+ |

### Decisions Made

- **ADR-001**: TypeScript + ESM (`"type": "module"`) as project foundation
- **ADR-002**: `module: Node16` + `moduleResolution: Node16` (TS 5.2+ requirement)
- **ADR-003**: vitest over Jest (native ESM, faster, v8 coverage)
- **ADR-004**: 3-layer config merge (hardcoded defaults → `~/.deckent/config.json` → `.deckent/config.json`)

### Notes

- `@types/node` added as devDependency (not in original plan — needed for `node:fs`, `node:path`, `structuredClone` types)
- `tsconfig.json` updated with `"types": ["node"]` for explicit Node.js type resolution
- `deepMerge` uses runtime casts to satisfy strict TypeScript while keeping clean API

---

## Sprint 1 / Wave 2 — tmux + Worker + Auditor

**Status:** COMPLETE
**Date:** 2026-03-16
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 9 (3 source, 3 barrel, 3 test) |
| Files updated | 1 (src/index.ts) |
| Tests | 80 new, 128 total (all passing) |
| Coverage | 90.89% overall |
| Type errors | 0 |
| Public functions | 32 (10 tmux + 10 auditor + 12 worker) |
| Error classes | 4 (TmuxError, TaskClaimError, LockError, ScopeViolationError) |

### Decisions Made

- **ADR-005**: Synchronous I/O preferred (async unnecessary for small files)
- **ADR-006**: spawnSync security pattern (no shell interpretation)
- **ADR-007**: SpawnOptions interface (allowedTools + autoApprove)

### Notes

- 3 modules implemented in parallel — no cross-imports between orchestra/monitor/agents
- Auditor uses `readJsonSafe` pattern — single corrupt file doesn't break scan loop
- Lock file naming: path separators → `__` (double underscore), no nested directories needed
- `isWithinScope` uses trailing separator normalization for prefix overlap protection

---

## Sprint 1 / Wave 3 — Brain Module

**Status:** COMPLETE
**Date:** 2026-03-16
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 2 (`src/orchestra/brain.ts`, `tests/orchestra/brain.test.ts`) |
| Files updated | 2 (`src/core/constants.ts`, `src/orchestra/index.ts`) |
| Tests | 83 new, 211 total (all passing) |
| Coverage | brain.ts %93.61 stmts, %96.42 funcs; overall %91.51 |
| Type errors | 0 |
| Public functions | 15 (readContext, createTask, planSprint, spawnWorkers, waitForResults, evaluateResult, handleEvaluation, handleCrossDependencies, escalateDebt, writeRetrospective, writeSprintLog, calculateMetrics, decay, cleanup, runSprint) |
| Internal helpers | 7 (readFileSafe, readJsonSafe, sleepSync, now, parseDebtTable, generateDebtTable, countBrainLines) |
| Error classes | 1 (BrainError) |

### Decisions Made

- **ADR-008**: Brain merkezi import — tek yönlü bağımlılık (brain → tmux/auditor/worker)
- **ADR-009**: DEBT.md markdown tablo formatı korunur (programatik parse/generate)

### Tech Debt Accepted

- DEBT-002: Kullanım kontrolü stub'ı — Sprint 089'da kullanım takibi kaldırıldı
- DEBT-003: Directive parsing satır bazlı — ileride Claude API ile akıllı parsing
- DEBT-004: `waitForResults` sleepSync main thread bloklar — ileride async geçiş

### Notes

- Brain, projede diğer modülleri import eden TEK modül — döngüsel import yok
- `evaluateResult` pure fonksiyon: selfAssessment DONE iken testsPassed=false → NO_GO override, coverage<90 → TECH_DEBT override
- `waitForResults` ilk geçişi döngü öncesi yapar (timeout=0 bile en az 1 kontrol)
- `parseDebtTable` `slice(1,-1)` ile kolon parse — boş alan içeren kolonlar korunur
- Timeout sonrası eksik task'lar syntheticResult ile NO_GO olarak değerlendirilir

---

## Sprint 1 / Wave 4 — CLI Module

**Status:** COMPLETE
**Date:** 2026-03-16
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 22 (16 commands, 3 helpers, 1 entry point, 3 test) |
| Files updated | 2 (package.json, vitest.config.ts) |
| Tests | 86 new, 297 total (all passing) |
| Coverage | %92.91 overall; CLI commands %98.33 |
| Type errors | 0 |
| Commands | 17 (init, start, plan, status, attach, spawn, kill, retro, cleanup, doctor, config, config set, usage, history, plugin install/list, upgrade, onboard) |
| Runtime dependencies | 1 (commander@^13.0.0) |

### Decisions Made

- **ADR-010**: Tek runtime dependency (commander.js) — minimal footprint
- **ADR-011**: node:readline/promises — ek bağımlılık yerine built-in
- **ADR-012**: register\<Name\>(program) pattern — her komut kendi dosyasında

### Tech Debt Accepted

- DEBT-005: `--auto-approve` → `haiku_allowed` mapping — semantik yanlış ama fonksiyonel
- DEBT-006: `deckent status` tek-seferlik okuma — canlı izleme Phase 3'te
- DEBT-007: `--sandbox` stub — Docker container modu implement edilmedi
- DEBT-008: Plugin/upgrade/onboard stub komutlar
- DEBT-009: CLI mesajları hardcoded İngilizce — i18n sonra
- DEBT-010: `deckent retro` sadece görüntüleme — yeniden hesaplama yapmaz
- DEBT-011: `deckent plan` sonrası `deckent start` çakışma riski

### Notes

- CLI → core/orchestra/monitor/agents yönünde tek yönlü bağımlılık, döngüsel import yok
- `commander` tek runtime dependency — chalk/inquirer/picocolors eklenmedi
- `node:readline/promises` Node 18+ built-in — interaktif prompt için yeterli
- Unicode box-drawing (╔═╗║╚═╝) terminal dashboard için yeterli, renk kütüphanesi gereksiz
- `.gitignore` append'de duplicate kontrolü ile güvenli ekleme
- Wave 1-3 mevcut 211 test kırılmadı (0 regression)

---

## Sprints 2-14 — Consolidated Summary

Sprint 2-14 logs were not maintained in SPRINT-LOG.md during initial development.
Full details available in CHANGELOG.md and DECKENT-MASTER-BLUEPRINT.md Section 19+24.

| Sprint | Tests | Coverage | Highlights |
|--------|-------|----------|------------|
| 2 | 480 | 91% | Async migration (sleepSync → async sleep) |
| 3 | 540 | 92% | haiku_allowed semantic fix |
| 4 | 617 | 93% | resolveDebt lifecycle, stale debt cleanup |
| 5 | 644 | 94.83% | Decay, doctor, start --dry-run, status --watch |
| 6 | 645 | 95% | First dogfooding: README.md generated in 86s |
| 7 | 669 | 95% | MCP server: 8 tools, 4 resources, auto-registration |
| 8 | 669 | 95% | CONTRIBUTING.md, API docs, MCP dogfooding |
| 9 | 720 | 95% | Analyzer tool, CI pipeline, dynamic version |
| 10 | 799 | 95% | HTTP API+SSE, terminal dashboard, sprint ID refactor |
| 11 | 852 | 97% | Web Dashboard: React+Vite+Tailwind, 4 pages, shadcn/ui |
| 12-13 | 938 | 97.5% | Brain AI planning (planner.ts, Zod), Auditor in-process |
| 14 | 938 | 97.5% | Auditor live scan loop, .deckent structure, worker heartbeat |

---

## Sprint 15 — DECKENT.md Bağımsızlık + Self-Hosting

**Status:** COMPLETE
**Date:** 2026-03-18
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 8 (3 source: sync.ts CLI+MCP, config.ts resource; 3 test; 2 workspace) |
| Files updated | 12 (constants, utils, init CLI+MCP, index CLI+MCP+resources, .gitignore, CLAUDE.md, config.json, DEBT.md) |
| Tests | 29 new, 967 total (all passing) |
| Coverage | 97.5%+ |
| Type errors | 0 |
| MCP tools | 9→10 (deckent_sync) |
| MCP resources | 4→5 (deckent://config) |

### Wave Execution

| Wave | Tasks | Description |
|------|-------|-------------|
| A | Görev 1 | DECKENT.md foundation: constant, ensureDeckentImport, init refactor |
| B | Görev 2+4+5 (parallel) | Rule templates, DEBT-002 close, sync CLI+MCP+resource |
| C | Görev 3 | Self-hosting: .deckent/ files, .gitignore, CLAUDE.md injection |

### Key Deliverables

- DECKENT.md = single source of truth; CLAUDE.md/AGENTS.md = adapters
- ensureDeckentImport() shared utility (CLI + MCP + sync use same function)
- Config merge pattern: existing fields preserved, new fields added
- .deckent/ tracked in git (removed from .gitignore)
- Blueprint-quality rule templates with frontmatter
- deckent sync CLI + deckent_sync MCP tool
- deckent://config MCP resource
- DEBT-002 formalized as resolved

---

## Sprint 16 — Watch Mode, Worker Logs, Agent Detail

**Status:** COMPLETE
**Date:** 2026-03-18
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 4 (watch.ts, AgentDetail.tsx, watch.test.ts, job-runner.ts placeholder) |
| Files updated | 10 (tmux.ts, worker.ts, brain.ts, start.ts, server.ts, DashboardPage.tsx, constants.ts, planner.ts, .gitignore, index.ts) |
| Tests | 20 new, 987 total (all passing) |
| Coverage | 97.5%+ |
| Type errors | 0 |
| CLI commands | 25->26 (watch) |
| HTTP endpoints | 15->16 (worker log) |

### Key Deliverables

- deckent watch: tmux split view (dashboard left, worker list right)
- Worker log capture: pipe-pane -> .tasks/task-{id}.log
- start --watch: non-blocking watch window setup before sprint
- GET /api/worker/:taskId/log: task + log API endpoint
- AgentDetail component: Sheet panel with polling
- inferModelFromDirective: structured planner model heuristic

---

## Sprint 17 — Reliability + Test Infra + Docs

**Status:** COMPLETE
**Date:** 2026-03-18
**Duration:** Single session

### Results

| Metric | Value |
|--------|-------|
| Files created | 5 (job-runner fork, dashboard vitest config, test setup, 2 test files) |
| Files updated | 8 (start.ts, status.ts, brain.ts, auditor.ts, utils.ts, config.json, types.ts, package.json) |
| Tests | 40 new, 1027 total (all passing) |
| Coverage | 97.5%+ |
| Type errors | 0 |

### Key Deliverables

- MCP background jobs: deckent_start returns jobId immediately, sprint runs in fork()
- cleanup() covers all task file extensions, sprint prefix guard, 24h stale detection
- Sprint ID safety: last_sprint_id config + file scan, always max
- Dashboard reset on PLAN phase, sprint ID mismatch check in auditor
- React test infra: vitest happy-dom, AgentDetail + DashboardPage tests
- Sprint 16 documentation sync across all files

---

## Sprint 18 — Orchestration Smoke Test (10 Parallel Doc Tasks)

**Status:** COMPLETE (PARTIAL — 8/10 tasks)
**Date:** 2026-03-18
**Duration:** 260s (~4.3 minutes)

### Results

| Metric | Value |
|--------|-------|
| Tasks planned | 8 (of 10 requested — max_workers limit) |
| Tasks completed | 8 |
| DONE | 3 |
| GO_WITH_TECH_DEBT | 5 |
| NO_GO | 0 |
| Worker model | sonnet (all 8) |
| Docs generated | 8 files (~135 KB) |
| Tests | 1027 (0 new, 0 regressions) |
| Coverage | 97.5% |
| Bugs found | 6 |

### Key Deliverables

- First real `runSprint` execution since Sprint 10
- 8 documentation files: GLOSSARY, TROUBLESHOOTING, SECURITY, MCP-GUIDE, MEMORY-SYSTEM, SPRINT-LIFECYCLE, CONFIG-REFERENCE, WORKER-GUIDE
- 2 docs not planned (BRAIN-GUIDE, DASHBOARD-GUIDE) — planner treated max_workers as task count limit
- Observation report: [docs/archive/observations/SPRINT-18-OBSERVATION.md](archive/observations/SPRINT-18-OBSERVATION.md)

### Bugs Discovered

1. **P0** — Planner max_workers = task count limit (should be parallelism limit only)
2. **P1** — Heartbeat timestamps wrong timezone (all workers marked stale)
3. **P1** — Dashboard done counter not updated until EVALUATE phase
4. **P2** — Alert dedup missing (42+ duplicate stale agent alerts)
5. **P2** — Doc tasks get GO_WITH_TECH_DEBT due to coverage check (irrelevant for docs)
6. **P3** — DEBT.md empty table breaks debt-002 test (pre-existing)

---

## Sprint 19 — Motor Onarımı (6 Bug Fix)

**Status:** COMPLETE
**Date:** 2026-03-18
**Duration:** 760s (~12.7 minutes)

### Results

| Metric | Value |
|--------|-------|
| Tasks planned | 8 |
| Tasks completed | 8 (6 DONE, 2 GO_WITH_TECH_DEBT) |
| Tests | 1027→1123 (+96 new) |
| Coverage | 97.5% |
| Source lines added | +1555 |
| Bugs fixed | 6 (from Sprint 18) |

### Key Deliverables

- Heartbeat timestamp fix: doğru UTC zaman damgası, 0 stale alert
- Dashboard progress fix: done counter `.result` dosyaları ile güncelleniyor
- Alert deduplication: tekrar eden uyarılar engellendi
- inferModelFromDirective fix: opus aşırı atama düzeltildi
- isDocTask(): doc scope'ları için coverage check atlanıyor
- updateProjectDocs(): sprint sonrası otomatik doc güncelleme
- Observation report: [docs/archive/observations/SPRINT-19-OBSERVATION.md](archive/observations/SPRINT-19-OBSERVATION.md)

---

## Sprint 20 — Fix Doğrulama Sprint'i

**Status:** COMPLETE (PARTIAL — 8/14 tasks)
**Date:** 2026-03-18
**Duration:** 113s (~1.9 minutes)

### Results

| Metric | Value |
|--------|-------|
| Tasks planned | 8 (of 14 requested — planner still limited) |
| Tasks completed | 8 |
| Tests | 1027 (validation sprint — no new tests) |
| Fix validations | 3/6 confirmed PASSED |

### Key Deliverables

- Heartbeat timestamp: PASSED (0 stale alerts)
- Dashboard progress: PASSED (Done: 8/8 correct)
- Alert dedup: PASSED (0 duplicate alerts)
- Task queue: FAILED (planner still limited by max_workers)
- Doc task criteria: PARTIAL
- Model inference: could not validate
- Observation report: [docs/archive/observations/SPRINT-20-OBSERVATION.md](archive/observations/SPRINT-20-OBSERVATION.md)

---

## Sprint 21 — Parametrik Orkestrasyon

**Status:** COMPLETE
**Date:** 2026-03-18
**Duration:** 631s (~10.5 minutes)

### Results

| Metric | Value |
|--------|-------|
| Tasks planned | 8 |
| Tasks completed | 8 (7 DONE, 1 GO_WITH_TECH_DEBT) |
| Tests | 1123→1260 (+137 new) |
| Coverage | 97.5% |
| CLI commands | 26→28 (test, run) |

### Key Deliverables

- system-profile.ts: CPU, RAM, recommended workers tespiti
- subscription.ts: Claude plan tespiti (max_20x/max_5x/pro/api/unknown)
- resolveTaskModel(): katmanlı model seçimi (scope, complexity, plan, usage)
- resolveEffectiveWorkers(): config "auto" ise otomatik worker sayısı
- deckent test + deckent run CLI komutları
- Planner task queue fix: tüm görevler planlanıyor, spawnWorkers parallelism sınırını uygular
- DEBT.md decay bug tekrar oluştu (3. kez) — Sprint 22'de kalıcı fix
- Observation report: [docs/archive/observations/SPRINT-21-OBSERVATION.md](archive/observations/SPRINT-21-OBSERVATION.md)

---

## Sprint 22 — Decay Fix + Auto Setup + MCP Enrichment

**Status:** COMPLETE
**Date:** 2026-03-18
**Duration:** ~150s

### Results

| Metric | Value |
|--------|-------|
| Tasks planned | 8 (AI planner only returned 8 of 12) |
| Tasks completed | 8 (6 DONE, 2 GO_WITH_TECH_DEBT) |
| Tests | 1260→1392 (+132 new) |
| New files | 5 (auto-setup.ts, enrich.ts, helpers/index.ts, hints.ts, messages.ts) |

### Key Deliverables

- shouldRemoveResolvedDebt() + parseSprintNumber(): DEBT-002 artık decay'de korunuyor
- Auto Setup Wizard: generateSetupRecommendation() — subscription + sistem profili + proje boyutu
- MCP Enrichment: enrichResponse() altyapısı, 10/10 tool'a _enriched meta eklenidi
- CLI Hints: getContextualHints() faz bazlı öneriler, getMessage() lokalize mesajlar
- doctor --profile: sistem profili gösterimi
- AI planner hala 8/12 döndürüyor — Sprint 23'te post-validation fix

---

*Source of truth: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) — Section 19*

## Sprint 23 — sprint-023

**Status:** RETROSPECTIVE
**Date:** 2026-03-18
**Duration:** 321s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 80.0% |
| Duration | 320657ms |

### Tasks

- 023-001: AI Planner Post-Validation Fallback Fix (TAMAMLANDI) (GO_WITH_TECH_DEBT)
- 023-002: Decay Fix Doğrulama (DONE)
- 023-003: Auto Setup Wizard Doğrulama (DONE)
- 023-004: MCP Enrichment Infrastructure Doğrulama (GO_WITH_TECH_DEBT)
- 023-005: MCP Enrichment Tools Batch 1 Doğrulama (DONE)
- 023-006: MCP Enrichment Tools Batch 2 Doğrulama (DONE)
- 023-007: CLI Hints System Doğrulama (DONE)
- 023-008: Doctor Profile Flag Doğrulama (GO_WITH_TECH_DEBT)
- 023-009: Sprint 22 Test Coverage Doğrulama (DONE)
- 023-010: AI Planner Fallback Fix Doğrulama (DONE)
- 023-011: Task Queue Wave Doğrulama (DONE)
- 023-012: Sprint History Karşılaştırma (GO_WITH_TECH_DEBT)

---
## Sprint 25 — sprint-025

**Status:** RETROSPECTIVE
**Date:** 2026-03-20
**Duration:** 2618s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 97 |
| Completed | 62 |
| Tech Debt | 32 |
| No-Go | 35 |
| Coverage | 60.5% |
| Duration | 2617576ms |

### Tasks

- 025-001: readJsonSafe/readFileSafe Shared Utility (DONE)
- 025-002: result-watcher pendingResolve Timer Fix (DONE)
- 025-003: package.json files Field Düzeltme (GO_WITH_TECH_DEBT)
- 025-004: CODEOWNERS Dosyası (GO_WITH_TECH_DEBT)
- 025-005: dependabot.yml (GO_WITH_TECH_DEBT)
- 025-006: GitHub Actions Release Workflow (GO_WITH_TECH_DEBT)
- 025-007: Security Issue Template (GO_WITH_TECH_DEBT)
- 025-008: FUNDING.yml (GO_WITH_TECH_DEBT)
- 025-009: brain.ts readJsonSafe Import Migration (GO_WITH_TECH_DEBT)
- 025-010: debt-manager.ts readJsonSafe Import Migration (GO_WITH_TECH_DEBT)
- 025-011: auditor.ts readJsonSafe Import Migration (GO_WITH_TECH_DEBT)
- 025-012: sprint-reporter.ts readJsonSafe Import Migration (DONE)
- 025-013: debt-manager.test.ts — Dedicated Test Suite (GO_WITH_TECH_DEBT)
- 025-014: sprint-reporter.test.ts — Dedicated Test Suite (DONE)
- 025-015: result-watcher.test.ts — Test Suite (DONE)
- 025-016: task-builder.test.ts — Isolated Test Suite (GO_WITH_TECH_DEBT)
- 025-017: CLI doctor.test.ts (DONE)
- 025-018: CLI init.test.ts (GO_WITH_TECH_DEBT)
- 025-019: CLI start.test.ts (DONE)
- 025-020: CLI onboard.test.ts (DONE)
- 025-021: CLI upgrade.test.ts (DONE)
- 025-022: CLI usage.test.ts (DONE)
- 025-023: CLI analyze.test.ts (DONE)
- 025-024: CLI archive-debt.test.ts Expansion (GO_WITH_TECH_DEBT)
- 025-025: MCP Tool init.test.ts (GO_WITH_TECH_DEBT)
- 025-026: MCP Tool doctor.test.ts (GO_WITH_TECH_DEBT)
- 025-027: MCP Tool plan.test.ts (GO_WITH_TECH_DEBT)
- 025-028: MCP Tool start.test.ts (DONE)
- 025-029: MCP Tool status+history Tests (GO_WITH_TECH_DEBT)
- 025-030: MCP Tool retro+sync+analyze+directives Tests (GO_WITH_TECH_DEBT)
- 025-031: MCP Resources Test Suite (GO_WITH_TECH_DEBT)
- 025-032: api/watcher.test.ts (DONE)
- 025-033: core/types.ts Edge Case Tests (DONE)
- 025-034: core/config.ts Edge Case Tests (GO_WITH_TECH_DEBT)
- 025-035: auditor.ts Edge Case Tests (GO_WITH_TECH_DEBT)
- 025-036: worker.ts Edge Case Tests (GO_WITH_TECH_DEBT)
- 025-037: planner.ts Edge Case Tests (DONE)
- 025-038: tmux.ts Edge Case Tests (GO_WITH_TECH_DEBT)
- 025-039: api/server.ts Edge Case Tests (GO_WITH_TECH_DEBT)
- 025-040: CLI output.ts + prompt.ts Tests (DONE)
- 025-041: Plugin Install Implementation (DONE)
- 025-042: Plugin Create Command (DONE)
- 025-043: Plugin Remove Implementation (DONE)
- 025-044: Plugin Enable/Disable Toggle (DONE)
- 025-045: Built-in Skill Templates (DONE)
- 025-046: Plugin Hook System (DONE)
- 025-047: Plugin Manifest v2 (DONE)
- 025-048: Plugin System Integration Tests (GO_WITH_TECH_DEBT)
- 025-049: Sprint Pause/Resume Mechanism (GO_WITH_TECH_DEBT)
- 025-050: Task Retry Mechanism (DONE)
- 025-051: Worker Progress Percentage (DONE)
- 025-052: Sprint Time Estimation (DONE)
- 025-053: Brain Pattern Learning (GO_WITH_TECH_DEBT)
- 025-054: Global Config Support (GO_WITH_TECH_DEBT)
- 025-055: Config Export/Import CLI (GO_WITH_TECH_DEBT)
- 025-056: Sprint Comparison Metrics (GO_WITH_TECH_DEBT)
- 025-057: i18n Key Inventory (DONE)
- 025-058: i18n Integration — start, plan, status (NO_GO)
- 025-059: i18n Integration — doctor, init, cleanup (NO_GO)
- 025-060: i18n Integration — spawn, kill, attach (DONE)
- 025-061: i18n JSON Files Expansion (DONE)
- 025-062: i18n Language Auto-Detection (GO_WITH_TECH_DEBT)
- 025-063: i18n Date/Time Localization (DONE)
- 025-064: i18n Test Coverage (NO_GO)
- 025-065: Plugin Development Guide (GO_WITH_TECH_DEBT)
- 025-066: ARCHITECTURE.md Genişletme (NO_GO)
- 025-067: API Integration Examples (NO_GO)
- 025-068: Quick Start Tutorial (NO_GO)
- 025-069: Migration/Upgrade Guide (NO_GO)
- 025-070: Performance Tuning Guide (NO_GO)
- 025-071: FAQ Dokümanı (NO_GO)
- 025-072: CONTRIBUTING.md Güncellemesi (NO_GO)
- 025-073: npm Publish Verification Script (NO_GO)
- 025-074: README Badges (NO_GO)
- 025-075: Automated Changelog Script (NO_GO)
- 025-076: Version Bump Script (NO_GO)
- 025-077: Example Project Skeleton (NO_GO)
- 025-078: Dockerfile (NO_GO)
- 025-079: Pre-commit Hooks Setup (NO_GO)
- 025-080: npm Publish GitHub Action (NO_GO)
- 025-081: readContext Paralel I/O (NO_GO)
- 025-082: Config Caching (NO_GO)
- 025-083: CLI Lazy Command Loading (NO_GO)
- 025-084: Lock Contention Optimization (NO_GO)
- 025-085: Benchmark Suite (NO_GO)
- 025-086: Error Message Consistency Audit (NO_GO)
- 025-087: Dead Code Elimination (NO_GO)
- 025-088: Unused Dependency Cleanup (NO_GO)
- 025-089: E2E Integration Test — init → plan → status (NO_GO)
- 025-090: E2E Integration Test — Full Sprint Mock (NO_GO)
- 025-091: MCP Integration Test (NO_GO)
- 025-092: CLI Integration Test (NO_GO)
- 025-093: Plugin Lifecycle Integration Test (NO_GO)
- 025-094: Doc Updater Registry Integration Test (NO_GO)
- 025-095: Config Layer Integration Test (NO_GO)
- 025-096: Security Integration Test (NO_GO)
- 025-097: tmp-test Cleanup + Blueprint Sync (NO_GO)

---
## Sprint 26 — sprint-026

**Status:** RETROSPECTIVE
**Date:** 2026-03-20
**Duration:** 1186s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 35 |
| Completed | 35 |
| Tech Debt | 16 |
| No-Go | 0 |
| Coverage | 71.6% |
| Duration | 1186027ms |

### Tasks

- 026-001: readJsonSafe Import Migration Tamamlama (GO_WITH_TECH_DEBT)
- 026-002: package.json files + keywords Tamamlama (GO_WITH_TECH_DEBT)
- 026-003: CODEOWNERS İyileştirme (DONE)
- 026-004: dependabot.yml İyileştirme (DONE)
- 026-005: Release Workflow İyileştirme (DONE)
- 026-006: Security Template + FUNDING.yml İyileştirme (DONE)
- 026-007: debt-manager.test.ts Test Tamamlama (DONE)
- 026-008: task-builder.test.ts Test Tamamlama (GO_WITH_TECH_DEBT)
- 026-009: CLI init.test.ts Test Tamamlama (DONE)
- 026-010: CLI archive-debt.test.ts Test Tamamlama (DONE)
- 026-011: MCP Tool init+doctor+plan Test Tamamlama (DONE)
- 026-012: MCP Tool status+history+misc Test Tamamlama (DONE)
- 026-013: MCP Resources Test Tamamlama (DONE)
- 026-014: core/config.ts Edge Case Test Tamamlama (GO_WITH_TECH_DEBT)
- 026-015: auditor.ts Edge Case Test Tamamlama (GO_WITH_TECH_DEBT)
- 026-016: worker.ts Edge Case Test Tamamlama (DONE)
- 026-017: tmux.ts + api/server.ts Edge Case Test Tamamlama (GO_WITH_TECH_DEBT)
- 026-018: Plugin System Integration Test Tamamlama (DONE)
- 026-019: Sprint Pause/Resume Tamamlama (DONE)
- 026-020: Brain Pattern Learning Tamamlama (GO_WITH_TECH_DEBT)
- 026-021: Global Config + Config Export/Import Tamamlama (GO_WITH_TECH_DEBT)
- 026-022: Sprint Comparison + i18n Language Detection Tamamlama (DONE)
- 026-023: Plugin Guide Tamamlama (DONE)
- 026-024: FAQ Dokümanı (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-025: OSS Scripts (NO_GO Fix) (DONE)
- 026-026: Integration Test — init→plan→status E2E (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-027: Integration Test — Full Sprint Mock (NO_GO Fix) (DONE)
- 026-028: Integration Test — MCP Flow (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-029: Integration Test — Plugin Lifecycle (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-030: Integration Test — Config Layers (NO_GO Fix) (DONE)
- 026-031: Integration Test — Security (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-032: Dockerfile + Example Project (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-033: CONTRIBUTING.md Güncellemesi (NO_GO Fix) (GO_WITH_TECH_DEBT)
- 026-034: npm Publish GitHub Action (NO_GO Fix) (DONE)
- 026-035: tmp-test Cleanup (GO_WITH_TECH_DEBT)

---
## Sprint 27 — sprint-027

**Status:** RETROSPECTIVE
**Date:** 2026-03-21
**Duration:** 126s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 25.0% |
| Duration | 125894ms |

### Tasks

- 027-001: Subprocess Backend Verification (GO_WITH_TECH_DEBT)
- 027-002: Provider Abstraction Verification (DONE)
- 027-003: Rollback Mechanism Verification (GO_WITH_TECH_DEBT)
- 027-004: Worker IPC Verification (GO_WITH_TECH_DEBT)

**Key Deliverables:**
- Provider abstraction: ProviderAdapter + ProviderRegistry + ClaudeAdapter
- SpawnBackend: TmuxBackend + SubprocessBackend + SpawnBackendFactory
- Kullanım takibi: Sprint 089'da kaldırıldı
- Coverage validation: vitest JSON parsing + threshold checks
- Rollback: Git safety points + auto-rollback policy
- Worker IPC: WorkerChannel + ChannelRegistry (HEARTBEAT/PAUSE/RESUME/KILL)
- Zero-config: single-line `deckent start "description"` mode
- Sandbox foundation: SandboxSpawnBackend with memory/fs limits
- Global config: ~/.deckent/ directory + merge with project
- Credentials: secure key storage with 0600 permissions
- 13 new modules, 167 new tests (3442 → 3609), +14,737 lines

---
## Sprint 28 — sprint-028

**Status:** RETROSPECTIVE
**Date:** 2026-03-21
**Duration:** 193s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 25.0% |
| Duration | 192915ms |

### Tasks

- 028-001: Subprocess Backend Verification (DONE)
- 028-002: No-Tmux Verification (GO_WITH_TECH_DEBT)
- 028-003: Provider Abstraction Analysis (GO_WITH_TECH_DEBT)
- 028-004: Sprint 27 Feature Summary (GO_WITH_TECH_DEBT)

**Key Deliverables:**
- Error UX: DeckentError + ErrorRegistry (10 codes), error-handler.ts, doctor enhanced messages
- Interactive onboard wizard: Claude detection, system profile, config recommendation
- Upgrade command: real npm update with version check
- TUI wizard framework: select/input/confirm steps, non-interactive mode
- Telemetry opt-in infrastructure (no data sent yet)
- Publish pipeline: prepublish, build-verify, pack-test, publish scripts
- .npmignore for clean npm package
- README.md complete English rewrite
- 5 docs English polish (QUICKSTART, API, CONFIG-REFERENCE, CONTRIBUTING, docs)
- 3 new docs (SECURITY.md, RELEASE-CHECKLIST.md, landing-page-content.md)
- 66 files changed, +6419 lines, 40 new test files

---
## Sprint 29 — sprint-029

**Status:** RETROSPECTIVE
**Date:** 2026-03-21
**Duration:** 127s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 126519ms |

### Tasks

- 029-001: Subprocess Backend Verification (GO_WITH_TECH_DEBT)
- 029-002: No-Tmux Verification (GO_WITH_TECH_DEBT)
- 029-003: Provider Abstraction Analysis (GO_WITH_TECH_DEBT)
- 029-004: Sprint 27 Feature Summary (GO_WITH_TECH_DEBT)

**Key Deliverables:**
- Agent type system: AgentDefinition, AgentPool, AgentSelectionResult
- Agent pool manager: load/save/validate/stats/temp agents
- Agent selector: keyword+scope scoring, threshold, tie-break
- 8 built-in agents with PROMPT.md (security, test, doc, review, refactor, bug, api, perf)
- Shared context for inter-agent communication
- Multi-agent pipeline (sequential execution)
- CLI: deckent agent list/create/enable/disable
- Brain integration: auto agent selection in planSprint
- Dashboard: agent column visibility
- 47 files changed, +7030 lines, 314 new tests

---
## Sprint 30 — sprint-030

**Status:** RETROSPECTIVE
**Date:** 2026-03-21
**Duration:** 235s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 33.3% |
| Duration | 234552ms |

### Tasks

- 030-001: Fix debt: Tech debt from 027-003: Verification report written to tmp-test/rollback-verify. (DONE)
- 030-002: Fix debt: Tech debt from 027-004: Comprehensive verification report written to tmp-test/ip (DONE)
- 030-003: Subprocess Backend Verification (GO_WITH_TECH_DEBT)
- 030-004: No-Tmux Verification (GO_WITH_TECH_DEBT)
- 030-005: Provider Abstraction Analysis (GO_WITH_TECH_DEBT)
- 030-006: Sprint 27 Feature Summary (GO_WITH_TECH_DEBT)

**Key Deliverables:**
- Skill type system: SkillDefinition, ProjectStack, SkillSelectionResult
- Skill pool manager: load/save/validate/stats from .deckent/skills/
- Stack detector: TypeScript/React/Python/Rust/Go/Docker with cache
- Skill selector: multi-factor scoring, composition resolver
- Skill registry: local index foundation
- 10 built-in skills with SKILL.md prompts
- CLI: deckent skill list/create/install
- Brain: stack detection + skill selection in planSprint (async)
- Prompt injection: SKILL.md content in worker prompts
- Model selector Layer 4d: skill model preference
- 55 files changed, +8038 lines, 435 new tests

---
## Sprint 31 — sprint-031

**Status:** COMPLETE
**Date:** 2026-03-22
**Duration:** Brain Decision Engine + Learning Loop + Multi-Agent Collaboration + Adaptive Agent

### Results

| Metric | Value |
|--------|-------|
| Files Changed | 51 |
| Lines Added | +10,438 |
| New Tests | 572 |
| New Source Modules | 24 |

**Key Deliverables:**
- Decision engine: 6-step pipeline (TaskAnalyzer -> Agent -> Skill -> Model -> Effort -> Scope)
- Decision logger + replay: persist and re-run decisions for debugging
- Learning loop: pattern recorder/reader, combination scorer, decay, migration
- Multi-agent: parallel pipeline (topological waves), shared memory (TTL), conflict resolver
- Result merger: deduplicate files, weighted coverage, overlap detection
- Handoff protocol: artifact handoffs between dependent tasks
- Adaptive agent: prompt effectiveness analysis, A/B testing, versioning, rollback, metrics
- Brain context: stack/agent/skill/history enrichment
- Config: DecisionEngineConfig, LearningConfig, CollaborationConfig
- 51 files changed, +10,438 lines, 572 new tests

---
## Sprint 32 — sprint-032

**Status:** COMPLETE
**Date:** 2026-03-22
**Theme:** UX Polish

**Key Deliverables:**
- Progress: live bar, ETA calculator, worker status, queue display, terminal utils
- Rich summary: categorized changes, agent performance, recommendations, comparison
- Notifications: terminal bell, webhook, Discord, Slack with event filtering
- Interactive review: approve/reject/retry, --auto mode, review reports
- Agent/skill visibility: dashboard, status, retro, history, MCP enrichment
- CLI polish: theme (NO_COLOR), output modes (quiet/verbose), progress persistence
- 59 files changed, +9481 lines, 539 new tests, 27 new modules

---
## Sprint 33 — sprint-033

**Status:** COMPLETE
**Date:** 2026-03-22
**Theme:** Integration + Marketplace + Analytics

**Key Deliverables:**
- Integration tests: full E2E, TypeScript/React, Python/FastAPI, monorepo, error recovery
- Marketplace: registry client, CLI search/publish, ratings, dependency resolver, auth
- Adaptive: cross-sprint analyzer, drift detection, retirement, evolution log, genealogy
- Analytics: sprint data, usage graphs, success charts, agent comparison, skill heatmap
- Performance: agent cache (LRU), skill cache (500KB), token counter, lazy loader, batch stats
- Security: skill sandbox + quarantine, permission guard (escalation prevention)
- Docs: AGENT-GUIDE.md, MARKETPLACE-GUIDE.md
- 56 files changed, +12,063 lines, 559 new tests

---
## Sprint 33 — sprint-033

**Status:** RETROSPECTIVE
**Date:** 2026-03-22
**Duration:** 2405s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 14 |
| Tech Debt | 7 |
| No-Go | 3 |
| Coverage | 62.1% |
| Duration | 2404980ms |

### Tasks

- 033-001: EventEmitter MaxListeners Fix (GO_WITH_TECH_DEBT)
- 033-002: CI Workflow Test Fix — publish (DONE)
- 033-003: CI Workflow Test Fix — release (DONE)
- 033-004: Onboard Test Timeout Fix (GO_WITH_TECH_DEBT)
- 033-005: README Badge Update (GO_WITH_TECH_DEBT)
- 033-006: CHANGELOG Version Format (DONE)
- 033-007: File Extension Constant Usage (GO_WITH_TECH_DEBT)
- 033-008: Sprint Observation Docs Archive (GO_WITH_TECH_DEBT)
- 033-009: CI Coverage Gate (GO_WITH_TECH_DEBT)
- 033-010: SECURITY.md Location (DONE)
- 033-011: PR Template Deckent-Specific (DONE)
- 033-012: FUNDING.yml Update (DONE)
- 033-013: Utility Function Extraction (DONE)
- 033-014: readJsonSafe Migration (NO_GO)
- 033-015: Error Handling Unification (NO_GO)
- 033-016: Silent Catch Logging (NO_GO)
- 033-017: parseBody Type Safety (GO_WITH_TECH_DEBT)

---
## Sprint 37 — sprint-037

**Status:** COMPLETE
**Date:** 2026-03-22
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 20 |
| Coverage | NaN% |
| Duration | -4ms |

### Tasks

- 037-001: ModelType Extension (NO_GO)
- 037-002: Task Provider Field (NO_GO)
- 037-003: Provider Auto-Detection (NO_GO)
- 037-004: Codex CLI Adapter (NO_GO)
- 037-005: Gemini CLI Adapter (NO_GO)
- 037-006: Model Equivalence Mapping (NO_GO)
- 037-007: Provider Capability Matrix (NO_GO)
- 037-008: Multi-Provider Config (NO_GO)
- 037-009: Provider-Aware Model Selector (NO_GO)
- 037-010: Provider Usage Balancer (NO_GO)
- 037-011: spawnWorkers Provider Routing (NO_GO)
- 037-012: Provider Fallback Chain (NO_GO)
- 037-013: Platform Support Matrix & Doctor Check (NO_GO)
- 037-014: CLI Entrypoint Side-Effect Fix (NO_GO)
- 037-015: Planner Provider Decoupling (NO_GO)
- 037-016: tmux.ts Provider Decoupling (NO_GO)
- 037-017: subprocess.ts Provider Decoupling (NO_GO)
- 037-018: Provider Bootstrap Centralization (NO_GO)
- 037-019: Cross-Platform Test Helper (NO_GO)
- 037-020: Platform-Conditional Test Tags (NO_GO)

---
## Sprint 39 — sprint-039

**Status:** RETROSPECTIVE
**Date:** 2026-03-22
**Duration:** 2408s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 19 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 18 |
| Coverage | 95.0% |
| Duration | 2408326ms |

### Tasks

- 039-001: Codex Adapter Real CLI Fix (DONE)
- 039-002: Gemini Adapter API Verification (NO_GO)
- 039-003: Planner Full Provider Decoupling (NO_GO)
- 039-004: Model Equivalence Update (NO_GO)
- 039-005: Init Wizard — Provider Selection (NO_GO)
- 039-006: Cross-Environment Detection (NO_GO)
- 039-007: Provider Health Dashboard (NO_GO)
- 039-008: Smart Provider Routing (NO_GO)
- 039-009: Agent-Provider Compatibility (NO_GO)
- 039-010: Cost Estimator (NO_GO)
- 039-011: Multi-Provider Integration Test (NO_GO)
- 039-012: Cursor MCP Auto-Registration (NO_GO)
- 039-013: Multi-Provider Documentation (NO_GO)
- 039-014: Provider Config in Dashboard Settings (NO_GO)
- 039-015: Blueprint & Architecture Update (NO_GO)
- 039-016: Pre-Publish Validation Script (NO_GO)
- 039-017: Windows New Test Failures Fix (NO_GO)
- 039-018: deckent finalize .result File Generation (NO_GO)
- 039-019: npm Beta Publish Preparation (NO_GO)

---
## Sprint 40 — sprint-040

**Status:** RETROSPECTIVE
**Date:** 2026-03-23
**Duration:** 2412s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 7 |
| Tech Debt | 1 |
| No-Go | 6 |
| Coverage | 92.1% |
| Duration | 2411984ms |

### Tasks

- 040-001: Worker Internal Verify Loop — tsc Check (DONE)
- 040-002: Worker Internal Verify Loop — Test Check (DONE)
- 040-003: Worker Feedback Metrics (DONE)
- 040-004: Worker Prompt Overhaul — Human Instructions + Agent/Skill Injection Fix (DONE)
- 040-005: CLI Output — Human-Friendly Status (GO_WITH_TECH_DEBT)
- 040-006: CLI Output — Human-Friendly Sprint Complete (DONE)
- 040-007: MCP Tool Response — Human-Friendly (NO_GO)
- 040-008: Dashboard — Human-Friendly Web UI (NO_GO)
- 040-009: CLI Doctor — Human-Friendly Health Check (NO_GO)
- 040-010: CLI Init — Human-Friendly Wizard (DONE)
- 040-011: RETRO Format — Human-Friendly Retrospective (NO_GO)
- 040-012: Error Messages — Human-Friendly (NO_GO)
- 040-013: Log Output — Human-Friendly Worker Logs (NO_GO)

---
## Sprint 41 — sprint-041

**Status:** RETROSPECTIVE
**Date:** 2026-03-23
**Duration:** 793s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 94.3% |
| Duration | 792932ms |

### Tasks

- 041-001: Fix debt: Tech debt from 033-016-fix: Added debugLog() helper function to src/core/utils.t (DONE)
- 041-002: MCP Tool Response — Human-Friendly Format (GO_WITH_TECH_DEBT)
- 041-003: Dashboard — Human-Friendly SprintSummary Component (DONE)
- 041-004: CLI Doctor — Human-Friendly Health Check Enhancement (DONE)
- 041-005: RETRO Format — Human-Readable Retrospective Enhancement (DONE)
- 041-006: Error Messages — Human Context (DONE)
- 041-007: Worker Logs — Human-Readable Progress (DONE)

---
## Sprint 42 — sprint-042

**Status:** RETROSPECTIVE
**Date:** 2026-03-23
**Duration:** 2405s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 3 |
| Tech Debt | 3 |
| No-Go | 5 |
| Coverage | 0.0% |
| Duration | 2405394ms |

### Tasks

- 042-001: Close All Open Tech Debt (NO_GO)
- 042-002: Test Suite Stabilization (NO_GO)
- 042-003: npm Publish Validation (GO_WITH_TECH_DEBT)
- 042-004: Global Install E2E Test (GO_WITH_TECH_DEBT)
- 042-005: Provider Adapter Smoke Tests (GO_WITH_TECH_DEBT)
- 042-006: Documentation Final Review (NO_GO)
- 042-007: CHANGELOG + Release Notes (NO_GO)
- 042-008: Version Bump + Git Tag (NO_GO)

---
## Sprint 46 — sprint-046

**Status:** RETROSPECTIVE
**Date:** 2026-03-24
**Duration:** 2304s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 8 |
| Tech Debt | 7 |
| No-Go | 2 |
| Coverage | 10.0% |
| Duration | 2304479ms |

### Tasks

- 046-001: Connector Integration into bootstrapProviders (NO_GO)
- 046-002: Router Integration into Sprint Lifecycle (GO_WITH_TECH_DEBT)
- 046-003: Codex Adapter — Real CLI Integration (GO_WITH_TECH_DEBT)
- 046-004: Gemini Adapter — Real CLI Integration (NO_GO)
- 046-005: Claude Adapter — MCP Server Mode Option (GO_WITH_TECH_DEBT)
- 046-006: .deck Secret Loading in Provider Auth (GO_WITH_TECH_DEBT)
- 046-007: Provider Health in deckent doctor (GO_WITH_TECH_DEBT)
- 046-008: Rich Output Integration into finalizeSprint (DONE)
- 046-009: Environment-Aware deckent init (GO_WITH_TECH_DEBT)
- 046-010: Sprint 044 Module Smoke Tests (GO_WITH_TECH_DEBT)

---
## Sprint 47 — sprint-047

**Status:** RETROSPECTIVE
**Date:** 2026-03-24
**Duration:** 2408s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 10 |
| Coverage | 0.0% |
| Duration | 2407617ms |

### Tasks

- 047-001: Open Debt Fix — Connector Integration (NO_GO)
- 047-002: Open Debt Fix — Gemini Adapter .result (NO_GO)
- 047-003: Coverage Hesaplama Fix (NO_GO)
- 047-004: MEMORY.md Decay Tetikleme (NO_GO)
- 047-005: TECH_DEBT Pattern Kök Neden Analizi (NO_GO)
- 047-006: docs/directives Arşiv Analizi (NO_GO)
- 047-007: Stale PATTERNS.md Temizlik (NO_GO)
- 047-008: Sprint Output — Rich Summary Doğrulama (NO_GO)
- 047-009: deckent doctor Genişletme (NO_GO)
- 047-010: Self-Audit Sonuç Raporu (NO_GO)

---
## Sprint 48 — sprint-048

**Status:** RETROSPECTIVE
**Date:** 2026-03-24
**Duration:** 1199s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 7 |
| No-Go | 0 |
| Coverage | 11.9% |
| Duration | 1199167ms |

### Tasks

- 048-001: Claude MCP Backend Stub Completion (GO_WITH_TECH_DEBT)
- 048-002: Sandbox Mode Graceful Handling (GO_WITH_TECH_DEBT)
- 048-003: API Mode Usage Integration (GO_WITH_TECH_DEBT)
- 048-004: Doc-Only Task Verify Skip (DONE)
- 048-005: Subprocess Worker Log Enhancement (GO_WITH_TECH_DEBT)
- 048-006: Coverage Metric Preservation (GO_WITH_TECH_DEBT)
- 048-007: Blueprint Section Numbers Update (GO_WITH_TECH_DEBT)
- 048-008: RELEASE-NOTES-BETA.md Final Update (GO_WITH_TECH_DEBT)

---
## Sprint 50 — sprint-050

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 750s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 749716ms |

### Tasks

- 050-001: npm Publish Dry Run & Fix (GO_WITH_TECH_DEBT)
- 050-002: README.md Overhaul (GO_WITH_TECH_DEBT)
- 050-003: bin Entry Validation (GO_WITH_TECH_DEBT)
- 050-004: CHANGELOG.md Update (GO_WITH_TECH_DEBT)
- 050-005: npm Publish Pipeline Validation (GO_WITH_TECH_DEBT)

---
## Sprint 51 — sprint-051

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 1647s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 7 |
| No-Go | 0 |
| Coverage | 16.0% |
| Duration | 1646913ms |

### Tasks

- 051-001: Full Config Expansion (GO_WITH_TECH_DEBT)
- 051-002: Config Documentation (Inline Comments) (GO_WITH_TECH_DEBT)
- 051-003: Dashboard Config Editor (GO_WITH_TECH_DEBT)
- 051-004: VitePress Setup (GO_WITH_TECH_DEBT)
- 051-005: Getting Started Guide (DONE)
- 051-006: CLI Reference (Auto-Generated) (GO_WITH_TECH_DEBT)
- 051-007: Config Migration Helper (GO_WITH_TECH_DEBT)
- 051-008: Deploy Configuration (GO_WITH_TECH_DEBT)

---
## Sprint 52 — sprint-052

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 219s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 218952ms |

### Tasks

- 052-001: Dashboard Full Expansion (GO_WITH_TECH_DEBT)

---
## Sprint 53 — sprint-053

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 2405s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 2 |
| Tech Debt | 1 |
| No-Go | 6 |
| Coverage | 46.0% |
| Duration | 2405455ms |

### Tasks

- 053-001: Self-Healing Bootstrap — Auto-Migration on Startup (GO_WITH_TECH_DEBT)
- 053-002: Agent Activation — 8 Agent'ı Gerçekten Çalıştır (NO_GO)
- 053-003: Skill Injection — 10 Skill'i Worker'lara Inject Et (DONE)
- 053-004: Rich Sprint Output — Normal Mode'da Tam Bilgi (NO_GO)
- 053-005: docs/ Reorganizasyonu + Core Docs Güncellemesi (NO_GO)
- 053-006: Brain Self-Learning Enhancement (NO_GO)
- 053-007: README + .claude/rules/ + Dogfooding Güncellemesi (NO_GO)
- 053-008: Easy Create + Provider Native Support (NO_GO)

---

## Sprint 54 — sprint-054

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 185s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 184662ms |

### Tasks

- 054-001: Agent Activation — systemPrompt + Worker Injection (GO_WITH_TECH_DEBT)
- 054-002: Brain Self-Learning — Config Suggestions + Pattern Detection (GO_WITH_TECH_DEBT)
- 054-003: Rich Sprint Output + README Update (GO_WITH_TECH_DEBT)
- 054-004: docs/ Reorganization + .claude/rules/ Update (GO_WITH_TECH_DEBT)

---

## Sprint 55 — sprint-055

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 1015s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 10 |
| Tech Debt | 10 |
| No-Go | 0 |
| Coverage | 10.6K+ tests |
| Duration | 1014758ms |

### Tasks

- 055-001: Retro Parse/Write Format Uyumsuzluğu Fix + --compare Bug (P0 KRİTİK) (GO_WITH_TECH_DEBT)
- 055-002: Kill Komutu Task Status + Lock Temizliği + --all Flag (P0 KRİTİK) (GO_WITH_TECH_DEBT)
- 055-003: readLanguage + readJsonSafe Tam DRY Temizliği (P1) (GO_WITH_TECH_DEBT)
- 055-004: Config Set Nested Key + Import DeepMerge + Config Get (P1) (GO_WITH_TECH_DEBT)
- 055-005: Spawn Komutu Prompt Zenginleştirme + Status Kontrolü (P1) (GO_WITH_TECH_DEBT)
- 055-006: Doctor --json + Retro --json Flag'leri (P2) (GO_WITH_TECH_DEBT)
- 055-007: Cleanup --dry-run Flag'i (P2) (GO_WITH_TECH_DEBT)
- 055-008: Agent Delete + Edit Komutları (P2) (GO_WITH_TECH_DEBT)
- 055-009: Skill Enable/Disable + Delete Komutları (P2) (GO_WITH_TECH_DEBT)
- 055-010: Explain --sprint Flag + Goal Bilgisi + Dil Desteği (P2) (GO_WITH_TECH_DEBT)

---

## Sprint 56 — sprint-056

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 2405s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Completed | 7 |
| Tech Debt | 7 |
| No-Go | 13 |
| Coverage | 11.2K+ tests |
| Duration | 2404678ms |

### Tasks

- 056-001: Doc Updater Referans Fix + CHANGELOG Konsolidasyonu (GO_WITH_TECH_DEBT)
- 056-002: init Bug Fix — deepMerge + .deck Security + Provider Wizard (GO_WITH_TECH_DEBT)
- 056-003: init UX — Auto Lang, Recommendation, Re-init, Error Recovery (GO_WITH_TECH_DEBT)
- 056-004: plan Core — Async Usage, Dry-Run, Idempotency, Safeguard (GO_WITH_TECH_DEBT)
- 056-005: plan Quality — Parser, i18n, Context Priority, Error Logging (GO_WITH_TECH_DEBT)
- 056-006: start Core — Wait Timeout, Spawn Retry, Zero-Config, Phase Persistence (GO_WITH_TECH_DEBT)
- 056-007: start Quality — Provider Cache, Dashboard Usage, Cleanup Finally, --watch Alt (GO_WITH_TECH_DEBT)
- 056-008: status Overhaul — Standalone, ETA, NO_COLOR, fs.watch, Verbose (NO_GO)
- 056-009: doctor Improvements — tmux Conditional, .deck Check, Auth, Hints (NO_GO)
- 056-010: retro+explain Quality — Dil, Trend, Agent/Skill Perf, Learnings (NO_GO)
- 056-011: cleanup+decay Overhaul — Auto Decay, Combo, Lock Guard, Archive (NO_GO)
- 056-012: usage Overhaul — Real Tokens, Race Condition, Live Usage, Filters (NO_GO)
- 056-013: history Overhaul — --json, --last, Agent/Skill, Dead Code, Format (NO_GO)
- 056-014: config Quality — list/keys, autoMigrate, Validation, Comment, Env Var (NO_GO)
- 056-015: review+finalize Overhaul — Interactive, Retry, Guard, Duplicate (NO_GO)
- 056-016: serve Security — Rate Limit, Body Size, DeepMerge, Auth, Versioning (NO_GO)
- 056-017: run+test+web Flags — Timeout, Keep, Sandbox, CI, MIME (NO_GO)
- 056-018: sync+onboard+upgrade Polish (NO_GO)
- 056-019: agent+skill+plugin+marketplace+archive-debt Completeness (NO_GO)
- 056-020: dashboard+attach+watch+cross-cutting (NO_GO)

---
## Sprint 57 — sprint-057

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 2410s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 11 |
| Tech Debt | 4 |
| No-Go | 2 |
| Coverage | 61.1% |
| Duration | 2409512ms |

### Tasks

- 057-001: status Overhaul — Standalone, ETA, NO_COLOR, fs.watch, Verbose (DONE)
- 057-002: doctor Improvements — tmux Conditional, .deck Check, Auth, Hints (GO_WITH_TECH_DEBT)
- 057-003: retro+explain Quality — Dil, Trend, Agent/Skill Perf, Learnings (DONE)
- 057-004: cleanup+decay Overhaul — Auto Decay, Combo, Lock Guard, Archive (GO_WITH_TECH_DEBT)
- 057-005: usage Overhaul — Real Tokens, Race Condition, Live Usage, Filters (DONE)
- 057-006: history Overhaul — --json, --last, Agent/Skill, Dead Code, Format (DONE)
- 057-007: config Quality — list/keys, autoMigrate, Validation, Comment, Env Var (DONE)
- 057-008: review+finalize Overhaul — Interactive, Retry, Guard, Duplicate (DONE)
- 057-009: serve Security — Rate Limit, Body Size, DeepMerge, Auth, Versioning (DONE)
- 057-010: run+test+web Flags — Timeout, Keep, Sandbox, CI, MIME (GO_WITH_TECH_DEBT)
- 057-011: sync+onboard+upgrade Polish (GO_WITH_TECH_DEBT)
- 057-012: agent+skill+plugin+marketplace+archive-debt Completeness (NO_GO)
- 057-013: dashboard+attach+watch+cross-cutting (NO_GO)

---
## Sprint 58 — sprint-058

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 297s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 96.0% |
| Duration | 296800ms |

### Tasks

- 058-001: agent+skill+plugin+marketplace+archive-debt Completeness (DONE)
- 058-002: dashboard+attach+watch+cross-cutting (DONE)

---
## Sprint 59 — sprint-059

**Status:** RETROSPECTIVE
**Date:** 2026-03-25
**Duration:** 1868s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 12 |
| Tech Debt | 9 |
| No-Go | 1 |
| Coverage | 24.0% |
| Duration | 1867765ms |

### Tasks

- 059-001: cli-deep-analysis.md Full [DONE] Marking + Doğrulama (GO_WITH_TECH_DEBT)
- 059-002: Agent Activation Fix — forceModel Agent Bypass Kaldır (DONE)
- 059-003: Skill Selection Fix — Task-Specific Seçim + Truncation (DONE)
- 059-004: Scope & GO/NO-GO Fix — filesWrite + Criteria Enrichment (DONE)
- 059-005: Prompt Boilerplate Azaltma + Worker Guide (GO_WITH_TECH_DEBT)
- 059-006: spawn+kill+run Multi-Provider Desteği (GO_WITH_TECH_DEBT)
- 059-007: doctor+watch Provider-Aware Fix (GO_WITH_TECH_DEBT)
- 059-008: MCP Tools Expansion (+6 tools) (NO_GO)
- 059-009: MCP Resources Expansion (+4 resources) (GO_WITH_TECH_DEBT)
- 059-010: MCP Tool Quality — Enrichment + Error Handling (GO_WITH_TECH_DEBT)
- 059-011: Format Tutarlılığı + Dead Code Temizliği (GO_WITH_TECH_DEBT)
- 059-012: Sync Genişleme (Gemini/Cursor/Codex Adapters) (GO_WITH_TECH_DEBT)
- 059-013: Doc Updater Fix + CHANGELOG Konsolidasyonu (GO_WITH_TECH_DEBT)

---
## Sprint 60 — sprint-060

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 697s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 16.0% |
| Duration | 696894ms |

### Tasks

- 060-001: Fix debt: Tech debt from 057-012-fix: All agent/skill/plugin/marketplace/archive-debt impr (DONE)
- 060-002: CLI Komut + Flag Doğrulama (GO_WITH_TECH_DEBT)
- 060-003: Agent Pool + Skill Pool Doğrulama (GO_WITH_TECH_DEBT)
- 060-004: MCP Tool + Resource Doğrulama (GO_WITH_TECH_DEBT)
- 060-005: Sprint Lifecycle + Format Tutarlılık Doğrulama (GO_WITH_TECH_DEBT)
- 060-006: Doctor + Config + Provider Doğrulama (GO_WITH_TECH_DEBT)

---
## Sprint 61 — sprint-061

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 1658s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 36.0% |
| Duration | 1658254ms |

### Tasks

- 061-001: Agent Assignment Persistence Fix (P0 CRITICAL) (DONE)
- 061-002: Agent Stats Update Fix (P0 CRITICAL) (DONE)
- 061-003: Agent List Display Fix + History Agent Column (P1) (GO_WITH_TECH_DEBT)
- 061-004: Plan Standalone Provider Bootstrap (P0) (DONE)
- 061-005: Brain Budget Decay + Memory Temizliği (P0) (GO_WITH_TECH_DEBT)
- 061-006: Open Debt Cleanup (debt-059-008-fix) (P1) (GO_WITH_TECH_DEBT)
- 061-007: Framework Detection + Analyzer Fix (P2) (GO_WITH_TECH_DEBT)
- 061-008: Remaining CLI Polish (GO_WITH_TECH_DEBT)

---
## Sprint 62 — sprint-062

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 1006s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 59.9% |
| Duration | 1005520ms |

### Tasks

- 062-001: ci-guardian Agent Tanımı + PROMPT.md (DONE)
- 062-002: ci-testing Skill Tanımı + SKILL.md (GO_WITH_TECH_DEBT)
- 062-003: beforeSprint Hook — Pre-Sprint CI Validation (DONE)
- 062-004: afterTask Hook — Task-Level Regression Detection (DONE)
- 062-005: afterSprint Hook — Sprint CI Raporu (DONE)
- 062-006: CI Dashboard Entegrasyonu (GO_WITH_TECH_DEBT)
- 062-007: GitHub Actions Workflow İyileştirme (GO_WITH_TECH_DEBT)
- 062-008: CI Learning — Sprint-to-Sprint Öğrenme (DONE)

---
## Sprint 64 — sprint-064

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 2552s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 14 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 14 |
| Coverage | 53.3% |
| Duration | 2552289ms |

### Tasks

- 064-001: init Kalan — Build/Test Dinamik + Çift Çağrı + --env Çakışma (NO_GO)
- 064-002: plan Kalan — Timeout, Parser, Safeguard, Logging, Default, Truncation (NO_GO)
- 064-003: start Kalan — Sandbox, Zero-Config, Fix Timeout, Queue, Usage, Watch, Phase (NO_GO)
- 064-004: status Kalan — Regex, Stale, Budget, Alert (NO_GO)
- 064-005: doctor Kalan — Memory Dedup, Debt Cache, ErrorRegistry, Permission, Subscription (NO_GO)
- 064-006: retro Kalan — Parse Fix, Learnings Kalite, Arşivleme (NO_GO)
- 064-007: cleanup Kalan — Çift Geçiş, Sahte Sprint, destroy, Decay, Parse, .gitignore (NO_GO)
- 064-008: usage + history Kalan — Canlı Usage, Subscription, Trend, Format, İçerik (NO_GO)
- 064-009: config Kalan — autoMigrate, Modes, Validation (NO_GO)
- 064-010: spawn/kill + attach/watch Kalan — Scope, Subprocess, Multi-Provider, Watch (NO_GO)
- 064-011: analyze Kalan — Birleştirme, Git Fallback, Cache, LOC, Monorepo, Dep Cap (NO_GO)
- 064-012: Küçük Komut Kalan — dashboard/sync/run/test/agent/skill/marketplace/explain (NO_GO)
- 064-013: review/finalize/onboard/upgrade/plugin/archive-debt Kalan (NO_GO)
- 064-014: Dokümantasyon Restore + cli-deep-analysis Final (NO_GO)

---
## Sprint 65 — sprint-065

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 1630s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 6 |
| No-Go | 0 |
| Coverage | 13.7% |
| Duration | 1630087ms |

### Tasks

- 065-001: plan — AI Planner Timeout Configurable (GO_WITH_TECH_DEBT)
- 065-002: config — autoMigrateOnLoad + Modes Nesting (GO_WITH_TECH_DEBT)
- 065-003: cleanup — Çift Geçiş, Sahte Sprint, destroy Session, .gitignore (GO_WITH_TECH_DEBT)
- 065-004: spawn — Scope Enforcement + Multi-Provider (GO_WITH_TECH_DEBT)
- 065-005: analyze — Wrapper Birleştirme + Monorepo (GO_WITH_TECH_DEBT)
- 065-006: history Trend + retro Archive (DONE)
- 065-007: Dokümantasyon — CHANGELOG/SPRINT-LOG Restore + cli-deep-analysis Final (GO_WITH_TECH_DEBT)

---
## Sprint 66 — sprint-066

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 912s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 911680ms |

### Tasks

- 066-001: Phantom Modüller — prompt-token-optimizer + ecosystem-intelligence (DONE)
- 066-002: Manifest v2 Batch Update — 20 Dosya (GO_WITH_TECH_DEBT)
- 066-003: PlannerTask Interface + enrichScope + api-surface Contract (DONE)
- 066-004: MCP Dokumantasyon Tutarlilik — 16 Tool + 9 Resource (GO_WITH_TECH_DEBT)
- 066-005: Stale Heartbeat Root Cause + Config routing_engine Validation (DONE)
- 066-006: Housekeeping — gitignore + IDENTITY Sayilari (GO_WITH_TECH_DEBT)
- 066-007: V1+V2 Paralel Dogrulama + decision-engine Analizi (DONE)

---
## Sprint 67 — sprint-067

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 2550s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 5 |
| Tech Debt | 4 |
| No-Go | 1 |
| Coverage | 19.2% |
| Duration | 2549712ms |

### Tasks

- 067-001: Fix debt: Tech debt from 064-004-fix: Added 11 targeted tests to tests/cli/helpers/output. (GO_WITH_TECH_DEBT)
- 067-002: npm Paket Boyutu Optimizasyonu — 768KB → <500KB (NO_GO)
- 067-003: Job State Sprint Sonuçları — finalizeSprint → job file (DONE)
- 067-004: Retro Detay Zenginlestirme — Worker Notes Aktarimi (GO_WITH_TECH_DEBT)
- 067-005: any Kullanimi Temizligi — 10 Adet, 7 Dosya (GO_WITH_TECH_DEBT)
- 067-006: V2 Routing Dogrulama — Audit + IDENTITY Guncelleme (GO_WITH_TECH_DEBT)

---
## Sprint 68 — sprint-068

**Status:** RETROSPECTIVE
**Date:** 2026-03-26
**Duration:** 1034s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1033527ms |

### Tasks

- 068-001: MCP Server Instructions — AI System Prompt Injection (GO_WITH_TECH_DEBT)
- 068-002: Tool Descriptions + Annotations Zenginlestirme (GO_WITH_TECH_DEBT)
- 068-003: deckent_help Tool — Runtime Capabilities + State (GO_WITH_TECH_DEBT)
- 068-004: DECKENT.md AI-Native Rehber Genisletme (DONE)
- 068-005: deckent init Multi-Ortam Adapter (DONE)
- 068-006: V2 Routing E2E Dogrulama Testi (DONE)

---
## Sprint 69 — sprint-069

**Status:** RETROSPECTIVE
**Date:** 2026-03-27
**Duration:** 2413s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 4 |
| Tech Debt | 2 |
| No-Go | 2 |
| Coverage | 48.0% |
| Duration | 2412549ms |

### Tasks

- 069-001: Skill Stats Tracking — uses/successRate/avgCoverage (DONE)
- 069-002: Agent Secim Hassasiyeti — test-writer Exclude + Intent Weights (GO_WITH_TECH_DEBT)
- 069-003: Skill Secim Butcesi — Dinamik maxTokens + Priority (GO_WITH_TECH_DEBT)
- 069-004: Outcome-Based Ogrenme Guclendirme — Agent/Skill Bonus (DONE)
- 069-005: TempAgent Mekanizmasi — Proje-Bazli Dinamik Agent (NO_GO)
- 069-006: Scope Parser Root Dosya Fix + forceSkills V2 Entegrasyonu (NO_GO)

---

## Sprint 070 — Init UX Overhaul + Windows Dogfooding

**Status:** COMPLETE
**Date:** 2026-03-27
**Version:** 0.2.0-beta.2

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | — (manual implementation) |

### Tasks

- 070-001: IDENTITY.md dangling reference fix + stack detection zorunlu (DONE)
- 070-002: DIRECTIVES.md stack-aware zengin şablon TR/EN (DONE)
- 070-003: DECKENT.md Workflow + DIRECTIVES Format + Providers rehberi (DONE)
- 070-004: Worker rules stack-aware + brain.md budget 200→300, 600→900 (DONE)
- 070-005: TempSkill + TempAgent init'te oluşturma (DONE)
- 070-006: .deckent/docs/ quick-start, directives-guide, config-reference (DONE)
- 070-007: BOOT.md kullanıcı-dostu güncelleme TR/EN (DONE)
- 070-008: BUG-3 Claude CLI spawn ENOENT Windows — shell:true 7 dosyada (DONE)

### Bug Fixes

- BUG-3: Claude CLI spawn ENOENT (Windows) — shell:true
- BUG-4: Worker rules hardcoded tsc --noEmit → stack-aware
- BUG-6: Stack detection Language: unknown → her zaman çalıştır
- BUG-7: Doctor FAIL+OK çelişkisi → SKIP etiketi
- BUG-8: Framework next (fastapi olmalı) → dil guard
- BUG-9: IDENTITY.md eksik → workspace IDENTITY.md oluştur
- BUG-10: DECKENT.md Build: tsc → empty string falsy fix
- BUG-11: DIRECTIVES.md boş placeholder → stack-aware şablon
- BUG-12: Worker rules hardcoded vitest → detectFullStack
- BUG-13: Brain rules yanlış limitler → 300/900
- BUG-14: TempAgent oluşturulmuyor → detectedLanguages eşleşme
- BUG-15: BOOT.md ipucu yok → kullanıcı-dostu TR/EN
- BUG-16: ps -o Windows → platform guard
- BUG-18: MCP binary adı → deckent-mcp dokümantasyon

### Notes

İlk gerçek Windows dogfooding — Vizetron (Python/FastAPI) projesinde. 15 bug bulundu ve düzeltildi.

---

## Sprint 071 — Dogfooding Bug Fixes + Upgrade

**Status:** COMPLETE
**Date:** 2026-03-27
**Version:** 0.2.0-beta.3

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | — (manual implementation) |

### Tasks

- 071-001: BUG-21 Doctor healthScore=0 fix — c.ok→c.passed (DONE)
- 071-002: BUG-22 Review archive fallback (DONE)
- 071-003: BUG-23 Subprocess heartbeat periyodik update setInterval 15s (DONE)
- 071-004: BUG-25 Scope parser explicit Files/Scope label parsing (DONE)
- 071-005: BUG-26 Windows log FD closeSync → child exit handler (DONE)
- 071-006: BUG-19 UTF-8 encoding env vars (DONE)
- 071-007: BUG-24 Worker fallback .result on exit (DONE)
- 071-008: Version bump beta.3 + deckent upgrade --local (DONE)

### Bug Fixes

- BUG-19: UTF-8 encoding — LANG + PYTHONIOENCODING env
- BUG-21: Doctor healthScore c.ok→c.passed field mismatch
- BUG-22: Review No tasks found → archive/ fallback
- BUG-23: Heartbeat 28x stale → setInterval 15s periodic
- BUG-24: Worker .result yok → fallback on exit
- BUG-25: Scope parser Files/Scope ignored → explicit parsing
- BUG-26: Task log boş → closeSync child exit handler

### Notes

Vizetron sprint-002 başarıyla tamamlandı (PROJECT_ANALYSIS.md, 242 satır). 7 yeni bug düzeltildi. `deckent upgrade --local` eklendi.

---
## Sprint 70 — sprint-070

**Status:** RETROSPECTIVE
**Date:** 2026-03-27
**Duration:** 1888s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 57.6% |
| Duration | 1888193ms |

### Tasks

- 070-001: Plan Tier Generalizasyonu — Claude-Specific → Genel (GO_WITH_TECH_DEBT)
- 070-002: Init Wizard Genel Provider Seçimi (GO_WITH_TECH_DEBT)
- 070-003: Model İsimleri Güncelliği + Doğrulama (DONE)
- 070-004: README.md Güncel Özellikler (GO_WITH_TECH_DEBT)
- 070-005: sprint-controller.ts God Object Split — Faz 1 (GO_WITH_TECH_DEBT)

---
## Sprint 71 — sprint-071

**Status:** RETROSPECTIVE
**Date:** 2026-03-30
**Duration:** 1061s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1060816ms |

### Tasks

- 071-001: Worker Feedback Test — fs Mock Fix (43 fail) (DONE)
- 071-002: Brain Test — statSync Mock Fix (16 fail) (GO_WITH_TECH_DEBT)
- 071-003: Doctor Command Logic Fix (9 fail) (DONE)
- 071-004: Stack/CI/Analyzer Detection Fix (23 fail) (DONE)
- 071-005: Kalan Mock/Integration Fix (3 fail) (GO_WITH_TECH_DEBT)

---

## Sprint 72 — sprint-072

**Status:** RETROSPECTIVE
**Date:** 2026-03-28
**Duration:** 1847s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | 1846945ms |

### Tasks

- 072-001: Plan Tier Generalizasyonu — Claude-Specific → Genel (GO_WITH_TECH_DEBT)
- 072-002: Init Wizard Genel Provider Seçimi (NO_GO)
- 072-003: Model İsimleri Güncelliği + Doğrulama (DONE)
- 072-004: README.md Güncel Özellikler (GO_WITH_TECH_DEBT)
- 072-005: sprint-controller.ts God Object Split — Faz 1 (GO_WITH_TECH_DEBT)

### Notes

Tier generalizasyonu ve model API ID'leri güncellendi. God object split başlatıldı (sprint-phases.ts extract). Init wizard provider seçimi task'ı başarısız oldu.

---

## Sprint 73 — sprint-073

**Status:** RETROSPECTIVE
**Date:** 2026-03-29
**Duration:** 1061s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1060815ms |

### Tasks

- 073-001: Worker Feedback Test — fs Mock Fix (43 fail) (DONE)
- 073-002: Brain Test — statSync Mock Fix (16 fail) (GO_WITH_TECH_DEBT)
- 073-003: Doctor Command Logic Fix (9 fail) (DONE)
- 073-004: Stack/CI/Analyzer Detection Fix (23 fail) (DONE)
- 073-005: Kalan Mock/Integration Fix (3 fail) (GO_WITH_TECH_DEBT)

### Notes

100 test regresyonu düzeltildi: 43 fs mock, 16 brain mock, 9 doctor logic, 23 stack/CI, 3 integration. 12,161 test passed, 15 skipped (12,176 total). Agent: test-writer, Skill: testing-expert.

---
## Sprint 72 — sprint-072

**Status:** RETROSPECTIVE
**Date:** 2026-03-30
**Duration:** 449s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 448715ms |

### Tasks

- 072-001: Fix debt: Tech debt from 069-005-fix: TempAgent mechanism was already fully implemented in (GO_WITH_TECH_DEBT)
- 072-002: Fix debt: Tech debt from 069-006-fix: A) Fixed extractScopeFromDirective bug: docFileMatch (DONE)
- 072-003: README.md Güncellemesi — Test Sayıları + Sprint Bilgisi (DONE)
- 072-004: CHANGELOG.md + docs/CHANGELOG.md Güncelleme (DONE)
- 072-005: .brain/ Dokümantasyon Tutarlılığı — RETRO, MEMORY, PROJECT-IDENTITY (GO_WITH_TECH_DEBT)
- 072-006: DECKENT.md + CLAUDE.md Tutarlılık Kontrolü (GO_WITH_TECH_DEBT)
- 072-007: docs/SPRINT-LOG.md Güncelleme (GO_WITH_TECH_DEBT)

---
## Sprint 73 — sprint-073

**Status:** RETROSPECTIVE
**Date:** 2026-03-30
**Duration:** 1025s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 19.2% |
| Duration | 1024711ms |

### Tasks

- 073-001: Dokümantasyon Dil Stratejisi — TR/EN Tutarlılık (GO_WITH_TECH_DEBT)
- 073-002: VISION.md — Proje Vizyonu ve Yol Haritası (GO_WITH_TECH_DEBT)
- 073-003: docs/ Link Audit — Kırık Link Kontrolü (GO_WITH_TECH_DEBT)
- 073-004: .detect-secrets Kurulumu — Pre-commit Güvenlik (GO_WITH_TECH_DEBT)
- 073-005: God Object Split Faz 2 — sprint-controller Utility Extract (DONE)

---
## Sprint 74 — sprint-074

**Status:** RETROSPECTIVE
**Date:** 2026-03-30
**Duration:** 663s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 58.4% |
| Duration | 663378ms |

### Tasks

- 074-001: Stale Heartbeat Root Cause Fix (410x pattern) (GO_WITH_TECH_DEBT)
- 074-002: Dashboard API Entegrasyon Testi (P3-20,22) (GO_WITH_TECH_DEBT)
- 074-003: Worker Graceful Shutdown — Sprint State Tutarlılığı (P6-40) (GO_WITH_TECH_DEBT)
- 074-004: God Object Split Faz 3 — Result Collector Extract (GO_WITH_TECH_DEBT)
- 074-005: BETA-ROADMAP Güncelleme + Sprint Tablosu (DONE)

---
## Sprint 76 — sprint-076

**Status:** RETROSPECTIVE
**Date:** 2026-03-30
**Duration:** 663s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 58.4% |
| Duration | 663378ms |

### Tasks

- 076-001: Stale Heartbeat Root Cause Fix (finalizeHeartbeat + auditor DONE skip) (GO_WITH_TECH_DEBT)
- 076-002: Dashboard API Entegrasyon Testi — 10 yeni test, 6 describe block (GO_WITH_TECH_DEBT)
- 076-003: Worker Graceful Shutdown — SIGINT → interruptActiveSprint + killAllSessions (GO_WITH_TECH_DEBT)
- 076-004: God Object Split Faz 3 — result-collector.ts extract (GO_WITH_TECH_DEBT)
- 076-005: BETA-ROADMAP Güncelleme + Sprint Tablosu (DONE)

### Notes

Sprint 076: Stale heartbeat 410x pattern giderildi (finalizeHeartbeat). 10 dashboard API entegrasyon testi eklendi. Graceful shutdown zinciri (SIGINT → interruptActiveSprint → killAllSessions) kuruldu. God object split faz 3 tamamlandı: result-collector.ts extract edildi.

---
## Sprint 75 — sprint-075

**Status:** RETROSPECTIVE
**Date:** 2026-03-30
**Duration:** 270s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 33.3% |
| Duration | 270322ms |

### Tasks

- 075-001: CHANGELOG + SPRINT-LOG Güncelleme (GO_WITH_TECH_DEBT)
- 075-002: .brain/ Güncelleme — PROJECT-IDENTITY + DECISIONS (GO_WITH_TECH_DEBT)
- 075-003: CLAUDE.md + DECKENT.md Modül Sayısı Güncelleme (DONE)

---
## Sprint 78 — sprint-078

**Status:** COMPLETE
**Date:** 2026-04-01
**Duration:** ~300s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 0 |
| No-Go | 0 |

### Tasks

- 078-001: Blueprint Senkronizasyonu — MCP 10→17 tools, 5→9 resources (DONE)
- 078-002: ANA-PLAN-TR.md Güncelleme — CLI 21→32, MCP sayıları, sprint tablosu (DONE)
- 078-003: BETA-ROADMAP Sprint 076-077 DONE, Sprint 078 AKTİF (DONE)
- 078-004: brain.md + docs/ Memory Budget 600→900 (DONE)

### Notes

Sprint 078: Dokümantasyon senkronizasyonu. Blueprint, ANA-PLAN-TR ve BETA-ROADMAP dosyaları gerçek duruma getirildi. Memory budget 600→900 olarak güncellendi (MEMORY 200→300, RETRO 100→120). MCP araç sayıları 10→17, kaynak sayıları 5→9 olarak düzeltildi.

---
## Sprint 79 — sprint-079

**Status:** COMPLETE
**Date:** 2026-04-01
**Duration:** ~400s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |

### Tasks

- 079-001: Dashboard i18n — LanguageProvider, 90+ TR/EN key, sidebar dil switcher (DONE)
- 079-002: README-TR.md + VISION-EN.md — TR/EN çift dil dokümantasyon (DONE)
- 079-003: GET /api/tasks endpoint — .tasks/ dizininden task listesi (DONE)

### Notes

Sprint 079: Dashboard i18n altyapısı kuruldu: LanguageProvider, 90+ anahtar (TR/EN), sidebar dil switcher. README-TR.md (466 satır) ve VISION-EN.md (110 satır) oluşturuldu. GET /api/tasks REST endpoint eklendi. Blueprint testleri 10→17 tools, 5→9 resources olarak güncellendi.

---
## Sprint 80 — sprint-080

**Status:** COMPLETE
**Date:** 2026-04-01
**Duration:** ~350s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |

### Tasks

- 080-001: SSE Bağlantı Durumu Göstergesi — connected/connecting/disconnected (DONE)
- 080-002: ConfigPage Mode Seçenekleri — performance/balanced/economic + memory_budget 600→900 (DONE)
- 080-003: ConfigPage language alanı text→select + SettingsPage mode güncelleme (DONE)

### Notes

Sprint 080: Dashboard zenginleştirildi. SSE bağlantı durumu göstergesi eklendi (connected/connecting/disconnected). ConfigPage mode seçenekleri performance/balanced/economic olarak güncellendi, memory_budget varsayılanı 900'e yükseltildi. Language alanı text→select olarak düzeltildi.

---
## Sprint 76 — sprint-076

**Status:** RETROSPECTIVE
**Date:** 2026-04-01
**Duration:** 417s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 416572ms |

### Tasks

- 076-001: CHANGELOG Sprint 078-080 Entry (GO_WITH_TECH_DEBT)
- 076-002: SPRINT-LOG Sprint 078-080 Entry (DONE)
- 076-003: PROJECT-IDENTITY Güncelleme (GO_WITH_TECH_DEBT)
- 076-004: HistoryPage Success Rate Trend Bileşeni (GO_WITH_TECH_DEBT)

---
## Sprint 77 — sprint-077

**Status:** RETROSPECTIVE
**Date:** 2026-04-01
**Duration:** 2034s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 2 |
| Tech Debt | 1 |
| No-Go | 2 |
| Coverage | NaN% |
| Duration | 2033560ms |

### Tasks

- 077-001: README-TR.md Türkçe Karakter Düzeltme (NO_GO)
- 077-002: DashboardPage Sprint Kontrol Butonları (GO_WITH_TECH_DEBT)
- 077-003: Init Dil Seçimi İlk Adım (DONE)
- 077-004: /api/cleanup Endpoint (NO_GO)

---
## Sprint 78 — sprint-078

**Status:** RETROSPECTIVE
**Date:** 2026-04-01
**Duration:** 546s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 546212ms |

### Tasks

- 078-001: WorkerCard Bileşeni — Canlı Agent Kart Grid (GO_WITH_TECH_DEBT)
- 078-002: SprintPhaseTimeline Bileşeni — Faz Görsel Akışı (DONE)
- 078-003: ActivityFeed Bileşeni — Canlı Aktivite Akışı (GO_WITH_TECH_DEBT)
- 078-004: DashboardPage Layout Yeniden Düzenleme (GO_WITH_TECH_DEBT)

---
## Sprint 79 — sprint-079

**Status:** RETROSPECTIVE
**Date:** 2026-04-01
**Duration:** 758s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 758327ms |

### Tasks

- 079-001: Settings + Config Sayfa Birleştirme (DONE)
- 079-002: i18n Tam Kapsam — Kalan Hardcoded String'ler (GO_WITH_TECH_DEBT)
- 079-003: Config Yazma Doğrulama + Geri Okuma (GO_WITH_TECH_DEBT)
- 079-004: Dashboard İşlemlerinin Terminal Çıktısı (DONE)

---
## Sprint 80 — sprint-080

**Status:** RETROSPECTIVE
**Date:** 2026-04-02
**Duration:** 885s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 16.7% |
| Duration | 885182ms |

### Tasks

- 080-001: Fix debt: Tech debt from 077-001-fix: README-TR.md already contains correct UTF-8 Turkish (GO_WITH_TECH_DEBT)
- 080-002: Fix debt: Tech debt from 077-004-fix: POST /api/cleanup endpoint was already fully impleme (GO_WITH_TECH_DEBT)
- 080-003: MCP Tool Parametre Zenginleştirme — init, start, status, doctor (GO_WITH_TECH_DEBT)
- 080-004: CLI set-directives Komutu (GO_WITH_TECH_DEBT)
- 080-005: MCP agent_list + skill_list Tool'ları (GO_WITH_TECH_DEBT)
- 080-006: ADR-022 Parity Dokümantasyonu (DONE)

---
## Sprint 81 — sprint-081

**Status:** RETROSPECTIVE
**Date:** 2026-04-02
**Duration:** 698s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 49.0% |
| Duration | 697974ms |

### Tasks

- 081-001: Usage Manager — Gerçekçi Tahmin + Dashboard Düzeltme (GO_WITH_TECH_DEBT)
- 081-002: Package Version Bump + CHANGELOG (DONE)
- 081-003: Init Test Mock Düzeltme (GO_WITH_TECH_DEBT)
- 081-004: AGENTS.md + Kalan Docs Tutarlılık (DONE)

---
## Sprint 82 — sprint-082

**Status:** RETROSPECTIVE
**Date:** 2026-04-02
**Duration:** 473s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 473469ms |

### Tasks

- 082-001: Skeleton Loading Bileşenleri (GO_WITH_TECH_DEBT)
- 082-002: AgentDetail Zenginleştirme (GO_WITH_TECH_DEBT)
- 082-003: Empty State Bileşenleri (GO_WITH_TECH_DEBT)
- 082-004: Dashboard Genel Polish (GO_WITH_TECH_DEBT)

---
## Sprint 83 — sprint-083

**Status:** RETROSPECTIVE
**Date:** 2026-04-02
**Duration:** 359s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 32.0% |
| Duration | 359468ms |

### Tasks

- 083-001: CHANGELOG + SPRINT-LOG Sprint 078-082 Toplu Güncelleme (GO_WITH_TECH_DEBT)
- 083-002: PROJECT-IDENTITY + VISION Sayı Güncelleme (DONE)
- 083-003: Dashboard Vite Build + dist/ Güncelleme (GO_WITH_TECH_DEBT)

---
## Sprint 84 — sprint-084

**Status:** COMPLETE
**Date:** 2026-04-02
**Duration:** ~480s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 96.0% |
| Duration | ~480s |

### Tasks

- 084-001: AgentDetail Penceresi — Okunabilirlik ve Boyut Fix (DONE)
- 084-002: i18n Kalan Hardcoded String'ler — Tam Kapsam (DONE)
- 084-003: Dashboard Canlı Veri Akışı Doğrulama (DONE)
- 084-004: Dashboard Build Otomasyonu (DONE)

### Decisions
- AgentDetail Sheet genişliği 400→600px, sm:500→700px artırıldı
- ScrollArea kaldırıldı, overflow-auto div ile değiştirildi (scrollbar görünürlüğü)
- ConfigPage i18n: fieldT() helper pattern ile runtime çeviri (fallback: İngilizce)
- 79 yeni i18n key eklendi (38 label + 38 desc + 3 dropdown)
- 41 yeni canlı veri testi (SSE hook, WorkerCard, ActivityFeed, SprintPhaseTimeline)
- build:dashboard + build:all + postbuild script'leri eklendi

### Notes
- tsc --noEmit: temiz (0 hata)
- Dashboard testleri: 14 dosya, 413 test geçti (önceki 372 + 41 yeni)
- %100 GO — sıfır tech debt, sıfır NO_GO

---
## Sprint 86 — sprint-086

**Status:** RETROSPECTIVE
**Date:** 2026-04-02
**Duration:** 1504s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 48.0% |
| Duration | 1504236ms |

### Tasks

- 086-001: Tech Debt Kapatma — routeTaskV2 Cagri Yerleri + Kalan Catch Bloklari (GO_WITH_TECH_DEBT)
- 086-002: Intent Classifier Feedback Loop (DONE)
- 086-003: Planner'a Gecmis Bilgisi Enjeksiyonu (GO_WITH_TECH_DEBT)
- 086-004: Coverage Threshold Config + Adaptive Thresholds (DONE)

---
## Sprint 87 — sprint-087

**Status:** RETROSPECTIVE
**Date:** 2026-04-02
**Duration:** 1905s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1904812ms |

### Tasks

- 087-001: Kalan Sessiz Catch Bloklari — Son Dalga (EXECUTING)
- 087-002: Tech Debt Kapatma — Eksik Entegrasyonlar (EXECUTING)
- 087-003: Adaptive Thresholds — NO_GO Rate Bazli Otomatik Ayar (EXECUTING)
- 087-004: Mid-Sprint Reroute Guclendirme — Max 1 → 3 (EXECUTING)

---
## Sprint 88 — sprint-088

**Status:** COMPLETE
**Date:** 2026-04-02
**Duration:** ~45m (WSL crash ile kesintili)

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 96%+ |
| Duration | ~2700s |

### Tasks

- 088-001: Sprint Timeout Reformu — Sınırsız Çalışma Desteği (GO_WITH_TECH_DEBT)
- 088-002: Heartbeat Daemon — Proaktif Görev Sistemi (GO_WITH_TECH_DEBT)
- 088-003: Human Checkpoints — Sprint Fazlarında Onay Noktaları (GO_WITH_TECH_DEBT)
- 088-004: README + IDENTITY + Docs Final Polish (DONE)

---
## Sprint 88 — sprint-088

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 948s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 24.0% |
| Duration | 948145ms |

### Tasks

- 088-001: Adaptive Thresholds — NO_GO Rate Bazlı Otomatik Ayar (DONE)
- 088-002: Mid-Sprint Reroute Güçlendirme — Max 3 + Config (GO_WITH_TECH_DEBT)
- 088-003: Checkpoint CLI/MCP Entegrasyonu — Approve/Reject Komutları (GO_WITH_TECH_DEBT)
- 088-004: Kalan Sessiz Catch Blokları — Son Dalga (GO_WITH_TECH_DEBT)

---
## Sprint 89 — sprint-089

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 1193s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1193065ms |

### Tasks

- 089-001: Usage Core Modülleri Kaldır — Tipler, Config, Tracker (GO_WITH_TECH_DEBT)
- 089-002: Usage Orchestra + Provider Modülleri Kaldır (GO_WITH_TECH_DEBT)
- 089-003: Usage CLI + MCP + API + Dashboard Kaldır (GO_WITH_TECH_DEBT)
- 089-004: Usage Test Dosyaları + Dokümantasyon Temizliği (GO_WITH_TECH_DEBT)

---
## Sprint 90 — sprint-090

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 2495s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 2 |
| Tech Debt | 2 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | 2495344ms |

### Tasks

- 090-001: src/ Artık Temizliği — MCP Help, Server, Dashboard, Sprint Types (GO_WITH_TECH_DEBT)
- 090-002: Test Dosyaları Artık Temizliği — Mock, Import, Fixture (NO_GO)
- 090-003: Dokümantasyon + README Artık Temizliği (GO_WITH_TECH_DEBT)

---
## Sprint 91 — sprint-091

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 2084s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 3 |
| Coverage | 0.0% |
| Duration | 2084215ms |

### Tasks

- 091-001: Agent Tiebreaker — learnings.json'dan Oku (GO_WITH_TECH_DEBT)
- 091-002: Promotion/Demotion Execute Et (GO_WITH_TECH_DEBT)
- 091-003: Evolved Rules Activation'a Inject Et (GO_WITH_TECH_DEBT)
- 091-004: updateSkillStats V1 + SkillMap RETRO İçin (GO_WITH_TECH_DEBT)
- 091-005: Hard-Coded Sabitleri Config'den Oku (NO_GO)
- 091-006: Quality Score Routing Bonus'a Entegre Et (NO_GO)
- 091-007: Integration Test — Tam Evolution Pipeline (NO_GO)

---
## Sprint 92 — sprint-092

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 577s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 577487ms |

### Tasks

- 092-001: Config.json Agresif Temizlik + Tip Güvenliği (GO_WITH_TECH_DEBT)
- 092-002: Dashboard i18n — StatusPage + SprintSummary (~34 key) (GO_WITH_TECH_DEBT)
- 092-003: Dashboard i18n — TaskCard (~30 key) (GO_WITH_TECH_DEBT)
- 092-004: Dashboard i18n — DebtTable + SprintChart + Layout + Kalan (~25 key) (GO_WITH_TECH_DEBT)
- 092-005: i18n Doğrulama — Hardcoded String Tarama + Key Eşitliği (GO_WITH_TECH_DEBT)

---
## Sprint 93 — sprint-093

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 642s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 49.0% |
| Duration | 641560ms |

### Tasks

- 093-001: V2 Stats → Agent.json / Manifest.json Sync (DONE)
- 093-002: RETRO.md Skill Performance Tablosu Düzeltme (GO_WITH_TECH_DEBT)
- 093-003: avgQualityScore Persist Düzeltme + Agent Done Sayacı (GO_WITH_TECH_DEBT)
- 093-004: Sprint Bitişinde Otomatik Output (Job Completion Notification) (GO_WITH_TECH_DEBT)

---
## Sprint 94 — sprint-094

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 443s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 24.0% |
| Duration | 442738ms |

### Tasks

- 094-001: Fix debt: Tech debt from 091-006-fix: Quality Score Routing Bonus entegrasyonu zaten tam o (GO_WITH_TECH_DEBT)
- 094-002: Fix debt: Tech debt from 091-007-fix: Integration test file created with 26 tests across 7 (DONE)
- 094-003: Usage Son Kalıntı Temizliği — README CLI Tablosu (GO_WITH_TECH_DEBT)
- 094-004: Stats Sync Doğrulama Notu (GO_WITH_TECH_DEBT)

---
## Sprint 95 — sprint-095

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 227s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 227043ms |

### Tasks

- 095-001: Skill İsim Uyumsuzluğu Düzeltme (GO_WITH_TECH_DEBT)

---
## Sprint 96 — sprint-096

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 600s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 10 |
| Tech Debt | 9 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 599731ms |

### Tasks

- 096-001: README.md + README-TR.md Sayı ve Tablo Düzeltmeleri (GO_WITH_TECH_DEBT)
- 096-002: DECKENT.md Skill İsimleri + MCP Tablo + Checkpoint (GO_WITH_TECH_DEBT)
- 096-003: CLAUDE.md + IDENTITY.md + PROJECT-IDENTITY.md Sayı Düzeltmeleri (GO_WITH_TECH_DEBT)
- 096-004: docs/reference/cli.md — Usage Komutu Kaldır + Sayılar (GO_WITH_TECH_DEBT)
- 096-005: docs/reference/api.md — Usage + Eski Mod İsimleri Temizliği (GO_WITH_TECH_DEBT)
- 096-006: docs/reference/config-reference.md — Mod İsimleri Canonical Güncelleme (GO_WITH_TECH_DEBT)
- 096-007: docs/architecture/architecture.md — Tam Güncelleme (GO_WITH_TECH_DEBT)
- 096-008: docs/reference/ Kalan Dosyalar — Mod İsimleri + Usage Temizliği (GO_WITH_TECH_DEBT)
- 096-009: docs/guide/ + docs/development/ + docs/architecture/ Kalan — Sayı ve Referans Düzeltmeleri (GO_WITH_TECH_DEBT)
- 096-010: src/cli/commands/init.ts — Skill İsimleri Düzeltme (DONE)

---
## Sprint 97 — sprint-097

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 1113s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 10 |
| No-Go | 0 |
| Coverage | 24.0% |
| Duration | 1113014ms |

### Tasks

- 097-001: ModelRegistry Class + BUILTIN_MODELS Kataloğu (GO_WITH_TECH_DEBT)
- 097-002: task-types.ts Delegasyonu — Registry'den Re-export (GO_WITH_TECH_DEBT)
- 097-003: Provider Adapter Tier Duplicate Kaldırma (GO_WITH_TECH_DEBT)
- 097-004: mode-presets.ts + model_strategy Config Yapısı (GO_WITH_TECH_DEBT)
- 097-005: model-selector.ts Tier-Based Refactor (DONE)
- 097-006: Config Migration v1→v2 + config.json Güncelleme (DONE)
- 097-007: MCP + CLI Model Enum Genişletme (GO_WITH_TECH_DEBT)
- 097-008: Codex Adapter CLI Uyumluluk Güncellemesi (GO_WITH_TECH_DEBT)
- 097-009: Gemini Adapter CLI Uyumluluk + gemini-3.1-pro-preview (GO_WITH_TECH_DEBT)
- 097-010: Init Wizard Provider-Agnostic Tier Seçimi (GO_WITH_TECH_DEBT)
- 097-011: token-counter.ts + sprint-reporter.ts Hard-Code Temizliği (GO_WITH_TECH_DEBT)
- 097-012: Dashboard Test Fix + Integration Test (GO_WITH_TECH_DEBT)

---
## Sprint 98 — sprint-098

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 1321s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1320808ms |

### Tasks

- 098-001: RETRO Done Sayacı — GO_WITH_TECH_DEBT = Done Olarak Sayılmalı (GO_WITH_TECH_DEBT)
- 098-002: Sprint History — Son 5 Sprint Döndürmeli (GO_WITH_TECH_DEBT)
- 098-003: ANALYSIS-2026-04-02.md Güncel Durum Güncellemesi (GO_WITH_TECH_DEBT)
- 098-004: README + DECKENT.md ModelRegistry Özelliği Dokümante (GO_WITH_TECH_DEBT)
- 098-005: PROJECT-IDENTITY + CLAUDE.md Sayı Güncellemeleri (GO_WITH_TECH_DEBT)

---
## Sprint 98 — sprint-098

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 506s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 505655ms |

### Tasks

- 098-001: RETRO Done Sayacı — GO_WITH_TECH_DEBT = Done Olarak Sayılmalı (GO_WITH_TECH_DEBT)
- 098-002: Sprint History — Son 5 Sprint Döndürmeli (GO_WITH_TECH_DEBT)
- 098-003: ANALYSIS-2026-04-02.md Güncel Durum Güncellemesi (GO_WITH_TECH_DEBT)
- 098-004: README + DECKENT.md ModelRegistry Özelliği Dokümante (GO_WITH_TECH_DEBT)
- 098-005: PROJECT-IDENTITY + CLAUDE.md Sayı Güncellemeleri (GO_WITH_TECH_DEBT)

---
## Sprint 99 — sprint-099

**Status:** RETROSPECTIVE
**Date:** 2026-04-06
**Duration:** 976s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 5 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 975872ms |

### Tasks

- 099-001: RETRO Done Sayacı — Evaluations Map Debug + Fix (GO_WITH_TECH_DEBT)
- 099-002: Job Output Reform — Detaylı Gerekçe + Metrik (GO_WITH_TECH_DEBT)
- 099-003: VISION.md + health-check.md + roadmap.md Sayı Güncellemeleri (GO_WITH_TECH_DEBT)
- 099-004: README Badge + ANALYSIS Sprint 098 Güncelleme (GO_WITH_TECH_DEBT)
- 099-005: PROJECT-IDENTITY Test Count Fix + CLAUDE.md Module Count (GO_WITH_TECH_DEBT)

---
## Sprint 100 — sprint-100

**Status:** RETROSPECTIVE
**Date:** 2026-04-07
**Duration:** 2562s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 6 |
| Coverage | NaN% |
| Duration | 2561984ms |

### Tasks

- 100-001: Config Ölü Alan Temizliği (NO_GO)
- 100-002: Constants→Config Entegrasyonu (NO_GO)
- 100-003: Dashboard CONFIG_FIELDS Güncelleme (NO_GO)
- 100-004: Init Wizard İyileştirme (NO_GO)
- 100-005: Worker Result Yazma Güvenilirliği — tmux Timeout + Fallback (NO_GO)
- 100-006: Sprint Status + Dashboard Stale Data Fix (NO_GO)

---
## Sprint 100 — sprint-100

**Status:** RETROSPECTIVE
**Date:** 2026-04-07
**Duration:** 1637s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 32.0% |
| Duration | 1637221ms |

### Tasks

- 100-001: Config Ölü Alan Temizliği (EXECUTING)
- 100-002: Constants→Config Entegrasyonu (EXECUTING)
- 100-003: Dashboard CONFIG_FIELDS Güncelleme (EXECUTING)
- 100-004: Init Wizard İyileştirme (EXECUTING)
- 100-005: Worker Result Yazma Güvenilirliği — tmux Timeout + Fallback (PENDING)
- 100-006: Sprint Status + Dashboard Stale Data Fix (PENDING)

---
## Sprint 101 — sprint-101

**Status:** RETROSPECTIVE
**Date:** 2026-04-07
**Duration:** 2516s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 4 |
| Tech Debt | 2 |
| No-Go | 6 |
| Coverage | NaN% |
| Duration | 2515805ms |

### Tasks

- 101-001: Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten (NO_GO)
- 101-002: Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp (GO_WITH_TECH_DEBT)
- 101-003: Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen (DONE)
- 101-004: Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa (GO_WITH_TECH_DEBT)
- 101-005: Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5 (DONE)
- 101-006: Sprint Singleton + Lock Mekanizması (NO_GO)
- 101-007: Brain Evaluate Fix — Result Dosyalarını Doğru Oku (NO_GO)
- 101-008: Zombie Process Koruması + tmux Cleanup (NO_GO)
- 101-009: Prompt Dosyası Lifecycle Düzeltme (NO_GO)
- 101-010: CLI/MCP Start Parity — Davranış Eşitliği (NO_GO)

---
## Sprint 102 — sprint-102

**Status:** RETROSPECTIVE
**Date:** 2026-04-07
**Duration:** 730s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 6 |
| Coverage | 0.0% |
| Duration | 729931ms |

### Tasks

- 102-001: Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten (NO_GO)
- 102-002: Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp (NO_GO)
- 102-003: Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen (NO_GO)
- 102-004: Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa (NO_GO)
- 102-005: Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5 (NO_GO)
- 102-006: Docker Smoke Test (NO_GO)

---
## Sprint 103 — sprint-103

**Status:** RETROSPECTIVE
**Date:** 2026-04-07
**Duration:** 1197s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 6 |
| Tech Debt | 6 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 1197181ms |

### Tasks

- 103-001: Fix debt: Tech debt from 098-001: buildAgentPerformance() ve buildSkillPerformance() zaten (NO_GO)
- 103-002: Fix debt: Tech debt from 098-002: Root cause: MCP deckent_history tool only read .brain/sp (GO_WITH_TECH_DEBT)
- 103-003: Fix debt: Tech debt from 098-003: ANALYSIS-2026-04-02.md Sprint 097 sonuçlarıyla güncellen (GO_WITH_TECH_DEBT)
- 103-004: Fix debt: Tech debt from 098-004: README.md ve README-TR.md dosyalarındaki sprint badge sa (GO_WITH_TECH_DEBT)
- 103-005: Fix debt: Tech debt from 098-005: Modül sayıları güncellendi: orchestra/ 47→49, core/ 50→5 (GO_WITH_TECH_DEBT)
- 103-006: Docker Backend Integration Test (GO_WITH_TECH_DEBT)
- 103-007: Docker Backend Kullanım Rehberi (GO_WITH_TECH_DEBT)

---
## Sprint 104 — sprint-104

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 124s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 4 |
| Coverage | 0.0% |
| Duration | 123604ms |

### Tasks

- 104-001: README Docker Backend Bolumu (NO_GO)
- 104-002: Version Bump + CHANGELOG (NO_GO)
- 104-003: CLI/MCP Start Parity Duzeltme (NO_GO)
- 104-004: Docker Sprint Canli Dogrulama (NO_GO)

---
## Sprint 105 — sprint-105

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 665s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 24.0% |
| Duration | 665179ms |

### Tasks

- 105-001: Docker Sprint Canli Dogrulama (EXECUTING)
- 105-002: README Docker Backend Bolumu (EXECUTING)
- 105-003: Version Bump + CHANGELOG (EXECUTING)
- 105-004: CLI/MCP Start Parity Kontrol (EXECUTING)

---
## Sprint 106 — sprint-106

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 414s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 33.3% |
| Duration | 413998ms |

### Tasks

- 106-001: Dosya Olusturma Smoke Test (DONE)
- 106-002: Auditor Edge Test Fix (GO_WITH_TECH_DEBT)
- 106-003: Pattern Reader Test Fix (GO_WITH_TECH_DEBT)

---
## Sprint 107 — sprint-107

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 214s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 214306ms |

### Tasks

- 107-001: CLI Smoke Dosyalari (GO_WITH_TECH_DEBT)
- 107-002: Vitest Kontrolu (GO_WITH_TECH_DEBT)

---
## Sprint 108 — sprint-108

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 175s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 175451ms |

### Tasks

- 108-001: Tmux Smoke Dosyalari (GO_WITH_TECH_DEBT)
- 108-002: Tmux Smoke Test Dosyasi (GO_WITH_TECH_DEBT)

---
## Sprint 119 — sprint-119

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 259s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 259362ms |

### Tasks

- 119-001: Docker Verification Files (NO_GO)

---
## Sprint 120 — sprint-120

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 112s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 112426ms |

### Tasks

- 120-001: MCP Docker Test Dosyasi (NO_GO)

---
## Sprint 121 — sprint-121

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 140s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 139788ms |

### Tasks

- 121-001: CLI Docker Test Dosyasi (GO_WITH_TECH_DEBT)

---
## Sprint 122 — sprint-122

**Status:** RETROSPECTIVE
**Date:** 2026-04-08
**Duration:** 150s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 149615ms |

### Tasks

- 122-001: MCP Reconnect Test Dosyasi (GO_WITH_TECH_DEBT)

---
## Sprint 123 — sprint-123

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 270s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 270150ms |

### Tasks

- 123-001: Hybrid Backend ADR Yazımı (GO_WITH_TECH_DEBT)
- 123-002: Heartbeat Tipine Backend Alanı Ekle (GO_WITH_TECH_DEBT)
- 123-003: Dashboard WorkerCard Backend Badge (GO_WITH_TECH_DEBT)

---
## Sprint 124 — sprint-124

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 545s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 545017ms |

### Tasks

- 124-001: Context Estimator — Task Scope Token Tahmini (GO_WITH_TECH_DEBT)
- 124-002: Context-Aware Router — Model Seçimine Budget Faktörü Ekle (GO_WITH_TECH_DEBT)
- 124-003: Token Usage — Worker Result'a Token Verisi Ekle (GO_WITH_TECH_DEBT)
- 124-004: Sprint Reporter Token Summary — RETRO.md Token Tablosu (GO_WITH_TECH_DEBT)

---
## Sprint 125 — sprint-125

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 1257s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 5 |
| Coverage | 0.0% |
| Duration | 1257041ms |

### Tasks

- 125-001: Rubric-Based Grading — Yapılandırılmış Değerlendirme Sistemi (NO_GO)
- 125-002: Worker Question Mechanism — askBrain IPC (NO_GO)
- 125-003: Explain MCP Tool — deckent_explain (NO_GO)
- 125-004: Workspace + DECKENT.md Tutarlılık Düzeltmesi (NO_GO)
- 125-005: BETA-TRACKER Sprint 124 Güncellemesi (NO_GO)

---
## Sprint 126 — sprint-126

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 1252s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 5 |
| Coverage | 0.0% |
| Duration | 1252360ms |

### Tasks

- 126-001: FIX Fazı Evaluations Map Update — CRITICAL Bug Fix (NO_GO)
- 126-002: evaluateResult() → evaluateWithRubric() Geçişi (NO_GO)
- 126-003: CI Guardian Granularity — Task-Spesifik tsc Kontrolü (NO_GO)
- 126-004: Context-Aware Evaluation — Bash Unavailable Toleransı (NO_GO)
- 126-005: Sprint Metrics Post-FIX Doğrulama + Debug Logging (NO_GO)

---
## Sprint 127 — sprint-127

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 447s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 446528ms |

### Tasks

- 127-001: Worker Verify Loop Smoke Test (DONE)
- 127-002: Promotion Pipeline Guard Doğrulaması (GO_WITH_TECH_DEBT)
- 127-003: Sprint Controller İkili Spawn Prevention Testi (DONE)

---
## Sprint 128 — sprint-128

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 2072s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 5 |
| Tech Debt | 1 |
| No-Go | 3 |
| Coverage | 0.0% |
| Duration | 2071740ms |

### Tasks

- 128-001: Fix debt: Tech debt from 125-001-fix: Rubric-Based Grading sistemi sıfırdan implemente edi (DONE)
- 128-002: Fix debt: Tech debt from 125-002-fix: Worker Question Mechanism implemented as file-based (NO_GO)
- 128-003: Fix debt: Tech debt from 125-003-fix: Fixed NO_GO task 125-003 — deckent_explain MCP tool (GO_WITH_TECH_DEBT)
- 128-004: Fix debt: Tech debt from 125-004-fix: All 5 documentation files synchronized with Sprint 1 (NO_GO)
- 128-005: DEBT.md Parse Hatası Düzeltmesi + Sprint Reporter Robustness (DONE)
- 128-006: Evaluator Tutarlılık Reformu — evaluateResult/evaluateWithRubric Birleştirme (DONE)
- 128-007: FIX Fazı Map Mutation Doğrulaması + Tech Debt Kapatma (DONE)

---
## Sprint 129 — sprint-129

**Status:** RETROSPECTIVE
**Date:** 2026-04-09
**Duration:** 883s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 29.8% |
| Duration | 883066ms |

### Tasks

- 129-001: MCP Instructions Fix + Dokümantasyon Kapsamlı Güncelleme (DONE)
- 129-002: Decision-Engine Arşivleme + .brain/ Temizlik + ADR Yazımı (DONE)
- 129-003: Coverage Altyapısı Doğrulama + Gerçek Ölçüm (DONE)

---
## Sprint 132 — sprint-132

**Status:** RETROSPECTIVE
**Date:** 2026-04-10
**Duration:** 1065s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 38.3% |
| Duration | 1065445ms |

### Tasks

- 132-001: W1 — Security & Multi-Tenancy Audit (DONE)
- 132-002: W2 — Performance & Scalability Audit (DONE)
- 132-003: W3 — Reliability (Bugsuz) Audit (DONE)
- 132-004: W4 — Customization & Extensibility Audit (DONE)
- 132-005: W5 — Architecture & Consistency Audit (DONE)
- 132-006: W6 — Competitive Positioning Audit (DONE)
- 132-007: W7 — Reducer (Self-Polling Executive Report Synthesizer) (DONE)

---
## Sprint 133 — sprint-133

**Status:** RETROSPECTIVE
**Date:** 2026-04-10
**Duration:** 1641s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 8.3% |
| Duration | 1641148ms |

### Tasks

- 133-001: Plugin Hook Sandbox Sertleştirme (DONE)
- 133-002: npm --ignore-scripts Varsayılan (DONE)
- 133-003: HTTP API Bearer Token Auth (GO_WITH_TECH_DEBT)
- 133-004: loadConfig() Module-Level Cache (GO_WITH_TECH_DEBT)
- 133-005: results → Map Index (O(n²)→O(n)) (DONE)
- 133-006: Sprint 131 ADR'leri Yazımı (ADR-029..032) (GO_WITH_TECH_DEBT)
- 133-007: Kritik Modül Unit Testleri (5 Modül, ≥15 Test) (DONE)
- 133-008: Competitive Analysis Güncelleme (GO_WITH_TECH_DEBT)
- 133-009: Yük Testi — P50/P95/P99 Mikrobenchmark (DONE)
- 133-010: finalizeSprint() DIRECTIVES Auto-Archive (DONE)
- 133-011: Credential Encryption (OS Keychain Minimal Wrapper) (DONE)
- 133-012: Marketplace [EXPERIMENTAL] Işaretleme (DONE)

---
## Sprint 135 — sprint-135

**Status:** RETROSPECTIVE
**Date:** 2026-04-12
**Duration:** 3654s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 14 |
| Tech Debt | 4 |
| No-Go | 3 |
| Coverage | NaN% |
| Duration | 3653595ms |

### Tasks

- 135-001: Sprint Coordinator Resilience — PID + State Snapshot + Orphan Detection (DONE)
- 135-002: Auditor HB+Result Reconciliation (Docker Bug Defensive Fix) (DONE)
- 135-003: Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix) (GO_WITH_TECH_DEBT)
- 135-004: askBrain() Extraction Finish — Conservative Move + Re-Export Shim (NO_GO)
- 135-005: Structured Planner Priority + Dependencies Parsing (GO_WITH_TECH_DEBT)
- 135-006: Self-Audit Gate Dedicated Tests (DONE)
- 135-007: Rubric Detail Positive-Path Tests (DONE)
- 135-008: GO_WITH_GATE_FAILURE Status Propagation Wire (GO_WITH_TECH_DEBT)
- 135-009: Worker Verify Loop Enforcement (DONE)
- 135-010: sprint-docs-updater.ts Refactor 864 → 600 LoC (DONE)
- 135-011: Secondary Observability Instrument Points (DONE)
- 135-012: Dashboard vs MCP State Divergence Fix (NO_GO)
- 135-013: Brain Memory Budget Enforcement + Config Sync (GO_WITH_TECH_DEBT)

---
## Sprint 136 — sprint-136

**Status:** RETROSPECTIVE
**Date:** 2026-04-13
**Duration:** 3314s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 6 |
| Tech Debt | 6 |
| No-Go | 4 |
| Coverage | NaN% |
| Duration | 3313568ms |

### Tasks

- 136-001: 5 Test Regression Fix (Sprint 136 Opener) (GO_WITH_TECH_DEBT)
- 136-002: Async I/O İlk Kademe (Hot Path fs.promises Migration) (NO_GO)
- 136-003: Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9) (GO_WITH_TECH_DEBT)
- 136-004: `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5) (GO_WITH_TECH_DEBT)
- 136-005: `load-test-report.md` Auto-Generation (Sprint 135 N6) (GO_WITH_TECH_DEBT)
- 136-006: T-005 Dep Pipeline Canlı Dogfood Rerun (Sprint 135 Chicken-Egg) (NO_GO)
- 136-007: ErrorRegistry Lint Rule Enforcement (NO_GO)
- 136-008: sprint-controller.ts Full Slim (Sprint 134 T-010 Final) (NO_GO)
- 136-009: Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7) (GO_WITH_TECH_DEBT)
- 136-010: sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt) (GO_WITH_TECH_DEBT)

---
## Sprint 137 — sprint-137

**Status:** RETROSPECTIVE
**Date:** 2026-04-14
**Duration:** 2153s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 14.9% |
| Duration | 2152662ms |

### Tasks

- 137-001: Brain Test Suite Post-Refactor Restoration (DONE)
- 137-002: tryCodeVerifiedDone Wire + In-Sprint Dogfood (DONE)
- 137-003: gate.json + load-report.md Runtime Wire Restore (DONE)
- 137-004: ErrorRegistry Lint Script Wire (DONE)
- 137-005: BETA-TRACKER + BLUEPRINT Sprint 134-136 Sync (DONE)
- 137-006: Brain Budget Decay No-Op Bug Fix (GO_WITH_TECH_DEBT)

---
## Sprint 138 — sprint-138

**Status:** RETROSPECTIVE
**Date:** 2026-04-14
**Duration:** 3226s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 11 |
| Completed | 11 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 8.5% |
| Duration | 3226076ms |

### Tasks

- 138-001: ADR Governance Integration (DONE)
- 138-002: ADR-035 Verification Protocol Standard (GO_WITH_TECH_DEBT)
- 138-003: Auditor Authority Extension (3-Pipeline Verification + ADR Compliance) (DONE)
- 138-004: Structured Event Stream + Plan-Time Scope Collision Detection (DONE)
- 138-005: Test Restoration Tam Tamamlama (DONE)
- 138-006: Layer 4 Runtime Wire Forensic Fix (DONE)
- 138-007: Auto-Archive Partial Regression Fix (DONE)
- 138-008: Worker Honest Assessment Calibration v2 (GO_WITH_TECH_DEBT)
- 138-009: Long-Running Sprint Resume Capability MVP (DONE)
- 138-010: MCP/CLI Parity Audit (OPSİYONEL) (DONE)

---
## Sprint 139 — sprint-139

**Status:** RETROSPECTIVE
**Date:** 2026-04-15
**Duration:** 10823s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 10822506ms |

### Tasks

- 139-001: Layer 4 Runtime Wire Deploy (EXECUTING)
- 139-002: Vitest IPC Channel Error Regression Fix (EXECUTING)
- 139-003: Auto-Archive Runtime Regression Fix (EXECUTING)
- 139-004: verifyFunctional Wire Integration (PENDING)
- 139-005: askBrain() Extraction Finish (Sprint 135 N2 Retrospective) (PENDING)
- 139-006: Dashboard vs MCP State Divergence Retest (Sprint 135 N8) (PENDING)
- 139-007: Async I/O İlk Kademe Retrospective (Sprint 136 T-002) (PENDING)
- 139-008: T-005 Dep Pipeline Runtime Enforcement (Sprint 135 N9) (PENDING)
- 139-009: ErrorRegistry Lint Rule Retrospective (Sprint 136 T-007) (PENDING)
- 139-010: .dashboard Parse Error Root Cause Fix (PENDING)
- 139-011: .dashboard File Format Stabilization (PENDING)
- 139-012: Pre-flight Full Health Check Discipline (PENDING)
- 139-013: Docker HB Shutdown Bug Core Fix (Alperen özel P0) (PENDING)
- 139-014: Auditor Cache Invalidation + lastHeartbeat Read Path (PENDING)
- 139-015: Worker Lifecycle State Machine Refactor (PENDING)
- 139-016: Orphan HB Cleanup Pattern (PENDING)
- 139-017: Docker Backend Parity Test (PENDING)
- 139-018: tmux Backend Parity Test (Sprint 123'ten beri ilk) (PENDING)
- 139-019: subprocess Backend Parity Test (Sprint 120'den beri ilk) (PENDING)
- 139-020: Hybrid Backend ADR-027 Revisit (PENDING)
- 139-021: .plan Write Diagnostic + Semantic Audit + Soft Warning (PENDING)
- 139-022: Worker Token Tracking Mandatory (PENDING)
- 139-023: Worker Honest Self-Assessment Runtime Check (PENDING)
- 139-024: Runtime vs Code Issue Discriminator (PENDING)
- 139-025: xfix Worker Scope Format Fix (PENDING)
- 139-026: .prompt Persistence + File Tracking (PENDING)
- 139-027: Cleanup Discipline Extension (PENDING)
- 139-028: Chain Dependency Execution Scheduler (Wave 1 Early Wire) (PENDING)
- 139-029: Cascade Blocking (PENDING)
- 139-030: Dependency Graph Persistence + Resume Integration (PENDING)
- 139-031: Dependency Chain Observability (Mermaid Visualization) (PENDING)
- 139-032: Dependency Violation Alert (PENDING)
- 139-033: Checkpoint Interval Override (Sprint 139 Özel) (PENDING)
- 139-034: ADR-037 Brain-Auditor-Worker Authority Matrix (RBAC Protocol V1.0) (PENDING)
- 139-035: Authority Enforcement Check (Code-Level Runtime) (PENDING)
- 139-036: Authority Matrix Reference Doc (PENDING)
- 139-037: Dead Code Audit Adım 1 — Runtime Audit (PENDING)
- 139-038: Dead Code Audit Adım 2 — Feature Usage Manifest (PENDING)
- 139-039: Dead Code Audit Adım 3 — Safe Action Decision Matrix (PENDING)
- 139-040: Dead Code Audit Adım 4 — Safe Execution (SELF-MODIFYING) (PENDING)
- 139-041: Worker Event Hook Points (PENDING)
- 139-042: Brain Event Hook Points (PENDING)
- 139-043: Auditor Event Hook Points Real Wire (PENDING)
- 139-044: Event Stream Runtime Canlı Kanıt (PENDING)
- 139-045: Multi-Backend Output Collector (PENDING)
- 139-046: Output Formatter + Config-Driven Rendering (PENDING)
- 139-047: deckent_status MCP + CLI Rich Output Integration (PENDING)
- 139-048: Translator Rolü Kaldırma Canlı Kanıt Test (PENDING)
- 139-049: Web Dashboard Hook Point (Sprint 140+ hazır) (PENDING)
- 139-050: Notification Dispatcher Core + 2 Adapter + 5 Event (PENDING)
- 139-051: ADR-038 Self-Modifying Task Detection (PENDING)
- 139-052: Cascade Block Dummy Failure Injection (Live Test) (PENDING)

---
## Sprint 141 — sprint-141

**Status:** RETROSPECTIVE
**Date:** 2026-04-16
**Duration:** 4457s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 18 |
| Completed | 15 |
| Tech Debt | 8 |
| No-Go | 3 |
| Coverage | 25.0% |
| Duration | 4456659ms |

### Tasks

- 141-001: src/core/ Analysis (78 dosya) (DONE)
- 141-002: src/orchestra/ Analysis (82 dosya) (NO_GO)
- 141-003: src/cli/ Analysis (75 dosya) (GO_WITH_TECH_DEBT)
- 141-004: src/mcp/ Analysis (37 dosya) (DONE)
- 141-005: src/agents/ + src/providers/ + src/monitor/ + src/api/ + src/extensions/ Analysis (30 dosya) (NO_GO)
- 141-006: src/dashboard/ Batch Analysis (44 dosya, batch) (DONE)
- 141-007: tests/ Category Analysis (28 kategori) (GO_WITH_TECH_DEBT)
- 141-008: docs/ Analysis (260 markdown) (GO_WITH_TECH_DEBT)
- 141-009: .brain/ + .brain/exports/ + config Analysis (DONE)
- 141-010: Root files + scripts/ Analysis (DONE)
- 141-011: META — Architecture Graph + Circular Dependency (GO_WITH_TECH_DEBT)
- 141-012: META — Dead Code + Type Safety + Security (GO_WITH_TECH_DEBT)
- 141-013: META — ADR Compliance + CLI/MCP Parity + i18n (GO_WITH_TECH_DEBT)
- 141-014: META — Test Coverage Map + Performance + Error Handling + TODO inventory (GO_WITH_TECH_DEBT)
- 141-015: META — Memory V2 Integrity Verification (GO_WITH_TECH_DEBT)
- 141-016: FINAL — Aggregation Report (DONE)

---
## Sprint 142 — sprint-142

**Status:** RETROSPECTIVE
**Date:** 2026-04-16
**Duration:** 10481s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 49 |
| Completed | 44 |
| Tech Debt | 42 |
| No-Go | 5 |
| Coverage | NaN% |
| Duration | 10481457ms |

### Tasks

- 142-001: src/core/ batch 1 — Memory V2 modulleri (GO_WITH_TECH_DEBT)
- 142-002: src/core/ batch 2 — Types + Routing (GO_WITH_TECH_DEBT)
- 142-003: src/core/ batch 3 — Agent + Skill pools (DONE)
- 142-004: src/core/ batch 4 — Provider + Model + Notification (GO_WITH_TECH_DEBT)
- 142-005: src/core/ batch 5 — Utils + Security + Remaining (GO_WITH_TECH_DEBT)
- 142-006: src/core/ batch 6 — Remaining core files (GO_WITH_TECH_DEBT)
- 142-007: src/core/ batch 7 — Final core files (GO_WITH_TECH_DEBT)
- 142-008: src/orchestra/ batch 1 — Brain + Sprint lifecycle (GO_WITH_TECH_DEBT)
- 142-009: src/orchestra/ batch 2 — Debt + Result + Retro (GO_WITH_TECH_DEBT)
- 142-010: src/orchestra/ batch 3 — Task + Routing + Spawn (GO_WITH_TECH_DEBT)
- 142-011: src/orchestra/ batch 4 — Event stream + Pattern + Decision (GO_WITH_TECH_DEBT)
- 142-012: src/orchestra/ batch 5 — Managed docs + Pattern + Remaining (GO_WITH_TECH_DEBT)
- 142-013: src/orchestra/ batch 6 — Doc updaters + Sprint utils + Remaining (GO_WITH_TECH_DEBT)
- 142-014: src/orchestra/ batch 7 — Remaining orchestra files (GO_WITH_TECH_DEBT)
- 142-015: src/orchestra/ batch 8 — Final orchestra remaining (GO_WITH_TECH_DEBT)
- 142-016: src/orchestra/ batch 9 — Final remaining orchestra (GO_WITH_TECH_DEBT)
- 142-017: src/cli/ batch 1 — Memory V2 + Critical commands (GO_WITH_TECH_DEBT)
- 142-018: src/cli/ batch 2 — Remaining commands (GO_WITH_TECH_DEBT)
- 142-019: src/cli/ batch 3 — More commands (GO_WITH_TECH_DEBT)
- 142-020: src/cli/ batch 4 — Final commands + helpers (GO_WITH_TECH_DEBT)
- 142-021: src/cli/ batch 5 — Helpers + Entry (GO_WITH_TECH_DEBT)
- 142-022: src/cli/ batch 6 — Remaining helpers + root (GO_WITH_TECH_DEBT)
- 142-023: src/cli/ batch 7 — Final helpers (GO_WITH_TECH_DEBT)
- 142-024: src/mcp/ batch 1 — Tools (GO_WITH_TECH_DEBT)
- 142-025: src/mcp/ batch 2 — Tools remaining + Resources + Server (GO_WITH_TECH_DEBT)
- 142-026: src/mcp/ batch 3 — Resources + Helpers + Server (GO_WITH_TECH_DEBT)
- 142-027: src/agents/ + src/providers/ + src/api/ + src/monitor/ + src/extensions/ (NO_GO)
- 142-028: src/dashboard/ batch 1 — Components (NO_GO)
- 142-029: src/dashboard/ batch 2 — Components + Pages + Hooks + i18n + lib (GO_WITH_TECH_DEBT)
- 142-030: tests/ batch 1 — core/ (119 dosya) (GO_WITH_TECH_DEBT)
- 142-031: tests/ batch 2 — orchestra/ (118 dosya) (GO_WITH_TECH_DEBT)
- 142-032: tests/ batch 3 — cli/ (126 dosya) (GO_WITH_TECH_DEBT)
- 142-033: tests/ batch 4 — mcp/ + api/ + monitor/ (47 dosya) (GO_WITH_TECH_DEBT)
- 142-034: tests/ batch 5 — integration/ + e2e/ + dashboard/ (52 dosya) (GO_WITH_TECH_DEBT)
- 142-035: tests/ batch 6 — agents/ + providers/ + remaining (100 dosya) (GO_WITH_TECH_DEBT)
- 142-036: docs/ batch 1 — superpowers/ + audits/ (GO_WITH_TECH_DEBT)
- 142-037: docs/ batch 2 — Remaining docs (NO_GO)
- 142-038: .brain/ state + Memory V2 DB canli dogrulama (GO_WITH_TECH_DEBT)
- 142-039: Root .md cross-validation — TUTARLILIK DOGRULAMA (GO_WITH_TECH_DEBT)
- 142-040: Root config — Dockerfile + .gitignore + package.json + tsconfig (GO_WITH_TECH_DEBT)
- 142-041: .claude/rules/ + .contracts/ + .deckent/config (DONE)
- 142-042: META — Architecture Graph + Circular Dependency + ADR-008 (GO_WITH_TECH_DEBT)
- 142-043: META — Dead Code + Type Safety (GO_WITH_TECH_DEBT)
- 142-044: META — Security + Performance (GO_WITH_TECH_DEBT)
- 142-045: META — i18n + CLI/MCP Parity + Test Coverage Map (GO_WITH_TECH_DEBT)
- 142-046: META — Memory V2 Integrity Deep Verification (GO_WITH_TECH_DEBT)
- 142-047: META — Error Handling + TODO/FIXME Inventory (GO_WITH_TECH_DEBT)
- 142-048: FINAL — God Analysis Aggregation Report (NO_GO)

---
## Sprint 143 — sprint-143

**Status:** RETROSPECTIVE
**Date:** 2026-04-17
**Duration:** 6295s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Completed | 19 |
| Tech Debt | 1 |
| No-Go | 1 |
| Coverage | 14.2% |
| Duration | 6294639ms |

### Tasks

- 143-001: Shell Injection Fix (tmux.ts) (DONE)
- 143-002: Path Traversal Fix (checkpoint/docs/decision-logger) (DONE)
- 143-003: .brain/memory.db Git Takip Fix (DONE)
- 143-004: API Auth Default Secure (DONE)
- 143-005: health-check.ts Dosya Yolu Uyuşmazlığı Fix (DONE)
- 143-006: FTS5 Query Builder Fix (Karar 2-A) (DONE)
- 143-007: Relations Hibrit — Backfill + Write-time (Karar 3-C) (DONE)
- 143-008: Memory V2 Tam Migrasyon (ci-reporter + managed-docs) (NO_GO)
- 143-009: DECISIONS.md Archive + init.ts DB Preload (DONE)
- 143-010: Sprint-Finalizer Hook (Karar 4-A) (DONE)
- 143-011: Rule Generator (Karar 4-B, 3 Provider) (DONE)
- 143-012: MCP Disconnect Fix (Background Sprint Runner) (GO_WITH_TECH_DEBT)
- 143-013: Auto-Archive Guard (Task 3 Regression Koruması) (DONE)
- 143-014: Layer 4 Runtime Wire Deploy (ADR-006 Canlı Enforcement) (DONE)
- 143-015: Task Restoration on Crash (DONE)
- 143-016: Panic Kill Guard (DONE)
- 143-017: E2E Harness (Chain Safety Foundation) (DONE)
- 143-018: ADR-010 Amendment (Karar 6-C) (DONE)
- 143-019: MCP help.ts + Server Instructions + Tool Count (DONE)
- 143-020: heartbeat-daemon execSync Beyaz Liste (DONE)

---
## Sprint 144 — sprint-144

**Status:** RETROSPECTIVE
**Date:** 2026-04-17
**Duration:** 6444s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 27 |
| Completed | 24 |
| Tech Debt | 2 |
| No-Go | 3 |
| Coverage | 52.1% |
| Duration | 6444059ms |

### Tasks

- 144-001: init.ts Split (1566 → 4 dosya) (DONE)
- 144-002: doctor.ts Split (1102 → 3 dosya) (DONE)
- 144-003: retro.ts Split (453 → 3 dosya) (DONE)
- 144-004: worker.ts Split (1669 → 4 dosya) (NO_GO)
- 144-005: ADR-008 Cycle 2 Fix — core/session-interface.ts (DONE)
- 144-006: Auditor Async Scan Loop (52 Sync I/O Elimine) (DONE)
- 144-007: Ölü Kod Silme Wave A (Agent + V1 Routing, 17 dosya, 2780 LoC) (NO_GO)
- 144-008: Ölü Kod Silme Wave B (Orchestra Sahipsiz + Feature Flag, 12 dosya, 2139 LoC) (NO_GO)
- 144-009: file-lock + deck-file + credentials (Security + Perf) (DONE)
- 144-010: Dockerfile Hardening (DONE)
- 144-011: i18n Temel CLI (5 komut TR/EN) (DONE)
- 144-012: Türkçe Locale Fix (.toLowerCase → .toLocaleLowerCase('tr-TR')) (DONE)
- 144-013: redactSensitive CLI → core taşı (ADR-008) (DONE)
- 144-014: Docker HB Deploy Wire (Sprint 139 Fix Canlı) (DONE)
- 144-015: Event Stream Emit Wire (GO_WITH_TECH_DEBT)
- 144-016: Sprint-State Lifecycle (pid manager) (DONE)
- 144-017: Retro sprint-id Normalize (GO_WITH_TECH_DEBT)
- 144-018: Orphan Cleanup (.tasks + locks) + Pre-flight (DONE)
- 144-019: Rich Sprint Output (7-section summary) (DONE)
- 144-020: Test — Memory V2 CLI (+40 test) (DONE)
- 144-021: Test — heartbeat-daemon + mid-sprint-adapter + ci-reporter (+24 test) (DONE)
- 144-022: Prompt Test Slot-Based Assertion Refactor (Sprint 143 Debt #1) (DONE)
- 144-023: sprint2-debt.test.ts Memory Leak Fix (Sprint 143 Debt #7 — CI Blocker) (DONE)
- 144-024: formatCiHealthSection coverageDelta Defensif Default (Sprint 143 Debt #3) (DONE)
- 144-025: MCP Start Detached Fork Integration Test (Sprint 143 Debt #5) (DONE)
- 144-026: archive-debt Test Suite MemoryStore Harness Rewrite (Sprint 143 Debt #6) (DONE)
- 144-027: sprint-reporter-ci DB-Write Coverage (Sprint 143 Debt #4) (DONE)

---
## Sprint 145 — sprint-145

**Status:** RETROSPECTIVE
**Date:** 2026-04-20
**Duration:** 5551s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 28 |
| Completed | 27 |
| Tech Debt | 24 |
| No-Go | 1 |
| Coverage | 7.8% |
| Duration | 5550735ms |

### Tasks

- 145-001: Timeout Config Schema + Validation (DONE)
- 145-002: Brain Heuristic Timeout Estimator (NO_GO)
- 145-003: EventBus Abstraction + Subscribe API (GO_WITH_TECH_DEBT)
- 145-004: ADR-037 RBAC Runtime Wire — checkWorkerAuthority (GO_WITH_TECH_DEBT)
- 145-005: CHANNELS.NOTIFY writeEvent Emit Wire (GO_WITH_TECH_DEBT)
- 145-006: NotifyDispatcher Wire + 3 Adapter (GO_WITH_TECH_DEBT)
- 145-007: ADR-038 Self-Modifying Detector Runtime Wire (GO_WITH_TECH_DEBT)
- 145-008: registerResume CLI Wire + CLI Registration Test Harness (GO_WITH_TECH_DEBT)
- 145-009: T-144-002 Helper Migration — countDebtItems → store.getByType (GO_WITH_TECH_DEBT)
- 145-010: worker.sh Template Update — TASK_TIMEOUT Env Var (GO_WITH_TECH_DEBT)
- 145-011: Result Atomicity Guarantee — TIMEOUT_WITH_WORK Partial Result (GO_WITH_TECH_DEBT)
- 145-012: deckent status --follow CLI + Backend-Aware Renderer (GO_WITH_TECH_DEBT)
- 145-013: Monitor Adapter Pattern — 3 Backend Otonom (GO_WITH_TECH_DEBT)
- 145-014: deckent_watch MCP Tool + Notifications (GO_WITH_TECH_DEBT)
- 145-015: Brain Spurious NO_GO Reconciliation Helper Wire (GO_WITH_TECH_DEBT)
- 145-016: IPC Cleanup Defense-in-Depth M7.B + M7.C (GO_WITH_TECH_DEBT)
- 145-017: Timeout Event Stream Emit (GO_WITH_TECH_DEBT)
- 145-018: UI Polish — Renk, Emoji, Partial Redraw (GO_WITH_TECH_DEBT)
- 145-019: Runtime Extension Prototype (Opsiyon B Watcher Daemon) (GO_WITH_TECH_DEBT)
- 145-020: DECKENT-ANA-PLAN-TR.md Tam Güncelleme — Sprint 23 → 145 (DONE)
- 145-021: DECKENT-MASTER-BLUEPRINT.md EN Tam Güncelleme (GO_WITH_TECH_DEBT)
- 145-022: FINAL-EXECUTIVE-REPORT.md Sprint 144 + 145 Inline + Append (GO_WITH_TECH_DEBT)
- 145-023: God Analysis FINAL-REPORT.md Sprint 145 Closure Section (GO_WITH_TECH_DEBT)
- 145-024: Cross-Doc Consistency + Master Index (GO_WITH_TECH_DEBT)
- 145-025: BETA-TRACKER.md (EN) — Sprint 145-150 Milestone Kalibrasyonu (GO_WITH_TECH_DEBT)
- 145-026: BETA-TRACKER-TR.md — TR Parity + 10 Sprint Kayıp Kalibrasyonu (GO_WITH_TECH_DEBT)
- 145-027: Memory V2 Prod-Readiness Validation + 1000-Entry Stress (GO_WITH_TECH_DEBT)

---
## Sprint 146 — sprint-146

**Status:** RETROSPECTIVE
**Date:** 2026-04-20
**Duration:** 3723s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 16 |
| Tech Debt | 6 |
| No-Go | 1 |
| Coverage | 16.2% |
| Duration | 3723070ms |

### Tasks

- 146-001: Agent Truncation Bug Fix (GO_WITH_TECH_DEBT)
- 146-002: Agent Routing V2 Retrain + Intent Classifier Refresh (DONE)
- 146-003: ADR Relevance Scoring Engine (GO_WITH_TECH_DEBT)
- 146-004: Scope Sanitizer (GO_WITH_TECH_DEBT)
- 146-005: Generative Useful God Template — buildTaskPrompt Single Entry (GO_WITH_TECH_DEBT)
- 146-006: Task-Type ADR Preset Matrix + Filler Cleanup (DONE)
- 146-007: Prompt Quality Linter (DONE)
- 146-008: DIRECTIVES.md Mid-Sprint Silme Bug Fix (GO_WITH_TECH_DEBT)
- 146-009: SDL Decision Log Rehabilitation (DONE)
- 146-010: Rubric System Consolidation (GO_WITH_TECH_DEBT)
- 146-011: Sprint 145 vitest Regression Fix (NO_GO)
- 146-012: Nervous System Preflight — ADR-040 + Types (DONE)
- 146-013: Sprint 146 Retro Template + Docs Update (DONE)
- 146-014: Agent Exclusion Dynamic (Task 2 tamamlayıcı) (DONE)
- 146-015: Chain Safety Gate Script (DONE)
- 146-016: Sprint 146 Living Record Update (FINAL-EXECUTIVE-REPORT.md) (DONE)
- 146-017: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 Append (DONE)

---
## Sprint 147 — sprint-147

**Status:** RETROSPECTIVE
**Date:** 2026-04-20
**Duration:** 2974s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 23 |
| Completed | 23 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 2973941ms |

### Tasks

- 147-001: Nervous Types Genişletme — Runtime Types (DONE)
- 147-002: Action Registry — 30 Eylem + Risk Matrix (DONE)
- 147-003: Authority Matrix — 4 Preset + Safety Floor + Override (DONE)
- 147-004: Observer — Event Bus + Filesystem Watcher + Cron (DONE)
- 147-005: Decision Engine — Detector → Policy → Decision (DONE)
- 147-006: Proposer — Notification Builder + Throttle + Grouping (DONE)
- 147-007: Executor — 3 Mod Handler (Autonomous / Suggest / Approve) (DONE)
- 147-008: History — JSONL Append + Undo + Retention (DONE)
- 147-009: StaleWorkerDetector (DONE)
- 147-010: ScopeCollisionMonitor (DONE)
- 147-011: DebtTrendAnalyzer (DONE)
- 147-012: AgentRoutingHealth — `string;` Corruption + %40 Anomaly (DONE)
- 147-013: DirectivesMidSprintProtection (DONE)
- 147-014: CLI Dashboard — `deckent nervous` (DONE)
- 147-015: CLI Config — `deckent config nervous` TUI (DONE)
- 147-016: MCP Tools — 5 Nervous System Tools (DONE)
- 147-017: Config Schema Extension — nervous_system (DONE)
- 147-018: Dispatcher — Context Detection + 3 Adapter Routing (DONE)
- 147-019: Integration Tests — 40+ Tests Suite (DONE)
- 147-020: E2E — Canlı Sprint Simulation (DONE)
- 147-021: Sprint Controller Hook — Lifecycle Event Emit (DONE)
- 147-022: ADR-040 Accept — Nervous System Architecture (DONE)

---
## Sprint 148 — sprint-148

**Status:** RETROSPECTIVE
**Date:** 2026-04-20
**Duration:** 3647s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 28 |
| Completed | 27 |
| Tech Debt | 1 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 3647114ms |

### Tasks

- 148-001: test-writer Agent Archive + Removal Justification (DONE)
- 148-002: testing-expert Skill Auto-Activation Heuristic (DONE)
- 148-003: Intent Classifier "testing" Intent Refactor — test-coverage Tag (DONE)
- 148-004: Router V2 Agent Fallback — test-writer Yok, architect/refactorer Chain (DONE)
- 148-005: 16 Agent PROMPT.md Rubric Spec Batch Cleanup (DONE)
- 148-006: Nervous System enabled=true Pivot — BALANCED Preset (DONE)
- 148-007: 🚨 Notification Delivery Scope Enforcement (Ana PID Constraint) (DONE)
- 148-008: StaleWorkerDetector Canlı Activation + DetectorRegistry (DONE)
- 148-009: ScopeCollisionMonitor + DebtTrendAnalyzer Live Activation (DONE)
- 148-010: AgentRoutingHealth Canlı Pozitif Doğrulama (DONE)
- 148-011: DirectivesMidSprintProtection Canlı + Deliberate Stress Test (DONE)
- 148-012: CLI `deckent nervous` TUI Integration Test + Smoke Script (DONE)
- 148-013: MCP `deckent_nervous_*` 5 Tool End-to-End Live Test (DONE)
- 148-014: macOS E2E — tmux Backend Full Sprint (GitHub Actions) (DONE)
- 148-015: Linux E2E — subprocess Backend Full Sprint (DONE)
- 148-016: WSL2 E2E — Docker Backend Full Sprint (DONE)
- 148-017: Provider Matrix — Claude + Codex Mixed Mini-Sprint (DONE)
- 148-018: i18n Parity — TR/EN Task Description Routing Identical (DONE)
- 148-019: Fresh Install Matrix — Node 18/20/22 × Clean Env (DONE)
- 148-020: Vitest Triage — 135 Fail → < 50 Fail (NO_GO)
- 148-021: Routing V3 Intent Classifier — core-dev Sub-Intents (DONE)
- 148-022: Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix (GO_WITH_TECH_DEBT)
- 148-023: CHANGELOG 0.4.0-beta.4 + Sprint-148.md (DONE)
- 148-024: FINAL-EXECUTIVE-REPORT Sprint 148 Living Record (DONE)
- 148-025: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 148 Append (DONE)
- 148-026: Memory V2 Nervous History Integration (DONE)
- 148-027: npm Publish Dry-Run Rehearsal (DONE)
- 148-028: ADR-041 Draft — Agent Taxonomy (Horizontal vs Vertical) (DONE)

---
## Sprint 149 — sprint-149

**Status:** RETROSPECTIVE
**Date:** 2026-04-20
**Duration:** 2004s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 2003601ms |

### Tasks

- 149-001: `deckent_style` Config Key — 3-Layer Integration (DONE)
- 149-002: `deckent mode` CLI Command (GO_WITH_TECH_DEBT)
- 149-003: Sprint Controller Mode-Aware Routing (DONE)
- 149-004: Nervous System Mode-Aware Detectors (DONE)
- 149-005: Dockerfile USER Non-Root (PENDING)
- 149-006: `.deck` Config Interpolation (`$DECK:KEY` Syntax) (PENDING)
- 149-007: Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt) (PENDING)
- 149-008: Scope Sanitizer Code Snippet False Positive Fix (Sprint 148 Debt) (PENDING)
- 149-009: Auditor Stale Alert Race Condition Fix (Sprint 148 Debt) (PENDING)
- 149-010: `src/connectors/` Base + IMessageConnector Interface (PENDING)
- 149-011: Discord Connector (PENDING)
- 149-012: Telegram Connector (PENDING)
- 149-013: WhatsApp Scaffold (Post-Launch Activation Ready) (PENDING)
- 149-014: Connector Pool + Parallel Dispatch (PENDING)
- 149-015: Incoming Webhook Router + Nervous Bridge (PENDING)
- 149-016: `src/core/signature.ts` Ed25519 Sign/Verify (PENDING)
- 149-017: VerhexIO/deckent-hub Repo Create + Templates (PENDING)
- 149-018: 20 Seed Skill Creation (PENDING)
- 149-019: `deckent skill publish` CLI Complete (Sign + Upload) (PENDING)
- 149-020: Hub CI Workflow — validate-skill.yml (PENDING)
- 149-021: README.md Overhaul + Landing Page (PENDING)
- 149-022: AGENTS.md Refresh (39 Sprint Behind) (PENDING)
- 149-023: 388 .md Interaktif Review Script (PENDING)
- 149-024: TR/EN Parity + Link Checker (PENDING)
- 149-025: ADR-041 ACCEPT + ADR-042 Draft (PENDING)
- 149-026: npm pack --dry-run + Version Bump 1.0.0-beta.1 (PENDING)
- 149-027: VerhexIO/deckent Public Repo Hazırlık (Sprint 150'de Alperen Flip) (PENDING)

---
## Sprint 150 — sprint-150

**Status:** RETROSPECTIVE
**Date:** 2026-04-21
**Duration:** 4828s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 41 |
| Completed | 37 |
| Tech Debt | 6 |
| No-Go | 4 |
| Coverage | NaN% |
| Duration | 4828332ms |

### Tasks

- 150-001: `deckent_style` Config Key — 3-Layer Integration (DONE)
- 150-002: `deckent mode` CLI Command (DONE)
- 150-003: Sprint Controller Mode-Aware Routing (DONE)
- 150-004: Nervous System Mode-Aware Detectors (DONE)
- 150-005: Dockerfile USER Non-Root (DONE)
- 150-006: `.deck` Config Interpolation (`$DECK:KEY` Syntax) (DONE)
- 150-007: Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt) (GO_WITH_TECH_DEBT)
- 150-008: Scope Sanitizer Code Snippet False Positive Fix (Sprint 148 Debt) (NO_GO)
- 150-009: Auditor Stale Alert Race Condition Fix (Sprint 148 Debt) (GO_WITH_TECH_DEBT)
- 150-010: `src/connectors/` Base + IMessageConnector Interface (DONE)
- 150-011: Discord Connector (DONE)
- 150-012: Telegram Connector (DONE)
- 150-013: WhatsApp Scaffold (Post-Launch Activation Ready) (DONE)
- 150-014: Connector Pool + Parallel Dispatch (DONE)
- 150-015: Incoming Webhook Router + Nervous Bridge (DONE)
- 150-016: `src/core/signature.ts` Ed25519 Sign/Verify (DONE)
- 150-017: VerhexIO/deckent-hub Repo Create + Templates (GO_WITH_TECH_DEBT)
- 150-018: 20 Seed Skill Creation (DONE)
- 150-019: `deckent skill publish` CLI Complete (Sign + Upload) (DONE)
- 150-020: Hub CI Workflow — validate-skill.yml (DONE)
- 150-021: README.md Overhaul + Landing Page (DONE)
- 150-022: AGENTS.md Refresh (39 Sprint Behind) (NO_GO)
- 150-023: 388 .md Interaktif Review Script (DONE)
- 150-024: TR/EN Parity + Link Checker (DONE)
- 150-025: ADR-041 ACCEPT + ADR-042 Draft (DONE)
- 150-026: npm pack --dry-run + Version Bump 1.0.0-beta.1 (GO_WITH_TECH_DEBT)
- 150-027: VerhexIO/deckent Public Repo Hazırlık (Sprint 151'de Alperen Flip) (DONE)
- 150-028: `cleanOrphanIpcDirs` Wire-Up with Live-PID Check (NO_GO)
- 150-029: Feature Manifest Canlılaştırma (Tam Scope) (GO_WITH_TECH_DEBT)
- 150-030: Observability Rotation + SprintId Tagging + Dead Read Path Cleanup (DONE)
- 150-031: Built-in Agent + Skill Bundle Pipeline (P0 Beta GA Blocker) (DONE)
- 150-032: `deckent audit` + `deckent recover` User-Facing CLI + MCP Yüzeyi (GO_WITH_TECH_DEBT)
- 150-033: Safety-Point Lifecycle Onarımı + User-Loss Guard (DONE)
- 150-034: Config Sadeleştirme + MODE_PRESETS Konsolidasyon + System Capacity Auto-Detect MVP + Self-Healing (ONAYLI Alperen 8-karar matris) (DONE)
- 150-035: Sprint-Prefixed Dosya Retention (FINAL — Alperen 5 soru 2026-04-21 onaylı) (DONE)
- 150-036: Managed-Docs Cache Git Tracking Fix + Metadata Annotation (DONE)
- 150-037: `.deckent/docs.json` Private/Public Split + Bootstrap Template + Path Safety + Interactive UX (P0 Beta GA — ONAYLI Alperen Seçenek 3) (DONE)
- 150-038: Sprint-Scoped MetricsJsonl Writer Wire-Up + status.ts Live Reader (T-150-030 Tamamlayıcısı) (DONE)

---
## Sprint 151 — sprint-151

**Status:** RETROSPECTIVE
**Date:** 2026-04-22
**Duration:** 3362s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 17 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | 13.0% |
| Duration | 3362181ms |

### Tasks

- 151-001: npm publish HAZIRLIK + Alperen Handoff (PUBLISH WORKER TARAFINDAN ÇALIŞTIRILMAZ) (DONE)
- 151-002: Public Repo Flip — VerhexIO/deckent → VerhexIO/deckent (GO_WITH_TECH_DEBT)
- 151-003: Dashboard ChatPage.tsx (7. page) (DONE)
- 151-004: Discord Bot Deploy + Smoke Test (GO_WITH_TECH_DEBT)
- 151-005: Telegram Bot Deploy + Smoke Test (DONE)
- 151-006: Show HN + Reddit + Twitter Announce Hazırlığı (DONE)
- 151-007: Discord Server Launch + Initial Channel Structure (DONE)
- 151-008: Dev.to + Hashnode Long-Form Post (DONE)
- 151-009: DECKENT→USER:NOTIFY Runtime Smoke Test + Nervous Bridge E2E (DONE)
- 151-010: CLI buildProgram Smoke Test Harness (DONE)
- 151-011: 49 CLI Komut Tam Envanter + Smoke (DONE)
- 151-012: Brain Evaluator 5-in-1 Fix (DONE)
- 151-013: Vitest 9 Residual Fail Fix (DONE)
- 151-014: Docker HB + Vitest Timeout Nihai Fix (3-Sprint Debt Final) (DONE)
- 151-015: Nervous System 6-10 Detector Activation (Sprint 147 Plan) (GO_WITH_TECH_DEBT)

---
## Sprint 152 — sprint-152

**Status:** RETROSPECTIVE
**Date:** 2026-04-24
**Duration:** 2713s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 36 |
| Completed | 8 |
| Tech Debt | 0 |
| No-Go | 28 |
| Coverage | 0.0% |
| Duration | 2713342ms |

### Tasks

- 152-001: Post-Migration Environment Delta Audit (DONE)
- 152-002: `deckent doctor` Derin Audit (NO_GO)
- 152-003: CLI Smoke Part 1 — Core Lifecycle (15 komut) (NO_GO)
- 152-004: CLI Smoke Part 2 — Memory + Checkpoint + Run (10 komut) (NO_GO)
- 152-005: CLI Smoke Part 3 — Agent + Skill + Plugin (12 komut) (NO_GO)
- 152-006: CLI Smoke Part 4 — Nervous System + Audit + Feature + Mode (12+ komut) (NO_GO)
- 152-007: MCP Smoke Part 1 — Lifecycle Tools (8 tool) (NO_GO)
- 152-008: MCP Smoke Part 2 — Observational + Advanced (10 tool) (NO_GO)
- 152-009: MCP Smoke Part 3 — Docs + Agent/Skill + Nervous + Beta Trio (9 tool) (NO_GO)
- 152-010: MCP 8 Resource Fetch Test (NO_GO)
- 152-011: Memory V2 DB Integrity + FTS5 Recall Test (NO_GO)
- 152-012: Nervous System 11 Detector Canlılık Audit (NO_GO)
- 152-013: Provider Health Matrix + Multi-Provider Readiness (NO_GO)
- 152-014: Docker Backend + Worker Image + Graceful Shutdown Audit (NO_GO)
- 152-015: Dashboard 7 Page + SSE + API Endpoints Audit (NO_GO)
- 152-016: ADR 43 Compliance Automated Scan (NO_GO)
- 152-017: tsc + vitest Baseline Drift Analysis (DONE)
- 152-018: Auto-Memory 78 Dosya Kayıp Impact Analysis (DONE)
- 152-019: ADR-039 Self-Modifying Task Detector — Sprint 148 Catastrophic Lesson Retention (NO_GO)
- 152-020: Skills 21 AST Sandbox + Registry Integrity (DONE)
- 152-021: Agents 16 Built-in Manifest + Routing V2 Rules (DONE)
- 152-022: Debt 96 Item Envanter + Closeable Count + Top-10 Priority (DONE)
- 152-023: Beta GA Kalan 3 Gate — Realistik Durum (NO_GO)
- 152-024: Config Integrity — Duplicate Keys + MODE_PRESETS Overlap (NO_GO)
- 152-025: Git State Hijyen + SYSTEM-MIGRATION Yaşam Döngüsü (DONE)
- 152-026: Hot Fix with Claude Subagents Pattern — Sprint 150A Doğrulama (NO_GO)
- 152-027: Roadmap Phase 2 Readiness Gap (Sprint 152-160 Preparatory) (NO_GO)
- 152-028: OpenClaw Parity Matrix + Competitive Position Update (NO_GO)
- 152-029: Security Posture — AST + Ed25519 + .deck + Dockerfile Non-Root Live Proof (NO_GO)
- 152-030: Sprint 151 Learnings → Sprint 152 Actionable Distilling + Meta-Dogfood Sayacı (DONE)

---
## Sprint 153 — sprint-153

**Status:** RETROSPECTIVE
**Date:** 2026-05-12
**Duration:** 2132s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 16 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 13 |
| Coverage | 0.0% |
| Duration | 2132035ms |

### Tasks

- 153-001: CLI Komut Paleti Özeti (DONE)
- 153-002: Brain 8-Phase Sprint Lifecycle (NO_GO)
- 153-003: Memory V2 SQLite Schema (NO_GO)
- 153-004: Multi-Provider Routing (NO_GO)
- 153-005: Docker Worker Spawn Akışı (DONE)
- 153-006: Nervous System Detector'ları (NO_GO)
- 153-007: Ed25519 Skill Signature (NO_GO)
- 153-008: Sprint Kill ve Cleanup Disiplini (NO_GO)
- 153-009: ADR-008 Unidirectional Imports (NO_GO)
- 153-010: Beta GA 20-Gate Listesi (NO_GO)

---
## Sprint 154 — sprint-154

**Status:** RETROSPECTIVE
**Date:** 2026-05-12
**Duration:** 858s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 9 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 4 |
| Coverage | 30.7% |
| Duration | 858468ms |

### Tasks

- 154-001: RubricRegistry Core Foundation (NO_GO)
- 154-002: New Scorer Functions (audit + doc-write criteria) (DONE)
- 154-003: scoreCriterion Switch + evaluateWithRubric Registry Wire (DONE)
- 154-004: validateResultSchema Coverage:null Tolerance (DONE)
- 154-005: RubricRegistry Test Suite (NO_GO)
- 154-006: Evaluator Integration Test (audit + doc-write scenarios) (DONE)

---
## Sprint 155 — sprint-155

**Status:** RETROSPECTIVE
**Date:** 2026-05-12
**Duration:** 384s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 10 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 383887ms |

### Tasks

- 155-001: deckent_start MCP Tool Özet (DONE)
- 155-002: deckent_status MCP Tool Özet (DONE)
- 155-003: deckent_plan MCP Tool Özet (DONE)
- 155-004: deckent_set_directives MCP Tool Özet (DONE)
- 155-005: deckent_retro MCP Tool Özet (DONE)
- 155-006: deckent_cleanup MCP Tool Özet (DONE)
- 155-007: deckent_doctor MCP Tool Özet (DONE)
- 155-008: deckent_recover MCP Tool Özet (DONE)
- 155-009: deckent_audit MCP Tool Özet (DONE)
- 155-010: deckent_memory_query MCP Tool Özet (DONE)

---
## Sprint 156 — sprint-156

**Status:** COMPLETE
**Date:** 2026-05-12
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 22 |
| Completed | 22 |
| Tech Debt | 15 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | -21ms |

### Tasks

- 156-001-fix: Fix: Workflow Rename VERIFY (read-only audit) (DONE)
- 156-001: Workflow Rename VERIFY (read-only audit) (DONE)
- 156-002-fix: Fix: dependency_pipeline_enabled Default Flip (GO_WITH_TECH_DEBT)
- 156-002: dependency_pipeline_enabled Default Flip (GO_WITH_TECH_DEBT)
- 156-003: Cascade/Unblock Runtime Wire (GO_WITH_TECH_DEBT)
- 156-004-fix: Fix: Task Tmpfile Cleanup Discipline (GO_WITH_TECH_DEBT)
- 156-004: Task Tmpfile Cleanup Discipline (GO_WITH_TECH_DEBT)
- 156-005: Auditor Baseline Collection Fix (GO_WITH_TECH_DEBT)
- 156-006-fix: Fix: IDEMPOTENCY_KEY Worker Prompt Inject (GO_WITH_TECH_DEBT)
- 156-006: IDEMPOTENCY_KEY Worker Prompt Inject (GO_WITH_TECH_DEBT)
- 156-007: Worker Prompt Previous-Result Enrichment (GO_WITH_TECH_DEBT)
- 156-008: Brain Self-Rebuild Gate (NO BUILD CALL) (DONE)
- 156-009-fix: Fix: assertSpawnSafe Whitelist Runtime (GO_WITH_TECH_DEBT)
- 156-009: assertSpawnSafe Whitelist Runtime (GO_WITH_TECH_DEBT)
- 156-010-fix: Fix: Runtime File Lock (flock spawn-time) (GO_WITH_TECH_DEBT)
- 156-010: Runtime File Lock (flock spawn-time) (GO_WITH_TECH_DEBT)
- 156-011-fix: Fix: EffectClass Annotation rubric-registry (DONE)
- 156-011: EffectClass Annotation rubric-registry (GO_WITH_TECH_DEBT)
- 156-012: Fresh-Eyes Fix Worker Rotation (GO_WITH_TECH_DEBT)
- 156-013: Per-Change Security Review (DONE)
- 156-014: 3 Yeni ADR Draft (DONE)
- 156-015: Sprint 156 Retrospective + Build Impact Plan (DONE)

---
## Sprint 156 — sprint-156

**Status:** RETROSPECTIVE
**Date:** 2026-05-12
**Duration:** 2459s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 22 |
| Completed | 10 |
| Tech Debt | 4 |
| No-Go | 12 |
| Coverage | NaN% |
| Duration | 2458991ms |

### Tasks

- 156-001: Workflow Rename VERIFY (read-only audit) (NO_GO)
- 156-002: dependency_pipeline_enabled Default Flip (NO_GO)
- 156-003: Cascade/Unblock Runtime Wire (GO_WITH_TECH_DEBT)
- 156-004: Task Tmpfile Cleanup Discipline (NO_GO)
- 156-005: Auditor Baseline Collection Fix (DONE)
- 156-006: IDEMPOTENCY_KEY Worker Prompt Inject (NO_GO)
- 156-007: Worker Prompt Previous-Result Enrichment (DONE)
- 156-008: Brain Self-Rebuild Gate (NO BUILD CALL) (GO_WITH_TECH_DEBT)
- 156-009: assertSpawnSafe Whitelist Runtime (NO_GO)
- 156-010: Runtime File Lock (flock spawn-time) (NO_GO)
- 156-011: EffectClass Annotation rubric-registry (GO_WITH_TECH_DEBT)
- 156-012: Fresh-Eyes Fix Worker Rotation (DONE)
- 156-013: Per-Change Security Review (DONE)
- 156-014: 3 Yeni ADR Draft (DONE)
- 156-015: Sprint 156 Retrospective + Build Impact Plan (DONE)

---
## Sprint 159 — sprint-159

**Status:** COMPLETE
**Date:** 2026-05-12
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 2 |
| Tech Debt | 2 |
| No-Go | 13 |
| Coverage | NaN% |
| Duration | -106ms |

### Tasks

- 159-001: EvaluationAuditTrail Foundation (GO_WITH_TECH_DEBT)
- 159-002: Dual-Evaluator Race Close (Bug X) (GO_WITH_TECH_DEBT)
- 159-003: Sprint-Stall Fix-Fix Spawn Loop (NO_GO)
- 159-004: handleEvaluation → updateTaskStatus Wire (NO_GO)
- 159-005: Heartbeat Write Atomicity (NO_GO)
- 159-006: sprint-state.json Phase Transition Update (NO_GO)
- 159-007: scoreTestCoverage null Neutral Score (NO_GO)
- 159-008: AUDIT_RUBRIC Dinamik Threshold (NO_GO)
- 159-009: Retro Naming Off-By-One Fix (NO_GO)
- 159-010: sprint-phases.ts cleanup 'spawn-fail' Argument (NO_GO)
- 159-011: DeckentConfig dependency_pipeline_enabled Field (NO_GO)
- 159-012: Per-Change Security Review (NO_GO)
- 159-013: 2 Yeni ADR Draft (NO_GO)
- 159-014: EvaluationAuditTrail E2E Smoke Test (NO_GO)
- 159-015: Sprint 157 Retro + Bug Close Forensic (NO_GO)

---
## Sprint 162 — sprint-162

**Status:** RETROSPECTIVE
**Date:** 2026-05-12
**Duration:** 786s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 2 |
| Tech Debt | 1 |
| No-Go | 2 |
| Coverage | 30.7% |
| Duration | 785583ms |

### Tasks

- 162-001: Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite) (GO_WITH_TECH_DEBT)
- 162-002: State Recovery on Brain Restart (T-004) (DONE)
- 162-003: Crash Injection Integration Test + E2E Smoke (T-007) (NO_GO)

---
## Sprint 163 — sprint-163

**Status:** RETROSPECTIVE
**Date:** 2026-05-12
**Duration:** 700s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 16.7% |
| Duration | 699505ms |

### Tasks

- 163-001: Brain Spurious NO_GO Reconciliation Wire Restore (B1) (DONE)
- 163-002: Docker container_start_failed Health Check + Retry Policy (B2) (DONE)
- 163-003: ADR-043 — Brain Crash Recovery Protocol (A1) (DONE)
- 163-004: ADR-044 — Sprint State Observability Contract (A2) (DONE)
- 163-005: Sprint 160 Security Review 3/3 (A3) (DONE)
- 163-006: Brain Dogfood Smoke — Sprint 163 Self-Validation (C1) (DONE)

---
## Sprint 164 — sprint-164

**Status:** RETROSPECTIVE
**Date:** 2026-05-13
**Duration:** 5518s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 5518163ms |

### Tasks

- 164-001: Fix debt: Tech debt from 156-011-fix: Code physically verified despite missing .result (Sp (DONE)
- 164-002: ADR-045 — Wave-Based Execution Semantics Contract (E3) (DONE)
- 164-003: Vitest Gate +1 Fail Closure — Chronic Regression Eradication (NO_GO)
- 164-004: Gitignore Housekeeping — Runtime Artifact Patterns (DONE)
- 164-005: respawnEligibleTasks Runtime Wire + task.status Inline Sync — Composite (E1+E2) (DONE)
- 164-006: Integration Test Suite — Sprint 161 Forensic Replay + Multi-Wave Coverage (E-tests) (DONE)

---
## Sprint 165 — sprint-165

**Status:** RETROSPECTIVE
**Date:** 2026-05-13
**Duration:** 12910s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 12909690ms |

### Tasks


---
## Sprint 167 — sprint-167

**Status:** COMPLETE
**Date:** 2026-05-14
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 9 |
| Tech Debt | 2 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | -11ms |

### Tasks

- 167-001: T1 — Code Inventory + Dead Code + Unused Features Audit (GO_WITH_TECH_DEBT)
- 167-002: T2 — Doc Inventory + Reference Validation + Ground-Truth Audit (NO_GO)
- 167-003: T3 — ADR Compliance + Status Audit (DONE)
- 167-004: T4 — Memory.db + Data Integrity Audit (DONE)
- 167-005: T5 — Brain/Worker/Auditor Wire Audit + Manuel Survival Evidence (GO_WITH_TECH_DEBT)
- 167-006: T6 — Test + Build + Security + OSS Readiness Audit (DONE)
- 167-007: T7 — Cross-Cutting Synthesis (Wave 2, T1-T6 dependent) (DONE)
- run-1778748493227-0: Sprint 167 T1 — Code Inventory + Dead Code + Unused Features Audit. READ-ONLY au (DONE)
- run-1778748498892-0: Sprint 167 T2 — Doc Inventory + Reference Validation + Ground-Truth Audit. READ- (DONE)
- run-1778748966937-0: Sprint 167 T7 RETRY — Cross-Cutting Synthesis with T1+T2 included. READ-ONLY met (DONE)

---
## Sprint 168 — sprint-168

**Status:** RETROSPECTIVE
**Date:** 2026-05-14
**Duration:** 904s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 29.8% |
| Duration | 904164ms |

### Tasks

- 168-001: T1 Scope Collision Trigger (DONE)
- 168-002: T2 Scope Collision with T1 (PARALLEL) (DONE)
- 168-003: T3 Kill Recovery Simulation (DEPENDS T1) (NO_GO)

---
## Sprint 169 — sprint-169

**Status:** RETROSPECTIVE
**Date:** 2026-05-14
**Duration:** 2918s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 18 |
| Completed | 4 |
| Tech Debt | 0 |
| No-Go | 14 |
| Coverage | NaN% |
| Duration | 2918363ms |

### Tasks

- 169-001: W3.1 C0c Collision Detection Live Trigger Investigation + Fix (NO_GO)
- 169-002: W3.2 Smoke Directive Dependency Parser Fix (NO_GO)
- 169-003: C1 Memory Relations Migration (NO_GO)
- 169-004: H2 Stub Memory Entries Backfill (NO_GO)
- 169-005: H3 OSS Pre-Flip Secret Scan Baseline (NO_GO)
- 169-006: H4 Dashboard Build CI Gate (NO_GO)
- 169-007: C2 Bug Z3 Memory Rebuild Safety (DONE)
- 169-008: H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook (NO_GO)
- 169-009: H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix (DONE)

---
## Sprint 169 — sprint-169

**Status:** COMPLETE
**Date:** 2026-05-14
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 25 |
| Completed | 24 |
| Tech Debt | 12 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | 0ms |

### Tasks

- 169-001-fix-fix: Fix: Fix: W3.1 C0c Collision Detection Live Trigger Investigation + Fix (DONE)
- 169-001-fix: Fix: W3.1 C0c Collision Detection Live Trigger Investigation + Fix (GO_WITH_TECH_DEBT)
- 169-001: W3.1 C0c Collision Detection Live Trigger Investigation + Fix (NO_GO)
- 169-002-fix-fix: Fix: Fix: W3.2 Smoke Directive Dependency Parser Fix (DONE)
- 169-002-fix: Fix: W3.2 Smoke Directive Dependency Parser Fix (GO_WITH_TECH_DEBT)
- 169-002: W3.2 Smoke Directive Dependency Parser Fix (GO_WITH_TECH_DEBT)
- 169-003-fix-fix: Fix: Fix: C1 Memory Relations Migration (DONE)
- 169-003-fix: Fix: C1 Memory Relations Migration (GO_WITH_TECH_DEBT)
- 169-003: C1 Memory Relations Migration (GO_WITH_TECH_DEBT)
- 169-004-fix-fix: Fix: Fix: H2 Stub Memory Entries Backfill (DONE)
- 169-004-fix: Fix: H2 Stub Memory Entries Backfill (DONE)
- 169-004: H2 Stub Memory Entries Backfill (DONE)
- 169-005-fix-fix: Fix: Fix: H3 OSS Pre-Flip Secret Scan Baseline (DONE)
- 169-005-fix: Fix: H3 OSS Pre-Flip Secret Scan Baseline (DONE)
- 169-005: H3 OSS Pre-Flip Secret Scan Baseline (DONE)
- 169-006-fix-fix: Fix: Fix: H4 Dashboard Build CI Gate (DONE)
- 169-006-fix: Fix: H4 Dashboard Build CI Gate (GO_WITH_TECH_DEBT)
- 169-006: H4 Dashboard Build CI Gate (GO_WITH_TECH_DEBT)
- 169-007-fix: Fix: C2 Bug Z3 Memory Rebuild Safety (DONE)
- 169-007: C2 Bug Z3 Memory Rebuild Safety (GO_WITH_TECH_DEBT)
- 169-008-fix-fix: Fix: Fix: H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook (DONE)
- 169-008-fix: Fix: H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook (GO_WITH_TECH_DEBT)
- 169-008: H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook (GO_WITH_TECH_DEBT)
- 169-009-fix: Fix: H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix (GO_WITH_TECH_DEBT)
- 169-009: H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix (GO_WITH_TECH_DEBT)

---
## Sprint 170 — sprint-170

**Status:** COMPLETE
**Date:** 2026-05-15
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 5 |
| Tech Debt | 3 |
| No-Go | 1 |
| Coverage | 16.7% |
| Duration | 0ms |

### Tasks

- 170-001-fix: Fix: P0-3 Tmux Prompt Filename TaskId-Aware (DONE)
- 170-001: P0-3 Tmux Prompt Filename TaskId-Aware (GO_WITH_TECH_DEBT)
- 170-002-fix: Fix: P0-5 Docker Spawn Race Window Closure (DONE)
- 170-002: P0-5 Docker Spawn Race Window Closure (GO_WITH_TECH_DEBT)
- 170-003-fix: Fix: P0-6 Event Stream Prompt Write/Delete Visibility (NO_GO)
- 170-003: P0-6 Event Stream Prompt Write/Delete Visibility (GO_WITH_TECH_DEBT)

---
## Sprint 170 — sprint-170

**Status:** RETROSPECTIVE
**Date:** 2026-05-15
**Duration:** 2023s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 4 |
| Tech Debt | 2 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 2023306ms |

### Tasks

- 170-001: P0-3 Tmux Prompt Filename TaskId-Aware (GO_WITH_TECH_DEBT)
- 170-002: P0-5 Docker Spawn Race Window Closure (DONE)
- 170-003: P0-6 Event Stream Prompt Write/Delete Visibility (NO_GO)

---
## Sprint 171 — sprint-171

**Status:** RETROSPECTIVE
**Date:** 2026-05-15
**Duration:** 4595s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 31 |
| Completed | 29 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 4594661ms |

### Tasks

- 171-001: orchestra Lifecycle Audit (DONE)
- 171-002: orchestra Routing + Evaluation Audit (DONE)
- 171-003: orchestra Infra Audit (DONE)
- 171-004: core Types + Config Audit (DONE)
- 171-005: core Memory Subsystem Audit (DONE)
- 171-006: core Pools + Routing Audit (DONE)
- 171-007: agents Audit (DONE)
- 171-008: nervous Audit (DONE)
- 171-009: monitor + connectors Audit (DONE)
- 171-010: providers + api Audit (DONE)
- 171-011: mcp Audit (DONE)
- 171-012: cli Audit (DONE)
- 171-013: dashboard Audit (DONE)
- 171-014: extensions + scripts Audit (DONE)
- 171-015: Dead Code + ESM Hygiene Audit (DONE)
- 171-016: ADR Compliance Audit (DONE)
- 171-017: Security Audit (DONE)
- 171-018: Performance Audit (DONE)
- 171-019: Type Safety Audit (DONE)
- 171-020: Error Handling Audit (DONE)
- 171-021: Test Integrity Audit (DONE)
- 171-022: Memory V2 DB Integrity Audit (DONE)
- 171-023: Doc Audit Root (NO_GO)
- 171-024: Doc Audit docs Tree (DONE)
- 171-025: Doc Audit Config Contract Rules (DONE)
- 171-026: Doc Audit DB Sync Check (DONE)
- 171-027: Doc Audit Archive Summary (DONE)
- 171-028: DB Decision Reference Integrity Audit (DONE)
- 171-029: Cross-Cutting Synthesis + Coverage Doğrulama (DONE)

---
## Sprint 172 — sprint-172

**Status:** RETROSPECTIVE
**Date:** 2026-05-18
**Duration:** 4053s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 11 |
| Coverage | 0.0% |
| Duration | 4053411ms |

### Tasks

- 172-001: A1 — dependency_pipeline_enabled provenance drift (DONE)
- 172-002: A2 — RBAC + verify-gate enforcement honesty (DONE)
- 172-003: A3 — ADR-010 amendment (7 runtime dep) (DONE)
- 172-004: A4 — README 5-drift badge gerçek değer (DONE)
- 172-005: C1 — update-readme-stats.mjs auto-gen + CI gate (NO_GO)
- 172-006: C2 — reference docs auto-gen (MCP/ADR/CLI/agents) (NO_GO)
- 172-007: C3 — lint:link dead-link gate (NO_GO)
- 172-008: B1 — archive DB-parity doğrulama (B2 ön-koşulu) (NO_GO)
- 172-009: B2 — .gitignore/.npmignore + archive git rm --cached (NO_GO)
- 172-010: B3 — kök → docs/ taşıma + redirect (DONE)
- 172-011: B4 — worker-guide 3→1 + ADR-046 dup merge + reference rename (DONE)
- 172-012: B5 — deckent-hub kararı + examples workspace fix (NO_GO)

---
## Sprint 173 — sprint-173

**Status:** RETROSPECTIVE
**Date:** 2026-05-18
**Duration:** 860s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 22 |
| Completed | 22 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 859957ms |

### Tasks

- 173-001: Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp (DONE)
- 173-002: Slide 1 — Cover (DONE)
- 173-003: Slide 2 — The Problem (DONE)
- 173-004: Slide 3 — What is Deckent (Synthesis) (DONE)
- 173-005: Slide 4 — Core Roles (DONE)
- 173-006: Slide 5 — Sprint Lifecycle (DONE)
- 173-007: Slide 6 — DIRECTIVES-Driven Planning (DONE)
- 173-008: Slide 7 — Task Routing (DONE)
- 173-009: Slide 8 — 15 Built-in Agents (DONE)
- 173-010: Slide 9 — 21 Built-in Skills (DONE)
- 173-011: Slide 10 — Multi-Provider & ModelRegistry (DONE)
- 173-012: Slide 11 — Memory V2 (DB-First) (DONE)
- 173-013: Slide 12 — Dependency Pipeline ★ (DONE)
- 173-014: Slide 13 — ADR Governance (DONE)
- 173-015: Slide 14 — Nervous System (DONE)
- 173-016: Slide 15 — Observability (DONE)
- 173-017: Slide 16 — Spawn Backends (DONE)
- 173-018: Slide 17 — Capability Synthesis (DONE)
- 173-019: Slide 18 — CLI & MCP Surface (DONE)
- 173-020: Slide 19 — Roadmap (DONE)
- 173-021: Slide 20 — Closing & Call to Action (DONE)

---
## Sprint 174 — sprint-174

**Status:** RETROSPECTIVE
**Date:** 2026-05-18
**Duration:** 891s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 891165ms |

### Tasks

- 174-001: Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp (NO_GO)
- 174-002: Pitch deck — marketing-ai-pitch.md (15 slide) (DONE)
- 174-003: Canva template map — canva-kit/canva-bulk-template-map.md (DONE)
- 174-004: Canva bulk CSV — canva-kit/canva-bulk-sample.csv (DONE)
- 174-005: Aylık üretim rehberi — canva-kit/monthly-brand-report-howto.md (DONE)
- 174-006: Kit index + tutarlılık — canva-kit/README.md (DONE)

---
## Sprint 175 — sprint-175

**Status:** RETROSPECTIVE
**Date:** 2026-05-19
**Duration:** 3849s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 37 |
| Completed | 21 |
| Tech Debt | 2 |
| No-Go | 16 |
| Coverage | 15.0% |
| Duration | 3849199ms |

### Tasks

- 175-001: W0.1 — Runtime deps (node-pty + ws) (DONE)
- 175-002: W0.2 — ADR-010 amendment ext + ADR-062 (DONE)
- 175-003: W0.3 — TerminalConfig → DeckentConfig (DONE)
- 175-004: W0.4 — Shared terminal types (DONE)
- 175-005: W1.1 — AuthProvider (bypass-independent) (DONE)
- 175-006: W1.2 — SessionBackend + LocalPtyBackend (NO_GO)
- 175-007: W1.3 — TerminalAudit (tenant-scoped DB) (DONE)
- 175-008: W1.4 — PtySessionManager (NO_GO)
- 175-009: W2.1 — WS gateway (auth-before-bridge + reattach) (DONE)
- 175-010: W2.2 — HTTP control + localhost bootstrap inject (NO_GO)
- 175-011: W2.3 — serve CLI surface (DONE)
- 175-012: W3.1 — xterm deps + terminal-api (DONE)
- 175-013: W3.2 — useTerminalSocket (DONE)
- 175-014: W3.3 — TerminalView (xterm) (NO_GO)
- 175-015: W3.4 — TerminalTabs + TerminalPanel (NO_GO)
- 175-016: W3.5 — DockPanel + Layout (NO_GO)
- 175-017: W3.6 — ConfigPage Terminal kategori + i18n (NO_GO)
- 175-018: W4.1 — E2E reattach integration (NO_GO)
- 175-019: W4.2 — Docs (guide EN+TR + reference) (DONE)
- 175-020: W4.3 — Final verification (GO_WITH_TECH_DEBT)

---
## Sprint 177 — sprint-177

**Status:** RETROSPECTIVE
**Date:** 2026-05-20
**Duration:** 1494s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 5 |
| Tech Debt | 1 |
| No-Go | 2 |
| Coverage | 15.8% |
| Duration | 1494231ms |

### Tasks

- 177-001: Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented (NO_GO)
- 177-002: 177-001 — Worker rollback: git-stash snapshot-on-spawn (DONE)
- 177-003: 177-002 — deckent kill cascade fix (DONE)
- 177-004: 177-003 — Tmux backend deprecate path (GO_WITH_TECH_DEBT)
- 177-005: 177-004 — Config template-regen guard + restore docs (DONE)
- 177-006: 177-005 — nervous_system directives_protection baseline-update hook (DONE)

---
## Sprint 178 — sprint-178

**Status:** RETROSPECTIVE
**Date:** 2026-05-20
**Duration:** 2112s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 11 |
| Completed | 9 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 2111689ms |

### Tasks

- 178-001: Fix debt: Tech debt from 175-020-fix: All 5 automatic verification gates executed:

1. npm (NO_GO)
- 178-002: Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented (DONE)
- 178-003: 178-001 — Node 24/26 test assertion sweep (DONE)
- 178-004: 178-002 — Doc updates (Node 24/26 yayılma) (DONE)
- 178-005: 178-003 — Tmux backend code removal (DONE)
- 178-006: 178-004 — CI flake fix (PID portability + mock hygiene) (DONE)
- 178-007: 178-005 — TOPP B+C continuous-dispatch ★ MUST (DONE)

---
## Sprint 179 — sprint-179

**Status:** RETROSPECTIVE
**Date:** 2026-05-20
**Duration:** 3260s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 17 |
| Tech Debt | 9 |
| No-Go | 0 |
| Coverage | 7.7% |
| Duration | 3259623ms |

### Tasks

- 179-001: W0-1 — Dependency aggregate fix-aware (Bug A foundation) (GO_WITH_TECH_DEBT)
- 179-002: W1-1 — Auto-debt empty-scope inheritance (GO_WITH_TECH_DEBT)
- 179-003: W1-2 — Re-plan orphan task file cleanup (DONE)
- 179-004: W2-3 — DEP0190 shell:true win32-only conditional (GO_WITH_TECH_DEBT)
- 179-005: W2-4 — Coverage hard-floor / aspirational split (DONE)
- 179-006: W2-7 — CI-only test flakes (PID portability + mock hygiene) (GO_WITH_TECH_DEBT)
- 179-007: W3-5 — Dashboard TS errors + root lint wire (GO_WITH_TECH_DEBT)
- 179-008: W3-6 — doctor DECISIONS.md obsolete + 5-file cascade (GO_WITH_TECH_DEBT)
- 179-009: W4-8 — Prompt guard (I1 + I2 invariants) ★ BETA MUST (GO_WITH_TECH_DEBT)
- 179-010: W4-9 — Command guard (I3 default-deny remote) ★ BETA MUST (GO_WITH_TECH_DEBT)
- 179-011: W4-10 — Outbound rate-limit (I5 tenant isolation) ★ BETA MUST (DONE)
- 179-012: W5-11 — mTLS hook (AuthProvider interface) ★ BETA MUST (GO_WITH_TECH_DEBT)
- 179-013: W5-12 — Audit HMAC chain + verify CLI (I4 invariant) ★ BETA MUST (DONE)

---
## Sprint 180 — sprint-180

**Status:** RETROSPECTIVE
**Date:** 2026-05-20
**Duration:** 2936s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Completed | 12 |
| Tech Debt | 8 |
| No-Go | 8 |
| Coverage | 15.2% |
| Duration | 2935858ms |

### Tasks

- 180-001: W0 — Nervous config schema sync (Step F) (DONE)
- 180-002: W1-1 — sprint-state-tracker getSprintStateSnapshot (Step B) (NO_GO)
- 180-003: W1-2 — Nervous bootstrap fabrika (Step A) (GO_WITH_TECH_DEBT)
- 180-004: W2-1 — Nervous action handlers (Step C) (GO_WITH_TECH_DEBT)
- 180-005: W2-2 — Nervous IPC queue MCP→Executor (Step E) (DONE)
- 180-006: W3-1 — Sprint-controller nervous wire (Step D) (GO_WITH_TECH_DEBT)
- 180-007: W3-2 — Faz 1 smoke config (NO_GO)
- 180-008: W3-3 — Nervous integration runtime test (GO_WITH_TECH_DEBT)
- 180-009: W4-1 — Worker .result coverage zorunluluk ★ BETA MUST (GO_WITH_TECH_DEBT)
- 180-010: W4-2 — Panic guard onay UI (Layer 3 synergy) (GO_WITH_TECH_DEBT)
- 180-011: W4-3 — Self-audit gate vitest fix ★ BETA MUST (NO_GO)
- 180-012: W5-1 — npm publish v1.0.0-beta.1 readiness ★ BETA LAUNCH (NO_GO)
- 180-013: W5-2 — OSS GA docs review ★ BETA LAUNCH (GO_WITH_TECH_DEBT)
- 180-014: W5-3 — auto_restore=true + nervous user guide kısa giriş (GO_WITH_TECH_DEBT)

---
## Sprint 181 — sprint-181

**Status:** RETROSPECTIVE
**Date:** 2026-05-21
**Duration:** 1436s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 1435614ms |

### Tasks

- 181-001: W1-1 — CI workflow'una dashboard deps install adımı ekle (NO_GO)
- 181-002: W1-2 — package.json root scripts gözden geçir + tsc:dashboard alias (DONE)
- 181-003: W2-1 — Sprint smoke + CI yeşil verify (DONE)

---
## Sprint 182 — sprint-182

**Status:** RETROSPECTIVE
**Date:** 2026-05-21
**Duration:** 2974s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 24 |
| Completed | 14 |
| Tech Debt | 0 |
| No-Go | 10 |
| Coverage | 5.9% |
| Duration | 2974018ms |

### Tasks

- 182-001: W1-1 — Mock hygiene: orphan-cleaner-ipc + archive-debt `renameSync` ekle (NO_GO)
- 182-002: W1-2 — cli/run.test.ts SpawnBackendFactory mock chain (DONE)
- 182-003: W1-3 — Full vitest sweep CI=true parity verify (NO_GO)
- 182-004: W2-1 — `dependency_pipeline_enabled: true` ADR-045 wire verify (DONE)
- 182-005: W2-2 — Auto-debt prepend offset drift fix (Dependencies title-prefix resolver) (NO_GO)
- 182-006: W2-3 — Verify task pattern redesign (DONE)
- 182-007: W3-PQ-1 — F1 `${IDEMPOTENCY_KEY}` injection fix (DONE)
- 182-008: W3-PQ-2 — F2 + F3 truncation kaldır (skill + ADR full content) (DONE)
- 182-009: W3-PQ-3 — F4 Agent prompt single source (PROMPT.md kanonik) (DONE)
- 182-010: W3-PQ-4 — F5 + F6 DIRECTIVES parser fix (Files + title/desc) (DONE)
- 182-011: W3-PQ-5 — F7 ADR relevance threshold (default 0.3) (DONE)
- 182-012: W3-PQ-6 — F8 Agent override semantic warning (DONE)
- 182-013: W3-PQ-7 — Integration smoke: Sprint 181-001/002 prompt regression (NO_GO)
- 182-014: W4-1 — Beta launch smoke: validate:publish 6/6 gate green (NO_GO)
- 182-015: W4-2 — package.json final + lint:adr + lint:link (DONE)
- 182-016: W4-3 — ADR-048 Prompt Lifecycle Contract amendment (DONE)
- 182-017: W4-4 — Sprint 182 retro + Sprint 183 post-beta stub (DONE)

---
## Sprint 183 — sprint-183

**Status:** RETROSPECTIVE
**Date:** 2026-05-21
**Duration:** 1507s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 11 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 10.0% |
| Duration | 1506938ms |

### Tasks

- 183-001: W1-1 — P0-1 Nervous PLAN-phase pasif (FSWatcher debounce + phase guard) (DONE)
- 183-002: W1-2 — P0-2 DEPENDENCY_BLOCKED event spam debounce (state-change emit) (DONE)
- 183-003: W1-3 — P0-3 Worker timeout root cause investigation + fix (DONE)
- 183-004: W2-1 — Sprint 182 W1-1 recovery: mock hygiene orphan-cleaner-ipc + archive-debt (DONE)
- 183-005: W2-2 — Sprint 182 W1-3 recovery: vitest CI=true parity smoke (DONE)
- 183-006: W2-3 — Sprint 182 W2-2 recovery: title-prefix Dependencies resolver tamamla (DONE)
- 183-007: W2-4 — Sprint 182 W3-PQ-7 recovery: integration smoke regression tamamla (DONE)
- 183-008: W3-1 — Sprint 182 W4-1 recovery: validate:publish 6/6 GREEN recheck + Brain re-eval RC (DONE)
- 183-009: W3-2 — Beta launch hijyen: npm pack + lint:adr + lint:link final (DONE)
- 183-010: W3-3 — v1.0.0-beta.1 final smoke (build:all + vitest + dashboard + serve) (NO_GO)

---
## Sprint 186 — sprint-186

**Status:** RETROSPECTIVE
**Date:** 2026-05-21
**Duration:** 1964s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 69 |
| Completed | 31 |
| Tech Debt | 0 |
| No-Go | 38 |
| Coverage | 0.0% |
| Duration | 1964352ms |

### Tasks

- 186-001: Audit src/agents/adaptive-agent.ts (DONE)
- 186-002: Audit src/agents/agent-genealogy.ts (DONE)
- 186-003: Audit src/agents/agent-retirement.ts (DONE)
- 186-004: Audit src/agents/auditor.ts (DONE)
- 186-005: Audit src/agents/cross-sprint-analyzer.ts (DONE)
- 186-006: Audit src/agents/index.ts (DONE)
- 186-007: Audit src/agents/permission-guard.ts (DONE)
- 186-008: Audit src/agents/prompt-ab-test.ts (DONE)
- 186-009: Audit src/agents/prompt-analytics.ts (DONE)
- 186-010: Audit src/agents/prompt-evolution.ts (DONE)
- 186-011: Audit src/agents/prompt-metrics.ts (DONE)
- 186-012: Audit src/agents/prompt-rollback.ts (DONE)
- 186-013: Audit src/agents/prompt-version.ts (DONE)
- 186-014: Audit src/agents/shared-context.ts (DONE)
- 186-015: Audit src/agents/specialization-drift.ts (DONE)
- 186-016: Audit src/agents/worker-ipc.ts (DONE)
- 186-017: Audit src/agents/worker-lifecycle.ts (DONE)
- 186-018: Audit src/agents/worker-log.ts (DONE)
- 186-019: Audit src/agents/worker-rollback.ts (DONE)
- 186-020: Audit src/agents/worker-verify.ts (DONE)
- 186-021: Audit src/agents/worker.ts (DONE)
- 186-022: Audit src/core/activation-engine.ts (DONE)
- 186-023: Audit src/core/active-workers.ts (DONE)
- 186-024: Audit src/core/adr-file-sync.ts (DONE)
- 186-025: Audit src/core/adr-seed.ts (DONE)
- 186-026: Audit src/core/agent-cache.ts (DONE)
- 186-027: Audit src/core/agent-pool.ts (DONE)
- 186-028: Audit src/core/agent-selector.ts (DONE)
- 186-029: Audit src/core/agent-types.ts (DONE)
- 186-030: Audit src/core/analyzer.ts (DONE)
- 186-031: Audit src/core/anthropic-http-client.ts (DONE)
- 186-032: Audit src/core/cascade-detector.ts (NO_GO)
- 186-033: Audit src/core/ci-learning.ts (NO_GO)
- 186-034: Audit src/core/condition-evaluator.ts (NO_GO)
- 186-035: Audit src/core/config-migration.ts (NO_GO)
- 186-036: Audit src/core/config-types.ts (NO_GO)
- 186-037: Audit src/core/config-validator.ts (NO_GO)
- 186-038: Audit src/core/config.ts (NO_GO)
- 186-039: Audit src/core/constants.ts (NO_GO)
- 186-040: Audit src/core/cost-calculator.ts (NO_GO)
- 186-041: Audit src/core/cost-config-loader.ts (NO_GO)
- 186-042: Audit src/core/credential-encryption.ts (NO_GO)
- 186-043: Audit src/core/credentials.ts (NO_GO)
- 186-044: Audit src/core/debug-log.ts (NO_GO)
- 186-045: Audit src/core/decision-config.ts (NO_GO)
- 186-046: Audit src/core/decision-types.ts (NO_GO)
- 186-047: Audit src/core/deck-file.ts (NO_GO)
- 186-048: Audit src/core/deck-interpolation.ts (NO_GO)
- 186-049: Audit src/core/environment.ts (NO_GO)
- 186-050: Audit src/core/errors.ts (NO_GO)

---
## Sprint 187 — sprint-187

**Status:** RETROSPECTIVE
**Date:** 2026-05-22
**Duration:** 193s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 193123ms |

### Tasks

- 187-001: api-surface.md Memory V2 atıf güncellemesi (DONE)

---
## Sprint 188 — sprint-188

**Status:** RETROSPECTIVE
**Date:** 2026-05-22
**Duration:** 1675s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1674588ms |

### Tasks

- 188-001: W1-T01 — CLI komut envanteri ve bütünlük denetimi (DONE)
- 188-002: W1-T02 — MCP araç ve resource envanteri (DONE)
- 188-003: W1-T03 — core/ çekirdek modül sağlığı (DONE)
- 188-004: W1-T04 — orchestra/ sprint lifecycle sağlığı (DONE)
- 188-005: W1-T05 — agents/ + monitor/ sağlığı (DONE)
- 188-006: W1-T06 — nervous/ + connectors/ + providers/ sağlığı (DONE)
- 188-007: W1-T07 — api/ + dashboard/ tutarlılığı (DONE)
- 188-008: W1-T08 — scripts/ + build/test config envanteri (DONE)
- 188-009: W1-T09 — feature envanteri ve doğruluk denetimi (DONE)
- 188-010: W2-T10 — CLI↔MCP parity tam haritası (DONE)
- 188-011: W2-T11 — doc↔kod drift denetimi (DONE)
- 188-012: W2-T12 — ADR uyumu + test sağlığı denetimi (DONE)

---
## Sprint 189 — sprint-189

**Status:** RETROSPECTIVE
**Date:** 2026-05-22
**Duration:** 2591s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 23 |
| Completed | 19 |
| Tech Debt | 0 |
| No-Go | 4 |
| Coverage | NaN% |
| Duration | 2590576ms |

### Tasks

- 189-001: 189-001 — core/notify.ts ADR-008 ihlali fix (dependency inversion) (DONE)
- 189-002: 189-002 — Coverage threshold kapısı + CI gate (WrongStack WS-Z1) (DONE)
- 189-003: 189-003 — MCP_INSTRUCTIONS 27→31 + 4 eksik tool + lint regression-guard (DONE)
- 189-004: 189-004 — docs/reference/api.md Memory V2 stale referans temizliği (DONE)
- 189-005: 189-005 — docs/reference/cli.md + cli-commands.md PROJECT-IDENTITY.md temizliği (DONE)
- 189-006: 189-006 — Dashboard StatusPage 404 fix (App.tsx wire) (DONE)
- 189-007: 189-007 — Provider CLI detection RC + deckent doctor --providers (DONE)
- 189-008: 189-008 — deckent_start MCP cost-gate ekleme (Sprint 140 $42 aşımı tekrarı önleme) (DONE)
- 189-009: 189-009 — deckent_kill MCP force/userExplicit + autoApprove parite (NO_GO)
- 189-010: 189-010 — SECURITY.md threat model + ADR-037 advisory notu (WrongStack WS-Z3) (DONE)
- 189-011: 189-011 — API endpoint envanteri + E2E HTTP test suite başlangıcı (NO_GO)
- 189-012: 189-012 — IDENTITY.md MCP 27→31 sync + AUTOGEN drift fix (DONE)
- 189-013: 189-013 — .claude/rules/auditor.md PATTERNS.md → memory.db rule güncelleme (DONE)
- 189-014: 189-014 — directives-stress-simulator.mjs koruma + validate-publish duplicate temizlik (DONE)
- 189-015: 189-015 — Test fail 36 kategorize + Sprint 190 fix plan (audit) (DONE)
- 189-016: 189-016 — CHANGELOG sprint-reporter otomatik update wire (WrongStack WS-Z2 follow-up) (DONE)

---
## Sprint 190 — sprint-190

**Status:** RETROSPECTIVE
**Date:** 2026-05-23
**Duration:** 3390s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 25 |
| Completed | 9 |
| Tech Debt | 1 |
| No-Go | 16 |
| Coverage | NaN% |
| Duration | 3390466ms |

### Tasks

- 190-001: 190-001 — IDENTITY.md sat30 AUTOGEN extend + Memory DB retro entry hook fix (DONE)
- 190-002: 190-002 — Provider isAvailable 3-state (binary+auth) + doctor mesajları (DONE)
- 190-003: 190-003 — Release workflow npm publish step + provenance + 9 test fix (DONE)
- 190-004: 190-004 — `deckent chat` Path B subprocess + tty forward + MCP auto-attach env (NO_GO)
- 190-005: 190-005 — MCP auto-attach helper + Claude/Codex/Gemini CLI integration (NO_GO)
- 190-006: 190-006 — memory.db `chat` entry type + chat session/turn helpers + --resume (NO_GO)
- 190-007: 190-007 — Naïve sohbet modu + system prompt heuristic + docs/guide/chat-mode.md (NO_GO)
- 190-008: 190-008 — 19 TDD test (api-md+identity-refs) + 7 env-fail (codex-config ENOSPC + alert-emitter) yeşillenmesi (DONE)
- 190-009: 190-009 — Ollama provider adapter (Local LLM, RTX 5090 vision) (GO_WITH_TECH_DEBT)
- 190-010: 190-010 — models.dev live catalog + 24h cache + bundled fallback (NO_GO)
- 190-011: 190-011 — `deckent models list/refresh/tier` CLI + `deckent_models` MCP tool (DONE)
- 190-012: 190-012 — README.md baştan yaz (Trinity vision + OSS GA-ready) (DONE)
- 190-013: 190-013 — Getting Started 5dk + first-sprint + chat-mode docs (DONE)
- 190-014: 190-014 — docs/cookbook/ 3 örnek tarif (REST API, bug fix, doc update) (DONE)
- 190-015: 190-015 — API E2E test extension (rate limit + auth + SSE 15+ test) (NO_GO)
- 190-016: 190-016 — CONTRIBUTING + CODE_OF_CONDUCT + GitHub issue/PR templates (NO_GO)

---
## Sprint 191 — sprint-191

**Status:** RETROSPECTIVE
**Date:** 2026-05-23
**Duration:** 4094s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 29 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 26 |
| Coverage | 13.6% |
| Duration | 4094141ms |

### Tasks

- 191-001: 191-001 — Docker worker memory budget — max_workers 6→3 + per-worker memory tuning (DONE)
- 191-002: 191-002 — `runtime_extension_enabled: true` default + worker timeout extension wire (NO_GO)
- 191-003: 191-003 — Sprint 190 retroactive agent stats reclassify + outcome-tracker correction tool (NO_GO)
- 191-004: 191-004 — Cost-gate planSprint mode-respecting (start.ts:349 fix) (NO_GO)
- 191-005: 191-005 — ci-guardian agent activation fix (Sprint 190 warning loop) (DONE)
- 191-006: 191-006 — MCP `deckent_start` fire-and-forget Promise lifecycle hardening (DONE)
- 191-007: 191-007 — CLI top-level error handler — silent exit kill (NO_GO)
- 191-008: 191-008 — Memory DB retro entry write hook — Sprint 167 chronic gap closure (NO_GO)
- 191-009: 191-009 — IDENTITY.md AUTOGEN block extension (Project Status table managed) (NO_GO)
- 191-010: 191-010 — Dashboard non-terminal endpoints token bootstrap fix (auth) (NO_GO)
- 191-011: 191-011 — Temp agent PROMPT.md generator template (Sprint 190 7x warning) (NO_GO)
- 191-012: 191-012 — Karpathy 4-discipline anchor rule doc (.claude/rules/karpathy-discipline.md) (NO_GO)
- 191-013: 191-013 — Built-in agent PROMPT.md Karpathy refactor pass 1 (top 5 agents) (NO_GO)
- 191-014: 191-014 — Built-in skill SKILL.md Karpathy refactor pass 1 (top 5 skills) (NO_GO)
- 191-015: 191-015 — Worker prompt template — Karpathy block injection (NO_GO)
- 191-016: 191-016 — ADR-053 + ADR-061 (AEGIS) Karpathy cross-reference + amendment (NO_GO)
- 191-017: 191-017 — Sprint 190 carry-over: provider isAvailable 3-state + Ollama TECH_DEBT closure (NO_GO)

---
## Sprint 192 — sprint-192

**Status:** RETROSPECTIVE
**Date:** 2026-05-24
**Duration:** 3243s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 25 |
| Completed | 5 |
| Tech Debt | 1 |
| No-Go | 20 |
| Coverage | 8.6% |
| Duration | 3243495ms |

### Tasks

- 192-001: 192-001 — sprint-controller.ts synthetic NO_GO bloklarına liveness check (W-INTEGRITY I-2) (NO_GO)
- 192-002: 192-002 — runtime_extension_enabled default true (Sprint 191 191-002 carry-over) (NO_GO)
- 192-003: 192-003 — outcome-tracker reclassifyTaskOutcome GERÇEK implementation (Sprint 191 191-003 carry-over — dishonest worker case) (GO_WITH_TECH_DEBT)
- 192-004: 192-004 — CLI top-level error handler — uncaughtException + unhandledRejection (Sprint 191 191-007 carry-over) (NO_GO)
- 192-005: 192-005 — sprint-finalizer retro hook DB write (Sprint 191 191-008 carry-over) (DONE)
- 192-006: 192-006 — task-builder Karpathy block injection (Sprint 191 191-015 carry-over) (NO_GO)
- 192-007: 192-007 — Provider isAvailable 3-state + Ollama TECH_DEBT (Sprint 191 191-017 carry-over) (DONE)
- 192-008: 192-008 — Hotfix telemetri — never-dispatched + alive-grace event sayım retro'ya (W-INTEGRITY I-1) (DONE)
- 192-009: 192-009 — EVALUATE phase trigger sıkılaştırma (W-INTEGRITY I-3) (NO_GO)
- 192-010: 192-010 — TaskEvaluation.DEFERRED enum + retro reporting (W-INTEGRITY I-4) (DONE)
- 192-011: 192-011 — Sprint-level adaptive timeout (W-INTEGRITY I-5) (NO_GO)
- 192-012: 192-012 — Dishonest worker result detector (W-INTEGRITY I-8) (NO_GO)
- 192-013: 192-013 — worker_memory_limit 4g→2g + max_workers 3→12 deney (W-M M-1) (NO_GO)
- 192-014: 192-014 — NODE_OPTIONS --max-old-space-size-percentage container env (W-M M-2) (NO_GO)
- 192-015: 192-015 — Adaptive scheduler — host RAM tespit + max_workers auto-calc (W-M M-3) (NO_GO)
- 192-016: 192-016 — RAM telemetri — `docker stats` snapshot retro'ya + VDS/VPS analiz (W-M M-7) (NO_GO)
- 192-017: 192-017 — 5 ek agent PROMPT.md Karpathy refactor (L-6: security-auditor, performance-analyzer, accessibility-auditor, data-engineer, devops-engineer) (NO_GO)
- 192-018: 192-018 — 5 ek skill SKILL.md Karpathy refactor (L-7: python-expert, anthropic-sdk, frontend-design, docker-expert, git-expert) (NO_GO)
- 192-019: 192-019 — Sprint 191 retroactive bulk reclassify (192-003 API kullanarak) (NO_GO)

---
## Sprint 193 — sprint-193

**Status:** RETROSPECTIVE
**Date:** 2026-05-24
**Duration:** 85s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 84786ms |

### Tasks

- 193-001: SMOKE-001 — i18n en.json duplicate error.lock_conflict temizle (NO_GO)

---
## Sprint 195 — sprint-195

**Status:** RETROSPECTIVE
**Date:** 2026-05-26
**Duration:** 1712s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | NaN% |
| Duration | 1711631ms |

### Tasks

- 195-001: 195-001 — Brain disk-verify gate (sentetik NO_GO 5 kaynak fix, W-INTEGRITY) (DONE)
- 195-002: 195-002 — CHANGELOG Sprint 157-194 backfill scripti (DONE)
- 195-003: 195-003 — SECURITY.md ADR-037 V2 disclosure + README pre-beta durumu (DONE)
- 195-004: 195-004 — models.dev bootstrap startup wire (NO_GO)
- 195-005: 195-005 (OPSIYONEL) — Dockerfile.worker Codex/Gemini install + sanity guide (DONE)

---
## Sprint 196 — sprint-196

**Status:** RETROSPECTIVE
**Date:** 2026-05-26
**Duration:** 2473s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 11 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 5 |
| Coverage | NaN% |
| Duration | 2473025ms |

### Tasks

- 196-001: 196-001 — Sprint 191/192/193/194/195 retroactive bulk reclassify (DONE)
- 196-002: 196-002 — WP-1 Persona-task domain matcher (worker prompt routing fix) (DONE)
- 196-003: 196-003 — WP-5 Anthropic prompt cache wire (9x cost save) (NO_GO)
- 196-004: 196-004 — WP-3 Boundary guard scope auto-derive (test dizini otomatik) (DONE)
- 196-005: 196-005 — WP-4 Token usage orchestrator-side fill (worker'dan kaldır) (NO_GO)
- 196-006: 196-006 — WP-2 FIX worker idempotency mode flag (verify-only vs re-implement) (DONE)
- 196-007: 196-007 — Test fail kategorize update (Sprint 195 sonrası 53 fail) (DONE)
- 196-008: 196-008 — CHANGELOG Sprint 172-194 kalan entries (NO_GO)

---
## Sprint 197 — sprint-197

**Status:** RETROSPECTIVE
**Date:** 2026-05-26
**Duration:** 895s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | NaN% |
| Duration | 895132ms |

### Tasks

- 197-001: 197-001 — disk-verify gate untracked file detection fix (DONE)
- 197-002: 197-002 — Sprint 191-196 retroactive reclassify çalıştır (script run + audit) (DONE)
- 197-003: 197-003 — CHANGELOG Sprint 172-194 kalan 19 entry backfill (script run) (DONE)
- 197-004: 197-004 — WSL2 OOM mitigation (max_workers + worker_memory + adaptive) (NO_GO)
- 197-005: 197-005 — Persona-task matcher canlı doğrulama + threshold tuning (DONE)

---
## Sprint 199 — sprint-199

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 2421s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 9 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 4 |
| Coverage | 0.0% |
| Duration | 2421367ms |

### Tasks

- 199-001: 198-001 — Sentetik NO_GO KAYNAK 6+7 fix (sprint-phases + sprint-controller gate wire) (DONE)
- 199-002: 198-002 — memory.db sprint-log finalize bug fix + Sprint 194/196 row backfill (DONE)
- 199-003: 198-003 — managed-docs auditor.md template regression fix (NO_GO)
- 199-004: 198-004 — Kapsamlı plan dosyaları Sprint 195-197 status refresh (3 dosya) (DONE)
- 199-005: 198-005 — 6-worker × 2g config verify + RAM deney readiness audit (NO_GO)
- 199-006: 198-006 — Test baseline 41 → 26 attack (en kolay 15 fail) (NO_GO)
- 199-007: 198-007 — Sprint 191-196 retroactive reclassify re-run (12/12 hedef) (NO_GO)
- 199-008: 198-009 — Memory backup auto-sync mekanizması (user-memory ↔ core-memory) (DONE)
- 199-009: 198-008 — Beta launch smoke pre-check (npm pack dry-run + 20-gate verify) (DONE)

---
## Sprint 200 — sprint-200

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 2072s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 7 |
| Tech Debt | 0 |
| No-Go | 8 |
| Coverage | 0.0% |
| Duration | 2072123ms |

### Tasks

- 200-001: 198-001 — Sentetik NO_GO KAYNAK 6+7 fix (sprint-phases + sprint-controller gate wire) (DONE)
- 200-002: 198-002 — memory.db sprint-log finalize bug fix + Sprint 194/196 row backfill (NO_GO)
- 200-003: 198-003 — managed-docs auditor.md template regression fix (NO_GO)
- 200-004: 198-004 — Kapsamlı plan dosyaları Sprint 195-197 status refresh (3 dosya) (DONE)
- 200-005: 198-005 — 6-worker × 2g config verify + RAM deney readiness audit (DONE)
- 200-006: 198-006 — Test baseline 41 → 26 attack (en kolay 15 fail) (NO_GO)
- 200-007: 198-007 — Sprint 191-196 retroactive reclassify re-run (12/12 hedef) (DONE)
- 200-008: 198-009 — Memory backup auto-sync mekanizması (user-memory ↔ core-memory) (NO_GO)
- 200-009: 198-008 — Beta launch smoke pre-check (npm pack dry-run + 20-gate verify) (DONE)

---
## Sprint 201 — sprint-201

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 2155s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 2154598ms |

### Tasks

- 201-001: 201-001 — README + landing içerik kullanıcı-dostu elden geçirme (DONE)
- 201-002: 201-002 — W-H doc-drift long-tail kapat (api.md + reference temizlik) (DONE)
- 201-003: 201-003 — develop→ürün yayın senkronizasyon script'i (DONE)
- 201-004: 201-004 — İki-repo konumlandırma ADR + audit-report immutable note (DONE)
- 201-005: 201-005 — Clean-clone smoke verify (deckent son haliyle çalışıyor kanıtı) (DONE)
- 201-006: 201-006 — Test baseline 28 → ≤20 attack (NO_GO)

---
## Sprint 202 — sprint-202

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 3379s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 9 |
| Completed | 4 |
| Tech Debt | 0 |
| No-Go | 5 |
| Coverage | 0.0% |
| Duration | 3379359ms |

### Tasks

- 202-001: 202-001 — Ollama provider bootstrap kaydı (detectOllama + factory) (DONE)
- 202-002: 202-002 — Ollama model registry (tier→local model) (NO_GO)
- 202-003: 202-003 — Claude-hardcode temizliği (registry-default fallback) (DONE)
- 202-004: 202-004 — Token throttle (computeBackoff wire + pre-spawn quota gate) (NO_GO)
- 202-005: 202-005 — Doc-align (Gate #8 PARTIAL + chat.ts live + Sprint 185-200 arşiv) (DONE)
- 202-006: 202-006 — Provider-free smoke verify (sıfır-API-key + Ollama senaryosu) (NO_GO)

---
## Sprint 203 — sprint-203

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 1102s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 14 |
| Completed | 8 |
| Tech Debt | 1 |
| No-Go | 6 |
| Coverage | 0.0% |
| Duration | 1101618ms |

### Tasks

- 203-001: 203-001 — Docker provider-binary seçimi (claude/codex/gemini) (DONE)
- 203-002: 203-002 — Docker provider-aware auth mount (GO_WITH_TECH_DEBT)
- 203-003: 203-003 — Dockerfile.worker multi-CLI (build-arg opt-in) (DONE)
- 203-004: 203-004 — Provider-free smoke genişlet (Docker yolu dahil) (DONE)
- 203-005: 203-005 — Native chat tool-use loop iskelet (Path C foundation) (NO_GO)
- 203-006: 203-006 — Chat history memory entegrasyonu (appendChatTurn wire) (NO_GO)
- 203-007: 203-007 — chat-native CLI komut kaydı (deckent chat --native) (NO_GO)
- 203-008: 203-008 — Kalan hardcode-3 değerlendirme + temizlik (DONE)
- 203-009: 203-009 — ADR-066 provider-independence finalize + doc (DONE)

---
## Sprint 204 — sprint-204

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 1160s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 9 |
| Tech Debt | 0 |
| No-Go | 6 |
| Coverage | 0.0% |
| Duration | 1160137ms |

### Tasks

- 204-001: 204-001 — Circular import fix: MODEL_TIERS lazy-init (DONE)
- 204-002: 204-002 — ci-baseline auto-regen gerçek-değer fix (DONE)
- 204-003: 204-003 — Implementation intent için built-in agent adaylığı (NO_GO)
- 204-004: 204-004 — Stale temp-agent demote eşiği + react-template stack-guard (DONE)
- 204-005: 204-005 — Native chat streaming response (Path C) (NO_GO)
- 204-006: 204-006 — Multi-turn context window (son N turn inject) (DONE)
- 204-007: 204-007 — Chat resume (--resume son oturumu yükle) (DONE)
- 204-008: 204-008 — Multi-tenant tenantId iskelet (NO_GO)
- 204-009: 204-009 — F3 ADR taslağı + ROADMAP tracker güncelle (DONE)

---
## Sprint 205 — sprint-205

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 818s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 818023ms |

### Tasks

- 205-001: 205-001 — Agent routing canlı doğrulama testi (implementation→built-in) (DONE)
- 205-002: 205-002 — spawn-backend-docker max_workers testi config-agnostic (DONE)
- 205-003: 205-003 — start-lifecycle flaky fix (DONE)
- 205-004: 205-004 — docker-backend + identity-generator + error-handling flaky fix (DONE)
- 205-005: 205-005 — Scheduled flow tipi + parser iskelet (DONE)
- 205-006: 205-006 — Flow registry (CRUD + persist) (DONE)
- 205-007: 205-007 — deckent flow CLI komut iskelet (list/add) (DONE)
- 205-008: 205-008 — Audit log query API iskelet (DONE)
- 205-009: 205-009 — F4 ADR taslağı + ROADMAP tracker güncelle (DONE)

---
## Sprint 206 — sprint-206

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 934s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 16 |
| Completed | 12 |
| Tech Debt | 0 |
| No-Go | 4 |
| Coverage | NaN% |
| Duration | 933832ms |

### Tasks

- 206-001: 206-001 — flow CLI registerFlow → CLI entry wire (gerçek gap) (DONE)
- 206-002: 206-002 — docker-backend test izolasyon fix (kill/list state) (DONE)
- 206-003: 206-003 — docker-oom gracefulTimeout forward fix (NO_GO)
- 206-004: 206-004 — auditor.md managed-docs template legacy temizlik (NO_GO)
- 206-005: 206-005 — F3-003 webhook/event trigger tipi + handler iskelet (DONE)
- 206-006: 206-006 — F2 native chat gerçek provider adapter binding (DONE)
- 206-007: 206-007 — Scheduled-flow runtime tick/scheduler iskelet (DONE)
- 206-008: 206-008 — F4 RBAC role-check iskelet (tenant-aware permission) (DONE)
- 206-009: 206-009 — ADR-069 (event-driven + RBAC) + ROADMAP tracker güncelle (DONE)

---
## Sprint 207 — sprint-207

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 952s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 9 |
| Completed | 9 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 952452ms |

### Tasks

- 207-001: 207-001 — Model registry bundled apiId güncel + "stale" işareti (GO_WITH_TECH_DEBT)
- 207-002: 207-002 — bootstrapFromCatalog apiId merge doğrula + wire (DONE)
- 207-003: 207-003 — Cost-estimate çıktısı catalog-aware (parametrik model adı) (DONE)
- 207-004: 207-004 — docker-backend test izolasyon (kill/list state) (DONE)
- 207-005: 207-005 — managed-docs auditor template memory.db pattern (DONE)
- 207-006: 207-006 — Brain-fix canlı doğrulama testi (coverage:null → 0 false-FIX) (DONE)
- 207-007: 207-007 — RBAC enforce wire (audit-query'ye can() gate) (DONE)
- 207-008: 207-008 — Flow scheduler + event-trigger birleşik dispatch (DONE)
- 207-009: 207-009 — ADR-070 (Brain Evaluation Integrity + Zero-Hard-Code) + ROADMAP (DONE)

---
## Sprint 208 — sprint-208

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 1059s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 16 |
| Completed | 16 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1058525ms |

### Tasks

- 208-001: 208-001 — mergeFromCatalog id eşleşme kök-bug fix (DONE)
- 208-002: 208-002 — CLI sabit sayı çıktıları parametrik (agent/skill/tool count) (DONE)
- 208-003: 208-003 — Model distribution çıktısı brain-context parametrik (DONE)
- 208-004: 208-004 — Zero-hardcode audit raporu + lint guard (DONE)
- 208-005: 208-005 — Flow scheduler runtime daemon (tick loop) (DONE)
- 208-006: 208-006 — Self-dispatch protokol iskelet (otonom sprint tetikleme) (DONE)
- 208-007: 208-007 — deckent flow run CLI (scheduled flow manuel tetik) (DONE)
- 208-008: 208-008 — Tenant runtime context wire (multi-tenant izolasyon aktif) (DONE)
- 208-009: 208-009 — RBAC role hierarchy + permission matrix tamamla (DONE)
- 208-010: 208-010 — Flow-registry RBAC gate (flow:manage izni) (DONE)
- 208-011: 208-011 — Audit event yazım API (query'nin yazma tarafı) (DONE)
- 208-012: 208-012 — Enterprise config schema (tenant + rbac + flow ayarları) (DONE)
- 208-013: 208-013 — Prompt-evolution iskelet (outcome→prompt tuning) (DONE)
- 208-014: 208-014 — Adaptive-agent wire (runtime agent adaptation aktif) (DONE)
- 208-015: 208-015 — docker-backend e2e izolasyon kalıcı fix (DONE)
- 208-016: 208-016 — ADR-071 (F3 Otonom Mod + F4 Enterprise mimari) + ROADMAP (DONE)

---
## Sprint 209 — sprint-209

**Status:** RETROSPECTIVE
**Date:** 2026-05-31
**Duration:** 2622s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 15 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 2621945ms |

### Tasks

- 209-001: 209-001 — Intent-classifier çeşitlendirme (domain/scope→intent) (DONE)
- 209-002: 209-002 — Multi-sinyal agent scoring (domain+scope ağırlık) (DONE)
- 209-003: 209-003 — refactorer impl skor dengeleme (7→tier) (DONE)
- 209-004: 209-004 — Skill routing denetimi + çeşitlendirme (DONE)
- 209-005: 209-005 — Routing dağılım analiz raporu (outcome-tracker) (DONE)
- 209-006: 209-006 — API auth disabled-flag bağımlılığı kaldır (F7-001) (DONE)
- 209-007: 209-007 — Dashboard API endpoint canlı veri parite (F7-002) (DONE)
- 209-008: 209-008 — mcp-attach tool count hardcode kaldır (208-002 bayrak) (DONE)
- 209-009: 209-009 — docker-backend e2e izolasyon kalıcı fix (son fail) (DONE)
- 209-010: 209-010 — Sprint 208 worker-artefakt önleme (honest-gate güçlendir) (DONE)
- 209-011: 209-011 — Self-dispatch flow-runtime entegrasyon (otonom tetik) (DONE)
- 209-012: 209-012 — RBAC + audit entegrasyon (yetkisiz işlem audit'lenir) (DONE)
- 209-013: 209-013 — Tenant-aware flow registry (multi-tenant izolasyon) (DONE)
- 209-014: 209-014 — ADR-072 (routing dengeleme + dashboard auth) + ROADMAP (DONE)

---
## Sprint 210 — sprint-210

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 1668s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Completed | 20 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1668039ms |

### Tasks

- 210-001: 210-001 — error-handling + error-registry-lint allowlist (honest-gate çöp-tespit) (DONE)
- 210-002: 210-002 — health-check gece-yarısı tarih flaky fix (DONE)
- 210-003: 210-003 — docker-backend full-suite contamination kalıcı fix (DONE)
- 210-004: 210-004 — Routing canlı doğrulama testi (build sonrası çeşitlilik) (DONE)
- 210-005: 210-005 — Routing imbalance CI guard (dağılım eşik) (DONE)
- 210-006: 210-006 — FIX prompt enrichment (orijinal task description inject) (DONE)
- 210-007: 210-007 — FIX agent seçimi task türüne göre (sadece bug-fixer değil) (DONE)
- 210-008: 210-008 — Brain NO_GO note doğruluğu (gerçek sebep yaz) (DONE)
- 210-009: 210-009 — Dashboard sprint kontrol paneli (plan/start/status UI) (GO_WITH_TECH_DEBT)
- 210-010: 210-010 — Dashboard agent/skill dağılım görünümü (routing şeffaflık) (DONE)
- 210-011: 210-011 — Dashboard API routing endpoint (DONE)
- 210-012: 210-012 — Dashboard onboarding/empty-state iyileştirme (sade kişi) (DONE)
- 210-013: 210-013 — Self-dispatch pending-approval kuyruğu (otonom mod onay-gate) (DONE)
- 210-014: 210-014 — RBAC CLI komut (deckent rbac check/grant iskelet) (DONE)
- 210-015: 210-015 — Audit log CLI sorgu (deckent audit query iskelet) (DONE)
- 210-016: 210-016 — ADR-073 (routing canlı + FIX prompt + dashboard) + ROADMAP (DONE)

---
## Sprint 211 — sprint-211

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 980s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 16 |
| Completed | 16 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 979583ms |

### Tasks

- 211-001: 211-001 — chat-native gerçek ProviderAdapter round-trip (subscription CLI) (DONE)
- 211-002: 211-002 — chat-native tool dispatch gerçek MCP tool çağrısı (DONE)
- 211-003: 211-003 — chat session persist + resume (memory.db chat entry) (DONE)
- 211-004: 211-004 — chat CLI canlı smoke (deckent chat --native end-to-end) (DONE)
- 211-005: 211-005 — RBAC runtime enforcement wire (sprint komutlarına gate) (DONE)
- 211-006: 211-006 — Audit compliance export (SOC2/GDPR JSON/CSV) (DONE)
- 211-007: 211-007 — Rate/resource limit guard (enterprise hardening) (DONE)
- 211-008: 211-008 — RBAC CLI grant/revoke tamamla (DONE)
- 211-009: 211-009 — prompt-evolution outcome-tracker wire (dormant→canlı) (DONE)
- 211-010: 211-010 — adaptive-agent runtime adaptation wire (DONE)
- 211-011: 211-011 — cross-sprint analyzer (evrim trend) (DONE)
- 211-012: 211-012 — Evrim CLI (deckent evolve report iskelet) (DONE)
- 211-013: 211-013 — Dashboard UI/UX polish (responsive + dark/light tutarlılık) (DONE)
- 211-014: 211-014 — Dashboard terminal güçlendirme (çok-oturum + geçmiş) (DONE)
- 211-015: 211-015 — Dashboard memory/ADR explorer (FTS5 arama görünüm) (DONE)
- 211-016: 211-016 — ADR-074 (F2 canlı + F4 enterprise + F5 evrim) + ROADMAP (DONE)

---
## Sprint 212 — sprint-212

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 1017s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 15 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 6.7% |
| Duration | 1016651ms |

### Tasks

- 212-001: 212-001 — prompt-evolution RETRO'ya gerçek caller (sprint-reporter wire) (DONE)
- 212-002: 212-002 — adaptive-agent outcome-tracker'a gerçek caller wire (DONE)
- 212-003: 212-003 — agent-genealogy promotion-pipeline'a gerçek caller wire (DONE)
- 212-004: 212-004 — agent-retirement DECAY/promotion'a gerçek caller wire (DONE)
- 212-005: 212-005 — specialization-drift retro/outcome'a gerçek caller wire (DONE)
- 212-006: 212-006 — prompt-rollback evolution flow'a gerçek caller wire (DONE)
- 212-007: 212-007 — Retro "Next Sprint Behavior Changes" bölümü (evrim görünürlüğü) (DONE)
- 212-008: 212-008 — Routing skew fix: skill→agent aktivasyon sinyali (DONE)
- 212-009: 212-009 — Routing çeşitlilik guard testi (regresyon önleme) (DONE)
- 212-010: 212-010 — managed-docs generator: code-derived module sayıları (DONE)
- 212-011: 212-011 — VISION/IDENTITY "by the numbers" generator: live MCP/CLI sayıları (DONE)
- 212-012: 212-012 — README badge + Memory V2 benchmark proof (DONE)
- 212-013: 212-013 — extensions/vscode/ scaffold (Sprint 213-214 tohumu) (DONE)
- 212-014: 212-014 — VS Code command palette + status bar stub (DONE)
- 212-015: 212-015 — ADR-075 (F5 runtime wiring + routing skill→agent + doc-generator) + MASTER-PLAN status (DONE)

---
## Sprint 214 — sprint-214

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 2132s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 25 |
| Completed | 25 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 2131836ms |

### Tasks

- 214-001: Fix debt: Tech debt from 210-009-fix: Root cause of NO_GO (test_coverage=65): original wor (DONE)
- 214-002: 214-001 — Docker env-forwarding provider+auth-aware (ANTHROPIC_API_KEY subscription'da strip) (DONE)
- 214-003: 214-002 — Auth-mode resolution guard + smoke (config subscription effective) (DONE)
- 214-004: 214-003 — serve: API token'ı dashboard'a inject (localhost out-of-box, 401 fix) (DONE)
- 214-005: 214-004 — dashboard: inject API token'ı isteğe ekle (useApi Bearer) (DONE)
- 214-006: 214-005 — serve localhost out-of-box smoke (POST 200, API-disabled YOK) (DONE)
- 214-007: 214-006 — Path A embedded chat backend (host-CLI'SIZ, server-side ProviderAdapter) (DONE)
- 214-008: 214-007 — Dashboard Chat tab → chat-backend wire (Path A frontend) (DONE)
- 214-009: 214-008 — F7-003 UI/UX pass: Layout responsive + dark/light + Sidebar (DONE)
- 214-010: 214-009 — VS Code extension gerçek activation + CLI/MCP köprü (DONE)
- 214-011: 214-010 — Command palette handler'lar (Start Sprint / Show Dashboard / Status) (DONE)
- 214-012: 214-011 — Sidebar TreeView: canlı agent/sprint durumu (DONE)
- 214-013: 214-012 — Status bar: sprint progress + tıkla→dashboard (DONE)
- 214-014: 214-013 — Settings köprü (.deckent/config.json ↔ vscode settings) (DONE)
- 214-015: 214-014 — OpenAICompatibleAdapter (HTTP /chat/completions — DeepSeek/Qwen/GLM) (DONE)
- 214-016: 214-015 — ProviderName dinamik + model-catalog PROVIDER_MAP genişlet (DONE)
- 214-017: 214-016 — Per-provider key (.deck) + bootstrap auto-register (DONE)
- 214-018: 214-017 — Multi-provider eşzamanlı routing smoke (mix coexist) (DONE)
- 214-019: 214-018 — chat CLI robust hata UX (host-CLI yoksa net yönlendirme) (DONE)
- 214-020: 214-019 — ADR-076 (auth-precedence + user-facing surfaces) + ADR-077 (8-provider) + MASTER-PLAN status (DONE)
- 214-021: 214-020 — README badge sync (190+→214) + ci-baseline garbage fix (DONE)

---
## Sprint 215 — sprint-215

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 1749s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 24 |
| Completed | 24 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1748989ms |

### Tasks

- 215-001: Fix debt: Tech debt from 210-009-fix: Root cause of NO_GO (test_coverage=65): original wor (DONE)
- 215-002: 215-001 — `deckent test:ci-sim` clean-state reproducer (DONE)
- 215-003: 215-002 — CI-hermeticity lint guard (test gitignored state okumasın) (DONE)
- 215-004: 215-003 — test-HOME isolation helper + sızan testlere uygula (DONE)
- 215-005: 215-004 — F1-009 bootstrap-register: OpenAI-compat provider'ları kaydet (dormant→usable) [P0] (DONE)
- 215-006: 215-005 — F1-010 subs→API overflow orchestration (DONE)
- 215-007: 215-006 — F6-006 per-worker auth/provider task JSON (Sprint/Task/Process) (DONE)
- 215-008: 215-007 — Multi-provider eşzamanlı e2e smoke (3-subs + API + local mix) (DONE)
- 215-009: 215-008 — F7-003 UI/UX redesign (bilgi mimarisi + responsive + dark/light tutarlılık) (DONE)
- 215-010: 215-009 — F7-004 terminal güçlendirme (çok-oturum + geçmiş + kopyala/yapıştır) (DONE)
- 215-011: 215-010 — F7-006 enterprise view (multi-tenant + RBAC UI) (DONE)
- 215-012: 215-011 — F7-007 memory/ADR/debt explorer (FTS5 arama + ADR timeline) (DONE)
- 215-013: 215-012 — Evolution API endpoint'leri (genealogy/retirement/prompt-metrics → /api) (DONE)
- 215-014: 215-013 — F7-010 /evolution dashboard sayfası (genealogy tree + retirement timeline + prompt-diff) (DONE)
- 215-015: 215-014 — F5-008 aktif identity-mutation loop (düşük başarı→agent kimlik refactor) [moat] (DONE)
- 215-016: 215-015 — F7-009 Nervous System UI sayfası (pending-approval/panic-guard badge) (DONE)
- 215-017: 215-016 — Routing: frontend-design→frontend-designer mapping tamamla (DONE)
- 215-018: 215-017 — Routing diversity guard genişlet (frontend mapping doğrula) (DONE)
- 215-019: 215-018 — Doc-drift sync: module count (90→111) + README badge generator (DONE)
- 215-020: 215-019 — CLAUDE/DECKENT module-count generator sync (managed-docs) (DONE)
- 215-021: 215-020 — ADR-078 (CI-hermeticity + 8-provider runtime + evolution-loop + dashboard) + MASTER-PLAN (DONE)
- 215-022: 215-021 — CI-hermeticity rule + ci-guardian/ci-testing routing kalıcılaştır (DONE)

---
## Sprint 217 — sprint-217

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 674s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 674211ms |

### Tasks

- 217-001: new sprint (NO_GO)

---
## Sprint 218 — sprint-218

**Status:** RETROSPECTIVE
**Date:** 2026-06-01
**Duration:** 1241s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 13 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1241038ms |

### Tasks

- 218-001: 218-013 — [✅ KONTROL — kod izole `deckent run` ile yapıldı + commit 64c97c2f; YENİDEN YAZMA YASAK] Git self-mutation guard (DONE)
- 218-002: 218-001 — [✅ KONTROL — kod izole `deckent run` ile yapıldı + commit 9e2e7d34; YENİDEN YAZMA YASAK] sprint-start detach (DONE)
- 218-003: 218-002 — Eksik sayfaları route+sidebar'a bağla (Evolution/Nervous/Enterprise/MemoryExplorer) (DONE)
- 218-004: 218-003 — Chat gerçek round-trip (ChatPage → backend, status-only DEĞİL) (DONE)
- 218-005: 218-004 — Dashboard DIRECTIVES editörü (gerçek içerikli sprint başlat, boş "new sprint" değil) (DONE)
- 218-006: 218-005 — Dashboard sayfaları gerçek veri bağlı (Nervous loading+error+empty) (DONE)
- 218-007: 218-006 — God-level layout shell (modern bilgi mimarisi, responsive, sıfır skeleton-freeze) (DONE)
- 218-008: 218-007 — Native hız: skeleton-freeze kaldır, akıllı polling/SSE, stale-while-revalidate (DONE)
- 218-009: 218-008 — Tema tutarlılık + görsel polish (dark/light token, component tutarlılık) (DONE)
- 218-010: 218-009 — Sprint kontrol paneli polish (canlı durum + worker grid + faz göstergesi) (DONE)
- 218-011: 218-010 — test:e2e-surfaces dashboard genişlet (8 sayfa endpoint + sprint-start-donmaz) (DONE)
- 218-012: 218-011 — ADR-080 (Dashboard God-Level + sprint-start detach) + MASTER-PLAN status (DONE)
- 218-013: 218-012 — Dashboard kullanıcı rehberi + onboarding (gerçek ekran akışı) (DONE)

---
## Sprint 219 — sprint-219

**Status:** RETROSPECTIVE
**Date:** 2026-06-02
**Duration:** 2329s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 16 |
| Tech Debt | 0 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 2329344ms |

### Tasks

- 219-001: 219-001 — `deckent` argümansız → agentic chat REPL (claude modeli) [P0] (DONE)
- 219-002: 219-002 — `deckent chat --native` gerçek round-trip run-proven (DONE)
- 219-003: 219-003 — REPL UX god-level (prompt, history, çok-satır, exit, Ctrl-C) (DONE)
- 219-004: 219-004 — REPL'de doğal dil → MCP/deckent aksiyon dispatch (agentic) (DONE)
- 219-005: 219-005 — Agentic aksiyon onay kapısı (riskli → confirm) (DONE)
- 219-006: 219-006 — Agentic session persist (REPL hafıza + devam) (DONE)
- 219-007: 219-007 — chat-backend token-streaming (F2-007, gerçek SSE) (DONE)
- 219-008: 219-008 — REPL + dashboard stream render (akan cevap göster) (DONE)
- 219-009: 219-009 — Dashboard nav tek-kaynak + RENDER-based test (kaynak-grep değil) (DONE)
- 219-010: 219-010 — Dashboard cache-bust + tarayıcı-e2e smoke (8 sayfa gerçekten yüklenir) (NO_GO)
- 219-011: 219-011 — TR MASTER-PLAN (Türkçe, güncel dürüst durumla) (DONE)
- 219-012: 219-012 — ADR-081 (Native Agentic Deckent) + MASTER-PLAN status (DONE)
- 219-013: 219-013 — blueprint.md + docs/vision/* baştan-aşağı güncelle (deckent NE/NEREDE — SSOT-of-identity) (DONE)
- 219-014: 219-014 — Otonom agentic runtime temeli (yetki-sınırlı sürekli mod iskeleti) (DONE)
- 219-015: 219-015 — Plan-time routing routeTaskV2 wire (surface-bonus plan'da devrede) (DONE)
- 219-016: 219-016 — Plan-time Smoke-field taşıma (plannerTaskToParams → task.smoke) (DONE)

---
## Sprint 220 — sprint-220

**Status:** RETROSPECTIVE
**Date:** 2026-06-02
**Duration:** 1506s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 18 |
| Completed | 18 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 5.9% |
| Duration | 1506338ms |

### Tasks

- 220-001: Fix debt: Sprint sprint-217 rollback SUCCESS (DONE)
- 220-002: 220-001 — [P0] Native REPL gerçek provider-wire (config-driven: chat_provider→brain_provider→claude) (DONE)
- 220-003: 220-002 — `chat --native` flag + --message/--once gerçek round-trip (DONE)
- 220-004: 220-003 — Agentic REPL canlı MCP dispatch (doğal dil→gerçek aksiyon) (GO_WITH_TECH_DEBT)
- 220-005: 220-004 — Canlı worker grid (sabit-6 değil, real-time SSE) (DONE)
- 220-006: 220-005 — Status sayfası gerçek-zaman (done işler "done" görünsün) (DONE)
- 220-007: 220-006 — Refresh + cooldown (user-tetikli güncelleme) (DONE)
- 220-008: 220-007 — Evolution/ADR-timeline veri + ChatPage gerçek-wire (DONE)
- 220-009: 220-008 — Config brain-budget fix + coverage takip (history) (DONE)
- 220-010: 220-009 — Tech-debt sayfası filtre (sprint/severity/status) (DONE)
- 220-011: 220-010 — Enterprise sayfa auth-wire + alerts dedup (provider-neutral tek-uyarı) (DONE)
- 220-012: 220-011 — Nervous bootstrap + config enable (dormant→aktif) (DONE)
- 220-013: 220-012 — Nervous action-handlers (MVP 8 low-risk) + smoke (DONE)
- 220-014: 220-013 — Nervous config enable (deckent-dev) + dashboard canlı data (DONE)
- 220-015: 220-014 — 219-010 dashboard cache-bust e2e (carry NO_GO) (DONE)
- 220-016: 220-015 — ADR-082 (Native-LLM-Wire + Nervous-Activation + Dashboard-v2) + MASTER-PLAN (DONE)
- 220-017: 220-016 — README + blueprint güncel-tut (native gerçek-cevap + nervous-active) (DONE)

---
## Sprint 221 — sprint-221

**Status:** RETROSPECTIVE
**Date:** 2026-06-02
**Duration:** 1398s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 17 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1398140ms |

### Tasks

- 221-001: 221-001 — [P0] runChatNativeLoop → handleReplCommand canlı slash-wire (DONE)
- 221-002: 221-002 — [P0] runChatNativeLoop → agentic dispatch canlı-wire (220-004 carry, doğal dil→aksiyon) (DONE)
- 221-003: 221-003 — Canlı slash-registry (/help /status /recall /plan dinamik, hard-code değil) + sade liste (DONE)
- 221-004: 221-004 — REPL status-line (provider/sprint/dizin) + özelleştirilebilir (config-driven) (DONE)
- 221-005: 221-005 — [P0] Provider-resolve genişlet: ollama-local + openai-compat REPL round-trip (zero-API) (DONE)
- 221-006: 221-006 — Provider-parity test matrisi (5 provider REPL round-trip eşitliği) (DONE)
- 221-007: 221-007 — Provider fallback chain + yoklukta net hata (skeleton-yasak) (DONE)
- 221-008: 221-008 — REPL'den enterprise komut köprüsü (/audit /rbac /flow /cost → mevcut CLI) (DONE)
- 221-009: 221-009 — User/Enterprise mod (sade-default, enterprise opt-in, config-driven) (DONE)
- 221-010: 221-010 — Özelleştirilebilir chat config (schema + default) — provider/mod/status-line/slash (DONE)
- 221-011: 221-011 — Dashboard ChatPage streaming + slash-komut UI (terminal-paritesi) (DONE)
- 221-012: 221-012 — Dashboard konuşma-merkezli layout (chat öne, sade bilgi mimarisi) (DONE)
- 221-013: 221-013 — [P0] CLI kurulum/komut-çıktı fix (`deckent`/`npx deckent serve` terminalde sessiz → çalışsın) (DONE)
- 221-014: 221-014 — Smoke-219-016 hotfix (plannerTaskToParams smoke-field gate'e geçsin) (DONE)
- 221-015: 221-015 — ADR-083 (REPL-UX-Evolution + Provider-Parity + Local-Model-Foundation) + MASTER-PLAN (DONE)
- 221-016: 221-016 — README + blueprint güncel (native-REPL tam-kapsam + local-model + provider-parity) (DONE)
- 221-017: 221-017 — AI planner subscription-spawn fix + sessiz-fallback → AÇIK uyarı (dürüstlük) (DONE)

---
## Sprint 222 — sprint-222

**Status:** COMPLETE
**Date:** 2026-06-02
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 8 |
| Tech Debt | 8 |
| No-Go | 5 |
| Coverage | NaN% |
| Duration | 0ms |

### Tasks

- 222-001: 222-001 — [P0] Persistent claude session (per-turn cold-start 4.5s → reuse <1s) (GO_WITH_TECH_DEBT)
- 222-002: 222-002 — Gerçek token-token streaming (claude --print toplu → incremental akış) (GO_WITH_TECH_DEBT)
- 222-003: 222-003 — Spinner/progress feedback (yanıt beklerken görsel, donma hissi bitsin) (GO_WITH_TECH_DEBT)
- 222-004: 222-004 — Markdown + renk render (claude-code gibi zengin output) (GO_WITH_TECH_DEBT)
- 222-005: 222-005 — slash-registry REPL'e GERÇEK-wire (/help anında, 221-003 hollow fix) (GO_WITH_TECH_DEBT)
- 222-006: 222-006 — status-line REPL'e GERÇEK-bas (221-004 hollow fix) (GO_WITH_TECH_DEBT)
- 222-007: 222-007 — agentic-dispatch + enterprise-bridge runtime-wire (221-002/008 hollow fix) (GO_WITH_TECH_DEBT)
- 222-008: 222-008 — [P0] Panic-gate NON-BLOCKING (sessiz spawn-blok TAMAMEN kaldır) (NO_GO)
- 222-009: 222-009 — Nervous terminal-görünür (REPL'de pending + accept/reject, sessiz-IPC bitsin) (NO_GO)
- 222-010: 222-010 — Nervous güvenli re-enable + dashboard-canlı (non-blocking olduktan SONRA) (NO_GO)
- 222-011: 222-011 — ADR-084 (REPL-Perf Persistent-Session + Nervous-Interactive) + MASTER-PLAN (NO_GO)
- 222-012: 222-012 — README + blueprint güncel (hızlı native REPL + nervous-canlı) (GO_WITH_TECH_DEBT)
- 222-013: 222-013 — Sprint 221 TECH_DEBT gerçek-kapatma (Smoke run-verify, hollow→çalışır) (NO_GO)

---
## Sprint 224 — sprint-224

**Status:** RETROSPECTIVE
**Date:** 2026-06-02
**Duration:** 1183s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1183230ms |

### Tasks

- 224-001: 224-015 — [P0] AI plan-mode fix (dürüst hata + gerçekten-çalışır) (GO_WITH_TECH_DEBT)
- 224-002: 224-008 — [P0] `/nervous` slash wire (kurtarılan bridge → chat-native caller) (DONE)
- 224-003: 224-009 — Banner wire (kurtarılan chat-banner → entry.ts REPL açılış) (DONE)
- 224-004: 224-010 — Nervous güvenli re-enable + A/B (panic-gate non-blocking main'de) (DONE)
- 224-005: 224-027 — Smoke harness'lar (agentic-DO + REPL run-proven, scripts/) (DONE)
- 224-006: 224-012 — ADR-086 (Native CLI Parity) + MASTER-PLAN §10 güncel (DONE)

---
## Sprint 225 — sprint-225

**Status:** RETROSPECTIVE
**Date:** 2026-06-03
**Duration:** 1077s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1077221ms |

### Tasks

- 225-001: FX-01 — Genel Bakış + Mimari (DONE)
- 225-002: FX-02 — Sprint Yaşam Döngüsü + Task Routing (DONE)
- 225-003: FX-03 — Model Registry/Multi-Provider + Memory V2 (DONE)
- 225-004: FX-04 — Agents + Skills (DONE)
- 225-005: FX-05 — Spawn Backend'ler + Dependency Waves (DONE)
- 225-006: FX-06 — Result Evaluation + Auditor/RBAC (DONE)
- 225-007: FX-07 — Event-Stream/Observability + Native REPL (DONE)
- 225-008: FX-08 — Dashboard + MCP Entegrasyonu (DONE)
- 225-009: FX-09 — CLI Komutları + Evolution Pipeline (DONE)
- 225-010: FX-10 — Nervous System (roadmap) + Vizyon/Yol Haritası (DONE)

---
## Sprint 226 — sprint-226

**Status:** RETROSPECTIVE
**Date:** 2026-06-04
**Duration:** 1322s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1321979ms |

### Tasks

- 226-001: 226-001 — Authority adapter (checkAuthority → AuthorityChecker) (DONE)
- 226-002: 226-002 — Audit adapter (writeEvent → AuditSink) (DONE)
- 226-003: 226-003 — Approval gate adapter (nervous Executor → ApprovalGate, OTO-APPROVE YOK) (DONE)
- 226-004: 226-004 — Action executor adapter (ActionHandler registry → ActionExecutor) (DONE)
- 226-005: 226-005 — Trigger source adapter (scheduled-flow + self-dispatch → TriggerSource) (DONE)
- 226-006: 226-006 — [P0] Sürekli loop + composition root (DORMANT'I ÖLDÜRÜR) (DONE)
- 226-007: 226-007 — [P0] `deckent autonomous` CLI (start/stop/status, Tier-1 user-surface) (DONE)

---
## Sprint 227 — sprint-227

**Status:** RETROSPECTIVE
**Date:** 2026-06-04
**Duration:** 1125s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1124748ms |

### Tasks

- 227-001: 227-001 — Rubric total diagnostic fix (coverage:null → renormalize) (DONE)
- 227-002: 227-002 — [P0] Export-wipe guard (dolu .md'yi boşla EZME) (DONE)
- 227-003: 227-003 — [P0] Decay safety (decay_after_sprints'e uy, collapse ETME) (DONE)
- 227-004: 227-004 — Brain-integrity regression e2e (3 bug birlikte) (DONE)

---
## Sprint 228 — sprint-228

**Status:** RETROSPECTIVE
**Date:** 2026-06-04
**Duration:** 889s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 889242ms |

### Tasks

- 228-001: 228-001 — [P0] autonomous CLI i18n retrofit (hardcode → getMessage) (DONE)
- 228-002: 228-002 — features-manifest entry (sync-manifest.mjs → regenerate) (DONE)
- 228-003: 228-003 — Autonomous usage doc (TR/EN, güvenlik modeli dahil) (DONE)
- 228-004: 228-004 — Autonomous e2e smoke harness (gerçek-binary start→status→stop) (DONE)

---
## Sprint 229 — sprint-229

**Status:** RETROSPECTIVE
**Date:** 2026-06-04
**Duration:** 1086s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1086498ms |

### Tasks

- 229-001: 229-001 — McpClientBroker çekirdek (SDK Client + stdio/HTTP transport) (DONE)
- 229-002: 229-002 — 3-scope config (.mcp.json project/user/local merge) (DONE)
- 229-003: 229-003 — Dynamic discovery + namespaced tool registry (DONE)
- 229-004: 229-004 — [Tier-1] `deckent mcp` yönetim CLI (add/list/remove/get) (DONE)
- 229-005: 229-005 — [Tier-1] REPL `/mcp` dispatch + confirm-gate + audit composition (DONE)

---
## Sprint 230 — sprint-230

**Status:** RETROSPECTIVE
**Date:** 2026-06-05
**Duration:** 1333s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 8 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 1333238ms |

### Tasks

- 230-001: 230-001 — Windows-native backend (win32 → subprocess, POSIX-sleep → Node timer) (DONE)
- 230-002: 230-002 — [P0] ⭐ models.dev native wire (PROVIDER_MODEL_MAP statik → dinamik) (DONE)
- 230-003: 230-003 — ecosystem-intelligence → routing-engine tüketimi (DONE)
- 230-004: 230-004 — self-modifying-detector enforcement (user-project flag-gated) (DONE)
- 230-005: 230-005 — Ölü/orphan disposition (ADR-038): multi-agent.ts + decision-replay.ts (DONE)
- 230-006: 230-006 — Worker-koordinasyon lifecycle wire (handoff + heartbeat-daemon → sprint-controller) (DONE)
- 230-007: 230-007 — shared-memory wire (worker↔worker, read-mostly) (DONE)
- 230-008: 230-008 — [P0] Docker live-monitor wire (SSE mount + watch --follow + WorkerCard) (NO_GO)

---
## Sprint 231 — sprint-231

**Status:** RETROSPECTIVE
**Date:** 2026-06-05
**Duration:** 675s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 4 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 675221ms |

### Tasks

- 231-001: 231-001 — [P0] exit-0-no-result uniform disk-verify (FALSE NO_GO kökü) (DONE)
- 231-002: 231-002 — debt.md export-wipe guard (asimetri kapat) (DONE)
- 231-003: 231-003 — decay catastrophic-abort küçük-DB bypass fix (DONE)
- 231-004: 231-004 — [forward] HandoffProtocol recovery wiring (failHandoff + listHandoffs) (DONE)

---
## Sprint 232 — sprint-232

**Status:** RETROSPECTIVE
**Date:** 2026-06-05
**Duration:** 1401s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1400680ms |

### Tasks

- 232-001: 232-001 — [P0] decay_after_sprints config wire (PRIMARY kök) (DONE)
- 232-002: 232-002 — [P0] learnings decay-exempt (memory/retro/sprint/pattern) (DONE)
- 232-003: 232-003 — [P1] abort >= operatörü + WAL-safe deckent memory backup CLI (DONE)
- 232-004: 232-004 — [P1] ci-sim SIGINT/SIGTERM restore handler (GAP A) (DONE)
- 232-005: 232-005 — [P1] writeGuardedExports dbCount===0 disk-protect (GAP B) (DONE)

---
## Sprint 233 — sprint-233

**Status:** RETROSPECTIVE
**Date:** 2026-06-06
**Duration:** 1388s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1388089ms |

### Tasks

- 233-001: 233-001 — [Wave 1] Core agentic worker runner + tool şemaları + scope-guard (DONE)
- 233-002: 233-002 — [Wave 2 · depends 233-001] Subprocess entry + OllamaAdapter wiring + dinamik model kabul (DONE)

---
## Sprint 234 — sprint-234

**Status:** RETROSPECTIVE
**Date:** 2026-06-06
**Duration:** 1190s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 1189611ms |

### Tasks

- 234-001: 234-001 — [P0] Per-provider host-adapter spawn routing (ollama docker'a düşmesin) (DONE)
- 234-002: 234-002 — [P1] entry .result tamlığı (linesAdded/Removed + tokenUsage) (DONE)

---
## Sprint 235 — sprint-235

**Status:** RETROSPECTIVE
**Date:** 2026-06-06
**Duration:** 912s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 912400ms |

### Tasks

- 235-001: 235-001 — [P0] Per-task ollama provider+model plan-time acceptance (DONE)

---
## Sprint 236 — sprint-236

**Status:** RETROSPECTIVE
**Date:** 2026-06-06
**Duration:** 379s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 378545ms |

### Tasks

- 236-001: 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu (DONE)
- 236-002: 236-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu (DONE)

---
## Sprint 237 — sprint-237

**Status:** RETROSPECTIVE
**Date:** 2026-06-06
**Duration:** 339s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 338677ms |

### Tasks

- 237-001: 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu (GO_WITH_TECH_DEBT)
- 237-002: 236-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu (DONE)

---
## Sprint 238 — sprint-238

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 454s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 453588ms |

### Tasks

- 238-001: 238-001 — Canonical work-model SSOT modülü (additive) (DONE)

---
## Sprint 239 — sprint-239

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 642s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 641501ms |

### Tasks

- 239-001: 239-001 — rubric-registry + task-builder canonical TaskKind migration (DONE)

---
## Sprint 240 — sprint-240

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 878s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 878029ms |

### Tasks

- 240-001: 240-001 — task-router + adr-selector canonical-consume (fallback korunur) (DONE)

---
## Sprint 241 — sprint-241

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 502s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 502070ms |

### Tasks

- 241-001: 241-001 — decidePolicy'ye computed EffectClass wire (DONE)

---
## Sprint 242 — sprint-242

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 810s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 810447ms |

### Tasks

- 242-001: 242-001 — MCP-run provider-free + autonomous agent/skill inject (DONE)

---
## Sprint 243 — sprint-243

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 573s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | 0.0% |
| Duration | 573150ms |

### Tasks

- 243-001: 243-001 — multi-provider docs kod-gerçeğine hizala (NO_GO)

---
## Sprint 244 — sprint-244

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 451s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 450834ms |

### Tasks

- 244-001: 243-001 — multi-provider docs kod-gerçeğine hizala (DONE)

---
## Sprint 245 — sprint-245

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 494s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 494432ms |

### Tasks

- 245-001: 245-001 — .codex + .gemini rules → .claude parity (DONE)

---
## Sprint 246 — sprint-246

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 538s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 538444ms |

### Tasks

- 246-001: 246-001 — docs/security/threat-model.md (DONE)

---
## Sprint 247 — sprint-247

**Status:** RETROSPECTIVE
**Date:** 2026-06-08
**Duration:** 540s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 539565ms |

### Tasks

- 247-001: 247-001 — docs/adr-index.md (DONE)

---
## Sprint 248 — sprint-248

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 304s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 303601ms |

### Tasks

- 248-001: 248-001 — codex worker gate (GO_WITH_TECH_DEBT)
- 248-002: 248-002 — gemini worker gate (DONE)

---
## Sprint 249 — sprint-249

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 2477s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 21 |
| Completed | 11 |
| Tech Debt | 7 |
| No-Go | 10 |
| Coverage | NaN% |
| Duration | 2477064ms |

### Tasks

- 249-001: 249-001 — benchmark/memory-v2 (verify the 96% claim) (DONE)
- 249-002: 249-002 — lifecycle + API-surface diagrams (DONE)
- 249-003: 249-003 — lint-cli-mcp-parity guard (report-only) (NO_GO)
- 249-004: 249-004 — lint-i18n-hardcode guard (report-only) (NO_GO)
- 249-005: 249-005 — provider-parity fleet regression test (DONE)
- 249-006: 249-006 — why-deckent comparison (factual) (GO_WITH_TECH_DEBT)
- 249-007: 249-007 — cookbook: first sprint (NO_GO)
- 249-008: 249-008 — cookbook: multi-provider fleet (NO_GO)
- 249-009: 249-009 — architecture overview (EN) (GO_WITH_TECH_DEBT)
- 249-010: 249-010 — cookbook: memory recall (GO_WITH_TECH_DEBT)
- 249-011: 249-011 — cookbook: autonomous mode (DONE)
- 249-012: 249-012 — getting-started (EN) (GO_WITH_TECH_DEBT)
- 249-013: 249-013 — feature matrix (NO_GO)
- 249-014: 249-014 — glossary (ollama, small) (GO_WITH_TECH_DEBT)
- 249-015: 249-015 — cookbook: status & watch (ollama, small) (GO_WITH_TECH_DEBT)

---
## Sprint 250 — sprint-250

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 618s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 4 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | 617809ms |

### Tasks

- 250-001: 250-V1 — claude verify (DONE)
- 250-002: 250-V2 — codex verify (MF-1 KEY) (NO_GO)
- 250-003: 250-V3 — gemini verify (DONE)
- 250-004: 250-V4 — ollama verify (GO_WITH_TECH_DEBT)

---
## Sprint 251 — sprint-251

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 570s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 11 |
| Tech Debt | 2 |
| No-Go | 2 |
| Coverage | NaN% |
| Duration | 570110ms |

### Tasks

- 251-001: 251-001 — event channels reference (code-derived) (DONE)
- 251-002: 251-002 — recover a stuck sprint (cookbook) (DONE)
- 251-003: 251-003 — evolution & learning (guide) (DONE)
- 251-004: 251-004 — feature matrix (redo; codex) (DONE)
- 251-005: 251-005 — cost & budget (cookbook; codex) (DONE)
- 251-006: 251-006 — provider fleet notes (benchmark; codex) (NO_GO)
- 251-007: 251-007 — cookbook index (gemini) (GO_WITH_TECH_DEBT)
- 251-008: 251-008 — checkpoints & approval (cookbook; gemini) (DONE)
- 251-009: 251-009 — tech debt tracking (cookbook; gemini) (NO_GO)
- 251-010: 251-010 — nervous alerts (cookbook; ollama, small) (GO_WITH_TECH_DEBT)

---
## Sprint 252 — sprint-252

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 327s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 327155ms |

### Tasks

- 252-001: 253-001 — codex IN docker (DONE)
- 252-002: 253-002 — gemini IN docker (DONE)

---
## Sprint 253 — sprint-253

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 398s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 397671ms |

### Tasks

- 253-001: 253-001 — codex IN docker (DONE)
- 253-002: 253-002 — gemini IN docker (DONE)

---
## Sprint 254 — sprint-254

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 802s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 801575ms |

### Tasks

- 254-001: Fix debt: Tech debt from 249-009-fix: Created/updated docs/guide/architecture-overview.md  (DONE)
- 254-002: V-001 — codex docker + reasoning-effort (MF-8 + F1-RE) (GO_WITH_TECH_DEBT)
- 254-003: V-002 — claude docker + reasoning-effort (F1-RE) (DONE)

---
## Sprint 255 — sprint-255

**Status:** COMPLETE
**Date:** 2026-06-09
**Duration:** 0s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 0ms |

### Tasks

- 255-001: DOC-1 — ExecutionRequest contract reference (WM-1) (DONE)
- 255-002: DOC-2 — Stack-aware criteria & routing (WM-7) (DONE)
- 255-003: DOC-3 — Positioning: agentic-OS + agentic-run ecosystem (DONE)

---
## Sprint 256 — sprint-256

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 327s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 2 |
| Completed | 2 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 327340ms |

### Tasks

- 256-001: GEMINI-LOGIN-HANG — gemini worker must fail-fast, never hang on interactive login (DONE)
- 256-002: PLAN-SCOPE-1 — planner must NOT pull description-mentioned file paths into scope.filesWrite (GO_WITH_TECH_DEBT)

---
## Sprint 257 — sprint-257

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 422s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 421830ms |

### Tasks

- 257-001: CODE-FULLSUITE-NOGO — worker self-verify must be TARGETED, not full-suite (DONE)
- 257-002: GEMINI-LOGIN-HANG (real) — fail fast on interactive login / 429, don't hang (DONE)

---
## Sprint 258 — sprint-258

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 335s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 335238ms |

### Tasks

- 258-001: WM-1b — route agent + skills for the CLI `deckent run` single-task path (DONE)

---
## Sprint 259 — sprint-259

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 217s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 216648ms |

### Tasks

- 259-001: WM-1b/MCP — route agent+skills in MCP `deckent_run` (DONE)
- 259-002: WM-1b/autonomous — route agent+skills in `runTaskMode` (DONE)

---
## Sprint 260 — sprint-260

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 1315s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 17 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1314863ms |

### Tasks

- 260-001: ENT-1 — actor.role → worker authority (ADR-037 V2 step) (DONE)
- 260-002: ENT-2 — tenantId threading (replace hardcoded 'local') (DONE)
- 260-003: ENT-3 — correlationId / causationId audit lineage (DONE)
- 260-004: WM-6 / F10-002 — riskClass → risk-gated approval (DONE)
- 260-005: budget → pre-spawn cost-gate enforcement (DONE)
- 260-006: F8-001 — capability.invoke abstraction (capabilityTarget consumer) (DONE)
- 260-007: AUT-4 — nextRun() full cron evaluation (DONE)
- 260-008: AUT-6 — backlog done/failed purge + autonomous artifact cleanup (DONE)
- 260-009: AUT-8 — deckent_autonomous* MCP tool parity (DONE)
- 260-010: AUT-1 — drive the nervous observer inside `autonomous start` (DONE)
- 260-011: WM-7 E3 — IDENTITY.md `Language:` feed as stack SSOT (DONE)
- 260-012: WM-7 — extend AGENT_TEMPLATES to C++/Java/C#/Kotlin/Swift prime agents (DONE)
- 260-013: BOUNDARY-TEST-PATTERN — code-task scope auto-includes matching tests/ dir (DONE)
- 260-014: Pre-existing test staleness cleanup — gpt-5.5 apiId expectations (DONE)
- 260-015: F9-001 — wire McpClientBroker into the REPL/chat path (DONE)
- 260-016: Doc — Enterprise Foundation reference (consume-the-contract) (GO_WITH_TECH_DEBT)

---
## Sprint 261 — sprint-261

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 740s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 17 |
| Completed | 14 |
| Tech Debt | 1 |
| No-Go | 3 |
| Coverage | NaN% |
| Duration | 740430ms |

### Tasks

- 261-001: F10-001 — unified policy engine (compose RBAC + activation + condition) (DONE)
- 261-002: ENT-1 / ADR-037 V2 — `authorizeExecution(req)` bridge in the authority matrix (DONE)
- 261-003: ENT-3 — tamper-evident audit hash-chain (additive field) (DONE)
- 261-004: ENT-2 — strict tenant isolation flag (omit NULL-tenant leak) (DONE)
- 261-005: F8-002 — multi-backend capability selection (availability/priority) (DONE)
- 261-006: F8 — real capability handlers (http / env / shell-gated) (NO_GO)
- 261-007: AUT-5 — recurring backlog re-enqueue (true cron cadence) (DONE)
- 261-008: AUT-7 — wire the ExecutionPool into the dispatcher (bounded concurrency) (DONE)
- 261-009: AUT-1 — actually drive the nervous observer in the autonomous loop (DONE)
- 261-010: AUT-9 — proactive work-generator (backlog candidate generation) (DONE)
- 261-011: AUT cleanup — consolidate the duplicate scheduled-flow cron evaluator (DONE)
- 261-012: budget — cost-gate honors `maxTokens` (deepen Sprint 260 maxUsd) (DONE)
- 261-013: WM — `InteractionMode` consumer (interactive/batch/streaming policy) (DONE)
- 261-014: Hygiene — green stale model-id test assertions (gpt-5 → gpt-5.5 drift) (NO_GO)
- 261-015: Doc — Enterprise-Depth reference (enforcement + secret vault + capability handlers) (GO_WITH_TECH_DEBT)
- 261-016: ENT-3 — audit query/lineage surface (read-only) (DONE)

---
## Sprint 262 — sprint-262

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 484s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 12 |
| Tech Debt | 1 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | 484316ms |

### Tasks

- 262-001: ENT-5a — OIDC/JWT verification (SSO foundation) (DONE)
- 262-002: ENT-5a2 — SSO session store (DONE)
- 262-003: ENT-5b — SIEM event forwarder (DONE)
- 262-004: ENT-5c — compliance report generator (DONE)
- 262-005: ENT-3 — audit log retention & rotation policy (DONE)
- 262-006: F8 — data capability handlers (read-only db.query / mail.search) (NO_GO)
- 262-007: ERP-1 — read-only ERP/DB connector capability (DONE)
- 262-008: AUT-4 fix — full 5-field cron in CORE (close the live latent bug) (DONE)
- 262-009: actor data-plumbing — carry ActorContext onto the Task (seam, not enforcement) (DONE)
- 262-010: AUT-9 — work-generator trigger source (composable, not auto-wired) (DONE)
- 262-011: capability-audit bridge — emit an audit event per capability invocation (DONE)
- 262-012: Hygiene — green deterministic stale test assertions (DONE)
- 262-013: Doc — Enterprise Integrations reference (SSO/SIEM/compliance/ERP) (GO_WITH_TECH_DEBT)

---
## Sprint 263 — sprint-263

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 435s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 434553ms |

### Tasks

- 263-001: Architecture & Module Inventory Analysis (DONE)
- 263-002: Enterprise & Autonomous Capability Maturity Analysis (DONE)
- 263-003: Test & Quality Posture Analysis (DONE)

---
## Sprint 264 — sprint-264

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 854s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 854327ms |

### Tasks

- 264-001: Autonomous engine internals doc — yeni dispatch yolları (DONE)
- 264-002: Autonomous user guide — backlog add yeni yüzeyleri (DONE)
- 264-003: Autonomous operations guide — governance + audit ops (DONE)
- 264-004: Enterprise depth reference — read-side + enforcement (DONE)
- 264-005: Config reference — yeni anahtarlar (DONE)
- 264-006: CLI commands reference — audit + backlog yeni flag'ler (DONE)
- 264-007: Features reference — yeni yetenek satırları (DONE)
- 264-008: Feature matrix guide — satır güncellemeleri (DONE)
- 264-009: Event channels reference — capability audit aksiyonları (DONE)
- 264-010: API surface contract — autonomous backlog formatı (DONE)
- 264-011: Init-test kümesi gerçek fix — readline-mock timeout (DONE)
- 264-012: deckent-nedir (TR) — otonom yetenek özeti (DONE)

---
## Sprint 265 — sprint-265

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 508s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 507899ms |

### Tasks

- 265-001: ERP capability wake — erp.read handler + runtime wiring + referans driver (DONE)
- 265-002: SIEM HTTP transport + `audit forward --url` canlı wire (DONE)
- 265-003: SIEM syslog transport (RFC5424, injectable socket) (DONE)
- 265-004: JWKS fetch + RS256 key resolver (DONE)
- 265-005: Embedded-terminal OidcAuthProvider (spec §1d rezerve slot) (DONE)
- 265-006: features.md sahte auto-gen başlığı düzelt (Sprint 264 worker bulgusu) (DONE)

---
## Sprint 266 — sprint-266

**Status:** RETROSPECTIVE
**Date:** 2026-06-09
**Duration:** 575s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 574510ms |

### Tasks

- 266-001: Odoo read-only ErpDriver (JSON-RPC search_read) (DONE)
- 266-002: audit CLI tamamlama — syslog forward wire + retention subcommand (DONE)
- 266-003: Enterprise integrations reference — sprint-265 çıktıları (DONE)
- 266-004: Enterprise depth — JWKS/OIDC/transport ekleri (DONE)
- 266-005: Autonomous operations — forward --url/--syslog ekleri (DONE)

---
## Sprint 267 — sprint-267

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** ~26dk efektif (gece 02:57 makine-uykusu crash'i + CC kurtarma respawn 07:15-07:37)

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | ~26dk (kurtarma dahil) |

### Tasks

- 267-001: API bearer middleware — statik-key OIDC JWT uzantısı (api_oidc) (DONE)
- 267-002: SAP OData read-only ErpDriver (DONE — ilk deneme OOM exit 137, ikinci worker tamamladı)
- 267-003: CLI commands reference — retention + syslog + forward önceliği (DONE)
- 267-004: Config reference — api_oidc bloğu (DONE)
- 267-005: Enterprise integrations — Odoo/retention/archive-aware ekleri (DONE)
- 267-006: Features reference — 266/267 satırları (DONE)

> Kurtarma notu: orchestrator gece 02:59'da öldü (makine uykusu); `deckent resume`
> sentetik NO_GO yarışıyla (RESUME-RACE) sprint'i 1/6 kapattı. CC manuel respawn
> (ADR-047) ile 5 task yeniden koşuldu, 6/6 DONE disk-verify edildi; ilk sahte
> retro'nun istatistikleri düzeltildi.

---
## Sprint 268 — sprint-268

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1506s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 7 |
| Completed | 7 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1505743ms |

### Tasks

- 268-001: RESUME-RACE fix — resume respawn'dan önce bayat worker-artifact reset (DONE)
- 268-002: FINALIZE fix üçlüsü — recount + archive-blind + orphan-state (DONE)
- 268-003: SPAWN-LIFECYCLE — modelEffort pass-through + completion status finalize (DONE)
- 268-004: JWKS async AuthProvider seam — terminal auth RS256/JWKS canlı (DONE)
- 268-005: Dynamics 365 OData read-only ErpDriver (DONE)
- 268-006: Enterprise-depth reference — api_oidc + JWKS-seam + Dynamics ekleri (DONE)

---
## Sprint 269 — sprint-269

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** ~35dk efektif (ilk koşu Anthropic usage-limit kesintisi + CC retry respawn)

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | ~35dk (limit kesintisi + retry dahil) |

### Tasks

- 269-001: API server yüzey fix'leri — SPA token-inject + Enterprise endpoints + chat-stream adapter (DONE — retry)
- 269-002: Dashboard frontend — Workers/Directives rotaları + {n} fix + Nervous SSE + client birleştirme (DONE — retry)
- 269-003: REPL slash tamamlama + i18n ihlalleri — /autonomous /audit /directives + hardcode temizliği (DONE — retry)
- 269-004: MCP parite — deckent_run modelEffort/timeout/keep + deckent_audit action genişletmesi (DONE — retry)
- 269-005: Doc-drift kapatma — mcp-tools regen + drift testi + features 268 satırları (DONE)

> Limit notu: ilk koşuda 5 paralel fable worker'ı Anthropic usage limitini tüketti — 4 ağır task'ın
> worker'ları hb seq-99/DONE'a kadar gelip .result yazamadan kesildi (sentetik NO_GO + FIX dalgası
> aynı ölü limite koştu). Limit reset sonrası CC manuel respawn: 4/4 DONE disk-verify. Dersler
> F1-LIM + model-katmanlama politikası olarak MASTER-PLAN'de; ilk sahte retro istatistikleri düzeltildi.

---
## Sprint 270 — sprint-270

**Status:** COMPLETE
**Date:** 2026-06-10
**Duration:** 14282s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 20 |
| Completed | 20 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 14282161ms |

### Tasks

- 270-001: validate-publish güçlendirme — exec-bit + dashboard-bundle assertion'ları (DONE)
- 270-002: npm pack hermetik smoke — paketten kurulan deckent gerçekten açılıyor (DONE)
- 270-003: README quickstart — 3-komut kurulum çıtası (DONE)
- 270-004: dev/tsc exec-bit kaybı kökü — watch yolunda da +x garantisi (DONE)
- 270-005: PSL-6 doctor auth-probe — CLI var ≠ login; gerçek oturum durumu (DONE)
- 270-006: doctor wire — auth-probe satırları ("CLI var ama login DEĞİL" görünür) (DONE)
- 270-007: F1-IMG part 1 — worker-image readiness denetim modülü (DONE)
- 270-008: F1-IMG part 2 — doctor satırı + consent-based rebuild önerisi (ADR-063) (DONE)
- 270-009: docs/reference/multi-provider.md — kod-gerçeği rewrite (W-K #8a) (DONE)
- 270-010: docs/guide/multi-provider.md — rehber senkronu (W-K #8b) (DONE)
- 270-011: .codex/.gemini rules sync — Karpathy + worker-default parite (W-K #9) (DONE)
- 270-012: threat-model — Worker Code Execution + eksik saldırı yüzeyleri (DONE)
- 270-013: AUT-3 bayat default-deny test beklentisi — davranış doğrula + güncelle (DONE)
- 270-014: serve ilk-koşu çıktısı — tek-blok kullanım rehberi (i18n) (DONE)
- 270-015: features.md — 269 satırları (DONE)
- 270-016: config-reference — rateLimitExemptLoopback + terminal_oidc_jwks (DONE)
- 270-017: enterprise-integrations — Dynamics bölümü (DONE)
- 270-018: cli-commands.md — doctor/serve/audit 269-270 eklemeleri (DONE)
- 270-019: REPL i18n sözlük denetimi — yeni key'lerin en/tr bütünlüğü (DONE)
- 270-020: MASTER-PLAN işaretlemeleri — 270 kapanan maddeler (DONE)

---
## Sprint 270 — sprint-270

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 20939s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 20939396ms |

### Tasks


---
## Sprint 271 — sprint-271

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1975s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 14 |
| Completed | 13 |
| Tech Debt | 2 |
| No-Go | 1 |
| Coverage | NaN% |
| Duration | 1974907ms |

### Tasks

- 271-001: resource-monitor çekirdeği — docker stats örnekleyici → JSONL (DONE)
- 271-002: resource_monitor config bloğu (DONE)
- 271-003: resource-log analiz fonksiyonları — per-task peak/avg (DONE)
- 271-004: `deckent resources` CLI — anlık snapshot + log özeti (DONE)
- 271-005: sprint-yaşamdöngüsü wire — opt-in izleme SPAWN→CLEANUP (GO_WITH_TECH_DEBT)
- 271-006: doctor "Worker Resources" satırı — limit görünürlüğü + tavan uyarısı (GO_WITH_TECH_DEBT)
- 271-007: resource-profile referansı — kod-türevli kaynak haritası (DONE)
- 271-008: pack diyeti — 4.8MB → eşik altı (DONE)
- 271-009: link lint — 17 kırık link (DONE)
- 271-010: manifest F3-009 pre-existing test çifti (DONE)
- 271-011: crash-hardening — .spawnlock bayat-kilit temizliği kurtarma araçlarında (DONE)
- 271-012: features + cli-commands — resources/resource_monitor satırları (DONE)
- 271-013: MASTER-PLAN işaretleri — 271 kapananlar (NO_GO)

---
## Sprint 272 — sprint-272

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1563s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1563480ms |

### Tasks

- 272-001: GHOST-FINALIZE fix — checkpoint artığı temizliği + start'ın dürüst davranışı (DONE)
- 272-002: dispatch-kuyruğu/EVALUATE yarışı — koşmamış task varken değerlendirme başlamaz (DONE)
- 272-003: exit-without-result kökü (a) — docker wrapper son-şans + zengin marker (DONE)
- 272-004: exit-without-result kökü (b) — eval'de workPresent → verify-and-complete FIX yolu (DONE)
- 272-005: F1-LIM faz-2a — task-tipine göre memory limiti (kod 1.5g / doc 768m önerisi) (DONE)
- 272-006: F1-LIM faz-2b — provider-limit tespit modülü + FIX ölü-limit guard'ı (DONE)
- 272-007: docs — resource-profile kind-limit bölümü + config/features satırları (DONE)
- 272-008: MASTER-PLAN işaretleri — 272 kapananlar (DONE)

---
## Sprint 273 — sprint-273

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1190s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 13 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1190114ms |

### Tasks

- 273-001: limit-ledger çekirdeği — transcript parse + maliyet-eşdeğeri birim (DONE)
- 273-002: ledger session→task eşleme + sprint agregasyonu (DONE)
- 273-003: `deckent usage` CLI — pencere + sprint görünümü (DONE)
- 273-004: sprint-reporter "limit-yakım" satırı — retro entegrasyonu (DONE)
- 273-005: result-evaluator tokenUsage hizalaması — beyan artık zorunlu değil (DONE)
- 273-006: .gitignore sprint-runtime artıkları — git-status prefix stabilizasyonu (DONE)
- 273-007: prompt-determinizm guard testi (DONE)
- 273-008: prompt-template revizyonu — Skills-first blok sırası + tokenUsage metni (OPUS) (DONE)
- 273-009: goCriteria şablonu — full-suite çelişkisi + Kanıt-interpolasyon fix'i (DONE)
- 273-010: persona/skill "full test suite" envanteri + targeted-verify hizalaması (DONE)
- 273-011: ADR seçici — açık `ADR-NNN` referansı topN'e zorla dahil (DONE)
- 273-012: ADR render dedupe + operative-extract (opt-in, default-off) (DONE)
- 273-013: doc senkronu — features + MASTER-PLAN işaretleri (DONE)

---
## Sprint 274 — sprint-274

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 707s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 707204ms |

### Tasks

- 274-001: cache_warm config bloğu (DONE)
- 274-002: cache-warm spawn stratejisi — ilk worker yazar, fleet okur (OPUS) (DONE)
- 274-003: ledger cache-gate — sprint'in 2.+ worker'ları cache okuyor mu? (DONE)
- 274-004: retro limit-satırı genişletmesi — hit-rate + warm-share (DONE)
- 274-005: docs — cache_warm + adr_render + usage cache-gate (DONE)
- 274-006: MASTER-PLAN — F1-TOK Faz 2 işaretleri (DONE)

---
## Sprint 275 — sprint-275

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 587s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 8 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 587158ms |

### Tasks

- 275-001: /usage REPL slash — üç katman birden (DONE)
- 275-002: /resources REPL slash — üç katman birden (DONE)
- 275-003: deckent_usage MCP tool — ADR-022 parite (DONE)
- 275-004: 273-010 debt kapanışı — kalan "full test suite" eşleşmeleri denetimi (DONE)
- 275-005: cli-commands + features — usage/resources slash + MCP satırları (DONE)
- 275-006: mcp-tools.md regen — 34 tool (DONE)
- 275-007: resource-profile — F1-TOK optimizasyon bölümü iskeleti (DONE)
- 275-008: MASTER-PLAN — F1-TOK durum konsolidasyonu (DONE)

---
## Sprint 276 — sprint-276

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1524s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1524456ms |

### Tasks

- 276-001: directive-interrogator çekirdeği — zorlayıcı soru üretimi + taslak öneri (DONE)
- 276-002: interrogation config + i18n soru sözlüğü (DONE)
- 276-003: deckent plan --interrogate CLI wire (DONE)
- 276-004: cross-verify çekirdeği — high-stakes tespit + farklı-provider seçimi (DONE)
- 276-005: cross_verify config bloğu (default-off) (DONE)
- 276-006: adversarial-refute prompt builder (DONE)
- 276-007: cross-verify dispatch + eval advisory-wire (OPUS) (DONE)
- 276-008: cross-verify outcome-tracker beslemesi — öğrenilen verifier eşleşmeleri (DONE)
- 276-009: REPL /interrogate slash — pre-plan sorgulamaya REPL erişimi (DONE)
- 276-010: api-surface + config-reference — yeni alanlar (DONE)
- 276-011: features + cli-commands — PLAN-INT/XVER satırları (DONE)
- 276-012: MASTER-PLAN — PLAN-INT-1 + XVER-1 kapanış işaretleri (DONE)

---
## Sprint 277 — sprint-277

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1668s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 14 |
| Completed | 14 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1668443ms |

### Tasks

- 277-001: /api/auth/me whoami endpoint — bearer'dan kimlik + rol (DONE)
- 277-002: audit-actor JWT sub'dan türetme — hardcoded 'local' fix (DONE)
- 277-003: useAuth hook/context — dashboard auth-state SSOT (DONE)
- 277-004: AuthStatus komponenti — "kim giriş yaptı" + logout (DONE)
- 277-005: ManualTokenInput — api_oidc modunda JWT test girişi (DONE)
- 277-006: OIDC redirect-flow çekirdeği — PKCE + authorize-URL + state (OPUS) (DONE)
- 277-007: OIDC token-exchange backend endpoint — code→token (OPUS) (DONE)
- 277-008: dashboard wire — Provider + AuthStatus + Login/Callback rotaları (DONE)
- 277-009: EnterprisePage "BENİM rolüm" bağlamı (DONE)
- 277-010: api_oidc test smoke — gerçek-binary serve + JWT-bearer dashboard yolu (DONE)
- 277-011: config-reference + api-surface — dashboard_oidc + auth/me + crossVerify-komşu (DONE)
- 277-012: features + enterprise-depth — dashboard SSO satırları (DONE)
- 277-013: MASTER-PLAN — ENT-5 dashboard SSO işaretleri (DONE)
- 277-014: dashboard emoji→lucide-react temizliği — tasarım kararı ihlali geri-al (ACİL, Alperen) (DONE)

---
## Sprint 278 — sprint-278

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1588s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 11 |
| Completed | 11 |
| Tech Debt | 3 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1588233ms |

### Tasks

- 278-001: worker_comms config + .result sharedNotes/messages şeması (DONE)
- 278-002: worker→shared yazım köprüsü — .result sharedNotes → SharedMemory (DONE)
- 278-003: shared→worker okuma — spawn-time SharedMemory prompt enjeksiyonu (OPUS) (GO_WITH_TECH_DEBT)
- 278-004: handoff→downstream worker prompt enjeksiyonu (OPUS) (GO_WITH_TECH_DEBT)
- 278-005: structured handoff-notes — upstream worker'dan downstream'e mesaj (GO_WITH_TECH_DEBT)
- 278-006: worker prompt talimatı — sharedNotes/handoffNotes nasıl yazılır (DONE)
- 278-007: multi-agent.ts disposition — runPipeline 0-caller (ADR-038) (DONE)
- 278-008: worker-comms görünürlük — CLI durum + shared/handoff listesi (DONE)
- 278-009: e2e comms akışı — iki-worker shared+handoff round-trip smoke (DONE)
- 278-010: api-surface + config-reference — worker_comms + sharedNotes (DONE)
- 278-011: features + MASTER-PLAN — COMM-1 işaretleri (DONE)

---
## Sprint 279 — sprint-279

**Status:** RETROSPECTIVE
**Date:** 2026-06-10
**Duration:** 1260s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 11 |
| Completed | 11 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 9.1% |
| Duration | 1260447ms |

### Tasks

- 279-001: WK-import — core→orchestra import-cycle çöz (ADR-008) (OPUS) (DONE)
- 279-002: WK-nervous — panic-gate timeout wire (0-caller → spawn yolu) (GO_WITH_TECH_DEBT)
- 279-003: WK-cost — mid-sprint token-usage abort (limit-ledger besleme) (DONE)
- 279-004: WK-7 — auditor async-batch liveness (O(n) spawnSync → parallel) (DONE)
- 279-005: DASH-001 — /api/kill/all + autonomous SSE watch (DONE)
- 279-006: DASH-002 — sidebar bell pending-count badge (lucide, emoji-yasak) (DONE)
- 279-007: WK-5-kalan — docker live-monitor: output-stream PTY worker-attach + watch --follow (DONE)
- 279-008: F7-ENT-verify — enterprise dashboard backend doğrula + 4 tab gerçek-veri (DONE)
- 279-009: WK-5/COMM-1 dashboard görünürlük — Worker Comms + Resources panel (DONE)
- 279-010: features + cli-commands — M-küme satırları (DONE)
- 279-011: MASTER-PLAN — M-küme işaretleri (DONE)

---
## Sprint 280 — sprint-280

**Status:** COMPLETE
**Date:** 2026-06-11
**Duration:** 6705s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed | 7 |
| Tech Debt | 2 |
| No-Go | 3 |
| Coverage | NaN% |
| Duration | 6705462ms |

### Tasks

- 280-001: PLANOBS-001 — event-stream PROGRESS channel + emitProgress helper (DONE)
- 280-002: PLANOBS-002 — notify 'progress' + 'phase-change' event-tipleri (3 surface) (DONE)
- 280-003: APPROVE-007b — modifiedPayload IPC transport + executor consume (OPUS) (DONE)
- 280-004: REPL /mcp broker wire — G1 (mcp-bridge → chat-native) (OPUS, Tier-1) (GO_WITH_TECH_DEBT)
- 280-005: PLANOBS-001 emit-site'ları — EXECUTE-% + spawn + pre-vitest (GO_WITH_TECH_DEBT)
- 280-006: PLANOBS-004 — planner-fail notify + plan spinner (DONE)
- 280-007: PLANOBS-005 — start çift-planSprint kaldır + .tasks cache + start-fail notify (OPUS) (NO_GO)
- 280-008: APPROVE-007b — REPL /nervous edit (chat-nervous-bridge handleEdit) (DONE)
- 280-009: features + cli-commands — L-küme satırları (NO_GO)
- 280-010: MASTER-PLAN — §4G L-küme işaretleri (NO_GO)

---
## Sprint 281 — sprint-281

**Status:** RETROSPECTIVE
**Date:** 2026-06-11
**Duration:** 608s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 608420ms |

### Tasks

- 281-001: Mimari & Eşzamanlılık Doğruluğu Denetimi (DONE)
- 281-002: Adversarial Kırmızı-Takım — Tasarımı Kır (DONE)
- 281-003: Ürün & User/Enterprise Perspektifi Denetimi (DONE)

---
## Sprint 282 — sprint-282

**Status:** RETROSPECTIVE
**Date:** 2026-06-11
**Duration:** 2903s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 13 |
| Completed | 10 |
| Tech Debt | 5 |
| No-Go | 3 |
| Coverage | 12.5% |
| Duration | 2903032ms |

### Tasks

- 282-001: Chat stream-boşluğu kök-teşhis — EventSource-auth mu, serve-içi CLI-spawn mı? (DONE)
- 282-002: POST /api/chat adapter-backed — classifier yalnız açık-komutlara (GO_WITH_TECH_DEBT)
- 282-003: ChatPage stream-hata dürüstlüğü — onError yutma + POST-yarışı fix (DONE)
- 282-004: Stream-yolu kök-fix — teşhise göre auth/spawn onarımı (GO_WITH_TECH_DEBT)
- 282-005: Stale sprint-state — finalize terminal-snapshot + /api/status reconcile (GO_WITH_TECH_DEBT)
- 282-006: Nav tek-kaynak — Layout↔Sidebar birleştir, Workers/Directives erişilir (GO_WITH_TECH_DEBT)
- 282-007: Terminal-bar overlap — z-index/layout fix (NO_GO)
- 282-008: Alert-dedup — auditor staleness-uyarısı tek-satır (GO_WITH_TECH_DEBT)
- 282-009: DebtPage route + /settings yüzeyi (NO_GO)
- 282-010: Enterprise tenant-CRUD — UI + API (EXECUTING)
- 282-011: chat-backend.ts disposition — API-W2 (DONE)
- 282-012: Dashboard sayfa-içi i18n-temizliği — literal-label'lar i18n-key'e (NO_GO)

---
## Sprint 283 — sprint-283

**Status:** RETROSPECTIVE
**Date:** 2026-06-12
**Duration:** 1292s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1291618ms |

### Tasks

- 283-001: Terminal-bar overlap — z-index/layout fix (eski 282-007) (DONE)
- 283-002: DebtPage route + /settings yüzeyi (eski 282-009) (DONE)
- 283-003: Dashboard sayfa-içi i18n-temizliği (eski 282-012) (DONE)

---
## Sprint 284 — sprint-284

**Status:** RETROSPECTIVE
**Date:** 2026-06-12
**Duration:** 2224s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 2 |
| Coverage | NaN% |
| Duration | 2223973ms |

### Tasks

- 284-001: Canlı-olay köprüsü — hb + event-stream → /api/events typed-push (DONE)
- 284-002: Dashboard client anlık-merge — snapshot üstüne event-akışı (DONE)
- 284-003: Worker-log SSE endpoint — backend-agnostik file-tail (DONE)
- 284-004: WorkersPage canlı log-paneli UI (DONE)
- 284-005: DASH-FIX-1 — terminal-sessions 401 + directives 404 (DONE)
- 284-006: Gecikme-ölçüm smoke'u — "anlık" iddiasının kanıt-zinciri (NO_GO)

---
## Sprint 285 — sprint-285

**Status:** RETROSPECTIVE
**Date:** 2026-06-12
**Duration:** 2990s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 7 |
| Tech Debt | 1 |
| No-Go | 1 |
| Coverage | 0.0% |
| Duration | 2990305ms |

### Tasks

- 285-001: Enstrümante kök-teşhis — 3 hipotezi ayrıştır + failing-repro (DONE)
- 285-002: Tur-içi tool-KUYRUĞU + per-tool sıralı onay (Ink) (GO_WITH_TECH_DEBT)
- 285-003: Stream-toplama sağlamlığı — prose-konum bağımsızlığı (DONE)
- 285-004: Çoklu tool-sonucu geri-beslemesi — model HEPSİNİ görür (DONE)
- 285-005: Dürüst-telemetri + PTY regresyon-guard (NO_GO)

---
## Sprint 286 — sprint-286

**Status:** RETROSPECTIVE
**Date:** 2026-06-14
**Duration:** 2855s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 57 |
| Completed | 53 |
| Tech Debt | 0 |
| No-Go | 4 |
| Coverage | NaN% |
| Duration | 2854737ms |

### Tasks

- 286-001: README.md — proje vitrini (flagship) (DONE)
- 286-002: README-TR.md — TR ayna (DONE)
- 286-003: SECURITY.md + CONTRIBUTING.md (DONE)
- 286-004: CODE_OF_CONDUCT.md + CHANGELOG.md (DONE)
- 286-005: examples/ — çalıştırılabilir örnekler (DONE)
- 286-006: docs/ giriş + sözlük + indeks (DONE)
- 286-007: docs/ politika + worker rehberi (DONE)
- 286-008: guide — başlangıç + kurulum (DONE)
- 286-009: guide — quickstart + ilk sprint + kavramlar (DONE)
- 286-010: guide — deckent-nedir + mimari-bakış + özellik-matrisi (DONE)
- 286-011: guide — autonomous (3 doküman) (DONE)
- 286-012: guide — multi-provider + yerel-model (DONE)
- 286-013: guide — docker backend + workers (DONE)
- 286-014: guide — nervous + evolution + ram-experiment (DONE)
- 286-015: guide — chat + terminal (REPL) (DONE)
- 286-016: guide — dashboard + config-recovery + troubleshooting (NO_GO)
- 286-017: guide — faq (DONE)
- 286-018: reference — CLI komutları (DONE)
- 286-019: reference — config (DONE)
- 286-020: reference — enterprise (3 doküman) (NO_GO)
- 286-021: reference — execution + lifecycle + health (DONE)
- 286-022: reference — marketplace + migration + provider-free + resource-profile (DONE)
- 286-023: reference — multi-provider + security + skills + stack-routing + glossary (DONE)
- 286-024: architecture — çekirdek mimari (flagship) (DONE)
- 286-025: architecture — authority + memory + lifecycle (DONE)
- 286-026: cookbook — sprint temelleri (01-03) (DONE)
- 286-027: cookbook — operasyon (04-06) (DONE)
- 286-028: cookbook — bakım (07-09) (DONE)
- 286-029: cookbook — alarmlar + uygulama tarifleri (10 + add-rest-api + fix-bug) (DONE)
- 286-030: cookbook — doküman tarifi + indeks (DONE)
- 286-031: features — genel-bakış + mimari + lifecycle (00-02) (DONE)
- 286-032: features — routing + model-registry + memory (03-05) (DONE)
- 286-033: features — agents + skills + spawn (06-08) (DONE)
- 286-034: features — waves + evaluation + rbac (09-11) (DONE)
- 286-035: features — observability + native-repl + dashboard (12-14) (DONE)
- 286-036: features — mcp + cli + evolution (15-17) (DONE)
- 286-037: features — nervous + vizyon (18-19) (DONE)
- 286-038: features — son-kazanımlar + dashboard-retheme (20-21) (DONE)
- 286-039: development — agent + brain + worker rehberleri (DONE)
- 286-040: development — dashboard + plugin + smoke (DONE)
- 286-041: development — repo-sync + troubleshooting (DONE)
- 286-042: security — threat-model + sprint-review (DONE)
- 286-043: vision — VISION + agentic-ecosystem (DONE)
- 286-044: vision — blueprint + roadmap (DONE)
- 286-045: vision/comparison — DE-COMPETITOR-IFY (DONE)
- 286-046: design + benchmark (DONE)
- 286-047: governance + launch (bot-setup) (DONE)
- 286-048: release — roadmap + notes + checklist + beta-tracker (DONE)

---
## Sprint 287 — sprint-287

**Status:** RETROSPECTIVE
**Date:** 2026-06-14
**Duration:** 879s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 879411ms |

### Tasks

- 287-001: roadmap.md — user-facing yol-haritasına dönüştür (DONE)
- 287-002: blueprint.md + blueprint-TR.md — de-competitor + de-stale (DONE)
- 287-003: enterprise referansları — derinleştir (286-020 yüzeysel kaldı) (DONE)

---
## Sprint 288 — sprint-288

**Status:** RETROSPECTIVE
**Date:** 2026-06-15
**Duration:** 446s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 446423ms |

### Tasks

- 288-001: Tema A — Genel Bakış & Vizyon (DONE)
- 288-002: Tema B — Orkestrasyon Çekirdeği (DONE)
- 288-003: Tema C — Agent / Skill / Provider Sistemi (DONE)
- 288-004: Tema D — Hafıza, Yönetişim, Gözlem (DONE)
- 288-005: Tema E — Arayüzler & Operasyon (DONE)

---
## Sprint 289 — sprint-289

**Status:** RETROSPECTIVE
**Date:** 2026-06-15
**Duration:** 484s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 483991ms |

### Tasks

- 289-001: Process anti-IDOR + positive-OIDC tenant-stamp testleri (DONE)
- 289-002: Actor.id audit-lineage — gerçek OIDC sub audit-chain'e düşsün (DONE)
- 289-003: deriveRequestPrincipal defense-in-depth (verified-claims sinyali) (DONE)
- 289-004: Test-kapsama kapanışı (N3 drain integration + N2 401/sub-flag + D8 guard) (DONE)
- 289-005: Stale-comment süpürmesi (doc-drift temizliği) (DONE)

---
## Sprint 290 — sprint-290

**Status:** RETROSPECTIVE
**Date:** 2026-06-18
**Duration:** 1652s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1651792ms |

### Tasks

- 290-001: CORE-UNIFORMITY slice 2 — mod-bağımsız Lifecycle kernel (DONE)
- 290-002: F3-008 — process-mode executor (mod-geçişi 3/3) (GO_WITH_TECH_DEBT)
- 290-003: TOK-AUT — autonomous tokenUsage 0/0/0 fix (DONE)
- 290-004: ADR-NOISE — checkADRCompliance count_check'i task-spesifik yap (DONE)
- 290-005: IDLE-SPIN — autonomous idle busy-spin teşhis + fix (DONE)
- 290-006: DOC-35 — DECKENT.md tool-count 34→35 + process (DONE)

---
## Sprint 311 — sprint-311

**Status:** RETROSPECTIVE
**Date:** 2026-06-19
**Duration:** 525s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 524752ms |

### Tasks

- 311-001: ADR-001-W — "Node 18" → "Node 24+" sweep (LIVE src only) (DONE)
- 311-002: ADR-021-W — output_splash dormant-knob → gerçek gate (DONE)
- 311-003: ADR-028-W — routing_engine default 'v1'→'v2' (config-tutarlılık) (DONE)
- 311-004: ADR-010-W — cli-highlight + zod ADR-attribution (doc-only) (DONE)

---
## Sprint 326 — sprint-326

**Status:** RETROSPECTIVE
**Date:** 2026-06-26
**Duration:** 2397s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 19 |
| Completed | 19 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 2396970ms |

### Tasks

- 326-001: Result Zod schema + validator (the spine) (DONE)
- 326-002: result-assembler (orchestrator-owned, git-authoritative) (DONE)
- 326-003: token capture — extractUsage adapter contract + codex + normalizer (DONE)
- 326-004: tokenizer-fallback (usage-raporlamayan provider) (GO_WITH_TECH_DEBT)
- 326-005: remove worker token self-count placeholder (DONE)
- 326-006: cost — calculateActualCost (cross-provider, local→$0) (DONE)
- 326-007: structured-JSONL log-event contract (DONE)
- 326-008: complete-stream capture into log (DONE)
- 326-009: archive-then-delete log integrity (DONE)
- 326-010: live SSE stream wire (dead-stream fix) (DONE)
- 326-011: dashboard live log-renderer + result-display (DONE)
- 326-012: Auditor 2nd-layer validation + finding-ledger (DONE)
- 326-013: estimate-vs-actual reconciler (DONE)

---
## Sprint 327 — sprint-327

**Status:** RETROSPECTIVE
**Date:** 2026-06-26
**Duration:** 56s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 1 |
| Completed | 1 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 56374ms |

### Tasks

- 327-001: live-proof doc note (GO_WITH_TECH_DEBT)

---
## Sprint 328 — sprint-328

**Status:** RETROSPECTIVE
**Date:** 2026-06-26
**Duration:** 1367s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1367032ms |

### Tasks

- 328-001: rich normalized usage schema (foundation) (DONE)
- 328-002: Class-A claude usage-emit (CLI-agent, native source) (DONE)
- 328-003: Class-A codex usage-emit (CLI-agent, native source) (GO_WITH_TECH_DEBT)
- 328-004: Class-A gemini verify + extractUsage→result (CLI-agent) (DONE)
- 328-005: Class-B API usage-accumulate → result (HTTP-response providers) (DONE)
- 328-006: Class-C OpenRouter first-class (unified gateway, API side) (DONE)

---
## Sprint 343 — sprint-343

**Status:** RETROSPECTIVE
**Date:** 2026-06-27
**Duration:** 1432s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 12 |
| Completed | 12 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1432022ms |

### Tasks

- 343-001: Track A — EVALUATE-phase enforcement gates (A14 verify-delta downgrade + A9 ADR-compliance), flag-gated default-off (DONE)
- 343-002: Track A — B1 RBAC: worker `checkWorkerAuthority` honors `enforceRbac` (hard-deny) + stale-comment fix, flag-gated default-off (DONE)
- 343-003: Track A — B6 cumulative-spend warn-gate at PRE-SPAWN (daily/monthly), flag-gated default-off (GO_WITH_TECH_DEBT)
- 343-004: Track B — R4: remove the dead `@deprecated async evaluateResult`, leave `evaluateWithRubric` canonical (GO_WITH_TECH_DEBT)
- 343-005: Track B — R4: consolidate the two VS Code extension trees onto the canonical one (delete the stub) (DONE)
- 343-006: Track C — native-chat `/provider` switch rebuilds the adapter (wire the callback) (GO_WITH_TECH_DEBT)
- 343-007: Track C — routing-affinity (ADR-075): thread `skill_agent_affinity` config → RoutingOptions + balance-observability, default-off (GO_WITH_TECH_DEBT)
- 343-008: Track D — skill-sandbox AST-scan honest-fail when TypeScript is unavailable (no silent no-op) (DONE)
- 343-009: Track D — `getMessage` deduplicated prod-warn on missing i18n key (visibility without spam) (DONE)
- 343-010: Track E — ADR-094: flag-gated enforcement-vein seam (verify-delta · ADR-compliance · spend-warn · RBAC hard-deny) (DONE)
- 343-011: Track E — LAST-STANDING campaign closeout findings note (NEW dated doc; NOT MASTER-PLAN/TRIAGE) (DONE)

---
## Sprint 344 — sprint-344

**Status:** RETROSPECTIVE
**Date:** 2026-06-27
**Duration:** 130s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 129509ms |

### Tasks

- 344-001: 002-redo — B1 RBAC: fix the stale `enforce_rbac` comment in sprint-runtime.ts (+ verify worker honor) (DONE)
- 344-002: 008-redo — skill-sandbox AST-scan honest-fail when TypeScript is unavailable (DONE)
- 344-003: 009-redo — getMessage deduplicated prod-warn on missing i18n key (GO_WITH_TECH_DEBT)

---
## Sprint 345 — sprint-345

**Status:** RETROSPECTIVE
**Date:** 2026-06-28
**Duration:** 1117s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 1117266ms |

### Tasks

- 345-001: A01 — guide onboarding-core (DONE)
- 345-002: A02 — guide onboarding-concepts (DONE)
- 345-003: A03 — guide autonomous & learning (DONE)
- 345-004: A04 — guide nervous, dashboard & REPL (DONE)
- 345-005: A05 — guide workers, troubleshooting & misc (DONE)
- 345-006: A06 — guide providers & backends (DONE)
- 345-007: A07 — reference CLI (cli.md + cli-commands.md) (DONE)
- 345-008: A08 — reference config (config.md + config-reference.md) (DONE)
- 345-009: A09 — reference API (api / endpoints / examples / surface) (DONE)
- 345-010: A10 — reference MCP (guide / overview / tools[AUTO] / resources) (DONE)
- 345-011: A11 — reference agents, skills & marketplace (DONE)
- 345-012: A12 — reference routing, execution & dependencies (DONE)
- 345-013: A13 — reference enterprise (depth / foundation / integrations) (DONE)
- 345-014: A14 — reference ops & security (DONE)
- 345-015: A15 — reference misc (features / glossary / lifecycle) (DONE)
- 345-016: A16 — cookbook recipes 01–05 + index (DONE)
- 345-017: A17 — cookbook recipes 06–10 (DONE)
- 345-018: A18 — cookbook task-recipes & meta (DONE)
- 345-019: A19 — architecture/architecture.md (the 78KB map) (DONE)
- 345-020: A20 — architecture agents, authority & stray ADRs (DONE)
- 345-021: A21 — architecture memory & sprint-lifecycle (DONE)
- 345-022: A22 — development guides (brain / worker / agent / smoke) (DONE)
- 345-023: A23 — development guides (dashboard / plugin / repo-sync / troubleshooting) (DONE)
- 345-024: A24 — vision cluster (DONE)
- 345-025: A25 — strategy, benchmark, design & governance (DONE)
- 345-026: A26 — launch cluster (DONE)
- 345-027: A27 — release cluster (DONE)
- 345-028: A28 — top-level docs + GLOBAL cross-ref & auto-doc integrity (DONE)

---
## Sprint 346 — sprint-346

**Status:** COMPLETE
**Date:** 2026-06-28
**Duration:** 874s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 24 |
| Completed | 13 |
| Tech Debt | 0 |
| No-Go | 11 |
| Coverage | NaN% |
| Duration | 874405ms |

### Tasks

- 346-001: F01 — fix guide onboarding-core (DONE)
- 346-002: F02 — fix guide concepts (DONE)
- 346-003: F03 — fix guide autonomous & learning (DONE)
- 346-004: F04 — fix guide nervous, dashboard & REPL (DONE)
- 346-005: F05 — fix guide workers, troubleshooting & misc (DONE)
- 346-006: F06 — fix guide providers & backends (DONE)
- 346-007: F07 — fix reference CLI (hand-curated only) (NO_GO)
- 346-008: F08 — fix reference config (NO_GO)
- 346-009: F09 — fix reference API (NO_GO)
- 346-010: F10 — fix reference MCP (hand-authored only) (DONE)
- 346-011: F11 — fix reference routing, execution & dependencies (DONE)
- 346-012: F12 — fix reference enterprise (+ broken self-anchors) (DONE)
- 346-013: F13 — fix reference ops & security (DONE)
- 346-014: F14 — fix reference features/glossary/lifecycle (+ glossary dedup) (NO_GO)
- 346-015: F15 — fix cookbook recipes 01–05 + index (DONE)
- 346-016: F16 — fix cookbook recipes 06–10 (DONE)
- 346-017: F17 — fix cookbook task-recipes & meta (+ fix-bug anchor) (NO_GO)
- 346-018: F18 — fix architecture/architecture.md (the master map) (NO_GO)
- 346-019: F19 — fix architecture (authority, agents, memory, lifecycle, stray ADRs) (NO_GO)
- 346-020: F20 — fix development core guides (+ worker-guide dedup) (NO_GO)
- 346-021: F21 — fix development tool guides (DONE)
- 346-022: F22 — fix vision cluster (protected prose only) (NO_GO)
- 346-023: F23 — fix launch cluster (NO_GO)
- 346-024: F24 — fix top-level docs (NO_GO)

---
## Sprint 346 — sprint-346

**Status:** COMPLETE
**Date:** 2026-06-28
**Duration:** 1142s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 24 |
| Completed | 13 |
| Tech Debt | 0 |
| No-Go | 11 |
| Coverage | NaN% |
| Duration | 1142249ms |

### Tasks

- 346-001: F01 — fix guide onboarding-core (DONE)
- 346-002: F02 — fix guide concepts (DONE)
- 346-003: F03 — fix guide autonomous & learning (DONE)
- 346-004: F04 — fix guide nervous, dashboard & REPL (DONE)
- 346-005: F05 — fix guide workers, troubleshooting & misc (DONE)
- 346-006: F06 — fix guide providers & backends (DONE)
- 346-007: F07 — fix reference CLI (hand-curated only) (NO_GO)
- 346-008: F08 — fix reference config (NO_GO)
- 346-009: F09 — fix reference API (NO_GO)
- 346-010: F10 — fix reference MCP (hand-authored only) (DONE)
- 346-011: F11 — fix reference routing, execution & dependencies (DONE)
- 346-012: F12 — fix reference enterprise (+ broken self-anchors) (DONE)
- 346-013: F13 — fix reference ops & security (DONE)
- 346-014: F14 — fix reference features/glossary/lifecycle (+ glossary dedup) (NO_GO)
- 346-015: F15 — fix cookbook recipes 01–05 + index (DONE)
- 346-016: F16 — fix cookbook recipes 06–10 (DONE)
- 346-017: F17 — fix cookbook task-recipes & meta (+ fix-bug anchor) (NO_GO)
- 346-018: F18 — fix architecture/architecture.md (the master map) (NO_GO)
- 346-019: F19 — fix architecture (authority, agents, memory, lifecycle, stray ADRs) (NO_GO)
- 346-020: F20 — fix development core guides (+ worker-guide dedup) (NO_GO)
- 346-021: F21 — fix development tool guides (DONE)
- 346-022: F22 — fix vision cluster (protected prose only) (NO_GO)
- 346-023: F23 — fix launch cluster (NO_GO)
- 346-024: F24 — fix top-level docs (NO_GO)

---
## Sprint 347 — sprint-347

**Status:** RETROSPECTIVE
**Date:** 2026-07-01
**Duration:** 289s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 5 |
| Coverage | 0.0% |
| Duration | 288707ms |

### Tasks

- 347-001: W0-8 STATE-RESOLVER — env-aware state-path resolver primitive (NO_GO)
- 347-002: W0-9 CRED-PER-PROJECT — per-project encrypted credential store 🔴 (NO_GO)
- 347-003: W0-10 SYMLINK-AUTHORITY-WIRE — close the runtime symlink scope-bypass 🔴 (NO_GO)
- 347-004: W0-11 AUDIT-WIRE — persist terminal audit to MemoryStore + HMAC chain (NO_GO)
- 347-005: W0-12 CRASH-REDACT — redact secrets from fatal crash output 🔴 (NO_GO)

---
## Sprint 349 — sprint-349

**Status:** RETROSPECTIVE
**Date:** 2026-07-01
**Duration:** 554s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Completed | 5 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 554015ms |

### Tasks

- 349-001: DOCKER-FIXPACK — stale-shadow EACCES + inert kind-memlimit (rows 434+433) (DONE)
- 349-002: FINALIZE-ERROR-SURFACE — swallowed finalize failures become visible (row 436) (DONE)
- 349-003: CRED-HARDEN-PACK — AAD binding + atomic writes + Windows honesty (row 438) (DONE)
- 349-004: REDACT-COVERAGE — extend the secret-mask allowlist (row 437) (DONE)
- 349-005: PCOMP-W8 — test-strategy hints for exit-path tasks (row 445) (DONE)

---
## Sprint 350 — sprint-350

**Status:** RETROSPECTIVE
**Date:** 2026-07-01
**Duration:** 703s

### Results

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | NaN% |
| Duration | 703271ms |

### Tasks

- 350-001: TRN-1 — trace-recorder'ı sprint-worker turn'lerine WIRE (row 76) (DONE)
- 350-002: TRN-2 — trace-recorder'ı native-REPL'e WIRE (row 77) (DONE)
- 350-003: TRN-3 — cc-trace-extractor driver (row 78) (DONE)
- 350-004: APR-CONTRACT — ApprovalRequest tam kontratı (row 30) (DONE)
- 350-005: SIGTERM-CLEANUP — SIGTERM'i SIGINT temizlik-yoluna bağla (ADR-G-013 born) (DONE)
- 350-006: STALE-MODEL-ID-SWEEP — 30 test dosyasında sonnet-ID güncelle (row 431) (DONE)

---
