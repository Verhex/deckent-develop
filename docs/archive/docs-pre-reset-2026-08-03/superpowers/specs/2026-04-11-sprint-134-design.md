# Sprint 134 Design — Triple Dogfooding + Max-Load + Product Vision Launch

**Status:** APPROVED — ready for implementation plan
**Date:** 2026-04-11
**Author:** Claude Opus 4.6 (1M context) + Alperen (approver)
**Supersedes:** `2026-04-11-sprint-134-draft-directives.md`
**Related memories:** `project_vision_product_not_service.md`, `project_sprint134_preflight.md`, `project_sprint133_completed.md`

**DOKUNULAMAZ VİZYON:** Deckent bir üründür, SaaS değildir. OpenClaw gibi "kur çalıştır". Açık kaynak, ücretsiz, herkese her yerde. Her task bu lensten geçti.

**Sprint 134 Kimliği:** "Triple Dogfooding + Maksimum Yük Testi + Product Vision Doğum Günü"

**Target Kur-Çalıştır Readiness Score:** 3.6/5 → **≥3.9/5**

---

## Section 0 — Pre-Sprint Gates

### Gate 0.1 — Baseline Test Run (COMPLETED 2026-04-11)
```
Test Files  500 passed (500)
Tests       12372 passed | 16 skipped (12388)
Duration    91.60s
tsc --noEmit: 0 errors
git status:   clean, master branch
```
**Baseline persisted to:** `.deckent/sprint-134-baseline.json` (T-001 will formalize format).

### Gate 0.2 — DIRECTIVES Parse Dry-Run (MANDATORY BEFORE `deckent start`)
```bash
deckent plan --dry-run
# Expected: 15 tasks parsed, scope fields valid, dependencies recognized
```
If this fails: mitigate R12 before starting sprint. Fix DIRECTIVES.md formatting; do NOT rely on T-002 scope parser fix since T-002 is itself part of this sprint.

### Gate 0.3 — MCP Server State
Sprint 134 does not touch `src/mcp/` directly. MCP restart optional but recommended post-sprint when `src/orchestra/sprint-finalizer.ts` lands (T-006 + T-015).

---

## Section 1 — High-Level Architecture

### Task List (15 tasks, 4 HIGH + 3 normal + 3 medium + 5 low)

| # | Task | Effort | Priority | Wave | BlockedBy |
|---|------|--------|----------|------|-----------|
| 7 | Task dependency pipeline integration + feature flag ON | high | **CRITICAL** | W1 | — |
| 2 | DIRECTIVES scope parser hardening | low-med | HIGH | W1 | — |
| 3 | Auditor task-level `.hb` cleanup | low | NORMAL | W1 | — |
| 11 | Gitignore + cache + stash cleanup | low | LOW | W1 | — |
| 1 | Brain-side baseline + worker honesty checker | normal | HIGH | W2 | 134-007 |
| 4 | Token usage pipeline fix | medium | HIGH | W2 | 134-007 |
| 8 | ADR-033 Product Vision + roadmap.md | normal | HIGH | W2 | — |
| 12 | Mock-safe module audit | low | LOW | W2 | — |
| 5 | `sprint-reporter.ts` 4-way split | **high** | HIGH | W3 | 134-007 |
| 9 | ADR-034 Multi-Project Isolation | normal | NORMAL | W3 | — |
| 10 | Local observability Seviye 2 (full instrument + load report) | **high** | HIGH | W3 | 134-007 |
| 13 | Symlink scope bypass fix | low | NORMAL | W3 | 134-009 |
| 6 | `sprint-controller.ts` IPC + `sprint-finalizer` extract | **high** | HIGH | W4 | 134-005 |
| 14 | RETRO rubric detail injection | low | NORMAL | W4 | 134-006 |
| 15 | Brain-side self-audit gate (P3) | normal | HIGH | W5 | 134-006 |

### Product-Not-Service Lens Filter (ALL 15 TASKS PASSED ✓)

