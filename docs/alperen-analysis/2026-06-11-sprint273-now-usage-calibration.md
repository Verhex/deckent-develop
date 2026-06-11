# Sprint-273 → Şimdi Kullanım Kalibrasyonu — %51→%76 Penceresi (W3)

**Tarih:** 2026-06-11 19:09 TR · **Pencere (W3):** sprint-273 commit'i `10cb2dac` (10 Haz 21:38 TR) → 11 Haz 19:09 TR (~21,5 saat)
**Veri:** `~/.claude/projects/**/*.jsonl` — API'nin döndürdüğü gerçek `message.usage` alanları, message-id dedupe'lu.
**`.result` beyanları KULLANILMADI** (zaten diskte yok — CLEANUP siliyor; önceki 69-task analizi beyanların ~%30 gerçeklikte olduğunu kanıtlamıştı).
**Önceki analizler:** [2026-06-10-weekly-limit-reverse-engineering.md](2026-06-10-weekly-limit-reverse-engineering.md) (W1/W2 kalibrasyonu, L≈$625-670) · [2026-06-11-f1tok-closure-report.md](2026-06-11-f1tok-closure-report.md) (F1-TOK kapanışı — **bu raporla errata aldı, §5**).

## TL;DR

1. ✅ **Limit formülü 3. ve 4. bağımsız noktada da doğrulandı.** %51→%76 (25 puan) penceresinde ölçülen yakım **$162.70** — beklenen $156-168 aralığının tam ortası. İma edilen haftalık bütçe **L ≈ $651** (önceki $625-670 tahmini daraldı).
2. 🔴 **Yakımın %58,5'i artık interaktif CC** ($95) — 8 sprint'lik worker filosunun TAMAMI $68. Optimizasyon savaşı fleet tarafında kazanıldı; baskın yakıcı artık interaktif yüzey (tek ADR-review oturumu $65).
3. 🔴 **P1 araç bug'ı:** `deckent usage` fiyat haritası stale model anahtarları yüzünden **opus + haiku'yu $0 sayıyor** → tüm yüzeyler (CLI/MCP/REPL) limit yakımını **2,4× düşük** raporluyor ($25 beyan vs $60 gerçek, sprint 274-281 toplamı).
4. 🔴 **P1 dormant wire:** retro "Limit burn" satırı (`buildLimitBurnRow`, Sprint 273-004) **0-caller** — hiçbir retro'da hiç görünmedi. İki izleme kanalı birden kör olunca §5'teki regresyon fark edilmedi.
5. 🟡 **F1-TOK errata:** kapanış raporundaki "$0.52→$0.22, %58 düşüş" bug'lı fiyatlarla hesaplanmıştı. Gerçek (sonnet-only, elma-elma): **$0.67→$0.45 = −%33** — kazanç gerçek ama yarısı kadar; üstelik **276-280'de $0.54-0.70'e geri eridi** (prompt'a eklenen yeni içerik kazancı yiyor).
6. ⏱️ **Projeksiyon:** kalan %24 ≈ $156. Pencere ortalama temposu $7.6/saat → **Cuma öğleden sonra biter**. Salı 22:00 resetine yetmesi için tempo ≤$1.3/saat olmalı (gece sprint blokları $11-26/saat).

---

## 1. Kalibrasyon — formülün 3. ve 4. doğrulama noktası

Formül (W1/W2 çıkarımı): `yakım = in·$in + out·$out + cw·1.25·$in` (model fiyatıyla), **cacheRead = 0**.

| Nokta | Pencere | Gözlenen Δlimit | Beklenen yakım (L=$651) | Ölçülen | Sonuç |
|---|---|---|---|---|---|
| W1 (önceki) | 1-8 Haz, 7 gün | %100 | — | $852 → L kalibre | baz |
| W2 (önceki) | 9 Haz 22:00 → 10 Haz 17:00 | %41 | — | $258-276 → L kalibre | baz |
| **W2b (yeni)** | 10 Haz 17:00 → 21:38 (sprint-273) | %41→%51 = 10±1 puan | $59-72 | **$70.89** | ✅ üst sınır içinde |
| **W3 (yeni)** | 10 Haz 21:38 → 11 Haz 19:09 | %51→%76 = 25±1 puan | $156-169 | **$162.70** | ✅ **tam orta** |

