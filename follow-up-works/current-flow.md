# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez.

## Canlı truth

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Aktif run yok. Son normal run `sprint-635`: 5/5 task `DONE`, RunFlow terminal event'i
  `RUN_COMPLETED`, canonical terminal archive verification GREEN.
- `sprint-635` manifesti 74 artifact, 0 conflict taşır; application receipt `applied`, Brain index
  ve guarded-summary digestleri manifest/seal ile bound. Hot sequence, sprint-owned handoff ve
  sprint-635 product-doc load-report residue yok.
- Sprint-634 aynı archive bytes ve Brain projectionını doğru üretmesine rağmen outer finalizer'ın
  same-commit sonrası detached SQLite/WAL re-open'ı yüzünden RunFlow `RUN_FAILED` olmuştu. Core
  sealer artık output-only same-commit verification döndürüyor; outer consumer application receipt
  digestleriyle eşleyip bunu tüketiyor. Public/later replay verifier bağımsız kalıyor. Sprint-635
  bu producer→consumer→entrypoint zincirinin normal-run acceptance canary'sidir.
- Archive writer static ratchet `lint:gates` içinde; full `npm run lint:gates`, 157 scoped test,
  TypeScript ve real-dist terminal verify green.
- İlgili stale critical debt current truth üzerinden kapandı; ledger 1 open / 374 resolved ve
  sprint-635 planına yeniden inject edilmedi. Protected root (`package.json`) worker WRITE
  authority'sinden çıkarılırken exact READ context olarak korunuyor.
- Bot daemon çalışıyor. Pending approval yok.
- Runtime hygiene formal different-provider XVerify, owner kararıyla
  `2026-08-24 20:00 Europe/Istanbul` sonrasındadır; bu saatten önce formal hygiene closure yok.

## Done-ready sayacı

- 1/20 — canonical terminal archive/finalizer normal dogfood acceptance.

## Sıradaki yürütme sırası

1. Provider observation unresolved interval reconciliation: fresh DB authority ölçümü, typed
   disposition, multi-task dogfood ve real-binary proof.
2. `2026-08-24 20:00 Europe/Istanbul` sonrasında runtime hygiene different-provider XVerify.
3. D4 Approval Lifecycle formal XVerify/closure; ardından D5 retirement.
4. 7091 Cursor production image + gerçek `--verifier cursor` smoke.
5. 7094 prefix/F2c default-ON ölçümü: measuredHitRatio + provider-reported USD.
6. Closure OS truth-sync → source/dist/provider adoption → owner disposition batches → yedi günlük
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
