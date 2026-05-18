# Test Category Analysis: dashboard
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 12

## 1. Test Dosya Envanteri

### Dosya Listesi (tam)
```
tests/dashboard/api.test.ts
tests/dashboard/api/output-stream.test.ts
tests/dashboard/components.test.ts
tests/dashboard/config-integration.test.ts
tests/dashboard/dashboard-page.test.ts
tests/dashboard/i18n-coverage.test.ts
tests/dashboard/layout.test.ts
tests/dashboard/live-data.test.ts
tests/dashboard/pages.test.ts
tests/dashboard/scaffold.test.ts
tests/dashboard/types.test.ts
tests/dashboard/utils.test.ts
```

### Describe / It Blok Sayıları
- **describe:** 58
- **it:** 270
- **test:** 0

### Her Dosyanın Kısa Açıklaması
| Dosya | Konu |
|-------|------|
| `api.test.ts` | `src/dashboard/src/lib/api.ts` — fetchJson, postJson, ApiError |
| `api/output-stream.test.ts` | output-collector mock ile SSE stream testi |
| `components.test.ts` | React component varlık ve export kontrolleri |
| `config-integration.test.ts` | Dashboard config entegrasyon testi |
| `dashboard-page.test.ts` | DashboardPage component render/contract |
| `i18n-coverage.test.ts` | en.ts ↔ tr.ts key parity testi |
| `layout.test.ts` | Layout component structure testi |
| `live-data.test.ts` | SSE reconnect ve live data behavior |
| `pages.test.ts` | 6 sayfa varlık/export kontrolü |
| `scaffold.test.ts` | Dashboard build dosyaları varlık kontrolü |
| `types.test.ts` | TypeScript type exports |
| `utils.test.ts` | Dashboard lib/utils.ts testleri |

---

## 2. Mock Pattern Audit

### vi.mock / vi.spyOn Kullanımı
- **Toplam vi.mock/vi.spyOn satır sayısı:** 1 (sadece `api/output-stream.test.ts`)

```typescript
// tests/dashboard/api/output-stream.test.ts
vi.mock('../../../src/core/output-collector.js', () => {
  // output collector mock
});
```

**Diğer 11 dosya mock kullanmıyor.** Bu beklenebilir çünkü:
1. `api.test.ts` — `globalThis.fetch = mockFetch` ile native fetch mock yapıyor
2. `scaffold.test.ts`, `components.test.ts`, `pages.test.ts` — dosya varlık kontrolleri, mock gerekmez
3. `i18n-coverage.test.ts` — gerçek i18n dosyalarını import ediyor
4. `types.test.ts` — TypeScript type checks, mock gerekmez

**Yorum:** Mock kullanımı son derece düşük — dashboard testleri ağırlıklı olarak statik kontrol (dosya varlığı, export varlığı, string içerik) yapıyor. Bu yaklaşım doğru ama gerçek UI davranışını test etmiyor.

---

## 3. Coverage Mapping

### src/dashboard/src/ → tests/dashboard/ Eşleşmesi

