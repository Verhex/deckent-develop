# Haftalık Limit Tersine-Mühendisliği — Fable/Opus/Sonnet/Haiku Tüketim Analizi

**Tarih:** 2026-06-10 · **Veri:** `~/.claude/projects/**/*.jsonl` CC transcript'leri (API'nin döndürdüğü
gerçek `message.usage` alanları, message-id dedupe'lu) — docker paralel worker'lar dahil
(`-workspace/*` proje dizinleri), claude.ai web hariç (transcript'lerde yok, kullanıcı kararıyla kapsam dışı).
**Araçlar:** `scripts/token-usage-report.mjs` türevi pencere agregatörü + `.deckent/cost-config.json` fiyat tablosu.

## 1. Kalibrasyon noktaları (gözlenen gerçekler)

| Pencere | Tanım | Gözlenen limit durumu |
|---|---|---|
| **W1** | 1 Haz 20:00 → 8 Haz 20:00 TR (kullanıcı tanımı) / 2 Haz 22:00 → 9 Haz 22:00 TR (veri-temelli) | **%100 — limit doldu** |
| **W2** | 9 Haz ~22:00 TR (reset) → 10 Haz 17:00 TR | **%41** |

**Veri-temelli reset tespiti:** Saatlik profilde tek near-zero saat **9 Haziran 18:00 UTC (21:00 TR)**
— 1 çağrı; öncesinde 324 çağrı/saat, sonrasında 284. Yani limit Salı ~21:00 TR'de fiilen doldu,
**~22:00 TR'de sıfırlandı** (fable'ın ilk kullanımı 23:00 TR). Haftalık pencere ≈ Salı 22:00 → Salı 22:00 TR.

## 2. Pencere toplamları (model × istek × token)

### W1a — 1-8 Haziran (7 gün, fable öncesi, %100)

| Model | İstek | Input | Output | CacheRead | CacheWrite |
|---|---|---|---|---|---|
| opus-4.8 | 5.161 | 1,87M | 7,15M | 2.112M | 43,6M |
| opus-4.7 (gece-loop) | 2.953 | ~0 | 1,68M | 388M | 11,8M |
| sonnet-4.6 | 2.738 | ~8K | 1,19M | 221M | 11,2M |
| haiku-4.5 | 772 | ~9K | 0,34M | 24M | 26,7M |
| **TOPLAM** | **11.624** | **1,89M** | **10,35M** | **2.745M** | **93,3M** |

### W2 — 9 Haz 22:00 → 10 Haz 17:00 TR (19 saat, %41)

| Model | İstek | Input | Output | CacheRead | CacheWrite | Kaynak |
|---|---|---|---|---|---|---|
| fable-5 | 1.789 | 0,53M | 1,91M | 433M | 10,1M | worker 1.036 + interaktif 754 istek |
| opus-4.8 | 267 | 62K | 0,40M | 73M | 1,9M | sprint-270 worker 140 + interaktif 127 |
| sonnet-4.6 | 459 | 6K | 0,26M | 41M | 2,3M | sprint-270 worker |
| haiku-4.5 | 168 | 10K | 0,08M | 9M | 3,9M | sprint-270 worker |
| **TOPLAM** | **2.683** | **0,61M** | **2,65M** | **557M** | **18,1M** | |

## 3. Hipotez testi — limit NEYİ sayıyor?

W2/W1 oranının gözlenen **%41**'e oturması gereken metrik aranıyor:

| Hipotez | W2/W1a | W2/W1b | Sonuç |
|---|---|---|---|
| İstek sayısı | %23,1 | %26,2 | ❌ elendi |
| Ham output token | %25,6 | %26,1 | ❌ elendi |
| in+out token | %26,6 | %27,2 | ❌ elendi |
| Tüm token (cache dahil) | %20,3 | %19,7 | ❌ elendi |
| Model-fiyat-ağırlıklı maliyet, cacheRead %10 (API standardı) | %37,7 | %37,5 | 🟡 yakın |
| **Model-fiyat-ağırlıklı maliyet, cacheRead HARİÇ** | **%39,7** | **%42,6** | ✅ **%41 tam ortada** |
| Maliyet, fable bedava sayılırsa | %5,9 | %6,4 | ❌ kesin elendi |
| Maliyet, fable opus-ağırlığında | %22,8 | %24,5 | ❌ elendi |

### Sonuç — limit mekaniği (davranışsal çıkarım)

1. **Limit istek-bazlı DEĞİL, ham-token-bazlı DEĞİL** — model fiyatıyla ağırlıklı **maliyet-eşdeğeri** sayıyor:
   `ağırlık ≈ input×$in + output×$out + cacheWrite×1.25·$in` (model başına $in/$out: fable 10/50, opus 5/25, sonnet 3/15, haiku 1/5).
2. **CacheRead pratikte SAYILMIYOR** (en iyi uyum ~%0-1 ağırlık; %10 API-standardı bile fazla geliyor).
   Haftada 2,7 MİLYAR cache-read token okunmuş — limiti bunlar doldurmuyor. **Prompt-cache disiplini limit verimliliğinin en büyük kaldıracı.**
