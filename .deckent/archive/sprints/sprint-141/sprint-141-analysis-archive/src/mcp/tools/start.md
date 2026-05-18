# Analysis: src/mcp/tools/start.ts
**Task ID:** 141-004 | **LoC:** 198

## 1. Amaci

`deckent_start` MCP tool — tam bir sprint'i asenkron olarak baslatir (fire-and-forget pattern). Sprint lock kontrolu yapar, provider bootstrap saglar, `runSprint()` arka planda calistirir ve job state dosyasina progress yazar. Dry-run destegi var.

## 2. Public API

```typescript
export function registerStartTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  sprintId: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
  autoApprove: z.boolean().optional(),  // IMMUTABLE: always forced to true at runtime
  sandbox: z.boolean().optional(),
  root: z.string().optional(),
  provider: z.enum(['claude', 'codex', 'gemini']).optional(),
  workerProvider: z.enum(['claude', 'codex', 'gemini']).optional()
}
```

**Internal interfaces:**
```typescript
interface JobState { sprintId, status, startedAt, completedAt?, error?, tasks?, metrics? }
interface TaskSummary { id, title, status, selfAssessment? }
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `zod/v4`

**Ic:**
- `core/config.js` — loadConfig()
- `core/provider.js` — initializeProvider()
- `orchestra/brain.js` — runSprint(), BrainError, readContext(), planSprint()
- `core/types.js` — SprintConfig
- `helpers/enrich.js`, `helpers/format.js`
- `core/multi-ide.js` — detectIDE()

## 4. Complexity

- 1 buyuk async handler fonksiyon
- Fire-and-forget: `runSprint(...).then().catch()` — non-blocking
- Cyclomatic complexity ~8:
  - dryRun branch
  - sprint lock check
  - provider init error
  - runSprint error catch
  - job state update paths
- 198 LoC — refactor icin aday

## 5. Type Safety

- `BrainError instanceof` check — dogru pattern
- `autoApprove: true` kodda IMMUTABLE olarak override ediliyor (comment ile belgelenmi)
- `JobState` interface tam tipli
- `runSprint()` donus tipi kontrol edilmeli — await edilmiyor (fire-and-forget)

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `orchestra/brain.js`'den runSprint, readContext, planSprint import |
| ADR-027 Hybrid Spawn | PARTIAL | Backend secimi runSprint icinde — tool'da gorulmuyor |
| ADR-022 Parity | COMPLIANT | CLI `deckent start` ile eslesir |

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/start.test.ts`
- Zor mock: `runSprint()` async fire-and-forget — test'te timing sorunlari olabilir
- Senaryolar: dryRun=true, sprint lock var, provider init hatasi, basarili start

## 8. TODO/FIXME/HACK inventory

- **DOCUMENTED IMMUTABLE:** `autoApprove: true` hardcode — schema parametresi API surface parity icin tutulmus, runtime'da hic kullanilmiyor. Comment ile belgelenmi.
- **DOCUMENTED DIVERGENCE:** CLI'da doctor pre-flight check var, MCP'de yok. Belgelenmi ama test edilmeli.

## 9. Dead Code Candidates

- `autoApprove` schema parametresi — runtime'da hic kullanilmiyor (always true). API surface parity amaciyla tutuluyor — bu intentional.
- `sandbox` parametresi `runSprint()`'e geciriliyor — etkin mi? Kontrol edilmeli.

## 10. Security Findings

- **YUKSEK RiSK:** `autoApprove: true` hardcoded — worker'lar tam write permissonu aliyor, kullanici onay verme sansi yok. MCP ortaminda bu bilerek yapilmis bir security trade-off.
- Fire-and-forget: Sprint baslayinca MCP uzerinden iptal edilemiyor (`deckent_kill` ile olabilir).
- Job state dosyasi `.deckent/jobs/` altinda yaziliyor — path sabit, guvenli.

## 11. Memory V2 Uyumu

**PARTIAL:** `runSprint()` icsel olarak Memory V2 DB'yi kullaniyor. `start.ts` tool'u DB'ye dogrudan erisiyor — job state dosya-tabanli (operasyonel, DB degil). Bu katman ayirimi dogru.

## 12. Oneriler

1. **Onemli:** `autoApprove` parametresini schema'dan kaldir — yaniltici. Sadece "Start starts with full approval in MCP mode" diye dokumante et.
2. Sprint lock check timeout ekle — lock dosyasi bozuksa sonsuz bekleyebilir.
3. Job state dosyasi buyumesini engellemek icin eski job dosyalarini temizle (>30 gun).
4. Fire-and-forget promise'in unhandled rejection'larini loglama mekanizmasi ekle.
5. `detectIDE()` cagrisi start tool'da neden var? Gerekli mi?

## 13. Verdict

**ANALYZED** — Calisir durumda. `autoApprove` hardcoding ve fire-and-forget pattern intentional trade-off'lar. Sprint 142: autoApprove schema cleanup + job state TTL.