| Task | "Product mü güçlendiriyor, servis mi?" |
|------|----------------------------------------|
| 7 | ✓ Ürün — kullanıcının kendi projesinde task grafiği |
| 2 | ✓ Ürün — kullanıcı DIRECTIVES yazarken daha az hata |
| 3, 11, 12, 13 | ✓ Kalite iyileştirme, servis yok |
| 1 | ✓ Kullanıcı güvenini artırır, sunucumuz yok |
| 4 | ✓ Kullanıcı kendi token harcamasını görür |
| 5, 6 | ✓ Bakım kalitesi, kullanıcı etkisi 0 |
| 8 | ✓ **Product felsefesinin resmi doğum belgesi** |
| 9 | ✓ Multi-project = **tek kullanıcının birden fazla projesi** (SaaS multi-tenant DEĞİL) |
| 10 | ✓ **Data locality zorunlu** — `.deckent/metrics.jsonl` local, dış telemetri YOK |
| 14 | ✓ Kullanıcı sprint sonucunu daha iyi anlar |
| 15 | ✓ Kullanıcı makinesinde otomatik doğrulama |

**Yasak boyut referansı:** 0 task — SaaS, paywall, cloud-hosted, enterprise edition, SOC2, oncall kavramları yok.

---

## Section 2 — Dependency Graph + Wave Timing

### Task Graph

```
W1 (dep pipeline henüz canlı değil — CRITICAL task önce spawn)
    ┌─────────┬─────────┬─────────┬─────────┐
    ▼         ▼         ▼         ▼
[T-007]   [T-002]   [T-003]   [T-011]
dep pipe  scope     stale hb  gitignore
CRITICAL  parser    cleanup   cleanup

T-007 DONE → config.dependency_pipeline_enabled=true
           → respawnEligibleTasks() çağrılır

W2 (dep pipeline CANLI — blockedBy enforce)
    ┌─────────┬─────────┬─────────┬─────────┐
    ▼         ▼         ▼         ▼
[T-001]   [T-004]   [T-008]   [T-012]
honesty   token     ADR-033   mock audit

W3
    ┌─────────┬─────────┬─────────┬─────────┐
    ▼         ▼         ▼         ▼
[T-005]   [T-009]   [T-010]   [T-013]
reporter  ADR-034   observ    symlink
HIGH      multi     HIGH      (blkBy 9)

W4
    ┌─────────┬─────────┐
    ▼         ▼
[T-006]   [T-014]
controller retro
HIGH      rubric
(blkBy 5) (blkBy 6)

W5
    [T-015]
    self-audit gate
    (blkBy 6)
```

### Wave Timing Budget

| Wave | Tasks | Paralel | Süre | Kritik |
|------|-------|---------|------|--------|
| W1 | 4 | 4/4 | 20-30dk | T-007 (dep pipeline enabler) |
| W2 | 4 | 4/4 | 30-45dk | T-004 (token pipeline) |
| W3 | 4 | 4/4 | 60-90dk | T-005 + T-010 (iki HIGH) |
| W4 | 2 | 2/4 | 50-80dk | T-006 (HIGH) |
| W5 | 1 | 1/4 | 20-30dk | T-015 |
| **Deckent execution** | **15** | — | **180-275dk (3-4.5 saat)** | — |
| + brain eval/FIX/retro/cleanup | | | 30-60dk | |
| + Layer 3 verification | | | 30-60dk | |
| + commits + report sections | | | 30-45dk | |
| **Total session** | | | **5.5-7 saat** | |

### Critical Path: T-007 → T-005 → T-006 → T-015 (~190dk = 3.17 saat minimum)

Worker utilization ~50% — dep pipeline zorunluluğunun bedeli. Bu gözlem T-010 load raporu için dokümante edilecek.

### Two-Phase Spawn Mechanism (T-007 dependency resolution)

**Phase A — Dep-unaware spawn:**
- Brain `spawnWorkers` başladığında `config.dependency_pipeline_enabled=false`
- Yalnızca `priority=CRITICAL` ve `dependencies=[]` task'lar spawn → **sadece T-007** spawn

**Phase B — Dep-aware spawn:**
- T-007 DONE olur → `finalizeTaskResult` içinde brain `config.dependency_pipeline_enabled=true`
- `respawnEligibleTasks()` çağrılır → W1 kalanı + W2 eligible task'lar spawn

**Fallback (T-007 NO_GO):**
- 30 dakika timeout: T-007 bitmezse brain fallback sequential mode
- `config.dependency_pipeline_enabled=false` zorla kalır
- Kalan task'lar priority ordering ile sequential spawn (Senaryo A)

---

## Section 3 — Triple Dogfooding Contracts

