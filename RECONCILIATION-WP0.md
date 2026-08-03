# WP0 — Canonical Reconciliation Önerisi (onay bekliyor)

> Yazan: Claude (Opus 5, high effort) · 2026-08-03 · HEAD `56d5406f0`
> Girdi: `codex-analysis/**` (20 rapor + 9 appendix, tamamı okundu) · `PAZARTESI.md` · `docs/analysis/CODE-DOC-DIFF-2026-08.md` (54 fark) · `docs/generated/master-plan-active.json` (323 satır)
> **Bu dosya MASTER'ı DEĞİŞTİRMEZ.** Alperen onayından sonra satırlar `docs/MASTER-PLAN.md`'ye taşınır ve bu dosya silinir.

---

## 0. Codex analizinin doğrulanması (cross-provider)

Codex analizi kendi XVerify'ını `unavailable/HOLD` bırakmış (same-provider peer audit). Bu bölüm o boşluğu kapatır — **farklı provider (Claude) doğrulaması**.

| İddia | Doğrulama | Sonuç |
|---|---|---|
| 323 / 318 aktif / 5 DONE | `master-plan-active.json` summary | ✅ birebir |
| READY 0 · OPEN 221 · BLOCKED 67 · VERIFY 30 | aynı kaynak | ✅ birebir |
| P0 250 (aktif 246) · 723 edge · depth 33 | aynı kaynak | ✅ birebir |
| Baseline 115 dosya / 591 failure | HEAD snapshot doğru; **bugün 113/539'a indi** | ⚠️ bayat ama dürüst işaretlenmiş |
| MCP catalog 49 | `TOOL_CATALOG` sayımı | ✅ |
| Live DB `user_version=1`, 53 interval | salt-okunur PRAGMA | ✅ |

