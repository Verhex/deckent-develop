# REPL Tool-Protokolü — Kök-Teşhis Raporu (Sprint 285 · T-285-001)

**Tarih:** 2026-06-12
**Kaynak bulgu:** `docs/alperen-analysis/2026-06-12-repl-tool-parser-findings.md`
**Repro testi:** `tests/cli/repl-tool-multi-tag-repro.test.ts` (9 test, 9 yeşil — başlangıçta 4 `it.fails`-pin idi; fix'ler inince yeşil regresyon-guard'a çevrildi)
**Kapsam:** teşhis + repro. Fix-sahipleri T2 (H1) / T3 (H2) / T4 (H3) — **hepsi LANDED** (aşağıdaki Kapanış).

---

## Kapanış — cross-fix 285-001-xfix (2026-06-12)

Bu tanı raporu yazıldıktan sonra **üç kök-fix de aynı sprint içinde src'ye indi (LANDED)**;
cross-fix turunda kod-okumayla teyit edildi. Repro'nun 4 `it.fails`-pin'i (H2-A/B/C, H3) bu
yüzden artık gövdeleri GEÇTİĞİNDEN "Expect test to fail" ile suite'i kırmızıya çeviriyordu
(NO_GO zincirinin kök-nedeni). Tasarımın kendi sinyali uyarınca ("gövde geçer → `it.fails`
kırmızıya döner = pin'i sök") pin'ler **yeşil regresyon-guard'a** çevrildi — artık FIX'lenmiş
davranışı doğruluyorlar.

| Fix | Sahip | LANDED kanıt (current file:line) |
|-----|-------|----------------------------------|
| **H1** FIFO confirm kuyruğu | T2 | `src/cli/repl/app.tsx` — `createConfirmQueue` :55-102, enqueue-ezme-yok :284-285, `[i/N]` kartı :448-460, deny-iptal-etmez :428-431 |
| **H2** Stream-toplama uzlaştırma | T3 | `src/cli/commands/chat-session.ts` — `parseStreamJsonLine` `assistant` event→`assistantText` :362-379; `runTurn` "en-uzun kaynağı seç" uzlaştırma :515-524 (all-or-nothing kapısı kalktı) |
| **H3** Çoklu tool-sonucu | T4 | `src/cli/commands/chat-session.ts` — `turnInput` ardışık tüm tool-mesajlarını toplar :464-488 |
| Telemetri (parsed-vs-executed + malformed) | T5 | `src/cli/commands/chat-session.ts` :532-540 (`parseDeckentToolCallsFull` + `getMessage('tui.tool_telemetry_mismatch')`) |

`DECKENT_AGENTIC_SYSTEM_PROMPT`'taki "AÇIKLAMA YAPMA" kısıtı T3 ile yumuşatıldı (H2 bölümü).
Aşağıdaki tanı prosa'sı orijinal haliyle korunur; her hipoteze **DURUM** satırı eklendi.

> Not: aşağıdaki bölümlerdeki bazı satır-numaraları tanı-anındaki kaynağa aittir; güncel
> konumlar yukarıdaki Kapanış tablosundadır (fix'ler dosyaları kaydırdı).

---

## 0. Yöntem ve doğrulanmış olgular

İki katman **kod-okumayla DOĞRU** olarak teyit edildi (bulgular bunların ÜSTÜNDE bir yerde):

- **Parser DOĞRU** — `parseDeckentToolCalls` (`src/cli/commands/chat-session.ts:103-123`):
  `DECKENT_TOOL_TAG_RE = /…/gi` + `while ((m = …exec(text)))` döngüsü → tur içindeki **tüm**
  etiketleri, prose-konumundan **bağımsız** olarak bulur. Repro-anchor testi bunu kanıtlar
  (`anchor — parseDeckentToolCalls is position-independent`: 3 etiket, araları prose, hepsi bulunur).
- **Motor DOĞRU** — `runChatNativeLoop` (`src/cli/commands/chat-native.ts:815-823`):
  `for (const call of response.toolCalls) { … await dispatcher.dispatch(call.name, call.args) … }`
  → toolCalls listesindeki **tüm** çağrıları **sırayla (await ile)** dispatch eder.

Demek ki "çok-tag'li turda yalnız biri yürüyor" bulgusu parser/motor'da DEĞİL; ya (a) `collected`
metni etiketleri eksik taşıyor (H2), ya (b) onay-katmanı düşürüyor (H1), ya da (c) çok-sonuç
modele eksik dönüyor ve model tek-tag'e yakınsıyor (H3). Üçü de aşağıda ayrıştırıldı.

---

## 1. (H1) Ink confirm tek-slot çökmesi

**VERDICT: çok-tag-collapse kök-nedeni olarak ÇÜRÜTÜLDÜ — ama gizli kırılganlık DOĞRULANDI.**

### Kanıt (file:line)
- `src/cli/repl/app.tsx:178` — `confirmResolve = useRef<((a: ConfirmAnswer) => void) | null>(null)`
  → onay-resolver'ı için **tek slot**.
- `src/cli/repl/app.tsx:196-200` — `registerConfirm((summary) => new Promise((resolve) => {
  confirmResolve.current = resolve; setConfirm({ summary }); }))` → her tetikte slot **üzerine yazılır**.
- `src/cli/repl/app.tsx:341-346` — `useInput((input) => { … const r = confirmResolve.current;
  confirmResolve.current = null; r?.(answer); }, { isActive: confirm !== null })` → tek tuş, tek slotu boşaltır.
- `src/cli/repl/run.tsx:64-72` — `askConfirm` → `await confirmTrigger(summary)`; tek `await`, dönene kadar bloklar.
- `src/cli/commands/chat-native.ts:815-823` — dispatch döngüsü **sıralı/`await`'li**.

### Analiz
Motor dispatch'i sıralı olduğu için `dispatcher.dispatch` (dolayısıyla `askConfirm` →
`confirmTrigger`) **bir sonraki çağrı başlamadan önce çözülür**. Tek slot bu yüzden uçuş-anında
ezilmez; N ardışık onay sırayla kullanıcıya ulaşır. Repro `H1 — … SEQUENTIAL dispatch`: 3 ardışık
`askConfirm` → 3'ü de gösterilir (`shown == ['cmd-0','cmd-1','cmd-2']`, hepsi `true`). Yani H1
gözlenen "yalnız sonuncu çalışır" semptomunun **birincil nedeni DEĞİL**.

**Ancak** tasarım yine de kırılgan: kuyruk yok. İki onay araya `await` girmeden tetiklenirse
(re-entrant/eşzamanlı yol; örn. ileride paralel-dispatch ya da bir tool sink'inin senkron yeni
confirm tetiklemesi) ikinci tetik birinci resolver'ı **ezer** ve birincisi **öksüz kalır** (asla
çözülmez → o aksiyon sessizce askıda kalır). Repro `H1 — … CONCURRENT confirms` bunu deterministik
gösterir: `cmd-a` + `cmd-b` ardışık tetiklenir, tek tuş yalnız `cmd-b`'yi çözer, `cmd-a` 25ms
içinde "orphaned" kalır.

