# Analysis: src/mcp/resources/tasks.ts
**Task ID:** 142-026 | **Model:** opus | **LoC:** 41 | **Effort:** max

## 1. Amacı
MCP resource olarak `deckent://tasks` URI'sini kayıt eder. .tasks/ dizinindeki task JSON dosyalarını okur, parse eder ve JSON array olarak döner. Aktif sprint task listesinin MCP istemcilere sunulması için. Dosya-tabanlı — doğru, çünkü task dosyaları worker'lar tarafından runtime'da oluşturulur.

## 2. Public API
- `registerTasksResource(server: McpServer): void` — tek export, JSDoc YOK → **EKSIK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → TASKS_DIR
- Döngüsel: YOK

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, existsSync, readdirSync), `node:path` — built-in
- `@modelcontextprotocol/sdk` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1
- Max cyclomatic: ~5 (existsSync + for loop + try/catch × 2)
- En karmaşık: task dosyaları okuma döngüsü (satır 26-35)

## 6. Type Safety
- `tasks: unknown[]` — satır 24 — doğru, JSON.parse sonucu unknown
- `any`: 0, cast: 0, `!`: 0
- **TEMIZ**

## 7. ADR Compliance
- **ADR-008:** ✅
- **ADR-010:** ✅
- **ADR-022:** ✅
- **Memory V2:** N/A (task dosyaları, DB'de değil)

## 8. Test Coverage
- Test: resources.test.ts → deckent://tasks (3 test)
- Edge: dizin yok → boş liste, task dosyası var → parse edilmiş
- **EKSİK:** Malformed task JSON, readdirSync hatası, .hb/.result/.plan dosyalarının filtrelenmesi

## 9. TODO/FIXME/HACK Inventory
- Yok

## 10. Dead Code
- Yok

## 11. Security
- readdirSync + readFileSync: yol sabit (.tasks/) → path traversal YOK
- JSON.parse: bozuk dosya sessizce atlanıyor — güvenli

## 12. Memory V2 Uyumu
- N/A — task dosyaları file-based (runtime state)

## 13. i18n
- "Active task list from .tasks/*.json" — EN
- **MINOR**

## 14. Dokümantasyon Tutarlılığı
- JSDoc: **EKSIK**
- DECKENT.md: ✅ tasks resource listelenmiş
- Dosya filtresi: `f.startsWith('task-') && f.endsWith('.json')` — doğru, .hb/.result/.plan dışlanıyor

## 15. Performance
- readdirSync + for döngüsünde readFileSync — sync I/O çoklu
- Task sayısı genellikle <50 → **KABUL EDİLEBİLİR**
- **P3:** Çok task varsa (100+) async okuma düşünülebilir

## 16. Öneriler
- **P3:** JSDoc ekle
- **P3:** Çok task senaryosu için async refactor düşünülebilir

## Verdict: ANALYZED
