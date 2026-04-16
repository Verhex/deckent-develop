# Analysis: src/mcp/tools/explain.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 150 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Sprint açıklama MCP tool'u. Sprint log ve RETRO.md'yi okuyarak insan-dostu bir sprint özeti üretir. Sprint hedefi, task sonuçları (tamamlanan/başarısız/tech debt), süre ve öğrenimleri döner. Belirli sprint ID'ye, verbose mode'a ve JSON çıktıya destek verir. CLI `explain` komutunun yeniden kullanılabilir parser fonksiyonlarını import eder.

## 2. Public API
- `registerExplainTool(server: McpServer): void` — JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → BRAIN_DIR, RETRO_FILE, SPRINTS_DIR
- `../helpers/enrich.js` → enrichResponse
- `../helpers/format.js` → formatExplainResponse, wrapResponse, ExplainData
- `../../cli/commands/explain.js` → 6 fonksiyon import (findLatestSprintLog, parseSprintLog, parseSprintNumber, parseRetroLearnings, extractGoalFromDirectives, extractGoalFromSprintLog, buildExplainOutput, formatDuration)
- Döngüsel bağımlılık: YOK
- **Dikkat:** CLI commands'tan import — **kod paylaşımı iyi pattern** ama MCP→CLI yönünde bağımlılık

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1 (handler — complex)
- Max cyclomatic: ~8 (sprintId resolution + goal extraction fallback chain + JSON/human mode)
- En karmaşık: handler callback satır 32-148 — **117 satır**

## 6. Type Safety
- `as unknown as Record<string, unknown>` satır 47, 59, 134 — **3 unsafe double cast** → enrichResponse tip uyumsuzluğunu maskeler
- `ExplainData` import ve kullanım doğru
- **P2 — enrichResponse generic olmalı**

## 7. ADR Compliance
- **ADR-008**: ⚠️ — CLI commands'tan import. Brain dışında bir modül CLI'dan import ediyor — utility paylaşımı kabul edilebilir
- **ADR-022**: ✅ — CLI `deckent explain` ile parity (**kaynak kodu bile paylaşıyor**)
- **Memory V2**: ⚠️ — Sprint log ve RETRO dosyadan okunuyor, DB-first değil

## 8. Test Coverage
- Dedicated test: ✅ `tests/mcp/tools/explain.test.ts` mevcut
- **İYİ — bu batch'teki nadir test'e sahip dosyalardan biri**

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- `formatDuration` satır 17'de import ediliyor — satır 109'da kullanılıyor ✅
- Tüm 6 import kullanılıyor

## 11. Security
- `sprintId` parametresi dosya adına ekleniyor: `sprint-${paddedId}.md` — padStart(3, '0') ile sayıya dönüştürülüyor
- `cleanId = sprintId.replace(/^sprint-/, '')` sonra `paddedId = cleanId.padStart(3, '0')` — **non-numeric input'ta "abc".padStart(3, '0') = "abc"** → dosya bulunamaz, hata dönmez ama güvenli
- **Düşük risk**

## 12. Memory V2 Uyumu
- Sprint log ve RETRO dosyadan okunuyor — DB-first seçenek eklenebilir
- **İyileştirme fırsatı**

## 13. i18n
- `buildExplainOutput(sprintSummary, learnings, 'en', verbose)` satır 131 — hardcoded 'en' → **i18n destekli ama hep İngilizce çıktı**
- **P2** — locale config'den okunmalı

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Çok detaylı
- JSDoc: YOK

## 15. Performance
- Sprint log dosyası + RETRO.md okuma — max 2 dosya
- Hot path değil
- **Sorunsuz**

## 16. Öneriler
- **P2:** `as unknown as Record<string, unknown>` 3 yerde — enrichResponse generic yapılmalı
- **P2:** Hardcoded 'en' locale → config'den oku
- **P3:** Handler 117 satır — helper fonksiyonlara bölünmeli
- **P3:** JSDoc

## Verdict: ANALYZED
