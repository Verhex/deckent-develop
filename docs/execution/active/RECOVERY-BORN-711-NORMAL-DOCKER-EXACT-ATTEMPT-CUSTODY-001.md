# RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001

OUTCOME_ID: RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001
DOGFOOD_MODE: ON
DOGFOOD_HEALTH: DEGRADED
RECOVERY_SEAM: ADR-D-007
BASE_SHA: 33b0f04919ae413e0e3d607a9e8abe265a8eee54
BRANCH: main
WORKSPACE_MODE: MAIN
PARENT_MASTER_ID: RECOVERY-DOGFOOD-BORN-001
GOAL_ID: 01a04ec7-f611-7ae0-a6cc-5b433d785cd9
OWNER_DECISION_REF: owner-live-2026-08-30-motor-a-sequence-and-execution

## Sonuç

Normal Docker execution'da task admission, exact attempt, worker output, provider capture,
result acceptance, evaluation, finalizer, settlement, archive ve restart tek host-private custody
zincirine bağlanır. Project `.tasks` yalnız compatibility/observability projection'ıdır; billing,
verdict, accepted attempt veya terminal truth authority'si değildir.

Dogfood sonucu da aynıdır: Sprint 711–713'te görülen stale/sibling result, evaluation-attempt
ayrışması, gereksiz FIX ve false terminal karar sınıfları motor seviyesinde kapanır. Bu bounded
recovery tamamlanıp yeni compiled Docker canary ile kanıtlanmadan sonraki implementation outcome'u
Deckent dogfood'a verilmez.

## Admission snapshot — 2026-08-30

- `main` ve `origin/main`: `33b0f04919ae413e0e3d607a9e8abe265a8eee54`.
- Admission öncesi Motor A product-source değişikliği yoktur.
- Korunacak dirty truth:
  - `follow-up-works/current-flow.md`: supervisor continuity projection.
  - `.deckent/provider-execution-observations.db`: owner-authorized Opus-5 XVerify communication
    canary'sinin tracked runtime observation yazımı; Motor A kapsamı dışıdır.
- Aktif Deckent worker/coordinator/container ölçülmedi.
- Fresh scope-revision ölçümünde `.deckent/bot.pid` PID `2898110`, canlı
  `dist/cli/entry.js bot listen` process'ine bağlıdır. Aktif execution worker/coordinator/container
  yoktur. Bu recovery botu kendiliğinden durdurmaz, başlatmaz veya yeniden bağlamaz.
- Sprint 711, 712 ve 713 terminal truth'u `ABORTED`; cleanup kalıntıları `HOLD` olarak korunur.
- `.brain/memory.db` ve `.tasks` elle mutate/silinmez.
- Standalone XVerify canary Opus-5 kanalını gerçek execution ile doğruladı; receipt
  `cross-verify-verdict:sha256:94a6b1b0d6b651eacd24dcdd252a63219d25250827de3bcd2c3f41c72081f093`.
  Bu yalnız channel evidence'dır, Motor A verification veya closure değildir.

## Authority

- Ana scope/order ve implementation yetkisi:
  `owner-live-2026-08-30-motor-a-sequence-and-execution`.
- T2/T3 önündeki tek versioned native ABI, platform-separated POSIX/Win32 implementation,
  installed-package ve native proof scope expansion yetkisi:
  `owner-live-2026-08-31-option-a-shared-native-foundation`. Bu karar T5 Docker-daemon tüketim
  kanıtını native foundation'a taşımaz.
- Platform-proof fan-in kararı: `owner-live-2026-08-31-wsl-linux-first`. Aktif recovery kapanışı
  Linux installed-package, current WSL2 native host ve WSL2-hosted real Docker canary'den oluşur.
  macOS ile Windows-native ayrı owner-admitted MASTER residual'ıdır; common ABI/platform sınırı
  korunur fakat bu iki platform aktif fan-in'i bloklamaz veya simülasyonla başarılı sayılmaz.