### Fix sahibi → **T2** (Tur-içi tool-KUYRUĞU + per-tool sıralı onay)
FIFO confirm-kuyruğu: pending-confirm varken gelen yeni confirm ezmez, kuyruğa girer; `[i/N]`
göstergesi; deny-birini-geç-diğerine; `a` kararı aynı-tool kuyruk-kalanına uygulanır. Tek-slot
yerine kuyruk = hem sıralı yol korunur hem eşzamanlı/re-entrant yol güvenli olur. (H1 repro'ları
app.tsx'in **modeli**dir — `ink-testing-library` proje-bağımlısı değil; T2 gerçek-PTY doğrulamasını
`scripts/ink-pty-test.mjs` deseniyle ekler.)

**DURUM (LANDED):** T2 indi — `app.tsx` `createConfirmQueue` (FIFO, `:55-102`), enqueue tek-slotu
ezmez (`:284-285`), `[i/N]` kartı (`:448-460`), deny kuyruğu iptal etmez (`:428-431`). H1 model
testleri (SEQUENTIAL + CONCURRENT) yeşil kalır; queue'nun kendi davranış-testleri ayrı dosyada
(`tests/cli/repl-confirm-queue.test.ts`, T2 — 7 test yeşil).

---

## 2. (H2) Stream-toplama blok-kaybı

**VERDICT: DOĞRULANDI — prose-konumu hassasiyetinin ve çok-tag kaybının BİRİNCİL kök-nedeni.**

### Kanıt (file:line)
- `src/cli/commands/chat-session.ts:237-285` — `parseStreamJsonLine` YALNIZ iki şeyden text üretir:
  (1) `content_block_delta` → `delta.text` (`:276-282`, ham veya `stream_event` zarfı `:271-274`),
  (2) `result` → `resultText` (`:249-261`, yalnız **fallback** olarak). **`assistant` tipli
  tam-mesaj event'i** (`{ type:'assistant', message:{ content:[{type:'text',text}] } }`) ve
  `text_delta` dışındaki blok-tipleri (ör. `input_json_delta`) **hiç toplanmaz** → `{text:'', done:false}`.
