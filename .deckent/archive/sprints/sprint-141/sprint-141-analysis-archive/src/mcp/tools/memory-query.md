# Analysis: src/mcp/tools/memory-query.ts
**Task ID:** 141-004 | **LoC:** 70

## 1. Amaci

`deckent_memory_query` MCP tool — proje hafizasinda cross-source arama saglar. ADR, sprint ogrenimi, teknik borc ve pattern kayitlarini FTS5 full-text search + Turkish normalization ile sorgular. Memory V2 DB-first mimarisinin MCP katmanindaki kanonical entry point'i.

## 2. Public API

```typescript
export function registerMemoryQueryTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  query: z.string(),                    // FTS5 arama metni
  type: z.array(z.string()).optional(), // ['adr', 'memory', 'sprint', 'debt', 'pattern']
  status: z.array(z.string()).optional(),
  limit: z.number().default(5),
  sprint_min: z.number().optional(),
  root: z.string().optional()           // proje koku (default: process.cwd())
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `@modelcontextprotocol/sdk` — McpServer, CallToolResultSchema
- `zod/v4` — schema validasyon

**Ic:**
- `node:path` — DB path resolution
- `node:fs` — existsSync (DB varlik kontrolu)
- `core/memory-store.js` — MemoryStore class
- `core/memory-query.js` — searchMemory()
- `core/constants.js` — BRAIN_DIR, MEMORY_DB_FILE

## 4. Complexity

- 1 ana fonksiyon (handler async)
- Cyclomatic complexity ~3:
  1. DB bulunamadi → erken return
  2. Sonuc bos → bos mesaj
  3. Normal path → format + return
- try/finally store.close() — resource management dogru
- `r.entry.summary ?? r.entry.content.slice(0, 200)` graceful fallback

## 5. Type Safety

- `z.object()` schema tam tipli — Zod inference kullaniliyor
- `MemorySearchResult[]` donus tipi explicit
- `r.entry.summary` optional field — null coalescing ile guvenli erisim
- Generic `any` yok

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-040 DB-first | **FULLY COMPLIANT** | Sadece MemoryStore + searchMemory kullaniliyor |
| ADR-008 | COMPLIANT | core/ importlari, orchestra yok |
| ADR-001 ESM | COMPLIANT | .js uzantili importlar |

**Annotations:**
- `readOnlyHint: true` — dogru (DB sadece okunuyor)
- `idempotentHint: true` — dogru (ayni sorgu ayni sonuc)

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/memory-query.test.ts`
- Test senaryolari:
  - DB mevcut degil → hata mesaji
  - Bos sonuc → "No results found"
  - FTS5 Turkish normalize ile arama
  - type/status filtreleri
  - limit parametresi
  - try/finally close() dogrulamasi

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK comment bulunamadi.

## 9. Dead Code Candidates

Yok. Her kod satiri aktif.

## 10. Security Findings

- **DUSUK RISK:** `root` parametresi user-controlled — DB path construction: `path.join(root, BRAIN_DIR, MEMORY_DB_FILE)`. `existsSync` kontrolu ile crash onleniyor.
- FTS5 sorgu injection: `searchMemory()` parametrized query kullandiginda guvenli. FTS5 syntax injection riski `better-sqlite3` parametrized API ile minimize.
- `process.cwd()` default — CLI context icin kabul edilebilir

## 11. Memory V2 Uyumu

**FULLY COMPLIANT** — Memory V2 mimarisinin MCP kanonical entry point'i:
- SQLite MemoryStore direkt kullaniyor
- FTS5 + dual-layer Turkish normalization (searchMemory() icerisinde)
- try/finally ile connection leak yok
- `MEMORY_DB_FILE` constant ile DB path tutarli

## 12. Oneriler

1. `sprint_max` parametresi eklenebilir — tam aralik destegi icin (`sprint_range: { min, max }`).
2. `tags_contain` filter parametresi eklenebilir — memory-query.ts API surface ile tam eslesme.
3. Sonuc formatlama fonksiyonu ayri helper'a cikarilabilir — test edilebilirlik icin.
4. `root` parametresi path traversal dogrulamasi: `path.resolve(root)` ile normalize edilmeli.

## 13. Verdict

**ANALYZED** — Memory V2 MCP entegrasyonu tam ve dogru. Kritik eksiklik yok. Sprint 142 gelistirme onerileri: sprint_max + tags_contain parametreleri.
