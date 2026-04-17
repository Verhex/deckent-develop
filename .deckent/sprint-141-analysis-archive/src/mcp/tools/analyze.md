# Analysis: src/mcp/tools/analyze.ts
**Task ID:** 141-004 | **LoC:** 49

## 1. Amaci

`deckent_analyze_project` MCP tool — projenin teknoloji stack'ini (dil, framework, test runner, build tool) analiz eder ve config onerisi uretir. `analyzeProject()` core fonksiyonunu cagirir.

## 2. Public API

```typescript
export function registerAnalyzeTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  root: z.string().optional()
}
```

**Internal:**
```typescript
function generateConfigSuggestion(analysis: Record<string, unknown>): string[]
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `zod/v4`

**Ic:**
- `core/analyzer.js` — analyzeProject() [core katmani — ADR-008 OK]
- `helpers/enrich.js` — enrichContext()

## 4. Complexity

- 2 fonksiyon: handler + generateConfigSuggestion()
- Cyclomatic complexity ~3:
  - analysis.language branching (TypeScript/JavaScript/Python)
  - test framework detection
  - suggestion list building
- 49 LoC — en kompakt MCP tool'larindan biri

## 5. Type Safety

- `as unknown as Record<string, unknown>` cast `analyzeProject()` donusu icin — `analyzeProject()` typed return'e sahipse bu gereksiz double cast
- `generateConfigSuggestion()` parametresi `Record<string, unknown>` — dynamic key access safe
- Generic `any` yok

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **COMPLIANT** | Sadece core/analyzer.js import — en temiz tool'lardan biri |
| ADR-022 Parity | COMPLIANT | CLI `deckent analyze` ile eslesir |

**ReadOnly:** `readOnlyHint: true` ve `idempotentHint: true` dogru.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/analyze.test.ts`
- Mock: `analyzeProject()`
- Senaryolar: TypeScript project, Python project, bilinsiz language, config suggestions

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

Yok. Her satir aktif.

## 10. Security Findings

- **DUSUK RISK:** `analyzeProject(root)` ile root parametresi dosya sistemi okumasi yapiyor — path traversal riski `analyzeProject()` icinde kontrol edilmeli.
- Read-only analiz — yazma yok, guvenli.

## 11. Memory V2 Uyumu

N/A — project stack analizi Memory V2 ile iliskisiz. Analiz sonuclari DB'ye kaydedilmiyor (bilerek — snapshot, not persistent knowledge).

## 12. Oneriler

1. `analyzeProject()` donus tipi explicit olarak tanimli ise `as unknown as Record<string, unknown>` double cast kaldirilabilir.
2. `generateConfigSuggestion()` oneri listesi genisletilebilir: Memory V2 config kontrolu (better-sqlite3 var mi?), memory.backend config oneris.
3. `root` parametresine path validation ekle.

## 13. Verdict

**ANALYZED** — En sade ve temiz MCP tool'lardan biri. ADR-008 compliant, minimal kod, guvenli. Hicbir kritik sorun yok.