- Published dependency authority kararı:
  `owner-live-2026-09-01-option-a-canonical-shrinkwrap`. Root `npm-shrinkwrap.json` yayımlanan tek
  canonical dependency lock'tır; root `package-lock.json` kaldırılır. Dashboard ve Desktop kendi
  bağımsız `package-lock.json` dosyalarını korur. T19/T20 scope'u CI/release/build identity,
  publish gate, installed verifier ve fresh-cache hydration sonrası network-disabled global-install
  receipt zincirini birlikte taşıyacak biçimde genişletilmiştir. İkinci root lock projection'ı yoktur.
- T5 landing/continuation custody scope kararı:
  `owner-live-2026-09-01-continue-t5-exact-landing-custody`. Fresh disk denetimi durable landing
  ve continuation contractlarının public `.tasks/...result` yolu ile generic `spawn()` fallback'ına
  bağlı kaldığını kanıtladı. T5 kapsamına path-free structured custody ref için
  `execution-landing-checkpoint`, `execution-landing-context`, `execution-landing-proposal`,
  `landing-proposal-entry` ve üç doğrudan test yüzeyi eklendi. Historical V1 migration T10'da
  kalır; normal Docker fallback yetkisi üretmez.
- T5 exact-effect containment scope kararı:
  `owner-live-2026-09-01-scope-revision-009-t5-exact-effect-containment`. Normal Docker worker
  canonical root `main` ağacını yazılabilir görmez; exact attempt-private workspace, complete
  host-computed effect manifesti, whole-attempt unexpected-effect HOLD'u ve journaled CAS landing
  T5E üzerinden T6/T7 önüne eklenmiştir. Bu karar genel RBAC/tool-gateway işi, macOS/Windows-native
  başarı kanıtı, build, commit, push, kill/cleanup veya auth mutation yetkisi üretmez.
- T5 exact-effect fan-in manifest düzeltmesi:
  `owner-live-2026-09-01-continue-t5-exact-effect-containment`. Task 21'de deklare edilip revision
  009 sidecar'ında eksik kalan üç production ve dört direct-test yolu eklendi; ortak V2 settlement
  fixture yazarlığı T1'den T5E'ye devredildi. Bu revision yeni ürün kapsamı üretmez.
- T5 production adapter ayrımı:
  `SCOPE-REVISION-011-T5-EXACT-EFFECT-PRODUCTION-ADAPTERS`. Docker volume lifecycle ve
  Store-backed journal/publication bridge'i ayrı dar adapterlardır; mevcut shared authority'leri
  tüketir, ikinci manifest/lock/workflow authority'si üretmez.
- T6 normal producer cutover scope kararı:
  `owner-live-2026-09-01-continue-t6-normal-producer-cutover`. Fresh T5E denetiminde exact recovery
  HOLD'larının yalnız debug kaydında kalabildiği ve normal Sprint'in backend/collector/controller
  zincirinin mevcut T6 scope'una sığmadığı kanıtlandı. `SCOPE-REVISION-013` bu production yüzeylerini
  T6'ya devreder; caller-visible typed HOLD, initial+queued tek executor ve branded accepted-result
  collector fan-in'i aynı closure task'ında kapanır. Public `.tasks` authority olmaz.
- T7 task-ingress authority scope kararı:
  `owner-live-2026-09-01-harika-devam`. Fresh ingress audit'i T6'nın exact dispatch receipt'lerini
  caller'a kayıpsız taşımadan CLI/MCP/task-mode parity kurulamayacağını kanıtladı.
  `SCOPE-REVISION-014`, T7'yi T6'ya dependency-bound yapar; CLI run/spawn, MCP run ve task-mode
  aynı application authority'sini kullanır. Existing public task yalnız digest/CAS-bound input
  projectionıdır; raw `.result`, V1 settlement ve MCP job state exact başarı authority'si değildir.
- T6 exact-plan projection scope kararı:
  `owner-live-2026-09-01-harika-devam`. `SCOPE-REVISION-015`, exact plan doğrulamasını task
  publicationından ayırır. Exact Docker planı tüm görevleri start öncesi public `.tasks` altına
  yazamaz; fresh projection task bazında RELEASED sonrasında no-clobber yayımlanır, existing
  projection ise stable/no-follow digest + CAS dışında değiştirilemez.
