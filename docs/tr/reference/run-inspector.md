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
| `revision` | number | Read model'in maximum-source-mtime kuralıyla türetilen monotonic freshness değeri. Projection'ın okuduğu her source'u kapsar. Live stream bunu freshness cursor olarak kullanabilir; event offset, pagination cursor veya backfill position değildir. |
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

`readRunInspectorTaskDetail` tek task drill-down döndürür. Package 1; status, assigned agent/model, heartbeat summary, lock state, bounded plan view ve truncation flag'i ile result summary dahil mevcut task field'larını sağlar. Additive `lineage` block bu key'leri kaldırmaz veya değiştirmez.

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
| `logPath` | string veya `null` | Task'ın kendi log artifact path'i; unavailable ise `null`. |
| `logTailAvailable` | boolean | Task-local log artifact'in mevcut olup olmadığı. Content decode edilemediğinde bile availability truth olarak kalır. |
| `logTail` | `{ lines: readonly string[], truncated: boolean }` veya `null` | Task-local log'un son satırları; log yoksa veya text olarak decode edilemiyorsa `null`. Torn final line olduğu gibi korunur. |
| `resultEvidence` | object veya `null` | Yalnız task'ın kendi result artifact'inden türetilen evidence; usable result yoksa `null`. |
| `resultEvidence.selfAssessment` | string veya `null` | Recorded self-assessment; result içermiyorsa `null`. |
| `resultEvidence.filesChanged` | string array | Recorded changed-file path'leri. Yokluk dürüstçe empty array ile gösterilir. |
| `resultEvidence.notesPresent` | boolean | Result'ın notes içerip içermediği; note content lineage block'a kopyalanmaz. |

Log tail default olarak son 40 satırı döndürür. Caller farklı bir positive count isteyebilir; hard limit 200 satırdır. Joined tail content ayrıca `SPRINT_DETAIL_TEXT_CAP` ile sınırlandırılır; önceki satırlar atlandıysa veya text cap dönen set'i kısalttıysa `truncated` değeri `true` olur. Truncation yalnız typed flag ile bildirilir; content içine ellipsis eklenmez.

## HTTP API

Bunlar monitoring read'leridir ve `/api/sprint/live` ile aynı authentication class'ını kullanır. Server authentication ve route-wide policy için [HTTP ve SSE API surface](api-surface.md) sayfasına bakın.

| Method ve path | Response |
|---|---|
| `GET /api/sprint/live` | Canonical schema-version 1 inspector snapshot. |
| `GET /api/sprint/task/:id` | Bounded `logTail` dahil additive `lineage` block içeren task detail. Mevcut package-1 key'leri korunur. |
| `GET /api/inspector/runs` | Current authority entry ile keşfedilebilen archive entry'lerini içeren run-list envelope. |

API face core read-model paketine bağlıdır. Route registration ikinci bir lifecycle authority oluşturmaz.

`GET /api/sprint/task/:id?tailLines=<1..200>`, döndürülecek maksimum tail satırı sayısını seçer. Parametre verilmezse 40 kullanılır. Zero, 200'den büyük, negative, non-integer ve non-numeric değerler request'i sessizce değiştirmek yerine typed HTTP `400` response döndürür.

## SSE live snapshot stream

`GET /api/sprint/live/stream`, schema-version 1 snapshot'ın monitoring-authenticated live face'idir. `/api/sprint/live` ile aynı authentication class'ını kullanır ve client bağlantıyı kesene kadar Server-Sent Event gönderir.

| Contract | Davranış |
|---|---|
| Snapshot frame | Authority-bound backward-compatible `active` field'ı dahil tam `/api/sprint/live` payload'ını taşıyan `event: snapshot`. Frame'ler event delta değil, complete latest-state projection'larıdır. |
| Initial connection | `sinceRevision` verilmezse current snapshot hemen bir kez teslim edilir. |
| `?sinceRevision=<int>` | Connection cursor'ını prime eder. Stream yalnız snapshot `revision`'ı verilen non-negative integer'dan büyük olduğunda snapshot gönderir; böylece last-seen revision ile reconnect aynı frame'i duplicate etmez. Non-integer veya negative değer stream açmak yerine typed HTTP `400` response döndürür. |
| Coalescing | Delivery revision-gated ve latest-wins'tir. Source revision'ları polling veya delivery'den hızlı ilerlerse intermediate revision'lar atlanabilir; consumer her snapshot'ı complete current state olarak ele almalıdır. |
| Keepalive | `event: ping` frame'leri idle SSE connection'ı açık tutar. Revision cursor'ını ilerletmez veya snapshot taşımaz. |
| Disposal | Client connection kapandığında snapshot observer ve timer'ları dispose edilir. Aynı snapshot'ı replay etmeden devam etmek için son görülen `revision` ile reconnect edilir. |

