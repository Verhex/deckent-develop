# GEÇİCİ AKIŞ — REPO-HYGIENE

> SSOT `docs/MASTER-PLAN.md` olarak kalır. Bu dosya yalnız aktif temizlik sırasını ve ürün
> işlerine dönüşte kaybolmaması gereken continuation noktalarını taşır. Her temizlik kararı
> Alperen tarafından dosya/family bazında verilir.

## Aktif karar

- `DOGFOOD_MODE=OFF` — owner kararı: `owner-live-2026-08-23-repo-hygiene-dogfood-off`.
- Ürün implementation ve MASTER backlog yürütmesi geçici olarak durduruldu.
- Tek aktif outcome: repository noise reduction ve fiziksel düzen.
- Yeni Deckent sprint/run/task/settlement state'i oluşturulmaz.
- Her silme öncesinde ownership, Git tracking, referans, producer/consumer, test ve recovery
  değeri incelenir; karar Alperen'e sunulur. Onaysız family-wide deletion yapılmaz.

## Tamamlanan ilk adım

- [x] Sprint-625 terminal authority doğrulandı: `ABORTED`, coordinator absent, active=false,
  resumable=false, terminal receipt consistent.
- [x] `.tasks` envanteri: 4.068 file + 896 directory, 9.668.282 byte, Git-tracked file yok.
- [x] Owner talimatıyla `.tasks` içeriği arşivlenmeden temizlendi; `.tasks/` root'u boş tutuldu.

## Sıradaki repo-temizlik sırası — owner kararıyla tek tek

- [ ] `.deckent/recently-works/`: her top-level file/directory için producer, referans ve gerçek
  devam değeri; özellikle `phase5-batch-staging-2026-08-17` ve `recovery-not-dispatched`.
- [ ] `.deckent/runtime/`: DB/token/authority dosyalarını koruyan family inventory; tek-seferlik
  start/log/tmp/projection dosyaları ayrı karar paketleri.
- [ ] `.deckent/` diğer top-level gürültü: generated projection, cache, stale receipt, staging,
  one-shot JSON ve legacy compatibility family'leri.
- [ ] Root ve `docs/`: tek-seferlik brief/evidence/report dosyaları; canonical SSOT veya yaşayan
  referansı olmayanlar için referans + test bağımlılığı analizi.
- [ ] `tests/`: yalnız kaldırılması owner tarafından onaylanan production/document surface ile
  birlikte artık anlamı kalmayan exact testleri değerlendirme; coverage düşüşünü ayrıca raporlama.
- [ ] `follow-up-works/` ve `docs/execution/active/`: tüketilmiş geçici akış/capsule dosyalarını
  delete-on-consume kuralıyla sadeleştirme.
- [ ] Son repo düzeni: top-level tree, `.deckent` tree, docs index/link, config projection ve
  git-ignore kurallarını yeniden doğrulama.

## Ürün işlerine dönüşte continuation

- [ ] Runtime hygiene paketi farklı-provider XVerify: owner-deferred tarih
  `2026-08-24 20:00 Europe/Istanbul`; o zamana kadar final Closure/DONE değil.
- [ ] Manual `deckent spawn --force` ile sprint executor arasındaki final-only usage containment
  parity gap'i: manual redrive provider çağrısından önce measured-stream admission'da HOLD oldu.
- [ ] D4 Approval Lifecycle formal XVerify ve devamındaki D5 legacy decision-surface retirement.
- [ ] 7091 Cursor production-image rebuild/tag ve gerçek `--verifier cursor` smoke.
- [ ] 7094 prefix/F2c ek ölçümü: flags değiştirilmeden measuredHitRatio + provider-reported USD.
- [ ] Closure OS sırası: truth-sync → source/dist/provider adoption → owner disposition batches →
  7 günlük health/ETA → cleanup/migration → release.
- [ ] Product-surface ve modular Core/Enterprise planı, repo temizliği bittikten ve owner
  `DOGFOOD_MODE=ON` kararını yeniden verdikten sonra MASTER önceliğine göre yürütülür.

## Korunan authority

- `.brain/memory.db` silinmez veya taşınmaz.
- Credentials, auth, token, key, live DB/WAL/SHM ve çalışan daemon authority'si family cleanup'a
  dahil edilmez.
- Commit/push yalnız Alperen'in ayrı talimatıyla yapılır.
