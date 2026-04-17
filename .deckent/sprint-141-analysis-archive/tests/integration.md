# Test Category Analysis: integration
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 30

---

## 1. Test Dosya Envanteri

| Dosya | it Blokları | Hedef Alan |
|-------|-------------|------------|
| lifecycle.test.ts | 44 | Sprint lifecycle tam akışı |
| progress-summary.test.ts | 35 | Sprint progress raporlama |
| zero-config-flow.test.ts | 32 | Sıfır konfigürasyonla çalışma |
| notification-flow.test.ts | 32 | Bildirim sistemi (Sprint 139 T41) |
| review-flow.test.ts | 31 | Sprint review/değerlendirme akışı |
| error-recovery.test.ts | 29 | Hata kurtarma senaryoları |
| full-sprint-e2e.test.ts | 28 | Tam sprint E2E simülasyonu |
| config-layers.test.ts | 24 | 3-layer config merge (ADR-004) |
| provider-flow.test.ts | 22 | Provider seçimi ve fallback |
| multi-env.test.ts | 22 | Çoklu ortam (WSL/macOS/Linux) |
| monorepo.test.ts | 21 | Monorepo proje tipi |
| collaboration-adaptive.test.ts | 21 | Adaptive agent collaboration |
| typescript-react.test.ts | 20 | TypeScript+React proje tipi |
| python-fastapi.test.ts | 20 | Python FastAPI proje tipi |
| stack-detection.test.ts | 19 | Proje stack tespiti |
| skill-selection.test.ts | 19 | Skill seçim/routing |
| e2e-sprint.test.ts | 19 | Sprint başlatma E2E |
| decision-engine.test.ts | 19 | Decision engine V2 |
| sprint-044-modules.test.ts | 17 | Sprint 044 modül integrasyon |
| agent-selection.test.ts | 17 | Agent seçim/routing |
| security-flow.test.ts | 16 | Güvenlik tarama akışı |
| multi-agent-pipeline.test.ts | 13 | Çok ajanlı pipeline |
| npm-install-sim.test.ts | 12 | NPM kurulum simülasyonu |
| full-sprint-cycle.test.ts | 11 | Tam sprint döngüsü |
| plugin-lifecycle.test.ts | 10 | Plugin/skill yaşam döngüsü |
| plan-sprint.test.ts | 8 | Sprint planlama |
| mcp-flow.test.ts | 7 | MCP araç akışı |
| e2e-init.test.ts | 6 | Init komutu entegrasyonu |
| memory-v2.test.ts | 4 | Memory V2 roundtrip |
| cascade-block-live.test.ts | 4 | Cascade block/unblock (Sprint 139 T52) |

**Toplam:** 30 dosya | 178 describe bloğu | 582 it bloğu

---

## 2. Mock Pattern Audit

### vi.mock Kullanımı (41 referans)

En yoğun mock kullanan dosyalar:

**lifecycle.test.ts** (ana test dosyası — 44 it):
```
vi.mock('../../src/orchestra/tmux.js', ...)          — tmux spawn mock
vi.mock('node:child_process', ...)                    — spawnSync mock
vi.mock('node:readline/promises', ...)                — readline mock
vi.mock('../../src/core/memory-store.js', () => ({    — MemoryStore DB mock
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}))
```

**full-sprint-cycle.test.ts:**
```
vi.mock('../../src/core/memory-store.js', ...)       — MemoryStore DB mock
```

**e2e-init.test.ts:**
```
vi.mock('../../src/orchestra/tmux.js', ...)
vi.mock('node:child_process', ...)
vi.mock('../../src/monitor/auditor.js', async (importActual) => ...)
vi.mock('../../src/agents/worker.js', ...)
```

**mcp-flow.test.ts:**
```
vi.mock('../../src/orchestra/tmux.js', ...)
vi.mock('node:child_process', ...)
vi.mock('../../src/monitor/auditor.js', ...)
vi.mock('../../src/agents/worker.js', ...)
```

**npm-install-sim.test.ts:**
```
vi.mock('node:child_process', ...)   — execSync, spawnSync, spawn
vi.mock('node:fs', ...)              — existsSync, readFileSync, writeFileSync, mkdirSync, ...
```

**provider-flow.test.ts:**
```
vi.mock('../../src/orchestra/spawn-backend-docker.js', ...)
vi.spyOn(SpawnBackendFactory, 'isTmuxAvailable').mockReturnValue(false/true)
```

### vi.spyOn Kullanımı

