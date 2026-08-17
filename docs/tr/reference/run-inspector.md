# Run inspector read model

## Product contract

Run inspector, run state'in canonical ve read-only projection'ıdır. Response shape'larının sahibi core read model'dir. HTTP ve Terminal bu modelin face'leridir; lifecycle state'i bağımsız hesaplamazlar.

Lifecycle'ın tek authority'si canonical run-status authority'dir. Inspector artifact'leri task, archive, heartbeat, plan, result, lock ve lineage evidence ekleyebilir; ancak lifecycle'ı override veya yeniden infer etmez. Böylece mevcut [`/api/sprint/*` contract'ı](api-surface.md) ile yeni inspector face'leri tek truth kullanır.

Paket, eksik veya malformed optional artifact file'larını tolerant biçimde ele alır. Değer uydurmak yerine nullable veya empty evidence döndürür. Inspector okumak run state'i mutate etmez.

## Snapshot shape

Schema-version 1 snapshot, `/api/sprint/live` tarafından servis edilen canonical live-run projection'ıdır. Mevcut response key'leri compatible kalır; inspector field'ları additive'dir.

| Field | Type | Anlamı |
|---|---|---|
| `schemaVersion` | `1` | Inspector response contract'ının version'ı. Additive field'lar version 1'i değiştirmez; semantic değişiklik version değişikliği gerektirir. |
| `generatedAt` | ISO-8601 string | Projection'ın üretildiği zaman. Lifecycle timestamp'i değildir. |
| `revision` | number | Read model'in maximum-source-mtime kuralıyla türetilen monotonic freshness değeri. Projection'ın okuduğu her source'u kapsar. Event offset veya pagination cursor olarak kullanılmaz. |
| `lifecycle` | canonical lifecycle value | Run-status authority'den kopyalanan lifecycle. Artifact varlığı bu değerin yerini alamaz. |
| `active` | boolean | Aynı lifecycle authority'den türetilen backward-compatible active-state projection'ı. |
| `tasks` | task summary array | Current run için tolerant biçimde parse edilen task view'ları. Eksik optional artifact'ler missing veya nullable kalır. |

## Run list shape

`listRunInspectorRuns(projectRoot, opts?)`, current logical run ile runtime'ın zaten yazdığı settlement/archive layout'larında keşfedilen archived run'ları döndürür.

### List envelope

| Field | Type | Anlamı |
|---|---|---|
| `schemaVersion` | `1` | Inspector schema version'ı. |
| `generatedAt` | ISO-8601 string | Projection üretim zamanı. |
| `revision` | number | Bu response için okunan authority ve archive source'larının maximum-source-mtime revision'ı. Yeni archive record eklenmesi değeri ilerletebilir. |
| `runs` | run entry array | Önce current run, ardından newest-first archive'lar. Archive directory yoksa yalnız current authority entry döner. |

### Run entry

| Field | Type | Anlamı |
|---|---|---|
| `runId` | string | Authority veya archive record'da bulunan logical run identifier. |
| `lifecycle` | `source` `authority` iken canonical lifecycle value | Run-status authority'den kopyalanan current lifecycle. Archive file'larından infer edilmez. |
| `recordState` | `source` `archive` iken archive record state | Archived settlement record'ın kaydettiği state. Current lifecycle authority'ye yükseltilmez. |
| `source` | `'authority' \| 'archive'` | Entry'nin provenance'ı. |
| `startedAt` | string veya `null` | Recorded start time; source içermiyorsa `null`. |
| `settledAt` | string veya `null` | Recorded settlement time; yoksa `null`. |
| `taskCounts` | recorded task-count object veya `null` | Source record'da bulunan count'lar. Eksik count'lar yeniden hesaplanmaz. |

## Task detail shape

`readRunInspectorTaskDetail` tek task drill-down döndürür. Package 1; status, assigned agent/model, heartbeat summary, lock state, bounded plan view ve truncation flag'i ile result summary dahil mevcut task field'larını sağlar. Bu paketin Task 1'i, bu key'leri kaldırmadan veya değiştirmeden `lineage` ekler.

### Detail field'ları