Bu ilk cursor-stream slice'ı resumable latest-snapshot delivery sağlar. Atlanan intermediate revision'lar için event ledger veya cursor backfill sağlamaz.

## Terminal command

Task 3 read-only Terminal face'ini ship eder:

```bash
deckent inspect
deckent inspect <taskId>
deckent inspect --follow
deckent inspect <taskId> --follow
deckent inspect --json
deckent inspect <taskId> --json
```

| Invocation | Davranış |
|---|---|
| `deckent inspect` | Run ID, state, source ve settlement time ile run listesi gösterir. |
| `deckent inspect <taskId>` | Task status, agent, model, heartbeat summary, plan truncation state, result self-assessment, lineage ve mevcutsa bounded log-tail section gösterir. |
| `deckent inspect --follow` | Run-list header'ını bir kez yazar; ardından lifecycle, phase, worker count ve revision içeren tek status line'ı core snapshot observer üzerinden günceller. Ayrı bir polling loop kurmaz. |
| `deckent inspect <taskId> --follow` | Snapshot revision ilerlediğinde seçilen task'ın status ve heartbeat line'ını yeniden render eder. |
| `--json` | Localized table/detail sunumu yerine machine consumer'lar için core read-model shape'ini üretir. |
| Unknown task ID | Stack trace olmadan typed ve localized message yazıp code `1` ile çıkar. |

Human-readable label'lar İngilizce/Türkçe message catalog'larını kullanır. Command core modülü doğrudan tüketir; formatted API veya Terminal output'tan state infer etmez. Follow mode kapatıldığında veya `SIGINT` ile kesildiğinde snapshot observer ve timer exit öncesinde dispose edilir. JSON task detail, core projection'daki `logTail` değerini verbatim içerir.

## Desktop live stream adoption

Desktop Runs view `/api/sprint/live/stream` endpoint'ine subscribe olur. Stream snapshot'ları authority chip ile current-run row'u günceller; archived row'lar run-list fetch'ten gelmeye devam eder. Worker view, snapshot içinde seçilen task bulunduğunda o task'ın heartbeat'ini mounted view'a ait stream subscription üzerinden günceller. Her mounted view en fazla bir subscription taşır ve unmount sırasında kapatır.

Stream failure açıkça gösterilir: Runs view localized degradation notice gösterir ve manual refresh affordance'ını kullanılabilir tutar. Stale data'yı sessizce live olarak sunmaz. Desktop authoritative snapshot field'larını tüketir; renderer içinde lifecycle state türetmez.

## MCP tool

`deckent_inspect`, Terminal command'ın read-only MCP twin'idir. Aynı core projection'ları okur ve tek optional argument kabul eder:

| Argument'lar | Sonuç |
|---|---|
| Argument yok | [Run list shape](#run-list-shape) altında belgelenen `listRunInspectorRuns` list envelope'unu döndürür. |
| `{ "taskId": "<taskId>" }` | `lineage` dahil [Task detail shape](#task-detail-shape) altında belgelenen `readRunInspectorTaskDetail` object'ini döndürür. |
| Unknown veya invalid `taskId` | Typed MCP error result döndürür; tool uncaught exception fırlatmaz veya task uydurmaz. |

Başarılı MCP JSON shape'ları sırasıyla `deckent inspect --json` ve `deckent inspect <taskId> --json` çıktılarıyla aynıdır. Bu, ayrı formatlanmış bir approximation değil projection parity'dir: MCP ve Terminal aynı core read model'i tüketir.

## Face availability

| Face | Package status |
|---|---|
| Core read model | Snapshot, disposable snapshot observer, task detail, run list, lineage ve bounded log-tail content. |
| HTTP API | Run list, `tailLines` içeren additive task lineage ve `/api/sprint/live/stream` latest-snapshot SSE. |
| Terminal | `deckent inspect` list/detail, follow ve JSON mode'ları. |
| MCP | Terminal JSON-shape parity ile `deckent_inspect` list/detail. |
| Desktop | Runs ve Worker view'ları live snapshot stream'i explicit manual-refresh degradation ve unmount disposal ile kullanır. |

## Explicit non-goal'lar ve açık 6071 dimensions

Package 4; daha önce ship edilen revision-cursor stream'e bounded log-tail lineage, API tail selection, Terminal follow mode ve Desktop stream adoption ekler. Tüm `RUN-INSPECTOR-001` outcome'unu kapatmaz. Aşağıdaki 6071 dimension'ları açık kalır:

- Henüz million-event virtualization implementation veya proof'u yoktur.
- Attempt, agent, worker, tool, MCP, context, prompt/skill, token/cost/latency, checkpoint, approval, policy, verifier, result ve evidence lineage'ın tamamını kapsayan complete cross-surface execution timeline henüz yoktur.

Mevcut full log streaming ayrı bir face olarak kalır; task-detail lineage yalnız yukarıda açıklanan bounded tail'i taşır.
