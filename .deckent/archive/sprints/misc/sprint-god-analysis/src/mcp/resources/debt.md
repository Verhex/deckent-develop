# Analysis: src/mcp/resources/debt.ts
**Task ID:** 142-026 | **Model:** opus | **LoC:** 50 | **Effort:** max

## 1. Amacı
MCP resource olarak `deckent://debt` URI'sini kayıt eder. Teknik borç kayıtlarını (type: 'debt') SQLite DB'den çeker, DebtItem arayüzüne dönüştürür ve JSON array olarak döner. Sprint incelemesi ve borç yönetimi için MCP istemcilere veri sağlar.

## 2. Public API
- `registerDebtResource(server: McpServer): void` — tek export, JSDoc YOK → **EKSIK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → BRAIN_DIR, MEMORY_DB_FILE
- `../../core/types.js` → DebtItem (type-only import)
- `../../core/memory-store.js` → MemoryStore
- Döngüsel: YOK

## 4. Dış Bağımlılıklar
- `node:fs`, `node:path` — built-in
- `@modelcontextprotocol/sdk` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1
- Max cyclomatic: ~5 (if + try/catch + map transform)
- En karmaşık: entries.map() dönüşüm bloğu (satır 27-39) — metadata JSON.parse + fallback değerler

## 6. Type Safety
- `any` sayısı: 0
- `as DebtItem['priority']` cast: satır 34 — **DIKKAT:** toUpperCase() sonucu her zaman geçerli DebtItem priority olmayabilir. Metadata'dan gelen değer 'low', 'high', 'normal', 'critical' dışındaysa type safety kırılır
- Non-null `!`: 0
- **SORUN:** Unsafe cast — priority değeri validate edilmeden cast ediliyor

## 7. ADR Compliance
- **ADR-008:** ✅ core/ modüllerinden import
- **ADR-010:** ✅ Sadece built-in + SDK
- **ADR-022:** ✅ CLI/MCP parity — debt resource mevcut
- **Memory V2 DB-first:** ✅ Tamamen DB-first

## 8. Test Coverage
- Test: resources.test.ts → deckent://debt describe bloğu (4 test)
- DB-first: ✅ mockMemStore.getByType mocklanmış
- Edge: boş DB, CRITICAL priority, resolved item test edilmiş
- **EKSİK:** Malformed metadata JSON parse hatası test edilmemiş (satır 28 JSON.parse crash)

## 9. TODO/FIXME/HACK Inventory
- Yok

## 10. Dead Code
- Yok

## 11. Security
- **P2:** `JSON.parse(d.metadata || '{}')` — metadata bozuksa catch'e düşer ama tüm entries listesi kaybolur (partial failure handling yok)
- SQL injection: getByType parametrized — güvenli

## 12. Memory V2 Uyumu
- ✅ DB-first — MemoryStore.getByType('debt')
- ✅ Eski parseDebtTable() yok
- ✅ DEBT.md readFileSync yok

## 13. i18n
- Hardcoded EN: "Technical debt items" (description)
- **MINOR:** i18n desteği yok

## 14. Dokümantasyon Tutarlılığı
- JSDoc: **EKSIK**
- DECKENT.md: ✅ debt resource listelenmiş
- api-surface.md DebtItem alanları: id, description, originTaskId, priority, sprintsOpen, resolved, resolvedInSprintId, createdAt — **DB mapping doğru**

## 15. Performance
- Her çağrıda yeni MemoryStore connection → **P2**
- Tüm debt entries tek seferde — genellikle az sayıda, sorun değil

## 16. Öneriler
- **P1:** JSON.parse(metadata) hatası halinde partial failure handling ekle (entry atla, diğerlerini dön)
- **P2:** Priority cast'ini validate et (unknown string guard)
- **P2:** Connection pooling
- **P3:** JSDoc ekle

## Verdict: ANALYZED