### Dogfood #1 — Dependency Pipeline (T-007) Yönetir Kendi Grafiğini

**Parser contract:**
```
parseStructuredDirectives() → task[] where each task has:
  task.dependencies: string[]  // e.g. ["134-005"]
```

**Spawner contract:**
```
spawnWorkers() reads config.dependency_pipeline_enabled
  true  → respects task.dependencies (only spawn tasks where all deps.status === "DONE")
  false → legacy behavior (all spawn together)
```

**Scheduler contract:**
```
finalizeTaskResult(taskId) MUST call respawnEligibleTasks()
respawnEligibleTasks() emits metric("wave.transition", duration_ms, { from_wave, to_wave })
```

**Test contract (T-007 DIRECTIVES, 6+ test):**
1. Parse: `- Dependencies: 134-005, 134-007` → `task.dependencies: ["134-005", "134-007"]`
2. Spawn guard: T1.deps=[T2], T2 PENDING → T1 not spawned
3. Respawn trigger: T2 DONE → respawnEligibleTasks spawns T1
4. Circular detection: T1.deps=[T2], T2.deps=[T1] → `DependencyCycleError`
5. Fallback: `dependency_pipeline_enabled=false` → legacy behavior
6. Wave metric: each respawn emits `wave.transition` event

**Meta dogfooding:** T-006's `blockedBy: ["134-005"]` is enforced by THIS feature. If T-007 buggy → T-006 never spawns → sprint partial.

### Dogfood #2 — Observability Seviye 2 (T-010) Sprint'i Ölçer

**Instrument contract (`src/core/observability.ts`):**
```
metric(name: string, value: number, tags?: Record<string, string>)
trace<T>(operation: string, fn: () => Promise<T>): Promise<T>
structuredLog(level, message, context)
```

**Data locality contract (HARD):**
- ALL output → `.deckent/metrics.jsonl`
- ZERO network calls
- `telemetry_enabled: false` hard-coded
- Test: `net.connect` mock throws if called

**Instrument points (REQUIRED):**
- `spawnWorkers` (wave, count)
- `waitForResults` (per-task latency)
- `evaluateResult` (per-task)
- `loadConfig` (cache hit/miss — Sprint 133 T-004 cache dogfood)
- `claimTask` (file lock wait time)
- `heartbeat write/stale detection` (T-003 stale HB validation)
- `honestyCheck baseline compare` (T-001 integration)
- `waveTransition` (T-007 dep pipeline dogfood)

**Report contract:**
```
sprint finalize → generateLoadReport()
  input:  .deckent/metrics.jsonl
  output: docs/audits/sprint-134/load-test-report.md
  format: wave timeline, p50/p95/p99 per operation, file lock histogram
```

**Test contract (T-010 DIRECTIVES, 10+ test):**
1. `metric()` increment/decrement roundtrip
2. `trace()` span start/end + exception capture
3. `structuredLog()` JSON format, pino-compatible
4. `.deckent/metrics.jsonl` append-only, line-delimited JSON
5. Data locality: network mock → no calls asserted
6. `generateLoadReport()` happy path (sample jsonl → markdown)
7. Instrument integration: spawnWorkers mock → metric written
8. Wave transition metric (T-007 respawn event)
9. p50/p95/p99 calculation on 100 samples
10. File lock histogram bucket distribution

### Dogfood #3 — Brain Self-Audit Gate (T-015) Kendi Sprint'ini Denetler

**Gate contract:**
```
finalizeSprint() → runSelfAuditGate()
  runs:
    1. npx tsc --noEmit (timeout 90s)
    2. npx vitest run --reporter=basic (timeout 300s)
    3. Honesty violation count (from T-001 baseline)
    4. metrics.jsonl validity check (from T-010)

  returns: SelfAuditResult {
    tsc: { status: "PASS"|"FAIL", errors: string[] }
    vitest: { status: "PASS"|"FAIL", delta: { files, pass, fail, skipped } }
    honesty: { violations: number, flaggedTasks: string[] }
    observability: { metricsJsonlExists: boolean, lineCount: number }
    overallGate: "PASS" | "GATE_FAILURE"
  }
```

**Status propagation:**
- Gate FAIL → sprint status = `GO_WITH_GATE_FAILURE`
- Retro contains gate failure detail
- FINAL-EXECUTIVE-REPORT Section 12 shows status

