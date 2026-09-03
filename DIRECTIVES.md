# Motor A: Normal Docker exact-attempt custody recovery

> Owner-admitted bounded ADR-D-007 recovery for
> `RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001`.
> Canonical capsule:
> `docs/execution/active/RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001.md`.
> Full conditional mutation/baseline manifest:
> `docs/execution/active/RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001.expected-red.json`.

## Goal

Normal Docker execution'da immutable task admission'dan exact attempt output'una, pristine provider
capture'dan accepted result/evaluation/finalizer/settlement/archive/restart truth'una kadar tek
host-private custody zinciri kur. Public `.tasks` yalnız compatibility/observability projection'ı
olsun; stale sibling, worker-writable self-report veya hiç çalışmamış task terminal başarı üretemesin.

## Execution Contract

- `DOGFOOD_MODE=ON`, `DOGFOOD_HEALTH=DEGRADED`; envanter 21 node taşır, fakat owner'ın
  `owner-live-2026-08-31-wsl-linux-first` kararıyla T3 ve T17 Windows-native residual'ı bu
  recovery'nin aktif fan-in'inden ayrılmıştır. Aktif 19-node DAG tek bounded ADR-D-007 recovery
  package'ıdır. Planner/dry-run read-only değildir ve bu paketi admit/execute etmek için çağrılmaz.
- Provider, model, effort, worker count ve concurrency metinden zorlanmaz. Supervisor yalnız exact
  dependency ve file-collision sınırını verir; live capacity/effective config uygun değilse slot boş kalır.
- Her `Files:` path'inin tek writer'ı vardır. Sidecar'daki diğer `mutationSupportByLane` path'leri
  conditional allowlist'tir: bir fixture gerçekten değişmek zorunda kalırsa supervisor onu yalnız
  kayıtlı lane'e exact biçimde aktive eder; başka lane veya dosya sessizce sahiplenemez.
- T4 ve T6 engine-hot'tır. Aynı eski process downstream işi çalıştırmış olsa bile yeni source'u
  tükettiği iddia edilemez. Yeni motor yalnız quiescent post-source build ve fresh compiled canary ile kanıtlanır.
- Testler supporting evidence'dır; DONE kanıtı değildir. Product closure exact task → attempt → result →
  evaluation receipt → finalizer → settlement → archive/restart disk zinciri ve gerçek compiled Docker surface'tir.
- Tek implementation pass ve tek independent verification pass vardır. Aynı failure fingerprint yeni
  FIX/retry doğuramaz. New evidence yoksa typed HOLD.
- `.brain/memory.db`, `.tasks` manual delete/mutation, `.deckent/provider-execution-observations.db`
  rollback, credential/config mutation, kill/cleanup, bot restart, commit/push ve Closure signing yasak alandır.
- Owner post-source `npm run build` ve necessary different-provider XVerify'i yetkilendirdi. Build yalnız
  source fan-in tamamlanıp worker/container quiescent olduktan sonra; XVerify yalnız bounded evidence ile.
- Owner `owner-live-2026-08-31-option-a-shared-native-foundation` kararıyla T2/T3 önündeki tek
  versioned native ABI, platform-separated POSIX/Win32 implementation, installed-package ve native
  proof scope expansionını onayladı. Bu onay T5 Docker-daemon consumption proof'unu foundation'a
  katmaz ve commit/push/build/restart/remote provider authority üretmez.
- Owner `owner-live-2026-08-31-wsl-linux-first` kararıyla kapanış kanıtını platformlara ayırdı:
  Linux installed-package, WSL2 native ve WSL2 Docker canary bu recovery'nin aktif zinciridir;
  macOS ve Windows-native ayrı MASTER residual'ıdır. Ortak ABI/platform sınırları korunur, fakat
  erişilemeyen platform test/simülasyonla başarılı gösterilmez ve aktif WSL/Linux kapanışını bloklamaz.
- Owner `owner-live-2026-09-01-option-a-canonical-shrinkwrap` kararıyla root dependency authority'yi
  yayımlanan tek `npm-shrinkwrap.json` dosyasına taşıdı ve root `package-lock.json` projection'ını
  kaldırmayı onayladı. Dashboard/Desktop bağımsız lockfile'ları korunur. T19/T20; CI, release,
  release-prepare, build identity, publish admission, installed verifier ve fresh-cache hydration
  sonrası network-disabled global-install receipt zincirini tek pakette kapatır.
- Owner `owner-live-2026-09-01-t4-ipc-exact-attempt-scope` kararıyla T4'ün task-only IPC kimliğini
  exact attempt/generation envelope'ına taşıması için `task-types`, `question-approval-bridge` ve
  altı doğrudan IPC/result regression testini T4 kapsamına ekledi. T18 Store, T5 backend/mount ve
  T6 producer dosyalarının authority'si bu kararla T4'e devredilmedi.
- Fresh T2 adversarial audit'in kanıtladığı Store stage-digest, native append-length, exact-bound
  EOF ve replay-intrinsic kusurları T2'nin bounded correction'ında kapandı; bu source checkpoint'i
  mount/root veya product closure değildir. Aynı audit'in fiziksel root alias ve Docker mount
  self-report bulguları `BLOCKS_CURRENT_DONE`'dır: T15/T16 native root-separation authority'si ve
  T2↔T5 structured daemon-applied identity receipt'i kapanmadan T2/T5/T19 ilerlemiş sayılmaz.
- Owner `owner-live-2026-09-01-scope-revision-009-t5-exact-effect-containment` kararıyla T5E'yi
  T6/T7 önüne ekledi. Latest sidecar authority transferi, geçmiş lane `Files:` kayıtlarından üstündür:
  devredilen path'lerin current tek writer'ı Task 21'dir. Normal Docker worker canonical `main`
  ağacını writable görmez; complete host effect manifesti ve transactional CAS landing olmadan
  result/evaluation/terminal başarı üretilmez. Genel permission/RBAC/tool-gateway ve gerçek
  macOS/Windows-native proof bu bounded recovery genişlemesine dahil değildir.
- Alperen'in 2026-09-01 canlı `Devam edebilirsin` yetkisi
  (`owner-live-2026-09-01-continue-t5-exact-effect-containment`), aynı T5E closure içinde
  DIRECTIVES Task 21'de zaten deklare edilmiş shared persistence, lock/native adapter, fence ve
  shared fixture yollarını `SCOPE-REVISION-010-T5-EXACT-EFFECT-FAN-IN` ile latest sidecar'ın
  tek-writer authority'sine bağlar. Bu yeni outcome değildir; mock-only adapter, process-local
  staging identity veya sidecar dışı path ile kapanış iddiası verilemez.
- Aynı owner ref altında `SCOPE-REVISION-011-T5-EXACT-EFFECT-PRODUCTION-ADAPTERS`, ilk baseline
  öncesi Docker volume lifecycle ile Store-backed journal/publication bridge'ini iki dar adaptera
  ayırır. Bu adapterlar ikinci workflow/lock/manifest authority üretemez; yalnız mevcut shared
  persistence, native, coordinator, canonical lock ve Store sözleşmelerini production'a bağlar.
- Fable `REVISE` fan-in'i ve Alperen'in aynı T5E devam yetkisi altında
  `SCOPE-REVISION-012-T5-EXACT-RESTART-DISCOVERY`, POSIX/Win32 custody adapterları ile doğrudan
  testlerinin tek-writer authority'sini T5E'ye devreder. Dispatch reservation dizini yalnız bounded,
  handle-bound ve mutation-detecting aday kaynağıdır; her aday `readDispatchAdmission` ve terminal
  Store authority'leriyle semantic reread edilmeden restart/acceptance authority olamaz. Ayrı global
  catalog, raw directory listing authority veya `.tasks` locator yasaktır.
- Fresh T5E fan-in'inin typed-HOLD denetimi ve Alperen'in canlı devam yetkisi altında
  `SCOPE-REVISION-013-T6-NORMAL-PRODUCER-CUTOVER`, normal Sprint'in backend/controller/collector
  bileşim yollarını T6'ya devreder. Exact recovery'de işlenemeyen her admission caller'a immutable,
  identity-bound HOLD olarak döner; debug-only veya boş başarılı report olamaz. Initial ve
  queued/dependency-ready dispatch aynı `prepare → dispatch → await → accept → read` executor'una
  iner; public task/status yalnız private admission ve RELEASED sınırlarından sonra projection'dır.
- Fresh T7 ingress audit'i ve Alperen'in canlı `Harika devam` yetkisi altında
  `SCOPE-REVISION-014-T7-TASK-INGRESS-AUTHORITY`, T7'yi T6'nın non-lossy exact dispatch ve
  existing-task CAS sözleşmesine dependency-bound yapar. CLI run/spawn, MCP run ve task-mode ayrı
  execution motorları kuramaz; aynı task ingress application authority'sini çağırır. Public task,
  raw result, V1 settlement veya job projection exact admission/accepted-result authority'sinin
  yerine geçemez. Run message catalogu ve MCP job projectionu yalnız yüzey çevirisidir.
