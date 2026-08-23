# Deckent `Sprint` → `Run` Tam Kapsamlı Değişim Analizi ve Uygulama Planı

> Durum: **ANALİZ / UYGULAMA YOK**
> Envanter tarihi: **2026-08-22 (Europe/Istanbul)**
> Kapsam: repository source, tests, docs, generated artifacts, runtime state, SQLite/data contracts,
> arşivler, public API/CLI/MCP/SDK yüzeyleri, observability, RBAC, Git metadata ve geçmiş migration
> çalışmaları.
> Bu belge analiz görevi gereği geçici olarak hem dosya adında hem içerikte eski terimi taşır. Nihai
> lexical-zero gate öncesinde dışarı alınmalı veya kaldırılmalıdır.

## 1. Yönetici özeti

Deckent'ten `sprint` kelimesini tamamen kaldırıp canonical kavramı `run` yapmak mümkündür; fakat bu
bir toplu search/replace işi değildir. Bugünkü sistemde eski terim aynı anda şunları temsil ediyor:

- domain aggregate ve lifecycle (`Sprint`, `SprintPhase`, `runSprint()`),
- persistent identity (`sprintId`, `sprint_num`, `sprint-621`),
- dosya/dizin protokolü (`.brain/sprints`, `archive/sprints`, `sprint-state.json`),
- public CLI/API/MCP/SDK contractı,
- event, permission, config, metric ve KPI namespace'i,
- dashboard/desktop/connector tüketici contractı,
- geçmiş evidence, archive manifest, receipt ve hash zinciri,
- dokümantasyon, i18n, test fixture ve Git geçmişi.

Üstelik `run` kelimesi repoda zaten iki farklı anlamda kullanılıyor:

1. Goal → Mission → Flow → **Run** → WorkItem → Attempt → Operation zincirindeki kabul edilmiş
   yürütme nesnesi.
2. `deckent run <description>` ile tek işi doğrudan çalıştıran mevcut CLI yüzeyi.

Bu namespace çakışması çözülmeden `Sprint` → `Run` type rename yapılırsa `runRun()`, belirsiz
`deckent run` davranışı ve `/api/run` ile mevcut `/api/run-flow/*` arasında contract karmaşası
oluşur.

Önerilen nihai model şudur:

| Alan | Nihai canonical ad |
|---|---|
| Yürütme aggregate'i | `Run` |
| Kimlik | `runId`, `runNumber`, disk üzerinde `run-<number>` |
| Lifecycle function | `executeRun()` |
| Lifecycle CLI namespace'i | `deckent run …` |
| Tek-iş komutu | `deckent task run <description>` |
| Ön-yürütme planı | `Flow` — `Run` ile birleştirilmez |
| İş birimi | `WorkItem` |
| Tek deneme | `Attempt` |
| Düşük seviye işlem | `Operation` |

Tam lexical-zero ile backward compatibility aynı repository sürümünde birlikte sağlanamaz. Eski
istemciyi tanımak, eski field'ı parse etmek veya eski dizini okumak için kodda eski literal bulunmak
zorundadır. Bu nedenle enterprise-grade geçiş iki sürümlü olmalıdır:

- **Bridge release (N):** yeni `run` contractları canonical olur; eski contractlar yalnız migration
  adapterı olarak okunur, dual-read/dual-write veya projection uygulanır, tüm veri dönüştürülür ve
  telemetry ile legacy kullanım ölçülür.
- **Zero release (N+1):** eski alias, parser, field, path ve literal ana repodan tamamen çıkarılır.
  Gecikmiş kurulumlar için legacy migrator ana repodan bağımsız, signed bir araç/artifact olarak
  tutulur.

Ham tarihsel archive/evidence dosyaları byte-level değiştirilmemelidir. İçerik değiştirmek eski
SHA-256, receipt, imza ve evidence referanslarını geçersiz kılar. Öneri: özgün legacy byte'ları
content-addressed, signed, repo-dışı bir WORM vault'a mühürlemek; aktif projection'ları `run`
terminolojisiyle yeniden üretmek; doğrulama ve retention koşulları sağlanmadan hiçbir kaynağı
silmemektir.

Git geçmişinde 1.000'den fazla commit subject'inde ve tarihsel object'lerde eski kelime vardır.
Nihai hedef **HEAD + shipped package + aktif runtime/data lexical-zero** olarak tanımlanmalıdır.
Tüm Git object database'i için lexical-zero istenirse bu ayrı, destructive bir history-rewrite
programıdır; commit hash'leri, tag'ler, dış referanslar ve imzalı receipt'ler kırılır. Bu rapor history
rewrite önermemektedir.

## 2. Kesin hedef ve kapsam tanımı

### 2.1 Önerilen “tamamen kaldırma” tanımı

`ZERO-RUN-VOCABULARY` kabul kriteri aşağıdaki aktif yüzeylerde case-insensitive eski literalin
bulunmamasıdır:

- tracked source, tests, scripts, config, docs ve assets,
- release package (`npm pack`) ve derlenmiş `dist/`, dashboard/extension çıktıları,
- public JSON, HTTP, SSE, MCP, CLI, SDK, config ve environment contractları,
- aktif SQLite schema/row/value/index adları,
- aktif runtime, scheduler, task, archive projection ve cache path'leri,
- log/event/metric/trace/permission/action/i18n namespace'leri,
- filename, dirname, import specifier, symbol, comment, test title ve sample data,
- güncel repository-local memory projectionları ve generated exports.

Şunlar bu tanımın dışında, ayrı custody altında tutulmalıdır:

- `.git/` object database'indeki immutable geçmiş,
- repo dışına mühürlenmiş özgün legacy archive/evidence vault'u,
- bridge release'in ayrı ve signed legacy migrator artifact'ı.

Bu istisnalar gizli bypass değildir: konumları, digest manifestleri, retention/owner authority ve
restore prosedürü durable olarak kaydedilmelidir.

### 2.2 Kapsama giren semantic değişim

Yalnız kullanıcı metni değil, eski domain adıyla bağlı bütün contractlar değişecektir:

```text
Sprint              -> Run
SprintPhase         -> RunPhase
SprintStatus        -> RunStatus
SprintMetrics       -> RunMetrics
SprintResult        -> RunResult
sprintId            -> runId
sprintNumber/Num    -> runNumber
runSprint()         -> executeRun()
sprint-* / sprints/ -> run-* / runs/
```

`runSprint()` için doğrudan `runRun()` üretilmesi yasaktır. Fiil ve noun çakışmasını önlemek için
canonical orchestrator giriş noktası `executeRun()` olmalıdır.

### 2.3 Kapsama girmeyen yanlış yaklaşımlar

- Case-sensitive veya yalnız source'a uygulanan search/replace.
- Eski literalin string parçalama, encoding veya dynamic concatenation ile saklanması.
- Evidence/archive dosyalarını hash/receipt zincirini gözetmeden in-place değiştirme.
- Eski ve yeni DB/path yazarlarının aynı anda fencing olmadan çalışması.
- `Run` ile `Flow`, `WorkItem`, `Attempt` veya `Operation` kavramlarını birleştirme.
- Public contractı yalnız UI label değiştirerek “tamamlandı” sayma.
- Tarihsel data kaybını lexical-zero uğruna kabul etme.

## 3. Analiz yöntemi ve kanıt kaynakları

Bu çalışma implementation veya runtime mutation yapmadan aşağıdaki read-only kanıtları birleştirdi:

- tracked tree ve bütün workspace üzerinde case-insensitive içerik/path envanteri,
- `src/`, `tests/`, `docs/`, `.deckent/`, `.brain/`, `.tasks/`, `scripts/` ve `dist/` ayrımı,
- ignored runtime/archive verilerinin ayrı sayımı,
- TypeScript export/symbol, public route, CLI option, config, DB schema, event ve permission taraması,
- Git commit subject, branch ve tag taraması,
- `.brain/memory.db` üzerinden önceki karar ve learning sorguları,
- eski run-rename commitleri ve arşivlenmiş task evidence'larının incelenmesi,
- canonical çalışma policy ve execution contractlarının okunması.

Başlıca yerel kaynaklar:

- `AGENTS.md`
- `DIRECTIVES.md`
- `docs/governance/deckent-dev-operating-policy.md`
- `docs/MASTER-PLAN.md`
- `docs/en/architecture.md`
- `docs/en/glossary.md`
- `docs/en/cli.md`
- `src/core/sprint-types.ts`
- `src/core/run-flow-contract.ts`
- `src/cli/commands/run.ts`
- `src/cli/commands/mode.ts`
- `src/core/constants.ts`
- `.brain/memory.db`
- `.brain/archive/sprints/`, `.deckent/archive/sprints/`, `.tasks/archive/`

Envanter bir zaman fotoğrafıdır. Runtime ve ignored archive dizinleri yazılmaya devam edebildiği için
uygulamaya başlanacağı anda machine-readable manifest yeniden üretilmeli ve freeze/fencing altında
tekrar sayılmalıdır.

## 4. Sayısal envanter

### 4.1 Tracked repository

Case-insensitive tracked-tree snapshot:

| Ölçüm | Sonuç |
|---|---:|
| Eski literal içeren tracked dosya | 4.061 |
| Tracked içerik eşleşmesi | 100.669 |
| Adında eski literal bulunan tracked path | 773 |
| Git commit toplamı | 3.327 |
| Subject'inde eski literal bulunan commit | 1.028 |
| İlgili tag | 1 (`sprint-176-uncommitted-rollback`) |
| İlgili remote branch | 1 (`origin/recover-sprint223-nervous-finalizer`) |

Tracked alan kırılımı:

| Alan | İçerik eşleşen dosya | Eşleşme | Adı eşleşen path |
|---|---:|---:|---:|
| `src/` | 802 | 16.508 | 42 tracked; mevcut diskte 43 |
| `tests/` | 1.748 | 33.677 | 107 |
| Güncel docs (`docs/archive` hariç) | 171 | 4.772 | 1 |
| `docs/archive/` | 998 | 39.697 | 539 |
| Güncel `.deckent/` (`archive` hariç) | 165 | 506 | 80 |
| Güncel `.brain/` (`archive` hariç) | 5 | 3.683 | 1 |
| `scripts/` | 62 | 946 | 2 |

`src/` occurrence yoğunluğu:

| Modül | Eşleşme |
|---|---:|
| `src/orchestra/` | 7.275 |
| `src/core/` | 3.346 |
| `src/cli/` | 2.879 |
| `src/mcp/` | 688 |
| `src/dashboard/` | 555 |
| `src/nervous/` | 488 |
| `src/api/` | 363 |
| `src/monitor/` | 279 |
| `src/agents/` | 180 |
| `src/connectors/` | 131 |
| `src/desktop/` | 100 |
| `src/agent/` | 73 |
| `src/sdk/` | 53 |
| `src/providers/` | 51 |
| `src/extensions/` | 32 |
| `src/training/` | 12 |
| `src/mcp-client/` | 3 |

Ek contract göstergeleri:

- `Sprint`/`sprint` içeren **443 exported TypeScript declaration**, 132 source dosyasına yayılmıştır.
- API/MCP/SDK yüzeylerinde `sprintId`, `sprint_id`, `sprint_num`, `sprintNumber`, `sprintActive`,
  `lastSprint`, `sprintSummary`, `sprints` ailesinden en az **267** eşleşme vardır.
- `docs/SPRINT-LOG.md`, güncel docs içindeki path-level ana çakışmadır; archive dokümanlarında ayrıca
  yüzlerce filename/anchor vardır.

### 4.2 Ignored/runtime/archive veri

Bu alanlar tracked sayıların içinde değildir ve değişimin asıl data-migration hacmini gösterir:

| Alan | Toplam dosya | Adı eşleşen | İçeriği eşleşen | Eşleşme | ID kapsamı |
|---|---:|---:|---:|---:|---|
| `.deckent/archive/sprints` | 4.460 | 4.460 | 2.501 | 119.404 | 465 ID, yaklaşık 134–622 |
| `.brain/archive/sprints` | 17.297 | 17.297 | 8.443 | 441.410 | 378 ID, yaklaşık 171–621 |
| `.tasks/archive` | 1.220 | 353 | 375 | 14.960 | 8 ID, 532–621 |
| `.brain/sprints` | 397 | 397 | 397 | 674 | 136–622 |
| `.deckent/runtime` | 3.554 | 3.084 | 3.270 | 25.108 | 618 pattern match |
| `.deckent/recently-works` | 269 | 160 | 233 | 7.102 | 125 ID, 487–622 |
| `dist/` | 2.378 | 74 | 1.122 | 17.944 | generated artifact |

`.deckent/runtime` içinde `sprint-1780659451538` gibi timestamp-benzeri kimlik de vardır. Migration
parser'ı bütün suffix'leri ardışık küçük integer varsayamaz; identifier grammar'ını parse etmeli,
tanınmayan değeri typed quarantine'e almalıdır.

Bütün workspace üzerinde geniş raw tarama yaklaşık **1.459.212** case-insensitive eşleşme bulmuştur.
Bu sayı cache/generated/runtime tekrarlarını içerdiği için acceptance baseline değil, ölçek göstergesidir.

### 4.3 Güncel source filename'leri

Bugün adı değişmesi gereken production source dosyaları:

```text
src/agents/cross-sprint-analyzer.ts
src/api/sprint-job-runner.ts
src/cli/helpers/sprint-summary-rich.ts
src/cli/helpers/sprint-summary.ts
src/connectors/kpi-sprint-summary.ts
src/core/sprint-archive.ts
src/core/sprint-file-retention.ts
src/core/sprint-finalizer-gate-authority.ts
src/core/sprint-status-authority.ts
src/core/sprint-terminal-publication-status.ts
src/core/sprint-terminal-publication.ts
src/core/sprint-types.ts
src/core/sprint-work-attribution.ts
src/dashboard/src/components/SprintChart.tsx
src/dashboard/src/components/SprintControlPanel.test.tsx
src/dashboard/src/components/SprintControlPanel.tsx
src/dashboard/src/components/SprintPhaseTimeline.tsx
src/dashboard/src/components/SprintSummary.tsx
src/monitor/sprint-state.ts
src/orchestra/cross-sprint-analyzer.ts
src/orchestra/doc-updaters/sprint-log.ts
src/orchestra/mid-sprint-adapter.ts
src/orchestra/recovery-adapters/sprint-recovery-adapter.ts
src/orchestra/sprint-checkpoint.ts
src/orchestra/sprint-controller.ts
src/orchestra/sprint-docs-helpers.ts
src/orchestra/sprint-docs-updater.ts
src/orchestra/sprint-estimator.ts
src/orchestra/sprint-finalizer.ts
src/orchestra/sprint-lifecycle.ts
src/orchestra/sprint-metrics.ts
src/orchestra/sprint-phases.ts
src/orchestra/sprint-pid-manager.ts
src/orchestra/sprint-planner.ts
src/orchestra/sprint-recovery-operation.ts
src/orchestra/sprint-reporter.ts
src/orchestra/sprint-retro-writer.ts
src/orchestra/sprint-runner-entry.ts
src/orchestra/sprint-runtime.ts
src/orchestra/sprint-spawner.ts
src/orchestra/sprint-state-tracker.ts
src/orchestra/sprint-terminal-evidence.ts
src/orchestra/sprint-utils.ts
```

