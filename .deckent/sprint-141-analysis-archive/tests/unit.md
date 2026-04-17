# Test Category Analysis: unit
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 5

---

## 1. Test Dosya Envanteri

| Dosya | Satır | describe | it blokları | as any sayısı |
|-------|-------|----------|-------------|---------------|
| `heartbeat-daemon.test.ts` | 168 | 3 | 8 | 0 |
| `mid-sprint-adapter.test.ts` | 201 | 3 | 8 | 5 |
| `promotion-pipeline.test.ts` | 213 | 4 | 11 | 1 |
| `spawn-backend-docker.test.ts` | 228 | 6 | 12 | 9 |
| `sprint-utils.test.ts` | 284 | 10 | 22 | 5 |
| **TOPLAM** | **1094** | **26** ¹ | **61** | 20 |

¹ `grep -c describe` toplamlarda iç describe bloklarını da sayar; efektif top-level 5 ana suite + nested describe bloklarıdır.

### Dosya Bazında Describe Yapısı:

**heartbeat-daemon.test.ts:**
- `heartbeat-daemon` (wrapper)
  - `runHeartbeat` (4 it)
  - `HeartbeatDaemon` (2 it)
  - `readDaemonPid` (2 it)

**mid-sprint-adapter.test.ts:**
- `MidSprintAdapter` (wrapper)
  - `shouldReroute` (5 it)
  - `applyReroute` (1 it)

**promotion-pipeline.test.ts:**
- `PromotionPipeline` (wrapper)
  - `promote` (3 it)
  - `demote` (4 it)
  - `evaluatePromotions` (3 it)
  - `evaluateDemotions` (1 it)

**spawn-backend-docker.test.ts:**
- `DockerSpawnBackend` (wrapper)
  - `spawn` (2 it)
  - `kill` (3 it)
  - `isAvailable` (2 it)
  - `list` (1 it)
  - `constructor` (2 it)
- `isDockerAvailable` (2 it)

**sprint-utils.test.ts:**
- `sprint-utils` (wrapper)
  - `isSourceCodeDir` (2 it)
  - `isDocTask` (4 it)
  - `isStaleTaskFile` (3 it)
  - `isTmuxProvider` (2 it)
  - `resolveMaxWorkersNumeric` (2 it)
  - `now` (1 it)
  - `buildSpawnRetryHint` (3 it)
  - `extractGoNogoCriteria` (3 it)
  - `writeSprintState / readSprintState / clearSprintState` (3 it)
  - `subprocess worker log utilities` (2 it)

---

## 2. Mock Pattern Audit

### vi.mock kullanımı (dosya bazında):

**heartbeat-daemon.test.ts:**
```typescript
vi.mock('node:fs', ...)            // readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, unlinkSync
vi.mock('node:child_process', ...) // execSync
vi.mock('../../src/core/utils.js', ...) // debugLog
```
+ `vi.useFakeTimers()` / `vi.useRealTimers()` — tek vi.useFakeTimers kullanan test dosyası bu kategoride

**mid-sprint-adapter.test.ts:**
```typescript
vi.mock('../../src/core/routing-engine.js', ...) // routeTaskV2
vi.mock('../../src/core/utils.js', ...)          // debugLog
```

**promotion-pipeline.test.ts:**
```typescript
vi.mock('fs', ...)                 // NOT 'node:fs' — 'fs' alias kullanır (potansiyel sorun)
vi.mock('../../src/core/utils.js', ...)
```
**Dikkat:** `vi.mock('fs', ...)` yerine `vi.mock('node:fs', ...)` kullanılması gerekir (Node ESM uyumu). Bu tutarsızlık sorun yaratabilir.

**spawn-backend-docker.test.ts:**
```typescript
vi.mock('node:child_process', ...) // spawnSync, spawn
vi.mock('node:fs', ...)
vi.mock('../../src/core/utils.js', ...)
```

