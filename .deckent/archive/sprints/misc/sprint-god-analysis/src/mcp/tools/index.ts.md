# Analysis: src/mcp/tools/index.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 49 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
MCP tool'larının toplu kayıt modülü (barrel register). Tüm MCP tool'larını import eder ve `registerTools(server)` ile tek çağrıda kaydeder. server.ts tarafından kullanılır. Yeni tool ekleme/çıkarma için tek değişiklik noktası.

## 2. Public API
- `registerTools(server: McpServer): void` — JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
22 import:
1. `./init.js` → registerInitTool
2. `./directives.js` → registerSetDirectivesTool
3. `./plan.js` → registerPlanTool
4. `./start.js` → registerStartTool
5. `./status.js` → registerStatusTool
6. `./doctor.js` → registerDoctorTool
7. `./retro.js` → registerRetroTool
8. `./history.js` → registerHistoryTool
9. `./analyze.js` → registerAnalyzeTool
10. `./sync.js` → registerSyncTool
11. `./config.js` → registerConfigTool
12. `./review.js` → registerReviewTool
13. `./run.js` → registerRunTool
14. `./kill.js` → registerKillTool
15. `./cleanup.js` → registerCleanupTool
16. `./help.js` → registerHelpTool
17. `./agent-list.js` → registerAgentListTool
18. `./skill-list.js` → registerSkillListTool
19. `./checkpoint.js` → registerCheckpointTool
20. `./docs.js` → registerDocsTool
21. `./explain.js` → registerExplainTool
22. `./memory-query.js` → registerMemoryQueryTool

**22 tool kayıtlı** — DECKENT.md'deki "22 tools" iddiasıyla UYUMLU ✅

## 4. Dış Bağımlılıklar
- `@modelcontextprotocol/sdk` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1
- Max cyclomatic: 1
- **Minimum karmaşıklık** — barrel module

## 6. Type Safety
- `any`: 0
- **Mükemmel**

## 7. ADR Compliance
- **ADR-008**: ✅
- **ADR-010**: ✅
- **ADR-022**: ✅ — 22 tool kaydı, CLI parity

### Tool Sayısı Doğrulaması
| Kaynak | Sayı | Tutarlı? |
|--------|------|----------|
| index.ts register çağrıları | 22 | ✅ Referans |
| DECKENT.md "22 tools" | 22 | ✅ |
| IDENTITY.md "MCP Tools: 22" | 22 | ✅ |
| help.ts TOOLS dizisi | **16** | ❌ **6 EKSİK** |
| DECKENT.md tool tablosu | 22 | ✅ |

## 8. Test Coverage
- Dedicated test: **YOK** (barrel module testi genelde gereksiz)
- `tests/mcp/tools/misc-tools.test.ts` bazı tool'ları test edebilir

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- Yok — tüm import'lar kullanılıyor

## 11. Security
- N/A — sadece register çağrıları

## 12. Memory V2 Uyumu
- `registerMemoryQueryTool` satır 23, 48 — ✅ Memory V2 tool kayıtlı

## 13. i18n
- N/A

## 14. Dokümantasyon Tutarlılığı
- Satır 17 yorum: `// deckent_help` — sadece help için yorum var, diğer import'larda yorum yok → **tutarsız ama zararsız**
- **Kritik**: help.ts ile arada 6 tool farkı → **P0**

## 15. Performance
- N/A — tek seferlik kayıt

## 16. Öneriler
- **P0:** help.ts TOOLS dizisi 22'ye tamamlanmalı — index.ts ile tutarlı olmalı
- **P3:** JSDoc
- **P3:** Import sıralaması — kategorize edilmiş yorumlar eklenebilir (lifecycle, query, admin, meta)

## Verdict: ANALYZED
