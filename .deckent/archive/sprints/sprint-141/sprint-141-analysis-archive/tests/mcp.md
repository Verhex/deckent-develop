# Test Category Analysis: mcp
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 27

---

## 1. Test Dosya Envanteri

**Toplam:** 27 dosya | **describe blokları:** 198 | **it() blokları:** 557

### Kök dizin (`tests/mcp/`) — 13 dosya

| Dosya | Açıklama |
|-------|----------|
| `branch-coverage.test.ts` | Genişletilmiş dallanma kapsama testleri (12+ vi.mock) |
| `enrich.test.ts` | MCP helpers/enrich.ts kapsama |
| `job-runner.test.ts` | MCP job runner (kök düzey) |
| `resources.test.ts` | MCP resources katmanı DB-first testleri |
| `resources/resources.test.ts` | MCP resources alt dizin testleri (MemoryStore mock) |
| `server.test.ts` | MCP server.ts ana test dosyası |
| `tools-debt-061-006.test.ts` | Debt enrichment edge case testleri |
| `tools-enrichment.test.ts` | Tool enrichment pipeline |
| `tools-enrichment-004.test.ts` | Enrichment sprint 004 spesifik |
| `tools-enrichment-batch2.test.ts` | Toplu enrichment testleri |
| `tools-quality-059010.test.ts` | Tool kalite metrikleri |
| `tools.test.ts` | Ana MCP tools entegrasyon testi |

### `tests/mcp/tools/` — 14 dosya

| Dosya | Kapsadığı Tool |
|-------|----------------|
| `annotations.test.ts` | Tüm tool'ların annotations (readOnlyHint/destructiveHint/idempotentHint) |
| `doctor.test.ts` | `deckent_doctor` |
| `explain.test.ts` | `deckent_explain` |
| `format.test.ts` | `src/mcp/helpers/format.ts` |
| `help.test.ts` | `deckent_help` |
| `init.test.ts` | `deckent_init` |
| `job-runner.test.ts` | `deckent_run` job runner |
| `misc-tools.test.ts` | `deckent_retro`, `deckent_sync` |
| `plan.test.ts` | `deckent_plan` |
| `start.test.ts` | `deckent_start` |
| `status.test.ts` | `deckent_status` |
| `status-agents.test.ts` | `deckent_status` agent subview |
| `status-history.test.ts` | `deckent_history` |
| `status-rich.test.ts` | `deckent_status` zengin format |

### `tests/mcp/helpers/` — 1 dosya

| Dosya | Açıklama |
|-------|----------|
| `format.test.ts` | `src/mcp/helpers/format.ts` kapsama |

### `tests/mcp/resources/` — 1 dosya

| Dosya | Açıklama |
|-------|----------|
| `resources.test.ts` | Resources DB-first pipeline (MemoryStore mock) |

---

## 2. Mock Pattern Audit

### vi.mock kullanımı

- **Toplam vi.mock çağrısı:** 90+ (27 dosya genelinde)
- **En yoğun dosya:** `branch-coverage.test.ts` — 12 adet vi.mock (node:fs, node:child_process, memory-store, config, utils, brain, tmux, auditor, worker, analyzer, job-runner, provider, format)
- **vi.spyOn:** 0 kullanım (kategori genelinde — sadece vi.mocked kullanılmış)

### Mock edilen modüller (sıklık sırasına göre)

1. `node:fs` — neredeyse tüm dosyalar
2. `node:child_process` — çoğunluk
3. `../../src/core/memory-store.js` — `branch-coverage.test.ts`, `resources.test.ts`, `resources/resources.test.ts`
4. `../../src/orchestra/brain.js` — `branch-coverage.test.ts`, `server.test.ts`
5. `../../src/core/utils.js` — `branch-coverage.test.ts`, `tools/init.test.ts`, `tools/misc-tools.test.ts`, `tools.test.ts`
6. `../../src/core/config.js` — yaygın

### MemoryStore Mock Kalitesi

Üç dosyada MemoryStore mock'u DB-first pattern'e uygun şekilde yapılmış:
- `branch-coverage.test.ts:26` — `MemoryStore: vi.fn().mockImplementation(() => mockMemStore)`
- `resources.test.ts:22` — `MemoryStore: vi.fn().mockImplementation(() => mockMcpMemStore)`
- `resources/resources.test.ts:27` — `MemoryStore: vi.fn().mockImplementation(() => mockMemStore)` + afterEach re-wire pattern

MemoryStore mock'ları uygun method setleri içeriyor (getByType, insert, getById vb.).

---

## 3. Coverage Mapping