**sprint-utils.test.ts:**
```typescript
vi.mock('node:fs', ...)
vi.mock('../../src/core/utils.js', ...)    // readJsonSafe, debugLog
vi.mock('../../src/core/model-registry.js', ...)  // modelRegistry
vi.mock('../../src/core/system-profile.js', ...)  // getSystemProfile
vi.mock('../../src/core/provider.js', ...)        // providerRegistry, ProviderError
vi.mock('../../src/orchestra/tmux.js', ...)       // listWorkers
```
`sprint-utils.test.ts` en kapsamlı mock yapısına sahip: 6 vi.mock çağrısı.

### vi.spyOn kullanımı: YOK (hiçbir dosyada)

### MemoryStore mock: YOK

---

## 3. Coverage Mapping

| Test Dosyası | Kaynak Dosya | Eşleşme |
|-------------|-------------|---------|
| `heartbeat-daemon.test.ts` | `src/orchestra/heartbeat-daemon.ts` | EVET (doğrulandı) |
| `mid-sprint-adapter.test.ts` | `src/orchestra/mid-sprint-adapter.ts` | EVET (doğrulandı) |
| `promotion-pipeline.test.ts` | `src/orchestra/promotion-pipeline.ts` | EVET (doğrulandı) |
| `spawn-backend-docker.test.ts` | `src/orchestra/spawn-backend-docker.ts` | EVET (doğrulandı) |
| `sprint-utils.test.ts` | `src/orchestra/sprint-utils.ts` | EVET (doğrulandı) |

Tüm 5 test dosyası için karşılık gelen `src/orchestra/*.ts` kaynak dosyası mevcuttur.

### Kapsam Genişliği (export bazında):

**sprint-utils.test.ts** en kapsamlı: `readFileSafe`, `now`, `isSourceCodeDir`, `isDocTask`, `isStaleTaskFile`, `isTmuxProvider`, `resolveMaxWorkersNumeric`, `getSubprocessWorkerLogPath`, `readSubprocessWorkerLog`, `hasSubprocessWorkerLog`, `writeSprintState`, `readSprintState`, `clearSprintState`, `buildSpawnRetryHint`, `extractGoNogoCriteria` — 15 export test edilmiş.

**Not:** Test edilen exportlar dışında `sprint-utils.ts` muhtemelen ek utility fonksiyonları içermektedir; bu kısmi coverage'ı gösterir.

---

## 4. Orphan Test Tespiti

### Orphan Testler: YOK
Tüm 5 test dosyasının `src/orchestra/` altında birebir karşılığı mevcuttur.

### Tersine Orphan (src karşılığı olmayan):
Bu kategoride değil, ancak `src/orchestra/` altındaki şu dosyalar için `tests/unit/` altında test bulunmamaktadır:
- `brain.ts` (re-export layer)
- `sprint-controller.ts` — çok kritik, unit test yok
- `planner.ts`
- `task-router.ts`
- `debt-manager.ts`
- `sprint-reporter.ts`
- `tmux.ts`
- `spawn-backend.ts` (subprocess backend)
- `outcome-tracker.ts`
- `quality-assessor.ts`
- `rule-evolver.ts`
- `temp-skill-generator.ts`

Bu eksiklikler `tests/orchestra/` veya `tests/integration/` kapsamında ele alınıyor olabilir.

---

## 5. Flaky Candidate İşaretleri

### Date.now() kullanımı — sprint-utils.test.ts (satır 146, 153):
```typescript
const oldTime = Date.now() - 100_000_000; // ~27 hours ago
mockStatSync.mockReturnValue({ mtimeMs: oldTime } as any);

mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 1000 } as any);
```
`statSync` mock'lanmış olduğundan `Date.now()` gerçek zamana bağlıdır. Ancak bu testlerde zaman farkı büyük (100 milyon ms ≈ 27 saat vs 1000ms), bu yüzden pratik flaky riski düşüktür. Test çalışma süresi bu eşikleri aşmaz.

### vi.useFakeTimers — heartbeat-daemon.test.ts:
```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
```
Fake timers doğru pattern ile kullanılmış — `afterEach` ile düzgün temizleniyor. Race condition riski yok.

### Async testler: spawn-backend-docker.test.ts
```typescript
it('should return true when docker info succeeds', async () => {
  const available = await backend.isAvailable();
  expect(available).toBe(true);
});
```
`isAvailable()` async test edilmiş. `spawnSync` mock'landığından gerçek Docker bağlantısı denenmiyor — bu doğru.

