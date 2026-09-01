# GEÇİCİ AKIŞ — TEK AKTİF İMLEÇ

> Bu dosya yalnız kısa vadeli çalışma imlecidir. İş ve kapanış SSOT’u
> docs/MASTER-PLAN.md; kalıcı analiz
> follow-up-works/deckent-full-code-truth-analysis-2026-08-30.md dosyasındadır.

## Authority ve durma sınırı — 2026-09-01

- Aktif outcome: RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001.
- Workspace: main@33b0f04919ae413e0e3d607a9e8abe265a8eee54; mevcut dirty state korunur.
- DOGFOOD health: DEGRADED; bounded ADR-D-007 recovery devam ediyor.
- Goal bu recovery’yi gerçek WSL2/Docker kanıtıyla DOGFOOD_READY sınırına getirir.
- Bu Goal içinde dogfood run/canary, 4034, yeni Goal/Mission/Flow/Run/Do/Autonomous
  başlatılmaz. DOGFOOD_READY raporunda durulur ve owner kararı beklenir.
- .brain/memory.db, manual .tasks mutation/cleanup, auth mutation, bot restart,
  kill/cleanup, Closure signing, commit ve push yasaktır.

## Tamamlanan fan-in

- T19/T20: root npm-shrinkwrap.json tek yayımlanan dependency authority; root
  package-lock.json yok. Gerçek WSL2 networkless install receipt’i:
  .analysis/audits/motor-a-linux-wsl2-networkless-install-2026-09-01.json,
  sha256:5e4194aa69327a47ead330a6ac2ceab71c181aa741df58feb296675152bbe03a.
  Hardened pack baseline sha256:cf1431da325ee45b3e0c8ff44dba8c1868246d80e290bf35289d8910bbeb3080;
  validate:publish 8/8 PASS. Publish yapılmadı.
- T4 exact consumer/result/IPC source boundary: bağımsız fresh disk audit GO
  (%94). Final DIRECTIVES bataryası 11 dosya / 305 test PASS; TypeScript ve diff-check
  temiz. Test sonucu tek başına kapanış değildir.
- T4’te artık public .result, .log, .question, .answer ve worker self-report
  authority değildir. Exact accepted result terminal olmak için T11 evaluation + finalizer
  receipt zinciri ister. Public projection first-writer/fail-closed read modeldir.
- Exact IPC worker’a top-level BrainAnswer teslim eder; durable answered state tam question,
  answer bytes ve receipt bağı ister. Async approval latch run-localdır; aynı authority
  bridge/publisher’ı tekrar çağırmaz, farklı run/proje kapasitesini tüketmez.
- T18 Store dispatch authority tamamlandı: canonical request material ilk-yazan olarak
  reserve/reopen edilir; Store identity/generation/admission üretir; RELEASED,
  NOT_DISPATCHED ve AMBIGUOUS typed durable authority’dir. MOUNT ile NOT_DISPATCHED aynı
  immutable physical-transition head üzerinde atomik yarışır; yarım geçiş `transition-pending`
  olarak görünür. Root hedefli doğrulama 108/108 PASS; fresh bağımsız re-audit GO (%96).
  T5 fan-in sırasında bulunan fiziksel gözlem boşluğu bounded T18 amendmentıyla kapandı:
  GATE_ACK / NO_EFFECT / RECONCILIATION / PROVIDER_EXIT için immutable claim→bounded bytes→path-free receipt
  zinciri ve settlement/read-path zorunlu durable reread binding’i var. Root 112/112 PASS,
  T18-only typecheck PASS, fresh bağımsız audit GO (%97). PROVIDER_EXIT yalnız aynı admission’ın
  terminal RELEASED kaydından sonra yayımlanabilir; release öncesi, NOT_DISPATCHED, AMBIGUOUS ve
  transition-pending yolları fail-closed’dur. Raw observation tek başına terminal authority
  değildir. Üçüncü start kapısı için additive PROVIDER_START Store seam’i de aynı
  RELEASED/time/first-writer kurallarıyla eklendi; root 113/113 PASS ve fresh bağımsız audit
  GO (%99). T5 semantic bundle/producer ve T6 projection tüketimi integration HOLD’dur.
- T5 exact prompt-delivery authority correction root tarafından 150/150 + 51/51 scoped test ve
  `tsc --noEmit` ile doğrulandı; fresh bağımsız source→Store→PID1→accepted-reader audit GO (%95).
  Final `SegmentedPrompt` T6'da typed sink üzerinden taşınacak; public `.tasks` prompt receipt'i
  authority olmayacak.

## Şu anki exact iş

Owner-approved T5E exact-effect recovery uygulanıyor. `SCOPE-REVISION-011-T5-EXACT-EFFECT-PRODUCTION-ADAPTERS`
revision'ı volume lifecycle ve Store journal/publication bridge'ini iki dar production adapterına
ayırdı: manifest 62 production + 197 conditional test/script path ve
sha256:613e72228db0d3dd216d9b1d72bdf804bec1daaa329e25b3be2ef23ba2891571.
T5E, T6/T7 önündeki current exact iştir:

1. Canonical dirty `main` truth'unu exact attempt-private Docker volume'a snapshotla; worker
   canonical root'u hiçbir RW mount/handle üzerinden görmesin.
2. Provider result'ından bağımsız full baseline/final effect manifesti üret; add/modify/delete,
   rename, mode ve link/alias semantiğini exact `filesWrite` policy'sine göre sınıflandır.
3. Her unexpected/protected/ambiguous/unsupported effect'te whole attempt'i quarantine+HOLD yap;
   allowed subset'i otomatik land etme.
4. Valid manifesti exact lease + file/parent preimage CAS + durable
   PREPARED→APPLYING→COMMITTED landing journalıyla canonical root'a taşı; crash recovery false
   success üretemesin.
5. `diskVerified` ve accepted effect truth yalnız committed landing receipt'inden doğsun.
6. Fresh independent source+wiring audit GO vermeden T6'ya geçme.

### Anlık doğrulama imleci — 2026-09-01

- Manifest/policy foundation targeted 54/54 test, typecheck ve fresh üç turlu adversarial
  audit sonrası scoped `GO` (%97). Exact authority path'i rewrite etmez; portable aliases ve
  protected trees fail-closed; policy 100k entry/16 MiB aggregate path, manifest 16 MiB
  aggregate path + implementation hard ceilings ile bounded; policy lookup binary-search,
  derived-parent hesabı linear/depth-bounded'dır.
- Bu foundation GO, native capture veya Store ingress GO değildir. Linux/WSL descriptor-relative
  native capture/landing ve host-private Store authenticity wiring devam ediyor; macOS ve
  Windows-native başarıya çevrilmeyecek.