### src/mcp/ dosyaları vs testler

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `server.ts` | `server.test.ts` | OK |
| `tools/agent-list.ts` | YOK | **GAP** |
| `tools/analyze.ts` | YOK | **GAP** |
| `tools/checkpoint.ts` | YOK | **GAP** |
| `tools/cleanup.ts` | YOK | **GAP** |
| `tools/config.ts` | YOK | **GAP** |
| `tools/directives.ts` | YOK | **GAP** |
| `tools/docs.ts` | YOK | **GAP** |
| `tools/doctor.ts` | `tools/doctor.test.ts` | OK |
| `tools/explain.ts` | `tools/explain.test.ts` | OK |
| `tools/help.ts` | `tools/help.test.ts` | OK |
| `tools/history.ts` | `tools/status-history.test.ts` (kısmi) | PARTIAL |
| `tools/index.ts` | `tools/annotations.test.ts` (dolaylı) | PARTIAL |
| `tools/init.ts` | `tools/init.test.ts` | OK |
| `tools/job-runner.ts` | `tools/job-runner.test.ts` | OK |
| `tools/kill.ts` | YOK | **GAP** |
| `tools/memory-query.ts` | **YOK** | **KRITIK GAP** |
| `tools/plan.ts` | `tools/plan.test.ts` | OK |
| `tools/retro.ts` | `tools/misc-tools.test.ts` (kısmi) | PARTIAL |
| `tools/review.ts` | YOK | **GAP** |
| `tools/run.ts` | `tools/job-runner.test.ts` (kısmi) | PARTIAL |
| `tools/skill-list.ts` | YOK | **GAP** |
| `tools/start.ts` | `tools/start.test.ts` | OK |
| `tools/status.ts` | `tools/status.test.ts` + `status-rich.test.ts` + `status-agents.test.ts` | OK |
| `tools/sync.ts` | `tools/misc-tools.test.ts` (kısmi) | PARTIAL |
| `resources/agents.ts` | `resources.test.ts` (dolaylı) | PARTIAL |
| `resources/config.ts` | YOK | **GAP** |
| `resources/dashboard.ts` | `resources.test.ts` (kısmi) | PARTIAL |
| `resources/debt.ts` | `resources.test.ts` + `resources/resources.test.ts` | OK |
| `resources/directives.ts` | YOK | **GAP** |
| `resources/index.ts` | Dolaylı | PARTIAL |
| `resources/memory.ts` | `resources.test.ts` + `resources/resources.test.ts` | OK |
| `resources/retro.ts` | `resources.test.ts` (kısmi) | PARTIAL |
| `resources/tasks.ts` | YOK | **GAP** |
| `helpers/enrich.ts` | `enrich.test.ts` | OK |
| `helpers/format.ts` | `helpers/format.test.ts` + `tools/format.test.ts` | OK |
| `helpers/index.ts` | Dolaylı | PARTIAL |

---

## 4. Orphan Test Tespiti

Kendi başına bir src dosyasına 1:1 eşleşmeyen testler:

| Orphan Test | Gerçek Kapsama |
|-------------|---------------|
| `branch-coverage.test.ts` | Genel MCP branch coverage boost amaçlı — birden fazla src dosyasını kapsıyor |
| `tools-debt-061-006.test.ts` | Sprint 061/006 bug regression — `tools/doctor.ts` + `resources/debt.ts` kısmi |
| `tools-enrichment.test.ts` | `helpers/enrich.ts` genişletilmiş testler |
| `tools-enrichment-004.test.ts` | Sprint 004 enrichment regression |
| `tools-enrichment-batch2.test.ts` | Batch enrichment regression |
| `tools-quality-059010.test.ts` | Quality metrikleri sprint 059/010 |

**Gerçek orphan yok** — tüm "orphan" görünen testler bir src modülünü dolaylı kapsıyor.

---

## 5. Flaky Candidate İşaretleri

### setTimeout kullanan testler

| Dosya | Satır | Risk |
|-------|-------|------|
| `branch-coverage.test.ts:345` | `await new Promise(r => setTimeout(r, 10))` | Düşük (10ms) |
| `tools/start.test.ts:200` | `await new Promise(r => setTimeout(r, 20))` | Düşük ama 4 kez kullanılmış |
| `tools/start.test.ts:218` | `await new Promise(r => setTimeout(r, 20))` | Aynı |
| `tools/start.test.ts:239` | `await new Promise(r => setTimeout(r, 20))` | Aynı |
| `tools/start.test.ts:258` | `await new Promise(r => setTimeout(r, 20))` | Aynı |

### Date.now() kullanan testler

| Dosya | Satır | Risk |
|-------|-------|------|
| `tools/status-history.test.ts:83` | `new Date(Date.now() - 600_000)` | Düşük (sabit offset) |
| `tools/status-rich.test.ts:78` | `new Date(Date.now() - 600_000)` | Düşük |
| `tools/status-rich.test.ts:317` | `new Date(Date.now() - 30_000)` | Düşük |
| `tools/status.test.ts:78` | `new Date(Date.now() - 600_000)` | Düşük |
| `tools/status-agents.test.ts:70` | `new Date(Date.now() - 600_000)` | Düşük |

