# Analysis: src/mcp/server.ts
**Task ID:** 142-026 | **Model:** opus | **LoC:** 109 | **Effort:** max

## 1. Amacı
MCP sunucusunun ana giriş noktası. McpServer instance'ı oluşturur, tüm tool ve resource'ları kayıt eder, MCP notification adapter'ını bağlar ve stdio transport üzerinden çalıştırır. `#!/usr/bin/env node` shebang ile doğrudan çalıştırılabilir.

## 2. Public API
- `createServer(): McpServer` — sunucu fabrika fonksiyonu
- `mcpNotifyAdapter: McpNotificationAdapter | null` — module-level mutable, notification adapter referansı
- `DECKENT_MCP_INSTRUCTIONS: string` — MCP client'lara gönderilen instructions metni
- JSDoc: `mcpNotifyAdapter` için kısa yorum var, diğerleri **EKSIK**

## 3. İç Bağımlılıklar
- `../core/constants.js` → DECKENT_VERSION
- `./tools/index.js` → registerTools
- `./resources/index.js` → registerResources
- `../core/notify-adapters/mcp-adapter.js` → McpNotificationAdapter
- Döngüsel: YOK

## 4. Dış Bağımlılıklar
- `@modelcontextprotocol/sdk/server/mcp.js` → McpServer
- `@modelcontextprotocol/sdk/server/stdio.js` → StdioServerTransport
- ADR-010: ✅ (MCP SDK meşru runtime dependency)

## 5. Complexity
- Fonksiyon sayısı: 2 (createServer, main)
- Max cyclomatic: ~2 (main try/catch)
- **BASİT**

## 6. Type Safety
- `mcpNotifyAdapter: McpNotificationAdapter | null` — let mutable → **DİKKAT:** modül seviyesinde mutable state
- `err: unknown` — catch bloğunda doğru typing (satır 105)
- `any`: 0, cast: 0, `!`: 0
- **TEMIZ**

## 7. ADR Compliance
- **ADR-008:** ✅ (server modülü, brain import yok)
- **ADR-010:** ✅ (MCP SDK + core imports)
- **ADR-022 CLI/MCP parity:** ❌ **TUTARSIZLIK BULUNDU**
  - DECKENT_MCP_INSTRUCTIONS "Tools (21)" diyor ama tools/index.ts 22 tool kayıt ediyor
  - Instructions'da memory_query tool LİSTELENMEMİŞ
  - Instructions'da deckent_help listelenmiş (21 içinde) ama "## Tools (21)" başlığı 22 olmalı
- **ADR-033 product vision:** ✅ Telemetry yok
- **ADR-037 RBAC:** N/A

## 8. Test Coverage
- Test: tests/mcp/server.test.ts — 9 test
- createServer, instructions content, tool names, lifecycle phases, workflow order, DIRECTIVES format, parameters, error recovery, resources
- **SORUN:** Test "instructions contains all 15 tool names" diyor ama gerçekte 22 tool var → **STALE TEST**
- Test sadece 15 tool adı kontrol ediyor — help, agent_list, skill_list, checkpoint, docs, explain, memory_query kontrol EDİLMİYOR

## 9. TODO/FIXME/HACK Inventory
- Yok

## 10. Dead Code
- Yok

## 11. Security
- stderr'e hata yazma (satır 106): process.stderr.write — güvenli
- process.exit(1): unhandled rejection — doğru
- `mcpNotifyAdapter` mutable global: test ortamında sorun yaratabilir (module singleton)
- **P3:** mcpNotifyAdapter mutable state yerine factory pattern düşünülebilir

## 12. Memory V2 Uyumu
- Instructions'da "deckent://memory — Brain memory (MEMORY.md) — sprint learnings" yazıyor
- **SORUN:** "(MEMORY.md)" referansı yanıltıcı — V2'de kaynak artık DB, .md değil
- Instructions'da "deckent://debt — Technical debt log (DEBT.md)" — aynı sorun
- **P2:** Instructions'daki (MEMORY.md), (DEBT.md), (RETRO.md) referanslarını DB-first ile güncelle

## 13. i18n
- DECKENT_MCP_INSTRUCTIONS tamamen İngilizce — **DOĞRU** (MCP instructions client-facing, EN standart)
- İç string yok

## 14. Dokümantasyon Tutarlılığı
- **P1:** "Tools (21)" → gerçek sayı 22 (memory_query dahil)
- **P1:** memory_query tool instructions listesinde YOK
- **P2:** (MEMORY.md), (DEBT.md), (RETRO.md) referansları pre-V2 terminoloji
- DECKENT.md: "22 tools" ✅ — ama server.ts instructions: "21" ❌
- server.ts instructions resource sayısı: "Resources (8)" ✅

## 15. Performance
- createServer(): sync (registerTools + registerResources çağrıları sync)
- main(): async transport connect — doğru
- **KABUL EDİLEBİLİR**

## 16. Öneriler
- **P0:** Instructions'daki "Tools (21)" → "Tools (22)" düzelt, memory_query tool'u listeye ekle
- **P1:** Test'teki "all 15 tool names" → 22 tool kontrolüne güncelle
- **P2:** Instructions'daki (MEMORY.md), (DEBT.md), (RETRO.md) → DB-first terminoloji güncelle
- **P3:** mcpNotifyAdapter mutable global → factory/getter pattern

## Verdict: ANALYZED