`src/core/sprint-archive.ts` bu analiz anında untracked ve devam eden archive çalışmasının parçasıdır.
Rename implementation'ı bu çalışmayı ezmemeli; önce land/rebase durumu netleştirilmeli, sonra aynı
canonical migration'a alınmalıdır.

107 test filename'i ve 539 archived-doc filename'i de değişmelidir. Bunların tek tek elle listelenmesi
yerine uygulama sırasında hash'li, machine-readable source→target manifest üretilmelidir.

## 5. Önceki `run` terminolojisi çalışmalarının rekonstrüksiyonu

Bu değişim daha önce dört ana slice halinde başlatılmış, fakat bilinçli olarak iç contractlar frozen
bırakılmıştır:

| Commit | Tarih / eski çalışma | Yapılan | Bilinçli kalan |
|---|---|---|---|
| `c37ed4850` | 2026-07-06 / Run-Rename slice 1, run 378 | `deckent run start\|status\|retro\|history` delegasyonu; `mode run` alias'ı; `Run N (sprint)` bridge label | stored mode ve core hâlâ eski terim |
| `51f124fc` | 2026-07-11 / run 403 | 34 EN/TR i18n message pair'i kullanıcı yüzeyinde `run` diline çevrildi | public/internal contractların çoğu |
| `6331277c` | 2026-07-19 / run 449, slice 2 | CLI/MCP/docs user-facing geçişi; 2.468 satırlık envanter | file/module/type/DB/API/RBAC/config/path frozen |
| `6d18a01a` | 2026-07-19 / run 450, slice 3 | kalan üç status key bridge diline çevrildi | full rename yapılmadı |

Kanıtlar hem Git'te hem ilgili archive'larda mevcuttur:

- `.brain/archive/sprints/sprint-403-tasks/`
- `.deckent/archive/sprints/sprint-403/`
- `.brain/archive/sprints/sprint-449-tasks/`
- `.deckent/archive/sprints/sprint-449/`
- `.brain/archive/sprints/sprint-450-tasks/`
- `.deckent/archive/sprints/sprint-450/`

Eski inventory'nin açıkça kapsam dışı bıraktığı öğeler yeni tam değişimde **kapsam içidir**:

- `sprintId` ve bütün türevleri,
- internal module/file adları,
- DB `sprint_id`, `sprint_num` ve type value `'sprint'`,
- types/interfaces,
- test fixtures,
- `deckent_style: "sprint"`,
- `kind: "sprint"`,
- RBAC `sprint:read`, `sprint:write`, `Permission.SPRINT_*`,
- `GET /api/sprint` ailesi,
- `KILL_LIVE_SPRINT`,
- `--sprint`, `--sprint-id`, `--sprint-min`, `--sprints` option ailesi,
- `.brain/sprints/sprint-N` ve tüm archive/runtime path'leri,
- event, IPC, branch ve receipt referansları.

`.brain/memory.db` içindeki accepted ADR-G-024, `sprint | task | process` mode architecture'ını ve eski
terminolojinin evrensel kullanıcı diline dönüştürülmesi direktifini taşır. Ancak stored enum'un hâlâ
eski değer olması da bu kararın tam uygulanmadığını gösterir. Immutable/accepted karar kayıtları elle
sessizce düzenlenmemeli; yeni isimlendirme ADR amendment/supersession ve migration receipt'i ile
ilerlemelidir.

## 6. Bugünkü semantic ve namespace çakışmaları

### 6.1 `Run` ile `Flow` ayrımı

`src/core/run-flow-contract.ts` halihazırda proposal → approval → start state machine'ini taşır.
Buradaki `RunFlow`, kabul edilmiş execution aggregate'i ile aynı şey değildir:

```text
Goal
  └─ Mission
      └─ Flow        (plan/proposal/approval)
          └─ Run     (admitted governed execution)
              └─ WorkItem
                  └─ Attempt
                      └─ Operation
```

Tam değişim bu ontolojiyi güçlendirmeli; `Flow` veya `WorkItem` tekrar `Run` adı altında
bulanıklaştırılmamalıdır.

### 6.2 CLI çakışması

`src/cli/commands/run.ts` bugün iki davranış taşıyor:

- `deckent run <description>`: one-shot worker/task execution,
- `deckent run start|status|retro|history`: lifecycle alias/namespace.

Canonical lifecycle noun `run` olacağı için önerilen çözüm:

```text
deckent run start …       # lifecycle
deckent run status …
deckent run history …
deckent run retro …
deckent task run <text>   # one-shot task execution
```

`deckent do` mevcut Flow ingress anlamını korumalıdır; one-shot davranışı oraya sessizce taşımak yeni
bir semantic borç yaratır. Bridge release'te eski `deckent run <description>` deprecation telemetry ile
çalışabilir; zero release'te ambiguity kaldırılmalıdır.

### 6.3 Stored mode çakışması

`src/cli/commands/mode.ts` şu an `['sprint', 'task', 'process']` değerlerini kabul ediyor; `mode run`
girilse bile disk'e eski değer yazılıyor ve UI `run (sprint)` gösteriyor. Nihai enum:

```text
run | task | process
```

olmalı; config schema, env override, generated config, existing project file ve defaults migration'ı
aynı release train içinde yapılmalıdır.

### 6.4 Function/type çakışması

`src/core/sprint-types.ts` içindeki aggregate/type ailesi ile yaygın `runSprint()` çağrıları toplu
rename edilirse kötü isimler doğar. Hedef mapping:

| Bugün | Hedef |
|---|---|
| `Sprint` | `Run` |
| `SprintPhase` | `RunPhase` |
| `SprintStatus` | `RunStatus` |
| `SprintMetrics` | `RunMetrics` |
| `SprintResult` | `RunResult` |
| `runSprint()` | `executeRun()` |
| `startSprint()` | `startRun()` |
| `finalizeSprint()` | `finalizeRun()` |
| `recoverSprint()` | `recoverRun()` |
| `getSprintStatus()` | `getRunStatus()` |

## 7. Contract etki matrisi

### 7.1 CLI

Tespit edilen external command/arg/option ailesi şunları içerir:

- `recover <sprint-id>`
- `checkpoint approve <sprintId>` / `checkpoint reject <sprintId>`
- `mode sprint`
- `resume <sprintId>`
- `audit [sprint-id]`
- `--sprint`, `--sprint-id`, `--sprint-min`, `--sprint-max`, `--sprints`
- REPL/slash command `/sprint`
- help, error, JSON output ve completion scriptlerindeki karşılıkları.

Her biri hem human-readable hem `--json` contractında değişmelidir. Shell completion, examples,
manpage, generated reference ve error remediation metinleri de aynı contract setine dahildir.

### 7.2 HTTP/SSE/API

Bugünkü route ailesi:

```text
/api/sprint
/api/sprint/live
/api/sprint/live/stream
/api/sprint/task/:id
```

Tüketiciler arasında API server, desktop client, dashboard ve yorum/example yüzeyleri vardır. Hedef:

```text
/api/runs
/api/runs/live
/api/runs/live/stream
/api/runs/:runId/work-items/:workItemId   # exact resource model API ADR'ında sabitlenmeli
```

Mevcut `/api/run-flow/*` ayrı proposal/approval resource'udur; `/api/runs/*` ile birleştirilmemelidir.

HTTP migration aşağıdakileri birlikte ele almalıdır:

- route,
- request/query/path parameter,
- response JSON field,
- SSE event name/payload,
- OpenAPI veya reference docs,
- client method/type,
- error code/message,
- auth permission mapping,
- cache key ve rate-limit bucket,
- dashboard/desktop consumption.

### 7.3 MCP