| Field | Anlamı |
|---|---|
| Task identity ve status | İstenen task'ı tanımlar ve artifact-backed task state'i raporlar. Unknown ID yerine synthetic task üretilmez. |
| Agent ve model | Task için kaydedilmiş değerlerdir; yokluk korunur. |
| Heartbeat summary | Task heartbeat'inin bounded, tolerant projection'ıdır; liveness authority claim'i değildir. |
| Lock state | Artifact-backed lock bilgisidir; canonical run lifecycle'ı override etmez. |
| Plan ve truncated flag | Bounded plan projection'ı. Explicit flag content'in truncate edilip edilmediğini bildirir; consumer truncated plan'ı complete gösteremez. |
| Result summary | Varsa `selfAssessment` dahil artifact-backed result field'ları. |
| `lineage` | Aşağıda açıklanan task-local log ve result-evidence provenance'ı. |

### Lineage block

| Field | Type | Anlamı |
|---|---|---|
| `logPath` | string veya `null` | Task'ın kendi log artifact path'i; unavailable ise `null`. Detail response log content içermez. |
| `logTailAvailable` | boolean | Task-local log tail'in mevcut log face'i üzerinden alınıp alınamayacağı. Log content'in buraya embed edildiği anlamına gelmez. |
| `resultEvidence` | object veya `null` | Yalnız task'ın kendi result artifact'inden türetilen evidence; usable result yoksa `null`. |
| `resultEvidence.selfAssessment` | string veya `null` | Recorded self-assessment; result içermiyorsa `null`. |
| `resultEvidence.filesChanged` | string array | Recorded changed-file path'leri. Yokluk dürüstçe empty array ile gösterilir. |
| `resultEvidence.notesPresent` | boolean | Result'ın notes içerip içermediği; note content lineage block'a kopyalanmaz. |

## HTTP API

Bunlar monitoring read'leridir ve `/api/sprint/live` ile aynı authentication class'ını kullanır. Server authentication ve route-wide policy için [HTTP ve SSE API surface](api-surface.md) sayfasına bakın.

| Method ve path | Response |
|---|---|
| `GET /api/sprint/live` | Canonical schema-version 1 inspector snapshot. |
| `GET /api/sprint/task/:id` | Additive `lineage` block içeren task detail. Mevcut package-1 key'leri korunur. |
| `GET /api/inspector/runs` | Current authority entry ile keşfedilebilen archive entry'lerini içeren run-list envelope. |

API face core read-model paketine bağlıdır. Route registration ikinci bir lifecycle authority oluşturmaz.

## Terminal command

Task 3 read-only Terminal face'ini ship eder:

```bash
deckent inspect
deckent inspect <taskId>
deckent inspect --json
deckent inspect <taskId> --json
```

| Invocation | Davranış |
|---|---|
| `deckent inspect` | Run ID, state, source ve settlement time ile run listesi gösterir. |
| `deckent inspect <taskId>` | Task status, agent, model, heartbeat summary, plan truncation state, result self-assessment ve lineage gösterir. |
| `--json` | Localized table/detail sunumu yerine machine consumer'lar için core read-model shape'ini üretir. |
| Unknown task ID | Stack trace olmadan typed ve localized message yazıp code `1` ile çıkar. |

Human-readable label'lar İngilizce/Türkçe message catalog'larını kullanır. Command core modülü doğrudan tüketir; formatted API veya Terminal output'tan state infer etmez.

## Face availability

| Face | Package status |
|---|---|
| Core read model | Package 1 + Task 1: snapshot, task detail, run list ve lineage. |
| HTTP API | Task 2: run list endpoint ve additive task lineage. |
| Terminal | Task 3: `deckent inspect` list/detail ve JSON mode'ları. |
| Desktop | HTTP paketinden sonraki Task'a bağlıdır; burada belgelenen package 1–2 kapsamına dahil değildir. |

## Explicit non-goal'lar ve açık 6071 dimensions

Package 1–2 bounded bir read-model ve face expansion'dır; tüm `RUN-INSPECTOR-001` outcome'unun kapanışı değildir. Aşağıdakiler açık 6071 dimension'ları olarak kalır:

- Henüz million-event virtualization implementation veya proof'u yoktur.
- Henüz revision-plus-cursor event stream, cursor backfill veya resume stream yoktur. `revision` cursor değildir.
- Attempt, agent, worker, tool, MCP, context, prompt/skill, token/cost/latency, checkpoint, approval, policy, verifier, result ve evidence lineage'ın tamamını kapsayan execution graph/timeline henüz yoktur.
- Reconnect, ordering, deduplication veya backpressure closure henüz yoktur.
- Bu paketlerde Desktop parity, tenant-isolation proof, accessibility proof veya Linux/macOS/Windows-native/WSL scale proof claim edilmez.

Mevcut log streaming ayrı bir face olarak kalır. Task-detail lineage block bilinçli olarak availability ve provenance gösterir; log content göstermez.