3. **Fable bedava penceresinde bile limiti TAM premium ağırlığıyla tüketiyor** (opus'un 2 katı $/token).
   "Faturalama $0" ≠ "limit-metre $0".
4. Çıkarılan haftalık bütçe: **L ≈ $625-670 maliyet-eşdeğeri/hafta** (cacheRead hariç birimle).

*Yöntem dürüstlüğü: 2 kalibrasyon noktasıyla davranışsal çıkarım — Anthropic'in iç formülü farklı katsayılar
kullanıyor olabilir; web/mobil kullanım kapsam dışı; /usage yüzdesi yuvarlanıyor. Hata payı ±%10.*

## 4. Tek-model simülasyonu — aynı haftalık iş yükü tek modelde koşsaydı

W1a iş yükü (10,35M out + 1,89M in + 93,3M cacheWrite) sabit, model değişken:

| Senaryo | Maliyet-eşdeğeri | Limitin %'si | Limit ne zaman dolar |
|---|---|---|---|
| **Sadece fable** | $1.703 | **%254** | **2,8 günde** (Cuma'yı göremez) |
| **Sadece opus 4.8** | $852 | **%127** | **5,5 günde** (≈ geçen hafta gerçeği) |
| **Sadece sonnet 4.6** | $511 | **%76** | dolmaz (9,2 gün kapasite) |
| **Sadece haiku 4.5** | $170 | **%25** | dolmaz (27,6 gün kapasite) |

Mevcut tempo projeksiyonu: W2 yakımı $14/saat (duvar-saati) → **%100 limit ~48 saatte** —
reset Salı 22:00 ise Perşembe gecesi tükenir, haftanın 5 günü limitsiz kalınır.
Fable, W2 yakımının **%85**'i (worker %68 + interaktif %32).

## 5. Model tüketim ŞEKLİ (istek başına yakım)

| Model | $/istek (cr-hariç eşdeğer) | out token/istek | Karakter |
|---|---|---|---|
| fable-5 | $0,127 | 1.069 | en pahalı istek; derin tek-atış işler |
| opus-4.8 | $0,089 | 1.386 | uzun interaktif oturum, yüksek out |
| haiku-4.5 | $0,045 | 438 | **sonnet'in 2 katı/istek!** — cacheWrite-ağır kısa çağrılar |
| sonnet-4.6 | $0,022 | 433 | en verimli worker profili |

Sürpriz bulgu: **haiku çağrısı sonnet çağrısından pahalı** — haiku küçük tek-atış utility
çağrılarında kullanıldığından her çağrı taze cache yazıyor (haiku yakımının %95'i cacheWrite).
Ucuz model ≠ ucuz çağrı; **çağrı şekli (cache yeniden kullanımı) fiyat etiketinden baskın**.

Sprint kanıtı: Sprint 270 katmanlı fleet (opus 5 + sonnet 8 + haiku 7, 20 task) ≈ **$29 eşdeğer**
(~$1,5/task) vs fable fleet sprint'leri ~$2,8-3,5/task → **katmanlama task başına yakımı ~yarıya indirdi**,
opus'u yalnız zor task'lara saklayarak.

## 6. Operasyonel öneriler (F1-LIM beslemesi)

1. **Model-katmanlama doğru karar** — veriyle teyit: fable yalnız planlama/çok-zor; opus zor; sonnet normal; haiku yalnız gerçekten-mikro doc işleri (cache-write şekli düzeltilmezse haiku yerine sonnet bile daha verimli olabilir).
2. **deckent limit-tracker'ı maliyet-eşdeğeri birimle saymalı** (istek veya ham token DEĞİL): `in·$in + out·$out + cw·1.25$in`, cacheRead'i sayma. Haftalık bütçe ~$650-eşdeğer; %80 eşiğinde fleet'i otomatik economy-tier'a indir.
3. **Fable'ı bedava sanma** — limit-metre tam ağırlık yakıyor; bedava pencere (22 Haziran'a kadar) yalnız fatura tarafı.
4. **Prompt-cache hit oranını koru** — cacheRead bedava ama cacheWrite 1.25×input ağırlığında; worker prompt'larında cache-degrade (her task'ta değişen prefix) doğrudan limit yakar.

---

## 7. Sosyal platform içeriği

### X / Twitter thread (TR)

**1/9** Claude aboneliğindeki haftalık limit aslında NEYİ sayıyor? İstek mi, token mı?
İki veri noktam vardı: geçen hafta %100 dolan limit + reset'ten 19 saat sonra %41.
2,7 milyar token'lık gerçek kullanım datasıyla tersine mühendislik yaptım. Sonuçlar şaşırtıcı 🧵

**2/9** Setup: Claude Code + deckent orkestratörü, docker'da paralel AI worker fleet'i.
Geçen hafta: 11.624 istek, 10,35M output token, 2,75 MİLYAR cache-read (opus-ağırlıklı) → limit %100.
Fable-5 çıktıktan sonraki 19 saat: 2.683 istek, 2,65M output (fable-ağırlıklı) → limit %41.

**3/9** Hipotez testi — %41'e hangi metrik oturuyor?
❌ İstek sayısı: %23-26
❌ Ham output token: %26
❌ Tüm token (cache dahil): %20
✅ Model-fiyatıyla ağırlıklı maliyet-eşdeğeri, cache-read HARİÇ: %40-43
Limit = "kullanımın API'de kaça mal olacağı", token sayısı değil.

**4/9** En kritik bulgu: **cache-read limiti doldurmuyor.**
Haftada 2,7 milyar cache-read token okudum — limit-metreye etkisi ~sıfır.
Yani prompt-caching disiplini sadece hız/maliyet değil, **abonelik limitinin en büyük kaldıracı**.

**5/9** İkinci kritik bulgu: Fable-5 abonelikte "bedava" ama **limit-metreyi tam premium ağırlıkla yakıyor** (opus'un 2 katı).
"Fable bedava sayılıyor" hipotezi %6 verdi — gözlenen %41'in yanından geçmiyor. Fatura ≠ limit.

**6/9** Aynı haftalık iş yükü TEK modelde koşsaydı simülasyonu:
🔴 Fable: limitin %254'ü → 2,8 günde biter
🟠 Opus: %127 → 5,5 günde biter (geçen hafta aynen böyle oldu)
🟢 Sonnet: %76 → hafta yetiyor
🟢 Haiku: %25 → ~4 hafta kapasite

**7/9** Sürpriz: **haiku çağrısı sonnet çağrısından 2× pahalı çıktı** ($0,045 vs $0,022/istek).
Neden? Haiku'yu kısa tek-atış çağrılarda kullanıyorduk → her çağrı taze cache yazıyor, cacheWrite input'un 1,25 katı ağırlıkta. Ucuz model ≠ ucuz çağrı. Çağrı ŞEKLİ fiyat etiketini yener.

**8/9** Çözüm: model-katmanlama. Fable yalnız planlama + en zor işler, opus zor, sonnet normal, haiku mikro-doc.
İlk katmanlı sprint (20 task: 5 opus + 8 sonnet + 7 haiku): task başına yakım yarıya indi, kalite aynı (20/20 DONE).

**9/9** Özet:
• Limit = maliyet-eşdeğeri (model-ağırlıklı), istek/ham-token değil
• Cache-read bedava → cache disiplini = limit disiplini
• "Bedava" model ≠ bedava limit
• Doğru iş doğru modele → aynı limitle 2-3× iş
Tüm metodoloji ve data repo'da. 🤖

### LinkedIn (uzun form, TR)

**Claude'un haftalık abonelik limitini veriyle tersine mühendislik: 2,7 milyar token'dan çıkan 4 ders**

Geçen hafta AI-orkestratörümüz (deckent — paralel docker worker fleet'i) haftalık Claude limitini doldurdu. Reset'ten 19 saat sonra %41'deydik. Bu iki kalibrasyon noktası + Claude Code transcript'lerindeki gerçek API usage kayıtlarıyla (11.624 + 2.683 istek, model bazında token kırılımı) limitin neyi saydığını test ettik.

**Bulgu 1 — Limit, istek veya ham token saymıyor; model-fiyat-ağırlıklı maliyet sayıyor.** İstek-bazlı hipotez %23, ham-token %26 verdi; gözlenen %41'e tek oturan metrik "kullanımın API-eşdeğer maliyeti" (input + output + cache-write, model fiyatıyla ağırlıklı): %40-43.

**Bulgu 2 — Cache-read limiti pratikte doldurmuyor.** Haftada 2,75 milyar cache-read token'a rağmen en iyi model-uyumu cache-read ağırlığını ~%0 verdi. Prompt-caching disiplini abonelik kapasitesinin en büyük çarpanı.

**Bulgu 3 — "Bedava" model bedava değil.** Fable-5 abonelikte ücretsiz pencerede; ama limit-metreyi tam premium ağırlığıyla (opus'un 2 katı) yakıyor. 19 saatte %41'in %85'i fable'dandı.

**Bulgu 4 — Çağrı şekli fiyat etiketini yener.** En ucuz model (haiku) istek başına orta modelden (sonnet) 2× pahalı çıktı — kısa tek-atış çağrılar her seferinde taze cache yazdığı için. Maliyet modeli seçimi kadar çağrı mimarisi de belirliyor.

**Sonuç:** Tek-model simülasyonunda aynı iş yükü fable'da 2,8 günde, opus'ta 5,5 günde limiti bitiriyor; sonnet ve haiku haftayı çıkarıyor. Çözümümüz model-katmanlama (planlama=fable, zor=opus, normal=sonnet, doc=haiku): ilk katmanlı sprint'te task başına limit-yakımı yarıya indi, 20/20 task başarılı.

AI fleet işleten herkes için ders: limit yönetimi = maliyet-eşdeğeri muhasebesi + cache disiplini + doğru-iş-doğru-model routing. Bunu orkestratöre gömmek (bizde F1-LIM iş kalemi) artık opsiyonel değil.

---
*Metodoloji notu: davranışsal çıkarım, 2 kalibrasyon noktası, ±%10 hata payı; claude.ai web kullanımı kapsam dışı; Anthropic'in iç formülü farklı katsayılar içerebilir.*