- T6 callback fan-in scope kararı:
  `SCOPE-REVISION-016`, start/autonomous/process-runtime adapterlarının deferred materialization
  sonucunu controller'a kayıpsız döndürmesini zorunlu kılar. Void callback ile exact Docker
  dispatch açılmaz.
- T7 bağımsız audit closure scope kararı:
  `owner-live-2026-09-01-harika-devam`. `SCOPE-REVISION-017`, exact zero-work/reconciliation
  receipt'lerinin yüzeylere kayıpsız taşınması, composition-root authority injectionı,
  host-adapter precedence, concurrent-writer-safe projection ve MCP job truth eksiklerini aynı T7
  closure sınırına alır. T4'teki settlement authority tek-yazıcı olarak T7'ye devredilir; bu karar
  T8, build, runtime veya yeni outcome admissionı değildir.
- T7 compile fan-in scope kararı:
  `SCOPE-REVISION-018`, MCP transport enum'unun provider-truth validator'ında ve zorunlu
  disposition metadata'sının eski observability testinde aynı anlamı taşımasını sağlar. Bu yalnız
  revision 017'nin doğrudan compile tüketicisidir; T8 veya runtime admissionı açmaz.
- T7 production-consumer closure scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. `SCOPE-REVISION-019`, gerçek CLI `spawn`
  provider-authority lifecycle'ını, autonomous/process exact-result tüketicilerini ve dört doğrudan
  testi T7'ye bağlar. `src/orchestra/autonomous/execute-dispatcher.ts` current tek-yazıcı olarak
  T13'ten T7'ye devredilir; T13 yalnız kapanmış contractı downstream tüketir. CLI reconciliation
  evidence'ı ve MCP host-decision anlamı aynı closure'a dahildir. Bu revizyon T8, build, runtime,
  dogfood run veya closure authority üretmez.
- T7 reconciliation durability scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. Fresh bağımsız audit'in tek kalan blocker'ı için
  `SCOPE-REVISION-020`, `src/orchestra/autonomous/backlog-types.ts` yolunu T7'ye ekler. Exact
  task-ingress `not-dispatched` ve `reconciliation-required` receipt/evidence'ı generic hata metnine
  indirgenemez; belirsiz dispatch durable structured kanıtla `parked` kalır. T8/runtime yetkisi açılmaz.
- T8 private-settlement cutover scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. Fresh bağımsız source audit'in iki blocker'ından
  settlement-sonrası public result mutationını kapatmak için `SCOPE-REVISION-021`,
  `src/core/xverify-task-settlement.ts`, `src/cli/commands/xverify.ts` ve iki doğrudan kanıt dosyasını
  T8'e ekler. Exact XVerify sonucu yalnız verifier attempt'ına bağlı host-private immutable receipt'te
  kalır; CLI typed HOLD detail'i runner sonucundan tüketir. Bu revizyon build, live provider call,
  runtime veya dogfood yetkisi üretmez.
- T8 tracked settlement-contract scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. Revision 021 sonrası fresh bağımsız audit'in
  bulduğu batarya-dışı stale public-result testi için `SCOPE-REVISION-022`,
  `tests/orchestra/cross-verify-task-settlement.test.ts` dosyasını T8'e ekler. Test yalnız gerçek
  attempt claim/closure ve host-private immutable receipt sözleşmesini kanıtlayabilir; public
  `.result` projectionına geri dönemez. Bu revizyon build, live provider call, runtime veya dogfood
  yetkisi üretmez.
- T9 exact repair-birth scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. `SCOPE-REVISION-023`, collector içindeki exact
  terminal authority parser'ını tek ortak contracta taşır ve T9'a evidence-changed FIX/XFIX birth
  authority modülleri ile doğrudan testlerini ekler. Collector T6'dan T9'a yalnız bu parser fan-in'i
  için devredilir. T10/T11 producer zinciri bağlanmadan bu foundation production-complete, runtime
  veya dogfood authority sayılmaz.