**Test contract (T-015 DIRECTIVES, 5+ test):**
1. Happy path (all checks pass)
2. tsc fail → GATE_FAILURE + errors
3. vitest fail → GATE_FAILURE + delta
4. Honesty violation → GATE_FAILURE
5. metrics.jsonl missing → WARNING (not gate fail — T-010 could NO_GO independently; however Layer 4 Kriter 11 fails separately which does reduce the 17-criteria score by 1, moving sprint toward `GO_WITH_TECH_DEBT` threshold)

### Triple Dogfood Interaction

| | T-007 dep | T-010 obs | T-015 gate |
|---|---|---|---|
| **T-007 dep** | — | emits `wave.transition` | gate reads T-007 timing |
| **T-010 obs** | logs enable status | — | gate reads report |
| **T-015 gate** | spawned via dep pipeline (blkBy T-006) | reads observability | — |

**Döngüsel bağımlılık yok** — tek yön: T-007 → T-010 → T-015.

---

## Section 4 — Risk Register + Fallback

### Risk Table

| # | Risk | Prob | Impact | Mitigation | Owner |
|---|------|------|--------|------------|-------|
| R1 | T-007 dep pipeline bug → T-005/006/015 hiç spawn olmaz | HIGH | CRITICAL | (a) T-007 testlerinde "T2 blockedBy T1" senaryosu zorunlu. (b) 30dk timeout fallback sequential mode. (c) T-007 FIX phase priority 1. | Brain |
| R2 | T-005 (sprint-reporter split) test regression (10-50 test) | HIGH | HIGH | (a) Barrel re-export zorunlu (thin coordinator). (b) T-005 goNogo: `vitest run tests/orchestra/sprint-reporter*` 0 fail. (c) T-015 gate yakalar. | T-005 worker |
| R3 | T-006 (sprint-controller split) IPC kırılır | MEDIUM | HIGH | (a) Pure refactor, davranış değişmez. (b) `sprint-finalizer.ts` hook contract explicit (T-014/T-015 için). (c) `askBrain()` happy + fallback explicit test. | T-006 worker |
| R4 | T-010 node:perf_hooks cross-platform farklılık | LOW | MEDIUM | (a) `process.hrtime.bigint()` kullan. (b) Mock timer testlerde. | T-010 worker |
| R5 | T-015 `vitest run` 300s timeout aşar | MEDIUM | MEDIUM | (a) Baseline 91.6s, 3.3x margin. (b) Sprint 134 yeni ~50 test +5-10s. (c) Aşılırsa WARNING, not FAIL. | T-015 worker |
| R6 | 3 HIGH refactor + triple dogfooding → 8+ saat | HIGH | MEDIUM | (a) Kritik path 3.17 saat. (b) **5 saat Deckent execution** eşiği (session total değil): Wave 3 sonu 5 saati geçerse scope kesme → T-012 + T-013 Sprint 135'e defer. | Brain |
| R7 | T-001 honesty checker false positive | LOW | MEDIUM | (a) Regex tam eşleşme: `/pre-existing\|unrelated\|already failing/i`. (b) Baseline fark 0 → flag yok. | T-001 worker |
| R8 | T-009 gecikmesi T-013 symlink fix chain kırılır | MEDIUM | LOW | (a) T-009 pure doc, <30dk. (b) Kritik path T-013'i atlar. | Brain |
| R9 | Auto-archive Sprint 134 sonunda ilk canlı — bug riski | MEDIUM | LOW | (a) T-006 extraction sırasında `archiveDirectives()` explicit test. (b) Manuel fallback mv komutu. | T-006 + Brain |
| R10 | MCP eski cache | LOW | LOW | (a) Sprint 134 `src/mcp/` dokunmuyor. (b) Post-sprint `/mcp restart`. | Brain |
| R11 | W3 file lock çakışması (T-005 + T-010) | LOW | MEDIUM | (a) Scope overlap yok: T-005 = `sprint-reporter.ts` + 4 yeni, T-010 = `src/core/observability.ts`. (b) T-010 instrument satırları `sprint-controller.ts`'ye gider. | Brain |
| R12 | Scope parser Sprint 134 DIRECTIVES'ini parse edemez | LOW | CRITICAL | (a) T-002 kendi DIRECTIVES formatını self-test. (b) Tek scope entry kuralı. (c) `deckent plan --dry-run` Gate 0.2 zorunlu. | T-002 + Brain |

