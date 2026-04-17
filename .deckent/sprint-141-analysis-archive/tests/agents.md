# Test Category Analysis: agents
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 25

---

## 1. Test Dosya Envanteri

| Dosya | describe | it |
|-------|----------|----|
| adaptive-agent.test.ts | 3 | 23 |
| agent-genealogy.test.ts | 1 | 18 |
| agent-retirement.test.ts | 5 | 19 |
| builtin-agents.test.ts | 11 | 59 |
| cross-sprint-analyzer.test.ts | 1 | 19 |
| manifest-v2-validation.test.ts | 5 | 19 |
| permission-guard.test.ts | 4 | 20 |
| prompt-ab-test.test.ts | 8 | 25 |
| prompt-analytics.test.ts | 12 | 29 |
| prompt-evolution.test.ts | 1 | 12 |
| prompt-metrics.test.ts | 3 | 16 |
| prompt-rollback.test.ts | 6 | 18 |
| prompt-version.test.ts | 7 | 23 |
| shared-context.test.ts | 1 | 15 |
| specialization-drift.test.ts | 1 | 15 |
| worker-agent.test.ts | 3 | 10 |
| worker-doc-skip.test.ts | 5 | 17 |
| worker-edge.test.ts | 7 | 40 |
| worker-feedback.test.ts | 17 | 103 |
| worker-ipc.test.ts | 10 | 63 |
| worker-log.test.ts | 7 | 29 |
| worker-progress.test.ts | 3 | 22 |
| worker-shutdown.test.ts | 1 | 6 |
| worker-verify-lang.test.ts | 3 | 20 |
| worker.test.ts | 28 | 116 |
| **TOPLAM** | **153** | **756** |

Bu kategori, tüm sprint-140 analiz kapsamındaki en büyük test kategorisidir. 25 dosya, 153 describe bloğu ve 756 it bloğu ile agents kategorisi projenin en kritik test altyapısını barındırır.

---

## 2. Mock Pattern Audit

**Toplam vi.mock / vi.spyOn kullanımı: 158 satır**

### Dosya bazlı vi.mock dağılımı:

| Dosya | Strateji | Notlar |
|-------|---------|--------|
| `worker.test.ts` | `vi.mock('node:fs', ...)` + `vi.mock('../../src/orchestra/event-stream.js', ...)` | En kapsamlı mock yapısı; 28 describe, 116 it |
| `prompt-evolution.test.ts` | `vi.mock('node:fs')` | Sade; fs mock yeterli |
| `shared-context.test.ts` | `vi.mock('node:fs', ...)` | 3 mocked fonksiyon |
| `worker-verify-lang.test.ts` | `vi.mock('../../src/core/stack-detector.js', ...)` + `vi.mock('node:child_process', ...)` + `vi.mock('node:fs', ...)` | 3 ayrı modül mock |
| `agent-genealogy.test.ts` | `vi.mock('node:fs')` | Minimal |
| `worker-doc-skip.test.ts` | `vi.mock('node:fs', ...)` + `vi.mock('node:child_process', ...)` + `vi.mock('../../src/core/stack-detector.js', ...)` | 3 modül |
| `worker-agent.test.ts` | `vi.mock('node:fs', ...)` | Dosya sistemi odaklı |
| `agent-retirement.test.ts` | `vi.mock('node:fs')` | Minimal |
| `worker-feedback.test.ts` | `vi.mock('node:child_process', ...)` + `vi.mock('node:fs', ...)` | 2 modül |
| `worker-shutdown.test.ts` | `vi.mock('node:fs', ...)` + `vi.mock('node:child_process', ...)` + `vi.mock('../../src/cli/helpers/output.js', ...)` + `vi.mock('../../src/core/stack-detector.js', ...)` | 4 modül — en geniş mock seti |
| `cross-sprint-analyzer.test.ts` | `vi.mock('node:fs')` | Minimal |
| `worker.test.ts` | Ayrıca `vi.spyOn(console, 'warn')` (2 kez) | console.warn spy |

**Genel değerlendirme:** Mock stratejisi tutarlı — `node:fs` mock central pattern. `event-stream.js` mock yalnızca `worker.test.ts` içinde; bu sprint-139 event hook özelliğiyle uyumlu.

---

## 3. Coverage Mapping

### Doğrudan src/agents/ eşleşmeleri:

| Test Dosyası | Kaynak Dosya | Durum |
|-------------|-------------|-------|
| adaptive-agent.test.ts | src/agents/adaptive-agent.ts | MATCH |
| agent-genealogy.test.ts | src/agents/agent-genealogy.ts | MATCH |
| agent-retirement.test.ts | src/agents/agent-retirement.ts | MATCH |
| cross-sprint-analyzer.test.ts | src/agents/cross-sprint-analyzer.ts | MATCH |
| permission-guard.test.ts | src/agents/permission-guard.ts | MATCH |
| prompt-ab-test.test.ts | src/agents/prompt-ab-test.ts | MATCH |
| prompt-analytics.test.ts | src/agents/prompt-analytics.ts | MATCH |
| prompt-evolution.test.ts | src/agents/prompt-evolution.ts | MATCH |
| prompt-metrics.test.ts | src/agents/prompt-metrics.ts | MATCH |
| prompt-rollback.test.ts | src/agents/prompt-rollback.ts | MATCH |
| prompt-version.test.ts | src/agents/prompt-version.ts | MATCH |
| shared-context.test.ts | src/agents/shared-context.ts | MATCH |
| specialization-drift.test.ts | src/agents/specialization-drift.ts | MATCH |
| worker-ipc.test.ts | src/agents/worker-ipc.ts | MATCH |
| worker.test.ts | src/agents/worker.ts | MATCH |