MCP tool/resource/prompt schema'larında bulunan eski noun, argument ve output field'ları yeni
contracta geçmelidir. Tool rename yalnız display label değildir; schema name, input validator,
capability discovery, resource URI, result payload ve generated docs tek atomik contracttır.

Bridge release, eski tool'u deprecated alias olarak expose edebilir; zero release'te discovery
çıktısı dahil hiçbir eski literal kalamaz. Legacy client geçişi ayrı migrator/compatibility release
ile çözülmelidir.

### 7.4 SDK ve extensions

`src/sdk/deckent-client.ts`, desktop API client, VS Code extension ve dashboard için:

- method/property/type rename,
- wire-schema compatibility adapterı,
- compile-time deprecated declarations,
- generated declaration/package content,
- example/import rename,
- mixed-version client/server matrixi

gereklidir. Zero release'te deprecated declarations ana package'tan kaldırılır.

### 7.5 RBAC ve safety actions

Bugünkü contract örnekleri:

```text
SPRINT_READ       = "sprint:read"
SPRINT_WRITE      = "sprint:write"
KILL_LIVE_SPRINT
```

Hedef örnekleri:

```text
RUN_READ          = "run:read"
RUN_WRITE         = "run:write"
TERMINATE_LIVE_RUN
```

Role grants, persisted policies, tenant overrides, audit events ve permission checks birlikte migrate
edilmelidir. Eski permission string'i tanımayan yeni server ile eski policy store birleşirse erişim
sessizce reddedilebilir veya yanlış genişleyebilir; migration explicit deny-safe olmalıdır.

### 7.6 Config ve environment

Tespit edilen config/key ailesi en az şunları içerir:

- `budget_per_sprint`
- `sprint_timeout_minutes`
- `decay_after_sprints`
- `sprint_file_retention`
- `sprint_max_usd`
- `last_sprint_id`
- `deckent_style: "sprint"`
- ilgili defaults, env projection, schema, validation ve docs.

Hedef key'ler `budget_per_run`, `run_timeout_minutes`, `decay_after_runs`, `run_file_retention`,
`run_max_usd`, `last_run_id`, `deckent_style: "run"` olmalıdır. Bridge parser eski key ile yeni key
birlikte verilirse typed conflict üretmeli; sessiz precedence uygulamamalıdır.

### 7.7 Events, traces ve logs

Tespit edilen namespace ailesi:

- `SPRINT_START`, `SPRINT_STARTED`, `SPRINT_COMPLETE`, `SPRINT_COMPLETED`, `SPRINT_ABORTED`,
  `SPRINT_FAILED`, `SPRINT_PAUSED`, `SPRINT_RESUME`, `SPRINT_KILLED`, `SPRINT_PHASE_CHANGE`,
- `sprint-planning`, `sprint-lifecycle`, `sprint_complete`, `sprint_failed`, `start_sprint`,
- `deckent.sprint-archive-manifest`, `sprint.lock`,
- trace/log tag'lerinde `sprintId`,
- alert, Nervous action ve audit payload alanları.

Event rename consumer registry olmadan yapılamaz. Her event için producer, consumer, durability,
replay ve versioning kaydı çıkarılmalı; bridge aşamasında dual-publish gerekiyorsa aynı logical event
için dedupe identity kullanılmalıdır.

### 7.8 Metrics ve KPI

Mevcut göstergeler arasında:

- `sprint_count`,
- `cost_per_sprint`,
- `cost_usd / sprint_count`,
- period/type value `'sprint'`,
- `perSprint` ve `sprintId` tags,
- `kpi-sprint-summary`

vardır. Rename, time-series sürekliliğini bölmemelidir. Bridge döneminde recording rule veya explicit
backfill ile tek canonical `run_*` serisi üretilmeli; dashboard eski+yeni seriyi topladığı için double
count yapmamalıdır. Historical KPI anlamı değişmiyorsa semantic continuity receipt'i üretilmelidir.

### 7.9 i18n, prompts ve built-ins

Önceki çalışmalar user-facing EN/TR mesajların önemli bölümünü değiştirdi; fakat key adları, fallback,
test snapshots, agent prompts, skill manifests ve generated help içinde eski terminoloji kalmıştır.
Quality bar gereği yeni kullanıcı metni hardcode edilmemeli; `getMessage(key, lang)` mekanizması
korunmalı, i18n key'leri de lexical-zero hedefinin parçası olmalıdır.

### 7.10 Documentation

Güncel ve archived docs birlikte ele alınmalıdır:

- `docs/SPRINT-LOG.md` ve inbound linkleri,
- anchor'lar (`#sprint`, `#sprintid`),
- architecture/glossary/CLI bridge açıklamaları,
- examples, screenshots, generated references,
- `docs/archive/` içindeki yüzlerce path ve içerik,
- stale links.

`docs/en/architecture.md` canonical hedefi zaten `Run` olarak anlatırken established runtime object'i
`Sprint` diye adlandırıyor. `docs/en/glossary.md` eski terimi compatibility vocabulary olarak tutuyor;
`docs/en/cli.md` collision'ı açık soru olarak işaretliyor. `docs/MASTER-PLAN.md` içindeki CLI-VOCAB-001
satırı da bu çakışmanın unresolved olduğunu gösteriyor.

Ayrıca bazı dokümanların referans verdiği aşağıdaki dosyalar mevcut değildir ve link repair kapsamına
alınmalıdır:

- `docs/analysis/OPEN-QUESTIONS-2026-08.md`
- `docs/analysis/CODE-DOC-DIFF-2026-08.md`

## 8. Persistent data ve schema migration tasarımı

### 8.1 SQLite

Memory/KPI ve diğer store'larda görülen contractlar:

- columns: `sprint_id`, `sprint_num`,
- indexes: ör. `idx_entries_sprint_num`, tenant+sprint indexleri,
- row/type value: `'sprint'`,
- KPI identifiers/formulas: `sprint_count`, `cost_per_sprint`.

Doğru migration deseni **expand → backfill → verify → cutover → contract** olmalıdır:

1. DB schema version ve migration journal ekle/doğrula.
2. Online store için consistent snapshot ve checksum manifest al.
3. Yeni `run_id`, `run_num` columns/indexleri ekle; eski alanları henüz silme.
4. Deterministik ID crosswalk ile backfill yap.
5. Her row için null, uniqueness, tenant scope ve referential integrity kontrol et.
6. Bridge writer'ı canonical yeni alana yazacak, gerekirse eski projection'ı da üretecek şekilde aç.
7. Reader'ı yeni alana geçir; eski fallback telemetry'sini ölç.
8. `PRAGMA integrity_check`, cardinality ve aggregate parity kanıtlarını kaydet.
9. Zero release'te eski columns/index/value'ları yeni tabloya transactional rebuild ile contract et.
10. Vacuum/backup işlemini platform ve disk-budget policy'sine göre yap; otomatik destructive cleanup
    uygulama.

Migration idempotent, restart-safe ve tenant-bound olmalıdır. Aynı migration iki kez çalıştırıldığında
aynı digest/sonuç üretmeli; yarım migration journal üzerinden resume etmeli, baştan körce yazmamalıdır.

### 8.2 Identity crosswalk

Önerilen mapping:

```json
{
  "legacyKind": "<legacy-execution-kind>",
  "legacyId": "<legacy-prefix>-621",
  "runId": "run-621",
  "runNumber": 621,
  "sourceDigest": "sha256:…",
  "targetDigest": "sha256:…",
  "migrationBatchId": "…"
}
```

Buradaki örnekte bu raporun lexical-zero amacı nedeniyle gerçek eski literal kalacaktır; bu yüzden
crosswalk/legacy manifest zero release ana repo içinde değil, signed migration artifact/vault içinde
tutulmalıdır. Numeric identity korunabiliyorsa 621 → 621 korunmalı; collision varsa otomatik yeni sayı
atamak yerine typed conflict/quarantine üretilmelidir.

