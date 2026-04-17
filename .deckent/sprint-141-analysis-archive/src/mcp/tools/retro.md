# Analysis: src/mcp/tools/retro.ts
**Task ID:** 141-004 | **LoC:** 109

## 1. Amaci

`deckent_retro` MCP tool — sprint retrospektifini okur ve dondurur. `.brain/RETRO.md` dosyasini veya arsiv dosyalarini tarar. `sprintId` parametresi ile belirli bir sprint'in retro'sunu getirebilir.

## 2. Public API

```typescript
export function registerRetroTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  sprintId: z.string().optional(),  // e.g. 'sprint-139'
  format: z.enum(['text', 'summary']).optional().default('summary'),
  root: z.string().optional()
}
```

**Internal:**
```typescript
function extractHighlights(content: string): string[]
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — BRAIN_DIR, RETRO_FILE, ARCHIVE_DIR
- `helpers/enrich.js`, `helpers/format.js`

## 4. Complexity

- 2 fonksiyon: handler + `extractHighlights()`
- Cyclomatic complexity ~7:
  - sprintId belirtilmis → arsiv arama
  - arsiv candidates loop (2 naming pattern)
  - RETRO_FILE fallback
  - sprintId icin RETRO.md icinde section tarama
  - format branching (text/summary)
- 109 LoC — makul

## 5. Type Safety

- `extractHighlights()` returns `string[]` — clean
- `match[1]` ve `match[2]` guarded optional chaining ile
- `candidates.find()` nullable — optional chain ile guvenli erisim

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | COMPLIANT | Sadece core/constants import |
| ADR-040 DB-First | **NON-COMPLIANT** | Tool RETRO_FILE (dosya) okuyor, DB degil |
| ADR-022 Parity | COMPLIANT | CLI `deckent retro` ile eslesir |

**Kritik Tutarsizlik:** `deckent://retro` RESOURCE DB-first (MemoryStore.getByType('retro')) kullanirken, `deckent_retro` TOOL file-based RETRO_FILE'i okuyor. Ayni veri icin farkli backend kullaniyor.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/retro.test.ts`
- Test senaryolari:
  - sprintId yok → RETRO.md fallback
  - sprintId var → arsiv arama
  - Dosya yok → "No retro found" mesaji
  - extractHighlights parse
  - format='text' vs 'summary'

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- 2 naming pattern deneniyor arsivde: `retro-sprint-NNN.md` ve `sprint-NNN-retro.md` — kullanilmayan format hangisi? Temizlenebilir.
- `extractHighlights()` regex basit heading extractor — daha sofistike parse gerekiyor mu?

## 10. Security Findings

- **ORTA RISK:** `sprintId` parametresi dosya adi construction'inda kullaniliyor: `file.includes(sprintId)` — path separators (/, ..) iceren sprintId tehlikeli olabilir. Sanitize edilmeli.
- Arsiv dizini sabit ARCHIVE_DIR — path traversal riski minimal ama sprintId temizligi zorunlu.
- `readFileSync` hatayi catch etmiyor — `try/catch` olmadan crash olabilir.

## 11. Memory V2 Uyumu

**NON-COMPLIANT:**
- `deckent_retro` TOOL: `.brain/RETRO.md` (dosya) okuyor
- `deckent://retro` RESOURCE: `MemoryStore.getByType('retro')` (DB) kullaniyor
- Bu tutarsizlik kullaniciya yanlis/eski data gosterebilir

**Sprint 142 Gereksinim:** Tool'u MemoryStore.getByType('retro', { sprint_id }) kullanacak sekilde guncelle. Dosya-based fallback sadece eski sprint'ler icin kalsın.

## 12. Oneriler

1. **P0:** `sprintId` sanitize et: `sprintId.replace(/[^a-zA-Z0-9-_]/g, '')` — path traversal onleme.
2. **P1:** Memory V2 DB'den retro oku: `store.getByType('retro')` + sprintId filter — resource ile tutarlilik.
3. `readFileSync` try/catch ile sar — crash prevention.
4. Eski arsiv naming pattern'lerini dokumante et veya tek pattern'e normalize et.
5. `extractHighlights()` DB migration'dan sonra gereksiz kalacak — kaldir.

## 13. Verdict

**ANALYZED** — Calisir durumda. Memory V2 tutarsizligi (tool dosya-tabanli, resource DB-tabanli) ve sprintId sanitizasyon eksikligi kritik. Sprint 142 P0/P1 fix.
