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

---

## 8. Anthropic Resmi Doküman Kıyası (2026-06-10 — kaynak: platform.claude.com + support.claude.com)

### ⚠️ Önce sistem ayrımı — İKİ FARKLI LİMİT, KARIŞTIRMA (Alperen düzeltmesi 2026-06-10)

| | **API Rate Limits** | **Abonelik Usage Limiti (Pro/Max)** |
|---|---|---|
| Ne sınırlar | Anlık **debi**: istek/dk (RPM) + token/dk (ITPM/OTPM), token-bucket | Toplam **kullanım kotası**: 5-saat oturum penceresi + haftalık pencere |
| Kimi bağlar | API-key org'ları (Tier 1-4, Console) | Abonelik hesabı — claude.ai + Claude Code + Desktop **tek havuz** |
| Birim | Dakikalık, model-bazlı yayınlanmış tablolar | **Formül yayınlanmamış** ("Anthropic does not specify exactly how it calculates usage limits") |
| Bizim %100/%41 olayı | ❌ bu DEĞİL | ✅ bu — analizin konusu |
| Bizim çıkarımın dayanağı | — | **Kendi 2-nokta kalibrasyonumuz** (W1=%100, W2=%41), resmi doküman değil |

Bu ayrım gereği: aşağıdaki tabloda **prompt-caching mekaniği** satırları (paralel yarış, TTL, min-prefix,
model-scoped cache) **doğrudan geçerlidir** — bunlar limit sistemi değil, CC'nin kullandığı caching
motorunun kendisidir. **"Cache-aware ITPM" satırı ise FARKLI sistemden** (API rate-limit) yalnız
tasarım-felsefesi paralelidir — haftalık metrenin dokümanı değildir.

| Konu | Anthropic resmi ifadesi | Bizim ölçüm | Hüküm |
|---|---|---|---|
| **Cache-read sayımı** (⚠️ FARKLI SİSTEM: API rate-limit) | API rate-limits: **"only uncached input tokens count towards your ITPM... `cache_read_input_tokens` ✗ Do NOT count"**; `input_tokens` + `cache_creation_input_tokens` ✓ sayılır ("cache-aware ITPM") | Haftalık **abonelik** metresi (ayrı sistem): in+out+cw sayıyor, cacheRead ~%0 ağırlık (%39,7-42,6 fit) — kendi kalibrasyonumuz | 🟡 **Yalnız tasarım-felsefesi paraleli, doğrudan kanıt DEĞİL.** Anthropic'in bir limit sisteminde cache-read'i saymadığının resmi örneği; abonelik-metre sonucu bizim veriye dayanır |
| Cache fiyat çarpanları | Write **1.25×** (5dk TTL) / **2×** (1saat TTL); read **0.1×** | cost-config.json aynı; cw = limit yakımının %57-63'ü (bizim katkı: ölçekte baskın kalem olduğunun ölçümü) | ✅ doğrulandı |
| **Paralel istek cache-yarışı** | **RESMİ:** "A cache entry becomes readable only after the first response begins streaming. **N parallel requests with identical prefixes all pay full price.** For fan-out: send 1 request, await the first streamed token, then fire the remaining N−1." | 56 fable worker × ~125K cw/session — cross-worker cache paylaşımı fiilen yok | ✅ **Kök neden resmen belgeli; önerdiğimiz stagger fix'i resmi desen** |
| Pre-warm mekanizması | **RESMİ:** `max_tokens: 0` isteği cache'i yazar, anında döner, output faturası yok; "re-warm at least every 5 minutes" | Bizim "keep-alive ping" önerisi | ✅ resmi aracı var — planda max_tokens:0 kullanılacak (deckent-native yüzeyde) |
| TTL | 5dk default, her kullanımda yenilenir; 1h TTL 2× write, break-even ≥3 read (5dk: 2 read) | İnteraktif/gece-loop >5dk boşluklar = tam rewrite gözlemi | ✅; 1h TTL kararı read-sayısı hesabıyla verilecek |
| Min cacheable prefix | Opus 4.8 & Haiku 4.5: **4096 token**; Fable 5 & Sonnet 4.6: **2048 token** — altı sessizce cache'lenmez | Haiku micro-call'larının kötü şekli (hit %48) | 🆕 yeni bilgi — haiku şekil-fix'ine girdi (kısa prefix hiç cache'lenmiyor olabilir) |
| Model-scoped cache | "Switching models mid-session invalidates the cache... caches are model-scoped" | Model-katmanlama → her tier kendi prefix'ini ısıtmalı | ✅ plan etkisi: per-model warm |
| Silent invalidators | Resmi denetim listesi: timestamp, UUID, sıralanmamış JSON, koşullu system bölümleri | **Repo'da somut bulgu:** `heartbeat.pid`, `sprint.lock`, `memory.db.backup-*`, `.playwright-mcp/` gitignore'da DEĞİL → git-status snapshot'ı worker'dan worker'a değişiyor → CC system-prompt prefix'i bölünüyor | 🆕 ucuz, ölçülebilir fix adayı |
| 20-block lookback | Breakpoint en fazla 20 content-block geriye bakar; çok-tool-call'lı uzun turn'ler sessiz miss | Worker'lar yoğun tool-call yapıyor (CC kendi yönetiyor) | ⚠️ bilinçli risk — bizim lever değil |
| Tek havuz | **"Usage of all different Claude product surfaces (claude.ai, Claude Code, Claude Desktop) counts towards the same usage limit"** | Web'i kapsam dışı bırakmıştık | ✅ ±%10 hata payımızın resmi açıklaması |
| Formül | "Anthropic does not specify exactly how it calculates usage limits" — etkenler: uzunluk, karmaşıklık, özellikler, **model**, **effort** | Bizim kalibrasyon somut katsayı verdi: fiyat-ağırlıklı in+out+1.25·cw, cr≈0 | ✅ resmi çerçeveyle uyumlu; katkımız ölçülmüş katsayılar |
| API-mode bonus | Resmi örnek: %80 cache-hit ile 2M ITPM → **10M etkili token/dk** | F1-010 overflow (subscription→API kaçış) | 🆕 cache disiplini API modunda throughput'u 5×'e kadar artırır — F1-TOK yatırımı iki modda da geçerli |

