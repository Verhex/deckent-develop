# Runtime hygiene operatör referansı

Runtime hygiene, tamamlanmış bir sprint'in canlı artifact'larını canonical archive ile uzlaştırır. Recursive cleanup değil, allow-list operation'dır. **CLI varsayılanı preview'dur. Apply fail-closed çalışır. Unknown, live, foreign, malformed, protected veya doğrulanamayan artifact `HOLD` edilir ve yerinde bırakılır.**

Her tanınan family'nin disposition'ını bu tanımlarla okuyun:

- **Keep**: source'u değiştirmeden yerinde bırakır.
- **Archive-copy**: doğrulanmış bir copy publish eder; source'u korur.
- **Retire**: yalnız açıkça eligible olan source'u, destination byte count ve SHA-256 digest'i bağımsız olarak eşleştikten sonra kaldırır.
- **Hold**: source mutation yapmaz ve operation'ın neden güvenle ilerleyemediğini kaydeder.

Generic delete fallback yoktur.

## Lifecycle ve authority gate'leri

Canonical run-status reader live/resumable/terminal/idle kararının sahibidir. Eşleşen terminal receipt, `COMPLETE` veya `ABORTED` outcome'ın durable publish edildiğini kanıtlar. Archive manifest, family producer ve validated retention setting'leri kalan authority'yi bu sırayla sağlar.

Şu durumlardan birinde apply `HOLD` edilir:

- canonical authority active, resumable, `PAUSED` veya `ORPHANED` ise;
- coordinator alive ise veya ownership'i bilinmiyorsa;
- terminal lifecycle için eşleşen terminal receipt yoksa ya da receipt outcome lifecycle ile uyuşmuyorsa;
- requested sprint, non-idle authority-owned sprint'ten farklıysa;
- artifact'ın sprint/run ownership'i exact değilse;
- bir task için `CLAIMED` veya `EXECUTING` evidence varsa;
- archive publication veya verification başarısızsa; ya da
- platform adapter gerekli containment, regular-file, exclusivity, hashing, durability veya atomicity semantiğini garanti edemiyorsa.

`IDLE`, blanket ownership vermez. Selected sprint `^sprint-\d+$` ile eşleşmelidir. `sprint-<epoch-ms>` gibi legacy job ID'leri ordinal sprint ownership'e çevrilmez.

## Family disposition

### `.deckent/runtime/`

| Family | Normal terminal disposition | Korunan öğe |
|---|---|---|
| `run-status-read-model.json` | Keep. Bu mutable projection'ı owned lifecycle cleanup sırasında yalnız run-status publisher retire edebilir. | Generic hygiene bunu silmez ve raw archive target oluşturmaz. |
| `jobs/*.json` | Yalnız inactive, terminal ve resolved age/count/size sınırlarınca seçilmiş record archive-then-retire edilir. `job-*` ile legacy/current `sprint-*` namespace'leri desteklenir. | Active/non-terminal record, unknown owner, unreadable record, unknown namespace ve en yeni readable continuity anchor korunur. |
| `decisions/` | Hold ve keep. | Şu anda sprint classifier veya target yoktur. |
| `evaluations/<sprint-id>/` | Exact-owned attempt'lar canonical sprint manifest'e reconcile edilir; verify sonrasında yalnız eşleşen source byte'ları retire edilir. | Current window, malformed/foreign attempt, değişmiş byte ve byte-conflicting attempt iki location'da da korunur. |
| `run-flow-store/*.events.jsonl` | Terminal journal projection veya exact dead-liveness lineage'lı stale running projection archive-then-retire edilir. Canonical SQLite history kalır. | Proposed, approved, fresh-running, resumable, malformed, ambiguous veya dead olduğu kanıtlanmamış flow korunur. |
| Tanınan eski start/bot/prompt-lint/resource log ve temporary residue | Empty expired file retirement receipt alır; non-empty tanınan log retirement öncesi content-addressed archive edilir; expired temporary file doğrudan retire edilir. | Current writer, fresh file, non-regular path, database, token ve unrecognized name korunur. |
| `scheduler-shadow/<sprint-id>.jsonl` | `scheduler/<sprint-id>.jsonl` hedefine archive-copy; live source korunur. | Legacy `.deckent/archive/scheduler-shadow/` copy yalnız verified publication sonrasında retire edilebilir. |
| `worker-heartbeat-authority/<attempt>/` | Yalnız `identity.json.identity.taskId`, selected ordinal ve ardından `-` ile başlarsa `heartbeat/in-process/<attempt>/` hedefine archive-copy. | Source korunur. Missing veya malformed identity attempt directory'yi hold eder. |
| Diğer her entry | Hold ve keep. | Unknown owner asla silinmez. |

`.deckent/nervous/` ve `.deckent/autonomous/`, runtime child değil sibling authority family'leridir. Generic hygiene bunların approval, IPC ve history'sini korur. Yalnız ayrı targeted expiry operation, kendi deadline'ı proven expired olan approval'ı prune edebilir.

### `.deckent/recently-works/`

