# M5-FLIP-EVIDENCE — native-flip stabilizasyon-kanıt koşumu (375-008)

Sprint 375, Task 375-008 (M5-PROOF-HARNESS). ADR-D-010'un davranış-sözleşmesi
(FIFO / kayıpsız / dupe-yutma / ESC-temizle + steer-öne-geçiş + stream-segmenter
tamamlama/UTF-8-sınır/clear-recreate + cursor-model code-point güvenliği) bugüne kadar
yalnız **her modülün kendi izole birim-testinde** kanıtlıydı (`tests/cli/repl-input-queue.test.ts`,
`tests/cli/repl-cursor-model.test.ts`, `tests/cli/repl/f11-016-stab.test.tsx`,
`tests/cli/repl/stream-segmenter-utf8.test.ts`). Bu belge, o sözleşmenin
**app.tsx'in native-agent bayrağı AÇIK iken gerçekten kullandığı kompozisyon şeklinde**
(`nativeEngine` dalı, `src/cli/repl/app.tsx:850-863` — `inputIter` drain-loop'unun,
`app.tsx:798-838`, sürdüğü) hâlâ ayakta olup olmadığının kanıt-raporu.

Kaynak: `tests/cli/native-stabilization-proof.test.ts` (bu görevin yazdığı yeni süit,
13 test, 10 senaryo grubu) + yukarıdaki mevcut birim-test dosyaları (referans/karşılaştırma).

**Bu belge M4→M5 flip kararını VERMEZ.** Flip'in kendisi (native-agent'ı varsayılan
yapmak) Alperen + CC işi; bu görev yalnız o kararın dayanacağı kanıt-tabanını üretir.

---

## Metodoloji

