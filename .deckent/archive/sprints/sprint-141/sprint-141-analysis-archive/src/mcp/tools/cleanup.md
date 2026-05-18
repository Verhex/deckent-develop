# Analysis: src/mcp/tools/cleanup.ts
**Task ID:** 141-004 | **LoC:** 139

## 1. Amaci

`deckent_cleanup` MCP tool — sprint task artifact'larini ve lock dosyalarini temizler. Opsiyonel olarak memory decay tetikler. Memory V2 ile DB entry count kontrolu yapar (getMemoryEntryCount via MemoryStore).

## 2. Public API

```typescript
export function registerCleanupTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  includeArchive: z.boolean().optional().default(false),
  decayMemory: z.boolean().optional().default(false),
  root: z.string().optional()
}
```

**Internal:**
```typescript
function listCleanableFiles(dir: string, extensions: RegExp): string[]
function cleanLocks(locksDir: string): CleanResult
function cleanTasks(tasksDir: string, includeArchive: boolean): CleanResult
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — TASKS_DIR, LOCKS_DIR, DECKENT_DIR, BRAIN_DIR, MEMORY_DB_FILE
- `core/utils.js` — getMemoryEntryCount (post-V2 helper)
- `core/memory-store.js` — MemoryStore [Memory V2]
- `orchestra/brain.js` — runDecay() [ADR-008 concern]
- `helpers/enrich.js`

## 4. Complexity

- 4 fonksiyon: handler + listCleanableFiles + cleanLocks + cleanTasks
- Cyclomatic complexity ~5:
  - includeArchive branch
  - decayMemory branch (MemoryStore open/close)
  - task extension filter
  - lock staleness check
- `TASK_EXTENSIONS = /\.(json|result|hb|plan|lock)$/` regex const — temiz

## 5. Type Safety

- `CleanResult { removed: string[], errors: string[] }` — typed
- `getMemoryEntryCount()` wraps MemoryStore in try/finally — resource safe
- `runDecay()` return tipi kontrol edilmeli — await edilmeli mi?

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | `orchestra/brain.js`'den runDecay import — MCP→orchestra cross-layer |
| ADR-040 DB-First | **COMPLIANT** | getMemoryEntryCount MemoryStore kullanıyor |
| ADR-022 Parity | COMPLIANT | CLI `deckent cleanup` ile eslesir |

**Destructive:** `destructiveHint: true` dogru ayarlanmis.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/cleanup.test.ts`
- Senaryolar:
  - includeArchive=true vs false
  - decayMemory=true: MemoryStore open, runDecay, close
  - Bos dizinler: graceful skip
  - Lock dosyasi silme
  - Error handling: readonly dosya

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- Memory budget comparison: `brainLines > memoryBudget` — `brainLines` aslinda `getMemoryEntryCount()` sonucu (entry count), `memoryBudget` ise V1'deki line-budget config degeri. Semantik uyumsuzluk — post-V2 bu karsilastirma yanliyor.

## 10. Security Findings

- **YUKSEK RISK:** DESTRUCTIVE tool — task/lock dosyalari siliniyor. Yanlislikla aktif sprint silinebilir. Sprint lock kontrolu (sprint aktif mi?) cleanup oncesi yapilmali.
- `cleanTasks()` tum `.json` dosyalarini siliyor — aktif task'lar da dahil mi? Status filtresi yok.
- `runDecay()` error handling — decay basarisiz olursa cleanup basarisiz mi sayilmali?

## 11. Memory V2 Uyumu

**COMPLIANT ancak semantik sorun:**
- `getMemoryEntryCount()` MemoryStore kullaniyor — dogru
- `brainLines > memoryBudget`: entry count vs line budget karsilastirmasi — anlamsiz post-V2
- Sprint 142: `entry_budget` config key ekle, `memory_budget` (line count) kullanimi kaldir

## 12. Oneriler

1. **KRITIK:** Aktif sprint kontrolu ekle cleanup oncesi — `getSprintLockFile()` varsa uyari ver veya block et.
2. `cleanTasks()` sadece DONE/NO_GO/PAUSED status task'lari silmeli — CLAIMED/EXECUTING korunmali.
3. Memory budget karsilastirmasini guncelle: `entryCount > config.memory.entry_budget` (yeni config key).
4. `runDecay()` async await etmeli — fire-and-forget degil.
5. Silinen dosya sayisini cleanup summary'ye ekle.

## 13. Verdict

**ANALYZED** — Calisir durumda. Aktif task silme riski ve Memory V2 semantik mismatch Sprint 142 P0/P1. ADR-008 cross-layer pattern tekrar.
