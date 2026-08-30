# [OWNER-KARAR BEKLİYOR] Kernel-ağacı kapanış haritası — yayın kapısının gerçek boyutu
> **Silinme-tetiği (delete-on-consume):** Alperen dalga-şeklini seçip MASTER'a admission verince
> bu doküman DIRECTIVES/lane-brief'e dönüşür ve SİLİNİR. Kalıcı kayıt MASTER satır-kanıtıdır.
> Ölçüm tarihi 2026-08-28; kaynak: iki paralel read-only denetim + ana-şerit doğrulaması.

## 1. Neden bu doküman var

2026-08-28 karar-turunda yayın kapısı için **"kernel ağacını kapat, sonra yayın"** seçildi. O anda
sana verdiğim tahmin "5 satır, haftalar" idi. Ölçüm bitti: **tahmin eksikti**. Kilit gerçek bir
`DependsOn` zinciri (planın §1 release kuralı üzerinden dolaylı değil) ve **sandığımdan iki kat
daha derin**. Bu doküman doğru haritayı verir; kararı değiştirmen için değil, ne satın aldığını
tam bilmen için.

## 2. Doğrulanmış zincir (her kenar MASTER `DependsOn` hücresinden okundu)

```
3299 REPLAY-CERTIFICATION (OPEN)  ← yayın kapısı buraya bağlı
 ├─ 3295 DESCENDANT-CANCELLATION (VERIFY)
 │   └─ 3140 SCHEDULER-001 (OPEN, 1/~/0)
 │       └─ 3030 KERNEL-ATTEMPT-001 (OPEN, 1/~/~)
 │           ├─ 3020 KERNEL-STATE-001 (OPEN, 1/~/~)
 │           └─ 4000 AUTHORITY-001   (OPEN, ~/~/~)
 ├─ 3296 PROVIDER-OBSERVATION (VERIFY ← 2026-08-28 yükseltildi)
 │   ├─ 4101 PROVIDER-HOLD-001 (VERIFY, 1/~/1/1/0/0)
 │   │   └─ 4090 LIMIT-001 (OPEN, 1/~/0)
 │   │       ├─ 4070 RECEIPT-001     (OPEN, 1/~/0)
 │   │       └─ 4080 REACHABILITY-001 (OPEN, 1/~/0)
 │   └─ 3021 RUN-STATUS-AUTHORITY-001 (DONE ✓)
 ├─ 3297 CONTROLLER-TEST-CONTRACT (DONE ✓)
 └─ 3298 SPRINT-LOG-PROJECTION (OPEN)
     └─ 3290 RECOVERY-TERMINAL (VERIFY)
         ├─ PAUSED-FINALIZE-001 (OPEN, 1/0/1/0/0/0) — canlı CAS `generation_conflict` bug'ı
         └─ 3282 LINEAGE-SETTLEMENT (VERIFY, ~/0/1/1/0/0)
```

**Düz Türkçe:** Yayın için kapanması gereken şey "5 satır" değil, **10 satırlık ve 4 katmanlı bir
ağaç**. Ağacın dibinde ürünün çekirdeği duruyor: attempt/state kernel'i, authority, limit/receipt/
reachability otoritesi ve scheduler motoru. Yani bu karar pratikte "**yayından önce ürün
çekirdeğini bitir**" demek.

## 3. Satır satır: gerçekte ne eksik (kod-kanıtlı)

