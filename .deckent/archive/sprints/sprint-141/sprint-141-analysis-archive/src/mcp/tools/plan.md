# Analysis: src/mcp/tools/plan.ts
**Task ID:** 141-004 | **LoC:** 111

## 1. Amaci

`deckent_plan` MCP tool — DIRECTIVES.md'yi okur, AI veya structured mode ile sprint planlama yapar, task listesi ve wave breakdown dondurur. Her zaman dry-run — task JSON dosyalarini diske yazmaz, sadece onizleme saglar.

## 2. Public API

```typescript
export function registerPlanTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  mode: z.enum(['ai', 'structured', 'auto']).optional().default('auto'),
  root: z.string().optional(),
  dryRun: z.boolean().optional().default(true), // always effectively true
  maxTasks: z.number().optional()
}
```

**Internal interfaces:**
```typescript
interface PlanInput { mode, root, dryRun, maxTasks }
interface SprintSizeRecommendation { size, reason, maxTasks }
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `zod/v4`

**Ic:**
- `core/config.js` — loadConfig()
- `orchestra/brain.js` — readContext(), planSprint() [ADR-008 concern]
- `core/types.js` — PlannedSprint, TaskDNA
- `helpers/enrich.js` — enrichContext()
- `helpers/format.js` — formatPlanOutput()

## 4. Complexity

- 4 fonksiyon:
  - `registerPlanTool()` — tool registration + handler
  - `formatWaves()` — task wave display
  - `getRecommendation()` — hardcoded SprintSizeRecommendation
  - `formatEstimatedDuration()` — effort mapping
- Cyclomatic complexity ~4 (mode branching, wave grouping)
- `planSprint()` gercek karmasiklik orada — bu tool thin wrapper

## 5. Type Safety

- `PlannedSprint` return tipi `planSprint()`'ten geliyor — tip guvenli
- `getRecommendation()` her zaman `{ size: 'full', reason: '...', maxTasks: 50 }` donduruyor — hardcoded mock
- `input.mode` enum dogrulamasi Zod'dan geliyor

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `orchestra/brain.js` import — MCP→orchestra cross-layer |
| ADR-004 Config | COMPLIANT | loadConfig() kullaniliyor |
| ADR-022 Parity | COMPLIANT | CLI `deckent plan` ile eslesir |

**ADR-008 Aciklama:** MCP tool katmani orchestra/brain'den planSprint ve readContext'i cagiriyor. Bu pattern MCP→orchestra bagimliligi olusturuyor. Mevcut mimaride bu kabul gorulmus olmali — tum sprint tool'lari benzer pattern kullaniyor.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/plan.test.ts`
- Mock gerektiren: `planSprint()`, `readContext()`, `loadConfig()`
- Edge case: DIRECTIVES.md yok → error handling
- mode='ai' vs mode='structured' farkli code path'ler mi?

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK comment bulunamadi.

## 9. Dead Code Candidates

- `getRecommendation()` — her zaman hardcoded deger donduruyor. Subscription tier veya proje buyuklugune gore dinamik hesaplama yok. Fonksiyon adi yaniltici — aslinda sabit veri.
- `dryRun` schema parametresi var ama hic kullanilmiyor (plan her zaman dry-run).

## 10. Security Findings

- **DUSUK RISK:** `planSprint()` AI cagrisi iceriyorsa external API istegi tetikleniyor — rate limiting kontrolu yok.
- `root` parametresi `loadConfig(root)` ile kullaniliyor — path traversal riski minimal (config loader kendi validasyonunu yapar).

## 11. Memory V2 Uyumu

**PARTIAL:** `planSprint()` icsel olarak `readContext()` ile DB'yi sorgulayabilir (ADR/pattern query icin). Tool kendisi direkt DB erisiyor — plan tool'u icin bu dogru katman ayirimi.

## 12. Oneriler

1. `getRecommendation()` gercek bir hesaplama yapacak sekilde guncellenmeli — proje boyutu, DIRECTIVES task count, son sprint metriklerine gore.
2. `dryRun` parametresi kaldirilmali — plan her zaman dry-run, kafa karistirici.
3. ADR-008: `planSprint` ve `readContext`'i `orchestra/brain.js`'den cekip birer interface olarak core/'a tasimak uzun vadede temiz mimari saglar.
4. Wave breakdown `formatWaves()` sonucu response icinde kullanilmiyor mu? Kontrole edilmeli.

## 13. Verdict

**ANALYZED** — Calisir durumda. `getRecommendation()` hardcoding ve `dryRun` parametresi yaniltici. ADR-008 pattern tum sprint tool'larinda ortak sorun.