- Store effect-artifact/chain ve journaled CAS landing coordinator ayrı, çakışmasız fan-in
  şeritlerinde hazırlanıyor. Ana Docker/result wiring bunlar bağımsız doğrulanmadan başlamaz.
- Fresh Store audit'i structural chain'i yeterli bulmadı: snapshot/manifest/staged/journal/result
  içerikleri semantic olarak birbirine yeniden hesaplanarak bağlanmadığı için arbitrary bytes
  laundering mümkün. Task 21 aynı outcome içinde tek
  `execution-effect-persistence-contract` core authority'siyle genişletildi; Store ve landing
  coordinator ayrı schema kopyaları yerine bu parser/digest kaynağını birlikte tüketecek.
- Native review sonucu `REVISE`, fakat mevcut Task 21 scope'u yeterli: custody ABI gevşetilmeyecek;
  Linux/WSL-only ayrı `execution-effect-linux-v1` trust domain'i, ABI/opaque handle v2 ve typed
  unsupported diğer platformlar kullanılacak. Manifest descriptor-relative scan; landing
  no-replace/exchange/tombstone/mode CAS, fsync, reconcile ve whole-plan final postimage fan-in
  receipt'i taşıyacak. Staged bytes receipt/native identity irreversible boundary'den önce
  PREPARED journalına bağlanmadan effect uygulanmayacak.
- Landing lease için ikinci bir lock authority üretilmeyecek. `src/core/file-lock.ts` içindeki
  canonical Execution Lock Authority zaten SQLite+fencing+heartbeat, durable irreversible-boundary,
  quarantine ve append-only completion audit sağlıyor. Fan-in adapterı bu exact generation'ı
  coordinator'ın acquire/renew/assert/beginBoundary/complete/releaseNoChange sözleşmesine bağlayacak;
  `.spawnlock` veya process-local mutex landing authority sayılmayacak.
- Fresh Docker wiring re-audit verdict'i `REVISE` (%97): exact path hâlâ canonical root'u RW
  mount ediyor, inspect ek RW aliasları doğrulamıyor, provider sonrası full private-volume manifest
  yerine host scope diff'i kullanıyor ve accepted result `COMMITTED` landing olmadan doğabiliyor.
  Production fan-in sırası sabitlendi: stable dirty-main snapshot→attempt-private named volume→
  full mount/label/volume inspect→native baseline before provider-start→stopped-volume native final
  manifest+staged bytes→maintenance lease/CAS journal→COMMITTED receipt→accepted result. Restart,
  quarantine retention ve exact resource-release receipt aynı zincirin zorunlu parçalarıdır;
  canonical root/`.git` hiçbir provider Docker argv'sinde yer almayacaktır.
- Execution-lock fan-in başladı: irreversible boundary request'i immutable transaction'dan
  türetilen validated UUID ile idempotent açılabiliyor; terminal completion aktif/quarantine
  satırları silindikten sonra append-only audit'ten exact boundary UUID ile yeniden okunabiliyor.
  Existing caller'larda fresh random UUID davranışı değişmedi. Değişiklik sonrası TypeScript
  `--noEmit` temiz; production Docker lease adapterı ve restart integration kanıtı henüz HOLD.
- Task 21 write scope 36 path'e kontrollü genişletildi: duplicate settlement fixture yerine mevcut
  ortak `tests/helpers/task-result-settlement-v2-fixture.ts` write authority'si T1'den T5E'ye
  devredildi; production lock bridge için yalnız `src/orchestra/execution-effect-lock-adapter.ts`
  eklendi. `lint-directives` BLOCK vermiyor; eski/missing future-test uyarıları değişmedi.
- Lock audit sonrası scope 38 path oldu; `tests/core/task-execution-fence.test.ts` ve yeni
  `tests/orchestra/execution-effect-lock-adapter.test.ts` eklendi, lint yine BLOCK vermiyor.
  Deterministic boundary/exact replay/full terminal-audit reread hedefli testi 3/3 PASS. Fresh
  adversarial verdict `REVISE` (%99): gerçek restart için expired+dead `in-flight` boundary'nin
  yeni fencing generation'a atomik adoption'ı, `resumed*` audit zinciri ve atomic no-change
  terminal gerekiyor. Bu DB-meta-v4 lane'i ayrı exact writer'da uygulanıyor; alive/unknown/foreign
  owner otomatik devralınmayacak, typed HOLD kalacak.
- Root restart incelemesi no-change crash penceresini de current pakette BLOCKS_CURRENT_DONE yaptı:
  `COMMITTED_NO_CHANGE` yayımlandıktan sonra terminal DB işlemi öncesi process ölürse unbounded
  maintenance lock'un hangi transaction'a ait olduğu process-local map'ten çıkarılamaz. PREPARED
  journal exact acquired lease snapshot'ını taşıyacak; yalnız exact unquarantined, expired ve
  positively-dead generation append-only active-adoption audit'iyle fresh/higher fence'e atomik
  devredilecek. Alive/unknown/foreign/quarantined owner typed HOLD kalacak. Failure evidence de
  operation sayısıyla büyümeyecek; bounded hash-chain/fan-in özeti lock limitlerine bağlanacak.
- DB-meta-v4 lock lane'i ve shared persistence/recovery fan-in'i source-stable: active adoption ve
  in-flight boundary resume append-only/audit-guarded, exact prior lease→fresh higher fence ve
  A→B→C restart lineage'ı doğrulanıyor; no-change terminal tek DB transaction'ında kapanıyor.
  Coordinator PREPARED'a acquired lease bağlar, typed PREPARED/APPLYING/COMMITTED context ile
  restart eder, COMMITTED-before-terminal halinde full journal + final postimageyi yeniden
  doğrular ve failure evidence'i sabit sayıda digestte tutar. Root lock/coordinator battery
  3 dosya / 93 test PASS, TypeScript ve exact diff-check temiz. Fresh bağımsız audit sürüyor;
  production Docker/Store bridge olmadığı için overall T5E hâlâ HOLD.
- Native source→landing bridge incelemesi iki ek BLOCKS_CURRENT_DONE kanıtladı: descriptor-relative,
  bounded/no-follow workspace source-read cursor ABI'de yok ve PREPARED source authority random,
  process-local native staging inode identity'sine bağlanırsa restartta yeniden üretilemez.
  Native lane `begin-source-read → next-source-chunk → finish-source-read` opaque cursorunu ekliyor;
  durable source authority ordered Store receipt/content/chunk digestlerinden üretilecek,
  native staging inode identity yalnız tek materialization çağrısının iç guard'ı kalacak.
  Build öncesi mevcut binary effect-v2 contractını taşımadığından native runtime hücreleri dürüst
  skip/HOLD'dur; source yeşili product proof sayılmaz.
