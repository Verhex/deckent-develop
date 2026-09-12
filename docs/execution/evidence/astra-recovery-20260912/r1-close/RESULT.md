# R1 — 751 kapanışı, arşiv ve verification aktarımı

751 canonical `finalize --sprint sprint-751 --force --skip-decay --skip-hooks`
ile ABORTED kapandı (exit0). 0 tamamlanan, 1 unresolved; task başarısı iddia edilmez.
Önceki raporun outer negatif kapanış yolu olmadığı yorumu yanlıştı:
`src/orchestra/sprint-finalizer.ts:3935` mevcut forceAbortSprint bunu zaten yapıyor.
Native effect journal uyuşmazlığı ve accepted-result eksikliği ayrı HOLD kalıyor.

2026-09-12T20:21:02Z doğrulaması: sprint arşivi 12 artifact hash/byte eşleşti.
Kalan 18 inaktif dosya `src/core/maintenance-archive.ts:211` üzerinden,
manifest/content doğrulanıp kaynak emekliye ayrılarak korundu. `.tasks` dosya sayısı0.
Bu XVerify timeout veya UNCLEAR sonuçlarını PASS yapmaz. Aktif worker öldürülmedi.
Tam arşiv adresleri ve digestler archive-result.json, sprint manifesti ve
verification.json içindedir. İlk build:all exit0; clean gate ALLOW.

Verification aktarımının kök nedeni: PlannerTask ve Zod planner parser'ı testTarget
alanını taşımıyordu; run-proposal compiler mevcut DirectiveBuildTask.test alanını
doldurmuyordu. Alan eklendi; exact command/env/flags korunuyor. Mevcut parser →
sprint-planner → createTask → Task.verification hattı kullanılıyor. Yeni komut
çalıştırıcısı veya açıklamadan runtime komut tahmini eklenmedi. Boş, çok satırlı
ve NUL içeren komut reddediliyor. Eski komutsuz planlar kompatibl kalıyor; bunlar
kendiliğinden verification kanıtı kazanmaz.

Son scoped test: 115/115, exit0. İlk test fixture'ı üretim scope'u için wiring
bildirmediğinden null döndü; fixture test scope'una düzeltildi. Genişletilmiş
prompt-compile-authority koşusu 115 pass/2 fail, exit1: eksik V2 wiring fixture ve
memory-prefix eşitlik hatası. Bu iki hata kapatılmadı; repo-green iddiası yok.
TypeScript kontrolü exit0. Test logları birlikte korunur.

Yeni derlenmiş binary'nin read-only planning admission probu 192.26 saniyede
sonuç vermedi; yalnız bu probe SIGTERM ile durduruldu (exit143). Sağlık sonucu
UNKNOWN; eski native HOLD'un kalktığı iddia edilmez. Provider call veya yeni run yok.
Bulgular R1-A native disposition ve R1-E read amplification onarımını gerekli kılıyor.

Devam sırası: native effect negatif disposition; R1-C dependency/image parity ve
trusted verification kanıtı; R1-D ortak start admission; R1-E bounded read/status;
R1-F gerçek start/do retention sonucu. Bu paket bütün dogfood sürecinin DONE'u değil.

İkinci build:all (verification aktarımı dahil) exit0. Derlenmiş dist üzerinde
parser→compiler→task producer exact command probe PASS,exit0; persisted run veya
provider receipt üretmez. binary-verification-wire.json kayıtlıdır.
