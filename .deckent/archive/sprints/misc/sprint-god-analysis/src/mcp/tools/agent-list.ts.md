# Analysis: src/mcp/tools/agent-list.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 112 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Agent havuzunu listeleyen MCP tool'u. `.deckent/agents/` altındaki agent manifest dosyalarını okur. Her agent için id, name, type (built-in/temp), total uses ve success rate bilgisini döner. Agent pool sağlığını denetlemek, aktif agentları kontrol etmek veya routing atamalarını anlamak için kullanılır.

## 2. Public API
- `registerAgentListTool(server: McpServer): void` — JSDoc YOK → **EKSİK**
- Module-private: AgentStats, AgentManifest, AgentEntry interfaces
- Module-private: resolveAgentType, readAgents fonksiyonları

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DECKENT_DIR
- Döngüsel bağımlılık: YOK
- **Not:** agent-pool.ts ile bağlantı yok — direkt disk okuma

## 4. Dış Bağımlılıklar
- `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu
- **Not:** zod yok, inputSchema yok — parametre almıyor

## 5. Complexity
- Fonksiyon sayısı: 3 (resolveAgentType, readAgents, handler)
- Max cyclomatic: ~4 (readAgents — dir scan + JSON parse)
- **Düşük karmaşıklık**

## 6. Type Safety
- `as AgentManifest` satır 49 — JSON.parse cast, tüm field'lar optional
- Non-null `!`: 0
- **İYİ**

## 7. ADR Compliance
- **ADR-008**: ✅ — core import sadece constants
- **ADR-010**: ✅
- **ADR-022**: ✅ — CLI `deckent agent list` karşılığı

## 8. Test Coverage
- Dedicated test: **YOK**
- **P2 GAP** — read-only, düşük risk

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- Yok ✅

## 11. Security
- Salt okunur, parametre almıyor
- **Güvenli**

## 12. Memory V2 Uyumu
- N/A — agent manifest'ler dosya bazlı, Memory V2 ile ilgisi yok

## 13. i18n
- Tool description İngilizce
- Hata mesajları İngilizce (sadece error.message forwarding)
- **Minimal i18n gap**

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı
- **help.ts'de TOOLS dizisinde YOK** → **P0 tutarsızlık**

## 15. Performance
- Sync I/O: readdirSync ×2, existsSync ×N (her agent dir için), readFileSync ×N
- Agent sayısı genelde ~16-50 → **kabul edilebilir**

## 16. Öneriler
- **P0:** help.ts TOOLS dizisine eklenmeli
- **P2:** Dedicated test dosyası
- **P3:** enrichResponse kullanımı eksik — diğer tool'larla tutarsız (direkt JSON.stringify response)
- **P3:** JSDoc

## Verdict: ANALYZED
