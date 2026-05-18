# Analysis: src/mcp/resources/agents.ts
**Task ID:** 142-026 | **Model:** opus | **LoC:** 46 | **Effort:** max

## 1. Amacı
MCP resource olarak `deckent://agents` URI'sini kayıt eder. .deckent/agents/ altındaki agent.json dosyalarını okur ve JSON array olarak döner. Agent havuzunun (built-in + temp) MCP istemcilere sunulması için. Dosya-tabanlı — doğru.

## 2. Public API
- `registerAgentsResource(server: McpServer): void` — tek export, JSDoc YOK → **EKSIK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DECKENT_DIR
- Döngüsel: YOK
- **NOT:** `AGENTS_DIR` modül seviyesinde tanımlanıyor (satır 6) — `join(DECKENT_DIR, 'agents')` statik

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, existsSync, readdirSync), `node:path` — built-in
- `@modelcontextprotocol/sdk` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1
- Max cyclomatic: ~5 (existsSync + for loop + existsSync + try/catch)
- En karmaşık: agent dizinleri döngüsü (satır 32-39)

## 6. Type Safety
- `agents: unknown[]` — doğru
- `any`: 0, cast: 0, `!`: 0
- **TEMIZ**

## 7. ADR Compliance
- **ADR-008:** ✅
- **ADR-010:** ✅
- **ADR-022:** ✅ — CLI `deckent agent list` ↔ MCP resource
- **Memory V2:** N/A (agent manifest dosyaları)

## 8. Test Coverage
- Test: resources.test.ts → deckent://agents (3 test)
- Edge: dizin yok, agent dosyası var
- **EKSİK:** readdirSync hatası, agent.json olmayan dizin, malformed JSON

## 9. TODO/FIXME/HACK Inventory
- Yok

## 10. Dead Code
- Yok

## 11. Security
- Yol sabit (.deckent/agents/) → path traversal YOK
- Bozuk JSON sessizce atlanıyor — güvenli

## 12. Memory V2 Uyumu
- N/A — agent manifest'ler dosya-tabanlı

## 13. i18n
- "Agent pool list from .deckent/agents/" — EN
- **MINOR**

## 14. Dokümantasyon Tutarlılığı
- JSDoc: **EKSIK**
- DECKENT.md: ✅ agents resource listelenmiş

## 15. Performance
- readdirSync + for döngüsünde existsSync + readFileSync — sync I/O çoklu
- Agent sayısı genellikle <20 → **KABUL EDİLEBİLİR**

## 16. Öneriler
- **P3:** JSDoc ekle
- **P3:** Agent istatistikleri (totalUses, successRate) dahil edilebilir (sadece manifest dönüyor)

## Verdict: ANALYZED