| Family | Disposition |
|---|---|
| Verified `sprint-N-phase5*` canonical duplicate | Yalnız canonical sprint manifest exact digest'i zaten kanıtlıyorsa retire edilir. |
| Exact `sprint-479-recovery-not-dispatched.json` | Canonical sprint archive'a reconcile edilir, her byte-distinct conflict variant korunur, manifest verify edilir ve sonra live source retire edilir. |
| Başka sprint, diğer regular file, directory, nested content, symlink veya malformed entry | Hold ve keep. Prefix-wide veya directory-wide retirement yoktur. |

Yalnız yukarıdaki iki named compatibility family retirement-capable'dır. Diğer her recent-work item korunur.

### İlgili family'ler ve korunan authority'ler

| Family veya authority | Operatörün göreceği kural |
|---|---|
| `.tasks/` exact sprint artifact'ları | Exact owned artifact'ları retirement öncesinde `tasks/` altına archive eder. Non-terminal artifact'lar preservation marker ile `tasks/preserved/` altına gider. Hidden veya unclassified residue, exact-sprint plan açıkça classify etmedikçe yerinde kalır. |
| `.tasks/archive/` ve legacy sprint-task root'ları | Exact owned artifact'ları canonical `tasks/` altında consolidate eder. Legacy source yalnız digest verification sonrasında retire edilir. Compatibility cleanup immutable evidence'ı retention-delete etmez. |
| `.locks/` | Execution-authority lock artifact'ları asla candidate değildir. Diğer lock'lar selected-run ownership ve quiescence gerektirir; aksi halde hold edilir. |
| `.brain/memory.db`, database, journal, WAL ve SHM file'ları | Unclassified residue olarak asla delete, move, truncate veya copy edilmez. Memory decay database API kullanır; manifest yalnız reference ve digest taşıyabilir. |
| Credential, secret store, token, key, certificate ve auth file'ları | Daima hold ve preserve edilir. Receipt value veya content'lerini persist etmez. |
| Checkpoint, supervisor log, archived metric, directive, sprint doc ve audit'ler | Yalnız archive collector'ın exact source/target mapping'lerini kullanır. Live source archive-copy edilir; yalnız explicitly classified legacy ve verified source retire edilir. |
| Her yerde unknown family | Hold, report ve preserve. |

Immutable receipt, job, evaluation, manifest, conflict, audit ve preserved task evidence tutulur. Mutable projection yalnız sahibi üzerinden retire edilebilir.

## Varsayılanlar ve retention sırası

CLI `cleanup --history` **varsayılan olarak preview** çalışır. Bir flag'in atlanması apply olarak yorumlanmaz. Finalizer-triggered runtime hygiene **varsayılan olarak kapalıdır**; enable edildiğinde yalnız terminal receipt publish edildikten ve canonical archive başarıyla verify edildikten sonra çalışır.

Tanınan configuration default'ları:

| Setting | Güvenli default | Etki |
|---|---:|---|
| `runtime_artifact_retention.enabled` | `false` | Policy evaluation'ı açar; tek başına finalizer apply yetkisi vermez. |
| `runtime_artifact_retention.apply_on_finalize` | `false` | Terminal finalization'ın hygiene apply edebilmesi için ikinci explicit opt-in'dir. |
| `runtime_artifact_retention.archive_path` | `.deckent/archive/runtime-artifacts/` | Maintenance object ve receipt'leri için project-relative base'dir. |
| `families.runtime.max_age_days / max_count / max_size_mb` | `30 / 1000 / 1024` | Daha güçlü authority gate'leri sonrasında inactive terminal runtime record'larını sınırlar. |
| `families.recent.max_age_days / max_count / max_size_mb` | `14 / 500 / 512` | Resolved recent-family policy'dir; iki named compatibility family'yi genişletmez. |

Prompt-archive retention yalnız classified prompt archive'lara uygulanır; arbitrary `.tasks` file'larına uygulanmaz. Invalid, absent veya unreadable retention configuration, tanınan dimension'lar için validated safe default kullanır ve deletion set'i asla genişletmez.

Retention filter'ları şu sırayla çalışır: authority/liveness, terminal proof, family classification, exact ownership, evidence class, count, size, memory age/decay, prompt-history policy, artifact kind, conflict state ve platform capability. Sonraki filter önceki hold'u geçersiz kılamaz. Explicitly classified `-seq` ve `-checkpoint-seq` counter'ları disposable olabilir; forensic artifact declared audit target'a taşınır; diğer kind'lar archive veya hold edilir. Byte-distinct conflict'lerin tamamı tutulur.

## Preview ve apply

### Preview (dry-run)

Apply'a opt-in olmadan history cleanup çalıştırın:

```text
deckent cleanup --history
```

Preview, apply ile aynı authority, ownership, classification, target, conflict ve retention planning'i yapar; filesystem veya runtime mutation yapmaz. Directory create etmez; copy, link, rename, unlink veya truncate yapmaz; session kill etmez; configuration ya da timestamp değiştirmez; memory update etmez; read model publish etmez.

