# Analysis: src/mcp/tools/doctor.ts
**Task ID:** 141-004 | **LoC:** 90

## 1. Amaci

`deckent_doctor` MCP tool — proje saglik kontrollerini calistirir, system profile ekleyebilir ve healthScore + recommendations dondurur. `runDoctorChecks()` fonksiyonunu cli katmanindan import eder.

## 2. Public API

```typescript
export function registerDoctorTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  root: z.string().optional(),
  includeProfile: z.boolean().optional().default(false),
  profile: z.boolean().optional(),  // alias for includeProfile
  format: z.enum(['text', 'json']).optional().default('json')
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `zod/v4`

**Ic:**
- `cli/commands/doctor.js` — runDoctorChecks() [CROSS-LAYER: MCP→CLI]
- `core/system-profile.js` — getSystemProfile()
- `core/subscription.js` — getSubscriptionInfo()
- `helpers/enrich.js` — enrichContext()
- `core/config.js` — loadConfig()

## 4. Complexity

- 1 main handler fonksiyon
- Cyclomatic complexity ~5:
  - includeProfile veya profile alias check
  - checks filter: passed vs failed
  - healthScore calculation
  - format branching (text/json)
- 90 LoC — makul boyut

## 5. Type Safety

- `checks typed as Array<{ passed: boolean; name?; message? }>` — internal definition
- **POTANSIYEL MISMATCH:** `format.ts` DoctorData interface `ok` field kullanirsa, bu `passed` field ile uyumsuz olabilir. Kontrol edilmeli.
- `healthScore = Math.round(passedChecks / checks.length * 100)` — `checks.length === 0` durumunda NaN donebilir.

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `cli/commands/doctor.js`'den import — MCP→CLI cross-layer dependency |
| ADR-022 Parity | COMPLIANT | CLI `deckent doctor` ile eslesir |
| ADR-010 Single Dependency | COMPLIANT | Sadece internal importlar |

**ADR-008 Detay:** MCP tool'u CLI katmanindan `runDoctorChecks()` import ediyor. Bu MCP→CLI bagimliligi yarat. `explain.ts` de ayni pattern kullaniyor — mimari iyilestirme gerekli.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/doctor.test.ts`
- Mock: `runDoctorChecks()`, `getSystemProfile()`, `getSubscriptionInfo()`
- Edge case: `checks.length === 0` (NaN healthScore)
- `profile` alias ile `includeProfile` ayni sonucu mu veriyor?

## 8. TODO/FIXME/HACK inventory

- `profile` alias — `includeProfile` icin ek parametre. Kafa karistirici; zod schema'da `coerce` veya tek parametre ile cozulebilir.

## 9. Dead Code Candidates

- `profile` parametresi `includeProfile`'in alias'i — iki parametreyi desteklemek gerekli mi? API surface karmasiklik.
- `format: 'text'` return path var mi? JSON her zaman daha kullanisli.

## 10. Security Findings

- **DUSUK RISK:** `runDoctorChecks()` dosya sistemi okur — tum read'ler sabit path'lerden, guvenli.
- `healthScore` NaN edge case — `checks.length === 0` icin guard ekle.
- System profile sensitive bilgi (OS, Node versiyonu) icerbilir — `includeProfile=true` sadece debug icin kullanilmali.

## 11. Memory V2 Uyumu

**PARTIAL:** `runDoctorChecks()` icinde `getMemoryEntryCount()` cagrisi olabilir (Memory V2 budget check). Tool kendisi DB'ye erismiyor — bu dogru katman ayirimi. Doctor check listesinde Memory V2 DB saglik kontrolu (entry count, FTS5 calisiyor mu) olmali.

## 12. Oneriler

1. `runDoctorChecks()`'i `core/` katmanina tasimak ADR-008 ihlalini cozecek (Sprint 142 P1).
2. DoctorData interface field mismatch: `passed` vs `ok` — duzeltilmeli.
3. `checks.length === 0` guard: `healthScore = checks.length > 0 ? Math.round(...) : 0`.
4. `profile` alias'ini kaldir — sadece `includeProfile` kullan.
5. Memory V2 DB saglik kontrolu ekle: FTS5 var mi, entry count, schema version.

## 13. Verdict

**ANALYZED** — Calisir durumda. ADR-008 MCP→CLI cross-layer dependency ve `passed` vs `ok` field mismatch Sprint 142 P1 fix listesine eklenmeli.
