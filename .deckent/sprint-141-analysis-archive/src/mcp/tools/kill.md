# Analysis: src/mcp/tools/kill.ts
**Task ID:** 141-004 | **LoC:** 125

## 1. Amaci

`deckent_kill` MCP tool — aktif worker'lari durdurur. Tek bir task ID ile belirli bir worker'i, veya 'all' ile tum aktif worker'lari kill eder. Task durumunu PAUSED'a ceker, heartbeat dosyalarini siler, file lock'lari serbest birakir.

## 2. Public API

```typescript
export function registerKillTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  target: z.enum(['all', 'worker']),
  workerId: z.string().optional(),  // required when target='worker'
  root: z.string().optional()
}
```

**Internal:**
```typescript
function killTaskById(tasksDir: string, locksDir: string, taskId: string): KillResult
function killAllTasks(tasksDir: string, locksDir: string): KillResult[]
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — TASKS_DIR, LOCKS_DIR
- `helpers/enrich.js`

## 4. Complexity

- 3 fonksiyon: handler + killTaskById + killAllTasks
- Cyclomatic complexity ~6:
  - target='worker' vs 'all' branch
  - lock dosyalari tarama (taskId match)
  - .hb dosyasi silme
  - task JSON status update
- 125 LoC — makul

## 5. Type Safety

- `TaskFileData` internal interface — TaskData icin
- `KillResult { taskId, title?, killed: boolean, reason? }` — clean
- Lock file typed as `{ taskId?: string }` — minimal ama yeterli
- `TaskFileData.forceModel` field tanimli ama kill logic'te hic kullanilmiyor

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | COMPLIANT | Sadece core/constants import |
| ADR-022 Parity | COMPLIANT | CLI `deckent kill` ile eslesir |

**Destructive:** `destructiveHint: true` dogru ayarlanmis.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/kill.test.ts`
- Senaryolar:
  - target='all': tum CLAIMED/EXECUTING task'lari kill
  - target='worker' + workerId: tek task kill
  - workerId bulunamadi: hata mesaji
  - Lock dosyasi yoksa: graceful skip
  - .hb dosyasi yok: graceful skip

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `TaskFileData.forceModel` field tanimli ama kill logic'te kullanilmiyor — kaldirilabilir.
- `reason` field KillResult'ta — ne zaman set ediliyor? Her zaman set mi?

## 10. Security Findings

- **ORTA RISK:** `workerId` / `taskId` parametresi dosya adi construction'inda kullaniliyor. Format validation eksik. `'../../etc/passwd'` gibi deger task file path'ine injection olusturabilir.
- **Oneri:** `taskId` format dogrulama: `/^\d{3}-\d{3}$/.test(taskId)` veya benzer pattern.
- `unlinkSync` try/catch olmadan — dosya zaten silindiyse exception firlatabilir.
- Status PAUSED setleme: task JSON'u oku + modify + yaz pattern — race condition potansiyeli (atomik degil).

## 11. Memory V2 Uyumu

N/A — kill tool task/lock dosyalari uzerinde calisir. DB'ye erisim gerekmiyor.

## 12. Oneriler

1. **GUVENLIK:** `taskId` / `workerId` format dogrulama ekle — path traversal onleme.
2. `TaskFileData.forceModel` field'ini kaldir — dead code.
3. `unlinkSync` try/catch ile sar — idempotent kill operasyonu.
4. Task status guncelleme atomik yap: temp dosyaya yaz + rename pattern (ADR-005 deprecated ama atomic write hala onemli).
5. Kill sonrasi tmux session check — tmux backend'de worker hala calisiyor olabilir (sadece dosya status degistiriliyor, process kill yok).

## 13. Verdict

**ANALYZED** — Calisir durumda. taskId format validation eksikligi guvenlik P1. forceModel dead code temizlenmeli. Sprint 142 P1/P2.
