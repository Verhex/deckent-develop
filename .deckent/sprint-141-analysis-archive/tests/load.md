# Test Category Analysis: load
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 2 (1 test + 1 bench)

---

## 1. Test Dosya Envanteri

| Dosya | Tür | describe Blokları | it/bench Blokları | LoC |
|-------|-----|-------------------|-------------------|-----|
| load-harness.test.ts | vitest test | 5 | 8 it | 479 |
| hot-paths.bench.ts | vitest bench | 5 | 8 bench | 237 |

**Toplam:** 2 dosya | 10 describe + 3 bench describe | 8 it + 8 bench

**Önemli Not:** `hot-paths.bench.ts` dosyası `vitest bench` mode ile çalışır. `vitest.config.ts` include pattern'ı `tests/**/*.test.ts` olduğundan, `.bench.ts` dosyası **normal test run'a dahil edilmiyor**. Ayrıca hiçbir `package.json` script'i bench modunu tetiklemiyor. Bu dosya manuel çalıştırılmak üzere tasarlanmış: `npx vitest bench tests/load/hot-paths.bench.ts`

### load-harness.test.ts Describe Grupları

```
describe('Load Test: loadConfig() Performance')           — 2 it (P50/P95/P99)
describe('Load Test: Task Claim/Release Simulation')      — 1 it (50 iter)
describe('Load Test: Map<taskId, TaskResult> vs Array')   — 2 it (lookup + construction)
describe('Load Test: Plugin Sandbox AST Scan')            — 2 it (normal + suspicious)
describe('Load Test: Summary')                            — 1 it (aggregate output)
```

### hot-paths.bench.ts Bench Grupları

```
describe('Hot Path: Result Lookup')            — 3 bench (Map.get, Array.find, buildResultsMap)
describe('Hot Path: evaluateResult mock')      — 1 bench (200 tasks mock)
describe('Hot Path: spawnWorkers mock')        — 1 bench (50 task prompt build)
describe('Hot Path: waitForResults mock')      — 2 bench (JSON parse, file check+parse)
describe('Hot Path: deepMerge simulation')     — 3 bench (deepMerge, structuredClone, JSON clone)
```

---

## 2. Mock Pattern Audit

**load-harness.test.ts:**
- `vi` import var (`import { ..., vi } from 'vitest'`) ama **hiç `vi.mock()` veya `vi.spyOn()` kullanılmıyor**.
- Test; gerçek `loadConfig()`, gerçek `buildResultsMap()`, gerçek `SkillSandbox.validateSkillSafety()` çağırıyor.
- Tüm src bağımlılıkları **dynamic import** ile çekiliyor: `await import('../../src/core/config.js')` vb.

**hot-paths.bench.ts:**
- Mock yok. Mock data factory fonksiyonları (`createMockTaskResult`, `createMockTask`) ile sentetik veri üretimi.
- Src modülü import yok — benchmarklar saf in-memory operasyonlar (Map lookup, JSON parse, deepMerge simülasyonu).

**MemoryStore:** 0 referans.
**countBrainLines / parseDebtTable:** 0 referans.
**vi.mock:** 0 referans.
**vi.spyOn:** 0 referans.

---

## 3. Coverage Mapping

### load-harness.test.ts Egzersiz Edilen Src Modülleri

| Senaryo | Src Modülü | Dynamic Import? |
|---------|------------|-----------------|
| loadConfig() × 100 | src/core/config.ts | Evet |
| loadConfig() force reload × 20 | src/core/config.ts | Evet |
| Task Claim/Release × 50 | src/core/file-lock.ts (dolaylı) + manual JSON | Kısmen |
| Map vs Array lookup | src/orchestra/result-collector.ts (`buildResultsMap`) | Evet |
| buildResultsMap() × 500 | src/orchestra/result-collector.ts | Evet |
| SkillSandbox AST scan × 20 | src/core/marketplace/skill-sandbox.ts | Evet |
| SkillSandbox suspicious scan × 20 | src/core/marketplace/skill-sandbox.ts | Evet |

### hot-paths.bench.ts — Src Coverage

Bench dosyası src modülü import etmiyor — tamamen mock data ile çalışıyor. Benchmarklar:
- `Map.get()` vs `Array.find()` — JavaScript built-in (src yok)
- `buildResultsMap()` — mock implementasyonu (gerçek değil)
- `evaluateResult()` — mock harness
- `spawnWorkers()` — prompt building simulation (gerçek src değil)
- `waitForResults()` — JSON parse simulation
- `deepMerge()` — in-memory simulation

**Sonuç:** `hot-paths.bench.ts` gerçek src modüllerini benchmark etmiyor, sadece algoritma pattern'larını ölçüyor.

---

## 4. Orphan Test Tespiti

**Src tarafı orphan'lar (load testi eksik kritik hot path'ler):**

