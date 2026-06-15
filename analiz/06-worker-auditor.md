# Worker ve Auditor — Çalıştırma ve Denetim Rolleri

deckent'te her görev bir **Worker** tarafından çalıştırılır ve bir **Auditor** tarafından izlenir. Bu iki rol, birbirinden tamamen bağımsız ve kasıtlı olarak ayrıştırılmıştır: Worker kod yazar, Auditor asla kaynak kodu yazmaz. Bu belge her iki rolün iç işleyişini, sorumluluk sınırlarını ve nasıl etkileşime girdiklerini açıklar.

---

## Worker — Görev Uygulayıcısı

Worker, Brain tarafından spawn edilen bağımsız bir süreçtir. Her Worker tek bir görevi üstlenir ve aşağıdaki yaşam döngüsünü izler.

### Kaynak Dosyaları

Sprint 144'te gerçekleştirilen god-object split'iyle `src/agents/worker.ts` (~1670 satır) dört modüle bölünmüştür:

| Modül | İçerik |
|-------|--------|
| `worker.ts` | Temel I/O: `readTask()`, `claimTask()`, `writeHeartbeat()`, `writeResult()`, kapsam kontrolü |
| `worker-verify.ts` | Derleme ve test döngüleri: `runCompilationLoop()`, `runTestVerifyLoop()`, `verifyTests()` |
| `worker-lifecycle.ts` | Durum makinesi, güvenli kapanış, `atomicWriteFileSync()`, geri bildirim döngüsü |
| `worker-log.ts` | Yapılandırılmış günlük biçimlendirme ve I/O |

### Görev Talep Etme — `claimTask()`

Worker başlatıldığında `.tasks/task-NNN.json` dosyasını okur ve görevi talep eder:

```typescript
// src/agents/worker.ts
export function claimTask(projectRoot: string, taskId: string): Task
```

Bu işlem şunları içerir:
1. Görev dosyasını okur ve ayrıştırır.
2. Kilitleme dosyasını (`.locks/`) kontrol eder — başka bir Worker aynı dosyaya yazmıyorsa devam eder.
3. Durumu `CLAIMED` olarak günceller ve olayı event stream'e yazar.

### Heartbeat — `writeHeartbeat()`

Worker her dosya değişikliğinde ve belirli aralıklarla `.tasks/task-NNN.hb` dosyasını günceller:

```typescript
export function writeHeartbeat(
  projectRoot: string,
  heartbeat: Heartbeat,
  sprintId?: string,
): void
```

Heartbeat dosyası şunları içerir: `workerId`, `taskId`, `status`, `sequence` (artırımlı sayaç), `timestamp` (ISO 8601 UTC). Auditor bu dosyayı 2 dakikadan uzun süre güncellenmediyse "stale" (bayat) olarak işaretler ve uyarı üretir.

### Sonuç Yazma — `writeResult()`

Worker görevi tamamladığında `.tasks/task-NNN.result` dosyasını yazar:

```typescript
export function writeResult(
  projectRoot: string,
  result: TaskResult,
  sprintId?: string,
): void
```

Sonuç dosyası zorunlu alanlar içerir:
- `selfAssessment`: `"DONE" | "GO_WITH_TECH_DEBT" | "NO_GO"`
- `filesChanged`, `linesAdded`, `linesRemoved`
- `testsPassed`, `coverage`
- `tokenUsage`: `{ inputTokens, outputTokens, cacheReadTokens, provider, model }`
- `notes`: Brain için özet

`tokenUsage` alanı eksikse, Brain NO_GO olarak değerlendirir — bu zorunlu bir protokol kuralıdır.

### Kapsam Kuralları

Worker yalnızca `.tasks/task-NNN.json` içindeki `scope.filesWrite` listesinde belirtilen dosyalara yazabilir. Bu kural kodla zorunlu kılınmaz (ADR-037 V1.0 advisory/soft), ancak Auditor tarafından `git diff --stat` ile sürekli izlenir ve ihlaller `file_outside_scope` uyarısı olarak raporlanır. Worker, kapsam dışı bir değişiklik yaptıysa kendisi `BOUNDARY_VIOLATION` işaretleyerek NO_GO yazmalıdır.

### Doğrulama Döngüsü (Karpathy Disiplini)

Worker kodunu yazdıktan sonra şu adımları izler (max 3 deneme her biri için):
1. `tsc --noEmit` → derleme hatalarını gider
2. Hedeflenen test dosyalarını çalıştır → test başarısızlıklarını gider
3. İkisi de geçerse `selfAssessment = "DONE"`, aksi halde `"NO_GO"`

