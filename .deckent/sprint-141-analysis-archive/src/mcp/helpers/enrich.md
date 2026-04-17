# Analysis: src/mcp/helpers/enrich.ts
**Task ID:** 141-004 | **LoC:** 99

## 1. Amaci (1-2 cumle)
MCP araç yanıtlarını zenginleştiren (enrich) saf fonksiyon modülü. Her tool response'una `_enriched` metadata bloğu ekler; bu blok TR/EN i18n destekli özet (summary), ipucu (hints) listesi ve zaman damgası (timestamp) içerir.

## 2. Public API (export listesi)
- `EnrichedMeta` — interface: `{ summary: string; hints: string[]; timestamp: string; lang: 'tr' | 'en' }`
- `Enriched<T>` — type alias: `T & { _enriched: EnrichedMeta }`
- `generateSummary(toolName: string, lang: 'tr' | 'en'): string` — SUMMARIES lookup'undan özet döndürür
- `generateHints(toolName: string, lang: 'tr' | 'en'): string[]` — HINTS lookup'undan ipucu dizisi döndürür
- `enrichResponse<T>(toolName: string, data: T, lang?: 'tr' | 'en'): Enriched<T>` — response nesnesine `_enriched` bloğu ekleyerek döndürür

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:** Yok. Modül tamamen bağımsız (pure functions), hiçbir deckent modülünü import etmez.

**Dış bağımlılıklar:** Node.js built-in ya da npm paketi kullanılmaz. Tüm veriler modül içindeki `SUMMARIES` ve `HINTS` sabit nesnelerinde (lookup tables) tutulur.

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon sayısı: 3 (`generateSummary`, `generateHints`, `enrichResponse`)
- `SUMMARIES` lookup table: tool adı → `{ tr, en }` şeklinde yaklaşık 20+ tool girişi
- `HINTS` lookup table: tool adı → `{ tr: string[], en: string[] }` yapısında
- Cyclomatic complexity: `generateSummary` ~2, `generateHints` ~2, `enrichResponse` ~3-4 (lang default + spread)
- Toplam cyclomatic: ~7-8, düşük karmaşıklık, iyi okunabilirlik

## 5. Type Safety (any, @ts-ignore, non-null assertion)
Modül tip güvenliği açısından oldukça temiz durumdadır:
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- `Enriched<T>` intersection type (`T & { _enriched: EnrichedMeta }`) yapısal tipleme kullanır; bu yaklaşım doğrudur ancak `T`'nin bir nesne tipi olmasını örtük olarak varsayar. İlkel (primitive) bir `T` ile çağrılması durumunda runtime davranışı beklenmedik olabilir, ancak pratikte MCP tool response'ları her zaman nesne olduğundan risk yoktur.

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006 (spawnSync Security Pattern):** İlgili değil — sistem komutu çalıştırılmaz.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — brain/orchestra modüllerine hiç import yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — sıfır dış bağımlılık, sadece saf TS kodu.
- **ADR-037 (RBAC):** İlgili değil — yetki kontrolü bu katmanda yapılmaz.
- **ADR-039 (Self-Modifying):** İlgili değil.
- **ADR-040 (Memory V2 DB-first):** İlgili değil — DB erişimi yok.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/helpers/enrich.test.ts`

Fonksiyonlar saf (pure) olduğundan test yazımı kolaydır. `generateSummary` ve `generateHints` lookup tablosu dönüşleri, `enrichResponse` ise `_enriched` bloğunun doğru eklendiğini doğrular. `memory_query` tool adının hem SUMMARIES hem HINTS tablolarında eksik olduğu durum kesinlikle test edilmelidir (fallback davranışı).

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
**Kritik boşluk:** `memory_query` tool adı `SUMMARIES` ve `HINTS` lookup tablolarında **eksik**. `enrichResponse('memory_query', data)` çağrıldığında her iki tablo da bu key'i bulamayacak ve generic fallback metin döndürecektir. `deckent_memory_query` MCP tool'u Sprint 139'da eklenmiş olmasına karşın enrich modülü güncellenmemiştir. Bu teknik borç niteliğindedir.

Diğer dead code adayı: `generateSummary` ve `generateHints` fonksiyonları yalnızca `enrichResponse` tarafından kullanılıyorsa bunları iç (unexported) fonksiyon yapmak tutarlılık açısından düşünülebilir; ancak dışa açık tutulması test edilebilirlik ve esneklik sağlar, bu nedenle mevcut durum kabul edilebilir.

## 10. Security Findings
Güvenlik riski düşüktür:
- Kullanıcı girdisi doğrudan işlenmez; `toolName` parametresi lookup table key'i olarak kullanılır, bu da injection riskini ortadan kaldırır.
- `data: T` nesnesi spread operatörüyle kopyalanır; bu işlem herhangi bir değerlendirme (eval) içermez.
- Timestamp `new Date().toISOString()` ile üretilir — güvenli.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Bu modül Memory V2 mimarisiyle doğrudan ilgili değildir. Herhangi bir `.brain/` dosyası okumaz, SQLite DB erişimi yoktur. MCP katmanı enrichment'ı saf veri dönüşümü olarak ele alır; memory sistemiyle bir bağlantı kurulmamıştır. Uyum durumu: **N/A**.

## 12. Oneriler (Sprint 142+ input)
1. **Acil (P1):** `SUMMARIES` ve `HINTS` tablolarına `memory_query` girişi ekle — Sprint 139'da eklenen `deckent_memory_query` tool'u için TR/EN özet ve ipuçları tanımlanmalı.
2. **Normal (P2):** `T extends object` generic constraint ekleyerek `Enriched<T>` type'ın primitive tiplerle yanlış kullanımını derleme zamanında önle.
3. **Normal (P2):** `generateSummary` / `generateHints` lookup tablolarını ayrı bir `enrich-data.ts` dosyasına taşı; bu sayede içerik güncellemeleri kod mantığından bağımsız yapılabilir.

## 13. Verdict: ANALYZED
