# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez.
> Son tamamlanmış devir authority'si: `ah-2026-08-24-codex-to-claude`, **epoch 3**,
> `RECOVERY_COMMITTED` (transferee Claude), receipt
> `sha256:09a1f774689ed4e785fa859dbd3f574406da02c87d2080c94d773c281a05117a`;
> zincir PREPARED `af4752da…` → VERIFIED `e3b1fea2…` → RECOVERY_COMMITTED, authority-ref
> `owner-live-2026-08-24-go-full-authority-claude-8workers`. Yürütme yetkisi CLAUDE'da.

## ŞU AN — çalışma-imleci (Claude epoch-3, geçici iş-takibi)

> Bağlam kaybında buradan devam: aşağıdaki TAMAM-listesi bu gecenin landed-kanıtı,
> SIRADAKİ-listesi ise birebir yürütme sırasıdır.

- TAMAM (2026-08-24 gece, hepsi origin/main): `e41b3acae` sprint-661 paketi ·
  `e073da4e4` HIGH-1/2 (3 orphan gate + read-only pending discovery) · `b9c7b221b`
  hostTerminalProjection xverify-regresyon fix'i · `c173f4b70` flow-senkron ·
  `259c6472f` HIGH-3/4 (canary-arşiv lineage onarımı + config-owned thresholds) ·
  `06f201ae3` HIGH-5 + 7091 cursor build-arg fold. Formal mühürler: D4 discovery-purity
  `cfeaae18…` CONFIRMED, runtime-hygiene `094c1634…` CONFIRMED. Denetim-bulgu paketi 5/5 kapalı.