- T10/T11/T12 authority-ordering scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. Fresh boundary audit'in bulduğu ters producer /
  consumer dependency'si için `SCOPE-REVISION-024`, canonical sırayı `T9 -> T11 -> T10 -> T12`
  yapar. T11 tek immutable terminal decision/evaluation/finalizer/settlement producer'ı, T10 exact
  checkpoint/resume/finalize/archive tüketicisi, T12 yalnız production composition/fan-in katmanıdır.
  `sprint-controller`, `sprint-phases`, `sprint-spawner` T6'dan; `result-collector` T9'dan T12'ye
  devredilir ve `sprint-lifecycle` T12'ye eklenir. Bu revizyon build, runtime veya dogfood yetkisi
  üretmez.
- T11 exact evaluator-input scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. Producer implementation sırasında fresh audit,
  caller/public `Task` ile dışarıda üretilmiş `EvaluationResult`ın exact terminal receipt basabileceğini
  buldu. `SCOPE-REVISION-025`, `task-result-authority.ts` dosyasını T4'ten T11'e devreder ve
  `result-evaluator.ts` dosyasını T11'e ekler. Karar yalnız Store-inspected V2 result, admission
  snapshot task material ve canonical rubric evaluator girdisinden doğabilir; T12 wiring/build/runtime
  yetkisi açılmaz.
- T11 canonical dispatch-task authority scope kararı:
  `owner-live-2026-09-02-continue-after-checkpoint`. Fresh parser audit'i, T11'in valid Task içindeki
  array alanlarını reddettiğini; Docker parserının ise zorunlu Task alanlarını tam doğrulamadan ve
  unknown alanları sessiz düşürerek ikinci bir doğruluk kaynağı oluşturduğunu buldu.
  `SCOPE-REVISION-026`, policy-resolved canonical JSON bounds kullanan tek ortak dispatch-task
  authority parserını T11'e ekler. `spawn-backend-docker.ts`, exact terminal authority/type yönü ve
  doğrudan parser/result fixture testleri T11'e devredilir. T12 wiring/build/runtime yetkisi açılmaz.
- T11 exact evaluation-settlement proof scope kararı:
  `owner-live-2026-09-02-continue-main-after-side-session-prompt`. Owner ana recovery akışına devam
  yetkisini korurken `SCOPE-REVISION-027`, accepted-result'tan Store-owned evaluation, finalizer ve
  settlement üreten exact producer'ın ayrı negatif/replay testini T11 support kapsamına ekler.
  Caller-supplied result/evaluation receipt girdisi değildir; yarım publication aynı deterministic
  artifact ve chain üzerinden benimsenir. T12 wiring/build/runtime yetkisi açılmaz.
- T11 durable policy/provider/effect fan-in scope kararı:
  `owner-live-2026-09-02-continue-main-after-side-session-prompt`. Fresh source/wiring audit;
  mutable caller config/rubric/exit/project-root girdilerini, Store'daki provider-exit/effect
  kanıtını tüketmeyen yolu ve production-wiring kapısının sessiz atlanmasını blocker olarak doğruladı.
  `SCOPE-REVISION-028`, dispatch-frozen evaluation policy, Store-owned provider-exit authority ve
  manifest-temelli criterion adapterını T11'e ekler; scheduler/collector sınırlarını geçici olarak
  T11'e devreder. Missing/corrupt/sibling/replay evidence başarı değil typed HOLD'dur. T12 gerçek host
  wiring kanıtını üretir; T11 karar authority'sini paylaşmaz. Build/runtime/dogfood yetkisi açılmaz.
- T12 exact lifecycle/production fan-in scope kararı:
  `owner-live-2026-09-02-continue-main-after-side-session-prompt`. İki fresh bağımsız audit;
  controller'ın T11 settler/revalidator portlarını enjekte etmediğini, registry'nin tam terminal
  receipt yerine gevşek verdict tuttuğunu, restart/checkpoint/FIX/RETRO/pause-resume yollarının
  public authority'ye dönebildiğini ve production-wiring'in durable host observation üreticisi
  olmadığını doğruladı. `SCOPE-REVISION-029`, backend-owned opaque reader → T11 settlement/reread
  bridge'ini, tam terminal authority registry'sini, exact checkpoint/finalizer fan-in'ini ve gerçek
  consumer gözlemi yokken fail-closed kalan attempt-bound host wiring receipt'ini T12'ye bağlar.
  Build, WSL2 runtime canary ve dogfood admissionı bu revizyonla açılmaz.
