# DEBT-369-CLOSE — sprint-369 debt kalanları (370-002)

Sprint 370, Task 370-002. Sprint-369'un üç GO_WITH_TECH_DEBT sonucunun (369-002, 369-005,
369-006) debt-gerekçelerini disk-üzerinde doğrulayıp, kapatılabilir olanı kapatan, kapatılamayanı
gerekçesiyle dokümante eden kapanış notu. Kaynaklar: `.brain/archive/sprint-369-tasks/task-369-{002,005,006}.result`
+ `.json`, `.brain/memory.db` (`entries` tablosu, salt-okunur sorgu), ve ilgili canlı kaynak dosyalar.

## Önce: "resolved" DB-durumu tek başına kanıt DEĞİL

`debt-369-002`, `debt-369-005`, `debt-369-006` (ve daha önce `debt-368-002`) memory.db'de
`status='resolved'` görünüyor — ama bu, gerçek bir düzeltmenin kanıtı değil. Dördünün de
`metadata.originSprintId === metadata.resolvedInSprintId` (aynı sprint) ve `sprintsOpen: 0`.

Kök-neden zinciri (kod-okuma ile doğrulandı, sadece DB'ye güvenilmedi):
- `src/orchestra/debt-manager.ts` `handleEvaluation()` → bir görev `GO_WITH_TECH_DEBT` olarak
  değerlendirildiğinde `recordDebtEntry(...)` çağrılır ve `debt-<task.id>` kaydı `status: 'active'`
  ile oluşturulur.
- `src/orchestra/sprint-phases.ts:1860` — **aynı `runEvaluatePhase` çağrısı içinde**, `evaluation`
  `DONE` ya da `GO_WITH_TECH_DEBT` olduğunda **koşulsuz** `resolveDebt(projectRoot, \`debt-${task.id}\`, sprint.id)`
  çalışır (bu satır `isPriorityFix` kontrolünün DIŞINDA — normal görevler için de tetiklenir).
- Sonuç: bir görevin GO_WITH_TECH_DEBT'te doğan kendi debt kaydı, aynı EVALUATE turunda —
  hiçbir takip-düzeltme yapılmadan — "resolved" olarak işaretleniyor. Bu, 369-002'nin kendisinin
  `debt-368-002` için gözlemlediği örüntünün ("aynı sprint'te, gerçek kod-düzeltmesi olmadan
  resolved") tam olarak aynısı ve hâlâ üretiliyor.

**Sonuç:** debt ledger'daki "resolved" alanı, HERHANGİ bir görevin kendi debt kaydı için
kapanış kanıtı sayılamaz. Bu proje-kuralındaki "disk-verify ground truth" ilkesinin
(`git diff --stat` / testler ile doğrula, sentetik NO_GO'ya güvenme) debt-durumuna da
uygulanması gerektiğini gösteriyor — yalnız NO_GO'ya değil. `debt-manager.ts` / `sprint-phases.ts`
bu görevin `scope.filesWrite` dışında; düzeltme burada yapılmadı, yalnız kayda geçirildi.
**docImpact:** ayrı bir görev (write scope: `src/orchestra/sprint-phases.ts`,
`src/orchestra/debt-manager.ts` + ilgili orchestra testleri) `resolveDebt(debt-${task.id}, ...)`
çağrısının kendi-doğuş-sprint'inde tetiklenmesini engellemeli (örn. yalnız `task.isPriorityFix &&
task.fixForTaskId` durumunda çalışsın, ya da bir sonraki sprint'te açıkça bir "closed by" görev-id'si
verilmeden asla otomatik-resolve etmesin).

---

## 369-005 (TOOL-CU-DILIM-1) — resolver-kalanı: **KAPANDI (doğrulandı)**

**Açık kalan gerekçe (369-005.result):** goCriteria "flag-roundtrip (loadConfig+mergeConfigs
İKİSİ de — test)" istiyordu, ama her iki fonksiyon da `src/core/config.ts`'de — 369-005'in
`scope.filesWrite` dışında. Worker bunun yerine `tests/core/config-flag-roundtrip.test.ts`'deki
`KNOWN_PRE_EXISTING_GAPS` listesine `computer_use` + `worker_output_contract`'ı dürüst-pinlenmiş
2 yeni boşluk olarak ekledi ve bir takip-görevi istedi: "`config.ts`'e (~1593 loadConfig, ~2383
mergeConfigs) pass-through satırları ekle, sonra gap-listesinden çıkar + ROUND_TRIP_BLOCKS'a
temsili payload'la ekle."

**Doğrulama (bugün, disk-üzerinde):**
- Commit `ea87df64` ("CC el-fix (born-464 deseni): computer_use + worker_output_contract resolver
  pass-through ×2 + roundtrip gap-listesi 6→4") `src/core/config.ts`'e tam olarak istenen satırları
  ekledi:
  - `loadConfig` (satır ~1720-1723): `computer_use: config.computer_use, worker_output_contract: config.worker_output_contract,`
  - `mergeConfigs` (satır ~2449-2452): aynı iki satır
- Şu an çalışan ağaçta `grep -n "computer_use\|worker_output_contract" src/core/config.ts` → 4 satır,
  hepsi mevcut (1722, 1723, 2451, 2452).
- `tests/core/config-flag-roundtrip.test.ts`'deki `KNOWN_PRE_EXISTING_GAPS` **6'dan 4'e düştü**:
  yalnız `cross_verify`, `doc_tracking`, `observability`, `rollback` kaldı — `computer_use` ve
  `worker_output_contract` listeden çıkarıldı (commit mesajıyla birebir uyumlu).
  `npx vitest run tests/core/config-flag-roundtrip.test.ts` → **13/13 PASS** (bugün çalıştırıldı).

**Sonuç: resolver-kalanı gerçekten kapatılmış.** goCriteria'nın "her iki resolver'da da
pass-through" kısmı artık disk-üzerinde doğru.

**Kapatılamayan iki artık-boşluk (benim scope.filesWrite'ım dışında — yalnız dokümantasyon):**
1. `src/core/config-types.ts:1248-1259` — `ResolvedConfig.computer_use` ve
   `.worker_output_contract` alanlarının JSDoc yorumları artık **bayat**: hâlâ "type-only
   pass-through today — loadConfig/mergeConfigs ... do not yet assign this field" ve "not yet
   wired into config.ts's resolvers" diyor — ama `ea87df64`'ten beri bu artık DOĞRU DEĞİL. **docImpact.**
2. 369-005'in kendi takip-isteği "ROUND_TRIP_BLOCKS'a temsili payload'la ekle" kısmı **yapılmadı** —
   CC'nin düzeltmesi yalnızca `KNOWN_PRE_EXISTING_GAPS`'ten çıkardı, ama `ROUND_TRIP_BLOCKS`
   dizisine (satır 103-113, hâlâ 9 blok) `computer_use`/`worker_output_contract` için pozitif bir
   round-trip senaryosu eklemedi. Yani şu an bu iki alanın gerçek `loadConfig()` disk-yolundan
   AS-IS döndüğünü **doğrudan** iddia eden bir test yok — yalnızca "eksik-alan listesinde değiller"
   dolaylı-kanıtı var. **docImpact:** takip görevi (write scope: `tests/core/config-flag-roundtrip.test.ts`)
   iki blok için `ROUND_TRIP_BLOCKS`'a temsili payload eklemeli (örn.
   `{ name: 'computer_use', block: { enabled: true, allowed_capabilities: ['screenshot'] } }`).

---

## 369-002 (DOCTOR-FOLLOWUPS) — debt-gerekçeleri: **dokümante edildi (kapatılamadı, scope-dışı)**

Bu görevin `scope.filesWrite`'ı yalnız `docs/analysis/debt-close-369.md` +
`tests/cli/connect-auth-state.test.ts` — `doctor.ts` / `doctor-checks.ts` / `messages.ts`'e
dokunma yetkim yok. Aşağıdaki iki boşluk bu yüzden yalnız doğrulanıp belgelendi, kapatılmadı.

### Boşluk 1 — `doctor-checks.ts`'deki aynı checkTmux win32 yanlış-etiketi (hâlâ açık)

369-002, `src/cli/commands/doctor.ts`'deki `checkTmux`'ın win32 dalındaki yanlış-etiket hatasını
düzeltti (override yokken bile "subprocess backend" diyordu). `src/cli/commands/doctor-checks.ts:138-141`'de
**birebir aynı kod ve aynı hata** hâlâ duruyor (bugün doğrulandı, grep ile):

```
139:  if (platform() === 'win32' || spawnBackend === 'subprocess' || spawnBackend === 'docker') {
140:    const reason = spawnBackend === 'docker' ? 'docker backend' : 'subprocess backend';
```

**Düzeltme/tashih — 369-002'nin kendi docImpact notu abartılı:** 369-002'nin sonucu bu ikinci
kopyanın "runPreFlightHealthCheck'in fallback'ı ve connect-wizard.ts tarafından kullanıldığını"
iddia ediyordu. Bugün import-grafiği grep ile yeniden izlendi:
- `src/cli/helpers/connect-wizard.ts` `doctor-checks.js`'den yalnız `runProviderDiagnostics` ve
  `isRunningInWSL`'i import ediyor — `checkTmux`/`runDoctorChecks`/`runPreFlightHealthCheck` DEĞİL.
- `init.ts`, `start.ts`, `src/mcp/tools/doctor.ts`, `src/api/server.ts` — hepsi `runDoctorChecks`'i
  `doctor.js`'den (düzeltilmiş kopyadan) import ediyor, `doctor-checks.js`'den değil.
- `doctor-checks.ts`'nin kendi `runDoctorChecks`/`runPreFlightHealthCheck`/`checkTmux`'ı yalnız
  KENDİ testlerinden (`tests/cli/doctor-checks.test.ts`, `tests/cli/doctor-memory-v2.test.ts`)
  çağrılıyor — production'da hiçbir çağıran yok.

Yani bu ikinci kopya, "canlı bir ikinci production-yolu" değil, **görünüşte ölü kod** — testler
onu canlı tutuyor ama gerçek `deckent doctor`/`init`/`start`/MCP/API hiçbir zaman ona uğramıyor.
Bu, önerilen takip-görevinin şeklini değiştiriyor: "aynı düzeltmeyi ikinci yere de kopyala" yerine,
**"bu modülün gerçekten ölü olduğunu doğrula, öyleyse `doctor.ts`'nin lehine sil; değilse (gizli bir
çağıran varsa) düzeltmeyi port et."**

**docImpact / takip-görevi önerisi:** write scope `src/cli/commands/doctor-checks.ts`,
`tests/cli/doctor-checks.test.ts`, `tests/cli/doctor-memory-v2.test.ts` (+ gerekirse
`src/cli/commands/doctor.ts` konsolidasyon için) — (a) `doctor-checks.ts`'nin
`checkNode`/`checkGit`/`checkClaude`/`checkDocker`/`checkTmux`/`runDoctorChecks`/`runPreFlightHealthCheck`
setinin gerçekten çağrılmadığını teyit et, (b) öyleyse iki paralel DoctorCheck-suite'i tek
`doctor.ts`'de birleştir (testleri de `doctor.ts`'nin fonksiyonlarına yönlendir), tersi durumda
win32 düzeltmesini birebir port et.

### Boşluk 2 — diğer DoctorCheck fonksiyonları hâlâ i18n'siz (hâlâ açık)

`checkNode`, `checkGit`, `checkClaude`, `checkDocker` ve `checkPlatform`'ın win32-dışı dalları
`doctor.ts`'de hâlâ sabit-İngilizce mesaj döndürüyor (369-002 bunu bilinçli olarak scope-dışı
bıraktı — "much larger, unrelated diff with no goCriteria mapping"). Bugün doğrulandı: durum
değişmedi. **docImpact:** ayrı bir i18n-retrofit görevi (write scope: `doctor.ts`, `messages.ts`,
ilgili test dosyaları) gerekiyor; 369-002'nin eklediği `lang` parametresi zaten opsiyonel+geriye
uyumlu olduğu için bu genişletme mekanik ve düşük-riskli olacaktır.

---

## 369-006 (PSL-6-DILIM) — debt-gerekçesi: **KAPANDI (regression testi eklendi)**

**Açık kalan gerekçe (369-006.result):** `src/cli/commands/connect.ts`'deki `AUTH_STATE_GUIDANCE`
(3 sağlayıcı → envKey/deckKey), `doctor.ts`'nin export-edilmemiş `AUTH_STATE_ENV_KEYS` /
`AUTH_STATE_DECK_KEYS` map'lerinin elle-senkronize edilen yerel bir aynası. `doctor.ts` bu görevin
scope'unda olmadığı için worker bu duplikasyonu yalnız bir tasarım-notu olarak bıraktı — hiçbir
test ikisinin senkron kaldığını doğrulamıyordu; `doctor.ts`'de bir anahtar değişse/yeniden
sıralansa `connect.ts`'nin rehberlik metni sessizce yanlış bir env-değişkeni önerebilirdi.

**Kapatma (bugün, `tests/cli/connect-auth-state.test.ts` içine eklendi — benim yazma-yetkim
dahilinde):** yeni bir `describe('AUTH_STATE_GUIDANCE / doctor.ts env-key sync guard (370-002)')`
bloğu, 3 sağlayıcının her biri için:
1. `deckent connect`'in gerçek (mock'lanmamış) çıktısındaki rehberlik metninin, `connect.ts`'nin
   `AUTH_STATE_GUIDANCE`'ında tanımlı envKey'i birebir isimlendirdiğini doğrular (metin↔sabit senkron),
2. o TAM env-değişkenini set edip, `doctor.ts`'nin GERÇEK (mock'lanmamış) `buildAuthStateReport`'unun
   o sağlayıcıyı — ve YALNIZ o sağlayıcıyı — `connected`'a çevirdiğini doğrular (metin↔çalışma-zamanı
   senkron).

Bu, statik rehberlik metnini `doctor.ts`'nin gerçek çalışma-zamanı davranışına bağlar: iki dosya
gelecekte diverge ederse (`doctor.ts`'de bir anahtar yeniden adlandırılır/sıralanırsa ama
`connect.ts`'nin aynası güncellenmezse) bu test **derhâl** kırılır — daha önce hiçbir mekanizma
bunu yakalamıyordu. Doğrulama: `npx vitest run tests/cli/connect-auth-state.test.ts` → **16/16
PASS** (13 mevcut + 3 yeni `it.each` senaryosu), `npx tsc --noEmit` → temiz.

**Tam kapanış (duplikasyonun kendisini ortadan kaldırmak — map'leri `doctor.ts`'den export
etmek) hâlâ bir tasarım takip-işi:** `doctor.ts` bu görevin de scope'u dışında; regression testi
drift'i YAKALAR ama duplikasyonu ORTADAN KALDIRMAZ. **docImpact:** takip görevi (write scope:
`src/cli/commands/doctor.ts`, `src/cli/commands/connect.ts`) `AUTH_STATE_ENV_KEYS`/`AUTH_STATE_DECK_KEYS`'i
export edip `connect.ts`'nin yerel aynasını gerçek import ile değiştirmeli — bu noktada yukarıdaki
regression testi de sadeleşip doğrudan aynı referansı karşılaştırabilir.

---

## Özet Tablo

| Debt | Durum | Kanıt |
|---|---|---|
| 369-005 resolver-kalanı (config.ts pass-through) | **KAPANDI** | commit `ea87df64`; grep config.ts satır 1722-1723/2451-2452; roundtrip-test 13/13 |
| 369-005 artık-boşluk: config-types.ts bayat JSDoc | Dokümante edildi (scope-dışı) | config-types.ts:1248-1259 |
| 369-005 artık-boşluk: ROUND_TRIP_BLOCKS'a pozitif senaryo yok | Dokümante edildi (scope-dışı) | config-flag-roundtrip.test.ts:103-113 |
| 369-002 boşluk 1: doctor-checks.ts checkTmux aynı hata | Dokümante edildi (scope-dışı) + iddia düzeltildi (muhtemelen ölü kod) | doctor-checks.ts:138-141; import-grafiği grep |
| 369-002 boşluk 2: diğer DoctorCheck fn'ler i18n'siz | Dokümante edildi (scope-dışı) | doctor.ts checkNode/checkGit/checkClaude/checkDocker |
| 369-006 AUTH_STATE_GUIDANCE ↔ doctor.ts drift riski | **KAPANDI (regression testiyle)** | tests/cli/connect-auth-state.test.ts yeni describe bloğu, 16/16 pass |
| 369-006 tam kapanış: map export | Dokümante edildi (scope-dışı) | connect.ts:96-105, doctor.ts:753-767 |
| Debt-ledger "resolved" kök-neden (tüm 3'ü etkiliyor) | Dokümante edildi (scope-dışı) | sprint-phases.ts:1860, debt-manager.ts handleEvaluation |
