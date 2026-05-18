# Analysis: src/mcp/helpers/enrich.ts
**Task ID:** 142-026 | **Model:** opus | **LoC:** 98 | **Effort:** max

## 1. Amacı
MCP tool yanıtlarına zenginleştirme (enrichment) katmanı ekler. Her tool yanıtına otomatik olarak: (1) İnsan okunabilir Türkçe/İngilizce özet (summary), (2) Sonraki adım ipuçları (hints), (3) Timestamp eklenir. `enrichResponse()` wrapper'ı tool handler'ları tarafından çağrılır.

## 2. Public API
- `enrichResponse<T>(toolName, response, context?): Enriched<T>` — ana zenginleştirme fonksiyonu
- `generateSummary(toolName, response, lang): string` — i18n özet üretici
- `generateHints(toolName, response): string[]` — ipucu üretici
- `EnrichedMeta` interface — { summary, hints, timestamp }
- `Enriched<T>` type — T & { _enriched: EnrichedMeta } (NOT EXPORTED — **SORUN**)
- JSDoc: **EKSIK** (hiçbir fonksiyonda yok)

## 3. İç Bağımlılıklar
- Bağımsız modül — hiçbir src/ import'u yok
- Döngüsel: YOK

## 4. Dış Bağımlılıklar
- Hiç dış bağımlılık yok — saf TypeScript
- ADR-010: ✅ Mükemmel uyum

## 5. Complexity
- Fonksiyon sayısı: 3 (generateSummary, generateHints, enrichResponse)
- Veri yapısı: 2 Record map (SUMMARIES: 18 tool, HINTS: 18 tool)
- Max cyclomatic: ~2 (generateSummary — map lookup + fallback)
- **BASİT VE TEMİZ**

## 6. Type Safety
- `Enriched<T>` generic: `T & { _enriched: EnrichedMeta }` — doğru intersection type
- `as Enriched<T>` cast: satır 97 — **DİKKAT:** spread ile intersection type oluşturuluyor, sonra cast. TypeScript'te `{ ...response, _enriched: meta }` intersection ile tam uyumlu değil ama pratikte çalışıyor
- `Record<string, unknown>` constraint: satır 86, 9 — doğru
- `_r` unused parameter: SUMMARIES lambdaları (satır 10-46) — response parametresini kullanmıyor, `_` prefix ile doğru
- **KABUL EDİLEBİLİR**

## 7. ADR Compliance
- **ADR-008:** ✅ (bağımsız helper)
- **ADR-010:** ✅ (sıfır dependency)
- **ADR-022:** ✅ (tool enrichment MCP-only — CLI ayrı output)
- **ADR-032 i18n:** ✅ SUMMARIES TR/EN çift dil, lang parametresi

## 8. Test Coverage
- Test dosyası: tests/mcp/enrich.test.ts (helpers/ altında DEĞİL)
- **DİKKAT:** Test dosyası yolu ile kaynak dosya yolu eşleşmiyor (enrich.ts → helpers/, test → mcp/)
- Ek testler: tests/mcp/tools-enrichment-batch2.test.ts
- **EKSİK:** enrichResponse() doğrudan test eden dedicated helper test dosyası yok

## 9. TODO/FIXME/HACK Inventory
- Yok

## 10. Dead Code
- `_r` parametreleri: SUMMARIES lambdaları response'u kullanmıyor — **TASARIM GEREĞİ** (gelecekte response-based summary için)
- HINTS lambdaları da response'u kullanmıyor — aynı durum

## 11. Security
- RİSK YOK — saf veri dönüşümü

## 12. Memory V2 Uyumu
- N/A — memory ile ilişkisi yok

## 13. i18n
- ✅ SUMMARIES: 18 tool × 2 dil (TR/EN) — eksiksiz
- ✅ HINTS: Türkçe sabit — **SORUN:** Hints her zaman Türkçe (lang parametresi kullanılmıyor)
- **P2:** HINTS'te lang parametresi eksik — İngilizce kullanıcılar Türkçe hint görür
- **EKSİK TOOL:** 'memory_query' tool SUMMARIES/HINTS map'lerinde YOK → zenginleştirme fallback'e düşer
- **EKSİK TOOL:** 'help', 'agent_list', 'skill_list', 'docs' SUMMARIES/HINTS'te YOK

## 14. Dokümantasyon Tutarlılığı
- JSDoc: **EKSIK**
- SUMMARIES tool listesi (18): set_directives, plan, start, status, doctor, init, retro, history, sync, analyze, config, usage, review, run, kill, cleanup, checkpoint, explain
- tools/index.ts tool listesi (22): init, set_directives, plan, start, status, doctor, retro, history, analyze, sync, config, review, run, kill, cleanup, help, agent_list, skill_list, checkpoint, docs, explain, memory_query
- **FARK:** 4 tool (help, agent_list, skill_list, docs) + 'usage' (SUMMARIES'de var ama tool olarak yok) + memory_query eksik → **P2 TUTARSIZLIK**

## 15. Performance
- Overhead minimal — map lookup O(1) + spread + timestamp

## 16. Öneriler
- **P1:** 'memory_query', 'help', 'agent_list', 'skill_list', 'docs' tool'larını SUMMARIES ve HINTS map'lerine ekle
- **P2:** HINTS'e lang parametresi ekle (İngilizce ipuçları için)
- **P2:** 'usage' tool'u SUMMARIES'de var ama tools/index.ts'de yok — kaldır veya tool ekle
- **P3:** JSDoc ekle
- **P3:** Test dosyası yolunu düzelt (helpers/ altına taşı)

## Verdict: ANALYZED