Task/work-item kimlikleri yalnız numeric (`621-001`) ise zorunlu olarak değişmeyebilir; fakat field adı,
parent relationship ve schema `runId` olmalıdır.

### 8.3 Filesystem state

`src/core/constants.ts` ve çeşitli modüllerde bugün şu protocol ailesi vardır:

- `.deckent/sprint-state.json`
- active/pause state files,
- `sprints/`, archive subdir ve retention constants,
- `.brain/sprints/sprint-N`,
- `.deckent/archive/sprints/sprint-N`,
- task archive ve runtime/evaluation/operator-disposition path'leri,
- PID, lock, checkpoint, terminal evidence ve manifest adları.

Filesystem migrator şu sırayı izlemelidir:

1. Aktif execution olmadığını authority üzerinden kanıtla; scheduler/worker writer'larını fence et.
2. Kaynak path, file type, size, mode/ACL, symlink target ve SHA-256 içeren manifest üret.
3. Target path'leri hesapla; case-folding, Unicode normalization, reserved Windows name, path length ve
   collision kontrolü yap.
4. Aynı filesystem'de temp target'a copy/reflink + fsync + hash verify uygula.
5. Cross-volume move gerekiyorsa rename'i atomic varsayma; copy/verify/receipt protokolü kullan.
6. Directory ve file içeriğini schema-aware dönüştür; binary/SQLite/tar/gzip dosyasına text replace
   uygulama.
7. Target tree cardinality/hash/semantic verify yap.
8. Atomic pointer/canonical-root cutover uygula.
9. Kaynağı hemen silme; signed receipt ve retention window sonrasına kadar sealed tut.
10. Crash injection ile her adımın resume/rollback davranışını doğrula.

Symlink traversal, junction/reparse point, hardlink, permission, read-only volume ve case-insensitive
filesystem durumları platform adapterları üzerinden açıkça test edilmelidir.

## 9. Archive ve evidence stratejisi

### 9.1 Neden in-place rename yapılamaz?

Archive dosyalarında yalnız path değil, JSONL/log/report içeriği de eski kimliği taşır. Bunların bir
karakterini değiştirmek:

- dosya SHA-256 değerini,
- archive manifest digest'ini,
- durable receipt referansını,
- imza veya attestation'ı,
- başka dosyalardaki evidence pointer'ını

değiştirir. Bu nedenle tarihsel truth ile kullanıcıya sunulan canonical projection ayrılmalıdır.

### 9.2 Önerilen üç katman

| Katman | Amaç | Mutability |
|---|---|---|
| Legacy evidence vault | Özgün byte, eski digest/imza, legal/audit truth | WORM / immutable |
| Migration crosswalk | Eski digest/ID → yeni run ID/projection | append-only, signed |
| Active run archive | Güncel product query/recall/history yüzeyi | canonical `run` schema |

Vault repo dışında, tenant/workspace izolasyonlu ve content-addressed olmalıdır. Vault path'i eski
literal içerebilir; fakat zero conformance scope'u dışında olduğu governance ile açıkça belgelenir.

### 9.3 Mevcut archive hacmi için işlem

Özellikle `.brain/archive/sprints` ve `.deckent/archive/sprints` için:

1. İki root'un authoritative/duplicate/complementary kayıt ilişkisini ID ve digest ile çıkar.
2. Aynı ID altında farklı byte varsa merge etme; variant olarak koru ve typed conflict kaydet.
3. Eksik run ID'lerini `.tasks/archive`, `.deckent/runtime`, `.deckent/recently-works`, Git ve memory DB
   evidence'ıyla reconcile et.
4. Özgün tree'yi signed batch manifest ile vault'a seal et.
5. Query için schema-aware `runs/run-N` projection üret.
6. Brain recall/index/FTS'i yeni projection üzerinden rebuild et; learning kaybını count/query parity ile
   doğrula.
7. Eski roots yalnız owner-approved retention ve restore drill sonrası repo/workspace'ten kaldırılabilir.

Bu, daha önce gözlenen 619–621 gibi eksik/dağınık archive vakalarının da rename sırasında kaybolmasını
önler; migration önce reconciliation, sonra terminology conversion yapmalıdır.

## 10. Git geçmişi ve immutable referanslar

İki farklı hedef birbirinden ayrılmalıdır:

### A. Önerilen: current-tree lexical-zero

- HEAD, release artifact, runtime/data ve active archives temizlenir.
- `.git` geçmişi değişmez.
- Eski commit hash'leri, tag'ler, bisect, receipts ve dış linkler geçerli kalır.
- Legacy archive vault repo dışında korunur.

### B. Önerilmeyen: full Git-object lexical-zero

Bu seçenek `git filter-repo` benzeri tüm-history rewrite gerektirir:

- 3.327 commit yeniden hashlenir,
- tag ve remote branchler yeniden yazılır,
- açık/kapalı PR, release, submodule, lockfile ve external evidence referansları kırılır,
- signed commit/tag geçerliliği bozulur,
- bütün clone/fork sahiplerinin coordinated re-clone/reset yapması gerekir,
- Closure OS receipt ve trust anchor referansları ayrıca yeniden yetkilendirilmek zorunda kalabilir.

Bu nedenle history rewrite, kelime migration'ının implementation task'ı olamaz. Owner bunu isterse
ayrı authority, cryptographic evidence migration planı, maintenance window ve destructive-operation
onayı olan bağımsız program açılmalıdır.

## 11. Hedef isimlendirme sözlüğü

Bu tablo implementation başlamadan ADR ile freeze edilmelidir:

| Contract sınıfı | Legacy örüntü | Canonical örüntü |
|---|---|---|
| Domain | `Sprint*` | `Run*` |
| Execution function | `runSprint` | `executeRun` |
| ID field | `sprintId` | `runId` |
| Sequence field | `sprintNumber`, `sprintNum` | `runNumber` |
| Collection | `sprints` | `runs` |
| Disk root | `sprints/` | `runs/` |
| Entity path | `sprint-N` | `run-N` |
| State file | `sprint-state.json` | `run-state.json` |
| Config mode | `sprint` | `run` |
| Retention | `sprint_file_retention` | `run_file_retention` |
| Budget | `budget_per_sprint` | `budget_per_run` |
| Permission | `sprint:read/write` | `run:read/write` |
| Event | `SPRINT_*`, `sprint_*` | `RUN_*`, `run_*` |
| Metric/KPI | `sprint_count`, `cost_per_sprint` | `run_count`, `cost_per_run` |
| Archive manifest | `sprint-archive-manifest` | `run-archive-manifest` |
| Dashboard | `SprintChart`, `SprintSummary` | `RunChart`, `RunSummary` |
| CLI lifecycle | mixed `start`/`run` aliases | `run start/status/history/retro` |
| CLI one-shot | `run <description>` | `task run <description>` |

Case, pluralization ve separators (`run_id`, `runId`, `run-id`, `RUN_ID`) ilgili ecosystem patternine
göre korunmalıdır; her yerde tek casing dayatmak cross-language contractları bozar.

## 12. Uygulama work-package DAG'ı

Bu plan tek outcome'dur; ancak data kaybı ve contract kırılması riskini yönetmek için dependency-bound
work package'lara ayrılır. Her package production wiring ve doğrulama olmadan `DONE` sayılmaz.

### WP-00 — Authority, scope ve semantic freeze

**Amaç:** uygulamadan önce anlamı ve irreversible kararları sabitlemek.

İşler:

1. `Run` domain tanımı ve Goal→Mission→Flow→Run zincirini ADR amendment ile kesinleştir.
2. One-shot CLI canonical adını (`deckent task run`) owner authority ile onayla.
3. Zero scope'unun HEAD mi tüm Git history mi olduğunu sabitle.
4. Legacy archive vault custody/retention/location kararını sabitle.
5. Bridge release support horizon ve minimum upgrade path'i belirle.
6. Aktif archive çalışmasının land/rebase boundary'sini belirle.