### Belirsiz eşleşmeler (tek src dosyasına → birden fazla test):

| Test Dosyası | Gerçek Kaynak | Not |
|-------------|-------------|-----|
| worker-agent.test.ts | src/agents/worker.ts | worker.ts'nin agent submodule testleri |
| worker-doc-skip.test.ts | src/agents/worker.ts | doc-skip mantığı worker.ts içinde |
| worker-edge.test.ts | src/agents/worker.ts | edge case'ler worker.ts |
| worker-feedback.test.ts | src/agents/worker.ts | FeedbackLoop tiplerini test eder |
| worker-log.test.ts | src/agents/worker.ts | WorkerLogAction tiplerini test eder |
| worker-progress.test.ts | src/agents/worker.ts | calculateProgress/createHeartbeat |
| worker-shutdown.test.ts | src/agents/worker.ts | finalizeHeartbeatOnShutdown |
| worker-verify-lang.test.ts | src/core/stack-detector.ts | detectFullStack import |

### Dosya bazlı src/agents/ coverage:

| Kaynak Dosya | Test Coverage |
|-------------|--------------|
| src/agents/index.ts | Dolaylı (re-export, ayrı test yok) |
| src/agents/worker.ts | 9 ayrı test dosyası (worker*.test.ts) — çok kapsamlı |

---

## 4. Orphan Test Tespiti

### Gerçek orphan (src/ karşılığı olmayan):

- **builtin-agents.test.ts**: `src/agents/` altında `builtin-agents.ts` dosyası yok. Test `.deckent/agents/*/agent.json` manifest dosyalarını kontrol eder — runtime agent pool'u doğrulama testidir. Teknik olarak "integration test" niteliğinde; src kodu test etmez, konfigürasyon bütünlüğünü test eder.
- **manifest-v2-validation.test.ts**: Benzer şekilde `.deckent/agents/` ve `.deckent/skills/` JSON manifest dosyalarını doğrular. Kaynak kodla doğrudan ilişkisi yok; konfigürasyon doğrulama testidir.

### Çoklu test → tek kaynak (false orphan):

`worker-agent`, `worker-doc-skip`, `worker-edge`, `worker-feedback`, `worker-log`, `worker-progress`, `worker-shutdown` → hepsi `src/agents/worker.ts` üzerindeki bölünmüş testler. worker.ts çok büyük bir dosya olduğundan test bölünmesi mantıklıdır.

---

## 5. Flaky Candidate İşaretleri

### Tespit edilen flaky risk faktörleri:

| Dosya | Satır | Risk Türü | Açıklama |
|-------|-------|-----------|----------|
| worker-ipc.test.ts | 651, 683 | `setTimeout` | IPC mesaj sıralaması için setTimeout kullanımı — race condition riski |
| worker-edge.test.ts | 156, 158 | `Date.now()` | Zaman damgası kontrolü (before/after pattern) — CI ortamında yavaş sistemlerde sorun çıkarabilir |
| worker-edge.test.ts | 432, 434 | `Date.now()` | Aynı before/after pattern — aynı risk |

**Genel:** Kategori flaky riski açısından düşük. vi.useFakeTimers kullanımı yok fakat gerçek zamanlama testleri minimal. `worker-ipc.test.ts` içindeki setTimeout çağrıları async mesaj iletimi için kullanılıyor; race condition olasılığı var ama pratik riskleri düşük.

---

## 6. Memory V2 Mock Uyumu

### Sonuç: TEMIZ — Hiçbir eski .md parse mock'u tespit edilmedi

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock varlığı | YOK |
| `parseDebtTable` mock varlığı | YOK |
| `MemoryStore` mock varlığı | YOK |
| `memory.db` referansı | YOK |
| Eski MEMORY.md/DEBT.md read | YOK (sadece `permission-guard.test.ts:169` da `.brain/MEMORY.md` bir test path string olarak geçiyor — mock değil, scope test senaryosu) |

**Değerlendirme:** `agents` test kategorisi Memory V2 ile tam uyumlu. Worker'lar zaten ADR verilerini prompt üzerinden alıyor (dosya okumaz), bu testler de o davranışı doğru simüle ediyor. MemoryStore mock'una gerek duyulmamış.

---

## 7. Genel Değerlendirme

**Sağlık Skoru: 88/100 (B+)**

### Güçlü Yönler:
- worker.ts 9 ayrı dosyaya bölünmüş — yüksek granülarite ve okunabilirlik
- Mock stratejisi tutarlı: `node:fs` central mock pattern yaygın
- Memory V2'ye tam uyumlu — V1 kalıntısı yok
- Flaky risk minimal (2 dosyada sınırlı `Date.now()` kullanımı)
- 756 it bloğuyla kapsamlı coverage

### Eksikler / Öneriler:
1. **builtin-agents.test.ts** ve **manifest-v2-validation.test.ts** kategorisini `tests/integration/` altına taşımak daha doğru olur — bunlar kaynak kodu değil, konfigürasyon dosyalarını test ediyor.
2. **worker-ipc.test.ts** `setTimeout` kullanımı `vi.useFakeTimers()` ile değiştirilebilir (Sprint 142 iyileştirme adayı).
3. `src/agents/index.ts` için ayrı bir import/re-export doğrulama testi eklenebilir.
4. `worker-edge.test.ts` Date.now() before/after pattern — `vi.useFakeTimers()` ile deterministik hale getirilmeli.

### Kritik Risk Yok.
