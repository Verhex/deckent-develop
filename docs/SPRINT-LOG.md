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
| Public functions | 17 (readContext, checkUsage, adjustSprintSize, createTask, planSprint, spawnWorkers, waitForResults, evaluateResult, handleEvaluation, handleCrossDependencies, escalateDebt, writeRetrospective, writeSprintLog, calculateMetrics, decay, cleanup, runSprint) |
| Internal helpers | 7 (readFileSafe, readJsonSafe, sleepSync, now, parseDebtTable, generateDebtTable, countBrainLines) |
| Error classes | 1 (BrainError) |

### Decisions Made

- **ADR-008**: Brain merkezi import — tek yönlü bağımlılık (brain → tmux/auditor/worker)
- **ADR-009**: DEBT.md markdown tablo formatı korunur (programatik parse/generate)

### Tech Debt Accepted

- DEBT-002: `checkUsage` stub (sıfır döner) — gerçek Claude CLI /status entegrasyonu sonraya
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
| 3 | 540 | 92% | checkUsage real impl, haiku_allowed semantic fix |
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

*Source of truth: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) — Section 19*