### Fallback Scenarios

**Senaryo A — T-007 FAIL:**
- `config.dependency_pipeline_enabled=false` zorla
- Sequential spawn, priority ordering
- +60-90dk süre artışı
- Sprint status: `GO_WITH_TECH_DEBT`

**Senaryo B — T-005 test regression:**
- T-006 spawn olmaz (dep pipeline enforce)
- FIX phase: T-005 ikinci deneme, barrel tamamla
- T-006 respawn
- +30-45dk

**Senaryo C — 6 saat aşımı:**
- T-012 + T-013 → Sprint 135 defer
- 15 → 13 task
- Sprint status: `GO_WITH_TECH_DEBT` (2 LOW defer)

### Pre-Sprint Mitigation Checklist

1. [ ] R12: `deckent plan --dry-run` 15 task doğru parse ediyor
2. [ ] R1: T-007 DIRECTIVES'inde two-phase spawn + 30dk timeout fallback detay
3. [ ] R2+R3: T-005 ve T-006 DIRECTIVES'inde barrel re-export pattern explicit
4. [ ] R6: Scope kesme eşiği 5:00:00 open yazılı
5. [ ] R9: Sprint başında `archiveDirectives('test-sprint-999')` dry-run manuel

---

## Section 5 — Post-Sprint Success Criteria (17 kriter, 6 katman)