**src/dashboard/src/lib/**
| Src Dosyası | Test | Durum |
|-------------|------|-------|
| `lib/api.ts` | `api.test.ts` | COVERED |
| `lib/utils.ts` | `utils.test.ts` | COVERED |

**src/dashboard/src/components/**
| Src Dosyası | Test | Durum |
|-------------|------|-------|
| `ActivityFeed.tsx` | `components.test.ts` (varlık) | PARTIAL |
| `AgentDetail.tsx` | `components.test.ts` (varlık) | PARTIAL |
| `DebtTable.tsx` | `components.test.ts` (varlık) | PARTIAL |
| `EmptyState.tsx` | — | **UNTESTED** |
| `Layout.tsx` | `layout.test.ts` | COVERED |
| `NewSprintModal.tsx` | `components.test.ts` (varlık) | PARTIAL |
| `SimpleMarkdown.tsx` | `components.test.ts` (varlık) | PARTIAL |
| `Skeleton.tsx` | — | **UNTESTED** |
| `SprintChart.tsx` | `components.test.ts` (varlık) | PARTIAL |
| `SprintPhaseTimeline.tsx` | `components.test.ts` (varlık) | PARTIAL |

**src/dashboard/src/pages/**
| Src Dosyası | Test | Durum |
|-------------|------|-------|
| `ConfigPage.tsx` | `pages.test.ts` (varlık) | PARTIAL |
| `DashboardPage.tsx` | `dashboard-page.test.ts` | COVERED |
| `HistoryPage.tsx` | `pages.test.ts` (varlık) | PARTIAL |
| `MemoryPage.tsx` | `pages.test.ts` (varlık) | PARTIAL |
| `SettingsPage.tsx` | `pages.test.ts` (varlık) | PARTIAL |
| `StatusPage.tsx` | `pages.test.ts` (varlık) | PARTIAL |

**src/dashboard/src/**
| Src Dosyası | Test | Durum |
|-------------|------|-------|
| `App.tsx` | `scaffold.test.ts` (varlık) | PARTIAL |
| `main.tsx` | `scaffold.test.ts` (varlık) | PARTIAL |
| `i18n/en.ts` | `i18n-coverage.test.ts` | COVERED |
| `i18n/tr.ts` | `i18n-coverage.test.ts` | COVERED |
| `types/index.ts` | `types.test.ts` | COVERED |

**Genel Coverage:** Çoğu dosya "varlık testi" seviyesinde kapsanıyor (%60-70), gerçek fonksiyonel test çok az.

---

## 4. Orphan Test Tespiti

### Src Karşılığı Net Olmayan Testler

| Test Dosyası | Durum |
|-------------|-------|
| `config-integration.test.ts` | Dashboard config entegrasyonu — `src/dashboard/src/` içinde karşılığı net değil |
| `live-data.test.ts` | SSE behavior — `src/dashboard/src/hooks/useSSE.ts` ile ilgili, ama doğrudan test edilmiyor |
| `api/output-stream.test.ts` | `src/core/output-collector.js` ile ilgili — dashboard tests içinde beklenmedik |

**Kısmi Orphan:** `api/output-stream.test.ts` — core output-collector'ı test ediyor, dashboard tests içinde bulunması semantic olarak yanlış konumlandırma.

### Eksik Test Alanları
- `src/dashboard/src/hooks/useSSE.ts` — doğrudan test yok
- `src/dashboard/src/hooks/useApi.ts` — doğrudan test yok
- `src/dashboard/src/components/EmptyState.tsx` — hiç test yok
- `src/dashboard/src/components/Skeleton.tsx` — hiç test yok

---

## 5. Flaky Candidate İşaretleri

### Tespit Edilen Riskler

| Dosya | Risk Türü | Detay |
|-------|-----------|-------|
| `live-data.test.ts` | setTimeout referansı | `expect(content).toContain("setTimeout(connect, 3000)")` — kaynak kodda string arama, test konusu olarak |

**Düşük Flaky Risk:** `live-data.test.ts` içindeki `setTimeout` bir gerçek bekleme değil — kaynak dosyada bu string'in varlığını kontrol ediyor. Flaky değil ama kaynak kod değişirse kırılabilir (brittle test).

**Genel değerlendirme:** Dashboard testleri büyük ölçüde statik dosya kontrolleri içerdiğinden flaky riski düşük. Gerçek async davranış testi azdır.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines / parseDebtTable
**Hiç `countBrainLines`, `parseDebtTable`, `generateDebtTable` kullanımı yok.** Dashboard testleri bu legacy pattern'lerden tamamen bağımsız.

### MemoryStore Kullanımı
**Hiç `MemoryStore` kullanımı yok.**

Bu beklenen bir durum — dashboard testleri frontend bileşenlerini test eder, backend memory layer'ı mock'lamaz. Dashboard React bileşenleri, memory'ye doğrudan erişmez; API endpoint'leri üzerinden veri alır.

### MemoryPage Test Durumu
`MemoryPage.tsx` (Memory V2 dashboard sayfası) sadece `pages.test.ts` içinde varlık kontrolüyle kapsanıyor. Gerçek MemoryPage davranışı (memory listesi render, arama, FTS5 sonuçları) test edilmiyor.

### i18n-coverage.test.ts — Memory V2 Keys
`i18n-coverage.test.ts` TR/EN key parity'yi test ediyor. Memory V2 ile eklenen yeni i18n key'leri (memory page labels, recall/remember komut mesajları) dahil edilmiş mi? Test bu kadar detaya girmeden sadece key count ve parity kontrolü yapıyor — tam doğrulama için manuel inceleme gerekli.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 65/100 (**C+**)

### Güçlü Yönler
- `i18n-coverage.test.ts` — TR/EN key parity testi mükemmel, Memory V2 için kritik
- `api.test.ts` — fetchJson/postJson/ApiError tam kapsamlı test
- `scaffold.test.ts` — dashboard build dosyaları varlık kontrolü sistematik
- `types.test.ts` — TypeScript tip exports kontrolü
- Memory V2 legacy pattern'lerden tamamen temiz

### Zayıf Yönler / Sprint 142+ Öneriler
1. **P1 — Gerçek Component Testleri Eksik:** `components.test.ts` sadece "dosya var mı, export var mı" düzeyinde. `DebtTable`, `ActivityFeed`, `SprintChart` gibi kritik bileşenler için gerçek render testleri yazılmalı.
2. **P1 — Hooks Testi Yok:** `useSSE.ts` ve `useApi.ts` test edilmiyor. SSE reconnect mantığı kritik, test eksikliği risktir.
3. **P1 — MemoryPage Fonksiyonel Test:** Memory V2'nin dashboard entegrasyonu (MemoryPage) sadece varlık testiyle geçiştiriliyor. API mock ile render testi eklenebilir.
4. **P2 — EmptyState / Skeleton Untested:** Görsel utility bileşenler testi eksik.
5. **P2 — output-stream.test.ts Konumu:** Core output-collector testi dashboard/ içinde bulunuyor — `tests/api/` veya `tests/core/` altına taşınmalı.
6. **P3 — i18n Memory V2 Keys:** MemoryPage, recall, remember komutlarının i18n key'leri ayrıca doğrulanmalı.

### Not
Dashboard test kategorisi 12 dosyayla görece az — ancak dashboard testleri `src/dashboard/vitest.config.ts` ile ayrı vitest instance'ında çalışıyor (413 dashboard test ayrıca var). Bu 12 dosya ağırlıklı olarak main vitest run içinde çalışan yapısal testler.