```
provider-flow.test.ts:228   vi.spyOn(SpawnBackendFactory, 'isTmuxAvailable')
lifecycle.test.ts:752       vi.spyOn(process.stdout, 'write')
lifecycle.test.ts:836       vi.spyOn(process, 'cwd')
lifecycle.test.ts:837       vi.spyOn(process.stdout, 'write')
lifecycle.test.ts:838       vi.spyOn(process.stderr, 'write')
```

### MemoryStore Mock Analizi

`lifecycle.test.ts` ve `full-sprint-cycle.test.ts` — MemoryStore'u DB-first şekilde mock'luyor:

```typescript
// lifecycle.test.ts:73
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));
// lifecycle.test.ts:117
// Create memory.db stub so getMemoryStore() finds it and uses MemoryStore mock
```

Bu **doğru V2 pattern**: `memory.db` stub dosyası oluşturup `getMemoryStore()` path'inin MemoryStore mock'u döndürmesini sağlıyor.

**memory-v2.test.ts** ise mock kullanmıyor — gerçek `MemoryStore` ile real SQLite üzerinden roundtrip test yapıyor (en sağlam yaklaşım).

---

## 3. Coverage Mapping

Integration testleri senaryo-bazlıdır; her test tek bir src dosyasına karşılık gelmez. Ancak her test dosyasının hangi src modüllerini egzersiz ettiği:

| Test Dosyası | Egzersiz Edilen Src Modülleri |
|-------------|-------------------------------|
| lifecycle.test.ts | orchestra/brain.ts, orchestra/tmux.ts, core/memory-store.ts |
| memory-v2.test.ts | core/memory-store.ts, core/memory-query.ts, core/memory-export.ts, core/memory-import.ts |
| notification-flow.test.ts | core/notification-dispatcher.ts, notify-adapters/ |
| cascade-block-live.test.ts | orchestra/dependency-scheduler.ts, orchestra/event-stream.ts |
| decision-engine.test.ts | orchestra/decision-engine.ts (TEK doğrudan isim eşleşmesi) |
| config-layers.test.ts | core/config.ts |
| provider-flow.test.ts | core/provider.ts, orchestra/spawn-backend-docker.ts |
| skill-selection.test.ts | core/skill-pool.ts, orchestra/task-router.ts |
| agent-selection.test.ts | core/agent-pool.ts, orchestra/task-router.ts |
| stack-detection.test.ts | core/environment.ts (veya eşdeğeri) |
| mcp-flow.test.ts | mcp/server.ts, mcp/tools/ |
| sprint-044-modules.test.ts | orchestra/connector.ts, orchestra/rollback.ts |
| collaboration-adaptive.test.ts | agents/adaptive-agent.ts |
| multi-agent-pipeline.test.ts | orchestra/parallel-pipeline.ts |
| plugin-lifecycle.test.ts | core/skill-pool.ts (sandbox) |

**Doğrudan isim eşleşmesi olan tek dosya:** `decision-engine.test.ts` → `src/orchestra/decision-engine.ts`

---

## 4. Orphan Test Tespiti

### Test Tarafı Orphan'lar (src karşılığı zayıf):

**`sprint-044-modules.test.ts`:** Sprint 44'ten kalma modülleri (connector.ts, rollback.ts) test ediyor. Bu modüller hala aktif kullanımda mı? Kontrol gerekiyor.

**`collaboration-adaptive.test.ts`:** `agents/adaptive-agent.ts`'e karşılık geliyor — bu dosya gerçekten var mı ve aktif mi?

**`progress-summary.test.ts`:** Hangi src modülünü test ettiği belirsiz — sprint progress formatting için ayrı bir modül mü var?

**`e2e-sprint.test.ts` + `full-sprint-e2e.test.ts` + `e2e-init.test.ts`:** Integration kategorisinde E2E prefixli 3 test var. Bunlar `tests/e2e/` kategorisiyle sınır karıştırıyor.

### Src Tarafı — Integration Coverage Eksikleri:

- `src/orchestra/self-modifying-detector.ts` (Sprint 139 ADR-039) — integration testi yok
- `src/orchestra/authority-enforcer.ts` (Sprint 139 ADR-037 RBAC) — integration testi yok
- `src/orchestra/rule-evolver.ts` — integration testi yok
- `src/orchestra/promotion-pipeline.ts` — integration testi yok

---

## 5. Flaky Candidate İşaretleri

| Dosya | Risk | Açıklama |
|-------|------|----------|
| cascade-block-live.test.ts | ORTA | `Date.now()` ile temp dizin ismi oluşturma |
| lifecycle.test.ts | ORTA | `Date.now() - 200_000` ile stale timestamp simülasyonu; timing-dependent |
| lifecycle.test.ts | ORTA | `Date.now() - 400_000` ile stale lock simülasyonu |
| stack-detection.test.ts | DÜŞÜK | `Date.now()` ile `mtimeMs` set etme — mock içinde, test logic'i değil |
| progress-summary.test.ts | DÜŞÜK | `Date.now() - 60_000` sprint başlangıç simülasyonu; sabit delta kullanıyor, stabil |
| progress-summary.test.ts | DÜŞÜK | `Date.now() - 3 * 60 * 1000` stale agent simülasyonu |