| Satır | Kalan iş (kod-kanıtı) | Boyut |
|---|---|---|
| **3140 SCHEDULER-001** | Reducer/effects motoru bugün **shadow** koşuyor: `scheduler-driver.ts` kendini "SCHED4 shadow-runner" ilan ediyor, `executeSchedulerDecision` yalnız driver içinden çağrılıyor, `resolveSchedulerEngine` config'te literal `reducer` yoksa **legacy**'ye düşüyor ve gerçek repoda o literal hiçbir config'te yok (E=0). `writeCheckpoint` canlıda **no-op** ("no live call site does"). Kapanış = motor cutover + checkpoint executor + tick-rollback + tüm call-site göçü. | **L** (çok dalgalı program) |
| **3030 KERNEL-ATTEMPT-001** | `PREPARED→PROCESS_SPAWNED→ADMITTED` CAS zinciri kodda **var** (`run-flow-store.ts`), ama `start.ts` bunu yalnız `--flow-id + --revision + --plan-digest` üçlüsü **ve** `run_flow_v2=true` iken açıyor; normal başlatma bu authority'yi hiç görmüyor. Kapanış = default-flip + v2 stop propagation + Mission cancel ingress + tenant-idempotency + macOS/Windows adapter + HA/scale kanıtı. | **L** (birden çok alt-program) |
| **4090 LIMIT-001** | Rezervasyon/settlement kodu var (`provider-limit-admission.ts`, `provider-limit-store.ts`), ama admission ana sprint akışında **opsiyonel** (`providerAuthority?`, `if (runtime.providerAuthority)`) ve **hiçbir sayısal eşik politikası yazılmamış** (E=0) — satırın kendi notu: eşikleri owner vermediği için bootstrap bilinçli yazılmadı. Kapanış = senden eşik kararı + admission'ı koşulsuz yapma + Codex parity. | **L** (biri senin kararın) |
| **4101 PROVIDER-HOLD-001** | Kendi işi büyük ölçüde bitmiş (1/~/1/1). Eksik: `reachability` **ayrı typed-hold sınıfı değil** (`ProviderFailureKind` yalnız usage-limit/auth/oom/unknown). Asıl engel 4090'ın DONE olması. | **S** |
| **3020 / 4000 / 4070 / 4080** | Ağacın dibi; hepsi OPEN ve W/E kısmi. Bunlar ölçülmedi — dalga-1'in gerçek kapsamı burada belirlenecek. | **ölçülmedi** |
| **3275 POST-SETTLEMENT-BINARY** | **MASTER satırı bayat:** truth `0/0/...` diyor ama kod 2026-08-11'de (sprint-519) landed — `post-settlement-verification.ts`, `planner.ts:lintProofStaging`, `task-builder.ts:stage*ProofObligation*`. Gerçek eksikler: `lintProofStaging` **hiçbir üretim çağıranı yok** (ölü kod), `stageDirectiveProofObligations` **`enforce:false`** (yalnız uyarı), 2 fixture migrate edilmemiş, L=0. | **M** |
| **3290 / 3298 / 3274** | 3290 ve 3298'in kendi kanıt+receipt'i **tam**; engel yalnız zincir (PAUSED-FINALIZE + LINEAGE-SETTLEMENT). 3274'ün hiç taze receipt'i yok (yalnız historical-only token) ve bağımlılığı VERIFY. | **formal + zincir** |

## 4. İki kolay kazanç (yeni kod gerektirmeyen)

1. **X hücresi çoğu satırda gerçekten "uygulanamaz".** Emsal repoda mevcut: 7 kardeş satır
   (3021, 3195, 3278, 530, 533, 535–537) DONE-onayı turunda X'i `-` yaptı, gerekçe: *"declare
   edilmiş cross-platform matris bu satırlar için yok; genişletmeler successor satırlara typed
   bağlı"*. 3290 successor'ını **isimle** taşıyor (3306 NATIVE-PLATFORM-MATRIX). Sonuç: **CI'nın
   Eylül'e askıda olması, bu satırların DONE'unu bloke etmek zorunda değil** — dün sana
   "Eylül'e kalır" dediğim kalemin bir kısmı bugün kapanabilir. Bu bir owner-onay turudur.
2. **3275'in MASTER metni sıfırdan yeniden yazılmalı** — 17 gündür landed olan işi hiç anmıyor.
   Bu tek başına ölçüm-borcu; düzeltilmesi zincirin gerçek boyutunu küçültür.

## 5. Önerilen dalga şekli