**Sonuç:** Tersine-mühendislik bulgularımız resmi dokümanlarla **çelişmiyor.** Caching-mekaniği bulguları (paralel istek yarışı, TTL, min-prefix, model-scoped cache) **doğrudan resmi belgeli** — bunlar abonelik limitinden bağımsız, CC'nin kullandığı caching motorunun davranışı. Abonelik haftalık metresinin formülünü Anthropic bilinçli yayınlamıyor ("does not specify exactly"); oradaki sonucumuz **yalnız kendi 2-nokta kalibrasyonumuza** dayanır, API rate-limit dokümanı ona sadece felsefe-düzeyinde paralel destek verir. İki sistemi karıştırmamak F1-LIM için de tasarım gereği: **rate-limit hatası (429, `retry-after`) ≠ abonelik kota tükenmesi** — algılama ve tepki ayrı kodlanmalı (429 → backoff/retry; kota → PARK + reset bekle).

## 9. İş Planı — F1-TOK Fazlı Uygulama (deckent core özelliği)

**Mimari ayrım (planın temeli):** İki ayrı optimizasyon yüzeyi var:
- **Yüzey-1 — CC-worker fleet** (docker'da `claude` CLI): `cache_control`'e doğrudan erişim YOK. Kaldıraçlar dolaylı: prompt-girdi stabilitesi, git-status gürültüsü, spawn zamanlaması, `--resume`.
- **Yüzey-2 — deckent-native LLM çağrıları** (REPL chat, AI-planner, autonomous, nervous): TAM kontrol — breakpoint yerleşimi, `max_tokens:0` prewarm, 1h TTL, mid-conversation system (beta).

### Faz 0 — ÖLÇ (TOK-LEDGER) · 1 sprint · önkoşulsuz
- `scripts/token-usage-report.mjs` → `src/core/limit-ledger.ts`: limit-ağırlıklı birim (`in·$in + out·$out + cw·1.25$in`, cr=0), per-task/per-sprint attribution (transcript session ↔ task eşlemesi), cache-hit-rate.
- Sprint retro + `deckent status` + dashboard'a "limit-yakım" kolonu; F1-LIM park-eşiği bu birimden beslenir.
- **Gate:** her sprint sonunda otomatik rapor; mevcut hafta baseline'ı kayıt altında.

### Faz 1 — SUSTUR (PREFIX-STAB) · 1 sprint · Faz 0 ile paralel olabilir
- `.gitignore`'a sprint-runtime artıkları: `heartbeat.pid`, `sprint.lock`, `memory.db.backup-*`, `.playwright-mcp/` (git-status snapshot stabilize → CC system-prompt prefix bölünmesi durur).
- Worker prompt assembly determinizm denetimi: ADR/skill sıralaması sorted, timestamp/UUID yok (resmi silent-invalidator listesiyle).
- Sprint İÇİNDE değişen @-include'ların (summary.md vb.) denetimi.
- **Gate:** aynı wave'deki 2 worker'ın transcript'inde 2. worker'ın ilk çağrısında `cache_read > cache_creation`.

### Faz 2 — ISIT (CACHE-WARM) · 1 sprint · Faz 1'e bağlı
- **Fleet:** "first-worker-warm" spawn stratejisi — wave'de model başına İLK worker erken başlar; ilk stream-token'ı görülünce (transcript'te ilk assistant chunk) kalanlar salınır (resmi fan-out deseni). Config: `spawn_warm_strategy: 'first-worker' | 'stagger-ms' | 'off'`.
- **Native:** `max_tokens:0` prewarm (resmi mekanizma) — REPL/autonomous oturum açılışında shared prefix'i ısıt.
- **Gate:** fleet cw/session ortalaması ≥%50 düşüş (Faz 0 ledger ile ölçülür).
- Beklenen: fleet cw toplam yakımın ~%40'ı → bunun %60-80'i kazanılır = **haftalık limitte ~%25-30 tasarruf**.

### Faz 3 — SÜRDÜR (TTL-MGMT) · 1 sprint
- FIX/retry'da yeni session yerine `claude --resume` (bootstrap cw sıfırlanır + bağlam korunur — kalite de artar).
- deckent-native uzun oturumlarda 1h TTL değerlendirmesi (break-even ≥3 read hesabıyla, config-gated).
- **Gate:** FIX dalgalarında attempt-2 session'larının cw'si attempt-1'in <%20'si.

### Faz 4 — ŞEKİLLENDİR (OUT-DISC + HAIKU-SHAPE) · 1 sprint
- Haiku micro-call'ları batch'le ya da ≥4096-token stable prefix garanti et (min-cacheable eşiği); gerekirse micro-utility işleri haiku yerine mevcut-session-sonnet'e kaydır (ölç, karar ver).
- Output disiplini: FIX-dalga dedupe (F1-LIM ile), worker log/result budaması, doc-task'larda ModelEffort=low default.
- **Gate:** haiku hit-rate ≥%85; $-eşdeğer/istek sonnet'in altına iner.

### Faz 5 — KANITLA (A/B + yayın) · yarım sprint
- Aynı şekilli 12-task doc-sprint'i optimize-öncesi baseline'a karşı koş: hedef **$-eşdeğer/task ≥%40 düşüş, kalite sabit (12/12 DONE)**.
- Sonuçlar → docs + sosyal içerik v2 ("limit-aware orchestration" ürün hikâyesi) + README özellik satırı.

**Toplam hedef:** cw −%70 (≈ toplam −%40) + output −%15 ⇒ **aynı haftalık limitle ~2× iş, sıfır içerik/kalite kaybı.** Üçleme: F1-TOK (optimize) → F1-LIM (dürüst dur/park) → F1-010 (overflow; cache-aware ITPM sayesinde API modunda da 5× etkili throughput).

---

## 10. Geçmiş-Sprint Transcript Analizi + Worker-Prompt Denetimi (2026-06-10 akşam)

### 10.1 Altı sprint, 69 task — gerçek (transcript) yakım, üç dönem

Session↔task eşlemesi: worker transcript'inin ilk user-mesajındaki `.tasks/task-NNN-NNN.` deseni.
Birim: $-eşdeğer (in·$in + out·$out + cw·1.25$in, cacheRead=0). `.result` beyanları KULLANILMADI.

| Sprint | Fleet | Task | Task-başı $ | boot-cw / cw | Not |
|---|---|---|---|---|---|
| 261 (fable-öncesi) | sonnet-ağırlıklı | 15 | **$0,58** | %63 | 259 çağrı, hit %91-97 |
| 264 (all-fable) | fable ×12 | 12 | **$2,27** | %52 | doc sprint'i — fable'a gereksiz pahalı |
| 266 (all-fable) | fable ×5 | 5 | **$2,47** | %54 | |
| **269 (all-fable + limit kesintisi)** | fable ×5 | 5 | **$7,70** | %22 | 62-74 çağrı/task (normal 9-20) — **kesinti+FIX kaskadı maliyeti 3,3× şişirdi**; 5 task = $38,5 ≈ 270'in 20 task'ı + 271'in 12 task'ı TOPLAMI |
| 270 (katmanlı) | opus5+sonnet9+haiku6 | 20 | **$0,88** | %44 | |
| 271 (katmanlı, canlı) | sonnet9+opus1+haiku2 | 12 | **$0,58** | %59 | sonnet-dönemi maliyetine geri dönüldü |

**Çıkarımlar:**
1. **Model-katmanlama kanıtlandı:** task-başı yakım fable-fleet $2,3-2,5 → katmanlı $0,58-0,88 (~3-4× düşüş), kalite sabit (270: 20/20).
2. **`.result` tokenUsage beyanları sistematik olarak 3-5× DÜŞÜK** (beyan/gerçek ortalama ~%30, aralık %8-68) — worker kendi usage'ını göremiyor, uyduruyor. Ledger transcript-bazlı OLMALI (Faz 0 tasarım kararı kanıtlandı); "tokenUsage eksik = NO_GO" sözleşmesi kurumsallaşmış kurgu — kaldırılmalı.
3. **Bootstrap cw = fleet cw'sinin %44-63'ü** (~47-91K/worker; sonnet ~50K, opus ~65-91K, fable ~60-80K). Session-içi hit %89-98 — caching session içinde mükemmel çalışıyor; israf yalnız session-başı tam-yeniden-yazım. CACHE-WARM'un hedefi doğru.
4. **En pahalı israf retry/kesinti:** 269'un fazladan ~$27'ı (5 task'ta) tüm prompt-optimizasyonlarının kazancından büyük → F1-LIM (park, FIX'i ölü-limitte tetikleme) ekonomik olarak 1 numaralı kalem.
5. Kesintili task'larda süre alanı güvenilmez (negatif süreler = reset'i aşan session'lar) — ledger süreyi hb'den almalı, transcript'ten değil.

### 10.2 Worker-prompt denetimi: 271-004 vs 271-010 (kalite·maliyet·tutarlılık, /100)

Bölüm haritası (ölçülmüş):

| Bölüm | 271-004 (44,6K char ≈ 11,1K tok) | 271-010 (24,6K char ≈ 6,1K tok) |
|---|---|---|
| Agent persona | 5,1K (api-builder) | 7,1K (bug-fixer) |
| Skills | 9,2K — **iki dosyada md5 birebir aynı** | 9,2K (aynı) |
| ADR bloğu | **22,4K (%50!) — ADR-037 tek başına 21,6K (%48)** | 3,0K (001/002/008 — uygun) |
| Task+kurallar | 6,6K | 5,1K |

**Puanlar:** 271-004 = **85/100** (Kalite 37/40 · Maliyet 23/30 · Tutarlılık 25/30) · 271-010 = **90/100** (39 · 28 · 23).

**Kesintiler (kanıtlı):**
- **[T1, her ikisi]** goCriteria şablonu "`npx vitest run` passes" (TAM suite) derken CRITICAL VERIFY "do NOT run the Full test suite (~67 pre-existing fail)" diyor — **doğrudan iç çelişki** (Definition-of-Done ↔ verify talimatı). False-NO_GO/karışıklık riski; 257'de fix'lenen CODE-FULLSUITE-NOGO'nun şablonda yaşayan artığı.
- **[T2, 271-010 ağır]** bug-fixer personası 5 yerde "run the FULL test suite", "full suite passes yoksa NO_GO (GO_WITH_TECH_DEBT değil)" diyor — hem harness'ın targeted-verify kuralıyla hem self-assessment merdiveniyle çelişiyor. Persona-harness çatışmasını worker çözmek zorunda kalıyor.
- **[K1, 271-004]** Task description açıkça "register pattern **ADR-012**" diyor; relevance-scorer (topN=3) ADR-012'yi SEÇMEMİŞ, yerine ~5,4K token'lık ADR-037'yi (görevle ilgisi: zaten Scope Rules + Karpathy bloklarında özetlenen "scope'ta kal + dürüst ol") koymuş. Açık-referans kaçırma + balast.
- **[M1]** ADR render'ı her ADR'de başlık+status'u İKİ kez basıyor (export başlığı + içerik başlığı) — saf tekrar.
- **[M2]** Blok sırası cache-düşmanı: Agent (task-başına değişir) EN BAŞTA, Skills (en-paylaşılan, md5-aynı) ikinci — aynı-skill'li iki worker'ın paylaşılabilir prefix'i 1. bayttan kırılıyor.
- **[T3]** `*Kanıt:**` bozuk markdown artifact'ı (şablon interpolasyonu).
- **[T4]** tokenUsage zorunluluğu (10.1 #2 — kurgu mecburiyeti).

### 10.3 ≥97/100 için değişiklik listesi — SIFIR kalite/işlev kaybı

Hiçbir bilgi silinmez; düzeltilir, teklenir, yeniden sıralanır:

| # | Fix | Etki | Puan |
|---|---|---|---|
| 1 | goCriteria şablonu: "`npx vitest run` passes" → "targeted test file(s) pass" (tek satır, task-builder şablonu) | T1 ölür; false-NO_GO/full-suite koşma riski biter | +3-4 her ikisi |
| 2 | Persona harness-uyumu: agent şablonlarındaki "full test suite" ifadeleri parametrik ("project-configured verify scope") YA DA persona sonuna otomatik harness-override notu | T2 ölür | +4 (010) |
| 3 | ADR seçici: task description'daki açık `ADR-NNN` referansları topN'e ZORLA dahil | K1 ölür | +2 (004) |
| 4 | ADR render dedupe (çift başlık tek başlığa) + dev-ADR'lerde "operative-extract" modu: ADR-037 için V1.0-reality notu + worker'a dokunan kurallar (tarihçe/alternatifler/matris worker için işlevsiz — işlevsel kural kaybı YOK) | ~5K token/task tasarruf (037 seçildiğinde), dikkat-kirliliği azalır | +3 (004) |
| 5 | Blok sırası: **Skills (en-paylaşılan) → Agent → ADR → Task (en-özel)** — salt yeniden sıralama | Cross-worker paylaşılabilir prefix uzar (cache) | +1 |
| 6 | tokenUsage: zorunlu-beyan → opsiyonel-tahmin; gerçek sayım transcript-ledger'dan (Faz 0) | T4 ölür; veri dürüstlüğü | +1-2 |
| 7 | `*Kanıt:**` interpolasyon fix'i | T3 ölür | +0,5 |

Sonuç projeksiyonu: 271-004 → **~97-98**, 271-010 → **~98**.

### 10.4 F1-TOK plan genişletmesi (bu analizle eklenen)

- **Faz 0 (TOK-LEDGER) genişledi:** ledger `.result` tokenUsage'ın YERİNE geçer (3-5× sapma kanıtı §10.1); süre hb'den; "tokenUsage eksik = NO_GO" kuralı kalkar (fix #6).
- **Faz 1 (PREFIX-STAB) genişledi:** + blok yeniden-sıralama (fix #5), + ADR render dedupe & operative-extract (fix #4), + açık-ADR-referans önceliği (fix #3).
- **🆕 Faz 1,5 (PROMPT-CONS — prompt tutarlılık):** goCriteria şablon fix'i (#1) + persona harness-uyum katmanı (#2) + interpolasyon artifact'ları (#7). Bunlar token tasarrufundan fazlası: **false-NO_GO/FIX-kaskadı önleme** — 269 kanıtıyla retry şişmesi ($7,70/task) tüm israf kalemlerinin en büyüğü.
- **Faz 5 (A/B) ölçütü güncellendi:** baseline artık bu analizin 6-sprint tablosu; hedef katmanlı-fleet task-başı $0,58-0,88 → **≤$0,45** (boot-warm + prompt fix'leriyle) kalite sabit.
