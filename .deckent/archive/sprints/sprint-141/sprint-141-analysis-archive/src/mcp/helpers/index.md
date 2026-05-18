# Analysis: src/mcp/helpers/index.ts
**Task ID:** 141-004 | **LoC:** 22

## 1. Amaci (1-2 cumle)
`helpers/` dizini için barrel export modülüdür. `enrich.ts` ve `format.ts` modüllerinden seçili sembolleri tek bir giriş noktasından yeniden dışa aktarır, böylece tüketicilerin birden fazla modül yolunu bilmesi gerekmez.

## 2. Public API (export listesi)
**enrich.ts'den re-export edilenler:**
- `enrichResponse`
- `generateSummary`
- `generateHints`
- `EnrichedMeta` (interface)
- `Enriched` (type)

**format.ts'den re-export edilenler:**
- `formatStatusResponse`
- `formatPlanResponse`
- `formatStartResponse`
- `formatDoctorResponse`
- `formatRetroResponse`
- `formatHistoryResponse`
- `formatErrorResponse`
- `wrapResponse`
- `StatusData`, `PlanData`, `StartData`, `DoctorData`, `RetroData`, `HistoryData`, `ErrorData` (interface'ler)

**Eksik re-export'lar (SORUN):**
- `ExplainData` — format.ts'de mevcut, index.ts'de yok
- `formatExplainResponse` — format.ts'de mevcut, index.ts'de yok
- `FormattedResponse` — format.ts'de mevcut, index.ts'de yok

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `./enrich.js` — enrichment fonksiyonları ve tipleri
- `./format.js` — formatlama fonksiyonları ve interface'ler

**Dış bağımlılıklar:** Yok.

Bu modül yalnızca `export { ... } from` kalıbı kullanır; herhangi bir runtime mantığı içermez.

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Fonksiyon sayısı: **0** (salt barrel export)
- Cyclomatic complexity: **0**
- Satır sayısı: 22 LoC (import/export bildirimleri + boş satırlar)
- Maintainability: Yüksek — düzenlemesi basit, giriş noktası net

## 5. Type Safety (any, @ts-ignore, non-null assertion)
Barrel export modülünde tip güvenliği sorunu bulunmamaktadır:
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion: **0**
- Re-export edilen semboller, kaynak modüllerindeki tip tanımlarını olduğu gibi korur.

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-008 (Brain Merkezi Import):** UYUMLU — hiçbir orchestra/brain modülüne bağımlılık yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — sıfır dış bağımlılık.
- **ADR-022 (CLI/MCP Feature Parity):** Kısmen ilgili — helpers API'sinin eksiksiz export edilmesi, MCP araçlarının tutarlı formatlama kullanmasını sağlar. Eksik export'lar bu prensibe zarar verir.
- Diğer ADR'ler: İlgili değil.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Barrel modüller için doğrudan test genellikle yazılmaz; test coverage `enrich.test.ts` ve `format.test.ts` üzerinden sağlanır.

Olası entegrasyon testi: Barrel'dan import edilen sembollerin çalışır durumda olduğunu doğrulayan smoke test faydalı olabilir; ancak kritik değildir.

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Barrel modülünde dead code kavramı doğrudan uygulanamaz. Ancak **eksik export** durumu söz konusudur:

- `ExplainData` interface'i `format.ts`'de export edilmiş, ancak `index.ts`'den re-export edilmemiş.
- `formatExplainResponse()` fonksiyonu `format.ts`'de export edilmiş, ancak `index.ts`'den re-export edilmemiş.
- `FormattedResponse` interface'i `format.ts`'de export edilmiş, ancak `index.ts`'den re-export edilmemiş.

Bu durum tüketicilerin `helpers/index.js` yerine doğrudan `helpers/format.js`'e import yapmasına yol açar; barrel pattern'in amacını zedeler.

## 10. Security Findings
Güvenlik riski: **Yok**. Barrel export modülleri herhangi bir runtime mantığı veya kullanıcı girdisi işlemi gerçekleştirmez.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Bu modül Memory V2 mimarisiyle ilgili değildir. DB erişimi veya `.brain/` dosya okuma işlemi bulunmamaktadır. Uyum durumu: **N/A**.

## 12. Oneriler (Sprint 142+ input)
1. **Acil (P1):** Aşağıdaki satırları `index.ts`'e ekle:
   ```typescript
   export type { ExplainData, FormattedResponse } from './format.js';
   export { formatExplainResponse } from './format.js';
   ```
   Bu değişiklik, tüm `format.ts` public API'sinin barrel üzerinden erişilebilir olmasını sağlar.
2. **Normal (P2):** Gelecekte yeni bir helper dosyası eklendiğinde (örn. `validate.ts`), barrel modülünün güncellenmesini süreçe dahil et — PR checklist'e eklenebilir.
3. **Düşük (P3):** `export * from './enrich.js'` ve `export * from './format.js'` wildcard export kullanımına geçiş değerlendirilebilir; ancak bu yaklaşım tree-shaking açısından daha az öngörülüdür.

## 13. Verdict: ANALYZED
