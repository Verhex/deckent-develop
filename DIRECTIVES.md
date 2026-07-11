# DIRECTIVES — SPRINT-410: PUBLISH-CİLASI (494 dash-perf · 501 EPIPE · 505 doctor-ölü-ikiz)

## Goal
Yayın-öncesi kalite-cilası: dashboard bundle/istek-sağlığı + CLI boru-zarafeti + ölü-ikiz temizliği.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build / build:all dahil)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (dashboard için `npm run test:dashboard`).

## Task 1: DASH-PERF — MASTER-PLAN 494: React.lazy route-splitting + istek-dedup
- Model: sonnet | Agent: frontend-designer
- Files: src/dashboard/src/App.tsx, src/dashboard/src/lib/use-live-data.ts, tests/dashboard/dash-perf-494.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: none
### Description
Kanıtlı iki sorun (user-truth-audit W3): (1) App.tsx tüm route-bileşenlerini EAGER import ediyor
(~satır 6-26) → bundle şişkin (~%30-40 fazla); FIX: route-bileşenlerini `React.lazy(() => import(...))`
+ tek `<Suspense fallback>` (mevcut yükleme-göstergesi bileşeni varsa onu kullan; yoksa sade,
lucide-ikonlu — EMOJI YASAK) ile böl. (2) use-live-data.ts aynı endpoint'e eşzamanlı çoklu-istek
atabiliyor (polling-fırtınası); FIX: in-flight istek-dedup (aynı URL için süren promise paylaşılır)
+ unmount'ta iptal (AbortController) — polling-aralığı/veri-şekli DEĞİŞMEZ. Testler: lazy-split'in
varlık-pin'i (App source'unda React.lazy + eager-import'ların yokluğu) + dedup unit (fake-fetch:
eşzamanlı 3 çağrı → 1 fetch). Dashboard test-config'i AYRI: `npm run test:dashboard`
(vitest.dashboard.config.ts) — testini oraya uygun yaz ve o komutla koş.
### goNogo
- goCriteria: RED-önce (eager-import listesi + çoklu-fetch fixture-kanıtı); lazy+Suspense canlı; dedup+abort testli; `npm run test:dashboard` yeşil; davranış/veri-şekli değişmedi (pin).
- nogo: route davranışı/görseli değişirse NO_GO; emoji girerse NO_GO.

## Task 2: CLI-EPIPE — MASTER-PLAN 501: borulu-kullanımda zarif çıkış
- Model: sonnet
- Files: src/cli/entry.ts, tests/cli/epipe-graceful.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
Crashes-analizi (2026-07-07): kayıtların ~%80'i `write EPIPE` — `deckent status | head` gibi her
boru-kesiminde crash-log üretiliyor (publish-cilası: ilk-izlenim). FIX: process-level stdout/stderr
error-handler — hata `EPIPE` ise sessiz `process.exit(0)` (POSIX boru-geleneneği); DİĞER stream-hataları
mevcut davranışta kalır (yutma YOK — sınıf-ayrımı). Kurulum entry.ts'in erken-safhasında, bir kez;
crash-logger'ın EPIPE'ı artık kaydetmediği de pin'lenir. RED-önce: EPIPE-hatasının bugün handler'sız
fırladığının unit-kanıtı (stdout.emit('error', epipeErr) fixture). Cross-platform not: Windows'ta
eşdeğer kod `EOF`/`EPIPE` — ikisini de kapsa (Yasa #2).
### goNogo
- goCriteria: RED-kanıt; EPIPE/EOF → exit-0 sessiz (testli); diğer stream-hataları davranış-koruma (pin); crash-log EPIPE-kaydı düşmüyor; entry importer testleri yeşil.
- nogo: tüm stream-hataları yutulursa NO_GO.

## Task 3: DOCTOR-DEDUP — MASTER-PLAN 505: runPreFlightHealthCheck ölü-ikizi tekleştir
- Model: sonnet | Agent: bug-fixer
- Files: src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, tests/cli/doctor-dedup-505.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
W7-audit: `doctor.ts` ve `doctor-checks.ts` birbirinden bağımsız İKİ özdeş `runPreFlightHealthCheck()`
tanımlıyor — canlı yol doctor.ts (`deckent doctor --pre-flight`); doctor-checks.ts kopyası yalnız kendi
testince referanslı (ölü-ikiz; drift-mayını). FIX: TEK tanım kalsın — doctor-checks.ts'teki implementasyonu
doctor.ts'ten re-export'a çevir ya da tersine (hangisi daha az churn — mevcut import-yönlerine bak;
D-004 katman-kurallarına uy); ölü-ikizin KENDİ testi canlı-tek-tanımı test eder hale gelir (silme değil
yönlendirme — test-kaybı yok). İki tanımın bugün ÖZDEŞ olduğunu diff'le doğrula; değillerse farkı notes'a
yaz ve canlı-yolun davranışını koru. RED-önce: iki bağımsız tanımın varlık-kanıtı (kaynak-metin).
### goNogo
- goCriteria: tek-tanım (grep: `function runPreFlightHealthCheck` repo'da 1); re-export yönü D-004-temiz; her iki eski test-dosyası da yeşil (kayıpsız); doctor canlı-davranış pin'i.
- nogo: davranış farkı sessizce yutulursa NO_GO.
