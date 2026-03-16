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

*Source of truth: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) — Section 19*