- T12 real-Store fixture scope kararı:
  aynı owner continuation authority altında `SCOPE-REVISION-030`, production-wiring positive
  roundtrip'ının mock yerine accepted-only gerçek custody fixture'ında kurulması için yalnız
  `tests/helpers/task-result-settlement-v2-fixture.ts` yolunu T11'den T12'ye devreder. Production
  path/count değişmez; sahte green kabul edilmez.
- T12 real-host-proof scope kararı:
  `owner-live-2026-09-02-approve-scope-revision-031-real-host-proof`. Fresh independent audit,
  mevcut observer'ın normal factory tarafından compose edilmediğini ve gerçek canonical
  consumer/ingress/enablement/proof-target çalışmasını gözlemlemediğini doğruladı.
  `SCOPE-REVISION-031`, digest-bound plan proof programı, shell-free/secret-free bounded platform
  runner'ı, normal production composition ve accepted-attempt/effect-bound durable receipt için
  exact path authority'sini T12'ye açar. Worker/plan evidenceRef echo'su, ambient env, unbounded
  output, blind retry ve unsupported platform success'i yasaktır. Build/runtime/dogfood yetkisi
  açılmaz.
- T12 canonical host-proof harness scope kararı:
  `owner-live-2026-09-02-approve-scope-revision-032-canonical-host-proof-harness`. Rev031 runner
  audit'i, repoda gerçek ürün yüzeyini gözleyerek versioned structured outcome üreten immutable
  trusted harness bulunmadığını doğruladı; yalnız test fixture'ları authority değildir.
  `SCOPE-REVISION-032`, yalnız canonical harness scripti ve doğrudan testine authority açar.
  Harness plan hedeflerini echo edemez, arbitrary command/shell çalıştıramaz ve yalnız allowlisted
  read-only adapterlardan gerçek surface/receipt observation kabul eder. Yeni domain adapterı ayrıca
  owner-admitted asset olmadan eklenemez; build/runtime/dogfood yetkisi açılmaz.
- T13 exact-result consumer projection scope kararı:
  `owner-live-2026-09-02-approve-scope-revision-033-t13-exact-result-consumer-projection`.
  Planned integration proof, normal exact registry'nin Store-verified V2 sonucu `TaskResult` diye
  cast ettiğini; autonomous consumerın attempt metadata'sını kaybettiğini ve public-result dışı
  doğru byte'ları legacy evaluator biçiminde tüketemediğini doğruladı. `SCOPE-REVISION-033`,
  `task-result-authority`, `scheduler-effects`, `process-runtime`, autonomous dispatcher ve dört
  doğrudan support testinin writer authority'sini T13'e devreder. Tek canonical projection exact
  identity/digest metadata'sını taşır; metadata'sız exact success ve fixture-local dönüşüm
  yasaktır. T14/build/runtime/dogfood yetkisi açılmaz.
- Main workspace tercihi owner'ın canlı kararıdır; bu recovery `/tmp` veya eksik kopyada değil,
  root `main` üzerinde yürür.
- Source tamamlanıp runtime quiescent olduğunda `npm run build`, source/dist parity ve compiled
  proof yetkisi: `owner-live-2026-08-30-post-source-build`.
- Gerektiğinde different-provider XVerify ve Opus-5 channel kullanımı:
  `owner-live-2026-08-30-opus5-xverify-channel`. Exact provider/model yine registry, tier,
  reachability, auth ve limit evidence ile çözülür; unavailable durumda same-provider fallback yoktur.
- Commit/push, bot restart, kill/cleanup, auth mutation, destructive action ve authenticated Closure
  OS signing bu capsule tarafından yetkilendirilmez.

## Exact scope

Full path/baseline authority:
`RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001.expected-red.json`.

- Production: 90 unique path; son scope-revision anında 88 present, 2 absent.
- Test/script conditional mutation allowlist: 244 unique path; son scope-revision anında 240
  present, 4 absent. Önceki revision'ların tarihsel presence kayıtları değiştirilmedi.
