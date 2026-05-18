# Analysis: src/mcp/tools/status.ts
**Task ID:** 141-004 | **LoC:** 464

## 1. Amaci

`deckent_status` MCP tool — en kompleks tool. Dashboard durumu, event stream, worker output'lari, metrikler, dependency graph ve agent assignment bilgilerini okur. Progress bar, ETA ve verbose mode destekli zengin status objesi dondurur. Sprint izleme icin ana arac.

## 2. Public API

```typescript
export function registerStatusTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  watch: z.boolean().optional().default(false),  // MCP'de calismiyor, CLI'da alive
  json: z.boolean().optional().default(false),
  verbose: z.boolean().optional().default(false),
  outputMode: z.enum(['summary', 'detailed', 'explainatory']).optional(),
  root: z.string().optional()
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR, LOCKS_DIR, EVENTS_FILE
- `helpers/enrich.js`, `helpers/format.js`
- `monitor/sprint-state.js` — getSprintState() [ADR-008 OK — monitor katmani]
- `monitor/dashboard-manager.js` — loadDashboard()
- `core/utils.js` — formatDuration()
- `core/output-formatter.js` — formatStatusOutput()

## 4. Complexity

- 10 helper fonksiyon + 1 ana handler
- Cyclomatic complexity ~15-20 (en yuksek tool'lar arasinda)
- Major code sections:
  - Dashboard state reading
  - Task file scanning + result parsing
  - Worker/agent assignment detection
  - Event stream parsing
  - Dependency graph loading
  - Progress bar + ETA calculation
  - Output mode switching (summary/detailed/explainatory)
- 464 LoC — refactor zorunlu

## 5. Type Safety

- `as unknown as Record<string, unknown>` cast — dashboard state icin acceptable (dynamic format)
- Optional chain access `?.` — yaygın kullanım, crash-safe
- `outputMode 'explainatory'` — TYPO: 'explanatory' olmali
- Internal `WorkerInfo`, `TaskProgress` interfaces iyi tipli

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **COMPLIANT** | `monitor/` importu kabul edilir — orchestra degil. Comment'te belgelenmi |
| ADR-022 Parity | COMPLIANT | CLI `deckent status` ile eslesir |
| ADR-020 Rich Sprint Output | COMPLIANT | 7-section output destegi |

**Not:** `monitor/` katmanindan import — ADR-008 icin orchetra yerine monitor'den import edilmesi bilinçli mimari karar. Comment ile belgelenmi.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/status.test.ts`
- Kompleks surface — mock yorgunlugu riski yuksek
- Kritik senaryolar: sprint yok, sprint aktif, tum task'lar bitti, NO_GO tasks, dep graph
- `outputMode` her degeri icin test

## 8. TODO/FIXME/HACK inventory

- **TYPO:** `outputMode: 'explainatory'` — 'explanatory' olmali. Kullanici girisi ile enum mismatch olabilir.
- `watch: false` always — MCP mode'da watch desteklenmiyor. Schema'da belgelenebilir.

## 9. Dead Code Candidates

- Dependency graph loading: `if (sprintId && verbose)` — verbose olmayan durumlarda da sprintId varsa dep graph yukleniyor mu? Kod akisi kontrol edilmeli.
- `outputMode: 'explainatory'` typo — eski 'explainatory' ile yeni 'explanatory' enum degeri iki versiyonda farkli davranabilir.

## 10. Security Findings

- **DUSUK RISK:** Tum file read'ler DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR sabit path'lerinden — user-controlled input yok, guvenli.
- Event stream parse: malformed JSON silentle skip — dogru defensive pattern.

## 11. Memory V2 Uyumu

N/A — status tool dashboard dosyalarini ve task dosyalarini okuyor. DB'ye erisim gerekmiyor (sprint durumu operasyonel, DB'de degil).

## 12. Oneriler

1. **FIX:** `outputMode 'explainatory'` → `'explanatory'` typo duzelt. Breaking change olabilir — deprecation period koy.
2. **Refactor:** 464 LoC → `status-formatters.ts` + `status-readers.ts` olarak bol. Sprint 142 P1.
3. Dep graph loading `verbose=true` ile gate et — verbose=false durumunda gereksiz I/O.
4. `watch: false` MCP limitation'ini schema description'ina ekle.
5. Progress bar hesaplamasi icin `Date.now()` yerine heartbeat timestamp kullan — daha gercekci ETA.

## 13. Verdict

**ANALYZED** — Calisir durumda. En buyuk tool (464 LoC) — refactor zorunlu. 'explainatory' typo duzeltilmeli. Sprint 142 P1 refactor adayi.
