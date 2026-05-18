# Analysis: src/mcp/tools/memory-query.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 70 | **Effort:** max

## 1. Amacı
MCP üzerinden proje hafızasını sorgulama aracı. `deckent_memory_query` tool olarak kayıtlı. Brain DB'deki ADR, sprint learnings, pattern, debt gibi kayıtları FTS5 full-text search ile arar ve sonuçları formatlanmış metin olarak döndürür. Claude Code, Cursor, VS Code gibi MCP destekleyen tüm ortamlarda kullanılır. Sprint 140'da eklendi, en yeni MCP tool.

## 2. Public API
- `registerMemoryQueryTool(server: McpServer): void` — tek export, server'a tool kaydeder
- JSDoc: **YOK** — export fonksiyonu için JSDoc eksik

## 3. İç Bağımlılıklar
- `../../core/memory-store.js` → MemoryStore class (DB erişimi)
- `../../core/memory-query.js` → searchMemory() fonksiyonu (FTS5 arama)
- `../../core/constants.js` → BRAIN_DIR, MEMORY_DB_FILE
- Döngüsel bağımlılık riski: **YOK** — sadece core/ modüllerini import eder

## 4. Dış Bağımlılıklar
- `node:path` (join) — Node built-in
- `node:fs` (existsSync) — Node built-in
- `@modelcontextprotocol/sdk/server/mcp.js` — MCP SDK (type-only import)
- `zod/v4` — schema validation
- ADR-010 uyumu: **UYUMLU** — sadece izinli bağımlılıklar (commander, better-sqlite3 aracılığıyla, zod, MCP SDK)

## 5. Complexity
- Fonksiyon sayısı: 1 (registerMemoryQueryTool)
- Max cyclomatic: ~4 (if branches: db yoksa, sonuç yoksa, summary/content ternary)
- En karmaşık bölüm: satır 58-62 — results.map() formatlaması

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 0
- **MÜKEMMEL** — Zod schema + TypeScript strict, type safety tam

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A — spawn kullanmıyor
- **ADR-008 brain import**: ✅ UYUMLU — sadece core/ modüllerini import eder, orchestra/ yok
- **ADR-010 deps**: ✅ UYUMLU — zod, MCP SDK
- **ADR-022 CLI/MCP parity**: ⚠️ CLI karşılığı `deckent recall` komutu. CLI recall text + type + limit parametreleri alır. MCP'de ek olarak `status`, `sprint_min` parametreleri var — MCP daha zengin. Parity sağlanıyor ama parametreler eşleşmiyor.
- **ADR-033 product vision**: ✅ — telemetry yok, lokal çalışır
- **ADR-037 RBAC**: N/A — read-only tool
- **ADR-039 self-modifying**: N/A
- **Memory V2 DB-first**: ✅ TAM UYUMLU — MemoryStore + searchMemory, .md parse yok

## 8. Test Coverage
- **MCP-seviye dedicated test: YOK** — tests/mcp/tools/ altında memory-query.test.ts **MEVCUT DEĞİL**
- tests/core/memory-query.test.ts mevcut (core arama fonksiyonunu test eder)
- tests/integration/memory-v2.test.ts mevcut (entegrasyon)
- **P1 GAP**: MCP tool parametreleri (schema validasyon, edge case) için dedicated test yazılmalı

## 9. TODO/FIXME/HACK Inventory
- **YOK** — temiz

## 10. Dead Code
- Kullanılmayan export: YOK
- Unreachable branch: YOK

## 11. Security
- **SQL Injection**: ✅ GÜVENLİ — searchMemory() MemoryStore üzerinden parametrized query kullanır
- **Input validation**: ✅ Zod schema ile tüm girişler validasyondan geçer
- **Secret exposure**: YOK
- **Path traversal**: Potansiyel risk — `root` parametresi kullanıcıdan gelir (`rootParam || process.cwd()`). Kötü niyetli root path ile başka dizinlerdeki DB'ye erişim mümkün. MCP bağlamında düşük risk ama sanitize edilmemiş. **P3**

## 12. Memory V2 Uyumu
- ✅ **TAM DB-FIRST** — MemoryStore açıp searchMemory çağırır, .md parse yok
- store.close() finally bloğunda çağrılır — kaynak sızıntısı yok
- ✅ Eski V1 fallback yok

## 13. i18n
- Hardcoded İngilizce string'ler: "Memory V2 DB not found. Run migration first.", "No results for..."
- turkishNormalize: searchMemory() içinde otomatik çağrılır (MCP tarafında açık kullanım yok, doğru)
- **P3**: Hata mesajları i18n edilmemiş ama MCP bağlamında kabul edilebilir

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı ve doğru
- annotations: readOnlyHint=true, destructiveHint=false, idempotentHint=true — ✅ DOĞRU
- DECKENT.md MCP tool tablosunda `deckent_memory_query` listeleniyor — ✅

## 15. Performance
- Sync I/O: existsSync (1 çağrı) — kabul edilebilir (DB varlık kontrolü)
- MemoryStore constructor: better-sqlite3 synchronous DB open — hot path değil
- FTS5 arama: verimli index-based — performans sorunu yok

## 16. Öneriler
- **P1**: MCP-seviye dedicated test dosyası yazılmalı (tests/mcp/tools/memory-query.test.ts) — schema validasyon, boş DB, 0 sonuç, parametreli arama
- **P2**: `registerMemoryQueryTool` için JSDoc eklenmeli
- **P3**: root parametresi path sanitize edilmeli (path.resolve + isAbsolute kontrol)
- **P3**: Hata mesajları i18n config'den okunabilir

## Verdict: ANALYZED