- Aynı canlı devam yetkisi altında
  `SCOPE-REVISION-015-T6-EXACT-PLAN-DEFERRED-PROJECTION`, exact-plan başlangıç servisini ve
  iki doğrudan kanıt dosyasını T6'ya bağlar. Exact Docker plan doğrulaması public task projection
  yayımlamaz; her task ancak kendi private admission + RELEASED sınırından sonra karşılaştırmalı
  projection üretir. Existing projection yalnız stable/no-follow digest ve CAS ile değişebilir.
- `SCOPE-REVISION-016-T6-EXACT-PLAN-CALLBACK-FANIN`, exact planı çalıştıran start, autonomous ve
  process-runtime adapterlarını aynı T6 callback sözleşmesine bağlar. Adapter materialization
  sonucunu yutamaz; controller task-id/digest admissionını görmeden exact Docker dispatch açılmaz.
- Fresh bağımsız T7 kaynak denetimi ve aynı canlı `Harika devam` yetkisi altında
  `SCOPE-REVISION-017-T7-INGRESS-AUDIT-CLOSURE`, composition root, invocation receipt ve typed
  no-dispatch settlement authority'sini T7'ye bağlar. CLI/MCP/task-mode yüzeyleri exact zero-work
  veya reconciliation receipt'ini generic hata içinde kaybedemez; host-adapter kararı config
  default'u yüzünden sessizce Docker'a dönemez; job/task projection yazımı concurrent writer
  verisini silemez. Bu revizyon T8, build veya runtime execution yetkisi üretmez.
- `SCOPE-REVISION-018-T7-TRANSPORT-METADATA-COMPILE-FANIN`, aynı T7 düzeltmesinin compile
  fan-in'idir: MCP transport vocabulary'sini provider-truth doğrulamasına ve yeni zorunlu
  disposition metadata'sını eski observability kanıtına bağlar. Yeni ürün davranışı veya yeni lane
  üretmez; yalnız revision 017'nin typed sözleşmesini bütün tüketicilerde kapatır.
- Owner'ın checkpoint sonrası canlı devam kararı altında
  `SCOPE-REVISION-019-T7-PRODUCTION-CONSUMER-CLOSURE`, gerçek CLI `spawn` composition authority'sini,
  autonomous/process exact-result consumerlarını ve doğrudan kanıtlarını T7'ye bağlar. Autonomous
  dispatcher'ın tek-writer authority'si T13'ten T7'ye devredilir; T13 daha sonra bu kapanmış contractı
  tüketir. Exact consumer raw `.result` fallbackına dönemez, CLI reconciliation evidence'ını
  kaybedemez ve MCP worker self-assessment'ı host kararı gibi yayımlayamaz. Bu revizyon T8, build,
  runtime veya dogfood admissionı değildir.
- Revision 019 sonrası fresh bağımsız audit ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-020-T7-RECONCILIATION-DURABILITY`, autonomous backlog sonucunun exact task-ingress
  zero-work/reconciliation receipt'ini structured ve durable taşıması için
  `src/orchestra/autonomous/backlog-types.ts` yolunu T7'ye ekler. Reconciliation normal failure olarak
  settle edilemez; receipt/evidence korunarak `parked` kalır. Bu revizyon T8 veya runtime admissionı değildir.
- Fresh T8 source audit'i ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-021-T8-PRIVATE-SETTLEMENT-CUTOVER`, XVerify task settlement şemasını, CLI'ın typed
  HOLD detail tüketicisini ve iki doğrudan kanıtını T8'e bağlar. Exact producer/verifier `.result`
  dosyaları terminal settlement sonrası değiştirilemez; XVerify settlement yalnız attempt-bound
  host-private receipt'te yaşar ve CLI ayrıntıyı runner'ın typed sonucundan okur. Bu revizyon build,
  live provider call, runtime veya dogfood admissionı değildir.
- Revision 021 sonrası fresh bağımsız audit ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-022-T8-TRACKED-SETTLEMENT-CONTRACT`, batarya dışında kalmış tracked
  `tests/orchestra/cross-verify-task-settlement.test.ts` dosyasını T8'e ekler. Test gerçek attempt
  claim/closure kurmadan settlement uyduramaz ve public `.result` projectionını authority sayamaz.
  Bu revizyon build, live provider call, runtime veya dogfood admissionı değildir.
- T9 read-only discovery ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-023-T9-EXACT-REPAIR-BIRTH-AUTHORITY`, exact terminal authority parser'ını,
  evidence-changed repair-birth contractını ve collector parser tüketicisini T9'a bağlar.
  `src/orchestra/result-collector.ts` T6'dan T9'a devredilir; bu bir yeni execution motoru değil,
  mevcut accepted-result terminal authority'sinin tek parser'a taşınmasıdır. T9 bu foundationı
  kaynak düzeyinde kurar; T10/T11 immutable finalizer/evaluation receipt producer'ı bağlamadan
  production closure veya dogfood admissionı oluşmaz.
- Fresh T10/T11 boundary audit ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-024-T10-T11-T12-AUTHORITY-ORDERING`, terminal karar üreticisi ile tüketicisi
  arasındaki ters dependency'yi düzeltir. Canonical sıra `T9 -> T11 -> T10 -> T12` olur: T11 tek
  accepted-attempt-bound terminal decision/evaluation/finalizer/settlement authority üreticisidir;
  T10 checkpoint/resume/finalize/archive tüketicisidir; T12 yalnız production composition ve fan-in
  yapar. `sprint-controller`, `sprint-phases`, `sprint-spawner` T6'dan, `result-collector` T9'dan
  T12'ye devredilir; `sprint-lifecycle` T12'ye eklenir. Bu revizyon build, runtime veya dogfood
  admissionı değildir.
- T11 producer implementation sırasında fresh custody-input audit ve aynı owner devam yetkisi
  altında `SCOPE-REVISION-025-T11-EXACT-EVALUATOR-INPUT`, public/caller `Task` ve dışarıda üretilmiş
  `EvaluationResult` girdilerinin terminal receipt basmasını engeller. `task-result-authority.ts`
  T4'ten T11'e devredilir; `result-evaluator.ts` T11'e eklenir. T11 yalnız Store-inspected exact
  `TaskResultV2`, admission snapshot içindeki dispatch task material ve canonical rubric evaluator
  üzerinden karar üretebilir. Bu revizyon T12 wiring, build, runtime veya dogfood admissionı değildir.
- T11 snapshot parser audit'i ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-026-T11-CANONICAL-DISPATCH-TASK-AUTHORITY`, Docker producer ile T11'in aynı Task
  bytes'ını farklı ve eksik parserlarla yorumlamasını kapatır. Ortak parser policy-resolved canonical
  JSON bounds, exact required/optional key sözleşmesi ve material digest eşitliğiyle tek authority
  olur. `spawn-backend-docker.ts`, exact terminal authority/type yönü ve dört doğrudan support yolu
  T11'e devredilir; yeni parser ile negatif matrisi T11'e eklenir. Bu revizyon T12 wiring, build,
  runtime veya dogfood admissionı değildir.
- T11 accepted-result settlement uygulaması ve owner'ın aynı main akışta devam talimatı altında
  `SCOPE-REVISION-027-T11-EXACT-EVALUATION-SETTLEMENT-PROOF`, caller/public sonucu karar girdisi
  yapmayan exact producer'ın durable evaluation → finalizer → settlement zincirini ve crash/replay
  adoption kanıtını ayrı bir support testine bağlar. Bu revizyon yalnız T11 source proof kapsamıdır;
  T12 wiring, build, runtime veya dogfood admissionı değildir.
- Fresh T11 source/wiring audit'i ve aynı owner devam yetkisi altında
  `SCOPE-REVISION-028-T11-DURABLE-POLICY-PROVIDER-EFFECT-FANIN`, evaluation kararının caller'dan
  aldığı mutable config/rubric/exit/project-root girdilerini kaldırır. Canonical policy dispatch
  öncesi approved material içine mühürlenir; provider exit, accepted attempt ve verified effect
  Store'dan yeniden okunur; production-wiring kanıtı yoksa başarı yerine typed HOLD doğar.
  `scheduler-effects.ts` T6'dan, `result-collector.ts` T12'den T11'e geçici olarak devredilir;
  `criterion-evaluation.ts` ile iki yeni authority modülü T11'e eklenir. T12 gerçek host kanıtını ve
  fan-in'i bağladıktan sonra bu yüzeylerin final ownership'i yeniden ölçülür. Bu revizyon build,
  runtime veya dogfood admissionı değildir.
