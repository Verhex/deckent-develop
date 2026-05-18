# Test Category Analysis: analytics
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 4

---

## 1. Test Dosya Envanteri

| Dosya | describe | it | Kaynak |
|-------|----------|----|--------|
| agent-comparison-data.test.ts | 6 | 20 | src/dashboard/analytics/agent-comparison-data.ts |
| analytics-data.test.ts | 2 | 22 | src/dashboard/analytics/analytics-data.ts |
| skill-heatmap-data.test.ts | 7 | 23 | src/dashboard/analytics/skill-heatmap-data.ts |
| success-chart-data.test.ts | 6 | 19 | src/dashboard/analytics/success-chart-data.ts |
| **TOPLAM** | **21** | **84** | — |

Küçük ama odaklı bir kategori. Dashboard analytics modüllerini kapsar. Tüm dosyaların doğrudan kaynak karşılığı mevcuttur.

---

## 2. Mock Pattern Audit

**Toplam vi.mock / vi.spyOn kullanımı: 0**

Kategori tamamen mock-free çalışır. Hiçbir dosyada `vi.mock` veya `vi.spyOn` kullanımı yok.

### Strateji: Gerçek dosya sistemi + tmpdir

`analytics-data.test.ts` gerçek dosya sistemi kullanır:
- `mkdirSync` + `rmSync` ile geçici dizin oluşturur ve temizler
- `beforeEach` / `afterEach` ile lifecycle yönetimi
- Sprint dosyalarını gerçek `.brain/sprints/*.md` formatında yazar ve okur

Bu yaklaşım pure unit test yerine entegrasyon test niteliği taşır. Diğer 3 test dosyası (`agent-comparison-data`, `skill-heatmap-data`, `success-chart-data`) veri dönüşüm fonksiyonlarını pure unit test olarak test eder — mock gerekmez.

---

## 3. Coverage Mapping

Kategori 4/4 tam src karşılığına sahip:

| Test Dosyası | Kaynak Dosya | Durum |
|-------------|-------------|-------|
| analytics/agent-comparison-data.test.ts | src/dashboard/analytics/agent-comparison-data.ts | MATCH |
| analytics/analytics-data.test.ts | src/dashboard/analytics/analytics-data.ts | MATCH |
| analytics/skill-heatmap-data.test.ts | src/dashboard/analytics/skill-heatmap-data.ts | MATCH |
| analytics/success-chart-data.test.ts | src/dashboard/analytics/success-chart-data.ts | MATCH |

### Kaynak dosya inventeri (src/dashboard/analytics/):

```
agent-comparison-data.ts   ✓ test var
analytics-data.ts          ✓ test var
skill-heatmap-data.ts      ✓ test var
success-chart-data.ts      ✓ test var
```

Kategori coverage açısından mükemmel: 4 kaynak → 4 test, 1:1 eşleme.

---

## 4. Orphan Test Tespiti

**Orphan test yok.** Tüm 4 test dosyasının doğrudan kaynak karşılığı `src/dashboard/analytics/` altında mevcuttur.

**Tersine orphan (src var, test yok):** Analiz kapsamında `src/dashboard/analytics/` altında yalnızca 4 dosya bulunuyor ve hepsi test edilmiş durumda. Eksik coverage yok.

---

## 5. Flaky Candidate İşaretleri

### Tespit edilen riskler:

| Dosya | Satır | Risk Türü | Açıklama |
|-------|-------|-----------|----------|
| analytics-data.test.ts | 17 | `Date.now()` + `Math.random()` | Geçici dizin adı oluşturmak için kullanılıyor: `` `analytics-data-test-${Date.now()}-${Math.random().toString(36).slice(2)}` `` |