- TAMAM-EK (2026-08-25 gece, epoch-3 devam): `4c735a5be` koordinatör string-shape
  recovery R1 + 664-hasadı (worker-core provenance, nervous same-store accept) ·
  `23d0ad731` **normalizeChangedPaths tek-projeksiyon** (10 tüketici tek normalizer'a
  bağlandı — relPath.replace/file.startsWith ailesi KÖKten kapandı) + 665-hasadı
  (host-primary consumer'lar + 8-suite mutabakatı, durable notification-delivery core)
  + 3 straggler-fix; nervous+monitor+connectors süpürmesi **906/906 yeşil** (661-rewrite
  sonrası 15-kırmızıydı). 663/664/665 dürüst-ABORTED arşivde; false-NO_GO damgası
  koordinatör-çökme kaskadıydı, kök kapandı.
- ✅ TAMAM (2026-08-25 03:15): **skill-prompt tekrar-tekilleştirme** — `eeca1725b`:
  compose-anı süzme, tek `## Karpathy Discipline` çapası, 0 `## Karpathy Notes`
  (53/53 pin; canlı-prompt kanıtı bir SONRAKİ run'ın `.prompt-*` dosyasından okunacak).
  Sprint-666 = boru-hattı kanaryası: collect→evaluate→next-wave UÇTAN-UCA ÇALIŞTI
  (666-001 ilk-denemede DONE); fan-in typed-escalation'la dürüst-duraklatıldı
  (operatör-dersi: fan-in görevi acceptance-türüyle işaretle). Bonus canlı-kanıt:
  `.deckent/runtime/owner-notifications.jsonl` doğdu (665-002 delivery-core wired).
- ESKİ-KAYIT (tamamlandı, üstteki satıra katlandı): **skill-prompt tekrar-tekilleştirme** — her skill'in sonuna
  eklenen `## Karpathy Notes` bloğu worker-prompt'una 3 kez enjekte ediliyor (ölçüldü:
  `.tasks/.prompt-664-00{1,2,3}-*.txt` her birinde 3 kopya, satır ~67/~127/~214, ~36KB prompt).
  Çözüm-yönü (owner): tekrar-eden setler skill-gövdesinden çıkar, worker doğarken system-prompt
  kanalına (content-addressed `.worker-core-<digest>.md`) BİR kez enjekte edilir — biter gider.
  Uygulama yeri: skill-pool compose + prompt-god-template skill-birleştirme + worker-core builder;
  sprint-664 terminal olduktan sonraki İLK iş.
- SIRADAKİ (sıra bağlayıcı): (1) sprint-662 DIRECTIVES'i — event-authority/heartbeat-UI +
  Nervous→Telegram delivery-bridge + result-ingress tekilleştirme residual'ları, 8-worker dogfood
  DAG'ı olarak; (2) 7094 gerçek A/B cohort koşusu (ölçüm-hattı artık açık) → owner-karar raporu;
  (3) D5 retirement dilimi; (4) MASTER satır-senkronu (4056 D4 + 7091/7092 evidence güncellemesi);
  (5) Work-480 imza + Slack/Teams secrets = OWNER-işi, beklemede.

## Canlı truth

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- `DOGFOOD_HEALTH=RECOVERED` (2026-08-24 gece, epoch-3): sprint-661 paketi + ADR-D-007 elle-kapanış
  `e41b3acae` ile, HIGH-bulgu paketi (read-only pending discovery + 3 orphan gate kaydı + xverify
  reason ayrımı) `e073da4e4` ile, `hostTerminalProjection` cutover-regresyon fix'i `b9c7b221b` ile
  origin/main'e LANDED. Full lint 20-gate yeşil; `build:all` yeşil; documented bot stop/build/start;
  fresh gerçek-binary `status`/`bot status`/`inspect` proof alındı — source↔dist mismatch KAPALI.
  Formal XVerify boru-hattı onarıldı ve seri mühür üretiyor: D4 discovery-purity
  `cross-verify-verdict:sha256:cfeaae188a83736857e829247eb23560dc06ef7732f12fa3fa4466a0a633e028`
  (CONFIRMED, verifier claude-opus-5) ve runtime-hygiene
  `cross-verify-verdict:sha256:094c1634d0c75f77704b3fbc36c7185151faeffd522c4938092e88c7ad7bd13b`
  (CONFIRMED). Kök-neden: strict TaskResultV1 cutover'ın `hostTerminalProjection` alanını
  düşürmesi (FIX-loop ile aynı defekt-sınıfı) + tam-dosya evidence'ın ~2KB'de kesilmesi — çözüm
  bounded `--target` satır-dilimi disiplini. Tarihsel not: `sprint-661` owner-authorized
  force-finalization ile terminal
  `ABORTED` kapandı. Canonical receipt içindeki `logicalProgress` 7 done/1 blocked/1 active derken
  `terminalEvidence` 6 completed ve archived top-level task JSON'ları 6 DONE/3 ABORTED gösteriyor;
  hiçbir unresolved lineage `COMPLETE` yapılmadı. Canonical terminal receipt generation 19,
  logical settlement digest
  `346910bbe3308fff8c345d8e6ba9ce98ad192b22f9498f2e5d8612baa4acb248`, recovery state
  `consistent`; aktif run/worker/coordinator ve pending approval yok.
- Sprint-661 source paketi scope compiler/admission, canonical result attribution, heartbeat/status,
  worker-core provenance/archive replay ve scheduler/finalizer zincirlerini değiştirdi. Owner'ın
  bounded ADR-D-007 recovery talimatıyla result ingress ve host-terminal heartbeat wire'ı elle
  kapatıldı; `tsc --noEmit`, 89/89 scoped regression ve dokuz-task fan-in 109/109 yeşil. Bu yalnız
  `LOCAL_VERIFIED` source kanıtıdır: post-terminal full lint, `build:all`, fresh-process ve gerçek
  binary proof yapılmadı; source↔dist mismatch açıktır ve bot PID `242187` eski dist'i çalıştırır.
- Task 006 ve Task 008 FIX worker sonuçları gerçekte DONE ve exact testleri yeşildi. Strict
  `TaskResultV1` schema additive `promptCompilePlanId`, `testVerification` ve
  `techDebtCriterionIds` alanlarını taşımadığı için assembler bunları düşürdü; normalizer
  `NOT_EXECUTED/[]` türetti ve Brain aynı işi `schema invalid/NO_GO` ile FIX→FIX-FIX loop'una soktu.
  Source recovery bu üç alanı canonical schema/assembler/backend authority zincirine bağladı;
  build ve real-binary adoption devralan authority'nin ilk closure işidir.
- `.worker-core-*` result schema değil, content-addressed Markdown system-prompt artifactıdır.
  Sprint-661 Task 008 full SHA-256 immutable core, exact task-attempt-provider/channel/argv receipt
  ve archive replay ekledi; 37 test yeşil. Agent/skill injection canlıdır. Full dist/runtime proof
  alınmadığı için production closure iddiası yapılmaz.
- `.hb` defect'i kullanıcı yüzeyi blocker'ıdır: bitmiş Task 006'nın worker dosyası hâlâ legacy
  dört-alanlı `EXECUTING` kaldı; host observation aynı attempt için terminal DONE truth'u taşıdı.
  Source recovery host-terminal observation sonrası exact-attempt v1 `.hb` projectionı yazıyor,
  fakat worker tool-activity anlık akışı, `.log` gecikmesi ve UI/Terminal/Dashboard tek read-model
  closure'ı tamamlanmadı. Mtime/time-only freshness veya elle `seq=99` iki ayrı SSOT olamaz;
  canonical append-only activity/event authority + monotonic projection zorunludur.
- Nervous dormant değildi: event/metrics'ten `SPRINT_START operation=resume-paused-run`
  recommendation üretti. Fakat recommendation yalnız dismiss edilebilirken `nervous accept`
  farklı pending-notification store'unu okudu ve `not found` döndü; Telegram botu sprint/resume/FIX/
  failure/approval olaylarının hiçbirini bildirmedi. Recommendation, approval ve notification
  brokerları arasında production disposition/delivery bridge eksiktir.
- Sprint-660 RCA gerçeği korunur: Task 003 pre-spawn read/write-overlap exception'ında bounded
  settlement olmadan tekrarlandı; Task 004 resultı Brain tarafından okundu fakat glob write grant
  attribution'da literal sayılarak false outside-scope üretildi. Sprint-661 bu kapsamı tüketti;
  yeni outcome açılmaz, residuallar mevcut `RUNFLOW-001`, `EVALUATION-001`, scheduler,
  prompt-authority, status/heartbeat ve notification MASTER satırlarında taşınır.
- Aktif worker yok. `sprint-659` iki paralel ilk-wave acceptance taskı + bağımlı fan-in taskıyla
  terminal `COMPLETE` (3/3 logical DONE). API ve MCP unknown/forged approval ID ingressleri gerçek
  compiled binary üzerinden typed `APR_UNKNOWN_REQUEST` ile fail-closed; karar dosyası oluşmadı ve
  redler durable audit'e yazıldı. Scoped birleşik batarya 50/50, full lint ve `build:all` yeşil.
  Canonical archive verify 52 artifact için temiz; terminal/manifest digestleri doğrulandı.
  `sprint-658` aynı DAG'ın ilk koşusuydu: MCP test mock'undaki eksik `renameSync` yüzünden FIX
  write-authority kazanamadı, resume fan-in result authority'sini bulamadı ve run owner-authorized
  finalization ile dürüstçe `ABORTED` kapandı. Bounded ADR-D-007 recovery yalnız test mock'unu
  düzeltti; yeniden dogfood `sprint-659` ile kanıtlandı.
- Fresh compiled runtime'da `sprint-657` iki paralel ilk-wave taskı + bağımlı
  fan-in taskıyla terminal `COMPLETE` (3/3 logical DONE). Current prompt-delivery receipt,
  typed verification commandı, agent/skill attribution ve finalizer consumer zinciri üç taskta da
  canlı görüldü. Canonical archive 52 artifact/438,838 byte; manifest verify ve terminal-verify
  `ok=true`, Brain archive index/summary yenilendi, legacy `.tasks/archive`/`.brain/archive`
  yollarına sprint-657 raw write yok.
- Provider observation reconciliation canlı uygulandı: 19 active-open interval'ın exact
  run/attempt settlement sahibi olan 15'i digest-bound plan + interactive approval + immutable
  receipt ile `retired=true` oldu; dört `sprint-488` legacy-unowned interval forensic `HOLD`
  olarak korundu. Compiled replay aynı receipt'i döndürdü; canonical status yalnız bu dört aktif
  interval'ı projekte ediyor.
- Sprint-637'nin altı stale PENDING task artifact'ı canonical archive writer ile
  `.deckent/archive/sprints/sprint-637/tasks/` altına byte-identical taşındı; manifest/integrity
  6/6 yeşil, `.tasks` elle silinmedi.
- Root `.tasks` altındaki 63 `task-xv*` artifact hash-korumalı biçimde
  `.tasks/archive/xverify-settled-2026-08-24/` staging archive'ına taşındı; root eşleşme sıfır,
  `rm` kullanılmadı. Product canonical one-shot task archive surface'i henüz yok.
- Bot daemon PID `242187` ile çalışıyor; source↔dist mismatch nedeniyle fresh source'u temsil
  etmiyor. Pending approval yok; listelenen eski kayıtlar terminal `EXPIRED` audit geçmişidir.
- Sprint-657 tarihsel `.result` dilimi production-wired: worker claim'i ile host authority ayrıldı; exact
  `testVerification`, criterion-polarity/evidence, prompt compile-plan ID, current delivery
  attribution ve git-derived work attribution canonical result/finalizer consumerlarına ulaşıyor.
  Sprint-657'nin yakaladığı typed command + coverage=0 yanlış debt sınıfı bounded ADR-D-007
  recovery ile kapandı: evaluator typed `task.verification` authority-first, legacy prose yalnız
  fallback; unevidenced-claim ceiling typed PASSED executionı yalnız declared commandla exact
  eşleştiğinde kabul ediyor. Archived-shape regressionıyla 205/205 scoped test ve type-check yeşil.
  Fresh dist replay `DONE/100`; scoped changed battery 35 dosya/1,121 test, full lint ve
  `build:all` yeşil. Opus 5 owner-pair admission çözüldü fakat candidate-evidence producer provider
  çağrısından önce `limit_hold` verdi; usage/verdict/receipt yok, formal XVerify dürüstçe HOLD.
  Sprint-661 strict-schema counter-evidence'ı full result cutover closure'ını supersede eder;
  source recovery real-binary adoption görmeden yeniden production-wired sayılmaz.
- Source→dist→provider runtime adoption production-wired: immutable composite receipt provider
  receipt + current DB lineage + source/build/entrypoint digest + canlı PID/start token'ı bağlıyor;
  real dist dry-run→apply→fresh-process replay aynı receipt'i verdi, DB/WAL/SHM değişmedi.
- 7091 production image/entrypoint dilimi canlı: `deckent-worker:latest` image içinde Cursor CLI
  non-root UID/GID ile çalışıyor ve yalnız read-only `auth.json` taşıyan isolated login smoke'u
  yeşil. Outer 7091 DONE değildir: gerçek xverify canonical account authority stub'ında HOLD;
  provider-native quota surface olmadığı için limit policy uydurulmadı.
- D4 Approval Lifecycle discovery-purity artık İKİ katmanlı kapalı: `confirmations` VE
  `pending-approvals` (status/bot inbox) read-yolları side-effect-free projection (EXPIRE-SWEEP
  read-hook'u emekli, `e073da4e4`); üç orphan authority-gate `lint:gates`'e kayıtlı ve yeşil.
  Formal mühür: CONFIRMED `cross-verify-verdict:sha256:cfeaae18…33e028` (verifier claude-opus-5,
  2026-08-24 gece). Kalan: lifecycle `enabled` staged-rollout owner-kararı + D5 retirement.
- Runtime hygiene formal different-provider XVerify CONFIRMED:
  `cross-verify-verdict:sha256:094c1634…7bd13b` (661-arşiv-manifesti + hygiene-doc lifecycle +
  gate-kaydı bounded-target kanıtıyla, 2026-08-24 gece).
- 7094 measurement authority producer→archive reader→kernel→immutable receipt→i18n CLI zinciri
  LOCAL_VERIFIED. Formal Fable 5 koşusu provider call öncesi typed `limit_hold/unavailable` verdi;
  receipt yok, default flip yok. Outer 7094 gerçek comparable A/B cohortlarını beklediği için OPEN.
- Work 1055 XVerify production wiring functional olarak kapandı. Exact Sol→Opus owner-pair
  authority, model-scoped limit policy ve parser→adjudication fail-closed zinciri gerçek
  `claude-opus-5` call ile `CONFIRMED/allow` üretti; provider-reported usage/USD, terminal
  settlement ve durable receipt
  `cross-verify-verdict:sha256:299d10b3f9b636be07cfa38a2607b6bf6ed1defb3733838109595257ba5ffd87`
  mevcut. MASTER satırı CM-04, PROVIDER-INGRESS-001 ve G1/G7 gate authority nedeniyle dürüstçe
  `BLOCKED` kalır; receipt veya state uydurulmaz.
- XVerify response authority `reason=8192 char`, `semantic=65536 char`, `raw=196608 byte` olarak
  tek contracttan çözülüyor; truncation yok, aşım typed HOLD. Manual spawn ve mandatory
  exact-coordinator artık aynı closed-settlement task projection service'ini tüketiyor. Fresh
  Opus canary `CONFIRMED/allow`; base ve internal task otomatik `DONE`.
- Work 480 Opus teknik XVerify'ı `CONFIRMED/allow`. Closure OS dry-run bundle
  `cb3eb74b4598…`, canonical request `aprcdb-cb3eb74b4598bacc49b9ea6204208cca` ve interactive
  terminal `allow` kararı tamamlandı. Trust-anchor kimliği artık generated MASTER'dan
  uydurulmuyor; dry-run/claim/append canonical anchor scope'unu tüketiyor. Ledger append owner
  custody'deki repo-dışı Ed25519 key ile signing ceremony beklediği için Work 480 hâlâ OPEN/HOLD.
- Status projection'daki dört unresolved provider interval fresh değildir: hepsi `sprint-488`
  legacy-unowned forensic kayıttır. Exact owner/run authority bulunmadan retire edilmeyecek ve
  yeni interval gibi sayılmayacak.
- Archive hardening için iki fresh Sol→Opus formal XVerify gerçek provider call, provider-reported
  usage ve durable receipt üretti; host adjudicator ikisini de `inaccurate missing-evidence map`
  gerekçesiyle `UNCLEAR/HOLD` kapattı. New evidence olmadan üçüncü retry yapılmaz; formal closure
  20:00 Fable reset'i veya owner-admitted adjudicator fix'i bekler.

## Done-ready sayacı

- 9/20 — canonical terminal archive/finalizer acceptance + provider-observation reconciliation +
  source/dist/provider runtime adoption + 7094 production measurement authority + Work 1055
  XVerify production wiring + response-budget authority + settlement projection parity + current
  prompt-delivery/structured-result authority + API/MCP unknown-ID approval ingress acceptance.

## Sıradaki yürütme sırası

1. ✅ TAMAM (2026-08-24): devir zinciri PREPARED→VERIFIED→RECOVERY_COMMITTED, epoch 3, Claude.
2. ✅ TAMAM: source↔dist kapanışı — full lint (20 gate), `build:all`, bot stop/build/start,
   fresh gerçek-binary proof. Sprint-661 `ABORTED` tarihi korunuyor.
3. ✅ TAMAM: sprint-661 paketi sınıflandırılıp landed — `e41b3acae` + `e073da4e4` + `b9c7b221b`
   (origin/main). Runtime-untracked `closure-staging/`+`logs/` bilinçli dışarıda (gitignore
   owner-kararı bekliyor).
4. Residual production closure'ı yeni outcome açmadan mevcut MASTER kapsamlarına işler:
   canonical host event SSOT→monotonic `.hb`/`.log`→Status/UI/Dashboard/Nervous; Nervous
   recommendation→local disposition→Telegram durable delivery; tek result ingress/schema/
   evaluator authority; bounded FIX/no-birth settlement.
5. Token ve coverage için aynı-workload measured A/B canary kur: prompt bytes, fresh input,
   cache-read, turns/retries ve retry reason ayrı ölçülür; coverage `REQUIRED | NOT_APPLICABLE |
   UNMEASURED` typed applicability + changed-code/critical-branch threshold olarak uygulanır.
6. Local/real-binary proof green ise fresh different-provider XVerify'ı bir kez çalıştır; gerçek
   call + provider usage + closed settlement + durable receipt yoksa typed HOLD bırak.
7. Archive replay hardening'i `LOCAL_VERIFIED/LIVE_PROVEN` tut; formal XVerify'ın iki
   `UNCLEAR/HOLD` sonucu yeni evidence veya farklı-provider authority olmadan retry edilmez.
8. ✅ TAMAM: runtime-hygiene different-provider XVerify CONFIRMED —
   `cross-verify-verdict:sha256:094c1634d0c75f77704b3fbc36c7185151faeffd522c4938092e88c7ad7bd13b`.
9. KISMEN: D4 discovery-purity + gate-kaydı formal CONFIRMED —
   `cross-verify-verdict:sha256:cfeaae188a83736857e829247eb23560dc06ef7732f12fa3fa4466a0a633e028`;
   D4 outer closure için kalan: lifecycle `enabled` staged-rollout owner-kararı + D5 retirement
   (hiç başlamadı).
10. Owner external key path'i sağlandığında Work 480 sign → append → closure gate → MASTER
   settlement zincirini tamamla; key'i arama/okuma/loglama.
11. 7091 account/limit authority yalnız provider-native fresh truth açıldığında yeniden denenir.
12. Closure OS owner disposition batches → yedi günlük
   health/ETA → cleanup/migration → release.
13. Product surface ve `MODULAR-BOUNDARY-FREEZE-001`; fiziksel Core/Enterprise extraction yalnız
   dependency kapıları açıldıktan sonra.

## Ölçülmüş non-blocking finding

- Effective `cleanup_delay_ms=180000`, normal run terminal publicationını task settlementından sonra
  yaklaşık üç dakika geciktiriyor. Sprint-635 correctness'i bozmadı; execution-surface latency işi
  owner admission olmadan bu outcome'a alınmaz.
- Docker worker içindeki CLI fresh host build'e rağmen `DECKENT_BINARY_IDENTITY_HOLD
  build-root-mismatch` verdi; host CLI fresh. Every-environment/path-adapter parity bulgusudur ve
  owner admission olmadan archive outcome'una alınmaz.
- Formal XVerify host adjudicator, atomic targeted claim'de dahi inaccurate missing-evidence map
  üretti; owner-admitted ayrı execution-surface işidir, kör retry yapılmaz.
- Sprint-658 FIX gerçekten üretildi fakat read-only acceptance taskından inherited boş
  `filesWrite` ile gerekli test-fixture repair'ini yapamadı; ardından fan-in result authority'si
  üretilemedi ve resume terminalizer `TERMINALIZATION_RESULT_AUTHORITY_MISSING` verdi. Bu bulgu
  mevcut `RUNFLOW-001` repair-authority/checkpoint-finalization kapsamındadır.
- Sprint-659 coordinator, terminal receipt sonrası arşiv manifestini yayımlamadan canlı kaldı;
  owner-authorized force-finalize containment'ı tamamladı fakat
  `SPRINT_ARCHIVE_EXISTING_SEAL_IDENTITY_MISMATCH` raporladı. Canonical archive sonunda temizdir;
  finalizer idempotency/cleanup bulgusu mevcut runflow/recovery kapsamına aittir.
- Sprint-660 shadow journal `legacyDecision` alanı gerçek legacy engine outputu değil,
  live-observed diff'tir; reducer çalışmış fakat effect spawn öncesi fail etmiştir. `executedEngine`
  parametresi caller tarafından geçirilmediğinden journal operatöre ters okunabilir. Bu finding
  `SCHEDULER-SHADOW-EVIDENCE-001` kapsamındadır ve yeni sprint scheduler taskına bağlıdır.
- Sprint-660 terminal projectionı hiç doğmamış 003 için `neverDispatched:false` ve empty attempt
  `INVALID_IDENTITY` taşıdı; replan proposal concrete write ihtiyacını `access:read` yazdı. Bunlar
  mevcut settlement/FIX authority scope'larına bağlı fresh counter-evidence'tır; historical satırlar
  elle reopen edilmez.
- Sprint-661 archived result aggregate'i 15,677,605 total token; 1,195,881 fresh input, 142,140
  output ve 14,339,584 cache-read'dir. Prompt-minimization flags canlıydı; yüksek totalin baskın
  kısmı cache-read ve repeated attempt/FIX/FIX-FIX'tir. Prefix saving kazanımı kaybolmuş diye
  doğrudan hükmedilemez, fakat retry amplification end-to-end kazanımı geri vermiştir. En büyük
  kaldıraç safety/context silmek değil, false retry loop'larını ve oversized tool-result tekrarını
  yok etmektir.
- Rubric, schema-validity, criterion polarity, debt ve final disposition bugün operatör yüzeyinde
  birbirine karışıyor: Sprint-661'de rubric 100 olan işler coverage=0 yüzünden NO_GO, testleri geçen
  Task 006 schema gate yüzünden rubric 0, bazı DONE sonuçları GO_WITH_TECH_DEBT oldu. UI her criterion
  için `success polarity`, `evidence`, `schema validity`, `rubric score`, `final disposition`ı ayrı
  göstermelidir; no-go criterion için `UNMET` başarı olabilir.
- Coverage test sayısı değildir; executed statement/branch/function/line oranıdır. Yaklaşık 40k
  testin tamamını her worker'da coverage ile çalıştırmak pahalı ve yanlış teşviklidir. Riskli slice
  için changed-code/critical-module branch coverage, aggregate trend için ayrı CI/nightly cohort;
  targeted tests + wiring + real-binary proof primary kalmalıdır. Coverage ölçülmediyse `0` değil
  typed `UNMEASURED/NOT_APPLICABLE` yazılır.
- Aktif sprint PAUSED iken önce clean gate HOLD verdiği halde doğrudan `tsc + copy-assets`
  çalıştırılması Codex operasyon kuralı ihlalidir. Sprint sonrası source tekrar değiştiği için bu
  build zaten stale'dir; handoff'ta gizlenmez ve tekrar kullanılmaz.
- `deckent kill <taskId>` canlı exact Docker worker varken `Worker bulunamadı` döndürdü; owner'ın
  explicit kill talimatıyla exact containerlar durduruldu. Control/status projection ile process
  truth ayrışması ve `FIX_PHASE_FAILED: relPath.replace is not a function` mevcut RUNFLOW/status
  kapsamlarında blocker olarak kalır.
- Aynı terminal receipt içinde `logicalProgress=7 done/1 blocked/1 active`,
  `terminalEvidence.completedLogicalTaskCount=6` ve archived task projectionı 6 DONE/3 ABORTED
  ayrışır. Bu tek-sprint için üç farklı completion sayacı operator surface'ine taşınamaz; canonical
  settlement reducerından tek monotonic read-model üretilmelidir.

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez.
- Aktif run sırasında build/auth mutation yapılmaz; canlı sprint owner onayı olmadan kill/cleanup
  edilmez.
- Commit/push öncesi branch, local/origin SHA ve scoped diff tekrar doğrulanır; push seyrek yapılır.