- T12 iki bağımsız source audit'i ve owner'ın ana recovery akışına devam talimatı altında
  `SCOPE-REVISION-029-T12-EXACT-LIFECYCLE-PRODUCTION-FANIN`, T11'in immutable terminal producerını
  normal controller, FIX, dependency release, restart, checkpoint, pause/resume ve finalizer
  zincirine bağlar. Registry artık caller verdict string'i değil Store'dan her kullanımda yeniden
  doğrulanan tam terminal authority taşır; exact task public result/evaluator/checkpoint fallback'ine
  dönemez. Host production-wiring gözlemi accepted attempt'a bağlı durable Store artifact'ıdır;
  gerçek canonical consumer observation yoksa typed HOLD kalır. T11/T10/T6/T7/T5E'den devredilen
  path'ler bu fan-in boyunca T12'nin tek-writer authority'sidir. Bu revizyon build, runtime canary,
  dogfood admissionı veya unsupported platform success'i üretmez.
- Rev029 negative proof review'i ve aynı owner continuation authority altında
  `SCOPE-REVISION-030-T12-PRODUCTION-WIRING-REAL-STORE-FIXTURE`, yalnız
  `tests/helpers/task-result-settlement-v2-fixture.ts` mutation-support authority'sini T11'den
  T12'ye devreder. Amaç gerçek Store üzerinde positive durable host-settlement roundtrip ve
  tamper/sibling/replay kanıtıdır; fixture-local sahte Store veya mock authority yasaktır.
- Fresh independent host-observer audit'i ve owner'ın açık
  `owner-live-2026-09-02-approve-scope-revision-031-real-host-proof` kararı altında
  `SCOPE-REVISION-031-T12-REAL-HOST-PROOF-AUTHORITY`, production-wiring kanıtını plan veya worker
  metninden echo etmeyi yasaklar. Canonical plan-authoring tarafından digest-bound, read-only ve
  idempotent bir host proof programı üretilir; normal backend composition bu programı secret-free,
  shell-free, bounded ve platform-adapter arkasındaki runner ile çalıştırır. Actual exit/output
  digestleri accepted attempt, COMMITTED effect landing ve exact contract/program kimliğine bağlı
  durable Store receipt'i olur. Eksik contract coverage, unavailable adapter, unsupported platform,
  timeout, cancellation veya belirsiz start-without-terminal başarı değil typed HOLD'dur. Bu
  revizyon yalnız T12 source/wiring recovery kapsamıdır; build, runtime canary veya dogfood admissionı
  açmaz.
- Rev031 implementation audit'inin bulduğu canonical harness boşluğu ve owner'ın açık
  `owner-live-2026-09-02-approve-scope-revision-032-canonical-host-proof-harness` kararı altında
  `SCOPE-REVISION-032-CANONICAL-HOST-PROOF-HARNESS`, T12'ye yalnız
  `scripts/production-wiring-host-proof-harness.mjs` production authority'sini ve
  `tests/scripts/production-wiring-host-proof-harness.test.ts` mutation-support authority'sini
  ekler. Harness serbest command/shell köprüsü veya plan target echo'su olamaz; yalnız versioned,
  allowlisted, salt-okunur adapter protokolü gerçek ürün yüzeyi/receipt gözleminden structured
  outcome üretebilir. Domain-specific adapter ayrıca owner-admitted immutable asset olmadan
  eklenemez. Bu revizyon build, runtime canary veya dogfood admissionı açmaz.
- T13 planned integration proof'unun yakaladığı exact-result projection kaybı ve owner'ın açık
  `owner-live-2026-09-02-approve-scope-revision-033-t13-exact-result-consumer-projection` kararı
  altında `SCOPE-REVISION-033-T13-EXACT-RESULT-CONSUMER-PROJECTION`, autonomous/task/process
  consumerlarına ulaşan exact accepted result'ın Store-verified attempt identity ve digest
  metadata'sını kaybetmeden tek canonical compatibility projection üzerinden taşınmasını sağlar.
  `task-result-authority`, `scheduler-effects`, `process-runtime`, `autonomous/execute-dispatcher`
  ve dört doğrudan support testi önceki tamamlanmış lane'lerden T13'e devredilir. Public `.result`,
  raw V2 cast, fixture-local projection veya metadata'sız `exact-accepted` success yasaktır. Bu
  revizyon T14, build, runtime canary veya dogfood admissionı açmaz.

## Task 1: T1-CUSTODY-KERNEL — Immutable attempt custody and settlement schema
- Files:
- Reads: src/core/task-attempt-custody-store.ts, src/core/task-types.ts, src/core/utils.ts, src/core/paths.ts, src/core/errors.ts, src/core/provider-execution-observation-store.ts, src/orchestra/runtime-budget-monitor.ts, tests/core/task-attempt-custody-store.test.ts, tests/helpers/task-result-settlement-stub.ts, tests/helpers/task-result-settlement-v2-fixture.ts
- Dependencies: none
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-result-schema.test.ts tests/core/task-result-settlement.test.ts tests/core/task-attempt-custody-store.test.ts --reporter=dot

### Description

Define the versioned host-private custody envelope and store: immutable task admission snapshot,
attempt identity/generation, first-writer bounded artifacts, pristine provider capture, result and
evaluation/finalizer/archive digest chain. Preserve explicit historical V1 read compatibility only;
normal Docker V2 cannot mint or accept a settlement without exact custody.
T1'in Store candidate'ı frozen bağımsız GO aldı; fresh security evidence nedeniyle Store ve Store
testinin bundan sonraki tek write authority'si Task 18'e devredildi. Required effect-landing binding
fixture write authority'si current T5E fan-in boyunca Task 21'e devredildi.

### goNogo
- goCriteria: create-before-claim order, canonical digest, exact project/task/attempt/generation identity, no-replace first writer, bounded artifact refs, V1 historical sentinel and V2 fail-closed parser are deterministic
- nogo: public path or worker-authored bytes become authority; missing attempt is inferred; V1/V2 are silently mixed; malformed or replayed receipt is repaired
- techDebtAcceptable: None

## Task 2: T2-POSIX-CUSTODY — Linux/WSL2 secure filesystem adapter
- Files:
- Reads: src/core/task-attempt-custody-store.ts, src/core/exec-authority-native.ts, src/core/errors.ts, src/core/paths.ts
- Dependencies: Task 1, Task 16, Task 18
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-attempt-custody-posix-adapter.test.ts --reporter=dot

### Description

Implement owner-private directory/file modes, no-follow regular-file capture, link-count and
inode/device recheck, bounded reads, exclusive no-replace publication and durable flush. DrvFS or
unsupported capability is measured and returns typed HOLD rather than silent POSIX equivalence.
Darwin success bu task'tan üretilmez; macOS native proof MASTER residual
`RECOVERY-BORN-711-MACOS-NATIVE-CUSTODY-PROOF-001` altındadır.
Store publication stages exact ayrı operation digest'leri ve replay-safe session authority'si taşır.
Custody root/project ayrımı lexical path'e değil T15/T16'nın pinned native root-separation kanıtına
bağlanır. Backend mount transfer'i raw path veya consumer self-report digest'iyle `CONSUMED` olamaz;
T5'in daemon-applied object identity ve access-mode receipt'i pinned task/output identity'leriyle eşleşir.
`SCOPE-REVISION-012-T5-EXACT-RESTART-DISCOVERY` boyunca adapter ve doğrudan testinin current tek
write authority'si Task 21'dir; T2 frozen foundation ve read/test dependency olarak korunur.

### goNogo
- goCriteria: symlink, FIFO, oversize, hard-link, inode swap, operation replay and duplicate writer fail closed; physical root separation is native-proven; structured mount receipt exact object/access identity matches; successful capture is immutable and durable
- nogo: path-only stat then read; truncate/overwrite; lexical-only root separation; ambient/retained source path or arbitrary digest becomes mount authority; platform capability inferred from process.platform alone
- techDebtAcceptable: None

## Task 3: T3-WINDOWS-CUSTODY — DEFERRED Windows-native ACL and reparse-safe adapter
- Files:
- Reads: src/core/task-attempt-custody-store.ts, src/core/exec-authority-native.ts, src/core/errors.ts, src/core/paths.ts
- Dependencies: Task 1, Task 17, Task 18
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-attempt-custody-win32-adapter.test.ts --reporter=dot

### Description

Bu task mevcut recovery'nin aktif fan-in'inden owner kararıyla çıkarılmıştır. Frozen candidate ve
bağımsız audit bulguları korunur; yeni mutation, GO veya native proof iddiası üretilmez. Kalan exact
operation-digest lifecycle, handle-pinned path identity, abort cleanup, path-alias containment ve
trusted pre-load bootstrap işi MASTER residual
`RECOVERY-BORN-711-WINDOWS-NATIVE-CUSTODY-PROOF-001` altındadır. POSIX permissions veya Linux
simulation Windows-native proof değildir.
`SCOPE-REVISION-012-T5-EXACT-RESTART-DISCOVERY` boyunca adapter ve doğrudan testinin current tek
write authority'si Task 21'dir; T3 frozen/deferred foundation ve read/test dependency olarak korunur.

