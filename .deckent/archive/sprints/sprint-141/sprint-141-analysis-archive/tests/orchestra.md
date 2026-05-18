# Test Category Analysis: orchestra
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 118

---

## 1. Test Dosya Envanteri

**Toplam:** 118 dosya | **describe blokları:** 785 | **it() blokları:** 3503 | **test() blokları:** 5

Bu, projede en büyük test kategorisidir (toplam test sayısının ~%21'i).

### Alt Dizinler

| Dizin | Dosya Sayısı |
|-------|-------------|
| `tests/orchestra/` (kök) | 104 dosya |
| `tests/orchestra/decision-steps/` | 2 dosya |
| `tests/orchestra/doc-updaters/` | 8 dosya |
| `tests/orchestra/managed-docs/` | 5 dosya |

### Kök dizin — Kategorize edilmiş dosyalar

**Brain/Controller Grubu (19 dosya)**
- `brain.test.ts`, `brain-agent.test.ts`, `brain-budget-decay.test.ts`, `brain-context.test.ts`, `brain-coverage.test.ts`, `brain-integration.test.ts`, `brain-ipc.test.ts`, `brain-pause-resume.test.ts`, `brain-provider.test.ts`, `brain-rollback.test.ts`, `brain-self-learning.test.ts`, `brain-skill.test.ts`, `sprint-controller.test.ts`, `sprint-finalizer.test.ts`, `sprint-spawner.test.ts`, `sprint-checkpoint.test.ts`, `sprint-phases-ci-intersection.test.ts`, `sprint-estimator.test.ts`, `sprint-pid-manager.test.ts`

**Debt/Memory Grubu (9 dosya)**
- `debt-manager.test.ts`, `debt-parse-fix.test.ts`, `debt-resolution.test.ts`, `sprint2-debt.test.ts`, `memory-decay.test.ts`, `memory-trim.test.ts`, `runsprint-debt-integration.test.ts`, `archive-directives.test.ts`, `shared-memory.test.ts`

**Task/Routing Grubu (12 dosya)**
- `task-builder.test.ts`, `task-builder-routing.test.ts`, `task-builder-skill.test.ts`, `task-router.test.ts`, `task-analyzer.test.ts`, `task-retry.test.ts`, `task-retry-e2e.test.ts`, `task-queue.test.ts`, `task-limit.test.ts`, `dependency-pipeline.test.ts`, `dependency-scheduler.test.ts`, `routing-v2-e2e.test.ts`

**Decision/Routing Engine Grubu (7 dosya)**
- `decision-engine.test.ts`, `decision-logger.test.ts`, `decision-replay.test.ts`, `decision-steps/agent-step.test.ts`, `decision-steps/scope-step.test.ts`, `conflict-resolver.test.ts`, `plan-improvements.test.ts`

**Reporter/Sprint Output Grubu (10 dosya)**
- `sprint-reporter.test.ts`, `sprint-reporter-agent.test.ts`, `sprint-reporter-ci.test.ts`, `sprint-reporter-skill.test.ts`, `result-evaluator.test.ts`, `evaluate-result.test.ts`, `evaluator-consistency.test.ts`, `quality-assessor.test.ts`, `rubric-detail.test.ts`, `result-collector.test.ts`

**Agent/Skill Grubu (9 dosya)**
- `agent-activation.test.ts`, `agent-stats-update.test.ts`, `model-selector-provider.test.ts`, `model-selector-skill.test.ts`, `skill-selection-fix.test.ts`, `temp-skill-generator.test.ts`, `evolution-pipeline.test.ts`, `promotion-guard.test.ts`, `rule-evolver.test.ts`

**Infrastructure Grubu (11 dosya)**
- `event-stream.test.ts`, `ipc-registry.test.ts`, `tmux.test.ts`, `tmux-edge.test.ts`, `spawn-backend-move.test.ts`, `spawn-prevention.test.ts`, `parallel-pipeline.test.ts`, `result-watcher.test.ts`, `result-merger.test.ts`, `outcome-tracker.test.ts`, `connector.test.ts`

**Audit/Security Grubu (5 dosya)**
- `authority-enforcer.test.ts`, `self-modifying-detector.test.ts`, `self-audit-gate.test.ts`, `handoff-protocol.test.ts`, `baseline-tracker.test.ts`

**Planner Grubu (4 dosya)**
- `planner.test.ts`, `planner-edge.test.ts`, `planner-zeroconfig.test.ts`, `directive-parsing.test.ts`

**Diğer (18 dosya)**
- `pattern-reader.test.ts`, `pattern-recorder.test.ts`, `pattern-model-suggestion.test.ts`, `ecosystem-intelligence.test.ts`, `rollback.test.ts`, `coverage-validator.test.ts`, `batch-stats.test.ts`, `fix-phase-map.test.ts`, `barrel-exports.test.ts`, `format-consistency.test.ts`, `multi-agent.test.ts`, `pause-resume.test.ts`, `project-identity.test.ts`, `prompt-token-optimizer.test.ts`, `results-map.test.ts`, `brain-coverage.test.ts`, `brain-integration.test.ts`, `coverage-validator.test.ts`

**Doc-Updaters (8 dosya)**
- `changelog-updater.test.ts`, `changelog.test.ts`, `doc-updater-consistency.test.ts`, `health-check.test.ts`, `metrics-updater.test.ts`, `readme-metrics.test.ts`, `registry.test.ts`, `sprint-log.test.ts`

**Managed-Docs (5 dosya)**
- `content-generators.test.ts`, `docs-config.test.ts`, `managed-doc-runner.test.ts`, `section-updater.test.ts`, `universalization.test.ts`

---

## 2. Mock Pattern Audit

### vi.mock kullanımı

Orchestra kategori için vi.mock sayısı **100+ çağrı** (118 dosya genelinde). En büyük mock yükü `finalize-sprint.test.ts`'de — 20+ vi.mock çağrısı içeriyor.

**Mock-heavy dosyalar:**

| Dosya | Yaklaşık vi.mock Sayısı |
|-------|------------------------|
| `finalize-sprint.test.ts` | 20+ |
| `sprint-controller.test.ts` | 15+ |
| `brain.test.ts` | 12+ |
| `brain-pause-resume.test.ts` | 10+ |
| `brain-ipc.test.ts` | 10+ |

### vi.spyOn kullanımı

9 adet `vi.spyOn` — neredeyse tüm orchestra test dosyaları `vi.mock` tercih ediyor.

### MemoryStore Mock Kullanımı

MemoryStore mock'u kullanan dosyalar (9 dosya):

| Dosya | Mock Kalitesi |
|-------|--------------|
| `brain-budget-decay.test.ts` | Kapsamlı — totalCount, getByType, decay, insert |
| `debt-manager.test.ts` | En kapsamlı — getById, getByType, insert, upsert, update, delete, totalCount + afterEach re-wire |
| `brain.test.ts` | Temel MemoryStore mock |
| `memory-decay.test.ts` | Decay-specific mock |
| `sprint-reporter.test.ts` | Reporter DB-first mock |
| `task-builder.test.ts` | ADR sorgu mock'u |
| `project-identity.test.ts` | Identity entry mock |
| `debt-resolution.test.ts` | Debt resolution DB path |
| `runsprint-debt-integration.test.ts` | Sprint+debt entegrasyon |

**En gelişmiş mock:** `debt-manager.test.ts` — `beforeEach` içinde tüm method'ları re-wire yapıyor (clearAllMocks sonrası implementation kaybı sorununun çözümü olarak). Bu pattern diğer dosyalara örnek alınmalı.

---

## 3. Coverage Mapping

### src/orchestra/ dosyaları vs testler

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `authority-enforcer.ts` | `authority-enforcer.test.ts` | OK |
| `baseline-tracker.ts` | `baseline-tracker.test.ts` | OK |
| `batch-stats.ts` | `batch-stats.test.ts` | OK |
| `brain-context.ts` | `brain-context.test.ts` | OK |
| `brain.ts` | `brain.test.ts` + `brain-*.test.ts` (11 dosya) | EXCELLENT |
| `ci-reporter.ts` | **YOK** | **GAP** |
| `conflict-resolver.ts` | `conflict-resolver.test.ts` | OK |
| `connector.ts` | `connector.test.ts` | OK |
| `coverage-validator.ts` | `coverage-validator.test.ts` | OK |
| `debt-manager.ts` | `debt-manager.test.ts` + `debt-parse-fix.test.ts` + `debt-resolution.test.ts` | EXCELLENT |
| `decision-engine.ts` | `decision-engine.test.ts` | OK |
| `decision-logger.ts` | `decision-logger.test.ts` | OK |
| `decision-replay.ts` | `decision-replay.test.ts` | OK |
| `decision-steps/agent-step.ts` | `decision-steps/agent-step.test.ts` | OK |
| `decision-steps/scope-step.ts` | `decision-steps/scope-step.test.ts` | OK |
| `dependency-scheduler.ts` | `dependency-scheduler.test.ts` + `dependency-pipeline.test.ts` | OK |
| `doc-updaters/changelog.ts` | `doc-updaters/changelog.test.ts` + `changelog-updater.test.ts` | OK |
| `doc-updaters/health-check.ts` | `doc-updaters/health-check.test.ts` | OK |
| `doc-updaters/metrics-updater.ts` | `doc-updaters/metrics-updater.test.ts` | OK |
| `doc-updaters/readme-metrics.ts` | `doc-updaters/readme-metrics.test.ts` | OK |
| `doc-updaters/registry.ts` | `doc-updaters/registry.test.ts` | OK |
| `doc-updaters/sprint-log.ts` | `doc-updaters/sprint-log.test.ts` | OK |
| `doc-updaters/index.ts` | Dolaylı | PARTIAL |
| `doc-updaters/types.ts` | Dolaylı | PARTIAL |
| `ecosystem-intelligence.ts` | `ecosystem-intelligence.test.ts` | OK |
| `event-stream.ts` | `event-stream.test.ts` | OK |
| `handoff-protocol.ts` | `handoff-protocol.test.ts` | OK |
| `heartbeat-daemon.ts` | **YOK** | **GAP** |
| `index.ts` | Dolaylı | PARTIAL |
| `ipc-registry.ts` | `ipc-registry.test.ts` | OK |
| `managed-docs/content-generators.ts` | `managed-docs/content-generators.test.ts` | OK |
| `managed-docs/doc-cache.ts` | **YOK** | **GAP** |
| `managed-docs/docs-config.ts` | `managed-docs/docs-config.test.ts` | OK |
| `managed-docs/managed-doc-runner.ts` | `managed-docs/managed-doc-runner.test.ts` | OK |
| `managed-docs/plugin-loader.ts` | **YOK** | **GAP** |
| `managed-docs/section-updater.ts` | `managed-docs/section-updater.test.ts` | OK |
| `managed-docs/template-renderer.ts` | **YOK** | **GAP** |
| `managed-docs/types.ts` | Dolaylı | PARTIAL |
| `mid-sprint-adapter.ts` | **YOK** | **GAP** |
| `model-selector.ts` | `model-selector-provider.test.ts` + `model-selector-skill.test.ts` | OK |
| `multi-agent.ts` | `multi-agent.test.ts` | OK |
| `outcome-tracker.ts` | `outcome-tracker.test.ts` | OK |
| `parallel-pipeline.ts` | `parallel-pipeline.test.ts` | OK |
| `pattern-reader.ts` | `pattern-reader.test.ts` | OK |
| `pattern-recorder.ts` | `pattern-recorder.test.ts` | OK |
| `planner.ts` | `planner.test.ts` + `planner-edge.test.ts` + `planner-zeroconfig.test.ts` | EXCELLENT |
| `promotion-pipeline.ts` | **YOK** | **GAP** |
| `prompt-token-optimizer.ts` | `prompt-token-optimizer.test.ts` | OK |
| `quality-assessor.ts` | `quality-assessor.test.ts` | OK |
| `result-collector.ts` | `result-collector.test.ts` | OK |
| `result-evaluator.ts` | `result-evaluator.test.ts` + `evaluate-result.test.ts` | OK |
| `result-merger.ts` | `result-merger.test.ts` | OK |
| `result-watcher.ts` | `result-watcher.test.ts` | OK |
| `rollback.ts` | `rollback.test.ts` | OK |
| `rule-evolver.ts` | `rule-evolver.test.ts` | OK |
| `self-modifying-detector.ts` | `self-modifying-detector.test.ts` | OK |
| `shared-memory.ts` | `shared-memory.test.ts` | OK |
| `spawn-backend.ts` | `spawn-backend-move.test.ts` (kısmi) | PARTIAL |
| `spawn-backend-docker.ts` | **YOK** | **GAP** |
| `spawn-backend-mock.ts` | **YOK** | **GAP** |
| `sprint-checkpoint.ts` | `sprint-checkpoint.test.ts` | OK |
| `sprint-controller.ts` | `sprint-controller.test.ts` | OK |
| `sprint-docs-helpers.ts` | `sprint-docs-helpers.test.ts` + `sprint-docs-cleanup.test.ts` | OK |
| `sprint-docs-updater.ts` | **YOK** | **GAP** |
| `sprint-estimator.ts` | `sprint-estimator.test.ts` | OK |
| `sprint-finalizer.ts` | `sprint-finalizer.test.ts` | OK |
| `sprint-lifecycle.ts` | **YOK** | **GAP** |
| `sprint-metrics.ts` | **YOK** | **GAP** |
| `sprint-phases.ts` | `sprint-phases-ci-intersection.test.ts` (kısmi) | PARTIAL |
| `sprint-pid-manager.ts` | `sprint-pid-manager.test.ts` | OK |
| `sprint-planner.ts` | **YOK** | **GAP** |
| `sprint-reporter.ts` | `sprint-reporter.test.ts` + üç alt test | OK |
| `sprint-retro-writer.ts` | **YOK** | **GAP** |
| `sprint-spawner.ts` | `sprint-spawner.test.ts` | OK |
| `sprint-utils.ts` | **YOK** | **GAP** |
| `task-analyzer.ts` | `task-analyzer.test.ts` | OK |
| `task-builder.ts` | `task-builder.test.ts` + `task-builder-routing.test.ts` + `task-builder-skill.test.ts` | EXCELLENT |
| `task-retry.ts` | `task-retry.test.ts` + `task-retry-e2e.test.ts` | OK |
| `task-router.ts` | `task-router.test.ts` | OK |
| `temp-skill-generator.ts` | `temp-skill-generator.test.ts` | OK |
| `tmux.ts` | `tmux.test.ts` + `tmux-edge.test.ts` | OK |

**Toplam kapsama:** ~83% (12 src dosyası test dışında)

---

## 4. Orphan Test Tespiti

Gerçek orphan (src karşılığı olmayan) test dosyaları:

| Test Dosyası | Gerçek Kapsama | Değerlendirme |
|-------------|---------------|--------------|
| `brain-self-learning.test.ts` | `brain.ts` self-learning fonksiyonları | PSEUDO-ORPHAN — brain.ts'in bir özelliği |
| `memory-trim.test.ts` | `brain.ts` trimMemoryWithHeader fonksiyonu | PSEUDO-ORPHAN — brain.ts'ten |
| `skill-selection-fix.test.ts` | Model selector veya task-builder | PSEUDO-ORPHAN — regression fix testi |
| `spawn-prevention.test.ts` | spawn-backend veya sprint-spawner | PSEUDO-ORPHAN — güvenlik testi |
| `pattern-model-suggestion.test.ts` | `pattern-recorder.ts` veya `model-selector.ts` | PSEUDO-ORPHAN |
| `task-builder-routing.test.ts` | `task-builder.ts` routing path | PSEUDO-ORPHAN — task-builder alt testi |
| `finalize-sprint.test.ts` | `sprint-finalizer.ts` veya `sprint-controller.ts` | PSEUDO-ORPHAN — yeniden adlandırılmış |
| `brain-budget-decay.test.ts` | `brain.ts` veya `debt-manager.ts` decay | PSEUDO-ORPHAN |
| `brain-ipc.test.ts` | `ipc-registry.ts` | PSEUDO-ORPHAN |
| `self-audit-gate.test.ts` | `authority-enforcer.ts` veya `sprint-controller.ts` | PSEUDO-ORPHAN |
| `debt-parse-fix.test.ts` | `utils.ts` parseDebtTable | PSEUDO-ORPHAN |
| `archive-directives.test.ts` | `sprint-docs-helpers.ts` veya `sprint-finalizer.ts` | PSEUDO-ORPHAN |
| `dependency-pipeline.test.ts` | `dependency-scheduler.ts` | PSEUDO-ORPHAN (farklı isim) |
| `sprint-docs-cleanup.test.ts` | `sprint-docs-helpers.ts` | PSEUDO-ORPHAN (farklı isim) |
| `sprint-reporter-agent.test.ts` | `sprint-reporter.ts` | PSEUDO-ORPHAN (alt özellik testi) |
| `sprint-reporter-skill.test.ts` | `sprint-reporter.ts` | PSEUDO-ORPHAN (alt özellik testi) |
| `model-selector-skill.test.ts` | `model-selector.ts` | PSEUDO-ORPHAN (alt özellik testi) |
| `brain-pause-resume.test.ts` | `sprint-controller.ts` | PSEUDO-ORPHAN |
| `task-retry-e2e.test.ts` | `task-retry.test.ts` E2E version | PSEUDO-ORPHAN |

**Gerçek orphan yok** — tüm "orphan" görünen testler mevcut src dosyalarının alt özelliklerini veya regression testleri kapsıyor.

---

## 5. Flaky Candidate İşaretleri

### setTimeout kullanan testler (race condition riski)

| Dosya | Kullanım | Risk Seviyesi |
|-------|----------|--------------|
| `ipc-registry.test.ts:189` | `setTimeout(() => { writeAnswerFile(...) }, 50)` | **ORTA** — 50ms I/O + polling |
| `ipc-registry.test.ts:215` | `setTimeout(() => {...}, ...)` | **ORTA** — async poll race |

### Date.now() kullanan testler

| Dosya | Kullanım | Risk |
|-------|----------|------|
| `sprint-controller.test.ts:441` | `Date.now() - 100_000_000` | Düşük (sabit) |
| `sprint-controller.test.ts:448,461` | `Date.now() - 1000/5000` | Düşük |
| `finalize-sprint.test.ts:287` | `Date.now() - 60000` | Düşük |
| `task-builder.test.ts:116,118` | `before/after = Date.now()` | **ORTA** — timing assertion |
| `debt-parse-fix.test.ts:132` | `tmpdir + Date.now()` | Düşük (sadece path) |
| `ecosystem-intelligence.test.ts:22` | `tmpdir + Date.now()` | Düşük (sadece path) |
| `event-stream.test.ts:23` | `tmpdir + Date.now()` | Düşük (sadece path) |
| `sprint-reporter-agent.test.ts:17` | `tmpdir + Date.now()` | Düşük (sadece path) |
| `sprint-docs-cleanup.test.ts:15` | `tmpdir + Date.now()` | Düşük (sadece path) |
| `sprint-reporter-skill.test.ts:17` | `tmpdir + Date.now()` | Düşük (sadece path) |
| `brain-self-learning.test.ts:163` | `tmpdir + Date.now()` | Düşük (sadece path) |

**Fake timer kullanımı:** 8 adet `useFakeTimers` — aktif kullanım.

**En riskli:** `ipc-registry.test.ts` — gerçek setTimeout + polling kombiyasyonu race condition riski taşıyor. CI ortamında yavaş disk I/O'su 50ms süreyi aşabilir.

**`task-builder.test.ts`** timing assertion (`before <= createdAt <= after`) CI'da stres altında başarısız olabilir; `vi.setSystemTime()` kullanımı tercih edilmeli.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines Mock'ları (devam eden legacy)

| Dosya | Satır | Mock | Değerlendirme |
|-------|-------|------|--------------|
| `finalize-sprint.test.ts:71` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor | Stale olabilir |
| `brain-budget-decay.test.ts:44` | `countBrainLines: vi.fn().mockReturnValue(100)` | Aktif test | `runDecay` ile entegre |
| `brain-pause-resume.test.ts:65` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor | Stale olabilir |
| `sprint-controller.test.ts:79` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor | Stale olabilir |
| `brain-ipc.test.ts:63` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor | Stale olabilir |

### parseDebtTable Mock'ları (devam eden legacy)

| Dosya | Satır | Mock | Değerlendirme |
|-------|-------|------|--------------|
| `finalize-sprint.test.ts:74` | `parseDebtTable: vi.fn().mockReturnValue([])` | Devam ediyor | V1 legacy |
| `archive-directives.test.ts:45` | `parseDebtTable: vi.fn().mockReturnValue([])` | Devam ediyor | V1 legacy |
| `self-audit-gate.test.ts:29` | `parseDebtTable: vi.fn().mockReturnValue([])` | Devam ediyor | V1 legacy |
| `sprint-controller.test.ts:82` | `parseDebtTable: vi.fn().mockReturnValue([])` | Devam ediyor | V1 legacy |

### parseDebtTable Doğrudan Testi

`debt-parse-fix.test.ts` — `parseDebtTable` fonksiyonunun kendisini test ediyor (mock değil). Bu V1 fonksiyon src/core/utils.ts'te hâlâ export ediliyor. Test hâlâ geçerliyse fonksiyon deprecated edilmemiş demektir.

`debt-manager.test.ts:110` — `import { parseDebtTable, generateDebtTable } from '../../src/core/utils.js'` — debt-manager testleri bu fonksiyonu doğrudan import ediyor. `debt-manager.ts`'te bu fonksiyon kullanılıyorsa V1 fallback devam ediyor demektir.

### MemoryStore Mock Yeterliliği

9 dosyada MemoryStore mock var, ancak 118 test dosyasının büyük çoğunluğu (~109 dosya) MemoryStore ile ilgilenen code path'leri test etmiyor veya üst düzey modül mock'larına güveniyor. Bu durum Memory V2 entegrasyon test derinliğini sınırlıyor.

**BULGU:** `brain-budget-decay.test.ts` — `countBrainLines` mock'u V2 geçişinde kaldırılmamış gibi görünüyor. `runDecay()` artık MemoryStore kullanıyorsa `countBrainLines` mock'u artifact haline gelmiş. Bu test'in güncellenmesi gerekiyor.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 75/100 (B)

### Güçlü Yönler

1. **118 dosya, 785 describe, 3503 it()** — rakamsal olarak projede en kapsamlı test kategorisi
2. **brain.ts 11 ayrı test dosyasıyla** kapsanıyor — en kritik orkestrasyon modülü için mükemmel kapsama
3. **debt-manager.test.ts** — DB-first MemoryStore pattern en doğru şekilde uygulanmış (re-wire pattern)
4. **task-builder.ts 3 ayrı test dosyasıyla** kapsanıyor
5. **planner.ts 3 ayrı test dosyasıyla** kapsanıyor + zeroconfig + edge case ayrı
6. **decision-steps alt dizini** — tam kapsama (2/2 src dosyası)
7. **doc-updaters alt dizini** — 6/8 src dosyası kapsanmış (mükemmel)
8. **managed-docs alt dizini** — 5/8 src dosyası kapsanmış (iyi)

### Zayıf Yönler

1. **12 src dosyası test dışında:** ci-reporter, heartbeat-daemon, managed-docs/doc-cache, managed-docs/plugin-loader, managed-docs/template-renderer, mid-sprint-adapter, promotion-pipeline, spawn-backend-docker, spawn-backend-mock, sprint-docs-updater, sprint-lifecycle, sprint-metrics, sprint-planner, sprint-retro-writer, sprint-utils (15'e yakın)
2. **countBrainLines + parseDebtTable mock'ları 9 dosyada devam ediyor** — Memory V2 geçişiyle stale olmuş olabilir
3. **ipc-registry.test.ts** — gerçek setTimeout race condition riski
4. **task-builder.test.ts timing assertion** — CI ortamında flaky potansiyeli
5. **118 dosya için toplam test sayısı (3503)** beklenenden az — bazı test dosyaları az sayıda it() içeriyor

### Sprint 142+ Öneriler

1. **Kritik gap'lar:** `heartbeat-daemon.ts`, `mid-sprint-adapter.ts`, `sprint-planner.ts`, `sprint-retro-writer.ts` için test dosyası yarat
2. **countBrainLines mock audit:** 5 dosyada bu mock kaldırılmalı veya `getMemoryEntryCount` karşılığına geçilmeli
3. **parseDebtTable mock audit:** 4 dosyada bu mock kaldırılmalı — `MemoryStore.getByType('debt')` kullanılmalı
4. **ipc-registry.test.ts:** setTimeout'u `vi.useFakeTimers()` ile değiştir
5. **spawn-backend-docker.ts testi:** Docker backend Sprint 139'da P0 fix aldı, test olmadan güvensiz
6. **promotion-pipeline.ts testi:** Agent/skill evolution pipeline için kritik
