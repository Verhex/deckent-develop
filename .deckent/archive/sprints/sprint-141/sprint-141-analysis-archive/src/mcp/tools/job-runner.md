# Analysis: src/mcp/tools/job-runner.ts
**Task ID:** 141-004 | **LoC:** 98

## 1. Amaci

MCP arka plan sprint/task izleme icin job state persistence katmani. `.deckent/jobs/*.json` dosyalarini okur/yazar. `start.ts`, `status.ts` ve `run.ts` tool'lari tarafindan paylasilan utility modul.

## 2. Public API

```typescript
export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  selfAssessment?: string;
  notes?: string;
}

export interface JobState {
  jobId: string;
  sprintId?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
  tasks?: TaskSummary[];
  metrics?: { total: number; done: number; failed: number; techDebt: number };
}

export function writeJobState(jobsDir: string, jobId: string, state: JobState): void
export function readJobState(jobsDir: string, jobId: string): JobState | null
export function buildTaskSummaries(tasksDir: string): TaskSummary[]
export function readLatestJobState(jobsDir: string): JobState | null
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`

**Ic:**
- `core/constants.js` — JOBS_DIR, TASKS_DIR

## 4. Complexity

- 4 exported fonksiyon
- Cyclomatic complexity ~3-4 per function:
  - `writeJobState`: mkdirSync + writeFileSync
  - `readJobState`: existsSync + readFileSync + JSON.parse
  - `buildTaskSummaries`: readdirSync + filter + map
  - `readLatestJobState`: readdirSync + sort by mtime + read latest
- 98 LoC — compact utility

## 5. Type Safety

- `JobState` interface tam tipli, optional fieldlar dogru
- `TaskSummary` compact interface
- Task result typed as `{ selfAssessment?: string; notes?: string }` — minimal ama yeterli
- `readJobState()` returns `JobState | null` — safe optional

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **COMPLIANT** | Sadece core/constants import — en temiz modul |
| ADR-001 ESM | COMPLIANT | .js uzantili importlar |

**Not:** Job state file-based (operasyonel state, DB'de degil) — dogru mimari karar.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/job-runner.test.ts`
- Senaryolar:
  - writeJobState + readJobState roundtrip
  - readJobState job yok → null
  - buildTaskSummaries: bos dizin, task dosyalari olan dizin
  - readLatestJobState: birden fazla job, en yenisi seciliyor mu

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `readJobState()` exported ama `readLatestJobState()` icinden internal cagri yapiliyor. Dis caller var mi? `start.ts`'de spesifik jobId ile `readJobState()` cagriliyorsa exported dogru. Eger sadece internal ise unexport edilebilir.

## 10. Security Findings

- **DUSUK RISK:** `jobId` dosya adi construction'inda kullaniliyor: `job-${jobId}.json`. `jobId` `generateJobId()` ile random hex — user-controlled degil, guvenli.
- `buildTaskSummaries()`: TASKS_DIR'den tum `.result` dosyalarini okuyor — sabit path, guvenli.
- Job dosyalari birikmesi: `readLatestJobState()` tum job dosyalarini listeliyor — cok fazla job oldugunda yavastiyabilir.

## 11. Memory V2 Uyumu

N/A — job state operasyonel (sprint calistirma takibi), bilgi degil. DB'ye kaydedilmemesi dogru. `JobState` icinde sprint learnings yok.

## 12. Oneriler

1. Job dosyasi TTL: 30 gun'den eski job dosyalarini auto-clean et (veya `cleanup` tool'unda temizle).
2. `buildTaskSummaries()` result dosyasi JSON.parse hatasini izole et — bozuk result tum summary'i bozmasin.
3. Job dosya sayisi cap: `readdirSync` sonucunu `Math.min(count, 1000)` ile limitleyerek memory spike onle.
4. `readLatestJobState()` mtime sort dogru mu? Test et: job dosyasi touch edilirse yanlış sira.

## 13. Verdict

**ANALYZED** — En temiz ve ADR-008 compliant modul'lerden biri. Kritik sorun yok. Job TTL eksikligi kucuk operational debt. Kompakt ve iyi tipli.
