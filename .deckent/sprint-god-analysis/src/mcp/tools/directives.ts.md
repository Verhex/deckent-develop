# Analysis: src/mcp/tools/directives.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 81 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
DIRECTIVES.md yazma MCP tool'u. Sprint hedeflerini ve task tanımlarını içeren DIRECTIVES.md dosyasını oluşturur/üzerine yazar. "## Task N:" veya "## Görev N:" formatındaki blokları sayar. Task breakdown (code/docs/test/analysis) ve model tahmini (opus/sonnet/haiku) hesaplar. Sprint planlama öncesi zorunlu adım.

## 2. Public API
- `registerSetDirectivesTool(server: McpServer): void` — JSDoc YOK → **EKSİK**
- Module-private: computeBreakdown, computeEstimatedModels

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DIRECTIVES_FILE
- `../helpers/enrich.js` → enrichResponse
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 3 (computeBreakdown, computeEstimatedModels, handler)
- Max cyclomatic: ~4 (computeBreakdown — for loop + 3 regex test)
- **Düşük-orta karmaşıklık**

## 6. Type Safety
- `any`: 0
- Non-null `!`: 0
- **Mükemmel** type safety

## 7. ADR Compliance
- **ADR-008**: ✅
- **ADR-010**: ✅
- **ADR-022**: ✅ — CLI `deckent set-directives` karşılığı
- **Not:** annotations.readOnlyHint=false, destructiveHint=false, idempotentHint=false — **doğru** (üzerine yazar)

## 8. Test Coverage
- Dedicated test: **YOK**
- **P1 GAP** — dosya yazan tool, test kritik

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- Yok ✅

## 11. Security
- `content` parametresi doğrudan writeFileSync'e geçiriliyor satır 56 → **DIRECTIVES_FILE sabit path**, content injection riski yok
- **Güvenli**

## 12. Memory V2 Uyumu
- N/A — directives dosya bazlı, doğru

## 13. i18n
- TR/EN task header desteği: `/^##\s+(Görev|Task)\s+\d+/` → ✅ **İYİ**
- Hata mesajları İngilizce
- `computeBreakdown` regex: `/verif|history|comparison|doc\s+criter/i` — İngilizce ağırlıklı, Türkçe task başlıkları doğru kategorize edilmeyebilir → **P3 i18n gap**

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Çok detaylı, örnek format içeriyor
- Model estimation mantığı şeffaf

## 15. Performance
- Tek writeFileSync + regex scan — **sorunsuz**

## 16. Öneriler
- **P1:** Dedicated test dosyası eksik
- **P2:** computeBreakdown TR task başlıkları için Türkçe regex ekle ("test" → "test|sınav|deneme", "doc" → "doc|dokuman")
- **P3:** JSDoc
- **P3:** computeEstimatedModels — model tier'larla uyumu (ModelRegistry ile entegrasyon?)

## Verdict: ANALYZED