**Çıkış kriteri:** approved naming dictionary, migration authority, compatibility window ve archive
custody kararı vardır. Bunlar olmadan kod rename başlamaz.

### WP-01 — Reproducible inventory ve lexical ratchet

**Bağımlılık:** WP-00.

İşler:

1. Content + path + symbol + public-contract tarayan hermetic inventory aracı üret.
2. Tracked, ignored runtime, generated, archive, DB ve Git scope'larını ayrı raporla.
3. Her eşleşmeyi owner/module/contract class/migration wave ile etiketle.
4. Hash'li JSON manifest ve human-readable projection üret.
5. CI ratchet ekle: baseline'dan yeni eski-literal eklenmesini hemen reddet.
6. Allowed exception list'i yalnız geçici report ve bridge adapter package ile authority-bound yap.

**Çıkış kriteri:** aynı committe iki çalıştırma aynı manifest digest'ini üretir; hiçbir eşleşme
“unclassified” değildir.

### WP-02 — Canonical domain kernel

**Bağımlılık:** WP-01.

İşler:

1. `Run`, `RunPhase`, `RunStatus`, `RunMetrics`, `RunResult` canonical types ekle.
2. Orchestrator entrypoint'i `executeRun()` yap.
3. Controller/lifecycle/planner/finalizer/recovery/checkpoint/state/evidence modüllerini `run-*` adlarına
   taşı.
4. İç import graphını ve barrel exports'u yeni canonical adlara geçir.
5. Bridge release için deprecated type/function adapterları ayrı compatibility boundary'sinde tut.
6. Production producer→consumer→entrypoint wiring closure kanıtı üret.

**Çıkış kriteri:** production graph yeni type'ları doğrudan kullanır; eski type yalnız bridge adapterında
kalır; `runRun` benzeri isim yoktur.

### WP-03 — Config, schema ve persistent identity expand

**Bağımlılık:** WP-02.

İşler:

1. `run` config keys/enum/schema/default/env projectionlarını ekle.
2. SQLite yeni columns/indexes/type values ve migration journalını ekle.
3. Deterministik legacy→run ID crosswalk üret.
4. Bridge dual-read/write ve conflict policy'sini uygula.
5. Multi-tenant isolation, backup, idempotency ve restart-safe migration testlerini tamamla.
6. Reader telemetry ile legacy fallback oranını ölç.

**Çıkış kriteri:** fresh install yalnız yeni schema ile çalışır; upgrade install veri/cardinality/query
parity sağlar; conflict sessizce çözülmez.

### WP-04 — Filesystem ve archive migrator

**Bağımlılık:** WP-03; WP-00 archive custody kararı.

İşler:

1. Source→target hash manifesti, collision detector ve quarantine üret.
2. `.brain`, `.deckent`, `.tasks` ve generated runtime roots için platform adapterları uygula.
3. Active-writer fencing ve migration lease ekle.
4. Copy/fsync/hash/atomic-cutover/restart/rollback protokolünü uygula.
5. Legacy bytes'ı signed WORM vault'a seal et.
6. Canonical `runs/run-N` projections ve Brain recall/FTS rebuild üret.
7. Missing/duplicate 619–621 dahil reconciliation reportunu kapat.

**Çıkış kriteri:** source ve target cardinality/digest ilişkisi signed receipt ile kanıtlıdır; recall/history
parity sağlanmıştır; kaynak silinmemiş veya owner-approved retention sonucu kontrollü externalize
edilmiştir.

### WP-05 — Public contract bridge

**Bağımlılık:** WP-02, WP-03.

İşler:

1. CLI commands/options/JSON/help/completion.
2. HTTP/SSE routes ve payload schema.
3. MCP tools/resources/prompts ve discovery.
4. SDK types/methods ve generated declarations.
5. RBAC permissions, policies ve audit events.
6. Config/environment public contract.
7. Event/log/trace namespace.
8. Metrics/KPI recording rules ve historical continuity.

**Çıkış kriteri:** yeni clients canonical contractla çalışır; bridge compatibility matrixi testlidir;
legacy kullanım telemetry'si vardır; authorization parity kanıtlıdır.

### WP-06 — Tüketiciler ve UX

**Bağımlılık:** WP-05.

İşler:

1. Dashboard components (`RunChart`, `RunControlPanel`, `RunPhaseTimeline`, `RunSummary`).
2. Desktop, VS Code extension ve connector clients.
3. Terminal/REPL/slash commands.
4. Notification/KPI summary ve alert metinleri.
5. Agent prompts, built-in skills, role manifests.
6. i18n keys ve EN/TR translations.

**Çıkış kriteri:** hiçbir consumer eski wire field'a doğrudan bağlı değildir; UI ve CLI'da `run
(legacy-term)` bridge metni kalmaz; user-visible bütün strings i18n sistemindedir.

### WP-07 — Tests, docs, examples ve generated artifacts

**Bağımlılık:** WP-02–WP-06.

İşler:

1. 107 test filename'i ve bütün fixture/snapshot/test title'larını değiştir.
2. Güncel docs, `docs/archive`, links, anchors ve generated references'ı migrate et.
3. Source filename/import/path rename manifestini tamamla.
4. `dist`, dashboard build, extension bundle ve package declarations'ı temiz build ile üret.
5. `npm pack` içeriğini lexical ve contract gate'lerinden geçir.
6. Bu analiz raporunu repository dışı decision archive'a taşı veya final gate öncesi kaldır.

**Çıkış kriteri:** current tree ve shipped artifacts yalnız canonical vocabulary taşır; docs link/anchor
checker yeşildir.

### WP-08 — Bridge release N ve fleet migration

**Bağımlılık:** WP-03–WP-07.

İşler:

1. Bridge release'i fresh-install ve legacy-upgrade senaryolarıyla yayınla.
2. Legacy fallback/route/field/config/path kullanımını privacy-safe telemetry ile ölç.
3. Mixed-version CLI/server/worker/dashboard/SDK kombinasyonlarını support matrixine göre test et.
4. Tenant migration status, retry, quarantine ve operator remediation yüzeyi sun.
5. Archive vault restore drill ve disaster recovery exercise yap.
6. Exit threshold karşılanana dek hard cut yapma.

**Çıkış kriteri:** bütün managed workspaces migrate; legacy kullanım belirlenen süre boyunca sıfır;
quarantine yok veya owner tarafından disposition verilmiş; rollback drill başarılı.

### WP-09 — Zero release N+1 contract

**Bağımlılık:** WP-08 exit criteria.

İşler:

1. Deprecated aliases, parsers, dual writers ve legacy type declarations'ı ana repodan kaldır.
2. Eski DB columns/indexes/type values'ı transactional contract migration ile kaldır.
3. Eski routes/tools/options/permissions/events/metrics'i kaldır.
4. Legacy migratorı signed, ayrı distribution/custody konumuna taşı.
5. Content/path lexical-zero gate'i exception'sız çalıştır.
6. Package, container, docs site ve runtime smoke sonucunu doğrula.

**Çıkış kriteri:** Bölüm 16'daki bütün acceptance gate'ler geçer.

### WP-10 — Post-cutover proof ve settlement

**Bağımlılık:** WP-09.

İşler:

1. Independent verifier ile disk, API, archive, DB ve package kanıtlarını doğrula.
2. XVerify provider-separation ve durable receipt kurallarını uygula.
3. Data loss, auth drift, metric discontinuity ve orphan legacy path taramasını çalıştır.
4. MASTER/ADR/memory projectionlarını authenticated settlement akışıyla güncelle.
5. Legacy vault manifest, restore instructions ve support boundary'sini pinle.