- Fresh persistence fan-in denetimi yeni BLOCKS_CURRENT_DONE buldu: coordinator'ın full
  pre/post/parent/staged operation digest'i ile persistence terminal özetinin native receipt/
  durability digest'i aynı `operationDigest` adı altında farklı domainlerde hesaplandığından gerçek
  PREPARED→STEP→terminal zinciri kriptografik olarak birleşemiyor. Shared core contract iki anlamı
  ayrı alanlarda adlandıracak; gerçek coordinator journal bytes semantic reread olmadan Store seal
  veya accepted result üretemeyecek.
- COMMITTED journal tek başına terminal değildir: canonical file-lock completion audit'i ve
  coordinator terminal receipt'i immutable Store artifact olarak semantic fan-in'e girmeden
  `leaseTerminalReceiptDigest` kabul edilmeyecek. Arbitrary digest, COMMITTED-without-audit ve
  projection-uncertain cleanup success üretmeyecek; durable DB terminal restart reread'i korunacak.
- Accepted result effect truth'unda eski `hostWorkAuthority` ile yeni landing receipt bugün iki
  paralel kaynak. T5E cutover `filesChanged`, `diskVerified`, boundary/count alanlarını verified
  terminal effect setinden türetecek veya exact karşılaştıracak; no-change non-empty değişiklik ve
  missing-terminal `diskVerified:true` fail-closed olacaktır.
- Fresh semantic fan-in audit'i üç ek exact kırığı current pakete aldı: coordinator/persistence
  staged chunk authority tek domain'e indirilecek; empty-directory ve nested derived-parent
  operationları gerçek containment effect'lerini exactly-once tüketen ayrı topology provenance'i
  taşıyacak; lease terminal proof'u canonical `effect-transaction`/`effect-terminal` vocabulary,
  deterministic boundary UUID ve full lock audit body üzerinden yeniden hesaplanacak. Opaque veya
  self-digested dört alanlı terminal nesnesi başarı kanıtı olmayacak.
- Native Docker source bridge büyük bytes'ı fd1 üzerinden host-private O_EXCL/NOFOLLOW ingress'e
  stream edecek; fakat coordinator adapter API'si sync kaldığı için ilk skeleton `spawnSync`a
  zorlanıyordu. Bu BLOCKS_CURRENT_DONE'dur: yeni effect coordinator Promise-aware async contracta
  geçirilecek, production child process yalnız async spawn ile çalışacak; sync skeleton stable veya
  production-ready sayılmayacak.
- Root production fan-in ilk fiziksel cutover'ı source üzerinde başlattı: exact attempt için
  path-free/restart-stable named-volume identity ve `/workspace` volume mount sözleşmesi eklendi;
  native bootstrap kodu artık worker workspace'indeki değiştirilebilir `dist/native` yerine image
  içindeki trusted `/app/dist` + `/app/native` zincirini okur. Volume create/populate/seal ve full
  inspect henüz tamamlanmadığından bu ara durum production-ready veya çalışır kabul edilmez.
- Fresh inventory audit'i ilk üreticinin tracked `.brain/.deckent/.tasks` ağaçlarını da listeleyip
  parser tarafından sürekli reddedileceğini buldu. Producer artık normal tracked +
  untracked/nonignored kaynakları alırken bütün protected rootları explicit top-level Git pathspec
  ile dışlıyor; Git'in global-sırasız çıktısını portable/collision/100k/16 MiB sınırları altında
  canonical NUL inventory'ye çeviriyor. Gerçek repo komutunda 6865 aday, protected count 0;
  focused 3/3 test PASS. Bu yalnız inventory correction'dır, volume population closure değildir.
- Named-volume inspect artık daemon `Mountpoint`, exact labels ve local-driver options projection'ını
  taşır; nonempty local options (özellikle bind device aliası), foreign labels ve lexical canonical
  root aliası doğrulamada reddedilir. Deterministic, sorted-label `docker volume create` argv factory
  eklendi. Explicit create/populate/seal production consumer'ı henüz bağlanmadığından HOLD sürer.
- Owner-requested Fable 5 XVerify girişimi provider/model ayrımını doğru çözdü
  (`codex/gpt-5.6-sol → claude/claude-fable-5`, normal-tier-admitted), fakat provider çağrısından önce
  `xverify_candidate_evidence_unavailable` typed HOLD verdi. Verdict/usage/terminal settlement/
  adjudication receipt yoktur; bağımsız closure kanıtı sayılmadı ve aynı evidence ile retry yapılmadı.
  Generated rapor: `.analysis/xverify/xv-1788261102004-23a12166-69fa-4ab7-988c-9304aadd822b.md`.
- Owner'ın ayrı Fable 5 oturumundan taşıdığı source review `REVISE` (%90) verdi. Sağlam foundation
  bulguları korunurken volume create/populate/inspect/seal/release, production landing wiring,
  COMMITTED-bound accepted result ve sidecar drift'i kapanış engeli sayıldı. Revision 010 sidecar
  drift'ini kapattı; volume yaşam döngüsü ve result cutover hâlâ HOLD'dur. Exact custody bölgesindeki
  üç sync Docker çağrısı bounded async runner'a geçirildi; bu tek başına production wiring GO değildir.
- Fable fan-in'i owner tarafından kabul edildi ve düzeltme sırası aktif T5E paketine alındı.
  Revision 011 iki yeni production adapterına exact write authority verir: explicit/fresh labeled
  volume lifecycle ve Store-backed effect publication. Native manifest üreticisindeki C↔TS canonical
  digest, UTF-8 byte order, root-inclusive bounds ve allocation/ownership düzeltmeleri sonrasında
  TypeScript temiz; source battery 24 PASS / 20 build-bekleyen native runtime HOLD. Zero-byte regular
  file landing'i için `execution-effect-staged-content` policy alt sınırı 0'a indirildi ve doğrudan
  policy testi PASS. Genel mount battery'deki accepted-result testi, effectLanding binding henüz
  COMMITTED Store receipt'ten üretilmediği için bilinçli kırmızı kalıyor; bu sonuç gizlenmedi.