**Değerlendirme:** `analytics-data.test.ts` gerçek dosya sistemi üzerinde çalıştığı için inherent olarak daha yavaş ve potansiyel olarak daha kırılgan:
- `Date.now()` + `Math.random()` tmpdir adı için kullanılıyor — bu practice güvenli, sadece unique dir ismi için
- `beforeEach` → `mkdirSync` ve `afterEach` → `rmSync` lifecycle yönetimi doğru uygulanmış
- Paralel test çalıştırma durumunda tmpdir çakışma riski yok (random suffix ile önlenmiş)

**Risk seviyesi: DÜŞÜK** — flaky değil, sadece gerçek I/O kullandığı için CI'da daha yavaş.

**Potansiyel sorun:** `analytics-data.ts` kaynak kodu `.brain/sprints/*.md` dosyalarını doğrudan `readFileSync` ile okur — bu V1 davranışı. Eğer Memory V2 geçişiyle sprint verisi SQLite'a taşınırsa bu test ve kaynak dosya birlikte güncellenmeli.

---

## 6. Memory V2 Mock Uyumu

### Sonuç: DİKKAT GEREKTİRİYOR

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock varlığı | YOK |
| `parseDebtTable` mock varlığı | YOK |
| `MemoryStore` import/mock | YOK |
| Eski `.md` parse yaklaşımı | **VAR** — `analytics-data.ts` `.brain/sprints/*.md` okur |

### Detay:

`src/dashboard/analytics/analytics-data.ts` (kaynak dosya) Memory V2 mimarisine geçmemiş:
```typescript
// src/dashboard/analytics/analytics-data.ts (satır 66-77)
const sprintDir = join(this.projectRoot, '.brain', 'sprints');
const files = readdirSync(sprintDir)
  .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
  .sort();
// readFileSync ile .md okuma
const content = readFileSync(join(sprintDir, file), 'utf-8');
```

Bu kod, sprint verilerini SQLite yerine `.brain/sprints/*.md` dosyalarından okumaya devam ediyor. Memory V2'ye göre sprint verileri DB'de saklanmalı, `.md` dosyaları yalnızca export formatı olmalı. Dashboard analytics modülü bu geçişi henüz yapmamış.

**Test uyumu:** `analytics-data.test.ts` bu V1 davranışını doğru test ediyor — `writeSprintFile()` ile `sprint-*.md` dosyaları oluşturuyor. Kaynak ile uyumlu, ancak kaynak kendisi V2'ye geçirilince testlerin de güncellenmesi gerekecek.

---

## 7. Genel Değerlendirme

**Sağlık Skoru: 76/100 (C+)**

### Güçlü Yönler:
- 4/4 mükemmel kaynak-test eşlemesi
- Mock-free tasarım (pure data transformation tests)
- `analytics-data.test.ts` gerçek dosya sistemi ile entegrasyon doğruluğu
- beforeEach/afterEach lifecycle yönetimi doğru

### Eksikler / Öneriler:
1. **KRITIK (P1): Memory V2 Uyumsuzluğu** — `analytics-data.ts` `.brain/sprints/*.md` okumaya devam ediyor. Sprint 142+ önceliğiyle SQLite → MemoryStore migration yapılmalı. Test de buna göre güncellenmeli (MemoryStore mock eklenecek).
2. **`analytics-data.test.ts` tmpdir yaklaşımı** — Gerçek I/O kullanımı nedeniyle diğer testlerden ~5-10x daha yavaş. Vi.mock alternatifi değerlendirilmeli (özellikle CI'da hız önemliyse).
3. `agent-comparison-data`, `skill-heatmap-data`, `success-chart-data` testleri pure unit test — bu iyi bir pattern, devam edilmeli.
4. Dashboard analytics testlerini `tests/dashboard/` altına taşımak daha tutarlı bir organizasyon sağlar (şu an `tests/analytics/` altında).

### Sprint 142 Borç Adayı:
- `analytics-data.ts` → MemoryStore migration (sprint verisi DB'den okunacak)
- `analytics-data.test.ts` → MemoryStore mock ile güncelleme