### goNogo
- goCriteria: ACL/reparse/exclusive-create/flush contracts are explicit and capability-tested; simulation is labelled simulation
- nogo: success without readback; junction/reparse traversal; best-effort ACL; native proof fabricated on Linux
- techDebtAcceptable: None

## Task 4: T4-EXACT-CONSUMERS — Result ingress, settlement, projection and IPC
- Files: src/core/task-settlement-authority.ts, src/core/task-types.ts, src/orchestra/ipc-registry.ts, src/orchestra/question-approval-bridge.ts, src/orchestra/result-assembler.ts, tests/agents/worker-ipc.test.ts, tests/cli/task-settlement.test.ts, tests/core/task-settlement-authority.test.ts, tests/orchestra/ipc-question-bridge-wire.test.ts, tests/orchestra/ipc-registry.test.ts, tests/orchestra/ipc-worker-question-action.test.ts, tests/orchestra/question-approval-bridge.test.ts, tests/orchestra/result-assembler.test.ts, tests/orchestra/result-collector.test.ts
- Reads: src/agents/worker-ipc.ts, src/core/task-attempt-custody-store.ts, src/core/task-result-schema.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/core/paths.ts, src/core/errors.ts, src/cli/commands/task-settlement.ts, src/cli/helpers/output.ts
- Dependencies: Task 1, Task 2, Task 20
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/agents/worker-ipc.test.ts tests/cli/task-settlement.test.ts tests/core/task-settlement-authority.test.ts tests/orchestra/ipc-question-bridge-wire.test.ts tests/orchestra/ipc-registry.test.ts tests/orchestra/ipc-worker-question-action.test.ts tests/orchestra/question-approval-bridge.test.ts tests/orchestra/result-assembler.test.ts tests/orchestra/result-collector-settlement-authority.test.ts tests/orchestra/result-collector.test.ts tests/orchestra/task-result-authority.test.ts --reporter=dot

### Description

Make every normal Docker result consumer accept an exact custody settlement/ref. Preserve
runPolicyEvidence, productionWiringEvidence and settlement identity through assembly/collection.
Move question/answer IPC to attempt-private artifacts and publish public compatibility through
generation-fenced CAS only.

### goNogo
- goCriteria: exact attempt and digest survive ingress→assembler→collector→projection; stale/sibling/public spoof returns typed HOLD; no-dispatch stays zero-attempt
- nogo: task-level filename selects a winner; accepted result is semantically enriched from public log; missing custody falls back in normal Docker
- techDebtAcceptable: None

## Task 5: T5-DOCKER-PHYSICAL-CUSTODY — Attempt-private mounts and pristine capture
- Files: src/agents/landing-proposal-entry.ts, src/core/execution-landing-checkpoint.ts, src/core/execution-landing-context.ts, src/core/execution-landing-proposal.ts, src/orchestra/execution-continuation-runner.ts, tests/core/execution-landing-checkpoint.test.ts, tests/core/execution-landing-proposal.test.ts, tests/orchestra/docker-result-settlement.test.ts, tests/orchestra/docker-settlement-monitor-wire.test.ts, tests/orchestra/execution-continuation-runner.test.ts, tests/orchestra/execution-landing-proposal-consumer.test.ts
- Reads: src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/execution-landing-proposal.ts, src/core/provider-execution-observation-store.ts, src/orchestra/result-ingress.ts, src/orchestra/task-result-authority.ts, src/core/agent-pool.ts, src/core/agent-types.ts, src/core/prompt-delivery-receipt.ts, src/core/routing/capability-vector.ts, src/core/routing/config.ts, src/core/skill-pool.ts, src/core/skill-types.ts, src/core/config-types.ts, src/core/cross-verify-execution-contract.ts, src/core/execution-landing-checkpoint.ts, src/core/execution-landing-context.ts, src/core/file-lock.ts, src/core/provider.ts, src/core/work-model.ts, src/core/worker-heartbeat-authority-store.ts, src/core/active-workers.ts, src/core/config.ts, src/core/utils.ts
- Dependencies: Task 4
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-landing-checkpoint.test.ts tests/core/execution-landing-proposal.test.ts tests/orchestra/spawn-backend-docker-mounts.test.ts tests/orchestra/spawn-backend-docker.test.ts tests/orchestra/docker-result-settlement.test.ts tests/orchestra/docker-settlement-monitor-wire.test.ts tests/orchestra/execution-continuation-runner.test.ts tests/orchestra/execution-landing-coordinator.test.ts tests/orchestra/execution-landing-proposal-consumer.test.ts --reporter=dot

### Description

Prepare private task snapshot/output root before attempt publication; mount only exact worker-output
at `/workspace/.tasks` and the task snapshot read-only. Capture raw provider stream before public
normalization, freeze bounded artifacts after exit, and bind continuation/landing references to
custody-relative result refs instead of project `.tasks`.
Docker handoff consumes the one-shot adapter lease inside the bounded create/mount boundary and
returns a structured daemon-applied receipt: exact container/engine evidence, task snapshot/output
mounted object identities and RO/RW access state. Adapter derives the transfer digest after matching
that receipt to its pinned handles; callback-authored arbitrary digest or inspect-only source string
is not success.

### goNogo
- goCriteria: shared `.tasks` is invisible in container; each attempt has distinct output; daemon receipt proves exact mounted identities and task RO/output RW policy; terminal capture and billing use final pristine bytes; landing/continuation inherit exact parent digests
- nogo: project task/result/log bind remains; source-path/self-report-only mount success; public `.tasks/...result` is embedded in durable landing; early usage envelope becomes final cost
- techDebtAcceptable: None

## Task 6: T6-NORMAL-PRODUCERS — Pre-publication admission for Sprint and scheduler
- Files: src/cli/commands/autonomous.ts, src/cli/commands/start.ts, src/cli/helpers/process-runtime.ts, src/orchestra/exact-plan-start-service.ts, src/orchestra/spawn-backend.ts, src/orchestra/sprint-planner.ts, src/orchestra/task-artifact-projection.ts, src/orchestra/task-builder.ts, tests/orchestra/dependency-aggregate-fix-aware.test.ts, tests/orchestra/exact-plan-start-service.test.ts, tests/orchestra/production-wiring-task-builder.test.ts, tests/orchestra/scheduler-cascade-composition.test.ts, tests/orchestra/scheduler-collision-reorder-wire.test.ts, tests/orchestra/scheduler-driver-composition.test.ts, tests/orchestra/scheduler-single-truth.test.ts, tests/orchestra/spawn-spawner-wire.test.ts, tests/orchestra/task-artifact-projection.test.ts, tests/orchestra/task-projection-parity.test.ts
- Reads: src/core/active-workers.ts, src/core/audit-writer.ts, src/core/config.ts, src/core/event-stream.ts, src/core/execution-effect-persistence-contract.ts, src/core/file-lock.ts, src/core/production-wiring-contract.ts, src/core/provider-execution-ingress-authority.ts, src/core/run-flow-store.ts, src/core/sprint-types.ts, src/core/task-attempt-custody-store.ts, src/core/task-result-schema.ts, src/core/task-result-settlement.ts, src/core/task-settlement-authority.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/orchestra/sprint-checkpoint.ts, src/orchestra/task-result-authority.ts, src/cli/commands/finalize.ts
- Dependencies: Task 21
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/dependency-aggregate-fix-aware.test.ts tests/orchestra/exact-plan-start-service.test.ts tests/orchestra/production-wiring-task-builder.test.ts tests/orchestra/scheduler-cascade-composition.test.ts tests/orchestra/scheduler-collision-reorder-wire.test.ts tests/orchestra/scheduler-driver-composition.test.ts tests/orchestra/scheduler-single-truth.test.ts tests/orchestra/spawn-spawner-wire.test.ts tests/orchestra/task-artifact-projection.test.ts tests/orchestra/task-projection-parity.test.ts --reporter=dot

### Description

Create immutable host admission before task/claim/attempt public projection. Dependency prompt
composition consumes exact accepted dependency settlement, never largest numeric public attempt.
Scheduler/spawner hand the custody ref to the backend and cannot synthesize an attempt for work not dispatched.
Recovery fan-in returns every unreconciled exact admission as a typed HOLD and startup consumes any
non-empty HOLD set as failed recovery; debug logging is supporting evidence only. Initial and queued
tasks use one backend-owned exact executor and collector receives only its branded accepted reader.

### goNogo
- goCriteria: admission-before-claim is crash ordered; dependencies are exact accepted attempts; unrun task has no attempt/evaluation; late sibling CAS cannot overwrite
- nogo: task-builder scans public results/evaluations; claim is visible before private snapshot; attempt count grows on pre-dispatch refusal without typed zero-work settlement
- techDebtAcceptable: None

