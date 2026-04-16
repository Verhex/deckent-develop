# Analysis: src/cli/helpers/worker-status.ts
**Task ID:** 142-021 | **Model:** opus | **LoC:** 89 | **Effort:** max

## 1. Amaci
Worker heartbeat dosyalarini okuyarak aktif worker'larin durumunu izleyen tracker sinifi. `.tasks/` dizinindeki `.hb` dosyalarini tarar, JSON parse eder ve WorkerProgressEntry formatinda dondurur. Stale worker tespiti (2 dakika esik) ve status-to-progress mapping yaparak dashboard/status komutlarina veri saglar. Auditor tarama dongusu ve status komutu tarafindan kullanilir.

## 2. Public API
- `interface HeartbeatData` — HB dosya formati (workerId, taskId, status, currentFile, timestamp, agentId)
- `class WorkerStatusTracker`
  - `constructor(staleThresholdMs?: number)` — Yapilandirılabilir stale esigi (varsayilan 2dk)
  - `pollWorkerStatus(tasksDir: string): WorkerProgressEntry[]` — Tum HB dosyalarini tara
  - `parseHeartbeat(filePath: string): WorkerProgressEntry | null` — Tek HB dosyasi parse
  - `isStale(timestamp: string): boolean` — Stale kontrolu
  - `statusToProgress(status: string): number` — Status → yuzde mapping
- JSDoc: **TAMAMEN EKSIK**

## 3. Ic Bagimliliklar
- `./progress.js` → `WorkerProgressEntry` (type import)
- Dongusel bagimlilik riski: YOK

## 4. Dis Bagimliliklar
- `node:fs` → `readdirSync`, `readFileSync` — ADR-010 uyumlu
- `node:path` → `join` — ADR-010 uyumlu

## 5. Complexity
- 1 sinif, 4 metot + 1 constructor
- En karmasik: `pollWorkerStatus` (satir 24-44, cyclomatic ~3) — dosya tarama + filtreleme
- `parseHeartbeat` (satir 46-65, cyclomatic ~2)
- **BASIT** modul

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `as unknown`: 0
- `JSON.parse(raw)` → `HeartbeatData` (satir 49) — unsafe type assertion ama try/catch ile korunuyor
- Non-null `!`: 0
- **IYI** tip guvenligi

## 7. ADR Compliance
- **ADR-006:** spawnSync kullanmiyor — UYUMLU
- **ADR-008:** N/A (brain import yok)
- **ADR-010:** UYUMLU
- **ADR-035 (verification protocol):** Heartbeat formati api-surface.md'deki tanim ile uyumlu ✓
- Memory V2: N/A (dosya-tabanli heartbeat, DB ile ilgisiz)

## 8. Test Coverage
- `tests/cli/helpers/worker-status.test.ts` — MEVCUT
- Edge case: Okunamayan HB dosyasi → try/catch null return (satir 64) ✓
- Edge case: readdirSync hatasi → bos array return (satir 30) ✓
- Edge case: NaN timestamp → `isStale` true dondurur (Date.now() - NaN = NaN > threshold = false) — **POTANSIYEL BUG:**
  - `Date.now() - new Date("invalid").getTime()` = `Date.now() - NaN` = `NaN`
  - `NaN > this.staleThresholdMs` = `false`
  - Yani gecersiz timestamp'li worker STALE olarak isaretlenMEZ — bu HATALI davranis
  - **P1 BUG:** `isStale` gecersiz timestamp icin `false` dondurur, `true` dondurmeli

## 9. TODO/FIXME/HACK Inventory
- **HIC YOK**

## 10. Dead Code
- Tum metotlar ve interface kullaniliyor
- `STALE_THRESHOLD_MS` sabiti constructor default olarak kullaniliyor
- **DEAD CODE YOK**

## 11. Security
- `readdirSync` + `readFileSync`: Dosya yolu sabit dizin icinde — path traversal riski dusuk
- `JSON.parse`: try/catch ile korunuyor — DoS riski minimal
- `HeartbeatData` kullanici girdisi degil, worker tarafindan yazilir — guvenilir kaynak
- **GUVENLIK SORUNU YOK**

## 12. Memory V2 Uyumu
- N/A — heartbeat dosya-tabanli mekanizma, Memory V2'den bagimsiz

## 13. i18n
- Kullanici-gorunur string: "STALE" (satir 51) — hardcoded ama teknik terim, i18n gerektirmez
- `statusToProgress` mapping: Ingilizce status degerleri (CODING, EXECUTING, TESTING, DOCUMENTING, DONE) — bunlar sistem sabitleri, i18n gereksiz
- **i18n SORUNU YOK**

## 14. Dokumantasyon Tutarliligi
- JSDoc: TAMAMEN EKSIK
- `HeartbeatData` interface: api-surface.md ile uyumlu ama JSDoc yok
- `STALE_THRESHOLD_MS` yorum: "2 minutes" ✓
- `statusToProgress` mapping mantigi dokumante edilmemis
- **P3:** JSDoc eksikligi

## 15. Performance
- Sync I/O: `readdirSync` (1), `readFileSync` (N — her HB dosyasi icin) = **N+1 sync cagri**
- 48-task sprint'te ~48 readFileSync cagisi — kabul edilebilir
- `Date.now()` her `isStale` cagrisinda — `pollWorkerStatus` icinde tek bir `now` cache'leyerek optimize edilebilir
- **P3 OPTIMIZASYON:** `pollWorkerStatus` icinde `Date.now()` cache — her parseHeartbeat icin yeni Date olusturuluyor

## 16. Oneriler
- **P1 BUG FIX:** `isStale` fonksiyonunda gecersiz timestamp guard'u eklenmeli:
  ```typescript
  isStale(timestamp: string): boolean {
    const ts = new Date(timestamp).getTime();
    if (isNaN(ts)) return true; // gecersiz = stale kabul et
    return Date.now() - ts > this.staleThresholdMs;
  }
  ```
- **P3:** JSDoc eklenmesi — ozellikle `statusToProgress` mapping mantigi icin
- **P3:** `pollWorkerStatus` icinde `Date.now()` cache — tek bir `now` degiskeni kullanilabilir
- **P3:** `HeartbeatData.agentId` → `agentName` tutarsizligi — interface'de `agentId`, WorkerProgressEntry'de `agentName`

## Verdict: ANALYZED