- `src/cli/commands/chat-session.ts:355-371` — `runTurn` toplama döngüsü:
  `collected += parsed.text` (yalnız delta-text); `result` gelince
  `if (collected.length === 0 && parsed.resultText) collected = parsed.resultText` (`:367`) →
  **all-or-nothing fallback**: `collected` doluysa (tek bir delta bile gelse) tam `resultText`
  **atılır**.
- `src/cli/commands/chat-session.ts:377` — `parseDeckentToolCalls(collected)` eksik `collected`
  üzerinde çalışır → etiket(ler) sessizce kaybolur.

### Analiz
"Çıplak etiket anında çalışır, uzun prose-sonu etiket yakalanmaz" semptomu tam olarak buradan gelir:
çıplak etiket tek delta'da gelir → `collected` etiketi taşır → parser bulur. Prose + sonda-etiket
senaryosunda ise etiketi taşıyan blok delta-akışı dışında (`assistant` tam-mesaj event'inde ya da
yalnız `result` text'inde) gelebiliyor; `collected` prose-delta'larıyla **dolu** olduğundan
`result` fallback'i atlanır ve etiket düşer. Çok-tag durumunda da delta-akışına giren etiketler
sağ kalır, geç/blok-dışı gelen etiketler kaybolur → "N tag'ten yalnız biri yürüdü" (dogfood #1).

Üç repro bunu kanıtlar (hepsi `it.fails`-pin; fix gelince yeşile dönüp pin sökülür):
- `H2-A`: prose delta + etiket yalnız `result`'ta → all-or-nothing fallback düşürür (`collected.length===0` kapısı).
- `H2-B`: etiket yalnız `assistant` tam-mesaj event'inde, `result` boş → assistant-text hiç toplanmaz.
- `H2-C`: tag-1 delta'da + tag-2/tag-3 `assistant` event'inde → `collected` yalnız tag-1'i taşır (3 → 1 undercount).

Kontrol testi (`H2 — CONTROL`) etiket delta'da geldiğinde **doğru** çalıştığını (1 toolCall, `stopReason==='tool_use'`) gösterir.

### Fix sahibi → **T3** (Stream-toplama sağlamlığı — prose-konum bağımsızlığı)
`runTurn`-toplama, **tüm text-taşıyan stream-json blok-tiplerini** `collected`'a katmalı:
text-delta + `assistant` tam-mesaj content-block'ları + `result`-text uzlaştırması (en-kapsamlı
kaynağı seç; all-or-nothing gate'i kaldır). Karar notu: `result`/`assistant` tam-metni
delta-toplamından **uzun**sa onu otorite al (delta'lar partial olabilir). Ayrıca
`DECKENT_AGENTIC_SYSTEM_PROMPT`'taki "AÇIKLAMA YAPMA" kısıtı (`chat-session.ts:89`) bu kırılganlığın
**semptomu**dur — T3 sonrası "kısa açıklamadan sonra etiket üretebilirsin"e yumuşatılmalı.

**DURUM (LANDED):** T3 indi — `parseStreamJsonLine` `assistant` event'inden `assistantText`
çıkarır (`:362-379`); `runTurn` done'da en-uzun kaynağı (`delta`/`resultText`/`assistantText`)
`collected`'a uzlaştırır (`:515-524`), all-or-nothing kapısı kalktı. H2-A/B/C repro'ları yeşile
döndü → `it.fails`-pin'leri sökülüp regresyon-guard'a çevrildi.

---

## 3. (H3) turnInput tek-sonuç kaybı

**VERDICT: DOĞRULANDI (kod-okumayla kesin) — çok-tool turunda model sonuçların yalnız sonuncusunu görür.**

### Kanıt (file:line)
- `src/cli/commands/chat-session.ts:342-348` — `turnInput(messages)` yalnız
  `const last = messages[messages.length - 1]`'e bakar; `last.role === 'tool'` ise
  `[deckent tool sonucu]\n${last.content}\n…` döner → transcript'teki **diğer** tool-mesajları yok sayılır.
- `src/cli/commands/chat-native.ts:815-823` — motor her tool için **ayrı** bir
  `{ role:'tool', content: result, toolUseId }` mesajı push'lar; N tool = N ardışık tool-mesajı.
- `src/cli/commands/chat-session.ts:352` — `runTurn` modele **tek** kullanıcı-satırı yazar
  (`buildUserMessageLine(turnInput(messages))`); persistent-session tüm transcript'i değil, yalnız
  bu tek satırı gönderir → N-1 sonuç modele hiç ulaşmaz.

### Analiz
N tag tek hop'ta yürüdüğünde modele yalnız **son** tool-sonucu beslenir; model önceki N-1 aksiyonun
çıktısını göremez → kullanıcıya eksik/yanıltıcı özet, ve "sanki yalnız sonuncu çalıştı" algısı
(dogfood #1'i H2 ile birlikte besler). Repro `H3 — … 3 trailing tool results` (`it.fails`):
3 tool-sonuçlu transcript → yazılan prompt yalnız `RESULT_WHOAMI`'yi içerir, `RESULT_PWD`/`RESULT_LS`
yok. Kontrol testi (`H3 — CONTROL`) tek-sonuç yolunun bozulmadığını (geriye-uyum) gösterir.

### Fix sahibi → **T4** (Çoklu tool-sonucu geri-beslemesi)
`turnInput` transcript-kuyruğundaki **ardışık tool-mesajlarının tümünü** tek
`[deckent tool sonuçları]` bloğunda (sıra + tool-adı etiketli) modele beslemeli; tek-tool davranışı
bit-uyumlu korunmalı (mevcut format değişmez — geriye-uyum testi). `chat-session.ts`'e hem T3 hem T4
dokunduğundan sıra: **T3 → T4** (DIRECTIVES Dependencies).

**DURUM (LANDED):** T4 indi — `turnInput` ardışık tüm trailing tool-mesajlarını geriye yürüyerek
toplar; ≥2 sonuçta `[deckent tool sonuçları]` + `[i/N] <toolUseId>:` etiketli birleşik blok, tek
sonuçta eski format bit-uyumlu (`:464-488`). H3 repro'su yeşile döndü; CONTROL geriye-uyumu korur.

---

## 4. Bonus dispozisyon — `parseToolCallFromText` (legacy tek-tag parser)

- `src/cli/commands/chat-native.ts:357-360` — `TOOL_CALL_TAG_RE = /<tool_use…>/i` (`matchAll` değil,
  tek eşleşme) + `parseToolCallFromText` (`:359`). Bu **deckent_tool protokolünden ayrı**, eski
  `<tool_use>` heuristiğidir ve aktif REPL yolunda çağrılmıyor (REPL `parseDeckentToolCalls`'a dayanır).
  **0-caller doğrulandı** (cross-fix turunda `grep -rn parseToolCallFromText src/` → yalnız tanım satırı).
- **Disposition:** kapsam-dışı (chat-native.ts T1/cross-fix scope'unda değil). **T5** konsolidasyon
  notunu versin: 0-caller olduğundan sil ya da `@deprecated` işaretle. Risk düşük (REPL davranışını
  etkilemez) ama tek-eşleşme regex'i aynı çok-tag tuzağını taşıdığından kayıt altına alınmalı.

---

## 5. Özet tablo

| Hipotez | Verdict | Fix (current file:line) | Durum |
|--------|---------|-------------------------|-------|
| **H1** Ink confirm tek-slot | Çürütüldü (kök-neden değil) · gizli kırılganlık doğrulandı | T2 — app.tsx `createConfirmQueue` :55-102, :284-285, :448-460, :428-431 | **LANDED** ✓ |
| **H2** Stream-toplama blok-kaybı | **Doğrulandı (birincil kök-neden)** | T3 — chat-session.ts uzlaştırma :515-524, `assistant`→`assistantText` :362-379 | **LANDED** ✓ |
| **H3** turnInput tek-sonuç | **Doğrulandı** | T4 — chat-session.ts `turnInput` :464-488; motor chat-native.ts :815-821 | **LANDED** ✓ |
| Bonus legacy parser | Bilgi notu (0-caller) | T5 disposition — chat-native.ts :357-360 | disposition notu |

**Birleşik açıklama (dogfood #1 "yalnız sonuncu yürüdü"):** H2 (prose/blok-dışı etiketleri düşürür,
delta-akışına giren tek etiketi bırakır) + H3 (çok-sonuç geri-beslemesini son sonuca daraltır) +
sistem-prompt "yalnızca tek satır" kısıtı birlikte semptomu üretir. H1 onay-katmanı sıralı dispatch
altında sağlamdır ama kuyruksuzdur (T2 defansif sertleştirme). **Bu üç etken de fix'lendi (Kapanış
tablosu); yukarıdaki açıklama tanı-anındaki mekanizmayı belgeler.**

**Repro durumu (cross-fix sonrası):** `npx vitest run tests/cli/repl-tool-multi-tag-repro.test.ts`
→ **9/9 yeşil, exit 0**. Başlangıçta 4 `it.fails`-pin (H2-A/B/C, H3) vardı; T2/T3/T4 fix'leri
indiğinde gövdeleri geçtiğinden pin'ler kırmızıya döndü (= sök sinyali) ve bu cross-fix turunda
**yeşil regresyon-guard'lara** çevrildi (artık FIX'lenmiş davranışı doğruluyorlar; isimleri/yorumları
buna göre güncellendi). Anchor + 2 H1 model + 2 CONTROL testi değişmeden yeşil kaldı.