---

## Auditor — Sürekli Denetçi

Auditor, Brain tarafından `runSpawnPhase()` sırasında başlatılan ve sprint boyunca çalışan bir izleme sürecidir. Kaynak kodu **asla yazmaz**; yalnızca okur, analiz eder ve raporlar.

### Kaynak Dosyaları

- `src/monitor/auditor.ts` — Ana Auditor implementasyonu (1800+ satır)
- `src/monitor/alert-emitter.ts` — Dashboard ve event stream uyarı yazıcısı
- `src/agents/auditor.ts` — Uyumluluk kontrollerini auditor iş akışına yönlendiren ince zarf

### Tarama Döngüsü — `startScanLoop()`

Auditor, 30 saniyede (30.000ms) bir tarama çalıştırır:

```typescript
// src/monitor/auditor.ts
export function startScanLoop(
  projectRoot: string,
  currentSprintId: string,
  intervalMs?: number,  // varsayılan: 30_000
  onScanComplete?: (result: ScanResult) => void,
  autoCleanLocks?: boolean,
  scanOpts?: ScanOptions,
): ReturnType<typeof setInterval>
```

Her tarama döngüsü şunları kontrol eder:

| Kontrol | Yöntem |
|---------|--------|
| Stale heartbeat (>2 dakika) | `.hb` dosyalarının son güncelleme zamanı |
| Kapsam ihlali | `git diff --stat` → dosya listesi vs. worker scope |
| Stale lock (>5 dakika) | `.locks/` dizini timestamp kontrolü |
| ADR uyumsuzluğu | `memory.db` ADR'larına karşı çapraz kontrol (pilot: ADR-006/008/010) |
| Worker canlılığı | Sprint 279: `batchProbeLiveness()` — paralel async prob, O(n) seri yerine |

### Kapsam İhlal Tespiti — `checkBoundaryViolations()`

```typescript
export function checkBoundaryViolations(
  projectRoot: string,
  workerScopes: Map<string, TaskScope>,
): BoundaryViolation[]
```

Auditor, `git diff --stat` komutunu çalıştırarak o anda değiştirilmiş dosyaları listeler. Her dosyayı aktif Worker'ların `scope.directories` ve `scope.filesWrite` listesine karşı karşılaştırır. Eşleşme yoksa `BoundaryViolation` objesi üretilir:

```typescript
{
  type: 'file_outside_scope',
  agentId: workerId,
  detail: `File outside scope: ${filePath}`,
  timestamp: '...',
}
```

Bu ihlaller `.dashboard` dosyasına ve event stream'e yazılır; Brain'e uyarı olarak iletilir.

### Dashboard Güncellemesi

Auditor her tarama döngüsünde `.dashboard` dosyasını yeniden yazar (asla ekleme yapmaz). Bu dosya `deckent status` komutunun görüntülediği canlı verinin kaynağıdır.

### Auditor Asla Kod Yazmaz

Bu kural ADR-037'de (Brain-Auditor-Worker Authority Matrix) açıkça belirtilmiştir:
- Auditor, `src/` veya herhangi bir kaynak dizinine **hiçbir zaman** yazamaz.
- Auditor yalnızca `.dashboard`, `.tasks/` (raporlama), `memory.db` (pattern kayıtları) ve event stream'e yazar.
- Bu sınır ihlal edilirse Auditor'ın bulguları güvenilirliğini yitirir; tarafsız denetim ilkesi çöker.

---

## Worker ve Auditor'ın Etkileşimi

```
Brain (sprint-controller)
    │
    ├── spawn → Worker
    │               │
    │               ├── .hb (30s'de bir)
    │               ├── .plan (kodlamadan önce)
    │               └── .result (tamamlandığında)
    │
    └── spawn → Auditor (startScanLoop, 30s)
                    │
                    ├── okur: .hb dosyaları
                    ├── okur: git diff --stat
                    ├── okur: .locks/ dizini
                    ├── yazar: .dashboard
                    └── yazar: memory.db (pattern)
```

Worker, Auditor'ı hiçbir zaman doğrudan çağırmaz. Auditor, Worker'ı doğrudan etkilemez — yalnızca Brain'e raporlar. Karar Brain'e aittir: bir ihlal tespit edildiğinde Brain FIX fazı başlatır veya sprint'i durdurur.