- **Dalga 0 (formal, kod yok):** X/S hücrelerinin emsal-gerekçeli `-` çevrimi + 3275 satırının
  gerçeğe göre yeniden yazımı + 3274'e taze receipt turu. → Ağaç görünür şekilde küçülür.
- **Dalga 1 (paralel, iki bağımsız kök):** `3030 KERNEL-ATTEMPT` kolu ve `4090 LIMIT` kolu.
  Aralarında DependsOn yok; kendi diplerini (3020/4000 ve 4070/4080) önce ölçmek gerekir.
- **Dalga 2 (paralel):** `3140 SCHEDULER` (3030 sonrası, tek başına büyük) ve `4101 PROVIDER-HOLD`
  (4090 sonrası, küçük).
- **Dalga 3:** `3275` wiring/enforcement + `PAUSED-FINALIZE`/`LINEAGE-SETTLEMENT` kolu → 3290 →
  3298 → 3295/3296 → **3299** → yayın.

## 6. Senin kararın

Karar-turunda "kernel ağacını kapat, sonra yayın" dedin ve o karar geçerli. Yeni bilgi şu: bu
**bir sprint dizisi değil, bir ürün-çekirdeği programı**. Üç seçenek görüyorum:

1. **Aynen devam** — Dalga 0'dan başlayıp ağacı kapatırız; yayın en sonda. (Karar değişmez.)
2. **Dalga 0 + yeniden değerlendirme** — önce formal kazançları alırız (X çevrimi, 3275 yeniden
   yazımı, 3274 receipt'i); ağaç küçüldükten sonra kalan gerçek işi yeniden ölçüp yayın kapısını
   tekrar konuşuruz.
3. **Kapıyı daralt** (ilk turda önerdiğim, senin seçmediğin yol) — yayın için replay-kanıt hattı
   yeterli sayılır, kernel programı yayın-sonrası kendi takviminde sürer.

Önerim **2**: karara sadık kalır, hiçbir şeyi atlamaz, ama ölçümü ucuz bir turla keskinleştirir.

---

## 7. Dalga 0 sonucu — ölçüm (2026-08-28, epoch-3 supervisor)

> Owner 2026-08-28'de **Seçenek 2**'yi seçti. Dalga 0 koşuldu. Sonuç, §5'in beklentisini
> doğrulamadı: formal kazançlar kayıt-doğruluğu getirdi, **ağaç küçülmedi**.

### 7.1 Üç kalemin gerçekleşmesi

| Kalem | Sonuç |
|---|---|
| 3275 yeniden yazımı | **Zaten yapılmıştı** (`c57370501`, aynı gün). Geriye tek olgusal hata kalmıştı: hücre "iki fixture" diyor ama biri (`tests/orchestra/planner-smoke-wire.test.ts`) **2026-08-26'da `d25b2ddb1`** ile silinmiş. Düzeltildi; `enforce` engeli ölçülmüş olarak yarıya indi. Kaynak docstring hâlâ bayat (Dalga 3 işi). |
| 3274 taze receipt | **Typed HOLD.** Satır-invariantı: *"Dependency satisfaction yalnız DONE ile oluşur."* 3274 → 3241 PRODUCTION-WIRING-AUTHORITY-001 = **VERIFY**. Receipt kapanış üretmez. |
| X/S emsal çevrimi | **Sıfır DONE açıyor.** 3274/3290/3296/3298 dördü de C/W/E/H/L=`1/1/1/1/1` ama hepsinin bağımlılık zinciri açık. Bağlayıcı kısıt X hücresi değil, **dependency DAG**. CI Eylül-askısı bu satırların gerçek engeli değildi. |

### 7.2 Haritanın kaçırdığı satırlar (DependsOn hücrelerinden ölçüldü)

§2 diyagramı yalnız 3299'un ağacını izlemiş; 3274/3275 kolu ve dip katman izlenmemiş:

```
3275 → 3274(VERIFY) → 3241 PRODUCTION-WIRING-AUTHORITY(VERIFY)
                        ├─ 3220 PLANNER-001      ← BLOCKED  (haritada yok)
                        ├─ 9040 EVALUATION-001   (OPEN)     (haritada yok)
                        └─ 3251 TEST-DISCOVERY   (DONE)
3020 → 3010 KERNEL-ONTOLOGY(OPEN) → 30 SSOT-003(DONE) + 4030 OPERATION-001(VERIFY)
4070 → 4010 PRINCIPAL(DONE) + 4020 TENANT-001(VERIFY)
```

"10 satır / 4 katman" → ölçülen **~16 non-DONE satır**, biri `BLOCKED`.

### 7.3 VERIFY-hasadı taraması (owner talebi, repo geneli)

Emsal ölçütü (2026-08-06 kaskad-hasadı): *VERIFY + dependency-OK + çocuksuz + C/W/E/H=1* +
closure-geçerli `proof=` token. Historical token invariant gereği DONE closure ÜRETMEZ.

**43 VERIFY satırı tarandı → hasada uygun: 0.** İlk elenme sebebine göre dağılım (kategoriler
bağımsız DEĞİLDİR; bir satır birden çok ölçütte düşebilir): 23 dependency, 16 C/W/E/H,
3 residual, 1 proof-token.

### 7.4 Bugün bağımlılığı AÇIK olan 7 VERIFY satırı — her birinin tek tek eksiği

Bunlar dependency'den değil **kendi kanıtlarından** düşüyor:

| Satır | Truth | Eksik |
|---|---|---|
| **4053** APPROVAL-INGRESS-UNKNOWN-ID-001 | `1/1/1/?/0/0/-` | yalnız **H ölçülmemiş** (`?`) — iş değil, ölçüm |
| **7092** RECOVERY-TRUTH-001 | `1/1/1/1/1/?/1` | yalnız historical-token → taze `proof=` gerek |
| **8100** CI-POSTMERGE-127-TRUTH-001 | `1/1/1/1/-/-/-` | yalnız historical-token → taze `proof=` gerek |
| 7075 MODEL-ACTIVATION-001 | `1/1/1/1/1/0/0` | açık residual (tier-projection) |
| 4030 OPERATION-001 | `1/1/1/1/0/?/?` | açık residual (ratchet + resolveOperation ingress) |
| 4020 TENANT-001 | `1/1/1/1/0/?/?` | açık residual (T4b/T4c) + açık child 4021 |
| 3169 RECOVERY-DOGFOOD-BORN-001 | `1/0/1/1/0/-/-` | program parent, 47 açık child — invariant gereği child'ların yerine kapanmaz |

**Üstteki üçü iş değil ÖLÇÜM BORCUDUR** — koşup taze kanıt yazmak yeter.

### 7.5 Asıl bulgu — DAG sığ değil, DERİN

İlk sayımım her VERIFY satırının transitive kapanışındaki HER düğüme kredi veriyordu; bu şişik bir
metrikti (43 satır için 106 atıf) ve yanıltıcı olurdu. Karşı-olgusal doğru sayı — *kökü tek başına
DONE yapsak kaç VERIFY satırı dependency-OK olur*:

| Kök | Durum | ham atıf (şişik) | **tek başına açtığı** |
|---|---|---:|---:|
| 4030 OPERATION-001 | VERIFY | 29 | **1** |
| 4020 TENANT-001 | VERIFY | 28 | **0** |
| 4000 AUTHORITY-001 | OPEN | 26 | **0** |
| 1010 CM-01 | BLOCKED | 14 | **1** |
| 3162 PAUSED-FINALIZE-001 | OPEN | 9 | **0** |

**Beşi birden DONE olsa bile açılan satır sayısı: 2.** 4020+4030 çifti: 1 (örtüşme yok).

Yani darboğaz "iki satır" DEĞİL. Bağımlılık zincirleri **çok katmanlı**: satırların çoğu aynı anda
birden fazla katmandan bloklu, dolayısıyla tek bir kökü kapatmak kuyruğu akıtmıyor. Bu, "ucuz
formal tur ağacı küçültür" beklentisinin neden tutmadığının cevabıdır.

### 7.6 (a) turu — "ölçüm borcu" sınıflandırmam iki satırda YANLIŞTI

§7.4'te üç satırı "iş değil ölçüm borcu" diye işaretlemiştim. Bunu token-şekline bakarak
yapmıştım; Evidence'ların tamamını okuyunca **ikisi yanlış çıktı.** Düzeltilmiş hâli:

| Satır | §7.4 iddiası | Ölçülmüş gerçek |
|---|---|---|
| **4053** APPROVAL-INGRESS-UNKNOWN-ID | ölçüm borcu | ✅ **DOĞRUYDU — kapatıldı** (aşağıda) |
| **7092** RECOVERY-TRUTH-001 | ölçüm borcu | ❌ **YANLIŞ.** Hücre `DÜRÜSTLÜK-DÜZELTMESİ 2026-08-25` taşıyor: Sprint-595 canlı-vakası `RT-IMPL-08` açık-kalemi ve *"VERIFY→DONE geçişinin ön-şartıdır"*; Sprint-622'nin iki tech-debt kalemi de aynı listede. Ayrıca cross-provider XVerify yok (typed `unavailable/HOLD` — KANUN 14 gereği kapanış değil). **Gerçek iş, ölçüm değil.** |
| **8100** CI-POSTMERGE-127-TRUTH | ölçüm borcu | ❌ **YANLIŞ — ve daha iyisi.** Acceptance'ı *"satır DONE'a yalnız MAIN_POSTMERGE_GREEN kanıtıyla geçer"* diyor ve o kanıt GELMİŞ: `#129` main-push CI workflow SUCCESS (run `31979500135`, 11m16s, 2026-08-16T23:34Z). Truth zaten DONE-şeklinde (`1/1/1/1/-/-/-`), dependency yok, çocuk yok, residual yok. Tek eksik: **owner DONE-flip receipt'i** + prose'daki kanıtın standalone `proof=` token'ına çevrilmesi. Repodaki DONE'a en yakın satır budur ve engeli benim yetkim dışında. |

### 7.7 4053 — kapatılan tek gerçek ölçüm borcu

`H` hücresi `?` (ölçülmedi) idi ve satırın kendi `LOCAL_VERIFIED` metniyle çelişiyordu.
Yedi-ingress bataryası bugün bağımsız koşuldu: **7 dosya / 78 test yeşil, exit 0**, hermetik ve
provider-free (`VITEST_MAX_FORKS=2`). → `H=?→1`, Truth `1/1/1/?/0/0/-` → `1/1/1/1/0/0/-`,
`proof=approval-4053-ingress-battery-78of78-hermetic-2026-08-28`, `Updated` 2026-08-28.

**L'ye DOKUNULMADI — açık çelişki owner'a bırakıldı.** Hücre `LIVE_PROVEN` ve *"real-binary
residualı kapandı"* diyor; sprint-659 arşivini diskte doğruladım (terminal `COMPLETE`
2026-08-24T15:29:37Z, seal state `applied`, `manifestDigest` hücredeki değerle birebir) — buna
rağmen `L=0`. Geçmiş receipt'e dayanarak L yükseltmek kalite barına aykırı olurdu; taze
gerçek-binary koşusu bu oturumda yapılmadı.

### 7.8 (a) turunun net sonucu

Üç "ucuz kazanç" beklemiştik; **bir tanesi gerçekti ve kapandı.** Diğer ikisinden biri gerçek iş
(7092), diğeri owner-kararı (8100). Yani ölçüm borcu sanılan yığın da ölçünce eridi — bu, §7.5'teki
"DAG derin" bulgusunun ölçüm tarafındaki karşılığıdır.