## Task 7: T7-CLI-MCP-INGRESS — Run, spawn and task-mode custody parity
- Files: src/cli/commands/run.ts, src/cli/commands/spawn.ts, src/cli/helpers/message-catalog/cli-run.ts, src/mcp/tools/job-runner.ts, src/mcp/tools/run.ts, src/orchestra/task-mode-runner.ts, tests/cli/run-attempt-custody.test.ts, tests/cli/run-result-settlement.test.ts, tests/cli/spawn-settlement-attempt.test.ts, tests/mcp/run-attempt-custody.test.ts, tests/mcp/run-budget-authority.test.ts, tests/mcp/run-tool-parity.test.ts, tests/mcp/tools/run.test.ts, tests/orchestra/mode-aware-routing.test.ts, tests/orchestra/task-mode-agent-inject.test.ts, tests/orchestra/task-mode-runner.test.ts, tests/orchestra/task-mode-tokenusage.test.ts
- Reads: src/cli/helpers/output.ts, src/cli/helpers/process.ts, src/core/agent-pool.ts, src/core/approval-authority-bootstrap.ts, src/core/config-types.ts, src/core/config.ts, src/core/constants.ts, src/core/execution-plan-digest.ts, src/core/invocation-receipt-store.ts, src/core/model-registry.ts, src/core/provider-execution-ingress-authority.ts, src/core/reasoning-effort.ts, src/core/skill-pool.ts, src/core/stack-detector.ts, src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-settlement-authority.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/core/work-model.ts, src/mcp/helpers/enrich.ts, src/orchestra/spawn-backend.ts, src/orchestra/task-result-authority.ts
- Dependencies: Task 21, Task 6
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/run-result-settlement.test.ts tests/cli/spawn-settlement-attempt.test.ts tests/cli/run-attempt-custody.test.ts tests/mcp/run-attempt-custody.test.ts tests/mcp/run-budget-authority.test.ts tests/mcp/run-tool-parity.test.ts tests/mcp/tools/run.test.ts tests/orchestra/mode-aware-routing.test.ts tests/orchestra/task-mode-agent-inject.test.ts tests/orchestra/task-mode-runner.test.ts tests/orchestra/task-mode-tokenusage.test.ts --reporter=dot
- PromotionProof: run/linux node dist/cli/entry.js run --help

### Description

Make CLI, MCP and task-mode ingress create/consume the same exact custody contract. No adapter may
rebuild authority from its own public files. Product output remains i18n-clean; mechanism modules
receive labels rather than hardcoded user-facing strings.

### goNogo
- goCriteria: CLI/MCP/task-mode parity uses one application authority and exact settlement; pre-dispatch and final-only outcomes are truthful
- nogo: one surface uses legacy public result; missing attempt is normalized; CLI-only behavior is mistaken for engine closure
- techDebtAcceptable: None

## Task 8: T8-XVERIFY-CUSTODY — Exact verifier task and production ingress
- Files: src/cli/commands/xverify.ts, src/core/xverify-task-settlement.ts, src/orchestra/cross-verify-docker-runtime-authority.ts, src/orchestra/cross-verify-production-ingress-authority.ts, src/orchestra/cross-verify-runner.ts, tests/cli/xverify-waiting-signal.test.ts, tests/core/xverify-task-settlement.test.ts, tests/orchestra/cross-verify-docker-runtime-authority.test.ts, tests/orchestra/cross-verify-production-ingress-authority.test.ts, tests/orchestra/cross-verify-task-settlement.test.ts, tests/orchestra/cross-verify-wire.test.ts, tests/orchestra/xverify-producer-fencing.test.ts
- Reads: src/cli/commands/spawn.ts, src/cli/helpers/messages.ts, src/core/config-types.ts, src/core/constants.ts, src/core/cross-verify-adjudication.ts, src/core/cross-verify-evidence-broker.ts, src/core/cross-verify-execution-contract.ts, src/core/cross-verify-prompt.ts, src/core/cross-verify.ts, src/core/execution-landing-checkpoint.ts, src/core/execution-termination-ledger.ts, src/core/invocation-receipt-store.ts, src/core/invocation-receipt.ts, src/core/model-registry.ts, src/core/provider-authority-composition.ts, src/core/provider-limit-truth.ts, src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/orchestra/result-ingress.ts, src/orchestra/spawn-backend-docker.ts
- Dependencies: Task 21, Task 7
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/cross-verify-docker-runtime-authority.test.ts tests/orchestra/cross-verify-production-ingress-authority.test.ts tests/orchestra/cross-verify-wire.test.ts tests/orchestra/xverify-producer-fencing.test.ts --reporter=dot

### Description

Bind verifier task snapshot, evidence broker, Docker output and adjudication to the same exact
attempt custody. Preserve different-provider, tier, reachability and limit gates. This task changes
code and hermetic checks only; it does not make a live provider call or claim an XVerify verdict.

### goNogo
- goCriteria: producer enrichment cannot break fencing; exact verifier attempt/usage/settlement/receipt survive; missing eligibility/evidence is unavailable/HOLD
- nogo: same-provider fallback; public result mutation after settlement; test fixture receipt presented as provider execution
- techDebtAcceptable: None

## Task 9: T9-FIX-XFIX-CUSTODY — Finite evidence-changed repair lineage
- Files: src/orchestra/debt-manager.ts, src/orchestra/repair-birth-authority.ts, tests/orchestra/debt-manager-attempt-custody.test.ts, tests/orchestra/debt-manager-fix-authority-wire.test.ts, tests/orchestra/debt-manager.test.ts, tests/orchestra/failure-disposition-chain.test.ts, tests/orchestra/fix-agent-selection.test.ts, tests/orchestra/fix-retry-circuit-breaker.test.ts, tests/orchestra/fix-task-enrichment.test.ts, tests/orchestra/fix-task-force-skills.test.ts, tests/orchestra/gwtd-fix-trigger.test.ts, tests/orchestra/repair-birth-authority.test.ts, tests/orchestra/repair-task-constraint-inheritance.test.ts
- Reads: src/agents/worker.ts, src/core/audit-writer.ts, src/core/constants.ts, src/core/failure-disposition-policy.ts, src/core/memory-store.ts, src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/orchestra/scheduler-effects.ts, src/orchestra/task-result-authority.ts
- Dependencies: Task 21, Task 6
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/debt-manager-attempt-custody.test.ts tests/orchestra/repair-birth-authority.test.ts tests/orchestra/debt-manager-fix-authority-wire.test.ts tests/orchestra/fix-retry-circuit-breaker.test.ts tests/orchestra/repair-task-constraint-inheritance.test.ts --reporter=dot

### Description

Derive FIX/XFIX only from immutable accepted evaluation/settlement receipts. Bind parent task,
accepted attempt and changed-evidence fingerprint. Refuse duplicate repair birth when the failure
fingerprint is unchanged; supersede queued descendants after accepted settlement.

### goNogo
- goCriteria: repair lineage is exact and finite; authority/execution failures do not spend product-defect retry; unchanged evidence returns terminal HOLD
- nogo: worker-written evaluation births repair; numeric retry alone distinguishes work; a settled root leaves redundant descendants dispatchable
- techDebtAcceptable: None

## Task 10: T10-RESTART-FINALIZER — Exact checkpoint, resume, finalize and archive input
- Files: src/cli/commands/finalize.ts, src/cli/commands/resume.ts, src/orchestra/completed-checkpoint-terminalizer.ts, src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-finalizer.ts, tests/cli/finalize-attempt-custody.test.ts, tests/orchestra/completed-checkpoint-terminalizer-events.test.ts, tests/orchestra/sprint-checkpoint.test.ts, tests/orchestra/sprint-finalizer-attempt-custody.test.ts, tests/orchestra/sprint-finalizer-terminal-publication.test.ts
- Reads: src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/sprint-archive.ts, src/orchestra/result-collector.ts, src/orchestra/task-result-authority.ts, src/orchestra/evaluation-audit-trail.ts, src/core/event-stream.ts, src/core/execution-landing-checkpoint.ts, src/core/execution-landing-proposal.ts, src/core/file-lock.ts, src/core/errors.ts
- Dependencies: Task 4, Task 21, Task 9, Task 11
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/sprint-checkpoint.test.ts tests/orchestra/docker-restart-reconcile.test.ts tests/orchestra/completed-checkpoint-terminalizer-events.test.ts tests/cli/finalize-attempt-custody.test.ts tests/orchestra/sprint-finalizer-attempt-custody.test.ts tests/orchestra/sprint-finalizer-terminal-publication.test.ts --reporter=dot
- PromotionProof: finalize/linux node dist/cli/entry.js finalize --help

### Description

Persist exact custody refs in checkpoints and reconcile restart/adoption with private claim,
dispatch/container and artifact evidence. Finalizer and completed-checkpoint recovery consume exact
evaluation receipts; they cannot choose `brainEvaluation`, `evaluationDecision` or `selfAssessment`
from a public result. Archive terminal projection carries custody digests without reinterpreting private bytes.

### goNogo
- goCriteria: restart selects exact attempt; completed checkpoint reuses exact evaluation receipt; force-finalize cannot print COMPLETE before terminal settlement; archive/restart round-trip preserves digests
- nogo: largest/public attempt wins; result self-report becomes evaluation authority; force-finalize or ABORTED erases unresolved evidence
- techDebtAcceptable: None