Path-free machine projection tek deterministic digest ile family başına inventory ve candidate count/byte bildirir. Ayrıntılı family plan'ları internal mutation authority olarak digest'e bağlanır; public JSON projection artifact path veya secret açıklamaz.

### Apply

CLI'ın apply seçeneğini yalnız o CLI surface'in istediği freshly reproduced exact plan digest ile kullanın. Apply mutation öncesinde authority'yi yeniden okur; stale veya farklı digest reject edilir. Ardından:

1. sprint identity ve ownership'i validate eder;
2. quiescence ve eşleşen terminal receipt ister;
3. observed entry'leri classify eder ve hold'ları emit eder;
4. exclusive, digest-verified archive copy publish eder;
5. manifest ve terminal outcome'ı publish ve verify eder;
6. yalnız verified ve explicitly eligible legacy source'ları retire eder;
7. kalan allow-listed candidate'lara retention uygular;
8. owned mutable projection'ları owning subsystem üzerinden retire ettirir;
9. canonical idle read model'i publish eder; ve
10. apply receipt emit eder.

Her failure sonraki destructive action'ları durdurur. Başarıyla verified partial publication'lar idempotent retry için immutable evidence olarak kalır; recovery bunları silerek rollback etmez.

## Archive, receipt ve conflict'ler

Canonical root `<archive-base>/<sprint-id>/` yoludur. `manifest.json`, `tasks/`, `evaluations/`, `scheduler/`, `heartbeat/`, `metrics/`, `docs/` ve `audits/` altındaki canonical artifact'ları ve root'taki run evidence'ı açıklar. Absolute, empty ve traversal target'lar reject edilir.

Publication clobber etmez:

- target'ta aynı size ve SHA-256 varsa `deduplicated` kaydedilir;
- farklı byte'lar `conflicts/<basename>.<sha256-prefix>` altında publish edilir;
- aynı conflict path'i farklı byte'lar doldurmuşsa apply hold edilir;
- retirement bağımsız source/destination identity eşleşmesi ister; ve
- failure manifest publication'ı ve source'un settled sayılmasını engeller.

Preview durable receipt emit etmez ve hiçbir write yapmaz. Apply exact plan digest ile anahtarlanan tek immutable first-writer-wins receipt publish eder. Receipt bounded family counter/outcome'ları, attempted/retired byte sayılarını ve typed failure'ları taşır; family-specific archive manifest ve receipt'ler artifact-level source/digest lineage'ı korur. Fresh-process replay, mutate edilmiş tree'den planı yeniden kurmadan existing receipt'i validate edip döndürür.

## Recovery runbook

1. **Durun ve receipt'i inceleyin.** Held source'u elle silmeyin veya manifest'i edit etmeyin.
2. **Quiescence'ı geri getirin.** Active/resumable state, coordinator uncertainty, executing task veya receipt/lifecycle disagreement'ı owning subsystem üzerinden çözün.
3. **Classification veya configuration'ı düzeltin.** Malformed identity ya da project dışı archive path'i düzeltin; foreign evidence'ı owned göstermek için rename etmeyin.
4. **Conflict'leri koruyun.** Her byte-distinct variant'ı araştırın. Retention cap ile winner seçmeyin.
5. **Preview'u yeniden çalıştırın.** Planın her observed top-level entry'yi classify ettiğini ve unclassified deletion candidate içermediğini doğrulayın.
6. **Yeni exact plan digest ile apply edin.** Retry, identical verified byte'ları deduplicated sayar ve güvenle devam eder.
7. **Receipt ve manifest'i verify edin.** Missing, mismatched, untracked veya invalid-digest artifact varsa recovery held kalır.

## Windows, macOS ve Linux semantiği

Windows, macOS ve Linux'ta safety outcome aynıdır; implementation primitive farklı olabilir. Her adapter project/archive containment, symlink ve non-regular source'ların `lstat`-equivalent reddi, exclusive non-overwriting publication, streaming SHA-256 ve byte verification, atomic same-directory replacement, retirement öncesinde file ve parent-directory durability, race-safe deduplication, conflict preservation ve idempotent interruption recovery sağlamalıdır.

Case folding, path separator, reserved name ve Unicode normalization ayrı logical target'ların clobber olmasına yol açmamalıdır. Cross-device movement unchecked copy-then-delete'e dönüşmemelidir. Hard link, reflink ve rename opsiyonel implementation detail'larıdır: adapter bunun yerine verified copy kullanır veya explicit unsupported-capability error ile hold eder. Bu nedenle platform support, her filesystem'ın aynı syscall'ı sunması değil equivalent safety semantics demektir.

## Operatör acceptance check'i

Operation ancak observed top-level runtime ve recent-work entry'lerinin her biri tek documented family, owner ve disposition ile eşleşiyorsa ve receipt unclassified deletion candidate içermiyorsa apply için güvenlidir. Unknown, credential, database, foreign-run, live-authority, malformed, unverified veya unresolved-conflict artifact deletion'a ulaşabiliyorsa apply etmeyin.
