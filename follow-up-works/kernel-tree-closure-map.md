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