Ink mount / PTY yok — `ink-testing-library` proje bağımlılığı değil (önceki teyit:
`tests/cli/repl/f11-016-stab.test.tsx` başlık yorumu). `native-stabilization-proof.test.ts`
içindeki `createNativeModeHarness()`, app.tsx'in GERÇEK saf çekirdeklerini
(`input-queue.ts`, `busy-controls.ts`, `stream-segmenter.ts`, `cursor-model.ts`, app.tsx'in
kendi export ettiği `steerNotesToInputs`/`truncateQueuePreview`) app.tsx'in **native dalının
gerçekte çalıştırdığı sırayla** bir araya getiren modül-seviyesi bir kompozisyon: dequeue →
`markBusy()` → `await nativeEngine(line, ...)` → `segmenter.flush()` → `markIdle()` →
steer-drain → `steerNotesToInputs` ile öne-geçişli birleştirme (app.tsx:798-863 ile birebir
aynı sıra, sonsuz `wake` promise'ı yerine kuyruk boşalınca duran sonlu bir sürüm).
`nativeEngine`/`output` fake'leri sağlayıcı çağrısının VE Ink render'ının yerini alır — hiçbiri
mock/stub değil, gerçek çekirdek fonksiyonlar gerçek davranışlarıyla çalışıyor.

Bayrak-temellendirmesi: süitin ilk describe bloğu, `isNativeAgentEnabled({DECKENT_NATIVE_AGENT:'1'},[])`
ve `isNativeAgentEnabled({},['--native'])` ikisinin de `true` döndüğünü doğrular — kompozisyonun
gerçekten "native-flag'li yapılandırma" olduğunu, tesadüfen değil.

---

## Senaryo-bazlı hüküm tablosu

| # | Aile (ADR-D-010 sözleşme maddesi) | Senaryo | Hüküm | Kanıt |
|---|---|---|---|---|
| 1 | FIFO | Kuyruklanan satırlar `nativeEngine`'e submit sırasıyla dispatch edilir | ✅ yeşil | `native-stabilization-proof.test.ts` — "dispatches queued lines to nativeEngine in exact submit order" |
| 2 | Kayıpsızlık | `nativeEngine` bir turu await ederken gelen yeni satır kaybolmaz, sıradaki tur olarak dispatch edilir | ✅ yeşil | "a line submitted WHILE nativeEngine is awaiting is queued and dispatched next, not dropped" |
| 3 | Dupe-yutma | Aynı metnin ardışık ikinci Enter'ı native submit sınırında yutulur (asla iki kez dispatch olmaz) | ✅ yeşil | "an immediate resubmission of the same trimmed text swallows, never double-dispatches" |
| 4 | Dupe-guard reset | Bir tur dispatch olduktan sonra AYNI metin bilinçli tekrar edilirse artık yutulmaz | ✅ yeşil | "the dupe guard resets after a turn dispatches — a deliberate later repeat is not swallowed" |
| 5 | ESC/cancel temizleme | `cancel()` (app.tsx:897'nin `Canceller`'ı) bekleyen kuyruğu tur-ortasında boşaltır | ✅ yeşil | "cancel() (the Canceller app.tsx:897 wires into applyInterrupt) empties the queue" |
| 6 | ESC/cancel + dupe-guard reset | Cancel sonrası aynı metin tekrar queueable (kalıcı blok yok) | ✅ yeşil | "resets the dupe guard so the same text is queueable again right after a cancel" |
| 7 | Steer-öne-geçiş | Tur-ortasında `/steer` notu, AYNI tur penceresinde queue'lanan gerçek bir mesajdan ÖNCE dispatch edilir — native dispatch loop'unun İÇİNDE kompoze edilerek | ✅ yeşil | "a /steer note submitted mid-turn is dispatched BEFORE a real message queued in the same turn" — dispatch sırası `['task1', 'urgent-note', 'task2']` |
| 8 | Stream-segmenter tamamlama | Düzyazı satırı + kod bloğu + tablo, YALNIZ `nativeEngine`'in `output()` callback'i üzerinden akıtıldığında doğru sırayla emit olur | ✅ yeşil | "prose lines, a fenced code block, and a table all emit correctly through the native path" |
| 9 | Stream-segmenter UTF-8 sınırı | Türkçe+emoji satırı native `output()` üzerinden bayt-bayt (her sınır kod-noktası ortasında) beslendiğinde bozulmadan birleşir | ✅ yeşil | "reassembles a Turkish+emoji line fed through nativeEngine output() one byte at a time" — çıktı orijinalle birebir, `U+FFFD` yok |
| 10 | Stream-segmenter clear-recreate | Native oturum ortasında `/clear` (segmenter'ı yeniden yaratma) öncesi buffer'lanan partial, post-clear metne asla eklenmez | ✅ yeşil | "recreateSegmenter() (the clearScreen FIX-3 mechanism) starts clean; the old partial never stitches onto post-clear text" |
| 11 | Cursor-model (KALAN a) code-point güvenliği | `cursor-model.ts` ile inşa edilmiş (insert/move ile eklenmiş emoji) bir buffer, submit→dequeue→`nativeEngine(line)` round-trip'ini bozulmadan (lone-surrogate'sız) geçer | ✅ yeşil | "an emoji built via insert/move survives the whole submit→dequeue→nativeEngine(line) round-trip unbisected" |
| 12 | Queue-preview code-point güvenliği | `truncateQueuePreview`, native submit'lerle doldurulmuş canlı kuyruğun snapshot'ına karşı hâlâ code-point-safe | ✅ yeşil | "a long emoji-heavy line queued through submit() truncates without bisecting a surrogate pair" |

**Toplam: 12 senaryo (13 test — #3/#4 dupe-guard ailesi 2 ayrı test içeriyor), 12/12 yeşil.**
goCriteria eşiği "≥8 senaryo" idi — 12 ile karşılanıp aşıldı.

Kanıt komutları (bugün, disk-üzerinde çalıştırıldı):

```
npx tsc --noEmit
  → temiz (0 hata)

npx vitest run tests/cli/native-stabilization-proof.test.ts
  → 1 dosya, 13 test, 13 passed (0 failed)
```

---

## Kapsam-dışı bırakılanlar — dürüst envanter (ne KANITLANMADI)

Bu koşum, ADR-D-010'un "native-flag'li kompozisyon" sorusuna cevap verir — ama ADR-D-010'un
kendi KALAN-envanterindeki üç maddeyi **kapatmaz**, çünkü bunlar bu görevin yazma-yetkisi
dışındaki dosyalarda (`line-edit.ts`, `input-bar.tsx`, `run.tsx`/`app.tsx`'in kendisi) yaşıyor
ve zaten flag'den bağımsız, önceden var olan boşluklar:

1. **KALAN (a) — cursor-model henüz gerçek input-bar'a bağlı değil.** Bu koşum
   `cursor-model.ts`'in ÇEKİRDEĞİNİN queue/dispatch hattıyla temiz kompoze olduğunu kanıtlıyor
   (senaryo #11), ama gerçek REPL'de kullanıcının yazdığı metin hâlâ `line-edit.ts`'in
   UTF-16 code-unit imlecinden geçiyor (ADR-D-010 satır 63-66/82) — bu, native bayrağı açık
   OLSUN ya da OLMASIN aynı, flag'den bağımsız bir boşluk.
2. **KALAN (b) — queue-preview genişlik-farkında değil.** `truncateQueuePreview`'ın sabit
   60-kolon sınırı (`app.tsx:346-347`) bu koşumda da (senaryo #12) değişmedi — code-point-safe
   olduğu doğrulandı, genişlik-farkındalığı doğrulanmadı (zaten yok).
3. **KALAN (c) — tur-ortası iptal (mid-turn abort) loop-side hâlâ eksik.** Bu koşumun
   `cancel()`'ı (senaryo #5/#6) yalnız HENÜZ BAŞLAMAMIŞ kuyruklu satırları temizliyor —
   app.tsx:893-896'nın kendi yorumunun dediği gibi, `runChatNativeLoop`/`nativeEngine`'de
   gerçek bir provider-abort seam'i yok. Bu koşum bunu DEĞİŞTİRMEDİ (kapsam dışı — task
   write-scope `run.tsx`/`app.tsx`'i yasaklıyor), yalnız zaten bilinen bu sınırı tekrar
   doğruladı: `nativeEngine` dalı da, `runChatNativeLoop` dalı da AYNI `cancelPendingInputs`
   mekanizmasını paylaşıyor (app.tsx:897) — yani bu, flip'e ÖZGÜ bir risk DEĞİL, her iki dalda
   da eşit derecede var olan bir sınır.
4. **Gerçek sağlayıcı / gerçek terminal koşulmadı.** `nativeEngine` burada bir fake; gerçek
   `native-agent-bridge.ts`/`native-transport.ts` üzerinden gerçek bir model çağrısı,
   gerçek MCP tool-dispatch, ya da gerçek bir PTY'de render bu koşumun kapsamında değil
   (task metninin kendisi bunu istemiyor: "PTY gerekmez — modül-seviyesi kompozisyon").
5. **ZWJ-birleşik emoji (aile emoji) grapheme-cluster güvenliği** — `cursor-model.ts`'in
   kendi modül-başlığında zaten dürüstçe işaretlenmiş bilinen bir sınır (code-point-safe,
   grapheme-cluster-safe değil); bu koşum bu sınırı genişletmedi/kapatmadı.

---

## Hüküm — flip-hazır mı?

**Kuyruk/dispatch/streaming/steer sözleşmesi (ADR-D-010'un asıl "native-flip stabilizasyon"
iddiasının çekirdeği) için: EVET, kompozisyon-kanıtı hazır.** 12/12 senaryo, app.tsx'in
gerçek native-dalı sırasında, gerçek çekirdek modüllerle, yeşil. `nativeEngine` dalının
`inputIter`'ı `runChatNativeLoop` dalıyla AYNI queue/steer/segmenter altyapısını paylaştığı
(app.tsx:798-849 her iki dalın da ORTAK kod yolu, yalnız 850-863'teki dispatch hedefi
değişiyor) bu koşumla doğrulandı — flip, queue/streaming/steer'in DAVRANIŞINI değiştirmiyor,
yalnız hangi fonksiyonun her satırı işlediğini değiştiriyor.

**Ama üç şart net şekilde flip kararından BAĞIMSIZ, önceden var olan borç olarak kalıyor**
(yukarıdaki KALAN (a)/(b)/(c)) — bunlar flip'i ENGELLEMEZ (çünkü her iki dalda da eşit
şekilde mevcutlar, flip onları ne kötüleştirir ne iyileştirir), ama flip ne zaman yapılırsa
yapılsın Alperen+CC'nin ayrıca, kendi zaman çizelgesinde kapatması gereken açık maddeler
olarak KALMALI — bu koşumun "flip-hazır" hükmü bu üç maddeyi sessizce kapatılmış gibi
göstermemeli.

**Kısa hüküm: "flip-hazır (kuyruk/streaming/steer kompozisyonu için), şu-3-madde-hâlâ-açık
(cursor-wiring, width-aware preview, mid-turn abort — flip'e özgü değil, genel REPL borcu)."**

---

## Referanslar

- `tests/cli/native-stabilization-proof.test.ts` — bu görevin yeni kanıt-süiti (13 test).
- ADR-D-010 (`.brain/memory.db`, `deckent recall "ADR-D-010"`) — davranış-sözleşmesi + KALAN-envanteri.
- `src/cli/repl/app.tsx:798-863` — `inputIter` drain-loop + `nativeEngine` dalı (bu koşumun taklit ettiği gerçek sıra).
- `src/cli/repl/{input-queue,busy-controls,stream-segmenter,cursor-model,native-flag}.ts` — kompoze edilen gerçek çekirdekler.
- `tests/cli/repl-input-queue.test.ts`, `tests/cli/repl-cursor-model.test.ts`,
  `tests/cli/repl/f11-016-stab.test.tsx`, `tests/cli/repl/stream-segmenter-utf8.test.ts` —
  bu koşumun referans aldığı izole birim-testler.
- MASTER-PLAN Row-62 (F11-016) — bu belge, flip kararına giden kanıt zincirinin bir parçası;
  Row-62'nin kendisi KALAN (a)/(b)/(c) kapanana kadar 🟡 kalıyor (bu görev onu değiştirmiyor).
