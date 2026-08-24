# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez.

## Canlı truth

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Aktif run yok. Son outcome run'ı `sprint-639`: 4-task paralel Cursor production DAG'ı terminal
  `COMPLETE`; canonical archive 79/79 artifact, manifest digest, terminal seal ve Brain adoption
  doğrulaması yeşil.
- Provider observation reconciliation canlı uygulandı: 19 active-open interval'ın exact
  run/attempt settlement sahibi olan 15'i digest-bound plan + interactive approval + immutable
  receipt ile `retired=true` oldu; dört `sprint-488` legacy-unowned interval forensic `HOLD`
  olarak korundu. Compiled replay aynı receipt'i döndürdü; canonical status yalnız bu dört aktif
  interval'ı projekte ediyor.
- Bot daemon build sonrası yeniden başlatıldı ve ownership-bound PID ile çalışıyor. Pending
  approval yok.
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

## Done-ready sayacı

- 2/20 — canonical terminal archive/finalizer acceptance + provider-observation reconciliation.

## Sıradaki yürütme sırası

1. Provider resetini beklerken Closure OS truth-sync → source/dist/provider adoption.
2. `2026-08-24 20:00 Europe/Istanbul` sonrasında runtime hygiene different-provider XVerify.
3. Aynı reset sonrasında D4 Approval Lifecycle formal XVerify/closure; ardından D5 retirement.
4. 7094 prefix/F2c default-ON ölçümü: measuredHitRatio + provider-reported USD.
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