- Governance transaction: `DIRECTIVES.md`, `docs/MASTER-PLAN.md`, iki generated projection,
  bu capsule, expected-red sidecar ve `follow-up-works/current-flow.md`.
- Her implementation path tam bir task lane'inin tek writer'ına aittir. Allowlist'te bulunmak dosyayı
  değiştirme zorunluluğu değildir.

## Değişmez custody kuralları

1. Host-private immutable task snapshot ve attempt output root, claim/attempt publication'dan önce
   doğar; crash sıra tersine çeviremez.
2. Normal Docker backend task authority'yi public `.tasks/task-<id>.json` üzerinden yeniden okuyamaz.
3. Her attempt container içinde ayrı `/workspace/.tasks` worker-output mount'u görür; project ortak
   `.tasks` container'a görünmez. Task snapshot ayrı read-only bind'dır.
4. Normal Docker worker canonical project root'u hiçbir mount veya handle üzerinden yazılabilir
   görmez. `/workspace` exact attempt-private snapshot/staging volume'üdür; shared-main RW mount,
   per-file RW bind veya worker-authored diff authority değildir.
5. Result, partial, timeout, log ve IPC artifacts bounded regular-file, no-follow, link-count,
   inode/device ve size doğrulamasından sonra first-writer capture edilir.
6. Pristine provider stream host-private first-writer'dır; public log billing/verdict authority'si
   olamaz. Terminal billing yalnız tamamlanmış final capture'dan doğar.
7. Settlement exact accepted attempt + result digest + evaluation receipt + finalizer/archive
   digestlerini zincirler. Public fallback semantic enrichment yapamaz.
8. Restart/adoption exact attempt ref, private claim/dispatch/container label ve private artifact
   üzerinden çözülür. Completed-checkpoint recovery result içi self-report'tan COMPLETE üretemez.
9. Eski/geç attempt CAS generation fence olmadan yeni public projection'ı ezemez.
10. Hiç dispatch edilmemiş task attempt/evaluation üretmez.
11. Değişmeyen failure fingerprint'i yeni FIX/XFIX doğuramaz; retry finite ve evidence-changed'dır.
12. Attempt-private workspace'in baseline/final full manifesti worker result'ından bağımsız çıkarılır.
    Scope dışı, protected, belirsiz link/alias veya unsupported filesystem effect'i whole-attempt
    landing'i HOLD eder; allowed subset otomatik kurtarılmaz.
13. Canonical landing exact lease, preimage/parent CAS ve durable
    `PREPARED → APPLYING → COMMITTED` journal üzerinden yürür; crash false success üretemez.
14. Aktif Linux/WSL2 adapterı no-follow + durable first-writer uygular. macOS ve Windows-native
    adapterları common ABI sınırında fail-closed kalır; gerçek platform kanıtı ayrı MASTER
    residual'larında kapanmadan success üretmez.
15. Açık/belirsiz private custody artifact'ı cleanup/retention tarafından silinmez.

## Dependency DAG

21 node envanterde korunur; T3 ve T17 ayrı Windows-native residual'ına devredildiği için aktif
recovery fan-in'i 19 node'dur:

1. **T1 Custody kernel** — result schema ve settlement contractı.
2. **T15 Native ABI** — T1 sonrası tek versioned ABI, opaque handle ve fail-closed loader.
3. **T16 POSIX native primitives** — T15 sonrası Linux/WSL2 implementationı.
4. **T18 Opaque lease contract** — T1, T15 ve T16 sonrası; Store'un tek write authority'si.
5. **T2 POSIX adapter** — T1, T16 ve T18 sonrası.
6. **T19 Installed-product native delivery** — T15, T16 ve T18 sonrası.
7. **T20 Active proof seal** — T2 ve T19 sonrası; Linux installed-package ile current WSL2
   native proof'u ayrı ölçer. Docker daemon-consumption success'ini kendi adına yazamaz.
8. **T4 Exact ingress/settlement consumers** — T1, T2 ve T20 sonrası.
9. **T5 Docker physical custody** — T4 sonrası; Linux Docker Engine daemon-consumption proof'u
    burada doğar, native foundation'da değil.
