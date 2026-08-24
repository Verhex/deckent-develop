# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez.

## Canlı truth

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Aktif run yok. Son outcome run'ı `sprint-642`: 5-task 7094 measurement-authority DAG'ı;
  dört implementation lineage'ı settled, dar finalizer/FIX scope'u kapanamadığı için dürüst
  `ABORTED`. Production fan-in post-terminal ADR-D-007 recovery seam'inde kapandı; run geçmişi
  sahte `COMPLETE` edilmedi.
- Provider observation reconciliation canlı uygulandı: 19 active-open interval'ın exact
  run/attempt settlement sahibi olan 15'i digest-bound plan + interactive approval + immutable
  receipt ile `retired=true` oldu; dört `sprint-488` legacy-unowned interval forensic `HOLD`
  olarak korundu. Compiled replay aynı receipt'i döndürdü; canonical status yalnız bu dört aktif
  interval'ı projekte ediyor.
- Sprint-637'nin altı stale PENDING task artifact'ı canonical archive writer ile
  `.deckent/archive/sprints/sprint-637/tasks/` altına byte-identical taşındı; manifest/integrity
  6/6 yeşil, `.tasks` elle silinmedi.
- Bot daemon fresh build sonrası PID `419599` ile çalışıyor. Pending approval yok.
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
- Status projection'da yalnız principal `c38a…` altında dört fresh unresolved provider interval
  var; historical 19-interval settlement paketiyle karıştırılmadan ayrı reconcile edilecek.

## Done-ready sayacı

- 4/20 — canonical terminal archive/finalizer acceptance + provider-observation reconciliation +
  source/dist/provider runtime adoption + 7094 production measurement authority.

## Sıradaki yürütme sırası

1. Principal `c38a…` altındaki dört fresh unresolved interval'ı exact run/attempt disk truth ile
   reconcile et; historical sprint-488 forensic HOLD'larla birleştirme, kör apply etme.
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