**Önemli:** `cascade-block-live.test.ts` geçici dizin `Date.now()` + `Math.random()` kombinasyonu kullanıyor — bu iyi bir pratik, çakışma riski minimal.

**Gerçek async/timing riski** lifecycle testlerinde: `Date.now() - 200_000` ve `- 400_000` kullanımı, sabit geçmiş zaman simülasyonu için — flaky değil ama okunması zor.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines — Tek Tehlikeli Kalıntı

```typescript
// mcp-flow.test.ts:65
vi.mock('../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(50),  // ← ESKI V1 MOCK
  readJsonSafe: vi.fn((path: string) => { ... }),
  ...
}))
```

**Bu bir Memory V2 uyumsuzluk bulgusudur.** `countBrainLines` fonksiyonu artık `src/cli/helpers/output.ts`, `src/cli/commands/doctor.ts`, `src/cli/commands/cleanup.ts`, `src/mcp/tools/cleanup.ts` içinde DB-first `getMemoryEntryCount()` olarak refactor edilmiştir. Ancak `mcp-flow.test.ts` hala `countBrainLines` mock'u içeriyor — bu mock muhtemelen işlevsiz (artık çağrılmıyor) ama eski API izlenimi bırakıyor.

**Önerilen aksiyon:** `mcp-flow.test.ts`'deki `countBrainLines` mock'unu kaldır veya `getMemoryEntryCount` mock'u ile değiştir.

### parseDebtTable — Temiz

`parseDebtTable` referansı integration testlerinde 0. Ancak `src/core/utils.ts:205`'te fonksiyon hala mevcut ve `sprint-finalizer.ts`, `sprint-phases.ts`, `archive-debt.ts` tarafından kullanılıyor. Integration testlerinde bu kod path'leri mock'lanmış olabilir.

### MemoryStore Mock — Doğru Pattern

`lifecycle.test.ts` ve `full-sprint-cycle.test.ts` MemoryStore'u DB-first şekilde doğru mock'luyor. `memory-v2.test.ts` ise gerçek SQLite ile çalışıyor. İki katmanlı test stratejisi sağlam.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 76/100 (C+)

### Güçlü Yönler
- 582 it bloğu ile en kalabalık test kategorisi — geniş senaryo kapsamı.
- `memory-v2.test.ts` gerçek SQLite ile roundtrip (insert→search→export→reimport) test ediyor — Memory V2 bütünlük doğrulaması için kritik.
- `cascade-block-live.test.ts` Sprint 139 T52'nin canlı doğrulaması (Kahn's algorithm + dependency blocking).
- `notification-flow.test.ts` Sprint 139 T41 notification dispatcher tam akışını kapsıyor.
- `lifecycle.test.ts` MemoryStore mock'u DB-first pattern ile doğru.
- `memory.db` stub oluşturma + `getMemoryStore()` path'i yönlendirme — iyi test mühendisliği.

### Zayıf Yönler
- **`mcp-flow.test.ts` `countBrainLines` kalıntısı** — V1 API mock'u, hala var. P1 teknik borç.
- `self-modifying-detector.ts` (ADR-039) için integration testi yok — Sprint 139'un önemli bir modülü korumasız.
- `authority-enforcer.ts` (ADR-037 RBAC) için integration testi yok.
- 3 adet "e2e" prefixli test (e2e-init, e2e-sprint, full-sprint-e2e) yanlış kategoride — `tests/e2e/`'ye taşınmalı veya isimlendirme netleştirilmeli.
- `sprint-044-modules.test.ts` eski sprint kalıntısı — hala geçerli mi?
- 582 it sayısına rağmen bazı kritik modüller (rule-evolver, promotion-pipeline) için test yok.

### Sprint 142+ Öneriler
- `mcp-flow.test.ts` içindeki `countBrainLines` mock'unu sil — P1.
- `self-modifying-detector.ts` + `authority-enforcer.ts` için integration test ekle — ADR-037/039 runtime doğrulama.
- `e2e-init.test.ts`, `e2e-sprint.test.ts`, `full-sprint-e2e.test.ts`'i `tests/e2e/` kategorisine taşı.
- `sprint-044-modules.test.ts` — connector.ts/rollback.ts hala aktif mi? Kontrol et, gerekirse arşivle.