10. **T5E Exact effect containment** — T5, T15, T16 ve T18 sonrası; canonical root'u worker'dan
    fiziksel olarak ayırır, complete effect manifestini çıkarır ve yalnız transactional CAS landing
    receipt'inden sonra persistent project mutation'a izin verir.
11. **T6 Normal task producer/admission** — T5E sonrası.
12. **T7 CLI/MCP/task-mode ingress** — T5E ve T6 sonrası; non-lossy dispatch ve existing-task
    CAS sözleşmesini tek application authority üzerinden tüketir.
13. **T8 XVerify producer/runtime** — T5E ve T7 sonrası; gerçek provider çağrısı task işi değildir.
14. **T9 FIX/XFIX producer** — T5E ve T6 sonrası.
15. **T10 Restart/adoption/finalization** — T4, T5E ve T9 sonrası.
16. **T11 Exact evaluation/acceptance** — T6, T8, T9 ve T10 sonrası.
17. **T12 Lifecycle controller fan-in** — T7, T10 ve T11 sonrası.
18. **T13 Autonomous/cutover fan-in** — T12 sonrası.
19. **T14 Hermetic/binary seal** — aktif upstream lane'leri birleştirir ve WSL2 Docker canary
    için supervisor'a döner.

**Deferred residual:** T3 + T17 ve gerçek Windows-native loader/adapter/package/runtime proof'u
`RECOVERY-BORN-711-WINDOWS-NATIVE-CUSTODY-PROOF-001`; gerçek Darwin adapter/package/runtime proof'u
`RECOVERY-BORN-711-MACOS-NATIVE-CUSTODY-PROOF-001` altında yürür.

T4/T6 engine-hot'tır. Mevcut process bu source değişikliklerini tüketmiş sayılmaz. T14 source/gate
kanıtını bitirir; sonra quiescent post-source build, source/dist parity, compiled CLI ve gerçek Docker
canary ayrı supervisor proof'udur.

## Verification manifest

- Expected-red: public task/result/log/timeout spoof, cross-attempt replay, symlink/FIFO/oversize/
  inode swap, hidden out-of-scope create/modify/delete, read-only scope mutation, case/Unicode alias,
  hardlink/symlink ambiguity, landing preimage race/crash, evaluation-attempt ayrışması,
  completed-checkpoint stale verdict ve unrun-task attempt.
- Targeted source checks: exact lane test kümeleri, `npx tsc --noEmit`, binary-contract script ve
  source-derived hermeticity gate. Test green yalnız supporting evidence'dır.
- Platform: networkless gerçek Linux installed-package proof, current WSL2 native filesystem proof
  ve WSL2-hosted Docker canary birbirinden ayrı receipt/evidence taşır. macOS ve Windows-native
  residual'ları bu capsule'ın DONE'unu bloklamaz; simülasyon native diye raporlanmaz.
- Post-source: aktif worker/container yokken `npm run build`; ardından source/dist identity,
  compiled CLI entrypoint ve provider çağrısı gerektirmeyen ağsız gerçek Docker canary.
- Independent pass: fresh disk/wiring/attempt/receipt/settlement doğrulaması; ciddi belirsizlikte
  different-provider Opus-5 XVerify. Verdict tek başına closure değildir.
- Remote CI: `REMOTE_ADVISORY / QUOTA_UNAVAILABLE_UNTIL_2026-09-01`.

## Finite budget ve stop koşulları

- Bir implementation pass + bir independent verification pass.
- Aynı failure fingerprint için otomatik ikinci implementation/FIX turu yoktur; yalnız yeni disk,
  runtime veya verifier evidence yeni bounded correction açabilir.
- 57 production veya 191 test/script path dışı mutation ihtiyacı typed `SCOPE_HOLD`dur.
- Public fallback billing/verdict/terminal truth'a geri girerse, task snapshot shared `.tasks`ten
  yeniden üretilirse, Windows capability başarı diye uydurulursa veya active runtime collision
  doğarsa hemen HOLD.
- Permission/enforcement, approval authority, routing/model policy, non-Docker migration,
  multi-hop continuation, private retention/backup/DR ve 4030+ product work bu pakete alınmaz.
