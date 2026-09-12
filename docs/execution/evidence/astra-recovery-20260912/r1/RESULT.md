# R1-A — journal saat gerilemesi; recovery closure HOLD

Owner “Evet başlayalım” ile R1 planını başlattı. Epoch7 COMMITTED; DOGFOOD ON,
HEALTH DEGRADED. MASTER120 / RECOVERY-DO-DOGFOOD-001. Manuel ürün değişikliği
yalnız bu typed ADR-D-007 engine onarımında; yeni worker/run açılmadı.

## Kök neden

751 attempt `9d2ee9c9-500c-82a2-8f44-8b668521df43` için mevcut immutable journal:

- PREPARED `2026-09-12T18:54:51.893Z`
- APPLYING `2026-09-12T18:54:51.608Z`: predecessor'dan **285ms önce**.
- İki artifact'ın içerik SHA256'sı receipt'iyle eşleşiyor; applying'in
  preparedJournalDigest ve fencingTokenDigest alanları predecessor ile eşit.
- Salt okunur gerçek bundle doğrulaması null döndü. Geçici, yalnız bellekte
  instrument edilmiş dist kopyasında ilk anlamlı ret fan-in applying timestamp
  karşılaştırması: `dist/core/execution-effect-persistence-contract.js:2031`, kaynak
  `src/core/execution-effect-persistence-contract.ts:2803` çevresi.
- Coordinator `hostTimestamp()` doğrudan duvar saatini okuyordu. Clock rollback
  yeniden üretiminde normal apply ve restart da COMMITTED journal üretip daha sonraki
  Store kabulünde reddedilecek ters zaman dizisini oluşturabiliyordu.

Tam path/digest/UTC: [clock-regression.json](clock-regression.json).
`verify-bundle.mjs` yalnız forensic read helper'ıdır; native Store authority veya
provider receipt üretmez. Bellek instrumentation'ındaki diğer null satırları alternatif
parser dallarıdır; tümü bağımsız arıza olarak yorumlanmaz. OS saatinin neden geri gittiği
(NTP/WSL vb.) bu çalışmada kanıtlanmadı; ürün wall-clock gerilemesine dayanmalıdır.

## Değişiklik

`src/orchestra/execution-effect-landing-coordinator.ts`: yeni publication timestamp'leri
doğrulanmış predecessor zamanının gerisine düşmez. Locator, applying, step ve committed
sırası; restart'ta persisted predecessor ve initial prepare'da final capture zamanı
korunur. Zamanlar mantıksal wall-time'dır; performans/süre ölçümü sayılmaz.
`ExecutionEffectLandingAdaptersV1.nowIso` isteğe bağlı host clock portu, malformed
girdi reddi ve legacy adapter compatibility ile bağlandı.

`src/orchestra/spawn-backend-docker.ts`: gerçek landing adapter seti mevcut
`nextExactDockerTimestamp()` clock'unu coordinator'a verir; staged capture ve journal
ayrı duvar saati kaynakları kullanmaz. Yeni kalıcı store, clock modu veya receipt
şeması oluşturulmadı. `tests/orchestra/execution-effect-landing-coordinator.test.ts`
rollback apply/restart + shared clock/invalid clock regresyonlarını taşır.

Eski751 journal, receipt, task, `.brain/memory.db`, provider auth ve runtime state
değiştirilmedi. Reader'ın strict timestamp kontrolü gevşetilmedi. Bu yama geçmişteki
hatalı journal'ı geçerli göstermez.

## Doğrulama

