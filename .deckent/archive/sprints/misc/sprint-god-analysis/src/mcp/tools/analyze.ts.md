# Analysis: src/mcp/tools/analyze.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 49 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Proje analiz MCP tool'u. `analyzeProject()` fonksiyonunu çağırarak projenin dil, framework, test araçları, build tool, CI sistemi ve proje boyutunu tespit eder. Sonuçlara config önerileri ekler (plan mode, worker count). Dosya değiştirmez, salt-okunur.

## 2. Public API
- `registerAnalyzeTool(server: McpServer): void` — JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
- `../../core/analyzer.js` → analyzeProject
- `../helpers/enrich.js` → enrichResponse
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- `@modelcontextprotocol/sdk` — ADR-010 uyumlu
- inputSchema yok (parametre almıyor) → **zod import yok, doğru**

## 5. Complexity
- Fonksiyon sayısı: 2 (generateConfigSuggestion, handler)
- Max cyclomatic: ~3 (generateConfigSuggestion)
- **Düşük karmaşıklık** — basit wrapper

## 6. Type Safety
- `as string | undefined` satır 8-9 — dynamic key access, gerekli cast
- `as unknown as Record<string, unknown>` satır 29 — **unsafe double cast** → analyzeProject dönüş tipi ProjectAnalysis ama enrichResponse Record<string, unknown> bekliyor
- **P2 SORUN**: Tip uyumsuzluğu gizleniyor

## 7. ADR Compliance
- **ADR-008**: ✅ — core import
- **ADR-010**: ✅
- **ADR-022**: ✅ — CLI `deckent analyze` karşılığı
- **ADR-033**: ✅ — telemetri yok

## 8. Test Coverage
- Dedicated test: **YOK** (`tests/mcp/tools/analyze.test.ts` mevcut değil)
- **P1 GAP**

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- Yok ✅

## 11. Security
- Düşük risk — parametre almıyor, process.cwd() kullanıyor

## 12. Memory V2 Uyumu
- N/A — memory ile ilgisi yok

## 13. i18n
- Hardcoded suggestions: "Consider pro_plan mode..." satır 9-10, "Set up a test framework..." satır 12
- **i18n gap** ama düşük öncelik

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Çok detaylı
- JSDoc: YOK
- `analysis` key'lerine `as string | undefined` cast yorum satırı: "safe: optional field access" → **yorum doğru**

## 15. Performance
- `analyzeProject()` dosya sistemi taraması yapar — on-demand, hot path değil
- Sync I/O: analyzeProject içinde (bu dosyada direkt yok)

## 16. Öneriler
- **P1:** Dedicated test dosyası eksik
- **P2:** `as unknown as Record<string, unknown>` → enrichResponse generic tip kabul etmeli veya ProjectAnalysis interface'i extend edilmeli
- **P3:** JSDoc

## Verdict: ANALYZED
