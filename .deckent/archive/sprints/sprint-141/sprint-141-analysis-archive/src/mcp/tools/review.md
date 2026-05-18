# Analysis: src/mcp/tools/review.ts
**Task ID:** 141-004 | **LoC:** 134

## 1. Amaci

`deckent_review` MCP tool — sprint sonuclarini degerlendirir. Task JSON ve `.result` dosyalarini okur, GO/NO_GO/GO_WITH_TECH_DEBT kararlari verir. `auto=true` ile DONE+testsPassed task'lari otomatik onaylanir.

## 2. Public API

```typescript
export function registerReviewTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  sprintId: z.string().optional(),  // default: current sprint
  auto: z.boolean().optional().default(false),  // auto-approve DONE tasks
  root: z.string().optional()
}
```

**Internal:**
```typescript
function loadTaskResults(tasksDir: string): TaskResult[]
interface TaskData { id, title, status, selfAssessment?, model?, effort? }
interface TaskResultData { selfAssessment?, testsPassed?, notes? }
interface TaskResult { task: TaskData, result?: TaskResultData, decision: string }
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — TASKS_DIR, DECKENT_DIR
- `core/config.js` — loadConfig() (getNextSprintId icin)
- `core/utils.js` — getNextSprintId()
- `helpers/enrich.js`

## 4. Complexity

- 2 fonksiyon: handler + `loadTaskResults()`
- Cyclomatic complexity ~6:
  - sprintId yoksa current-1 calculation
  - loadTaskResults: JSON parse, result okuma
  - auto=true ile DONE+testsPassed auto-approve
  - GO_WITH_TECH_DEBT pending path
  - summary statistics

## 5. Type Safety

- `TaskData`, `TaskResultData` internal interface — yeterli
- `JSON.parse()` hasil cast edilmis — runtime validation eksik ama acceptable
- `decision` string union tipi degil — 'pending' | 'approved' | 'rejected' type literal olabilirdi

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | COMPLIANT | Sadece core/ importlari |
| ADR-022 Parity | COMPLIANT | CLI `deckent review` ile eslesir |

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/review.test.ts`
- Senaryolar:
  - sprintId explicit vs derived (getNextSprintId - 1)
  - auto=true: DONE+testsPassed approve
  - auto=true: GO_WITH_TECH_DEBT stays pending
  - Bos tasks dizini
  - result dosyasi yok (task JSON sadece)

## 8. TODO/FIXME/HACK inventory

- **FRAGILE:** `sprintId = getNextSprintId() - 1` hesaplamasi risky. Sprint counter kayiksa yanlis sprint incelenir.

## 9. Dead Code Candidates

- `GO_WITH_TECH_DEBT` task'lari `auto=true` iken bile 'pending' kaliyor — bu intentional mi? Yorum yok. Dokumantasyon eksik.
- `effort` field `TaskData`'da var ama review logic'te kullanilmiyor.

## 10. Security Findings

- **DUSUK RISK:** TASKS_DIR'den dosya okuma — sabit path, guvenli.
- `JSON.parse()` malformed JSON'da exception firlatiyor — `try/catch` ile individual task hatalarini handle et, tum review'u basarisiz etme.

## 11. Memory V2 Uyumu

N/A — review tool task dosyalarini okuyor, DB'ye erisim gerekmiyor. Sprint sonucu kaydedilmesi (memory store'a) `runSprint()` lifecycle icinde yapiliyor.

## 12. Oneriler

1. **Onemli:** Explicit `sprintId` parametresini zorunlu yap veya en azindan derived sprintId'yi response'ta goster.
2. `JSON.parse()` try/catch ile individual task hatasini izole et.
3. `decision` tipi literal union yap: `'pending' | 'approved' | 'rejected' | 'tech_debt'`.
4. `GO_WITH_TECH_DEBT` auto-approval davranisini dokumante et veya `autoApproveTechDebt` parametresi ekle.
5. `effort` field kullaniliyorsa kaldirin, kullanilmiyorsa `TaskData`'dan cikar.

## 13. Verdict

**ANALYZED** — Calisir durumda. Fragile sprintId derivation ve GO_WITH_TECH_DEBT auto-approval belirsizligi Sprint 142 P2 fix adayi.