**Çıkış kriteri:** terminal settlement, durable verification receipt ve owner-visible migration reportu
vardır.

### 12.1 Dependency özeti

```text
WP-00 Authority/Semantics
  └─ WP-01 Inventory/Ratchet
      └─ WP-02 Domain Kernel
          ├─ WP-03 Data/Config Expand
          │   └─ WP-04 Filesystem/Archive Migration
          └─ WP-05 Public Contract Bridge
              └─ WP-06 Consumers/UX
                  └─ WP-07 Tests/Docs/Artifacts
                      └─ WP-08 Bridge Release/Fleet Migration
                          └─ WP-09 Zero Release
                              └─ WP-10 Independent Proof/Settlement
```

WP-04 ile WP-05 kısmen paralel hazırlanabilir; ancak ikisi de aynı ID/schema dictionary'sine bağlıdır.
File collision veya active writer tespit edildiğinde cutover yapılmaz.

## 13. Compatibility ve rollout sözleşmesi

### 13.1 Bridge release kuralları

- Yeni yazıcı canonical `run` alanını authoritative kabul eder.
- Eski input yalnız explicit legacy adapter üzerinden kabul edilir.
- Eski ve yeni aynı request/config içinde çelişirse typed error/HOLD üretir.
- Dual event publish varsa ortak event identity/dedupe key vardır.
- Legacy usage ölçülür; loglarda secret veya raw payload açığa çıkarılmaz.
- Legacy adapter core'a dağılmaz; tek package/boundary içinde tutulur.
- Yeni install eski path/schema üretmez.
- Upgrade işlemi resumable ve idempotenttir.

### 13.2 Zero release kuralları

- Repository içinde legacy adapter yoktur.
- Eski client/config/data doğrudan kabul edilmez; actionable upgrade/migrator mesajı döner.
- Hata user-facing ise i18n'den gelir.
- Legacy migratorın version/signature/digest'i doğrulanmadan çalıştırılmaz.
- Support tooling eski raw datayı ana runtime'a implicit import etmez.

### 13.3 Rolling upgrade matrixi

En az şu kombinasyonlar doğrulanmalıdır:

| Client | Server/Brain | Worker | Beklenti |
|---|---|---|---|
| N yeni | N yeni | N yeni | canonical success |
| N-1 legacy | N bridge | N yeni | adapter üzerinden success + telemetry |
| N yeni | N bridge | N-1 legacy | yalnız support matrix izin veriyorsa success |
| N+1 zero | N bridge | N yeni | canonical success |
| N-1 legacy | N+1 zero | herhangi | typed upgrade-required; sessiz fallback yok |
| N+1 fresh | N+1 zero | N+1 | hiçbir legacy artifact oluşmaz |

## 14. Verification ve test matrisi

### 14.1 Static lexical gates

Hem içerik hem path case-insensitive taranmalıdır:

```bash
git grep -n -i '<legacy-token>'
rg -uuu -i '<legacy-token>' .
find . -iname '*<legacy-token>*'
npm pack --dry-run
```

Gerçek gate'te placeholder değil eski gerçek token kullanılır. `.git` ve repo-dışı sealed vault,
scope kararı gereği ayrı raporlanır. Generated artifacts build sonrası tekrar taranır. Filename taraması
null-delimited yapılmalı; newline içeren path edge case'i bozmamalıdır.

### 14.2 Unit ve property tests

- ID parser/formatter/crosswalk round-trip.
- Unknown/timestamp-like suffix quarantine.
- Config old/new conflict.
- DB migration idempotency ve restart.
- Path collision/case-fold/Unicode normalization.
- Event dedupe ve dual-publish semantics.
- RBAC permission parity ve deny-safe failure.
- Metric backfill/double-count koruması.
- i18n key completeness EN/TR.

### 14.3 Contract/golden tests

- CLI human output ve `--json` schema.
- HTTP request/response/SSE golden payloadları.
- MCP discovery/input/output schema.
- SDK generated declarations.
- Config schema/default/env projection.
- Event/trace/log/metric name registry.
- Archive manifest ve receipt schema.

### 14.4 Data migration tests

- Empty/fresh workspace.
- Küçük gerçek legacy fixture.
- 619–621 gibi dağınık/eksik archive fixture'ı.
- Duplicate ID, same digest ve divergent digest varyantları.
- Corrupt JSONL, truncated log, invalid SQLite/WAL.
- Interrupted migration her state boundary'sinde.
- Disk-full, permission denied, read-only filesystem.
- Cross-volume copy, symlink/junction ve path traversal.
- Million-artifact scale, bounded memory ve resumable batching.
- Cardinality, hash, query/recall/history parity.

### 14.5 Every-environment matrix

- Linux: ext4/xfs, container bind mount.
- macOS: APFS case-sensitive ve case-insensitive.
- Windows native: NTFS, reserved names, MAX_PATH/long-path, junction/reparse point.
- Windows WSL: Linux path ile mounted Windows filesystem farkı.
- Network/object-backed storage: atomic rename garanti edilmediği durum.
- Multi-tenant concurrent workspaces ve shared cache.

Unsupported davranış typed ve açık olmalı; hiçbir platform sessizce partial migration yapmamalıdır.

### 14.6 Proof-of-function

Unit/mock yeşili yeterli değildir. En az:

1. Fresh real-binary run başlat, durumunu oku, finalize et, archive et ve recall et.
2. Gerçek legacy fixture'ı bridge binary ile migrate et; aynı akışı çalıştır.
3. N+1 binary ile fresh run yap; disk/package/API/MCP/CLI çıktısında lexical-zero doğrula.
4. Bridge ve zero version mixed-client matrixini gerçek processlerle doğrula.
5. Build sonrası long-lived host adapterı documented restart/reconnect akışıyla yenile.

Bu testler implementation zamanında, aktif run yokken ve repository policy'sindeki local verification
kurallarıyla yapılmalıdır.

## 15. Rollback ve disaster recovery

### 15.1 Cutover öncesi

- Migration journal ve source snapshot authoritative kalır.
- Target incomplete ise canonical pointer değiştirilmez.
- Yeniden çalıştırma aynı batch ID/digest üzerinden resume eder.
- Source data silinmez.

### 15.2 Bridge cutover sonrası

- Reader yeni schema/path'ten eski sealed source'a kontrollü rollback yapabilir.
- Dual-write divergence varsa execution admission durur ve typed HOLD oluşur.
- Rollback, eski writer'ı fencing olmadan açmaz.
- Metric/event duplicate'leri dedupe ledger üzerinden düzeltilir.

### 15.3 Zero release sonrası

- Ana runtime içinde reverse search/replace yapılmaz.
- Restore, signed legacy vault + crosswalk + bridge migratorın pinned sürümüyle yapılır.
- N+1'den N'e downgrade yalnız explicit compatibility check sonrası mümkündür.
- Cryptographic receipt/history referansı yeniden bağlanmadan archive rewrite kabul edilmez.

## 16. Nihai acceptance kriterleri

Değişim ancak aşağıdakilerin **tamamı** sağlanırsa bitmiştir:

### Semantics ve architecture

- [ ] Goal→Mission→Flow→Run→WorkItem→Attempt→Operation sözlüğü approved ve tutarlıdır.
- [ ] `Run` tek bir admitted governed execution demektir.
- [ ] `executeRun()` canonical giriş noktasıdır; `runRun()` yoktur.
- [ ] One-shot CLI lifecycle namespace'iyle çakışmaz.

### Source ve contracts

