# Analysis: src/mcp/tools/history.ts
**Task ID:** 141-004 | **LoC:** 87

## 1. Amaci

`deckent_history` MCP tool — gecmis sprint'lerin listesini dondurur. `.brain/sprints/` dizinindeki sprint log dosyalarini okur, task completion rate'e gore trend tespiti yapar.

## 2. Public API

```typescript
export function registerHistoryTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  limit: z.number().optional().default(10),  // max sprint count
  root: z.string().optional()
}
```

**Internal:**
```typescript
function detectTrend(sprints: SprintSummary[]): 'improving' | 'declining' | 'stable'
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `helpers/enrich.js`
- `orchestra/sprint-reporter.js` — collectSprintFiles() [ADR-008 concern]

## 4. Complexity

- 2 fonksiyon: handler + detectTrend()
- Cyclomatic complexity ~5:
  - collectSprintFiles sonuclari isleme
  - sprints.slice(limit)
  - detectTrend: completion rate compare
- `detectTrend()` basit: son sprint vs onceki sprint completion rate karsilastirmasi
- 87 LoC — kompakt

## 5. Type Safety

- `SprintSummary` interface: `{ sprintId, tasksTotal, tasksDone, date, status }`
- `detectTrend` typed return union — clean
- `filter(Boolean)` pattern completion rate array'i temizlemek icin

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `orchestra/sprint-reporter.js`'den collectSprintFiles import |
| ADR-022 Parity | COMPLIANT | CLI `deckent history` ile eslesir |

**Aciklama:** Sprint log dosyalari `.brain/sprints/*.md` — bunlar DB'de de tip='sprint' olarak saklanabiliyor. `collectSprintFiles()` dosya-tabanli.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/history.test.ts`
- Mock: `collectSprintFiles()`, `.brain/sprints/` dizin okuma
- Edge case: bos sprint gecmisi, limit > toplam sprint sayisi
- detectTrend: improving/declining/stable her path

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `detectTrend()` sadece son iki sprint'i karsilastiriyor — daha fazla historical data ile moving average daha guvenilir olurdu.

## 10. Security Findings

- **DUSUK RISK:** Tum read'ler `.brain/sprints/` sabit dizininden — guvenli.
- `limit` parametresi: cok buyuk limit memory'i etkileyebilir (tum sprint dosyalari) — `Math.min(limit, 100)` cap eklenebilir.

## 11. Memory V2 Uyumu

**PARTIAL:** Sprint loglar DB'de type='sprint' olarak da saklanabilir. `collectSprintFiles()` dosya-tabanli okuyor. Memory V2'de sprint loglar DB'de mi, dosyada mi, ikisinde mi? `summary.md` "sprint log 100 per file" diyor — hala dosya-tabanli oldugu anlasiliyyor. DB'ye tam tasima sprintlarda bazi eksik entryler olusturabilir.

## 12. Oneriler

1. `collectSprintFiles()`'i `core/` katmanina tasimak ADR-008 ihlalini cozecek.
2. DB-first sorgu: `store.getByType('sprint', { limit })` — dosya-based fallback ile hybrid.
3. `detectTrend()` gozlemci penceresi genisletilmeli: son 5 sprint moving average.
4. `limit` parametresine max cap: `Math.min(input.limit, 100)`.

## 13. Verdict

**ANALYZED** — Calisir durumda. ADR-008 concern pattern cozulunce (collectSprintFiles core/'a tasindiktan sonra) temiz. Sprint 142 P2.
