# Analysis: src/mcp/tools/history.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 87 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Sprint geçmişi MCP tool'u. `.brain/sprints/` altındaki sprint log dosyalarını okur, son N sprint'i gösterir. Task tamamlanma oranlarına bakarak trend analizi yapar (improving/declining/stable/insufficient_data). JSON raw mode veya human-readable summary döner. `collectSprintFiles` helper'ıyla dosya toplama ve sıralama yapar.

## 2. Public API
- `registerHistoryTool(server: McpServer): void` — JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
- `../helpers/enrich.js` → enrichResponse
- `../helpers/format.js` → formatHistoryResponse, wrapResponse, HistoryData
- `../../orchestra/sprint-reporter.js` → collectSprintFiles
- Döngüsel bağımlılık: YOK ama orchestra'ya bağımlılık ADR-008 açısından incelenmeli

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 2 (detectTrend, registerHistoryTool callback)
- Max cyclomatic: ~5 (detectTrend — multiple null/length checks)
- En karmaşık: `detectTrend` satır 9-26

## 6. Type Safety
- `any`: 0
- `as HistoryData` satır 51, 73 — format helper'a cast
- `as Array<{ done: number; total: number }>` satır 15 — filter(Boolean) sonrası cast, TypeScript narrowing yeterli olmadığı için gerekli
- Non-null `!`: 0
- **İYİ**

## 7. ADR Compliance
- **ADR-008**: ⚠️ — `sprint-reporter.js` orchestra modülü. MCP tool'un orchestra'dan import etmesi, ADR-008'in "brain dışında kimse orchestra'dan import etmemeli" kuralına uyumluluğu tartışmalı. Sprint-reporter utility fonksiyonu olarak kabul edilebilir.
- **ADR-022**: ✅ — CLI `deckent history` karşılığı mevcut
- **Memory V2**: ⚠️ — Sprint logları hâlâ dosya bazlı okunuyor (DB'de de var ama dosya erişimi devam ediyor)

## 8. Test Coverage
- Dedicated test: **YOK** (`tests/mcp/tools/history.test.ts` mevcut değil)
- **P1 GAP**

## 9. TODO/FIXME/HACK Inventory
- Hiç yok ✅

## 10. Dead Code
- Yok ✅

## 11. Security
- Düşük risk — dosya okuma BRAIN_DIR altında, kullanıcı parametresi yalnızca `last` (sayı) ve `json` (boolean)
- `last` Zod ile min(1).max(50) sınırlı → **güvenli**

## 12. Memory V2 Uyumu
- Sprint logları hâlâ dosyadan okunuyor — DB'den `type: 'sprint'` çekilebilir
- **İyileştirme fırsatı** ama mevcut dosya bazlı yaklaşım çalışıyor

## 13. i18n
- Hardcoded: "Failed to read sprint history:" satır 80
- detectTrend regex: `/(\d+)\/(\d+)\s*(tasks?|görev)/i` — TR/EN dual ✅

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı ve doğru
- JSDoc: YOK

## 15. Performance
- `collectSprintFiles` tüm sprint dosyalarını tarar + readFileSync ile okur → **büyük sprint geçmişinde performans sorunu olabilir**
- `slice(-last)` ile sınırlama var ama önce tüm dosyalar toplanıyor

## 16. Öneriler
- **P1:** Dedicated test dosyası eksik
- **P2:** DB-first sprint history seçeneği — MemoryStore'dan `type: 'sprint'` çek
- **P2:** collectSprintFiles yerine lazy file listing + son N dosya sadece okunmalı
- **P3:** JSDoc eklenmeli

## Verdict: ANALYZED