| Komut / aşama | Sonuç | Exit |
|---|---|---|
| Vitest coordinator `-t 'keeps journal causal time'`, onarım öncesi | 2/2 FAIL; 35 seçilmeyen test | 1 |
| Coordinator + effect-store-adapter, ilk causal-order düzeltmesi | 61/61 PASS; 104.70s | 0 |
| Coordinator, son shared-clock wiring sonrası | 38/38 PASS; 2.79s | 0 |
| `npx tsc --noEmit`, shared-clock wiring sonrası | PASS | 0 |
| Scoped source/test/plan/status `git diff --check` | PASS | 0 |
| Tüm checkpoint `git diff --check`, raw loglar dahil | Üç Vitest logunda EOF blank-line; ham kanıt baytları korundu | 2 |
| `npm run build:all` | Clean admission HOLD, derleme başlamadı | 1 |

Vitest: `VITEST_MAX_FORKS=2 npx vitest run --configLoader runner --no-cache` ve
ilgili dosyalar. Ayrı koşular birleştirilerek tek 62/62 koşu iddiası üretilmez.
Tam loglar aynı dizinde. Full-suite ve different-provider XVerify koşulmadı.

## Kapanış niçin hâlâ HOLD

1. 751 geçmiş journal'ı immutable ve bugünkü reader'a göre geçersiz. Yeni producer
   düzeltmesi bunu retroaktif olarak düzeltemez.
2. `TaskAttemptCustodyStore.inspectRejectedResultDispatchCandidate`
   (`src/core/task-attempt-custody-store.ts:7825`) önce verified effect-landing chain
   ister. Bu nedenle malformed/clock-regressed landed effect bu negative closure
   türüne sokulamaz; ayrıca bu tür worker schema rejection içindir, generic NO_GO değildir.
3. `ExecutionEffectStoreAdapterV1.readCommittedReleasePendingEvidence`
   (`src/orchestra/execution-effect-store-adapter.ts:741`) release progress varsa
   null döner. 751 resources release zinciri ilerlemiş. Bu yolun sonucu zaten
   UNRESOLVED retention'dır, terminal settlement değildir.
4. Build clean gate de tutulan751 EXECUTING task'ını ve ikinci XVerify child'ının
   receipt'i eksik PENDING durumunu reddetti: E_CLEAN_ACTIVE_EXECUTION_HOLD.
   Fresh canonical kontrol active=false/coordinator=dead ve Docker yalnız local-llm
   gösterse de bu farklı task/receipt kapısını geçerli yapmaz. Bypass uygulanmadı.

Sonuç **LOCAL_VERIFIED producer repair / PRODUCTION_CLOSURE_HOLD**. R1-A, R1-B ve outer
outcome DONE değildir. `.tasks` temizlenmedi; 752 veya yeni canary yok. Main dist eski
build'de kaldı; bu source değişikliğinin build/runtime proof'u var denemez.

## Sonraki exact teknik sınır

R1-A kapanışı için mevcut recovery servisinde **etkisi main'de kalmış fakat effect
receipt'i kabul edilemeyen terminal attempt'in negatif disposition'ı** eksik. Bu,
verified-landing rejection veya unlanded/no-effect quarantine diye yeniden etiketlenemez.
Gerekli contract: exact admission/attempt ve mevcut immutable inventory → gerçek
stopped execution/resource absence + host postimage → hash-bound rejection reason →
append-only negative disposition → finalizer/sprint archive consumer. Result acceptance
ve effect success üretmemeli; kaynak kanıtları korumalı; repeat idempotent, drift/live/
sibling/tenant mismatch HOLD olmalı. Mevcut broad retain bayrağını terminal saymak yasak.

Bu yeni negatif durum için producer/Store validator/recovery/finalizer/archive
sözleşmesi birlikte sınırlandırılmadan runtime'a geçici JSON yazılmayacak. Aynı751
recovery komutu tekrar tekrar çalıştırılmadı. R1-B cleanup ancak bu terminal kanıt
üretildikten sonra; R1-C…F sırası korunuyor.

Cursor ENTRY221 digest doğrulandı ve arşivlendi; ENTRY222 ile ACK/REPL pause korundu.
Start215/216 bulguları R1-D proof kapsamına alındı, yeni terminal işi başlatılmadı.