- Fresh native re-audit hidden parser/ABI drift'lerini BLOCKS_CURRENT_DONE olarak yakaladı ve aynı
  pakette düzeltildi: C/TS root-inclusive entry ceiling tek 1.000.000 authority'sine, total/depth/
  path/name ceiling'leri 256 GiB/256/16 KiB/255 byte değerlerine eşitlendi; directory fanout request
  budget+deadline sırasında fail-closed; per-file ve aggregate overflow ayrı typed BOUNDS üretir.
  Source/typecheck/targeted battery temizdir, fakat mevcut binary eski olduğu için runtime hücreleri
  hâlâ HOLD'dur. Whole-tree truth, provider STOPPED + exclusive volume custody receipt + art arda
  eş iki native capture olmadan kabul edilmeyecektir.
- Bu native düzeltmeler fresh bağımsız source re-audit'te `GO` (%96) aldı: O(maxDepth) fd
  ownership, C/TS digest+limit paritesi, strict UTF-8, deadline, no-follow/mount/hardlink ve bütün
  cleanup-unconfirmed yolları yeniden doğrulandı. Runtime/binary hücreleri build ve gerçek WSL2
  kanıtına kadar hâlâ HOLD; source GO ürün kapanışı değildir.
- Ayrı Store adapterı source-stable ve 2/2 targeted PASS: yalnız semantic olarak yeniden okunmuş
  `COMMITTED`/`COMMITTED_NO_CHANGE` landing chain accepted-result binding üretebilir; line count
  kanıtı yoksa açık `UNAVAILABLE` kalır. Fable'ın volume açığı ayrıca `/workspace/node_modules`
  için image-seeded, provider'a read-only ikinci attempt-private dependency volume gerektirdi.
  Bu volume effect manifest dışında, fakat pre-start resource ve post-commit deletion+absence
  receipt'leri workspace seal/release ve Store reread zincirinde required first-class authority
  olarak ekleniyor; eksikken provider authorization ve accepted result fail-closed kalacaktır.
- Shared dependency resource/release + Store fan-in'i source-stable: dependency resource exact
  attempt/admission/policy ve pre-start `readyAt` taşır; workspace release ikinci volume'un identity,
  deletion ve absence evidence'ini required doğrular. Lifecycle provider-start ve provider-stop
  sonrasında zero-attachment receipt, finalde art arda iki eş native capture quiescence seal'i ister.
  Root birleşik battery 4 dosya / 148 test PASS, TypeScript ve diff-check temiz. Production Docker
  command adapterı ve accepted-result consumer henüz bağlanmadığı için overall T5E HOLD sürer.
- Fable `REVISE` sonrası ilk production fan-in source-stable oldu: exact normal-Docker yolu
  image/native manifest parity, explicit labeled dependency+workspace volume create/inspect,
  bounded populate, pre-provider baseline, durable prepared Store publication, provider STOPPED
  sonrası quiescent final capture, canonical PREPARED→APPLYING→COMMITTED landing, identity-checked
  container/volume deletion+absence ve Store accepted authority zincirini doğrudan çağır. Null
  landing policy provider başlamadan `EXECUTION_POLICY_REJECTED`; compensation receipt NO_EFFECT
  observation'a bağlıdır. Assigned 4-file battery 109/109 PASS, TypeScript ve diff-check temiz;
  build/runtime bilinçli olarak henüz çalıştırılmadı ve bunlar closure authority değildir.
- Fresh restart audit'i overall T5E'ye `REVISE` verdi: workspace volume identity daemon `CreatedAt`
  ve random resource-instance freshness taşımıyor; workspace resource create/inspect zincirini
  persist etmiyor; PREPARED/AUTHORIZED/READY lifecycle authority WeakMap/process-local Map içinde
  kayboluyor; Store staged chunk'larını restart consumer'a receipt-bound okutacak API yok. Aynı
  ad/label ile delete+recreate bu nedenle ayırt edilemiyor. Same-T5E durable predecessor-bound
  lifecycle authority + Store checkpoint/readback + rehydrate/adopt + journal/chunk replay
  correction'ı aktif BLOCKS_CURRENT_DONE'dur; bu kapanmadan T6 implementation başlamaz.
- Fresh production fan-in audit'i ayrı `REVISE` verdi. Exact factory'nin mount seti canonical
  root'u provider'dan ayırıyor ve COMMITTED Store authority'si zorunlu; fakat normal Sprint/
  scheduler hâlâ legacy `spawn()` kullandığı için ürün varsayılanında root RW bind canlıdır.
  Generated exact provider runner içindeki `spawnSync`, boş object kabul eden landing-policy
  shape kapısı ve delete→durable publication crash pencereleri de BLOCKS_CURRENT_DONE'dur.
- Aynı audit workspace populate sırasında cross-file TOCTOU buldu: inventory bugün yalnız path
  listesini bağlıyor, per-file before/open/after kontrolü iki dosya arası host mutation'ını
  engellemiyor. T5E population artık inventory-bound full source-pre, destination ve source-post
  manifest/digest üretip üçünü exact eşitlemeden baseline/seal yayımlamayacak; bu correction
  durable PREPARED lifecycle receipt'ine bağlanıyor.
- T6 read-only readiness audit'i `HOLD` (%98) verdi. Normal Sprint/scheduler ve initial-wave
  producer'ları exact prepare→dispatch→await→accept zincirini değil legacy `spawn()` kullanıyor;
  planner public task projection'ı private admission'dan önce yazıyor; dependency promptu public
  result + en büyük sayılı evaluation tarıyor. Result-collector'da exact callback portları var,
  fakat production controller bunları enjekte etmiyor. T5E GO sonrası T6 scope amendment;
  `sprint-phases.ts`, `sprint-controller.ts`, `result-collector.ts` ve doğrudan pass-through/
  projection/scheduler testlerini aynı tek-writer fan-in'e alacak. Amendment olmadan T6 kodu
  test-only wiring olacağı için implementation henüz başlamaz.
- T7 read-only readiness audit'i `NO-GO` (%96) verdi. CLI run/spawn, MCP run ve task-mode
  bugün exact T5 portlarını değil legacy `spawnWorkerMultiProvider` yolunu tüketiyor; CLI sonucu
  worker self-assessment/public `.result` fallbackinden kabul edebiliyor, invocation receipt sabit
  attempt=1 ve opaque execution ref taşıyor. T5E ve T6 stabilize olduktan sonra tek
  `exact-task-execution-service` application-service authority'si prepare→dispatch→await→accept→read
  zincirini dört yüzeye bağlayacak; public result yalnız compatibility projection olacak. T7 scope'u
  invocation receipt/store, i18n catalog, task-mode ve doğrudan CLI/MCP parity/adversarial testlerle
  owner-approved amendment olmadan yeterli değildir; implementation başlatılmadı.