- `.brain/memory.db`, `.tasks` manual cleanup, provider credential/config mutation, canary runtime
  DB rollback ve başka oturum değişiklikleri yasak alandır.

## DONE

### Final local closure evidence — 2026-09-03

- T14 source fan-in sonrası `npm run build:all` PASS; compiled CLI ve binary-contract scripti PASS.
  Native binary digest `sha256:4e4dd558785cced4688979b219ac2648623f8bbf1f89a9f9fba8abab9913597f`,
  native source-tree digest `sha256:ef06f44f070e07061cacb7672e0812a88f44a8235e7002f338c2786f32d69a8d`.
- Final WSL2/Docker normal exact attempt `canary-1788433556479` /
  `b6d8aa45-19e0-89d3-8ede-fac68c18c8ad`: `diskVerified:true`, single admitted file effect,
  collector `DONE`, evaluation verdict `DONE`, durable landing→accepted→evaluation→finalizer→
  settlement→archive chain ve fresh-process terminal reread PASS. Container/volume residue yok.
  Machine evidence sha256 `02836a467b6eae81689fa1bd3434311f0a49640f8179d27acba39e2e3bf84f82`.
- Final networkless installed-package proof `DECKENT_PACKED_NETWORKLESS_INSTALL_VERIFIED`:
  WSL2 native `LANDING_VERIFIED`, packaged prebuild, install-time build/download absent; receipt
  sha256 `3da177733c030dfe694499340b594ad044600b584d8dab6f5c29f1db7dae5ea4`.
- Frozen exact Store result collector boundary'sinde mutate edilmiyor; normalization detached copy
  üzerinden çalışıyor. Gerçek collector proof 1 read, 1 settlement, 2 independent terminal reread
  ve task `DONE` taşıyor.
- Local recovery verdict `GO / DOGFOOD_READY`. Capsule henüz tüketilmez: MASTER 3327/3328/3329
  canonical authenticated settlement beklediği için `OPEN`; 8031/8032 owner-deferred kalır.
  Commit/push ve ilk dogfood run ayrıca owner action'dır.
- `RELATED_BUT_NONBLOCKING`: gerçek Store terminal closure reread'i dakikalar ölçeğinde; ayrı
  performans outcome'una owner admission gerekir. Doğruluk/finite completion sonucunu değiştirmez.

Bu capsule ancak aşağıdakilerin tamamı sağlanınca tüketilir:

1. 19-node aktif DAG fan-in exact scope içinde tamamlanmış, bütün aktif upstream lane T14'te
   birleşmiş ve duplicate writer yoktur; T3/T17 residual'ı active success'e dahil edilmemiştir.
2. Normal Docker yolu immutable host-private task/attempt/output/provider/evaluation custody'siyle
   çalışır; public projection saldırıları fail-closed kanıtlanır.
3. Accepted attempt → result → evaluation receipt → finalizer → settlement → archive/restart zinciri
   exact digestlerle yeniden okunabilir; unrun task ve stale sibling başarı üretemez.
4. Source checks `LOCAL_VERIFIED`dir; testler closure iddiası olarak kullanılmaz.
5. Quiescent post-source `npm run build`, source/dist parity, compiled CLI ve gerçek ağsız Docker
   canary yeni motoru gerçekten çalıştırır.
6. MASTER 3327 Linux installed-package, 3328 WSL2 native ve 3329 WSL2 Docker canary satırlarının
   exact acceptance'ı kanıtlanır; 8031 macOS ve 8032 Windows-native `DEFERRED` kalırken bu platformlar
   için herhangi bir success iddiası üretilmez.
7. Independent verification GO verir; XVerify kullanılırsa gerçek different-provider execution,
   usage, settlement ve durable receipt birlikte vardır.
8. MASTER evidence/state canonical gate ile settlement'a taşınır; authenticated Closure OS owner
   action gerekiyorsa outcome dürüstçe VERIFY/HOLD kalır.
9. Capsule ve active node delete-on-consume edilir; sonraki implementation Deckent dogfood
   Goal/Mission/Flow/Run/Do yoluna döner.