## Task 11: T11-EVALUATION-ACCEPTANCE — Accepted-attempt-bound decision receipt
- Files: src/orchestra/acceptance-enforcement.ts, src/orchestra/criterion-evaluation.ts, src/orchestra/evaluation-audit-trail.ts, src/orchestra/exact-accepted-result-terminal-authority.ts, src/orchestra/exact-docker-dispatch-task-authority.ts, src/orchestra/exact-docker-provider-exit-authority.ts, src/orchestra/exact-evaluation-policy-authority.ts, src/orchestra/result-collector.ts, src/orchestra/result-evaluator.ts, src/orchestra/scheduler-effects.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/task-result-authority.ts, src/orchestra/task-settlement-projection.ts, tests/orchestra/acceptance-enforcement-canary.test.ts, tests/orchestra/acceptance-enforcement.test.ts, tests/orchestra/criterion-evaluation.test.ts, tests/orchestra/evaluate-enforcement-gates.test.ts, tests/orchestra/evaluate-trigger-gate.test.ts, tests/orchestra/exact-accepted-result-evaluation-settlement.test.ts, tests/orchestra/exact-accepted-result-terminal-authority.test.ts, tests/orchestra/exact-docker-dispatch-task-authority.test.ts, tests/orchestra/exact-docker-provider-exit-authority.test.ts, tests/orchestra/exact-evaluation-policy-authority.test.ts, tests/orchestra/evaluation-audit-trail.test.ts, tests/orchestra/evaluation-honesty-negative-replay.test.ts, tests/orchestra/result-collector-settlement-authority.test.ts, tests/orchestra/scheduler-spawn-executor.test.ts, tests/orchestra/spawn-backend-docker-mounts.test.ts
- Reads: src/agents/worker-lifecycle.ts, src/agents/worker-rollback.ts, src/cli/helpers/splash.ts, src/core/acceptance-confirmation-contract.ts, src/core/acceptance-matrix.ts, src/core/active-workers.ts, src/core/approval-lifecycle-policy.ts, src/core/audit-writer.ts, src/core/config-types.ts, src/core/config.ts, src/core/confirmation-store.ts, src/core/constants.ts, src/core/event-stream.ts, src/core/execution-effect-persistence-contract.ts, src/core/file-lock.ts, src/core/notify.ts, src/core/plugin-hooks.ts, src/core/production-wiring-contract.ts, src/core/provider-execution-ingress-authority.ts, src/core/provider.ts, src/core/task-attempt-custody-store.ts, src/core/task-result-schema.ts, src/core/task-result-settlement.ts, src/core/task-settlement-authority.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/monitor/auditor.ts, src/orchestra/result-ingress.ts, src/orchestra/rubric-registry.ts
- Dependencies: Task 6, Task 8, Task 9
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/exact-evaluation-policy-authority.test.ts tests/orchestra/exact-docker-provider-exit-authority.test.ts tests/orchestra/exact-accepted-result-evaluation-settlement.test.ts tests/orchestra/exact-accepted-result-terminal-authority.test.ts tests/orchestra/exact-docker-dispatch-task-authority.test.ts tests/orchestra/criterion-evaluation.test.ts tests/orchestra/result-collector-settlement-authority.test.ts tests/orchestra/scheduler-spawn-executor.test.ts tests/orchestra/acceptance-enforcement.test.ts tests/orchestra/acceptance-enforcement-canary.test.ts tests/orchestra/evaluate-enforcement-gates.test.ts tests/orchestra/evaluation-audit-trail.test.ts tests/orchestra/evaluation-honesty-negative-replay.test.ts --reporter=dot

### Description

Thread exact accepted attempt UUID and result/settlement/evaluation digests through general
acceptance decisions and the audit trail. Optional coverage cannot fabricate a terminal NO_GO;
runPolicy/evidence fields cannot disappear between worker result and acceptance. Evaluation may
grade only custody-accepted input.

### goNogo
- goCriteria: 100/100 plus non-applicable optional coverage cannot become false NO_GO; every receipt binds exact attempt and digests; missing/mismatched receipt is HOLD
- nogo: evaluation identity is only sprint/task/numeric attempt; ROUTE is the only branch with attempt identity; worker self-report overrides custody
- techDebtAcceptable: None

## Task 12: T12-CONTROLLER-FANIN — Lifecycle consumes one accepted truth
- Files: exact authority is the latest sidecar `productionByLane.T12` and `mutationSupportByLane.T12`; `SCOPE-REVISION-029-T12-EXACT-LIFECYCLE-PRODUCTION-FANIN` supersedes this task's historical inline file list.
- Reads: src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/orchestra/acceptance-confirmation-composition.ts, src/orchestra/acceptance-confirmation-reconciler.ts, src/orchestra/acceptance-confirmation-service.ts, src/orchestra/acceptance-enforcement.ts, src/orchestra/debt-manager.ts, src/orchestra/evaluation-audit-trail.ts, src/orchestra/recovery-adapters/sprint-recovery-adapter.ts, src/orchestra/repair-queue-authority.ts, src/orchestra/result-evaluator.ts, src/orchestra/result-watcher.ts, src/orchestra/runtime-budget-monitor.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-recovery-operation.ts, src/orchestra/sprint-reporter.ts, src/orchestra/task-artifact-projection.ts, src/orchestra/task-result-authority.ts, src/core/acceptance-confirmation-contract.ts, src/core/acceptance-reconciliation-store.ts, src/core/approval-lifecycle-policy.ts, src/core/confirmation-store.ts, src/core/cross-verify-evidence-broker.ts, src/core/memory-store.ts, src/cli/helpers/splash.ts, src/core/agent-pool.ts, src/core/notify.ts, src/core/plugin-hooks.ts, src/core/skill-pool.ts, src/core/stack-detector.ts, src/monitor/auditor.ts, src/core/execution-recovery.ts, src/cli/helpers/messages.ts, src/core/sprint-types.ts
- Dependencies: Task 7, Task 10, Task 11
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/backends/docker-corrupt-result-recovery.test.ts tests/orchestra/acceptance-authority-restart.integration.test.ts tests/orchestra/acceptance-controller-settlement.test.ts tests/orchestra/execute-fix-quiescence.integration.test.ts tests/orchestra/recovery-truth-nine-case.integration.test.ts tests/orchestra/repair-quiescence-gate.test.ts tests/orchestra/sprint-terminal-settlement-hold.test.ts --reporter=dot

### Description

Replace task-level public result/evaluation replay in controller lifecycle, dependency release,
restart and terminal fan-in with the exact accepted settlement/evaluation receipt. Controller must
not invent attempt/evaluation for never-dispatched work and must drain repair lineage only from
canonical settlement. This lane composes the production chain only; it cannot create a second
terminal decision, evaluation, finalizer or settlement authority beside T11.

### goNogo
- goCriteria: one accepted attempt drives lifecycle; restart/replay is idempotent; corrupt/stale public artifacts cannot change state; quiescence waits for exact unsettled work
- nogo: numeric attempt 1 or largest result is assumed; brainEvaluation:null survives despite durable evaluation; death-sweep or recovery silently publishes false terminal state
- techDebtAcceptable: None

## Task 13: T13-AUTONOMOUS-CUTOVER — Autonomous consumer parity
- Files: src/orchestra/autonomous/execute-dispatcher.ts, tests/integration/task-attempt-custody-cutover.integration.test.ts
- Reads: src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/core/task-settlement-authority.ts, src/core/task-types.ts, src/core/types.ts, src/orchestra/sprint-controller.ts, src/orchestra/task-result-authority.ts
- Dependencies: Task 12
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/integration/task-attempt-custody-cutover.integration.test.ts --reporter=dot

### Description

Make the autonomous execution consumer use the same exact accepted-attempt authority as CLI/MCP/
Sprint. Remove public result writeback as a semantic authority and prove a real cutover lifecycle
without a fixture-local reimplementation.

### goNogo
- goCriteria: autonomous result/settlement/restart identity matches normal execution and public projection is one-way
- nogo: autonomous maintains a duplicate truth source; test-only wrapper receives credit; public result can reopen a settled attempt
- techDebtAcceptable: None

## Task 14: T14-HERMETIC-SEAL — Source verification and post-source proof contract
- Files: scripts/lint-test-hermeticity.mjs, scripts/test-binary-contracts.mjs
- Reads: src/core/task-attempt-custody-store.ts, src/core/task-result-settlement.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/result-ingress.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, DIRECTIVES.md, docs/execution/active/RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001.expected-red.json
- Dependencies: Task 1, Task 2, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 20, Task 21
- Priority: CRITICAL
- Agent: test-guardian
- Test: node scripts/lint-test-hermeticity.mjs && node scripts/test-binary-contracts.mjs && npx tsc --noEmit
- PromotionProof: run/linux node dist/cli/entry.js --version

### Description