- Fresh volume identity fan-in'i tek ortak label setinin workspace ve dependency volume'larına aynı
  resource-instance kimliğini verdiğini yakaladı. Aynı attempt içinde dahi iki fiziksel kaynak aynı
  instance sayılamaz. Lifecycle planı workspace/dependency için ayrı 256-bit random instance,
  ayrı label set/digest, daemon `CreatedAt`, create/inspect/freshness digestleri taşımadan durable
  ALLOCATING/PREPARED veya restart adoption üretemez; sahte ortak-label uyarlaması yasaktır.
- Fresh T5E source→runtime acceptance audit'i overall `HOLD` verdi. Source düzeyinde staged chunk
  integrity, COMMITTED-only Store acceptance ve exact mount isolation güçlü; fakat production
  dispatch allocate→Store→authorize kapısını, ayrı volume instance/CreatedAt kimliklerini,
  phase rehydrate/replay'i ve delete-intent zincirini henüz tüketmiyor. Gerçek WSL2 canary; allocation
  receipt'inin ilk Docker effectinden önce olduğunu, same-name recreate rejection'ını, canonical-root
  mount yokluğunu, provider-start üç kapısını, çift final capture'ı, her journal/chunk/release crash
  sınırını ve resource release tamamlanmadan accepted result doğmadığını ayrı durable receiptlerle
  kanıtlamadan T5E GO veya DOGFOOD_READY üretilmez.
- First-pass fan-in sonrası fresh adversarial audit iki yeni `BLOCKS_CURRENT_DONE` buldu. Store
  `publishPreparedWorkspace` lifecycle authority'sini optional kabul ettiği ve publish/read accepted
  path'i durable READY phase'ini zorunlu yeniden okumadığı için public adapter faz zincirini atlayabiliyor;
  lifecycle PREPARED artifactı artık mandatory ve accepted binding exact READY digestini taşıyacak.
  Ayrıca Docker capture helper'ı process-local eski volume identity Map'iyle aynı adlı yeniden yaratılmış
  volume'u okuyabiliyor; her populate/capture ve attachment sınırında fresh before+after daemon inspect,
  nonce+labels+CreatedAt identity equality zorunlu olacak. Same-name recreate typed HOLD olmadan T5E GO yok.
- Root fan-in denetimi iki devam kırığını aynı T5E paketine aldı. Docker daemon `CreatedAt` değeri
  JavaScript milisaniyesine normalize edilmeyecek; bounded raw RFC3339 bytes tek lifecycle validatorıyla
  volume-generation digestine girecek. `verifyExclusiveAttachments` process-local Map'e dayanmayacak;
  restartta durable lifecycle workspace planı + dependency authority'sinden iki exact identity yeniden
  kurulacak. Ayrıca `RELEASED` adı tek başına kabul kanıtı değildir: Store bütün delete-intent→executed
  deletion/reconciled absence zincirini üç kaynak için semantic reread edip workspace release içindeki
  disposition/deletion/absence digestleriyle exact eşleştirmeden `publishLanding` veya accepted result
  üretmeyecek. Bu fan-in ve production restart consumerı tamamlanana kadar source GO verilmez.
- Fresh bağımsız restart/wiring audit `HOLD` (%98) verdi. Store lifecycle, chunk, journal, landing
  anchor ve cleanup state machine source olarak replay-capable; fakat production
  `reconcilePendingAttempts()` exact custody Store admissionlarını keşfetmiyor ve yalnız legacy
  settlement listesini tüketiyor. Exact scope/completion/accepted-reader hâlâ process-local Map/
  WeakMap'te; `rehydrateExecutionEffectDockerLifecycleV1`, Store journal/chunk reconcile ve cleanup
  progress API'lerinin restart callerı yok. Fresh release sırası fail-closed olsa da her retry baştan
  PREPARED yazdığı için fazdan resume edemiyor; compensation ise henüz Store state machine'e hiç
  bağlı değil. T5E kapanışı için bounded durable recovery catalog, exact reconcile ingress,
  lifecycle/journal/chunk rehydrate, resumable release+compensation dispatcher ve RELEASED sonrası
  durable accepted-reader reconstruction production'a bağlanacak. Raw directory scan, nonce uydurma,
  ikinci provider start veya process-local capability başarı kanıtı olmayacak.
- Fable `REVISE` sonrası T5E volume fan-in'i source-stable oldu: raw daemon `CreatedAt` byte-exact,
  process-local volume identity Map'i kaldırıldı, workspace/dependency generation her kritik sınırda
  fresh pre/post inspect ile doğrulanıyor. RELEASE ve COMPENSATION latest durable Store state'inden
  resume ediyor; her delete öncesi intent, sonrası executed-deletion veya reconciled-absence ve
  üç kaynağın tam outcome reread'i accepted authority'den önce zorunlu. Assigned 48/48, TypeScript
  ve diff-check yardımcı kanıtları yeşil; build/runtime henüz çalıştırılmadı.
- İki bağımsız restart-discovery incelemesi ayrı 1024-slot/global catalogu reddetti. Canonical
  dispatch reservation ağacı yalnız untrusted aday locator olacak; bounded handle-bound native
  enumeration + pre/post mutation evidence sonrası her aday `readDispatchAdmission` ve terminal
  Store authority'leriyle semantic reread edilecek. Raw listing, `.tasks`, cursor veya directory adı
  authority değildir. `SCOPE-REVISION-012-T5-EXACT-RESTART-DISCOVERY` POSIX/Win32 adapter ve direct
  test yollarını T5E'ye devretti; manifest 62 production + 197 mutationSupport, duplicate/unassigned
  sıfır, sha256:84b2de98c4c0f11715b95f0baed70f2cfa2e35542054c59802614ba8b0c1f451.
- Fresh cleanup/restart fan-in'i iki ek crash boşluğu yakaladı; source GO geri çekildi. Cleanup
  evidence immutable key'e yazılıp progress yazılmadan crash olursa retry fresh timestample aynı
  key'i çakıştırıyor; compensation prepare observations aynı kusuru taşıyor. Evidence adoption
  deterministic semantic reread ile crash-safe yapılacak. Ayrıca cleanup `RELEASED` sonrası
  workspaceRelease hâlâ tek-kullanımlık process session'ından üretildiği için projection→landing
  crash retry `SESSION_INVALID`; durable READY authority + cleanup outcomes üzerinden pure replay
  API'si zorunlu.
- Restart matrisi dört production bağını daha `BLOCKS_CURRENT_DONE` sınıfına aldı: gerçek provider
  child spawn sonrası ayrı durable `PROVIDER_EXECUTION` observation; ilk canonical mutationdan önce
  persisted landing transaction locator; compensation'da provider-container delete-intent/absence;
  fresh processte Store'dan scope/monitor/accepted-reader reconstruction. Hiçbir recovery nonce
  uydurmayacak, execution commit'i tekrar göndermeyecek veya ikinci provider başlatmayacak.
