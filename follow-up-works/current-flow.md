# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez.

## Canlı truth

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Aktif run yok. Son normal outcome run'ı `sprint-646`: dört-task paralel DAG terminal
  `COMPLETE`. Canonical terminal receipt generation 1, raw archive, manifest/hash/integrity ve
  Brain archive projection zinciri doğrulandı.
- Provider observation reconciliation canlı uygulandı: 19 active-open interval'ın exact
  run/attempt settlement sahibi olan 15'i digest-bound plan + interactive approval + immutable
  receipt ile `retired=true` oldu; dört `sprint-488` legacy-unowned interval forensic `HOLD`
  olarak korundu. Compiled replay aynı receipt'i döndürdü; canonical status yalnız bu dört aktif
  interval'ı projekte ediyor.
- Sprint-637'nin altı stale PENDING task artifact'ı canonical archive writer ile
  `.deckent/archive/sprints/sprint-637/tasks/` altına byte-identical taşındı; manifest/integrity
  6/6 yeşil, `.tasks` elle silinmedi.
- Bot daemon fresh compiled dist ile PID `745913` olarak çalışıyor. Pending approval yok.
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

## Done-ready sayacı

- 7/20 — canonical terminal archive/finalizer acceptance + provider-observation reconciliation +
  source/dist/provider runtime adoption + 7094 production measurement authority + Work 1055
  XVerify production wiring + response-budget authority + settlement projection parity.

## Sıradaki yürütme sırası

1. Owner external key path'i sağlandığında Work 480 sign → append → closure gate → MASTER
   settlement zincirini tamamla; key'i arama/okuma/loglama.
2. Sıradaki multi-task dogfood run'ı 7094 plan-time authority'nin canlı canary'si yap; sonra aynı
   workload treatment cohort'u ile measuredHitRatio + provider-reported USD receipt'i üret.
3. `2026-08-24 20:00 Europe/Istanbul` sonrasında runtime hygiene different-provider XVerify.
4. Aynı reset sonrasında D4 Approval Lifecycle formal XVerify/closure; ardından D5 retirement.
5. 7091 account/limit authority yalnız provider-native fresh truth açıldığında yeniden denenir.
6. Closure OS owner disposition batches → yedi günlük
   health/ETA → cleanup/migration → release.
7. Product surface ve `MODULAR-BOUNDARY-FREEZE-001`; fiziksel Core/Enterprise extraction yalnız
   dependency kapıları açıldıktan sonra.

## Ölçülmüş non-blocking finding

- Effective `cleanup_delay_ms=180000`, normal run terminal publicationını task settlementından sonra
  yaklaşık üç dakika geciktiriyor. Sprint-635 correctness'i bozmadı; execution-surface latency işi
  owner admission olmadan bu outcome'a alınmaz.

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez.
- Aktif run sırasında build/auth mutation yapılmaz; canlı sprint owner onayı olmadan kill/cleanup
  edilmez.
- Commit/push öncesi branch, local/origin SHA ve scoped diff tekrar doğrulanır; push seyrek yapılır.