- `src/core/memory-store.ts` — SQLite query performansı test edilmiyor (FTS5 search P50/P95/P99 yok)
- `src/core/memory-query.ts` — `searchMemory()` performansı test edilmiyor
- `src/orchestra/sprint-controller.ts` — sprint koordinasyon overhead'i ölçülmüyor
- `src/orchestra/task-router.ts` — routing kararı performansı ölçülmüyor
- `src/core/agent-pool.ts` — LRU eviction performansı ölçülmüyor

**Sprint 133'ten Sprint 140'a:** Memory V2 (SQLite FTS5) eklendi ama load testi güncellenmedi. `searchMemory()` için P50/P95/P99 benchmark kritik eksik.

---

## 5. Flaky Candidate İşaretleri

| Dosya | Risk | Açıklama |
|-------|------|----------|
| load-harness.test.ts | ORTA | P-value threshold assertionları (`expect(result.p99).toBeLessThan(50)`) — yavaş CI'da kırılabilir |
| load-harness.test.ts | DÜŞÜK | `process.hrtime.bigint()` güvenilir ama GC pause'u sayılara dahil olabilir |
| load-harness.test.ts | DÜŞÜK | Cold vs warm load comparison (`coldDuration`) — deterministic değil |
| hot-paths.bench.ts | DÜŞÜK | `Math.random()` ile mock data üretimi — deterministik değil ama bench sonucu etkilemiyor |

**En büyük flaky riski:** `loadConfig_cached_100` testi:

```typescript
expect(result.p50).toBeLessThan(10);   // <10ms
expect(result.p95).toBeLessThan(20);   // <20ms
expect(result.p99).toBeLessThan(50);   // <50ms
```

Yavaş CI runner'da (özellikle GitHub Actions ücretsiz tier) bu limitler aşılabilir. Sprint 133 Task 9 zamanında ayarlanmış ama donanım çeşitliliğine karşı hassas.

---

## 6. Memory V2 Mock Uyumu

`countBrainLines`: 0 referans — temiz.
`parseDebtTable`: 0 referans — temiz.
`MemoryStore`: 0 referans.

**Kritik Eksik:** Memory V2'nin ana performans katkısı (SQLite FTS5 dual-layer search, 96% context reduction) load testlerde **hiç ölçülmüyor**. `searchMemory()` P50/P95/P99 değerleri bilinmiyor.

**Memory V2 Uyumu:** Eski mock kalıntısı yok (PASS) ama yeni V2 path'leri de test edilmiyor (GAP).

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 65/100 (C)

### Güçlü Yönler
- `process.hrtime.bigint()` ile nanosecond-precision P50/P95/P99 — profesyonel mikrobenchmark yaklaşımı.
- `loadConfig()` hem cold hem warm path ölçüyor — gerçekçi cache davranışı.
- `SkillSandbox.validateSkillSafety()` AST scan performansı ölçülüyor — güvenlik + performans kesişimi.
- Dynamic import ile test side-effect izolasyonu (`clearConfigCache()` before cold test).
- `hot-paths.bench.ts` Map vs Array lookup — ADR dokümanlanmış performans kararını (result-collector.ts `buildResultsMap`) destekliyor.
- Memory V2 eski mock kalıntısı yok.

### Zayıf Yönler
- **`hot-paths.bench.ts` vitest run'a dahil değil** — CI'da hiç çalışmıyor. `package.json`'a `"bench"` script eklenmeli.
- **Memory V2 performance eksik** — `searchMemory()` (FTS5) benchmark yok. Sprint 133'ten Sprint 140'a en büyük yeni hot path test edilmiyor.
- P-value threshold'lar (`< 50ms`) CI donanımına bağımlı — flaky riski var.
- `hot-paths.bench.ts` gerçek src modüllerini değil mock simülasyon yapıyor — gerçek kod yollarını ölçmüyor.
- Task Claim/Release senaryosu file-lock gerçek I/O olmadan simüle ediliyor.
- `load-harness.test.ts` describe sayısı (5) vs it sayısı (8) — her describe ortalama 1.6 test, çok az.
- Sprint 139'da eklenen `dependency-scheduler.ts` (Kahn's algorithm) için performans testi yok.

### Sprint 142+ Öneriler
- `searchMemory()` P50/P95/P99 benchmark ekle — `text: 'docker heartbeat'` gibi gerçek sorgularla.
- `hot-paths.bench.ts` için `package.json`'a `"bench": "vitest bench tests/load/hot-paths.bench.ts"` script ekle.
- P-value threshold'ları ortama göre ayarlanabilir hale getir (env variable `LOAD_TEST_P99_LIMIT`).
- `task-router.ts` routing kararı benchmark ekle — 100 task üzerinden P50/P95.
- `dependency-scheduler.ts` topological sort O(V+E) benchmark ekle.