- Bu dört bağın foundation ve fan-in'i source-stable oldu. Store bounded dispatch discovery ve
  `PROVIDER_START→PROVIDER_EXECUTION→PROVIDER_EXIT` sırasını durable reread eder; PREPARED landing
  locator ilk canonical mutationdan önce yazılır; cleanup/compensation evidence→progress crash
  penceresi semantic adoption ile idempotenttir; release projection yalnız durable READY + tam
  cleanup outcome zincirinden yeniden üretilir. Scoped yardımcı kanıtlar: discovery/adapter 183
  PASS (20 platform/build-bekleyen skip), landing locator 27/27 PASS, cleanup/recovery 30/30 PASS.
- Production `reconcilePendingAttempts()` artık yalnız leadership sahibi normal resume modunda
  host-private Store admissionlarını bounded biçimde keşfeder. Terminal RELEASED + exact
  PROVIDER_START/EXECUTION zinciri olmayan kayıt typed HOLD olur; terminal-only/contain hiçbir exact
  provider işini sahiplenmez. Fresh process aynı provider/container identity'sini, lifecycle
  authority'yi, landing locatorını ve varsa PROVIDER_EXIT'i yeniden kurar; yeni nonce, ikinci Docker
  run, ikinci provider start veya ikinci execution commit üretmez. Process-local object identity
  replay şartı durable admission/snapshot/policy identity karşılaştırmasına çevrildi.
- Provider stream crash sınırı yeniden tasarlandı: stream ancak durable PROVIDER_EXIT sonrasında
  tek-yazan Store publication olarak oluşur; process-local açık session kaybı artık restartı
  kilitlemez. Aynı bytes/timestamp idempotent reread edilir, sibling bytes first-writer collision ile
  reddedilir. Root targeted kanıtı Store 122/122, exact Docker mount/wiring 48/48 ve legacy restart
  32/32 PASS; `tsc --noEmit` temiz. Bunlar closure değildir. Fresh bağımsız restart/wiring audit
  sürüyor; accepted-result replay ve gerçek WSL2 runtime kanıtı tamamlanmadan T5E hâlâ HOLD'dur.
- Provider-exit sonrası restart fan-in'i genişletildi: recovery current registry/auth çözmüyor;
  durable task snapshot provider/modelini kullanıyor. READY ve START_AUTHORIZED canonical rehydrate
  yoluna bağlı; provider stream/result/landing/host-work exact EXIT zamanında yayımlanıyor. Host-work
  cleanup'tan önce immutable Store artifactıdır ve accepted TaskResultV2 receipt/sha/byte bağı taşır.
  Automatic acceptance public await'te hata/HOLD'u görünür kılar; accepted artifact yazılıp chain
  yazılmadan crash olursa effect-landing predecessor ile exactly-once adoption yapılır. Contain,
  PROVIDER_EXECUTION kaydı eksik olsa da yalnız stop+EXIT observation yapar; landing/release/acceptance
  yapmaz. Fresh narrow source audit GO; split targeted proof 519/519 PASS, TypeScript/directives/diff
  temiz. İki ağır durable-fixture testi toplu Vitest RPC raporlama timeout'u üretti fakat ayrı bounded
  koşularda PASS; test aggregation performansı closure kanıtı değildir ve T14'te ayrıca ele alınır.
- Bütün Task21 fan-in'inin fresh audit'i `REVISE` (%95) verdi; narrow GO geri çekildi. T5E içinde
  kalan exact blockerlar: nonterminal admitted dispatch'lerin restartta absent/transition/ambiguous
  sınıflarına göre toparlanmaması ve cleanup container/workspace silindikten sonra crash olursa READY
  rehydrate'ın artık bulunmayan volume'u istemesiydi. Audit'in null landing-policy'yi optional sayan
  üçüncü iddiası primary accepted ADR-G-037 ile çelişti ve reddedildi: remote unattended exact Docker
  non-null owner policy olmadan dispatch edilemez; pre-provider residue yalnız güvenli NOT_DISPATCHED,
  RELEASED/provider-observed null ise typed HOLD'dur.
- Aynı audit'in legacy normal `spawn()`/canonical-root RW bind ve accepted result→collector eksikleri
  T6'nın production cutover kapsamıdır; T5E foundation bunlar kapanmadan product GO sayılmaz, fakat
  aynı approved DAG'da T6'ya dependency-bound ara-artifact olabilir. T6 read-only admission prep'i
  mevcut scope'u `SCOPE_HOLD` buldu: `spawn-backend.ts`, `spawn-backend-docker.ts`,
  `result-collector.ts`, `sprint-controller.ts`, `sprint-phases.ts` ile direct initial/queue/restart
  testleri exact ownership revision'ına alınmalı. Hedef tek zincir: pure prompt/dependency compile →
  private prepare → no-clobber compatibility projection → dispatch → yalnız RELEASED sonrası public
  event/status → backend-owned await/accept/read → collector exact callback; `.tasks` authority değil.
- T5E restart correction source-stable oldu: absent/transition/ambiguous pre-provider matrisi,
  ALLOCATING/PREPARED/PROVIDER_START_AUTHORIZED compensation, MOUNT_CLAIMED no-delete HOLD,
  first-delete öncesi immutable terminal seal ve live READY gerektirmeyen partial-release cleanup
  resume bağlandı. Root kanıtı: `tsc --noEmit` temiz; mount/restart 61/61, Store 4/4 ve üç exact
  lifecycle case PASS. Aggregate lifecycle 26/26 assertion PASS olsa da Vitest `onTaskUpdate` RPC
  timeout'u ayrı test-runner borcu olarak duruyor; closure sayılmadı.
- Fresh bağımsız T5E audit'i tek yeni blocker buldu: per-entry HOLD yalnız debug log'a düşüyor, caller
  boş başarılı report görüyordu. `SCOPE-REVISION-013-T6-NORMAL-PRODUCER-CUTOVER` üretim
  backend/controller/collector yollarını T6'ya devretti; manifest 62 production + 201
  mutationSupport, duplicate/unassigned sıfır, sha256:
  `8d6f2e6c113b427b59919f1ab83893ee601e92db7c07375363a2518781a525b3`. Docker report artık exact
  identity/state/reason taşıyan immutable `held` listesi döndürüyor; startup non-empty HOLD'da typed
  failure üretiyor. Root TypeScript, directives lint, mount 61/61 ve controller composition 10/10
  temiz; fresh independent re-audit sürüyor.

