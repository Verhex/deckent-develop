# Analysis: src/mcp/server.ts
**Task ID:** 141-004 | **LoC:** 109

## 1. Amaci

MCP server entry point — McpServer instance olusturur, tum 22 tool ve 8 resource'u kaydeder, StdioServerTransport ile baglanir. `createServer()` fonksiyonunu ve `mcpNotifyAdapter` global'ini export eder.

## 2. Public API

```typescript
export const DECKENT_MCP_INSTRUCTIONS: string   // LLM system prompt string (22 tool docs)
export let mcpNotifyAdapter: McpNotificationAdapter | null  // mutable global adapter ref
export async function createServer(): Promise<void>
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `@modelcontextprotocol/sdk` — McpServer, StdioServerTransport

**Ic:**
- `core/constants.js` — DECKENT_VERSION, PROJECT_NAME
- `tools/index.js` — registerTools()
- `resources/index.js` — registerResources()
- `core/notify-adapters/mcp-adapter.js` — McpNotificationAdapter

## 4. Complexity

- 2 fonksiyon: `createServer()` ve `main()` (IIFE)
- Cyclomatic complexity ~1 her biri icin
- Toplam kod akisi cok lineer — tool/resource registration tek cagri
- `main()` call-chain: createServer → registerTools → registerResources → connect

## 5. Type Safety

- `mcpNotifyAdapter` typed as `McpNotificationAdapter | null` — mutable module-level export
- `let` ile tanimlanan global export — race condition riski: birden fazla createServer() cagrisi ust uste yazabilir
- `as McpServer` cast internal server reference
- Genel olarak temiz, generic `any` yok

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | COMPLIANT | orchestra'dan import yok — sadece tools/resources barrel |
| ADR-010 | COMPLIANT | @modelcontextprotocol/sdk MCP katmani icin kabul edilebilir |
| ADR-001 ESM | COMPLIANT | .js uzantili importlar kullaniliyor |

## 7. Test Coverage

- Beklenen: `tests/mcp/server.test.ts`
- Test kategorisi: `mcp` (27 test dosyasi mevcut)
- createServer() icin: tool registration count, resource registration count, transport connection dogrulanmali

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK comment bulunamadi.

## 9. Dead Code Candidates

- `mcpNotifyAdapter` module-level mutable export — encapsulation icin kapatilabilir (getter fonksiyonu)
- `main()` IIFE — server.ts hem module hem executable — ayri entry point daha temiz olabilir

## 10. Security Findings

- **DUSUK RISK:** stdio transport kullaniliyor — network exposure yok
- `process.stderr` error output — dogru pattern (stdout MCP protokol icin rezerv)
- `mcpNotifyAdapter` mutable global — teorik olarak external code tarafindan null'a cekilebilir

## 11. Memory V2 Uyumu

N/A — server.ts Memory V2 ile dogrudan etkilesim yok. Bootstrap katmani.

## 12. Oneriler

1. **KRITIK BUG:** `DECKENT_MCP_INSTRUCTIONS` icinde "Tools (21)" yaziyor — gercekte 22 tool kayitli (memory_query Sprint 140'ta eklendi). LLM kullanicilara yanlis bilgi gosteriliyor. Duzeltilmeli: "Tools (22)".
2. `mcpNotifyAdapter` module-level mutable export yerine `getNotifyAdapter()` accessor tercih edilmeli — encapsulation ve test isolation icin.
3. `main()` IIFE'yi server.ts'den ayri bir `bin/mcp-server.ts` entry point'e tasimak daha temiz mimari saglar.
4. `createServer()` idempotent degil — iki kez cagirilirsa iki server instance olusur.

## 13. Verdict

**ANALYZED** — Dosya tam olarak okundu ve analiz edildi. Kritik documentation bug (Tools 21 vs 22) Sprint 142 oncelikli fix listesine eklenmeli.
