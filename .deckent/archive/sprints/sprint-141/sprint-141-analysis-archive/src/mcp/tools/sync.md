# Analysis: src/mcp/tools/sync.ts
**Task ID:** 141-004 | **LoC:** 50

## 1. Amaci

`deckent_sync` MCP tool — CLAUDE.md ve AGENTS.md dosyalarinin DECKENT.md'yi `@DECKENT.md` ref ile import ettigini dogrular ve eksikse ekler (ADR-013 enforcement). Idempotent.

## 2. Public API

```typescript
export function registerSyncTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  root: z.string().optional()
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`

**Ic:**
- `core/constants.js` — CLAUDE_FILE, AGENTS_FILE
- `core/utils.js` — ensureDeckentImport()
- `helpers/enrich.js`

## 4. Complexity

- 1 fonksiyon
- Cyclomatic complexity ~2: ensureDeckentImport x2, synced list build
- 50 LoC — en kompakt tool'lardan biri

## 5. Type Safety

- `synced: string[]` — clean
- `changeCount: synced.length` — always 2 (both files always synced)

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-013 DECKENT.md Adapter | **COMPLIANT** — enforcement mekanizmasi | |
| ADR-008 | COMPLIANT | core/utils import |
| ADR-022 Parity | COMPLIANT | CLI `deckent sync` ile eslesir |

**idempotentHint: true** — dogru. `ensureDeckentImport()` sadece eksikse ekliyor.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/sync.test.ts`
- Senaryolar:
  - CLAUDE.md import zaten var → no change
  - CLAUDE.md import yok → eklendi
  - AGENTS.md yok → olusturuldu mu?
  - Her iki dosya da mevcut ve dogru

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `changeCount: synced.length` — always 2 (`synced` array her zaman her iki dosya icin dolu). Gercek change detection yapmıyor — yaniltici.

## 10. Security Findings

- **DUSUK RISK:** `CLAUDE_FILE` ve `AGENTS_FILE` sabit path'ler — guvenli.
- `ensureDeckentImport()` yazma operasyonu — additive only (mevcut icerik korunuyor).

## 11. Memory V2 Uyumu

N/A — sync DECKENT.md import enforcement. Memory V2 ile iliskisi yok.

## 12. Oneriler

1. `changeCount` gercek degi anlatiyor — `ensureDeckentImport()` bool dondurse, gercek `changedCount` hesaplanabilir.
2. DIRECTIVES.md veya README.md de sync kapsamina alinabilir (opsiyonel).
3. Sync'in ne yaptigini response'ta daha acik belirt: "CLAUDE.md already had @DECKENT.md import" vs "Added @DECKENT.md to CLAUDE.md".

## 13. Verdict

**ANALYZED** — En sade tool'lardan biri. ADR-013 compliance mekanizmasi olarak calisir. `changeCount` semantigi yaniltici — kucuk iyilestirme yeterli.