## Açık HOLD ve borçlar

### T6 normal producer cutover imleci — 2026-09-01

- Initial ve queued/dependency-ready görevler aynı canonical executor'a bağlandı. Exact Docker
  promptu disk mutationı olmadan memory içinde derleniyor; private prepare/dispatch `RELEASED`
  olmadan public task, prompt receipt, TASK_ASSIGN veya EXECUTING yayımlanmıyor.
- Run-level “her görev Docker'dır” varsayımı kaldırıldı. Registry task-level exact/legacy
  sahipliği taşıyor; legacy sonuç kendi authority reader'ına gider, registry yokluğu artık legacy
  sonucu sonsuz `pending` durumunda gizlemez. Exact bağımlılık accepted+terminal authority olmadan
  dispatch edilmez ve typed HOLD olur; no-mint/not-dispatched sıfır attempt olarak kalır.
- Fresh planner default Docker veya task-level `backend: docker` durumunda public task projectionını
  erteliyor. Canonical executor legacy taskı legacy dispatch öncesi, exact taskı yalnız RELEASED
  sonrası yayımlar. Targeted T6 battery 10 dosya / 151 test PASS; `tsc --noEmit` temiz. Bunlar
  product closure değildir.
- Açık production blockerlar: exact-plan start materializer hâlâ bütün task projectionlarını
  SPAWN'dan önce yazıyor; normal controller exact IPC resolver ve T11 settle/revalidate portlarını
  henüz üretimden almıyor. Bu üç bağ kapanmadan exact normal Sprint gerçek canary veya DONE değildir.

### T6 mixed-backend fan-in ve T7 admission imleci — 2026-09-01

- Reducer scheduler artık aynı run-scoped exact registry'yi taşıyor. Geç doğan FIX/XFIX içindeki ilk
  Docker task da legacy Docker yoluna düşmüyor.
- Registry her task'ın gerçek lifecycle owner'ını saklıyor. List/reconcile/reap/timeout, Nervous
  respawn kill, queue slot kill ve controller grace kill run defaultuna değil o task'ın gerçek
  backend/provider owner'ına gidiyor. Focused source kanıtı 34/34 PASS; `tsc --noEmit` temiz.
- T6 `SpawnDisposition`, exact backend'in RELEASED / NOT_DISPATCHED / AMBIGUOUS receipt bundle'ını
  artık caller'a kayıpsız taşıyor; local pre-prepare HOLD bunu exact receipt gibi taklit etmiyor.
- Fresh T7 audit'i REVISE verdi: CLI run, MCP run, task-mode ve manual spawn public task/raw result
  üzerinden ayrı yollar kullanıyor. `SCOPE-REVISION-014-T7-TASK-INGRESS-AUTHORITY` ile T7 artık
  T6'ya dependency-bound; tek task-ingress application authority kurulacak. Existing task ancak
  digest/CAS-bound input, MCP job/public task/V1 settlement yalnız projection olabilir.
- Sıradaki exact iş: T6 existing-task CAS + accepted-result await portu; sonra task-mode-runner'daki
  ortak application authority üzerinden CLI run → MCP run → task-mode → manual spawn cutover.

- BLOCKS_CURRENT_DONE: T5E canonical-root isolation + complete effect manifest + transactional
  landing; T6 exact accepted-result producer; T11/T10 terminal injection zinciri.
- T5 exact prompt-delivery authority foundation bağımsız GO'dur; remaining blocker T6'nın final
  segmented prompt artifactını typed sink ile bu authority'ye production wiring olarak taşımasıdır.
- RELATED_BUT_NONBLOCKING: approval bridge timeout/default yolu allow/continue; 4050
  approval authority/policy işinde ele alınacak, T4 custody scope’unda değiştirilmez.
- Process restart sonrası exact effect lifecycle ve async terminal state'in kalıcı yeniden
  kurulması current T5E içinde kapanmalıdır; process-local WeakMap/Map closure değildir. PREPARED,
  PROVIDER_START_AUTHORIZED ve READY_FOR_LANDING her biri predecessor-bound Store authority'si,
  fresh daemon identity/attachment observation'ı ve canonical journal/chunk replay'i olmadan
  adopt, delete, landing veya accepted result üretemez.
- T6 exact run-start authority yalnız initial spawner’a değil queued/dependency-ready yola da
  taşınmalıdır. Bunun için result-collector ve sprint-controller pass-through scope amendmentı
  BLOCKS_CURRENT_DONE’dır; global registry veya public task fallback kabul edilmez.
- T5 landing denetimi public `.tasks/...result` ve generic continuation `spawn()` fallbackını
  BLOCKS_CURRENT_DONE buldu. Scope revision 008 ile dört core/agent source ve üç doğrudan test
  T5’e eklendi; manifest 54 production + 187 conditional test/script path,
  sha256:889d528cc5ab34a06cfe3c43a635e8e92f3e0199b4ddf9884d19bab62c797f7b.
  Landing/checkpoint structured custody ref taşır; historical V1 migration T10’da kalır.
- BLOCKS_CURRENT_DONE: T5 PID1 mevcut ara uygulamada release ack’i yazdıktan hemen sonra
  provider runner’ı başlatabildiği için Store terminal RELEASED kaydından önce provider start
  yarışı vardır. Kapanış sırası üç kapılı olacaktır: intent→armed ack (NOT_STARTED)→Store
  RELEASED→tek-kullanımlık start nonce→durable PROVIDER_START ack→provider spawn. T18’de yalnız
  RELEASED sonrası yayımlanabilen path-free PROVIDER_START observation seam’i hazır ve bağımsız
  GO’dur; fakat bu sıranın T5 üretim kodu ve gerçek Docker kanıtı tamamlanmadan T5 GO değildir.
- T4 Landing V2 durable contract tamamlandı: pre-provider context/baseline, immutable
  admittedAt→preparedAt sınırı, first-writer race adoption, path-free exact custody,
  canonical diskEvidenceDigest, full operational payload, checkpoint, retirement ve
  released-only continuation claim aynı private attempt/generation zincirine bağlıdır.
  Root 14/14; fresh bağımsız T4+coordinator battery 23/23 PASS, contract verdict GO (%95).
  Bu yalnız contract/foundation kapanışıdır: production stamp/continuation producer T5/T6
  fan-in'i tamamlanmadan overall motor veya dogfood READY sayılmaz.
- T4 canonical-ingress bounded correction fresh bağımsız GO (%97): exact V2 raw
  worker custody/token/cost/files/disk/boundary/work/prompt/terminal/agent/skill
  alanlarını host authority yerine kabul etmiyor. T4 direct 21/21 PASS.