- [ ] Bütün source/test/script/docs path ve içeriklerinde eski literal yoktur.
- [ ] Type/interface/export/import/file adları canonicaldır.
- [ ] CLI, HTTP/SSE, MCP, SDK, config, event, RBAC ve metrics contractlarında eski literal yoktur.
- [ ] Dashboard/desktop/extensions/connectors yalnız yeni contractı tüketir.
- [ ] User-facing strings EN/TR i18n mekanizmasından gelir.

### Data ve archives

- [ ] Aktif DB schema/index/value'larında eski literal yoktur.
- [ ] Aktif runtime/archive projection path ve içerikleri `run` canonical schema'sındadır.
- [ ] Legacy byte'lar signed, repo-dışı vault'ta korunmuştur.
- [ ] Source→target crosswalk ve digest receipt'i doğrulanmıştır.
- [ ] Memory recall/history/learning cardinality ve query parity'si sağlanmıştır.
- [ ] Missing/duplicate archive reconciliation dispositionları kapanmıştır.

### Generated/release artifacts

- [ ] Temiz build'in `dist/`, dashboard/extension bundle ve declarations'ında eski literal yoktur.
- [ ] `npm pack` içeriğinde eski literal/path yoktur.
- [ ] Container/image/package/docs-site surface'leri taranmıştır.
- [ ] Fresh install hiçbir legacy path/schema/value üretmez.

### Compatibility ve operations

- [ ] Bridge release migration/telemetry exit threshold'unu karşılamıştır.
- [ ] Zero release deprecated alias/parser içermez.
- [ ] Legacy migrator ayrı, signed ve restore-tested artifacttır.
- [ ] Linux/macOS/Windows native/WSL test matrixi geçmiştir.
- [ ] Interrupted/disk-full/collision/corruption senaryoları data loss olmadan kapanır.
- [ ] RBAC ve KPI/observability continuity kanıtlıdır.

### Lexical-zero proof

- [ ] Tracked content taraması sıfırdır.
- [ ] Untracked/ignored aktif workspace taraması sıfırdır.
- [ ] Filename/directory taraması sıfırdır.
- [ ] Generated/package taraması sıfırdır.
- [ ] Bu analiz raporu dahil geçici exceptionlar ana repodan çıkarılmıştır.
- [ ] `.git` ve external legacy vault istisnası owner-approved conformance belgesinde açıkça yazılıdır.

### Settlement

- [ ] Local targeted verification ve real-binary proof tamamdır.
- [ ] Independent verifier farklı provider ile sonucu doğrulamıştır.
- [ ] Durable receipt ve terminal settlement vardır.
- [ ] Owner-visible final migration/reconciliation raporu üretilmiştir.

## 17. Risk register

| Risk | Etki | Olasılık | Kontrol |
|---|---|---|---|
| `run` CLI/domain namespace çakışması | Kritik | Yüksek | WP-00 semantic freeze; one-shot'ı `task run` altına taşı |
| Archive/evidence digest kırılması | Kritik | Yüksek | In-place rewrite yok; WORM vault + signed crosswalk |
| DB/file migration split-brain | Kritik | Orta/Yüksek | Writer fencing, journal, atomic pointer, parity gate |
| Legacy clientların sessiz kırılması | Yüksek | Yüksek | Bridge N, telemetry, typed upgrade-required |
| RBAC permission drift | Kritik | Orta | Deny-safe mapping, policy migration, auth parity tests |
| Metric time-series bölünmesi/double count | Yüksek | Yüksek | Recording rule, shared identity, continuity test |
| Generated artifactın eski kelimeyi geri getirmesi | Yüksek | Yüksek | Clean build + package lexical gate |
| Case-insensitive filesystem collision | Yüksek | Orta | Preflight manifest/collision quarantine |
| Unknown ID grammar/timestamp suffix | Yüksek | Orta | Parser registry + typed quarantine |
| Active writer sırasında migration | Kritik | Orta | Admission freeze, lease/fencing, heartbeat proof |
| Memory/learning kaybı | Kritik | Orta | Raw vault, FTS rebuild, query/cardinality parity |
| Git history rewrite referans kırılması | Kritik | Yüksek | HEAD-only scope; ayrı owner-governed program |
| Bridge kodunun kalıcı borca dönüşmesi | Yüksek | Orta | N+1 removal gate ve deadline-bound telemetry |
| Comments/docs/archive'dan token yeniden girişi | Orta | Yüksek | Repository-wide ratchet; no hidden exceptions |

## 18. Implementation başlamadan owner kararı gereken noktalar

Terimin `run` olması kullanıcı tarafından zaten kararlaştırılmıştır. Açık kalması gereken yalnız şu
uygulama/governance kararlarıdır:

1. **Lexical-zero sınırı:** önerilen HEAD + artifacts + active data mı, yoksa destructive tüm Git
   history rewrite mı?
2. **Legacy evidence custody:** repo dışı vault'un yeri, retention süresi, encryption ve owner authority.
3. **One-shot CLI:** önerilen canonical `deckent task run <description>` kabul edilecek mi?
4. **Compatibility horizon:** bridge release N'in destek süresi ve N+1 hard-cut threshold'u.
5. **Memory/ADR geçmişi:** immutable raw kayıtlar vault'ta korunup yalnız canonical projection mı
   üretilecek? Öneri evettir.
6. **Archive çalışması boundary'si:** mevcut uncommitted archive değişiklikleri önce land edilip sonra
   rename DAG'ına mı alınacak? Öneri evettir; iki değişim aynı dirty tree üzerinde karıştırılmamalıdır.

## 19. Önerilen çalışma sırası ve stop koşulları

Önerilen yürütme sırası:

1. WP-00 kararları ve ADR amendment.
2. Mevcut archive işinin clean landing/rebase doğrulaması.
3. WP-01 exhaustive manifest/ratchet.
4. Bridge release için WP-02–WP-07.
5. WP-08 gerçek fleet/data migration ve observation window.
6. WP-09 hard cut ve lexical-zero.
7. WP-10 independent proof/settlement.

Aşağıdaki durumlarda çalışma otomatik ilerlememeli, typed HOLD üretmelidir:

- aktif run veya unfenced writer varsa,
- source/target ID collision unresolved ise,
- archive digest/receipt zinciri uyuşmuyorsa,
- DB cardinality veya query parity sağlanmıyorsa,
- legacy usage hard-cut threshold'un üstündeyse,
- RBAC parity doğrulanmadıysa,
- rollback/restore drill başarısızsa,
- cross-platform target için atomicity/permission garantisi bilinmiyorsa,
- independent verification provider'ı yoksa.

## 20. Sonuç

Önceki çalışmalar kullanıcı dilini `run` yönüne çevirmiş, fakat core ve public/persistent contractları
bilinçli olarak dondurmuştur. Bu nedenle repo bugün yarı-geçiş durumundadır: UX'te `run`, iç modelde ve
veride yoğun biçimde eski terim bulunur. Tam değişim yaklaşık yüz bin tracked eşleşmeyi, yüz binlerce
archive eşleşmesini, 443 exported declaration'ı, onlarca public contract ailesini ve Git/evidence
bütünlüğünü birlikte ele almak zorundadır.

En güvenli ve tam çözüm; canonical `Run` domainini önce sabitlemek, `executeRun()` ile noun/verb
çakışmasını çözmek, one-shot CLI'yı `task run` altına taşımak, schema/path/archive migration'ını signed
ve resumable yapmak, bir bridge release üzerinden bütün workspaceleri dönüştürmek ve sonraki release'te
ana repoyu exception'sız lexical-zero durumuna getirmektir. Ham geçmiş korunur; aktif ürün ve shipped
artifactlar bütünüyle `run` olur.

Bu analiz sırasında source, runtime, archive, task veya DB state'i değiştirilmemiş; build, test sprinti,
run, commit veya cleanup çalıştırılmamıştır. Yalnız bu kök rapor oluşturulmuştur.
