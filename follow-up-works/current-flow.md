# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez.
> Aktif Codex→Codex devir authority'si: `ah-2026-08-24-codex-new-session`, epoch 2,
> `RECOVERY_COMMITTED`, receipt `sha256:db58fbcfa6d71a79d6667dd1b571068a5642ef8aece4330bb0b975159a4f9234`.

## Canlı truth

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
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
- Bot daemon fresh compiled dist ile PID `1317315` olarak çalışıyor. Pending approval yok.
- `.result` geçişi production-wired: worker claim'i ile host authority ayrıldı; exact
  `testVerification`, criterion-polarity/evidence, prompt compile-plan ID, current delivery
  attribution ve git-derived work attribution canonical result/finalizer consumerlarına ulaşıyor.
  Sprint-657'nin yakaladığı typed command + coverage=0 yanlış debt sınıfı bounded ADR-D-007
  recovery ile kapandı: evaluator typed `task.verification` authority-first, legacy prose yalnız
  fallback; unevidenced-claim ceiling typed PASSED executionı yalnız declared commandla exact
  eşleştiğinde kabul ediyor. Archived-shape regressionıyla 205/205 scoped test ve type-check yeşil.
  Fresh dist replay `DONE/100`; scoped changed battery 35 dosya/1,121 test, full lint ve
  `build:all` yeşil. Opus 5 owner-pair admission çözüldü fakat candidate-evidence producer provider
  çağrısından önce `limit_hold` verdi; usage/verdict/receipt yok, formal XVerify dürüstçe HOLD.
- Source→dist→provider runtime adoption production-wired: immutable composite receipt provider
  receipt + current DB lineage + source/build/entrypoint digest + canlı PID/start token'ı bağlıyor;
  real dist dry-run→apply→fresh-process replay aynı receipt'i verdi, DB/WAL/SHM değişmedi.
- 7091 production image/entrypoint dilimi canlı: `deckent-worker:latest` image içinde Cursor CLI
  non-root UID/GID ile çalışıyor ve yalnız read-only `auth.json` taşıyan isolated login smoke'u
  yeşil. Outer 7091 DONE değildir: gerçek xverify canonical account authority stub'ında HOLD;
  provider-native quota surface olmadığı için limit policy uydurulmadı.
- D4 Approval Lifecycle fresh closure recovery'si local olarak kapandı: `confirmations list`
  expiry-settling store yerine side-effect-free projection tüketiyor; 70 dosya/330 test, full
  lint, build ve real-binary byte-stability smoke yeşil. Formal Fable 5 XVerify provider call
  öncesinde canonical `weekFablePct=100` nedeniyle typed `HOLD` verdi; reset
  `2026-08-24 20:00 Europe/Istanbul`, mühür veya D4 `DONE` değildir.
- Runtime hygiene formal different-provider XVerify, owner kararıyla
  `2026-08-24 20:00 Europe/Istanbul` sonrasındadır; bu saatten önce formal hygiene closure yok.
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

1. `APPROVAL-INGRESS-UNKNOWN-ID-001` disk truth/SSOT diffini landing ritüeliyle commit et; push yalnız
   owner yeniden isterse. Parent `APPROVAL-001` broker residuallarını OPEN tut.
2. Archive replay hardening'i `LOCAL_VERIFIED/LIVE_PROVEN` tut; formal XVerify'ın iki
   `UNCLEAR/HOLD` sonucu yeni evidence veya farklı-provider authority olmadan retry edilmez.
3. `2026-08-24 20:00 Europe/Istanbul` sonrasında runtime hygiene different-provider XVerify.
4. Aynı reset sonrasında D4 Approval Lifecycle formal XVerify/closure; ardından D5 retirement.
5. Owner external key path'i sağlandığında Work 480 sign → append → closure gate → MASTER
   settlement zincirini tamamla; key'i arama/okuma/loglama.
6. 7091 account/limit authority yalnız provider-native fresh truth açıldığında yeniden denenir.
7. Closure OS owner disposition batches → yedi günlük
   health/ETA → cleanup/migration → release.
8. Product surface ve `MODULAR-BOUNDARY-FREEZE-001`; fiziksel Core/Enterprise extraction yalnız
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

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez.
- Aktif run sırasında build/auth mutation yapılmaz; canlı sprint owner onayı olmadan kill/cleanup
  edilmez.
- Commit/push öncesi branch, local/origin SHA ve scoped diff tekrar doğrulanır; push seyrek yapılır.