Regenerate hermetic fingerprints only from the final source-derived scanner and prove no live repo
authority is touched by tests. Run scoped lane checks and TypeScript after production fan-in. Then
return control to the supervisor: only with no active worker/container run `npm run build`, verify
source/dist identity, exercise compiled CLI and a provider-free networkless real Docker canary, and
perform independent disk/wiring verification. Use Opus-5 XVerify only on bounded evidence if needed.

### goNogo
- goCriteria: zero new hermetic violation; source checks are LOCAL_VERIFIED; quiescent build produces matching dist; compiled CLI and real Docker execute the new custody path; independent verification covers every active upstream lane without promoting deferred T3/T17
- nogo: fingerprint is hand-forged; mock green is closure; build occurs during active execution; old dist is tested; XVerify verdict substitutes for disk/settlement evidence
- techDebtAcceptable: None

## Task 15: TN-ABI — One versioned native custody ABI and fail-closed loader
- Files: native/exec-authority/binding.gyp
- Reads: native/exec-authority/package.json, src/core/task-attempt-custody-store.ts, native/exec-authority/src/custody_posix.c, native/exec-authority/src/custody_win32.c
- Dependencies: Task 1
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/native/exec-authority-native.test.ts tests/core/execution-authority-adapter-parity.test.ts --reporter=dot

### Description

Define one N-API ABI/version/capability manifest, generation-checked opaque handles and a single
typed loader. Preserve the legacy exec-authority surface only through the same loader; arbitrary
object loading, raw-handle authority and path-based fallback are forbidden.
The same ABI exposes one typed `prove-root-separation` operation: a live custody root handle and
canonical project ingress are compared by the platform backend; overlap or alias uncertainty is a
typed failure, never a lexical success.

### goNogo
- goCriteria: exact ABI/platform/features are validated before use; root-separation input/result and handle generation are exact; missing/mismatched binary is typed HOLD; loader/package identity is one authority
- nogo: two semantic native packages; unchecked object accepted as binding; lexical/path-only root separation; raw fd/HANDLE serialized as authority; file-lock keeps a duplicate loader
- techDebtAcceptable: None

## Task 16: TN-POSIX — Descriptor-bound POSIX custody primitives
- Files:
- Reads: native/exec-authority/src/custody_common.h, src/core/task-attempt-custody-store.ts, src/core/task-attempt-custody-posix-adapter.ts
- Dependencies: Task 15
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/native/exec-authority-native.test.ts tests/core/task-attempt-custody-posix-adapter.test.ts --reporter=dot

### Description

Provide no-follow component opens, bounded reads, owner-private proof, descriptor-bound anonymous
publication, atomic no-replace, observable cleanup failure and file+parent durability. Linux may use
`O_TMPFILE`/`linkat(AT_EMPTY_PATH)` only after a real feature probe; unsupported filesystems HOLD.
Project root is opened no-follow as an identity anchor and compared against the pinned custody root
by physical object/ancestor relation; bind-mount or mount-identity ambiguity that cannot be proven
disjoint returns typed HOLD.

### goNogo
- goCriteria: no named-temp swap window; first-writer race is atomic; two-way physical root ancestry is proven; cleanup and directory durability cannot be laundered across retry
- nogo: check-close-unlink; lexical-only root containment; uncertain bind alias accepted; filesystem-name success allowlist; unsafe named fallback; macOS success inferred from Linux
- techDebtAcceptable: None

## Task 17: TN-WIN32 — DEFERRED handle-relative Windows custody primitives
- Files:
- Reads: native/exec-authority/src/custody_common.h, src/core/task-attempt-custody-store.ts, src/core/task-attempt-custody-win32-adapter.ts
- Dependencies: Task 15
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/native/exec-authority-native.test.ts tests/core/task-attempt-custody-win32-adapter.test.ts --reporter=dot

### Description

Frozen common/Win32 foundation source korunur, fakat bu task mevcut recovery'nin aktif fan-in'inde
değildir ve bu hostta yeni Windows mutation/closure üretmez. Trusted pre-load bootstrap, gerçek
Windows compile/install/runtime ve adapter audit residual'ları
`RECOVERY-BORN-711-WINDOWS-NATIVE-CUSTODY-PROOF-001` altında kapanır. Volume veya primitive
uncertainty typed HOLD kalır.

### goNogo
- goCriteria: volume/file identity, reparse tag, owner SID, protected DACL and flush evidence are native-readback-bound
- nogo: POSIX mode presented as DACL; path reopen; best-effort ACL; Linux simulation presented as Windows-native proof
- techDebtAcceptable: None

## Task 18: TN-LEASE-CONTRACT — Opaque single-use mount and publication custody
- Files:
- Reads: src/core/exec-authority-native.ts, src/core/task-result-settlement.ts, src/orchestra/spawn-backend-docker.ts
- Dependencies: Task 1, Task 15, Task 16
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-attempt-custody-store.test.ts --reporter=dot

### Description

Remove public `sourcePath` authority. Store carries only opaque, generation-fenced, single-use mount
leases and descriptor-bound publication sessions. A retained `/proc/<pid>/fd/N` string, cleanup
uncertainty or post-seal receipt failure cannot be replayed into success.
Platform adapter↔trusted backend callback arasında kaçınılmaz geçici host path yalnız daemon
create/mount invocation'ı içinde hint'tir: lease değildir, durable receipt'e yazılmaz ve tek başına
`CONSUMED` üretemez. Başarı exact daemon-mounted identity/access readback'inden türetilir.
Fresh T2 audit nedeniyle bu task'ın Store receipt scope'u kontrollü biçimde yeniden açıldı:
successful Docker transfer receipt'i backend/container/image/label, task-snapshot mount,
worker-output mount ve trusted bootstrap probe evidence digest'lerini exact taşır; transfer digest
bu alanlardan Store tarafında canonical olarak türetilir. `CLEANUP_UNCONFIRMED` aynı exact shape'te
yalnız bilinen nullable evidence + zorunlu cleanup digest taşır; source path asla receipt alanı değildir.

### goNogo
- goCriteria: lease consumption is exact-once, non-serializable and adapter/backend-owned; successful mount receipt carries exact backend execution/image/label/mount/probe evidence and Store-derived transfer digest; abort/cleanup state is monotonic and observable
- nogo: ambient source path becomes durable authority; adapter/backend arbitrary digest is accepted as transfer truth; fd-number reuse retargets authority; cleanup fault returns SEALED/success
- techDebtAcceptable: None

## Task 19: TN-PACKAGE — Installed-product native delivery
- Files: native/exec-authority/package.json, package.json, package-lock.json (delete), npm-shrinkwrap.json (add/canonical), .gitignore, Dockerfile, docs/post-product/OPERATIONAL-FABRIC-IFS.md, scripts/script-registry.json, scripts/build.mjs, scripts/build-exec-authority-native.mjs, scripts/npm-shrinkwrap-contract.mjs, scripts/release-prepare.mjs, scripts/security/secret-baseline.mjs, scripts/verify-packed-networkless-install.mjs, scripts/copy-assets.mjs, scripts/validate-publish.mjs, scripts/pack-baseline.json, scripts/xplat-install-smoke.mjs, src/cli/worktree-binary-authority.ts, src/orchestra/scope-sanitizer.ts
- Reads: native/exec-authority/package.json, src/core/exec-authority-native.ts, scripts/platform-probe/exec-authority-capability-probe.mjs
- Dependencies: Task 15, Task 16, Task 18
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/release/validate-publish-pack.test.ts tests/release/packed-install-contract.test.ts tests/release/npm-pack-whitelist.test.ts tests/scripts/build-identity.test.ts tests/cli/pack-size-budget.test.ts --reporter=dot

### Description

Build and ship the exact platform binary/source payload under the root package contract. Published
dependency resolution has one authority: root `npm-shrinkwrap.json`; a root `package-lock.json`,
missing/ambiguous packed lock, stale lock identity or ambient/shared-cache-only offline success is
NO_GO. Fresh private cache network-enabled hydration → network-disabled global tarball install →
installed shrinkwrap digest → native lifecycle receipt zinciri birlikte kanıtlanır. A repo-local
addon that disappears from `npm pack`, loads an unverified ABI or needs an undocumented manual build
is not product wiring. Build-source identity producer ve compiled-CLI runtime twin'i aynı native
source setini ölçer; bunlardan yalnız birini değiştirmek ayrı doğruluk kaynakları üretir ve NO_GO'dur.

### goNogo
- goCriteria: canonical shrinkwrap is the only root lock and ships byte/digest-exact; fresh prewarmed-cache networkless real Linux installed tarball and current WSL2 host resolve the declared ABI/capabilities; pack and build identity attest them; macOS/Windows remain separate residuals
- nogo: root `files` omits native payload; `describe.runIf`/skip makes absent binary green; install silently compiles or downloads unpinned code
- techDebtAcceptable: None