**Fake timer kullanımı:** 0 — kategoride hiç kullanılmamış.

**Değerlendirme:** `tools/start.test.ts` içindeki 4 adet 20ms setTimeout gerçek zamanlama bağımlısı değil (Promise resolution test amaçlı), ancak yavaş CI ortamlarında sporadik başarısızlık riski taşır. Fake timer kullanımı önerilir.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines mock'ları (eski, devam ediyor)

`countBrainLines` hala birçok MCP testinde mock'lanıyor:

| Dosya | Satır | Mock |
|-------|-------|------|
| `branch-coverage.test.ts:41` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `tools-debt-061-006.test.ts:25` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `server.test.ts:22` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `tools-enrichment-004.test.ts:22` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `tools/misc-tools.test.ts:14` | `countBrainLines: vi.fn().mockReturnValue(50)` | Devam ediyor |
| `tools/init.test.ts:15` | `countBrainLines: vi.fn().mockReturnValue(50)` | Devam ediyor |
| `tools/annotations.test.ts:24` | `countBrainLines: vi.fn().mockReturnValue(50)` | Devam ediyor |
| `tools/doctor.test.ts:22` | `countBrainLines: vi.fn().mockReturnValue(50)` | Devam ediyor |
| `tools-quality-059010.test.ts:25` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `tools-enrichment.test.ts:21` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `tools.test.ts:27` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |
| `resources/resources.test.ts:42` | `countBrainLines: vi.fn().mockReturnValue(100)` | Devam ediyor |

**BULGU:** 12 MCP test dosyası `countBrainLines` mock'u içeriyor. `countBrainLines` hâlâ `src/core/utils.ts` içinde mevcut (export silindi mi kontrol edilmeli). Eğer `countBrainLines` deprecated/deleted olacaksa bu mock'ların `getMemoryEntryCount` benzeri bir DB-first karşılığına geçmesi gerekir.

### parseDebtTable mock'ları

`branch-coverage.test.ts:167-174` — `parseDebtTable` edge case testleri hâlâ mevcutta. Bu, V1 fallback kodu hâlâ çalışıyorsa anlam taşır; kaldırılmışsa bu testler stale olmuştur.

### MemoryStore mock kalitesi

Sadece 3 dosyada MemoryStore mock'u var. Yüksek miktardaki tool testi (14 araç) MemoryStore'u doğrudan mock etmiyor — çoğu üst düzey modül mock'unu kullanıyor (brain, tmux vb.). Bu, bütünleşik test zayıflığı anlamına gelir.

**KRİTİK BULGU:** `tools/memory-query.ts` için hiç test yok — Memory V2'nin en yeni ve önemli MCP tool'u tamamen test dışı.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 62/100 (C)

### Güçlü Yönler
- 27 dosya, 198 describe, 557 it() — kapsamlı miktar
- MemoryStore mock'u doğru DB-first pattern kullanılmış (3 dosyada)
- `annotations.test.ts` — tüm araçların metadata bütünlüğünü doğruluyor (Sprint 140'ta önemli)
- `resources/resources.test.ts` — `afterEach` re-wire pattern — temiz mock sıfırlama

### Zayıf Yönler

1. **memory-query.ts TAMAMEN TESTSİZ** — Sprint 140'ta eklenen en kritik MCP tool (`deckent_memory_query`) için hiç test yok. P0 öncelikli Sprint 141+ görevi.
2. **13 src tool'dan 9'u dedicated test dosyasız** — agent-list, analyze, checkpoint, cleanup, config, directives, docs, kill, review, skill-list, sync sadece dolaylı kapsama alıyor.
3. **countBrainLines mock'u 12 dosyada** — Memory V2 geçişi tamamlandıysa bu mock'lar stale; DB-first `getMemoryEntryCount` karşılığına geçilmeli.
4. **Fake timer yok** — `start.test.ts` içindeki 4 setTimeout gerçek zamanlama bağımlısı riski taşıyor.
5. **vi.spyOn kullanımı yok** — Tüm kategori sadece `vi.mock` + `vi.mocked` kullanıyor; bazı testler daha ince mock granülasyonundan yararlanabilir.

### Sprint 142+ Öneriler

- `tests/mcp/tools/memory-query.test.ts` — acil oluşturulmalı
- `tests/mcp/tools/agent-list.test.ts`, `checkpoint.test.ts`, `cleanup.test.ts`, `config.test.ts` — öncelikli
- `countBrainLines` mock'larını `getMemoryEntryCount` DB-first versiyonuna geç
- `start.test.ts` setTimeout'larını `vi.useFakeTimers()` ile değiştir