**Verdikt: analiz güvenilir.** Metodolojisi dürüst (kanıt sınıfları ayrık, "ne iddia etmiyorum" listesi var, benim eşzamanlı commit'lerimi tespit edip "bunu ben üretmedim, test etmedim" diye işaretlemiş).

### Analize eklenen düzeltme — "0 READY"in gerçek nedeni

Analiz `READY=0`'ı doğru tespit ediyor ama nedenini vermiyor. Ölçtüm:

> **18 aktif satırın hiçbir bağımlılığı VE hiçbir blocker'ı yok** — yine de OPEN/VERIFY'dalar. `READY` şemada geçerli bir state (`lint-master-plan.mjs:99,170-173` geçiş kuralları dahil), fakat MASTER-PLAN.md'de **tek satır bile READY yazılmamış**. State elle yazılıyor, türetilmiyor.

Sonuç: `READY=0` bir **tıkanıklık değil, yazım boşluğu**. F-004'ün çaresi sanıldığından ucuz.

---

## 1. 🔑 EN KRİTİK BULGU — ledger tek bir satırın arkasında duruyor

Transitive dependent sayımı (kim kaç işi bekletiyor):

| Bloke ettiği iş | ID | State | Bağımlılığı |
|---:|---|---|---|
| **290 / 318** | `SSOT-001` | VERIFY | **yok** |
| 262 | `SSOT-003` | VERIFY | SSOT-001 |
| 236 | `PRINCIPAL-001` | OPEN | var |
| 224 | `OPERATION-001` | OPEN | var |
| 215 | `TENANT-001` | OPEN | var |

`SSOT-001`'in kabul kriteri: *"Archive SHA-256 source hash ile aynı ve tracked fresh-clone proof'u var"*. Evidence hücresi: *"archive hash doğrulandı; commit/fresh-clone evidence bekliyor"*.

### Bugün üretilen kanıt (bu oturum)

```
beklenen : d6a90fc085a5bb7f62804d391840e399f669d4ec4cb67c7214e3480e731333e1
diskteki : d6a90fc085a5bb7f62804d391840e399f669d4ec4cb67c7214e3480e731333e1   ✓
tracked  : EVET
fresh-checkout (git archive HEAD → temiz dizin → sha256):
           d6a90fc085a5bb7f62804d391840e399f669d4ec4cb67c7214e3480e731333e1   ✓
HEAD     : 56d5406f0be269d32c90c97977b427b6deb9cf6a
```

**Yani `SSOT-001`'in bekleyen kanıtı artık var.** Ağ gerektirmeden, HEAD'in tracked içeriğinden üretildi — "fresh clone bu dosyayı byte-identical verir" iddiasının tam karşılığı.

> **Onayına sunulan ilk hamle:** `SSOT-001` → `DONE`, evidence olarak bu fresh-checkout proof'u. Bu tek satır 290 işin önündeki nominal engeli kaldırır.

---

## 2. PAZARTESI kararları → Work ID eşlemesi

Kural: her owner kararı ya **mevcut canonical ID**'ye bağlanır ya **yeni ID** alır ya **explicit supersession** olur. Sahipsiz karar kalmaz.

| PAZARTESI kalemi | Eşleşen Work ID | Aksiyon |
|---|---|---|
| P1 · Durable-yazım authority (211 kırık) | `RESULT-RECONCILIATION-001` + `RECOVERY-BORN-485-TERMINAL-PUBLICATION-001` + `KERNEL-SETTLEMENT-001` | Mevcut sahiplere **child closure** olarak bağla; yeni ID yok |
| P2 · Orchestra kalanı (135) | `SCHEDULER-001`, `EVALUATION-001` | Mevcut sahiplere bağla |
| P3 · CLI drift (95) | `SURFACE-CUTOVER-001`, `STATUS-SURFACE-PARITY-001` | Mevcut sahiplere bağla |
| P4 · MCP-bundle (70) | `STATUS-SURFACE-PARITY-001`, `SURFACE-PARITY-001` | Mevcut sahiplere bağla |
| P5 · error-registry ratchet | — | ✅ **2026-08-03 KAPANDI** (46→0). Yeni ID gerekmez; kapanış receipt'i `TRUTH-BASELINE-001`'e delil |
| P6 · provider-observation runId | ✅ **KAPANDI** (4→0) | `RECOVERY-BORN-490-PROVIDER-OBSERVATION-001` evidence'ına yaz |
| P7 · DOC-GAP (187 skip) | `DOCS-TOPOLOGY-001` | Mevcut sahibe bağla |
| P8 · Dashboard entegrasyon (2) | `DASHBOARD-OBS-001` | Mevcut sahibe bağla |
| P9 · ortam-bağımlı (~6) | `TEST-PLATFORM-001` | Mevcut sahibe bağla |
| P10 · OQ-18 VitePress | `DOCS-TOPOLOGY-001` | Owner kararı bekleyen alt-kalem |
| P11 · spawnSync async | `TEST-SPAWN-001` | Mevcut sahip; **prod hot-path için kapsam genişletilmeli** (bugün 4 yeni kayıt eklendi) |
| P12 · provider DB v1→v2 | `RECOVERY-BORN-490-PROVIDER-OBSERVATION-001` | Mevcut sahip |
| P13 · 24 açık HOLD | `SSOT-002` | Reconciliation kapsamında |
| **Test-failure ratchet (bugün kuruldu)** | `TRUTH-BASELINE-001` | Bu satırın **kanıt aracı**; baseline 113/539 |
| Type Check kök nedeni (dist ↔ hermetiklik) | `TEST-HERMETIC-001` | Kapanış kaydı |

**Sonuç: PAZARTESI'nin 14 kaleminin 14'ü de mevcut ID'lere bağlanıyor. Yeni ID gerekmiyor.** Analizin "recovery-born fragmentation" teşhisi doğru — sorun eksik satır değil, sahipsiz karar.

---

## 3. 54 code-doc bulgusu → Work ID eşlemesi

20 aday iş (54 farkı kapsıyor) mevcut ledger'a karşı tarandı:

| Aday | Mevcut sahip | Durum |
|---|---|---|
| 1 · Generated reference/identity restore | `DOCS-RELEASE-TRUTH-001` | ✅ **2026-08-02 kapandı** — evidence'a yaz |
| 4 · Provider observation v1→v2 | `RECOVERY-BORN-490-PROVIDER-OBSERVATION-001` | var |
| 5 · Logical-progress/settlement certification | `RECOVERY-BORN-488-DEPENDENCY-AUTHORITY-001` | var |
| 6-9 · MCP annotation/cleanup/approval/parity | `SURFACE-PARITY-001`, `STATUS-SURFACE-PARITY-001` | var |
| 11 · Execution authority chain | `KERNEL-ONTOLOGY-001`, `OPERATION-001` | var |
| 12 · Tool-scope enforcement | `CAPABILITY-001` | var |
| 13 · Role/capability vocabulary | `CAPABILITY-001`, `TENANT-001` | var |
| 15 · Provider-neutral mode presets | `CM-01`, `CM-05` | var |
| 16 · CLI help/i18n/risk-language | `FO-10-I18N`, `SURFACE-CUTOVER-001` | var |
| 17-18 · Config read + run/sprint vocabulary | `SURFACE-CUTOVER-001` | var |
| 19 · SQLite migration governance | `MEMORY-DB-001` + yeni alt-kapsam | kısmi |
| 20 · Docs toolchain/link-scope | `DOCS-TOPOLOGY-001` | var |
| **2 · Runtime Node floor (CLI-12)** | **YOK** | 🆕 **yeni ID gerekiyor** |
| **3 · Error registry closure (ERR-01)** | **YOK** | 🆕 **yeni ID gerekiyor** |
| **10 · Canonical lifecycle vocabulary (ARCH-01)** | kısmen `KERNEL-ONTOLOGY-001` | 🆕 alt-kalem gerekiyor |
| **14 · Config metadata/default generation (CFG-03/04)** | **YOK** | 🆕 **yeni ID gerekiyor** |

**Önerilen 4 yeni satır** (tam şema ile, §6'da).

---

## 4. P0 yeniden sınıflandırma önerisi

Codex'in politikası (`14-critical-path`): P0 ancak şu 4 sorudan **en az birine evet** ise.
Buna **ölçülebilir bir kriter** ekliyorum: *transitive dependent sayısı*.

| Kategori | Sayı | Öneri |
|---|---:|---|
| Aktif P0 (bugün) | **246** | — |
| Hiç kimseyi bloke etmeyen P0 (`dependents = 0`) | **56** | → **P1'e indir** (blocked-critical-path testini geçmiyor) |
| ≥100 iş bloke eden P0 | **14** | → **P0 kalır** (gerçek omurga) |
| Kalan (1–99 bloke eden) | 176 | → güvenlik/tenant/authority sınırı içerenler P0 kalır; diğerleri P1 |

**Kaba hedef: 246 → ~90 P0.** Bu, priority'yi tekrar sinyal haline getirir.

> ⚠️ Sınır: `dependents=0` tek başına P1 gerekçesi değil. 56'nın içinde `REPO-DECK-001` (`.deck` secret'ı Docker image layer'ında) gibi **güvenlik** kalemleri var — bunlar politikanın 3. sorusundan P0 kalır. Nihai liste satır-satır gözden geçirilmeli; bu tablo **ön eleme**dir, otomatik karar değil.

---

## 5. READY root önerisi

`READY` tanımı: *"dependency ve gate'leri sağlanmış; execution slice'a alınabilir."*

| Aday | Neden READY | Bloke ettiği |
|---|---|---|
| **`SSOT-001`** | Bağımlılık yok · kanıtı bugün üretildi · aslında **DONE** adayı | 290 |
| **`SSOT-003`** | Tek bağımlılığı SSOT-001; o kapanınca READY | 262 |
| `TEST-675` | Bağımlılık yok · blocker yok · scope net (test writer discovery) | — |
| `TEST-676` | Bağımlılık yok · blocker yok | — |
| `RUN-STATUS-AUTHORITY-001` | Bağımlılık yok · P1 çalışmasının doğrudan hedefi | — |
| `RESULT-RECONCILIATION-001` | Bağımlılık yok · VERIFY · P1'in çekirdeği | — |

**Önerilen ilk READY root: `SSOT-003`** (SSOT-001 DONE'a geçtikten sonra).
Gerekçe: 262 işi bekleten, bağımlılığı kapanmış, kabul kriteri ölçülebilir (validator + generated projections + CI fail-closed) ve **kanıt zinciri zaten çalışıyor** (`lint:master-plan` bugün yeşil).

### `SSOT-003` production closure / proof planı

| Adım | Kanıt |
|---|---|
| 1. Validator fail-closed | `npm run lint:master-plan` → OK (bugün doğrulandı: 322 satır, projeksiyonlar in-sync) |
| 2. Generated projection deterministik | Aynı kaynaktan iki kez üretim → byte-identical |
| 3. CI'da fail-closed | `lint:gates` zincirinde `lint-master-plan.mjs --check` (bugün `&&` zincirinde doğrulandı) |
| 4. Cross-platform | `X` boyutu — CI matrisinde koşum kanıtı |
| 5. Receipt | `GR-2026-07-26-SSOT-003-01/02` + yeni commit-bound settlement |

Açık kalan: `X` (cross-platform) ve commit-bound settlement — bunlar `APPROVAL-001`/`RECEIPT-001`/`AUDIT-001` altında.

---

## 6. Önerilen yeni satırlar (tam şema, onay sonrası MASTER'a)

| Order | ID | Parent | Program | Outcome | Priority | DependsOn | Gate | State | Truth | Acceptance | Evidence | Updated |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| — | `RUNTIME-FLOOR-001` | P00 | TRUTH | Tek runtime minimum sürüm contractı: package engines, doctor, onboarding ve release gate aynı floor'u ilan ve test eder | P1 | SSOT-003 | G1 | OPEN | `0/0/0/?/0/?/?` | `doctor`, `package.json engines`, onboarding ve release gate tek kaynaktan aynı minimum Node sürümünü verir; drift CI'da fail-closed | CLI-12: `doctor --json` "v24.15.0 (>=18 required)" derken `engines>=24`; 2026-08-02 gerçek binary çıktısıyla doğrulandı | 2026-08-03 |
| — | `ERROR-REGISTRY-001` | P00 | TRUTH | Emitted her `DECKENT_E***`/typed error code tek registry'de message+remediation ile kayıtlı; docs aynı kaynaktan üretilir | P1 | SSOT-003 | G1 | OPEN | `~/0/0/1/0/?/?` | Registry-dışı emitted kod yok; `lint:errors` fail-closed; doküman generated | ERR-01. 2026-08-03: 46 kayıtsız raw throw tipli `DeckentError`'a çevrildi, `lint:errors` YEŞİL; registry-generated docs kalıyor | 2026-08-03 |
| — | `CONFIG-TRUTH-001` | P00 | TRUTH | Config leaf metadata/default üretimi: 164 leaf için no-missing/equality gate ve manifest backend default'u aynı canonical kaynaktan | P1 | SSOT-003 | G1 | OPEN | `0/0/0/?/0/?/?` | Config şeması, default'lar ve manifest tek kaynaktan üretilir; drift CI'da fail-closed | CFG-03, CFG-04 | 2026-08-03 |
| — | `LIFECYCLE-VOCAB-001` | KERNEL-ONTOLOGY-001 | KERNEL | Canonical sekiz phase tek vocabulary: enum, controller event'leri, docs ve terminal projection aynı listeyi gösterir | P1 | KERNEL-ONTOLOGY-001 | G1 | OPEN | `~/0/0/?/0/?/?` | `SprintPhase` enum, emitted transition, DECKENT.md ve read-model aynı sekiz phase; CLEANUP çelişkisi kapanır | ARCH-01; Codex F-analizi 06: controller CLEANUP çalıştırıyor, enum'da yok, emitted DECAY→COMPLETE | 2026-08-03 |

---

## 7. Onayına sunulan kararlar

1. **`SSOT-001` → DONE**, evidence = bugünkü fresh-checkout proof'u (hash + HEAD).
2. **`SSOT-003` → READY** (SSOT-001 kapanınca), yukarıdaki closure planıyla.
3. **PAZARTESI'nin 14 kalemi** listelenen mevcut ID'lere child/evidence olarak bağlansın.
4. **4 yeni satır** (`RUNTIME-FLOOR-001`, `ERROR-REGISTRY-001`, `CONFIG-TRUTH-001`, `LIFECYCLE-VOCAB-001`) MASTER'a eklensin.
5. **P0 yeniden sınıflandırması**: `dependents=0` olan 56 satır satır-satır gözden geçirilip güvenlik/tenant hariç P1'e insin (246 → ~90 hedefi).
6. **Baseline sayısı** 591/115 → **539/113** olarak güncellensin.
7. Bu ledger Codex'e **xverify**'a gitsin (farklı-provider ikinci görüş: P0 sınıflandırması + READY root seçimi).

## 8. Bu turda YAPILMAYANLAR (dürüstlük kaydı)

- MASTER-PLAN.md değiştirilmedi.
- 246 P0'ın satır-satır incelemesi yapılmadı; yalnız ölçülebilir ön eleme (dependents) üretildi.
- Codex'in 24 finding'inin (F-001…F-024) her biri ayrı Work ID'ye bağlanmadı — bu tur PAZARTESI + code-doc katmanını kapattı; F-serisi bir sonraki turda.
- Hiçbir test/build koşulmadı (bu tur analiz+planlama).


---

# EK — UYGULAMA SONUCU (2026-08-03, MASTER'a yazıldı)

7 karar onaylandı ve uygulandı. **İkisi validator tarafından bloke edildi ve bu doğru davranıştı.**

## ✅ Uygulananlar

| # | Karar | Sonuç |
|---|---|---|
| 1 | `SSOT-001` → DONE | ✅ Truth `1/1/1/1/1/-/-`, `proof=master-archive-fresh-checkout-56d5406f0` ile yazıldı. Terminal satır sayısı 5 → **6** |
| 4 | 4 yeni satır | ✅ `RUNTIME-FLOOR-001` (450), `ERROR-REGISTRY-001` (460), `CONFIG-TRUTH-001` (470) P00'a; `LIFECYCLE-VOCAB-001` (3305) P03'e. Ledger 323 → **327** |
| 6 | Baseline 591/115 → 539/113 | ✅ `TRUTH-BASELINE-001` evidence'ına ratchet aracıyla birlikte yazıldı |
| 3 | PAZARTESI kalemleri | ✅ kısmi: baseline/ratchet kaydı `TRUTH-BASELINE-001`'e işlendi; kalan 13 kalem evidence-only, sonraki turda |

## ⛔ Validator'ın durdurdukları — governance-by-construction çalışıyor

### Karar #2 (READY root) — **owner receipt'i olmadan mümkün değil**

İki katmanlı engel çıktı:

1. **`SSOT-003` READY OLAMAZ.** Tek child'ı `MASTER-CLI-SYMLINK-FLAKE-001` OPEN durumda; kural: *"doğrudan child'ların tamamı DONE/DISPOSED olmadan parent READY olamaz"*. Yani öneriyi `MASTER-CLI-SYMLINK-FLAKE-001`'e kaydırdım — o, 262 işi bekleten `SSOT-003`'ün gerçek kilidi.
2. **O da READY olamadı:** `ADMISSION_RECEIPT_MISSING — READY mutation item has no active scope-exact G1 receipt`.

`READY`, satıra + G1'e özel **owner-issued admission receipt'i** gerektiriyor:
`GR-YYYY-MM-DD-<SCOPE>-NN` · exact file manifest (`path@sha256`) · `owner=Alperen; decision=APPROVED; scope=...; exclusions=...`. Bunu ben veremem, üretmedim.

> **Bu, §0'daki tespitimin düzeltmesidir.** "0 READY yalnız yazım boşluğu" demiştim — **eksik**. Doğrusu: READY hem yazım hem **owner admission authority** gerektirir. Ledger'ın hiç READY içermemesinin gerçek nedeni, hiç admission receipt'i yayımlanmamış olması.

Satır `OPEN` bırakıldı; READY-eligibility gerekçesi evidence'a yazıldı.

### Karar #5 (P0 yeniden sınıflandırma) — **~90 hedefi yanlıştı**

Codex'in 4 soruluk politikasını doğru uygulayınca:

| Filtre | Kalan |
|---|---:|
| Aktif P0 | 246 |
| `dependents=0` ve child'sız | 41 |
| − güvenlik/tenant/authority (Q3) | 27 |
| − `RECOVERY-BORN-*` gözlenmiş execution hatası (Q1) | 12 |
| − TRUTH/ASSURANCE truth-sinyali (Q2) | **9** |

**Savunulabilir P1 adayı: 9** (56 değil). Toplu indirme YAPILMADI.

Sebep: 27 satırın çoğu `RECOVERY-BORN-*` — gerçek koşularda gözlenmiş execution hataları ("worker-writable heartbeat monotonic recovery'yi bozabiliyor", "scope hatası provider usage-limit sanılıyor"). Politikanın 1. sorusu bunları **P0 yapıyor**.

**Bulgu:** P0 enflasyonu esas olarak "yanlış etiketleme" değil. 246 P0'ın büyük kısmı politikanın en az bir sorusundan gerçekten geçiyor. Gerçek çare, etiket düzeltmek değil **owner-set P0 bütçesi** (aynı anda kaç P0 admission alabilir) olmalı — bu bir owner kararıdır.

9 aday: `CODEX-C10`, `TERMINAL-ONBOARD-001`, `NATIVE-DEV-001`, `TERMINAL-XPLAT-001`, `STATUS-SURFACE-PARITY-001`, `API-OPERATIONS-001`, `DESIGN-SYSTEM-001`, `RELEASE-001`, `ENTERPRISE-MODULARITY-001`. (`RELEASE-001` ve `STATUS-SURFACE-PARITY-001` tartışmalı — ikisi de owner onayı ister.)

## Ledger'ın yeni hâli

| Ölçü | Önce | Sonra |
|---|---:|---:|
| Toplam / aktif / terminal | 323 / 318 / 5 | **327 / 321 / 6** |
| DONE | 5 | **6** |
| READY | 0 | 0 *(admission receipt bekliyor)* |
| P0 / P1 / P2 | 250 / 57 / 16 | 250 / **61** / 16 |

Doğrulama: `lint:master-plan` **OK** (327 satır, 23 receipt, projeksiyonlar in-sync) · `lint:link` 0 kırık.

## Sıradaki owner kararları

1. `MASTER-CLI-SYMLINK-FLAKE-001` için **G1 admission receipt'i** yayımla → 262 işin kilidi açılır.
2. **P0 bütçesi** belirle (etiket indirimi değil, eşzamanlı admission limiti).
3. 9 P1 adayını onayla/reddet.
4. Bu ledger'ı Codex'e **xverify**'a gönder (karar #7).
