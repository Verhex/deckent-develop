# R1-C dependency/image dilimi — LOCAL_VERIFIED, outer HOLD

2026-09-12 UTC; MASTER120 / RECOVERY-DO-DOGFOOD-001; epoch7, DOGFOOD DEGRADED.
Owner devam talimatı ve R1-C kapsamı. Sprint/worker/provider çağrısı açılmadı.

Kaynak src/cli/repl/app.tsx:1806 useApp().suspendTerminal kullanıyor. Host Ink7.1.1,
shrinkwrap/image7.0.5 idi. package.json gereksinimi ^7.1.1, canonical shrinkwrap7.1.1
oldu. npm yalnız bu dependency kayıtlarını değiştirdi; host node_modules mutate edilmedi.
Root ve assets/Dockerfile.worker eşitlendi: paketlenen dosyaya mevcut CODEX_VERSION
arg/pin taşındı; root dosyaya mevcut asset non-root Cursor installer/zstd düzeltmesi
alındı. Repo/package drift testi eklendi. Genel provider-version policy dönüşümü yok.

Kanıtlar:
- Lock update exit0; worker image tests31PASS/3SKIP,exit0. SKIP gerçek runtime PASS değildir.
- npm run build:all exit0.
- docker build candidate deckent-worker:r1-20260912 exit0; ID image-id.txt içinde.
- Canonical checkWorkerImage(requiredProviders=[codex]) ready,exit0; gerçek native
  manifest ve dependency-source denetimi. Bu API yalnız mevcut readiness sözleşmesini
  kanıtlar; tüm dependency lock/source karşılaştırmasını yaptığı iddia edilmez.
- Salt okunur, non-root, network-none image içinde kendi /app/node_modules ile
  aynı Git-tracked kaynak tsc exit0. Node24.15.0,Ink7.1.1. Kaynak tar digest kayıtlı.
- Exact runner/no-cache komutu tests/core/observability*.test.ts testlerini gerçekten
  çalıştırdı:69PASS/2FAIL,exit1. 437/457 çevresindeki bilinen retention davranış
  hataları sürdü. Test koşulmuş olması başarılı retention settlement değildir.

İlk probe yanlışlıkla nested desktop node_modules kopyaladı: tmp alanı doldu ve
TypeScript OOM oldu. Bu başarısız harness kanıtı failed-probe altında korunur.
Düzeltme: git ls-files ile izlenen src/tests/config dosyalarını tar ederek mevcut
kaynak byte'larını image içinde kullanmak; host node_modules hiçbir biçimde taşınmaz.

Candidate image korunuyor; latest etiketi/config otomatik değiştirilmedi. Eski
image'ın diğer provider capability'leriyle activation parity ayrıca doğrulanmalı.
C açık: dispatch öncesi project/dependency identity parity, provider-version policy
ve healthcheck kapsamı; A native invalid-effect disposition; D ortak start admission;
E bounded snapshot performansı; F gerçek dogfood retention. DONE/XVerify yok.

Cursor'a ENTRY223 terminal kapanış işi atandı; start.ts onun tek-yazar scope'u.
Bu turda ACK henüz gelmedi. Kanal bildirimi worker başladı kanıtı değildir.
