# Analysis: src/mcp/tools/memory-query.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 71 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Memory V2 sorgu MCP tool'u. SQLite DB'deki proje hafızasını (ADR, sprint, pattern, debt) FTS5 full-text search ile arar. Türkçe normalizasyon, tip/status filtreleme ve sprint aralığı desteği sağlar. Memory V2 mimarisinin MCP arayüzü — en yeni eklenen tool'lardan biri.

## 2. Public API
- `registerMemoryQueryTool(server: McpServer): void` — JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
- `../../core/memory-store.js` → MemoryStore
- `../../core/memory-query.js` → searchMemory
- `../../core/constants.js` → BRAIN_DIR, MEMORY_DB_FILE
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1 (handler)
- Max cyclomatic: ~3 (DB check + search + format)
- **Düşük karmaşıklık** — thin wrapper

## 6. Type Safety
- `any`: 0
- Non-null `!`: 0
- `r.entry.summary ?? r.entry.content.slice(0, 200)` satır 60 — **potansiyel sorun**: content undefined olabilir mi? MemoryEntryV2'de content zorunlu → güvenli
- **İYİ**

## 7. ADR Compliance
- **ADR-008**: ✅ — core memory modüllerinden import
- **ADR-010**: ✅
- **Memory V2 DB-first**: ✅✅ — **Tam uyumlu**, MemoryStore ve searchMemory kullanıyor
- **ADR-022**: ⚠️ — CLI `deckent recall` karşılığı mevcut ama isim farklı (recall vs memory_query)

## 8. Test Coverage
- Dedicated test: **YOK** (`tests/mcp/tools/memory-query.test.ts` mevcut değil)
- **P0 GAP** — Memory V2'nin MCP arayüzü, 0 test ciddi

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- Yok ✅

## 11. Security
- DB path: `join(root, BRAIN_DIR, MEMORY_DB_FILE)` — sabit path ✅
- `root` parametresi: `rootParam || process.cwd()` → **path traversal riski** — kullanıcı `root: "/etc"` verebilir
- **P2** — root parametresi sanitize edilmeli veya kaldırılmalı
- SQL injection: MemoryStore parametrized query kullanıyor → **güvenli**

## 12. Memory V2 Uyumu
- **Tam uyumlu** — DB-first, FTS5, MemoryStore + searchMemory
- `store.close()` finally bloğunda → ✅ resource cleanup
- Türkçe normalizasyon searchMemory içinde otomatik → ✅

## 13. i18n
- Hata mesajları İngilizce: "Memory V2 DB not found.", `No results for "${query}".`
- **i18n gap** — düşük öncelik

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ İyi
- **help.ts TOOLS dizisinde YOK** → **P0**
- DECKENT.md MCP tool tablosunda: ✅ `deckent_memory_query` listeleniyor

## 15. Performance
- MemoryStore açılıp kapanıyor her çağrıda → **connection pooling yok**
- FTS5 search hızlı → **kabul edilebilir**
- **İyileştirme fırsatı**: singleton MemoryStore

## 16. Öneriler
- **P0:** Dedicated test dosyası — memory-query.test.ts oluşturulmalı (en az 5 test: search, filter, empty, no-db, close)
- **P0:** help.ts TOOLS dizisine eklenmeli
- **P2:** root parametresi sanitizasyonu
- **P2:** MemoryStore connection pooling/singleton — her MCP çağrısında açıp kapatmak yerine
- **P3:** JSDoc
- **P3:** enrichResponse kullanımı eksik — diğer tool'larla tutarsız (düz text döndürüyor)

## Verdict: ANALYZED