## Task 20: TN-PROOF-SEAL — Cross-platform native and package proof matrix
- Files: .github/workflows/ci.yml, .github/workflows/coverage.yml, .github/workflows/cross-platform-e2e.yml, .github/workflows/dashboard-build.yml, .github/workflows/publish.yml, .github/workflows/release.yml, tests/workflows/cross-platform-e2e.test.ts, tests/github/workflows/release.test.ts, tests/github/ci-workflow.test.ts, tests/release/validate-publish-pack.test.ts, tests/release/packed-install-contract.test.ts, tests/release/npm-pack-whitelist.test.ts, tests/release/release-prepare.test.ts, tests/release/dep-bump-audit.test.ts, tests/scripts/build-identity.test.ts, tests/scripts/build-lifecycle.test.ts, tests/scripts/npm-shrinkwrap-contract.test.ts, tests/scripts/verify-packed-networkless-install.test.ts, tests/cli/pack-size-budget.test.ts, tests/e2e/install-matrix/fresh-install.test.ts, tests/e2e/npm-pack-smoke.test.ts, tests/docker/dockerfile.test.ts, tests/security/docker-context-deck.test.ts, tests/orchestra/prompt-gate-scope-wiring.test.ts, tests/orchestra/scope-sanitizer-v2.test.ts
- Reads: native/exec-authority, src/core/exec-authority-native.ts, src/core/task-attempt-custody-store.ts, src/core/task-attempt-custody-posix-adapter.ts, src/core/task-attempt-custody-win32-adapter.ts, src/core/file-lock.ts, src/core/config.ts, src/core/constants.ts, src/core/agent-types.ts, src/core/scope-gate.ts, src/core/task-types.ts, src/cli/worktree-binary-authority.ts, src/orchestra/tmux.ts, src/orchestra/prompt-gate.ts, src/orchestra/prompt-god-template.ts, src/orchestra/scope-sanitizer.ts, src/orchestra/task-builder.ts, package.json, scripts/validate-publish.mjs
- Dependencies: Task 2, Task 19
- Priority: CRITICAL
- Agent: test-guardian
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/native/exec-authority-native.test.ts tests/core/execution-authority-adapter-parity.test.ts tests/core/task-attempt-custody-posix-adapter.test.ts tests/core/task-attempt-custody-win32-adapter.test.ts tests/release/validate-publish-pack.test.ts tests/release/packed-install-contract.test.ts tests/release/npm-pack-whitelist.test.ts tests/workflows/cross-platform-e2e.test.ts tests/github/workflows/release.test.ts --reporter=dot

### Description

Pin the three active proof cells separately: fresh private prewarmed-cache networkless real Linux
installed-package, current WSL2
native host and WSL2-hosted real Docker Engine canary. Remote macOS and Windows-native are no longer
dependencies of this recovery; they remain explicit MASTER residuals and no skipped/simulated row is
promoted to native success. Docker Engine mount consumption is owned by Task 5 and cannot be closed
by package/native checks alone.

### goNogo
- goCriteria: Linux installed-package receipt binds source, packed and installed shrinkwrap digest plus private-cache hydration/offline-install mode; WSL2 native and WSL2 Docker rows each carry real proof or exact typed HOLD; installed tarball cannot pass with binding absent; deferred platform rows are not promoted here
- nogo: CI quota red treated as product failure or ignored as success; simulation/native conflation; foundation claims Docker-daemon custody
- techDebtAcceptable: None

## Task 21: T5E-EXACT-EFFECT-CONTAINMENT — Attempt-private workspace, complete effect truth and transactional landing
- Files: src/core/execution-effect-containment.ts, src/core/execution-effect-persistence-contract.ts, src/orchestra/execution-effect-landing-coordinator.ts, src/orchestra/execution-effect-docker-lifecycle.ts, src/orchestra/execution-effect-lock-adapter.ts, src/orchestra/execution-effect-native-adapter.ts, src/orchestra/execution-effect-store-adapter.ts, src/core/execution-write-scope-policy.ts, src/core/task-attempt-custody-store.ts, src/core/task-attempt-custody-posix-adapter.ts, src/core/task-attempt-custody-win32-adapter.ts, src/core/task-result-schema.ts, src/core/task-result-settlement.ts, src/core/file-lock.ts, src/core/exec-authority-native.ts, src/orchestra/result-ingress.ts, src/orchestra/execution-landing-coordinator.ts, native/exec-authority/index.mjs, native/exec-authority/src/exec_authority.c, native/exec-authority/src/custody_common.h, native/exec-authority/src/custody_posix.c, native/exec-authority/src/custody_win32.c, scripts/platform-probe/exec-authority-capability-probe.mjs, scripts/verify-exec-authority-native-package.mjs, tests/core/execution-effect-containment.test.ts, tests/core/execution-effect-persistence-contract.test.ts, tests/orchestra/execution-effect-landing-coordinator.test.ts, tests/orchestra/execution-effect-docker-lifecycle.test.ts, tests/orchestra/execution-effect-lock-adapter.test.ts, tests/orchestra/execution-effect-native-adapter.test.ts, tests/orchestra/execution-effect-store-adapter.test.ts, tests/orchestra/exact-docker-effect-containment.test.ts, tests/core/execution-write-scope-policy.test.ts, tests/core/task-attempt-custody-store.test.ts, tests/core/task-attempt-custody-posix-adapter.test.ts, tests/core/task-attempt-custody-win32-adapter.test.ts, tests/core/task-result-schema.test.ts, tests/core/task-result-settlement.test.ts, tests/core/task-execution-fence.test.ts, tests/core/execution-authority-adapter-parity.test.ts, tests/native/exec-authority-native.test.ts, tests/orchestra/spawn-backend-docker.test.ts, tests/orchestra/execution-landing-coordinator.test.ts, tests/orchestra/docker-restart-reconcile.test.ts
- Reads: src/agents/landing-proposal-entry.ts, src/core/execution-landing-checkpoint.ts, src/core/execution-landing-context.ts, src/core/execution-landing-proposal.ts, src/orchestra/execution-continuation-runner.ts, src/orchestra/sprint-spawner.ts, src/orchestra/task-builder.ts, src/cli/commands/run.ts, src/cli/commands/spawn.ts, src/mcp/tools/run.ts, src/orchestra/task-mode-runner.ts, scripts/lint-test-hermeticity.mjs, scripts/test-binary-contracts.mjs
- Dependencies: Task 5, Task 15, Task 16, Task 18
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-effect-containment.test.ts tests/core/execution-effect-persistence-contract.test.ts tests/core/execution-write-scope-policy.test.ts tests/core/task-attempt-custody-store.test.ts tests/core/task-result-schema.test.ts tests/core/task-result-settlement.test.ts tests/core/task-execution-fence.test.ts tests/core/execution-authority-adapter-parity.test.ts tests/native/exec-authority-native.test.ts tests/orchestra/execution-effect-landing-coordinator.test.ts tests/orchestra/execution-effect-lock-adapter.test.ts tests/orchestra/execution-effect-native-adapter.test.ts tests/orchestra/exact-docker-effect-containment.test.ts tests/orchestra/spawn-backend-docker-mounts.test.ts tests/orchestra/spawn-backend-docker.test.ts tests/orchestra/execution-landing-coordinator.test.ts tests/orchestra/docker-restart-reconcile.test.ts --reporter=dot

### Description

Replace normal Docker's canonical-root RW bind with an exact attempt-private workspace snapshot.
The provider sees only that private workspace plus the already attempt-private task/output mounts;
canonical `main`, project `.tasks`, `.locks`, `.brain` and `.deckent` are never writable worker
surfaces. After provider exit, host-owned discovery compares the full private baseline/final tree
independently of worker `filesChanged`, classifies every add/modify/delete/rename and metadata/link
effect against exact `filesWrite`, and quarantines the whole attempt on any unexpected, protected,
ambiguous or unsupported effect.

Only a structurally attributed, policy-approved manifest may reach canonical `main`. Landing uses an
exact lease, file/parent preimage CAS, no-follow platform operations and a durable
`PREPARED → APPLYING → COMMITTED` journal with crash reconciliation and immutable receipt. Allowed
subset salvage, shared-root fallback, per-file RW bind, hidden out-of-scope mutation, last-writer-wins
or worker-authored success are forbidden. WSL2/ext4 is the active real-proof adapter; macOS and
Windows-native remain typed `UNSUPPORTED/HOLD` without fabricated success.

### goNogo
- goCriteria: worker has no writable canonical-root path; full host effect manifest catches reported and hidden writes; empty filesWrite is read-only; unexpected effect quarantines the whole attempt; exact preimage CAS and durable journal make multi-file landing crash-reconcilable; only committed landing receipt can set diskVerified/accepted effect truth
- nogo: shared project RW mount survives; git diff or worker filesChanged is complete authority; allowed files are partially salvaged after an unexpected effect; symlink/hardlink/case alias is guessed; landing writes without exact lease/preimage/journal; unsupported platform becomes success
- techDebtAcceptable: None
