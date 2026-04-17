# Analysis: src/mcp/tools/directives.ts
**Task ID:** 141-004 | **LoC:** 81

## 1. Amaci

`deckent_set_directives` MCP tool — DIRECTIVES.md dosyasini user-provided content ile yazar, task sayisini parse eder ve model/effort dagilimini hesaplar. Sprint planlamadan once kullanicinin hedeflerini tanimladigi ilk adim.

## 2. Public API

```typescript
export function registerSetDirectivesTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  content: z.string(),         // DIRECTIVES.md icerigi (Markdown)
  root: z.string().optional()  // proje koku
}
```

**Internal helpers:**
```typescript
function computeBreakdown(content: string): TaskBreakdown
function computeEstimatedModels(content: string): ModelEstimate
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs` — writeFileSync
- `node:path` — join
- `zod/v4` — schema validasyon

**Ic:**
- `core/constants.js` — DIRECTIVES_FILE
- `helpers/enrich.js` — enrichContext()

## 4. Complexity

- 3 fonksiyon toplamda
- `computeBreakdown()`: regex ile `## Task` sayimi, effort keyword matching
- `computeEstimatedModels()`: regex ile model keyword sayimi (opus/sonnet/haiku)
- Cyclomatic complexity ~4-6 (regex matching branching)
- 81 LoC — minimal ve odakli

## 5. Type Safety

- Return tipleri internal interface olarak tanimli — yeterli
- `match[1]?.trim()` optional chaining — guvenli
- Regex'ler compile-time sabit — safe
- Generic `any` yok

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | COMPLIANT | Sadece core/constants import |
| ADR-001 ESM | COMPLIANT | .js uzantili importlar |
| ADR-022 CLI/MCP Parity | COMPLIANT | CLI `deckent directives` ile eslesir |

**Not:** DIRECTIVES.md dosya-tabanli (DB degil) — bu dogru. Directives hafizaya kaydedilmiyor, operasyonel input.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/directives.test.ts`
- Test senaryolari:
  - Gecerli markdown content yazma
  - computeBreakdown: task sayisi parse
  - computeEstimatedModels: model keyword sayimi
  - root parametresi ile dil dosya yolu
  - Bos content kabul mu ediyor?

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK comment bulunamadi.

## 9. Dead Code Candidates

- `computeEstimatedModels()` sonucu response'a ekleniyor mu? Donus degerinin kullanildigi dogrulanmali.
- Eger kullanici generic model isimleri kullanmiyorsa (opus/sonnet/haiku) bu tahmin yanlic cikacak.

## 10. Security Findings

- **DUSUK RISK:** `content` parametresi tamamen user-controlled, `DIRECTIVES_FILE` sabit yola yaziliyor — path injection riski yok.
- `writeFileSync` hata durumunda exception firilatir — MCP framework tarafindan yakalanacak.
- Bos string content kabul edilirse DIRECTIVES.md bosaltilabilir — minimal risk.

## 11. Memory V2 Uyumu

N/A — DIRECTIVES.md kasitli olarak dosya-tabanli. DB'ye kaydedilmemesi dogru: bu operasyonel input, kalici bilgi degil.

## 12. Oneriler

1. **Onemli:** Content yazilmadan once en az bir `## Task` blogu icerdigini validate et. Bos veya formatlanmamis content, sonraki `deckent_plan` adimini bozabilir.
2. `## Task` regex case-sensitive — `## task` veya `### Task` gibi varyasyonlari handle etmeli mi? Kullanici dokumantasyonuna bakilmali.
3. `computeEstimatedModels()` fonksiyon adi yaniltici — aslinda task count estimation yapiyor, model mapping degil. Yeniden adlandirma: `computeModelUsageCounts()`.
4. Sprint basligi parse edilerek donus response'una eklenebilir (Section `## Goal` parse).

## 13. Verdict

**ANALYZED** — Sade ve calisir durumda. Content validation eksikligi Sprint 142 P2 iyilestirme adayi.