Üç bağımsız pencere kesişimi: **L ≈ $645-660, merkez $651/hafta.** Formül artık ±%5 hassasiyetle çalışıyor (önceki ±%10'dan iyileşti). cacheRead'in sayılmadığı bir kez daha teyit: W3'te **924,5M cacheRead** okundu — limit-metre etkisi sıfır.

## 2. W3 kırılımı — kim yaktı?

### Model bazında (limit-$ sırasıyla)

| Model | İstek | Output | CacheRead | CacheWrite | Hit% | Limit $ | Pay |
|---|---|---|---|---|---|---|---|
| opus-4.8 | 1.101 | 1,42M | 495M | 4,73M | %99,1 | **$65.96** | %40,5 |
| fable-5 | 456 | 0,47M | 282M | 3,00M | %98,9 | **$61.67** | %37,9 |
| sonnet-4.6 | 1.183 | 0,65M | 116M | 4,60M | %96,2 | $27.00 | %16,6 |
| haiku-4.5 | 415 | 0,18M | 31M | 5,72M | **%84,4** | $8.07 | %5,0 |
| **TOPLAM** | **3.155** | **2,72M** | **924M** | **18,1M** | %98,1 | **$162.70** | %100 |

Bileşen payları: **cacheWrite $91.55 (%56,3)** · output $69.40 (%42,7) · input $1.75 (%1,1) — W1'deki %57-63 cw-baskınlığı aynen sürüyor. Haiku hit-rate'i W1'deki %48'den **%84'e çıkmış** (F1-TOK prefix-stab yan etkisi — şekil düzelmiş ama hâlâ en kötü).

### Yüzey bazında — DEVRİLME NOKTASI

| Yüzey | Limit $ | Pay | İçerik |
|---|---|---|---|
| **İnteraktif CC** | **$95.13** | **%58,5** | fable $61.67 + opus $33.46 — ADR-review 13 batch, resource-arbiter spec+6 denetim, bu analiz |
| Worker fleet (docker) | $67.57 | %41,5 | 8 sprint (274-281, 73 task) + FIX/plan artıkları |

Tek interaktif oturum (`7d76d576`, ADR-review): **$65.15** — sprint 276+277+278 fleet'lerinin toplamından fazla. İnteraktif fable yakımının **%61'i cacheWrite**: oturumda >5dk düşünme/okuma boşlukları cache TTL'ini öldürüyor, her dönüş tam prefix'i yeniden yazıyor ($12.5/M ile). Opus interaktif aynı desende %43 cw — fable'ın 2× fiyatı farkı büyütüyor.

### Saatlik profil (tier-aware)

| Blok | Saat | Yakım | Tempo |
|---|---|---|---|
| Gece sprint dalgası (274-278 + interaktif) | 10 Haz 22:00 → 02:00 | $70.45 | **$17.6/saat** |
| Sabah dalgası (279-280 + interaktif) | 07:00 → 10:00 | $34.73 | $11.6/saat |
| Gündüz ADR-review (salt interaktif) | 10:00 → 16:00 | $27.42 | $4.6/saat |
| Akşam (spec + sprint-281 + denetimler) | 16:00 → 19:09 | $24.49 | $7.9/saat |

## 3. Sayım doğruluğu denetimi — "sayılan tokenler doğru mu?"

Üç katman ayrı ayrı denetlendi:

| Katman | Denetim | Hüküm |
|---|---|---|
| **Transcript ham verisi** (Anthropic'in PC'de tuttuğu `message.usage`) | Bağımsız agregatörle yeniden sayıldı, message-id dedupe | ✅ Ground truth — analiz tabanı |
| **deckent ledger TOKEN sayımı** (`deckent usage --sprint`) | Örneklem task'lar bire bir kıyaslandı (örn. 280-007: calls=39, out=90.544, cw=215.556 — iki yöntemde **birebir aynı**) | ✅ **Token sayımı DOĞRU** (aynı kaynak, doğru dedupe) |
| **deckent ledger $ dönüşümü** | Sprint 274-281: beyan $25.06 vs gerçek $60.01 | 🔴 **2,4× DÜŞÜK — P1 bug, §4** |
| **Worker `.result` beyanları** | 274-281 dosyaları diskte yok (CLEANUP siler; arşivde yalnız `.sh`) | ➖ Kıyas yapılamaz; önceki 69-task bulgusu geçerli (~%30 gerçeklik). F1-TOK'un "ledger beyanın yerine geçer" kararı doğruydu — ama ledger'ın $ katmanı da kırık çıktı |

## 4. İki P1 bulgu — ölçüm zinciri kör

### 4.1 Stale model-key fiyat bug'ı (`deckent usage` ailesinin tamamı)

- **Kök:** `src/cli/commands/usage.ts:86-98` (`defaultCostPrices`) fiyat haritasını cost-config anahtarlarından kurar: `claude-opus-4-6`, `claude-haiku-4-5` (bundled, `_last_updated: 2026-04-15`). Transcript'ler ise `claude-opus-4-8` ve `claude-haiku-4-5-20251001` döndürüyor. `src/core/limit-ledger.ts:203` kontratı gereği "models not present in prices contribute **0**" → opus + haiku **$0**.
- **Etki:** CLI + MCP (`deckent_usage`) + REPL `/usage` aynı `defaultCostPrices`'ı paylaşıyor → üç yüzey de aynı oranda düşük. Opus-ağır sprint'te sapma uçuyor: sprint-272 beyan **$0.10**, gerçek **$1.77**/task (17,7×).
- **Bilinen desenle bağ:** `feedback_zero_hardcode_live_data` hafıza kaydındaki "stale model ID (opus-4-6) bundled fallback" bulgusunun ledger'ı ısırmış hali.
- **Fix önerisi:** (a) `deckent config update-pricing` + cost-config'e `claude-opus-4-8` ve dated-haiku anahtarları; (b) kalıcı çözüm — `defaultCostPrices`'a **prefix/alias fuzzy eşleme** (transcript model-ID'si `claude-opus-4` ile başlıyorsa opus fiyatı) + **eşleşmeyen model = $0 yerine uyarı satırı** (sessiz-sıfır, bug'ı 8 sprint sakladı).

### 4.2 Retro "Limit burn" satırı 0-caller dormant

- `buildLimitBurnRow` (`src/orchestra/sprint-reporter.ts:499`) tanımlı + testli (`tests/orchestra/sprint-reporter-usage.test.ts`) ama **production'da hiçbir çağıranı yok** — retro pipeline'a wire edilmemiş. 274-281 retro'larının hiçbirinde satır yok; DB'de "Limit burn" içeren tek retro yok.
- Sprint 273-004 "retro Limit burn satırı" diye kapanmıştı — **Kanıt-grep lafzı-vs-hedefi deseninin** (Sprint 211 F5, `feedback_directive_kanit_letter_vs_goal`) tekrarı: tanım+test grep'i geçiyor, wire yok.
- Ayrıca wire edilse bile `opts.prices ?? {}` default'u ile çağrılırsa toplam $0 → `total <= 0 → null` → satır yine sessizce düşerdi (`sprint-reporter.ts:511-513`). Wire + fiyat enjeksiyonu birlikte yapılmalı.
- **Sonuç:** F1-TOK'un "kalan tek iş pasif izleme" dediği iki kanalın ikisi de fiilen ölü doğmuş — §5'teki regresyonun görünmez kalma sebebi.

## 5. F1-TOK errata + regresyon — kazanç eridi

Kapanış raporundaki A/B bug'lı fiyatlarla hesaplanmıştı (274 "$0.22" = tam olarak bug'lı `reported$ 1.35/6`). Düzeltilmiş, mix-arındırılmış (sonnet-only) seri:

| Sprint | Sonnet task | $/task (gerçek) | Ort. cw/task | Ort. boot-cw | Not |
|---|---|---|---|---|---|
| 273 (baseline) | 10 | **$0.67** | 98K | 56K | F1-TOK öncesi |
| 274 (prefix-küçültme) | 3 | **$0.45** | 76K | 47K | ✅ **gerçek kazanç −%33** (−%58 değil) |
| 276 | 6 | $0.54 | 91K | 53K | erime başlıyor |
| 277 | 9 | $0.70 | 110K | 60K | 🔴 baseline'ın ÜSTÜ |
| 278 | 7 | $0.57 | 95K | 57K | |
| 279 | 7 | $0.70 | 112K | 57K | 🔴 baseline'ın üstü |
| 280 | 5 | $0.57 | 90K | 53K | |

Sprint toplamları (fiyat-düzeltmeli): 274 $3.37 · 275 $2.45 · 276 $9.22 · 277 $10.56 · 278 $7.88 · 279 $10.21 · 280 $11.83 · 281 $4.48 — task-başı genel ortalama 274-275'te $0.31-0.56, 280-281'de **$1.48-1.49** (opus payı arttıkça).

**Yorum:** Prefix-küçültme mekanik olarak yerinde duruyor (boot-cw 47K'ya inmişti) ama 276+ sprint'lerinde prompt'a eklenen yeni içerik (Sprint 276 PLAN-INT, 278 SharedMemory/COMM-1 enjeksiyonu, büyüyen summary.md/ADR seti — 444 entry) cw'yi geri şişirdi. **Limit disiplini bir kerelik fix değil, bütçe işi:** worker-prompt boyutuna regression-gate konmadıkça her yeni özellik sessizce geri yer.

## 6. Projeksiyon — bu hafta nereye gidiyor?

- Kalan bütçe: (1−0,76) × $651 ≈ **$156**. Reset: **Salı 16 Haz 22:00 TR** (122 saat sonra).
- Tempolar: W3 ortalaması **$7.6/saat** → 20,5 saat → **Cuma ~16:00'da %100**. Salt-interaktif gündüz temposu ($4.6/saat) → ~34 saat → Cumartesi öğlen. Gece sprint dalgası temposu ($17.6/saat) → **9 saatte biter**.
- Salıya yetmek için gereken ortalama: **≤$1.28/saat** — mevcut düzenle gerçekçi değil. Pratik seçenekler: (a) fable'ı interaktifte de kısıtla (bu oturum dahil — interaktif fable $/turn, opus'un ~2×'i), (b) sprint fleet'lerini sonnet/haiku-ağır tut (zaten yapılıyor — fleet payı %41,5'e indi), (c) ADR-review benzeri uzun okuma oturumlarını opus/sonnet'e al, (d) limit-dolumu kabul edip işleri reset sonrasına sıralamak.

## 7. Birleşik resim — önceki analizlerle senkron

| Önceki bulgu | W3'teki durum |
|---|---|
| Limit = maliyet-eşdeğeri, cacheRead=0 (W1/W2) | ✅ 3. ve 4. noktayla teyit; L=$651±%2 |
| cw = yakımın %57-63'ü | ✅ %56,3 — değişmedi |
| "Bedava" fable limiti tam ağırlık yakıyor | ✅ fable W3'te %37,9 pay (22 Haz'a kadar fatura $0 olsa da) |
| Haiku çağrısı sonnet'ten pahalı (hit %48) | 🟡 İyileşti: hit %84,4; ama hâlâ en düşük — micro-call şekli tam çözülmedi |
| `.result` beyanları ~%30 gerçeklikte → ledger şart | ✅ Karar doğruydu; ama ledger'ın $ katmanı da kırık çıktı (§4.1) — "tüketimi tüketene sorma" ilkesi artık **deckent'in kendi raporlarına da** uygulanmalı: bağımsız doğrulama scripti kalsın |
| Katmanlama task-başı yakımı düşürür | ✅ Fleet tarafı kazandı; **yeni cephe interaktif yüzey** (%58,5) |
| F1-TOK "task-başı $0.22, %58 düşüş" | 🔴 Errata: gerçek −%33 ($0.67→$0.45) + 276-280'de erime (§5) |
| F1-TOK "kalan yalnız pasif izleme" | 🔴 İzleme kanallarının ikisi de çalışmıyor (§4) — F1-TOK kapanışı fiilen **yeniden açılmalı** (küçük: fiyat-fix + wire + regression-gate) |

### Yeni dersler (6-10; 1-5 fable-5-overview.md'de)

6. **Optimizasyon kazançları kendiliğinden erir** — prompt'a içerik ekleyen her özellik limit bütçesinden harcar; gate yoksa sessizce geri büyür.
7. **Ölçüm zinciri de test edilmeli** — "ledger yazdık" yetmez; ledger'ın kendisi stale-data ile sessizce yanlışa düşebilir. Sessiz-$0 yerine uyarı; bağımsız çapraz-sayım scripti kalıcı.
8. **İnteraktif oturum artık en pahalı iş istasyonu** — uzun düşünme boşluklu fable oturumu, TTL ölümü yüzünden her dönüşte tam prefix yazıyor; "interaktifte hangi model" kararı fleet routing'i kadar önemli.
9. **Dormant-wire desenini retro'da otomatik yakala** — "0-caller export" lint'i (F5/211 ve şimdi 273-004, aynı hata iki kez).

## 8. Önerilen aksiyonlar (önem sırasıyla)

1. **[P1] Ledger fiyat-fix:** cost-config'e `claude-opus-4-8` + dated-haiku anahtarı (acil) + `defaultCostPrices` prefix-eşleme & unknown-model uyarısı (kalıcı). Tek dosya + config; tüm usage yüzeyleri düzelir. — ✅ **UYGULANDI** (aynı gün, aşağıda)
2. **[P1] `buildLimitBurnRow` wire:** retro pipeline'a gerçek çağrı + `prices` enjeksiyonu; gate: bir sonraki sprint retro'sunda satır görünür ve $ değeri bağımsız scriptle ±%5 tutar. — ✅ **UYGULANDI** (aynı gün, aşağıda)
3. **[P2] Prompt-boyut regression-gate:** sprint başına ort. boot-cw/worker eşiği (örn. >60K = retro uyarısı) — §5 erimesinin tekrarını yakalar.
4. **[P2] İnteraktif model politikası:** ADR-review/uzun-okuma oturumları için fable yerine opus/sonnet; fable'ı plan/zor-problem dönüşlerine sakla (22 Haz sonrası zaten zorunlu).
5. **[P3] Haftalık kalibrasyon ritüeli:** her reset sonrası ilk gözlemde `%limit ↔ ledger-$` çapraz kontrolü (3 dakikalık script) — formül katsayıları Anthropic tarafında değişirse erken yakalar.

## 9. Uygulanan fix'ler (2026-06-11 akşam — aynı oturum)

Denetim sırasında kırık halka sayısı **dörde** çıktı; dördü de kapatıldı:

| # | Kırık halka | Fix |
|---|---|---|
| 1 | `defaultCostPrices` stale-key → opus/haiku $0 (CLI/REPL) | `resolveModelPrice()` (`src/core/limit-ledger.ts`): exact-match → en-uzun-içerilen-anahtar family fallback (≥4 char); `limitCost` artık bunu kullanıyor. Alias verisi de güncellendi: `claude-opus-4-8`/`opus-4-8` + `claude-haiku-4-5-20251001` (`pricing-data-baseline.json` + `.deckent/cost-config.json`). Çözülemeyen model artık sessiz-$0 değil — CLI'da `usage.unknown_models` uyarısı (en+tr) |
| 2 | `buildLimitBurnRow` 0-caller + 2 gizli kusur (`{root}` yanlış semantik → hep 0 kayıt; boş taskMap → hep null) | Yeni `buildSprintLimitBurnRow()` (sprint-kapsamlı: transcript-kök default + session→task map + sprint filtresi + cost-config fiyatları + cache-gate) `finalizeSprint`'e wire edildi (`sprint-finalizer.ts`, `appendRetroSection` ile `### Limit Burn`) |
| 3 | Mid-sprint cost-guard (Sprint 279 WK-cost) `limitCost(records, {})` + proje-kökünü transcript-kökü sanıyor → gate hiç tetiklenemezdi | Doğru transcript kökü + sprint-scoped kayıt filtresi + `buildLedgerPrices` (`sprint-phases.ts:checkMidSprintCostGuard`) |
| 4 | MCP `deckent_usage` tool'u `pricesFn?.() ?? {}` → **tüm modeller $0** (Sprint 275'ten beri) | Default `buildLedgerPrices(process.cwd())` (`src/mcp/tools/usage.ts`); üçüncü kopya task-map tarayıcısı da core'daki paylaşılan `buildTranscriptTaskMap`'e teklendi |

Ortak altyapı: `buildLedgerPrices()` (cost-config→fiyat haritası, `cost-config-loader.ts`) + `buildTranscriptTaskMap()`/`filterTaskMapToSprint()` (`limit-ledger-report.ts`) — daha önce 3 ayrı kopya/boş-geçilen parametreydi. Testler: +14 yeni (resolveModelPrice, drift-regression, buildSprintLimitBurnRow, taskMap); ledger ailesi 150/150 yeşil; tsc temiz. Doğrulama (build sonrası): `deckent usage --sprint 280` TOPLAM ≈ **$11.83** göstermeli ($2.86 değil); bir sonraki sprint retro'sunda `### Limit Burn` bölümü görünmeli.

---
*Yöntem dürüstlüğü: L=$651 hâlâ davranışsal çıkarım (4 nokta, ±%5); /usage yüzdesi yuvarlanıyor (±1 puan); claude.ai web kullanımı kapsam dışı (varsa L'yi hafif yukarı iter); fiyatlar resmi API etiketi, abonelikte fiilen ödenmiyor. W3 ölçümü 19:09 TR'de donduruldu — sonrasındaki yakım (bu analiz oturumu dahil, ~$10-17) sayıya dahil değil.*