- T5 physical custody/three-gate/terminal capture source contract fresh bağımsız GO
  (%93): provider Store `RELEASED` + durable `PROVIDER_START` sonrası doğuyor;
  provider-exit, pristine stream, billing, private result, host scoped-work ve
  canonical accepted-result Store'dan tekrar okunuyor. T5 direct 9-file battery
  149/149 PASS; TypeScript ve diff-check temiz. Testler closure authority değildir.
- BLOCKS_CURRENT_DONE: project root shared-RW ve hidden out-of-scope mutation körlüğü.
  Owner scope revision 009 ile T5E bu açığı canonical-root isolation + complete effect manifest +
  transactional CAS landing olarak kapatmak üzere current lane oldu. Genel tenant/RBAC/tool-gateway
  enforcement bu pakete alınmadı.
- BLOCKS_CURRENT_DONE: production coordinator baseline/disk/checkpoint/retirement zamanlarını
  scheduler/caller girdisinden kabul etmeyecek; trusted host bunları gerçek olay anında mint
  edecek. Exact stamp ve continuation API'leri gerçek normal-Sprint producer tarafından
  tüketilmeden test-only wiring olarak HOLD kalır.
- Public task markerı yalın task.status olarak authority sayılamaz; T10/T12 exact
  projection consumer’ı receipt/marker doğrulamalıdır.
- macOS 8031 ve Windows-native 8032 owner-deferred, review 2026-09-15. Aktif closure
  Linux/WSL2’dir; remote platform başarısı simüle edilmez.

## Sonraki kapanış sırası

T5E → T6 → T7/T8/T9 → T10 → T11 → T12 → T13 → T14 →
quiescent npm run build:all → source/dist equality → gerçek WSL2 Docker canary →
fresh bağımsız closure audit → DOGFOOD_READY raporu ve DUR.

## T6 exact-plan deferred projection imleci — 2026-09-01 21:55 +03

- `SCOPE-REVISION-015` owner'ın canlı devam kararıyla kaydedildi; exact-plan start service ve iki
  doğrudan test T6'ya eklendi. Manifest: 65 production + 209 mutation-support, duplicate/unassigned 0.
- Şimdiki iş: plan doğrulaması ile public task yayınını ayır; exact Docker fresh task yalnız private
  admission ve RELEASED sonrasında yayımlansın. Existing task stable/no-follow digest + CAS ile
  geçsin; sessiz overwrite veya public `.tasks` authority yok.
- Ardından T6 registry accepted-result await ve T7 ortak CLI/MCP/task-mode/manual-spawn application
  ingress'i. Build/sprint/runtime mutation bu imleçte yok.
- `SCOPE-REVISION-016`: start/autonomous/process-runtime callback fan-in'i T6'ya eklendi; manifest
  68 production + 209 mutation-support, duplicate/unassigned 0.

## T7 ortak task-ingress uygulama imleci — 2026-09-01 22:47 +03

- T6 exact-plan deferral/CAS ve accepted-result await tamamlandı. CLI `run`, MCP `run`, task-mode ve
  manual `spawn` artık tek `executeTaskIngress` application authority'sini çağırıyor; yüzeylerde
  ayrı worker spawn/task publication motoru yok.
- Ortak ingress her geçerli çağrı için invocation receipt açıyor. Exact Docker'da durable
  `dispatch_started`, yalnız RELEASED + provider-start acceptance sonrasında yazılıyor;
  `not-dispatched` zero-work bu olayla karıştırılmıyor. Unexpected post-dispatch hata terminal
  uydurmuyor, reconciliation-required kalıyor.
- Public task exact yolda yalnız RELEASED sonrası; existing task stable digest + CAS ile ilerliyor.
  Legacy compatibility yolu da provider/routing/budget/prompt admission sonrasına taşındı ve
  PENDING→EXECUTING overwrite yerine iki aşamalı CAS kullanıyor. Provider-adapter yokluğu artık
  sahte NO_GO result/task üretmiyor.
- Exact accepted result CLI/MCP/manual spawn tarafından raw `.result`, V1 settlement veya worker
  self-assessment ile DONE yapılmıyor. CLI i18n mesajıyla evaluation/settlement beklediğini söylüyor;
  MCP yalnız `ACCEPTED_AWAITING_EVALUATION` projectionı yayımlıyor. Terminal karar T11/T12'de.
- Kaynak type-check temiz. T7/T6 ilgili 13 dosyalık yardımcı batarya 145/145; iki yeni doğrudan
  yüzey custody kontrolü 2/2 PASS. Bunlar closure değildir; fresh bağımsız T7 source/wiring audit'i
  çalışıyor.
- Şimdiki iş: bağımsız T7 audit bulgularını fan-in et; blocker yoksa T7 source checkpointini kapatıp
  T8 XVerify exact producer/runtime dilimine geç. Build, dogfood run ve runtime mutation henüz yok.

## T7 bağımsız audit fan-in — 2026-09-01 23:02 +03

- Exact DIRECTIVES bataryası 11 dosya / 76 test PASS ve `npx tsc --noEmit` temiz; yalnız yardımcı
  kaynak kanıtıdır. Fresh bağımsız audit verdict'i `REVISE` (%96); T7 GO veya DONE değildir.
- Sağlam kalan çekirdek: CLI run, manual spawn, MCP run ve task-mode tek `executeTaskIngress`
  çağrısına iner; exact accepted result hiçbir doğrudan yüzeyde raw `.result`, V1 settlement veya
  worker `selfAssessment` ile terminal başarıya çevrilmez.
- BLOCKS_CURRENT_DONE: exact NOT_DISPATCHED/AMBIGUOUS receipt'lerinin non-lossy disposition ve
  invocation zincirine bağlanması; typed yüzey sonucu; host-adapter precedence; existing-task CAS
  yarış penceresi; gerçek dispatch sınırından başlayan yüzey gözlemi; manual-spawn composition
  authority; MCP raw-result summary; çakışmaz ID + job CAS/no-clobber; i18n ve exact MCP transport.
- Mevcut sidecar içinde düzeltilebilir: T6 scheduler/CAS ile T7 application/surface/job dosyaları.
  Sidecar dışı zorunlu adaylar (`src/cli/index.ts`, `src/core/invocation-receipt.ts` ve direct
  testleri) sessizce sahiplenilmeyecek; exact scope amendment olmadan mutation yok.
- Şimdiki iş: önce mevcut T6/T7 scope'unda non-lossy receipt, adapter precedence, CAS ve yüzey
  doğruluğunu düzelt; sonra kalan exact yeni-path gereksinimini owner scope sınırında raporla.
