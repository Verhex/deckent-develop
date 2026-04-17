# Analysis: src/mcp/tools/explain.ts
**Task ID:** 141-004 | **LoC:** 150

## 1. Amaci

`deckent_explain` MCP tool — sprint gecmisini ve sonuclarini insan-dostu sekilde aciklar. Sprint log dosyalarini ve RETRO.md'yi okur, is ozeti, ogrenimler ve sonraki adimlar formatinda sunar. CLI explain komutundan helper fonksiyonlari import eder.

## 2. Public API

```typescript
export function registerExplainTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  sprintId: z.string().optional(),    // e.g. 'sprint-139' or '139'
  detail: z.enum(['brief', 'full']).optional().default('brief'),
  root: z.string().optional()
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — BRAIN_DIR, ARCHIVE_DIR, RETRO_FILE
- `helpers/enrich.js`, `helpers/format.js`
- `cli/commands/explain.js` — 8 fonksiyon: [CROSS-LAYER: MCP→CLI]
  - `findSprintFile`, `parseSprintLog`, `buildSprintSummary`
  - `formatBriefExplain`, `formatFullExplain`, `extractTaskHighlights`
  - `parseRetroFile`, `computeHealthScore`

## 4. Complexity

- 1 main handler fonksiyon
- Cyclomatic complexity ~6:
  - sprintId yoksa latest sprint bul
  - sprintId format normalize (sprint-NNN vs NNN)
  - sprint file bul
  - detail='brief' vs 'full' branching
  - retro optional load
- 8 helper import — gercek kompleksite cli/commands/explain.ts'de

## 5. Type Safety

- `ExplainData` interface `format.ts`'ten geliyor — typed
- `sprintId.replace(/^sprint-/, '')` + `padStart(3, '0')` — normalize pattern
- Optional retro merge: `if (retroData) { ... }` — safe

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `cli/commands/explain.js`'den 8 import — MCP→CLI cross-layer |
| ADR-022 Parity | COMPLIANT | CLI `deckent explain` ile eslesir |

**ADR-008 Aciklama:** `doctor.ts` ile ayni anti-pattern. CLI shared helper'lari core/'a tasinmali.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/explain.test.ts`
- Mock: `findSprintFile()`, `parseSprintLog()`, `buildSprintSummary()`, `parseRetroFile()`
- Senaryolar: sprint bulunamadi, latest sprint, sprintId format variations, detail modes

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `extractTaskHighlights()` import ediliyor — kullaniliyor mu? response'ta task highlights var mi?

## 10. Security Findings

- **DUSUK RISK:** `sprintId` path construction: `sprint-${numericId}.md` — `numericId = sprintId.replace(/^sprint-/, '').padStart(3, '0')`. Sadece sayisal karakterler kullaniliyor — relativly safe. Ancak `sprintId = 'sprint-../../../etc'` gibi pathlarla `replace` ile `../../../etc` kalir — traversal riski.
- **Fix:** `numericId = numericId.replace(/[^0-9]/g, '')` — sadece rakam birak.

## 11. Memory V2 Uyumu

**PARTIAL:** Sprint loglar `.brain/sprints/*.md` dosya-tabanli (Memory V2'de tip='sprint' DB entry olarak da saklanabilir). Explain tool dosya-based okuyor — DB-first migration tamamlanmadigi icin acceptable. Retro da dosya-based.

## 12. Oneriler

1. **GUVENLIK:** `numericId` sanitization: sadece rakam kabul et.
2. **ADR-008 P1:** 8 CLI helper fonksiyonu `core/sprint-explain-helpers.ts`'e tasiyarak MCP→CLI dependency kaldir.
3. Memory V2: `parseSprintLog()` DB-first versiyonuna hazirlik — `store.getByType('sprint', { sprint_id })`.
4. `extractTaskHighlights()` kullaniliyorsa response'ta goster, kullanilmiyorsa import'u kaldir.

## 13. Verdict

**ANALYZED** — Calisir durumda. MCP→CLI cross-layer dependency (`doctor.ts` ile ayni anti-pattern) ve sprintId sanitization eksigi Sprint 142 P1 fix. Logic dogru.
