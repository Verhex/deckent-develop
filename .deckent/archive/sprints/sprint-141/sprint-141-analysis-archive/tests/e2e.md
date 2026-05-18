# Test Category Analysis: e2e
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 10

---

## 1. Test Dosya Envanteri

| Dosya | describe Blokları | it Blokları |
|-------|-------------------|-------------|
| docker-backend.test.ts | 6 | ~55 (10 Docker-gated skipIf) |
| docker-hb-shutdown.test.ts | 5 | 20 |
| event-stream-runtime.test.ts | 1 | 9 |
| first-sprint.test.ts | 1 | 18 |
| install-flow.test.ts | 1 | 30 |
| provider-smoke.test.ts | 4 | 28 |
| single-provider.test.ts | 3 | 22 |
| sprint-lifecycle.test.ts | 2 | 10 |
| subprocess-backend.test.ts | 1 + 13 nested | ~20 |
| tmux-backend.test.ts | 2 (1 conditional) | ~28 |

**Toplam:** 10 dosya | 69 describe bloğu | 258 it bloğu

### Dosya Açıklamaları

- **docker-backend.test.ts** (Sprint 139 Task 17): Gerçek Docker daemon'a `it.skipIf(!dockerAvailable)` guard ile bağlanan tam backend E2E testi. 6 describe grubu: Docker Backend Integration, Orphan HB Detection (T11a-d), Orphan HB Cleanup (T12a-c), File Lock Integration (T13a-c), fsync verifyResultAfterStop.
- **docker-hb-shutdown.test.ts** (Sprint 139 Task 13): atomicWriteFileSync, fsyncResultFile, writeResult, finalizeHeartbeatOnShutdown, SIGTERM trap ve Docker backend graceful stop testleri. Docker gerektirmez, unit-level.
- **event-stream-runtime.test.ts** (Sprint 139 Task 44): event-stream.ts tam pipeline simülasyonu — writeEvent→readEvents→reconstructState, ADR-035 kanal coverage, 50+ event scale, sequence monotonicity, filtre performansı, partial write güvenliği.
- **first-sprint.test.ts**: planSprint→resetDashboard→doctor→cleanup tam akışı. `vi.mock` ile tmux, child_process, auditor, worker mock'lanmış.
- **install-flow.test.ts**: `init` komutu dosya sistemi kurulumu, formatWelcomeBanner, doctor checks, cleanup. `vi.mock` kullanıyor.
- **provider-smoke.test.ts**: Claude/Codex/Gemini adapter smoke testleri + Provider Registry. `vi.mock` yok; gerçek import.
- **single-provider.test.ts**: Tekil provider sprint (Codex-only, Gemini-only, no-providers). Mock adapters.
- **sprint-lifecycle.test.ts**: MockSpawnBackend ile DONE/mixed/timeout/empty sprint senaryoları.
- **subprocess-backend.test.ts** (Sprint 139 Task 19): 13 T1-T13 describe alt-grubu, gerçek subprocess spawn — prompt delivery, fallback result, timeout, concurrent workers.
- **tmux-backend.test.ts** (Sprint 139 Task 18): Section A unit (mock), Section B `describe.skipIf(!tmuxAvailable)` gerçek tmux binary.

---

## 2. Mock Pattern Audit

### vi.mock Kullanımı

```
first-sprint.test.ts:31    vi.mock('../../src/orchestra/tmux.js', ...)
first-sprint.test.ts:44    vi.mock('node:child_process', ...)
first-sprint.test.ts:53    vi.mock('../../src/monitor/auditor.js', async (importActual) => ...)
first-sprint.test.ts:65    vi.mock('../../src/agents/worker.js', ...)
install-flow.test.ts:28    vi.mock('../../src/orchestra/tmux.js', ...)
install-flow.test.ts:41    vi.mock('node:child_process', ...)
install-flow.test.ts:50    vi.mock('../../src/monitor/auditor.js', async (importActual) => ...)
install-flow.test.ts:62    vi.mock('../../src/agents/worker.js', ...)
```

**vi.spyOn:** Kullanılmıyor (0 referans).

**MemoryStore mock:** Kullanılmıyor — e2e testleri bellek katmanını doğrudan test etmiyor.

**Gözlem:** docker-backend, event-stream-runtime, subprocess-backend, tmux-backend, sprint-lifecycle, provider-smoke, single-provider testleri `vi.mock` kullanmıyor — bu testler ya gerçek binary'lere ya da mock backend class'larına (MockSpawnBackend) dayanıyor. Bu iyi bir E2E pratik — module-level mock minimum tutulmuş.

---

## 3. Coverage Mapping

E2E testleri, adları doğrudan tek bir src dosyasına karşılık gelmeyen senaryo bazlı testlerdir:

| Test Dosyası | Hedef src Modülleri |
|-------------|---------------------|
| docker-backend.test.ts | src/orchestra/spawn-backend-docker.ts, src/core/file-lock.ts |
| docker-hb-shutdown.test.ts | src/orchestra/spawn-backend-docker.ts (atomicWriteFileSync, fsyncResultFile) |
| event-stream-runtime.test.ts | src/orchestra/event-stream.ts |
| first-sprint.test.ts | src/orchestra/brain.ts, src/cli/commands/init.ts, src/cli/commands/doctor.ts |
| install-flow.test.ts | src/cli/commands/init.ts, src/cli/commands/doctor.ts, src/cli/commands/cleanup.ts |
| provider-smoke.test.ts | src/providers/claude.ts, src/providers/codex.ts, src/providers/gemini.ts, src/core/provider.ts |
| single-provider.test.ts | src/core/provider.ts, src/providers/*.ts |
| sprint-lifecycle.test.ts | src/orchestra/result-collector.ts, src/orchestra/sprint-reporter.ts |
| subprocess-backend.test.ts | src/providers/subprocess.ts |
| tmux-backend.test.ts | src/orchestra/tmux.ts |

**Not:** `sprint-lifecycle.test.ts` → `src/orchestra/sprint-lifecycle.ts` dosyası mevcut (tek doğrudan isim eşleşmesi).

---

## 4. Orphan Test Tespiti

E2E kategorisindeki testler senaryo-bazlıdır ve doğrudan tek dosya karşılığı beklemek yanlış olur. Ancak dikkat çeken noktalar:

- **install-flow.test.ts**: `formatWelcomeBanner`, `formatDetectedSetup`, `getReadinessLabel`, `countDebtItems`, `getProviderTips` gibi utility fonksiyonları test ediyor — bu fonksiyonlar `src/cli/commands/doctor.ts` veya `src/cli/commands/init.ts` içinde. Gerçek bir E2E akış testi değil, unit test gibi görünüyor. Yanlış kategoride olabilir.
- **first-sprint.test.ts**: Benzer durum — `getMemoryHealthLabel`, `getProviderSummary` gibi yardımcı fonksiyon testleri de içeriyor.

---

## 5. Flaky Candidate İşaretleri

| Dosya | Risk | Açıklama |
|-------|------|----------|
| docker-backend.test.ts | YÜKSEK | `setTimeout(resolve, 1500)`, `setTimeout(resolve, 2000)` — gerçek Docker operasyonları için timing-dependent beklemeler |
| subprocess-backend.test.ts | ORTA | `setTimeout(check, 50)` ile dosya poling + `Date.now()` timeout hesabı — CPU yüküne duyarlı |
| event-stream-runtime.test.ts | DÜŞÜK | `Date.now()` sadece sprint ID üretimi için, test logic'i değil |
| sprint-lifecycle.test.ts | DÜŞÜK | `await new Promise(r => setTimeout(r, 50))` — senkronizasyon amaçlı ama süre kısa |
| tmux-backend.test.ts | ORTA | `describe.skipIf(!tmuxAvailable)` — CI ortamında tmux yoksa 12+ test skip olur |
| docker-backend.test.ts | ORTA | `it.skipIf(!dockerAvailable)` — Docker yoksa 10+ test skip |

**En büyük flaky riski:** `docker-backend.test.ts` satır 386 ve 407'deki hardcoded `setTimeout(1500ms/2000ms)` bekleme süreleri. Yavaş CI'da bu süreler yetersiz kalabilir.

---

## 6. Memory V2 Mock Uyumu

`countBrainLines` referansı: **0 bulgu** — e2e testlerinde eski fonksiyon mock'u yok.
`parseDebtTable` referansı: **0 bulgu** — temiz.
`MemoryStore` referansı: **0 bulgu** — e2e katmanı memory store'u doğrudan test etmiyor.

**Sonuç:** E2E testleri Memory V2 geçişine tam uyumlu. Eski V1 mock kalıntısı yok.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 82/100 (B)

### Güçlü Yönler
- Backend parity üçlemesi tamamlandı (Docker + tmux + subprocess) — Sprint 139'da 19 sprint boşluktan sonra ilk subprocess E2E.
- `it.skipIf` pattern ile gerçek binary yokluğunu zarif handle etme (Docker, tmux).
- Event stream runtime E2E gerçek sprint scale (50+ event) simülasyonu.
- `vi.mock` kullanımı minimum, gerçek modüllere karşı test ağırlıklı.
- Memory V2 uyumu: sıfır eski mock kalıntısı.

### Zayıf Yönler
- `install-flow.test.ts` ve `first-sprint.test.ts` bazı unit-test karakterli testler içeriyor (yanlış kategori riski).
- Docker backend testlerinde hardcoded `setTimeout(1500ms/2000ms)` flaky riski.
- `vi.spyOn` kullanımı yok — bazı side effect'ler test edilmiyor olabilir.
- `docker-backend.test.ts` dosyasında `it.skipIf` ile koşullanan 10+ test CI'da hiç çalışmıyor olabilir.

### Sprint 142+ Öneriler
- Docker/tmux `skipIf` guard'lı testler için ayrı CI job tanımla (`docker` label gereksinimi).
- `install-flow.test.ts` unit benzeri testleri `tests/cli/` kategorisine taşı.
- `setTimeout` bekleme sürelerini `vitest` `waitFor` utility ile değiştir.