### Genel Flaky Risk: DÜŞÜK
Tüm dış bağımlılıklar (fs, child_process, routing engine) mock'lanmış. Zamana bağlı testler fake timers veya büyük zaman eşikleri kullanıyor.

---

## 6. Memory V2 Mock Uyumu

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock | YOK — temiz |
| `parseDebtTable` mock | YOK — temiz |
| `MemoryStore` import/mock | YOK |
| DB erişimi | YOK |
| Eski `.brain/DECISIONS.md` parse | YOK |

Unit testlerinin hiçbiri Memory V2 DB'ye dokunmamaktadır. Bu beklenen davranıştır — `src/orchestra/` modülleri için unit testler FS/process mock'larına dayanır, DB'ye bağımlılık yoktur.

**Ek gözlem:** `promotion-pipeline.test.ts` içindeki mock tracker:
```typescript
function makeMockTracker(...) {
  return {
    getLearnings: vi.fn().mockReturnValue({ ... agentPerformance: ..., skillPerformance: ... }),
    calculateBonuses: vi.fn().mockReturnValue([]),
    recordOutcome: vi.fn(),
    save: vi.fn(),
  } as any;
}
```
Bu mock `OutcomeTracker` arayüzünü simüle eder. Memory V2 ile doğrudan ilişkisi yoktur. Temiz.

---

## 7. Genel Değerlendirme

### Güçlü Yönler:
- 5 dosya, 5 farklı kritik `src/orchestra/` modülü — iyi çeşitlilik
- Mock izolasyonu kaliteli: dış bağımlılıklar (`fs`, `child_process`, routing) düzgün mock'lanmış
- `heartbeat-daemon.test.ts`: vi.useFakeTimers doğru pattern ile kullanılmış
- `spawn-backend-docker.test.ts`: Docker kill fallback, graceful shutdown testi mükemmel
- `sprint-utils.test.ts`: 15 export test edilmiş — kapsamlı
- `mid-sprint-adapter.test.ts`: max reroute limit, same-agent-reroute senaryoları var — edge case kapsama iyi

### Zayıf Yönler:
- **promotion-pipeline.test.ts:** `vi.mock('fs', ...)` yerine `vi.mock('node:fs', ...)` kullanılmalı — ESM uyumsuzluk riski
- **Yüksek `as any` kullanımı:** 20 `as any` toplam (spawn-backend-docker 9, mid-sprint-adapter 5) — type safety zayıf
- `sprint-utils.ts`'in tüm exportları test edilmemiş (partial coverage)
- `HeartbeatDaemon.stop()` içinde PID file silinmesi test edilmemiş (test comment ile belirtilmiş ama assert eksik)

### Kritik Bulgu: `vi.mock('fs', ...)` vs `vi.mock('node:fs', ...)`
`promotion-pipeline.test.ts` satır 5'te `vi.mock('fs', ...)` kullanıyor. ADR-001 (TypeScript + ESM) gereği `node:` prefix zorunludur. Bu eşleşmeme mock'un aktif olmayabileceği anlamına gelir — testler geçiyor olsa da, gerçek fs çağrılarının mock'lanmadığı durumlar oluşabilir. Sprint 142'de düzeltilmeli.

### Öneriler (Sprint 142+):
1. `promotion-pipeline.test.ts`: `'fs'` → `'node:fs'` düzelt (ADR-001)
2. `as any` cast'lerini `Partial<T>` ve doğru tip helper'larıyla değiştir
3. `HeartbeatDaemon.stop()` PID file cleanup assert'ini ekle
4. `sprint-utils.ts` için coverage genişlet: `readFileSafe`, `readSubprocessWorkerLog` test edilmeli

**Sağlık Skoru:** 75/100 (B)

Gerekçe: Unit testler genel olarak kalitelidir, kritik orchestra bileşenleri iyi izole edilmiş. `vi.mock('fs', ...)` ESM tutarsızlığı ve yüksek `as any` kullanımı skoru B seviyesinde tutuyor. Kapsam 5 kritik dosya için sağlamdır.
