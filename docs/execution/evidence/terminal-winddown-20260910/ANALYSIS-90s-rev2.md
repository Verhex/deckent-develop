# 7113-E B-2 — 90 sn hedefi neden 106.6 sn'de karşılanıyor (SALT ANALİZ, rev2)

Yürütücü claude-opus-5, epoch-6; authority gpt-6-astra (ENTRY 1252 READ-ONLY ASSIGN, ENTRY 1254 REVISE).
**Kod değişikliği YOK, provider çağrısı YOK, main/auth/runtime/config mutation YOK.**
Kaynak: `proof/e-boundary-review.json`, `proof/e-boundary-final-journal.json`
(SHA256 `645784ffd7f046af8320505822e05c3d61b546485e554b3a341c0dbb26bd8f5e`) ve entegrasyon rev4 kaynağı.
UTC 2026-09-10T05:44Z (gerçek saat; rev1'de gövde 05:45Z yazıp başlık 05:41:23Z olmuştu — düzeltildi).

## 1. Ölçülen defter

Tek slot, sırayla (`state.requests`, ekleme sırası):

| # | purpose | ölçülen girdi | tavan | usage in/out | sonuç |
|---:|---|---:|---:|---|---|
| 1 | map | 12 304 | 2048 | 12 304 / **2048** | `length` → **invalid, atıldı** |
| 2 | map | 4 775 | 2048 | 4 775 / 1690 | düğüm |
| 3 | map | 7 863 | 2048 | 7 863 / 1514 | düğüm |
| 4 | map | 17 142 | 2048 | 17 142 / **2048** | `length` → **invalid, atıldı** |
| 5 | **interim** | 1 446 | 4096 | 1 446 / **91** | **teslim edildi** |
| 6 | map | 9 265 | 2048 | 9 265 / 1652 | düğüm |
| 7 | map | 8 208 | 2048 | — | `reserved`, deadline kesti |

İlk cevaptan önceki çıktı **7 300 token** (toplamın **%81**'i); **4 096'sı (%56)** tavana çarpıp
atıldı. Ara cevabın kendi üretimi **91 token**. Host isteği 105 803 ms, ekrandaki cevap
106 633 ms → **830 ms** fark.

## 2. Kök neden (Astra tarafından kabul edildi): sınırın granülü ADIMDIR

`reference-session.ts:146` `providerConcurrency: 1` + `reference-digest-runner.ts:592`
`concurrency = min(...)` → tek slot. Adım atomiktir: `:427` ölçüm → `:436` rezervasyon →
`:448` `send` → `:480` settle. Ara cevap yalnız slot boşken denenir (`:390`
`if (providerInFlight > 0) return;`), çünkü aktif çağrıyı kesmek **yasaktır**. Sınırlar `:403`,
`:410`, `:420`, `:506`. Eşik 4. adım **uçarken** geçildi; en erken fırsat o adımın bitişidir.

**Gecikme = eşiğin geçtiği anda uçmakta olan adımın kalan süresi.** Ortalama adım
≈ 105.8 s / 4 ≈ **26 s** (aşağıdaki §6 belirsizlik notu ile birlikte okunmalı).

## 3. REVISE ile düzeltilen üç ayrım

### 3.1 K2 tek başına YETMEZ — ayrı bir "ilk cevap uygunluğu" kontratı gerekir
Haklısın. İlk düğüm erken doğsa bile **teslim edilmez**, çünkü:
- `session.ts:1311-1313` — `claim()` yalnız `evaluate()` **`kind === 'interim'`** dönerse ilerler;
- `interim-deliverable.ts:218-221` — o demand ancak `sinceMs >= interimAnswerAfterMs` (90 000 ms)
  veya tool-call eşiğiyle doğar. Referans programında tool call yoktur, dolayısıyla **tek kapı
  90 sn'dir**.

Yani K2 "erken düğüm" üretir, mevcut kapı onu 90 sn'ye kadar bekletir. Bu nedenle **ilk cevap,
ara cevaptan AYRI bir uygunluk kontratıdır** ve açık bir bağımlılıktır:

| Gereken | İçerik |
|---|---|
| First-answer eligibility | "Bu turda henüz hiç teslim yok **ve** doğrulanmış bir düğüm var" koşulu; cadence'ten bağımsız, cadence'i **değiştirmeden**. |
| Finite request budget | Bu uygunluk `maxInterimRequestsPerTurn` bütçesinden düşer; ayrı/ek bütçe açılmaz. |
| Exactly-once deliver | Tur başına **en fazla bir** ilk-cevap; `settleRound` yalnız gerçek yield sonrası sayar (rev3 delivery boundary korunur). |

Bu kontrat yazılmadan K2'nin kullanıcıya görünen bir etkisi olmaz. Rev1'de bunu ima ettim,
açıkça yazmamıştım.

### 3.2 K1 "90 sn'yi kilitler" DEĞİL — üst sınır yok
Haklısın. K1 yalnız **bu koşuda ölçülmüş** adım sürelerinden tahmin yapar; sonraki çağrının
kuyruk, ölçüm ve üretim gecikmesi bu tahminin üstünde olabilir. Doğru ifade:

- K1, "eşikten sonraki ilk sınır" yerine "eşikten önceki son sınır"ı seçerek **beklenen** ilk
  cevap zamanını düşürür; **garanti vermez**.
- Ölçüm, ara cevap üretimi ve drain **ayrı** kalemlerdir ve ayrı raporlanmalıdır
  (bu koşuda drain+üretim = 830 ms; ölçüm süresi ayrıca kaydedilmiyor).
- Hedef tutmazsa sonuç **tipli bir miss/HOLD**'dur: sessiz "başarılı" sayılmaz ve eşik
  büyütülerek "tutmuş" gösterilmez.

### 3.3 K3 bir HEURISTIC'tir — bu örnekten kanıtlanmadı
Haklısın. Elimdeki iki `length` vakası en büyük iki girdiye denk geliyor (12 304 ve 17 142),
ama **iki nokta bir ilişki kanıtlamaz**: çıktı uzunluğu riski içeriğin yoğunluğuna da bağlıdır
ve ölçülmedi. K3 bu yüzden **sıralama sezgisidir**, kural değil. Ayrıca açık etkileri vardır:
parça sırasını değiştirmek kapsama sırasını ve dolayısıyla deadline kesildiğinde **hangi
bölgenin kapsandığını** değiştirir; bölme/bütçe etkileşimi ayrıca ölçülmelidir. Bu paketten
çıkarılabilecek tek dürüst sonuç: *ilk cevaptan önce iki adım 4 096 çıktı tokeni harcayıp hiçbir
kapsama üretmedi.*

## 4. Bağımlılık DAG'ı (uygulama ayrı ASSIGN'a bağlı)

```
D0  adım başına duvar-saati damgası (journal'da bugün YOK: state.requests[*] süre tutmuyor)
     ├── D1  first-answer eligibility + finite budget + exactly-once deliver   [K2'yi görünür kılar]
     ├── D2  ilk parça boyu ayrı politika (reference-session.ts:128 tek tip)   [K2]
     └── D3  sınırda önceden karar, ölçülen sürelerden                          [K1]
D4  parça sırası sezgisi + kapsama sırası etkisinin ölçümü                      [K3, D0'a bağlı]
```

D0 hem D3'ün girdisi hem D1/D2'nin **doğrulama** aracıdır; bu yüzden ilk pakette D0 + D1 + D2
birlikte gelmelidir. D3 ikinci pakette, D4 en sonda ve yalnız ölçümle.

## 5. Kanıt kontratı (uygulanırsa ne ispatlanmalı)

| Madde | Kabul ölçütü |
|---|---|
| D0 | Her istek kaydında başlangıç/bitiş damgası; toplamları duvar süresiyle tutarlı; hiçbir damga uydurulmamış. |
| D1 | Cadence dolmadan ilk cevap; tur başına **tam bir**; `maxInterimRequestsPerTurn`'den düşüyor; teslim yalnız gerçek yield sonrası sayılıyor; iptal/abandon → 0. |
| D2 | İlk düğüm ölçülen olarak daha erken; kapsama **eksiksiz** kalıyor; limit/eşik/model/context/prompt değişmemiş. |
| D3 | Erken karar yalnız bu koşunun ölçümünden; geçmiş yokken tetiklenmiyor; hedef tutmazsa **tipli miss/HOLD**; ölçüm/üretim/drain ayrı raporlanıyor. |
| D4 | Sıralama değişiminin kapsama sırası ve deadline'da kapsanan bölge üzerindeki etkisi ölçülmüş; sezgi olarak etiketlenmiş. |
| Hepsi | Tek slot, preemption yasağı, usage custody, iptal/deadline kapıları değişmemiş; ilerleme/anlatım teslim sayılmamış. |

## 6. Belirsizlikler (kapatılmadan iddia edilmeyecek)
- **Adım süreleri doğrudan ölçülmedi.** §2'deki 26 s, dört adımın toplam duvar süresinden
  türetilmiş bir ortalamadır; adım başına dağılım bilinmiyor. D0 bunu kapatır.
- **"10 sn" ölçülmedi.** K2'nin yönü nettir, süresi taahhüt edilmiyor.
- **Ölçüm süresi ayrı kaydedilmiyor**; 830 ms yalnız üretim+drain'i kapsıyor.
- İstek zamanı ile teslim zamanı **farklı olaylardır**; 90 sn hedefi teslime konuluyorsa
  D3 bu farkı da hesaba katmalıdır.

Ürün DONE değil; XVerify, durable settlement ve tam kapsama HOLD. Uygulama için ASSIGN verilmedi.