### Layer 1 — Deckent Self-Evaluation
1. ≥13 task DONE (15'ten; 2 LOW scope kesmesi ile düşebilir)
2. 4 HIGH effort (T-007, T-005, T-006, T-010) hiçbiri NO_GO olmamalı
3. Brain evaluateWithRubric ortalama ≥75/100

### Layer 2 — Technical Verification
4. `npx tsc --noEmit` → 0 error
5. `npx vitest run` → 0 fail, files ≥500, pass ≥12372 + Sprint 134 yeni testler (min +43 test: T-001×6, T-002×8, T-003×3, T-004×5, T-007×6, T-010×10, T-015×5)
6. Dashboard test regression = 0

### Layer 3 — Manual Verification (Sprint 133 pattern)
7. Per-task grep kanıtı — 15/15 task DIRECTIVES "Kanıt:" satırları yeşil
8. Scope compliance: `git diff --stat` boundary violation = 0
9. **Auto-archive canlı doğrulama:** `ls .brain/archive/DIRECTIVES-sprint-134.md` exists; `DIRECTIVES.md` placeholder Sprint 135 için hazır

### Layer 4 — Triple Dogfooding Verification
10. T-007: `.deckent/metrics.jsonl` contains `wave.transition` events W1→W2, W2→W3, W3→W4, W4→W5 (**4 transitions min** for 5 waves)
11. T-010: `docs/audits/sprint-134/load-test-report.md` exists, contains p50/p95/p99 + critical path analysis + file lock histogram
12. T-015: `SelfAuditResult.overallGate === "PASS"`; retro contains gate result

### Layer 5 — Product Vision Verification
13. ADR-033 `.brain/DECISIONS.md`'de ≥100 satır, 4 dokunulamaz prensip explicit
14. ADR-034 `.brain/DECISIONS.md`'de ≥100 satır, "multi-project ≠ SaaS multi-tenant" ayırımı
15. `docs/vision/roadmap.md` ≥200 satır, Sprint 134-145 yol haritası
16. **Yasak boyut manuel review:** reviewer onaylar — ADR'lar "yasak bağlamında" SaaS referansı allow, pozitif önerme yasak. `grep -i "saas|cloud-hosted|paywall"` başlangıç filtresi, manuel review final karar

### Layer 6 — Kur-Çalıştır Readiness Score
17. Enterprise-Readiness Score ≥3.9/5 (Sprint 133: 3.6, +0.3 hedef)

### Threshold (17 kriter toplam, non-overlapping)
- **GO:** 15-17 kriter
- **GO_WITH_TECH_DEBT:** 13-14 kriter
- **NO_GO:** ≤12 kriter

### Mandatory (defer EDİLEMEZ)
- T-008 (ADR-033 Product Vision — sprint kimliği)
- T-009 (ADR-034 Multi-Project Isolation — sprint kimliği)
- T-005 (sprint-reporter split — 2 sprint deferred, üçüncüye kayamaz)

### Cascade Defer Priority (Sprint 135'e sırayla)
1. T-012 mock audit (en güvenli)
2. T-013 symlink scope bypass
3. T-014 retro rubric detail (T-015 yine çalışır)
4. T-007 dep pipeline (Sprint 135'te tam re-attempt)
5. T-006 sprint-controller split (tek başına defer edilebilir)

---

## Section 6 — Deliverables

### Code
- `src/orchestra/sprint-metrics.ts` (new, T-005)
- `src/orchestra/sprint-retro-writer.ts` (new, T-005)
- `src/orchestra/sprint-docs-updater.ts` (new, T-005)
- `src/orchestra/ci-reporter.ts` (new, T-005)
- `src/orchestra/ipc-registry.ts` (new, T-006)
- `src/orchestra/sprint-finalizer.ts` (new, T-006)
- `src/orchestra/baseline-tracker.ts` (new, T-001)
- `src/core/observability.ts` (new, T-010)
- Task dep pipeline integration (T-007: parser, spawner, scheduler)
- Brain self-audit gate extension (T-015 → sprint-finalizer.ts)

### Documentation
- `.brain/DECISIONS.md` +ADR-033, +ADR-034 (~200 new lines total)
- `docs/vision/roadmap.md` (new, ≥200 lines)
- `docs/design/multi-project-isolation.md` (new, ≥250 lines)
- `docs/audits/sprint-134/load-test-report.md` (T-010 auto-generated)
- `docs/audits/mock-safety-audit.md` (T-012)
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 12 (Sprint 134 status)
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 13 (Sprint 134 post-sprint retro)
- `.brain/archive/DIRECTIVES-sprint-134.md` (auto-archive first live output)
- `DIRECTIVES.md` → Sprint 135 placeholder (auto-archive; format: title "DIRECTIVES — (Sprint 135 için hazırlanıyor)" + Sprint 134 outcome summary + reference link to archived directives)

### Data
- `.deckent/sprint-134-baseline.json` (T-001 honesty baseline)
- `.deckent/metrics.jsonl` (T-010 live data)
- T-015 `SelfAuditResult` embedded in retro

### Commits (4-5 strategy)
1. `feat: Sprint 134 — Triple dogfooding + god object split + product vision ADRs`
2. `fix: Sprint 134 Layer-3 manual integration fixes` (if needed)
3. `docs: Update FINAL-EXECUTIVE-REPORT with Sprint 134 status (Section 12)`
4. `docs: Add Sprint 134 Post-Sprint Retrospective (Section 13)`
5. `docs: Add load test report + mock safety audit + vision roadmap` (optional)

---

## Section 7 — Sprint 134 Runtime Configuration

- `max_workers=4` (hard limit per `feedback_max_workers.md`)
- `brain_planning: structured` (deterministic DIRECTIVES parse)
- `worker_tier: premium` (opus default)
- `dependency_pipeline_enabled: true` (T-007 enforces; Phase A bootstrap override)
- `verify_loop: active` (tsc + vitest per worker)
- `telemetry_enabled: false` (hard-coded, data locality requirement)
- `auto_archive_directives: true` (T-006 + Sprint 133 T-010 inheritance)

### External Monitoring (at `deckent start` time)
3 parallel sub-agents dispatched in a single message:
- **Watchdog** — heartbeat + worker liveness, 15s sync sleep chain
- **Verifier** — tsc + vitest sample check, 45s sync sleep chain
- **Shell Watchdog** — disk I/O + lock file check, 60s sync sleep chain

Pattern validated: `feedback_background_agent_polling.md` — sync sleep chain works, `run_in_background=true + wait` kills framework.

---

## Section 8 — Post-Approval Handoff

After user approves this spec:
1. `writing-plans` skill invoked → implementation plan under `docs/superpowers/plans/`
2. Finalized DIRECTIVES.md written (replaces current DIRECTIVES.md from Sprint 133)
3. `deckent plan --dry-run` for Gate 0.2
4. `deckent start` + 3-agent external monitoring dispatch
5. Sprint runs ~5.5-7 hours (Deckent + Layer 3 + reporting)
6. Post-sprint: commits, FINAL-EXECUTIVE-REPORT updates, memory sync

---

*Spec finalized. Not a draft.*
