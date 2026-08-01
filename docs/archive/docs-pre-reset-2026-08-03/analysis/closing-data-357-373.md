# CLOSING-DATA-PACK — Sprint 357–373 (7-8 Temmuz Kapanış Veri-Paketi)

Generated: 2026-07-06 (task 374-001, worker-authored). **Halef-notu:** bu doküman
`docs/analysis/closing-data-357-370.md`'nin (task 371-007) 357-373'e genişletilmiş halefidir — aynı
4-bölüm yapı (script koşusu / sprint-tablosu / born-durumları / teslim-özetleri) 371-373'ü kapsayacak
şekilde yeniden-üretildi, ARADAKİ TÜM SAYILAR yeniden script'ten çekildi (öncekinden kopyalanmadı).
İKİ YENİ BÖLÜM eklendi: **Bölüm 5** (372-arıza vakası — abonelik-kesintisi) ve **Bölüm 6**
(373-dürüstlük-sınavı). Bu doküman da öncekiyle aynı disiplinle **ham-ama-doğrulanabilir veridir —
yorum/değerlendirme katmanı kapsamı dışında**. Her bölümün üretim komutu Appendix'te
tekrar-üretilebilir şekilde belgelenmiştir.

---

## 1. `series-metrics.mjs` — 357–373 (script değişmez)

Komut (script dosyasına dokunulmadı; çıktı `.brain/archive/`/`scripts/` dışına, `/tmp/`'a yazıldı):

```
node scripts/series-metrics.mjs 357 373 --out-json=/tmp/series-357-373.json --out-md=/tmp/series-357-373.md
```

Kaynak: `.brain/archive/sprint-N-tasks/` (task JSON + `.result` dosyaları). Aynı-sprint `-fix`
zincirleri en-derin somut-sonuca katlanır (fold); `.result.brainEvaluation` alanı
`task.json.status`'a önceliklidir (bkz. `scripts/series-metrics.mjs:61-66`) — tanım öncekiyle
birebir aynı, tekrarlanmıyor (bkz. Appendix).

Ham script çıktısı (generated 2026-07-06T11:33:55.219Z), aynen — 357-370 satırları önceki
paketten değişmeden taşındı, **371-373 satırları bu koşuda yeni eklendi**:

| Sprint | Tasks (folded) | DONE | Tech Debt | NO_GO | Pending | Duration | Self↔Brain Uyum | Fix/Heal |
|--------|------:|-----:|----------:|------:|--------:|---------:|:---------------:|:--------:|
| sprint-357 | 16 | 12 | 4 | 0 | 0 | 25m 48s | 76% (13/17) | 100% (1/1) |
| sprint-358 | 17 | 13 | 4 | 0 | 0 | 33m 18s | 78% (14/18) | 100% (1/1) |
| sprint-359 | 16 | 10 | 6 | 0 | 0 | 22m 6s | 94% (15/16) | N/A (0/0) |
| sprint-360 | 17 | 14 | 1 | 0 | 2 | 5h 27m | 54% (14/26) | 92% (11/12) |
| sprint-361 | 16 | 13 | 3 | 0 | 0 | 41m 13s | 88% (15/17) | 50% (1/2) |
| sprint-362 | 13 | 10 | 3 | 0 | 0 | 41m 54s | 86% (12/14) | 50% (1/2) |
| sprint-363 | 13 | 9 | 3 | 1 | 0 | 30m 18s | 87% (13/15) | 25% (1/4) |
| sprint-364 | 11 | 7 | 3 | 1 | 0 | 28m 59s | 83% (10/12) | 33% (1/3) |
| sprint-365 | 9 | 1 | 0 | 0 | 8 | 27m 9s | 100% (1/1) | 100% (1/1) |
| sprint-366 | 8 | 0 | 0 | 0 | 8 | 0s | N/A (0/0) | N/A (0/0) |
| sprint-367 | 8 | 4 | 3 | 1 | 0 | 34m 25s | 80% (8/10) | 33% (1/3) |
| sprint-368 | 8 | 7 | 1 | 0 | 0 | 17m 34s | 88% (7/8) | N/A (0/0) |
| sprint-369 | 8 | 5 | 3 | 0 | 0 | 17m 2s | 75% (6/8) | N/A (0/0) |
| sprint-370 | 7 | 6 | 1 | 0 | 0 | 10m 26s | 100% (7/7) | N/A (0/0) |
| **sprint-371** | **7** | **5** | **2** | **0** | **0** | **47m 27s** | **86% (6/7)** | **N/A (0/0)** |
| **sprint-372** | **6** | **2** | **0** | **4** | **0** | **7m 15s** | **20% (2/10)** | **0% (0/8)** |
| **sprint-373** | **6** | **6** | **0** | **0** | **0** | **9m 21s** | **100% (6/6)** | **N/A (0/0)** |
| **Cumulative** | **186** | **124** | **37** | **7** | **18** | **12h 1m** | **78%** | **51%** |

Eksik-arşiv sprint yok (17/17 sprint için `.brain/archive/sprint-N-tasks/` mevcut ve okundu).

**sprint-372 satırı hakkında ham veri:** Tasks=6/DONE=2/NO_GO=4 — bu, 6 dispatch edilen root-task'tan
2'sinin (372-002, 372-005) temiz DONE olduğu, kalan 4'ünün (372-001/003/004/006) fold-sonucunda
NO_GO'ya düştüğü anlamına gelir. Bu 4 NO_GO'nun kök-nedeni **kod-hatası değil, canlı bir
abonelik-erişim kesintisidir** — ayrıntı + kanıt-referansları Bölüm 5'te.

**Tanım notu (script'in kendi doc-comment'inden, `scripts/series-metrics.mjs:1-19`):** "Tasks"
alanı aynı-sprint fix-zincirlerinin kök-slota katlanmış (folded) sayısıdır — ham dispatch
sayısı değildir. Bölüm 2'deki ikinci tablo ham dispatch sayısını (runtime job dosyası) ayrı
sütunda taşır; iki sayı kasıtlı olarak farklı tanımlar üzerinden üretilir (fold vs. ham).

**365/366 "Pending" satırları hakkında ham veri (öncekinden değişmedi):** her iki sprint için de
arşivde gerçek `.result` dosyaları mevcuttur — `task.json.status` alanı `EXECUTING`/`PENDING`
üzerinde donmuş kaldığı için script bunları "pending" sayar (kök-neden: `docs/MASTER-PLAN.md`
satır 169, born-484 — bkz. Bölüm 3).

---

## 2. Sprint-başına tablo: task-sayısı / DONE / DEBT / NO_GO / süre / injected-fix

İki ham kaynak yan yana: **(A)** yukarıdaki `series-metrics.mjs` fold-sonucu, **(B)**
`.deckent/runtime/jobs/sprint-N.json`'ın kendi `metrics` alanı (ham dispatch-sayımı — sprint
kapanış commit başlıklarıyla eşleşen sayı). "Injected-fix" = o sprintte `isPriorityFix:true`
işaretli task sayısı (attempted) / bunlardan DONE ya da GO_WITH_TECH_DEBT'e iyileşen sayısı
(healed) — `series-metrics.mjs`'in `fixHeal` alanından.

Komut (B için, her sprint): `cat .deckent/runtime/jobs/sprint-N.json | node -e "…d.metrics…"`
(bkz. Appendix).

| Sprint | (A) Folded Tasks | (A) DONE | (A) DEBT | (A) NO_GO | (A) Pending | (A) Süre | (B) Job totalTasks | (B) Job DONE | (B) Job DEBT | (B) Job NO_GO | (B) Job Süre | Injected-fix (attempted/healed) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 357 | 16 | 12 | 4 | 0 | 0 | 25m 48s | 17 | 12 | 5 | 0 | 25dk 48sn | 1/1 |
| 358 | 17 | 13 | 4 | 0 | 0 | 33m 18s | 18 | 14 | 4 | 0 | 33dk 18sn | 1/1 |
| 359 | 16 | 10 | 6 | 0 | 0 | 22m 6s | 16 | 10 | 6 | 0 | 22dk 5sn | 0/0 |
| 360 | 17 | 14 | 1 | 0 | 2 | 5h 27m | 28 | 25 | 1 | 0 | 327dk 5sn | 12/11 |
| 361 | 16 | 13 | 3 | 0 | 0 | 41m 13s | 17 | 13 | 4 | 0 | 41dk 13sn | 2/1 |
| 362 | 13 | 10 | 3 | 0 | 0 | 41m 54s | 14 | 10 | 4 | 0 | 41dk 53sn | 2/1 |
| 363 | 13 | 9 | 3 | 1 | 0 | 30m 18s | 15 | 10 | 3 | 2 | 30dk 18sn | 4/1 |
| 364 | 11 | 7 | 3 | 1 | 0 | 28m 59s | 12 | 7 | 3 | 2 | 28dk 58sn | 3/1 |
| 365 | 9 | 1 | 0 | 0 | 8 | 27m 9s | 1 | 1 | 0 | 0 | 27dk 8sn | 1/1 |
| 366 | 8 | 0 | 0 | 0 | 8 | 0s | 0 | 0 | 0 | 0 | 4dk 23sn | 0/0 |
| 367 | 8 | 4 | 3 | 1 | 0 | 34m 25s | 10 | 5 | 3 | 2 | 34dk 25sn | 3/1 |
| 368 | 8 | 7 | 1 | 0 | 0 | 17m 34s | 8 | 7 | 1 | 0 | 17dk 33sn | 0/0 |
| 369 | 8 | 5 | 3 | 0 | 0 | 17m 2s | 8 | 5 | 3 | 0 | 17dk 2sn | 0/0 |
| 370 | 7 | 6 | 1 | 0 | 0 | 10m 26s | 7 | 6 | 1 | 0 | 10dk 26sn | 0/0 |
| **371** | **7** | **5** | **2** | **0** | **0** | **47m 27s** | **7** | **5** | **2** | **0** | **47dk 27sn** | **0/0** |
| **372** | **6** | **2** | **0** | **4** | **0** | **7m 15s** | **10** | **2** | **0** | **8** | **7dk 14sn** | **8/0** |
| **373** | **6** | **6** | **0** | **0** | **0** | **9m 21s** | **6** | **6** | **0** | **0** | **9dk 20sn** | **0/0** |
| **Toplam** | **186** | **124** | **37** | **7** | **18** | **12h 1m** | **194** | **138** | **40** | **14** | — | **37/19** |

Not (ham veri — (A) vs (B) farkı, 371-373): **371** satırında (A)==(B) — 371'de hiçbir task
`-fix` zincirine girmedi (injected-fix 0/0), fold ve ham-dispatch sayıları bu yüzden özdeş.
**372** satırında (A) 6 / (B) 10 farkı — 4 root-task (372-001/003/004/006) her biri bir kez
`-fix`'lendi (4 root + 4 fix = 8 ham dispatch, DONE olan 372-002/005 ile birlikte toplam 10);
fold bu 4 zinciri kök-slota katlayıp 6 gösteriyor. Injected-fix "8/0" — 8 fix-attempt'in
HİÇBİRİ iyileşmedi (healed=0); ayrıntı Bölüm 5'te. **373** satırında (A)==(B) — 373'te de
hiçbir `-fix` yok (tüm 6 task ilk denemede DONE).

Not (357-370 satırları öncekinden değişmedi — 365/366 (A) vs (B) job-dosyası farkı ve 360
fold-vs-ham farkı için bkz. `closing-data-357-370.md` Bölüm 2, aynı açıklama geçerli).

---

## 3. Born-457..486 kayıtlarının durum-özeti (MASTER-PLAN'dan) — 371-373 için DEĞİŞİKLİK YOK

Kaynak: `docs/MASTER-PLAN.md` (satır 37 başlık-satırı: `Sıra | ID | Pillar | İş Kalemi | Kaynak |
Önc | Bağımlılık | Durum | Tarih | Not`).

Komut (bu koşuda yeniden çalıştırıldı): `grep -n "^| 4[5-8][0-9] |" docs/MASTER-PLAN.md` — sonuç
457-486 aralığında **357-370 paketiyle birebir aynı 30 satır**, tek karakter farkı yok. Ayrıca özel
olarak 371-373'ün doğurduğu yeni bir born-ID olup olmadığı kontrol edildi:

```
grep -n "born(37[123]" docs/MASTER-PLAN.md   → 0 satır (boş)
```

**Ham bulgu:** 371, 372 ve 373 sprint'lerinin hiçbiri MASTER-PLAN'a yeni bir born-satırı olarak
işlenmedi (`Kaynak` sütununda `born(371 canlı)`/`born(372 canlı)`/`born(373 canlı)` biçiminde
hiçbir giriş yok) — bu, 371-373'te üretilen bulguların (ör. Bölüm 5'teki abonelik-kesintisi vakası,
Bölüm 6'daki dürüstlük-sınavı) MASTER-PLAN'a born-satırı olarak resmileştirilmediği anlamına gelir;
bu doküman o resmileştirmeyi yapmaz (yorum/karar katmanı kapsam-dışı), yalnız ham-durumu raporlar.

**Canlı-drift notu (bu task'ın yazımı SIRASINDA gözlemlendi — disk-verify disiplini gereği ham
şekilde raporlanıyor):** bu bölüm ilk yazıldığında `docs/MASTER-PLAN.md`'nin en yüksek born-ID'si
486 idi ve 487 satırı yoktu (357-370 paketiyle aynı not). Bu task hâlâ sürerken (aynı gün,
2026-07-06) `docs/MASTER-PLAN.md`'ye **committed olmayan, eşzamanlı bir düzenleme** ile 3 yeni satır
eklendi — `git diff docs/MASTER-PLAN.md` bunu `+3 satır, önceki satır 486'dan sonra` olarak
gösteriyor (paylaşımlı-worktree HEAD-drift; bu worker'ın kendi write-scope'u dışında, salt-okunur
gözlem):

| Born-ID | ID (kart-adı) | Pillar | Kaynak | Önc | Durum | Tarih |
|---:|---|---|---|:---:|:---:|---|
| 487 | XPLAT-TEST-DOC | ONB·CI | A (2026-07-06) | P0 | ⬜ | — |
| 488 | REPO-MIGRATION | GA-2 | A (2026-07-06) | P0 | ⬜ | — |
| 489 | DOCS-GROUNDTRUTH-P0 | DOCS | CX-analiz (2026-07-06) | P0 | ⬜ | — |

Bu 3 satırın hiçbirinin `Kaynak` sütunu `born(371/372/373 canlı)` demiyor (ikisi `A` = Alperen,
biri `CX-analiz`) — yani bunlar bu doküman'ın kapsadığı 371-373 sprint-serisinden DOĞMADI, ayrı
ve sonraki bir planlama-turunun (aynı gün, muhtemelen bu task'la eşzamanlı bir başka oturum)
ürünü. Sonuç: **born-457..486 kümesi (bu 3-sprint serisiyle ilgili olarak) 371-373'ten
etkilenmeden sabit kaldı**; 487-489 bu doküman'ın konusu olan seriyle nedensel bağlantısız bir
sonraki-tur kaydıdır, tam-doğruluk için burada not düşüldü.

Durum-dağılımı (öncekiyle aynı, değişmedi): 29/30 `✅` (Tamam), 1/30 `🟡` (Kısmi — born-477
OPENROUTER-PROVIDER, hâlâ 🟡). `🔴`/`⬜`/`⏸️` durumunda hiçbir born-457..486 kaydı yok.

*(Born-457..486'nın tam tablosu — ID/Pillar/Kaynak/Önc/Durum/Tarih/satır — `closing-data-357-370.md`
Bölüm 3'te tekrarlanmıyor; SSOT `docs/MASTER-PLAN.md` satır 142-171, içerik bu koşuda satır-satır
diff'lendi ve değişmediği doğrulandı.)*

---

## 4. Teslim-edilen dosya-sayıları (git log --stat, commit-ref'li)

Komut: `git log --oneline --all | grep -E "sprint-37[123]"` → her commit için
`git show --stat --format="%h %ci %s" <hash>` + `git show --stat --format="" <hash> | tail -1`.

**Sprint-kapanış commit'leri (371, 373 — 372 için AŞAĞIDAKİ NOTA bakın):**

| Sprint | Commit | Commit tarihi | Files changed | Insertions | Deletions |
|---|---|---|---:|---:|---:|
| 371 | `669b2904` | 2026-07-05 16:49:47 +0300 | 46 | 3557 | 105 |
| 372 | *(yok — bkz. not)* | — | — | — | — |
| 373 | `ebc3eafc` | 2026-07-06 14:30:39 +0300 | 55 | 3483 | 90 |

**Not — sprint-372'nin HİÇBİR kapanış commit'i yok:** `git log --oneline --all | grep -i
"sprint-372"` boş dönüyor (0 satır) — bu, 357-370 aralığındaki 365-özel-durumundan (365'in
teslimatı 366-hasat commit'ine harmanlandı) farklı: 372'nin teslimatı **hiçbir commit'e
harmanlanmadı**, dosyalar bugüne kadar (2026-07-06, bu task'ın başlangıç anı) hâlâ untracked/
uncommitted durumda. Kanıt — bu worker'ın kendi görev-başlangıcındaki `git status --short` çıktısı:

```
 M .brain/heartbeat-log.md
 M .deckent/ci-baseline.json
 M .deckent/settings/resource-log.jsonl
 M DIRECTIVES.md
?? .analysis/paperclip-vs-deckent-comparison.md
?? .deckent/runtime/decisions/
?? .deckent/sprint-346-evaluate-lock
```

Bu 3 untracked yol (`.analysis/paperclip-vs-deckent-comparison.md`, `.deckent/runtime/decisions/`,
`.deckent/sprint-346-evaluate-lock`) task-372-001'in kendi `.result` dosyasındaki `filesChanged`
listesiyle **birebir örtüşüyor** — yani 372-001'in (ve zincirdeki diğer 372 task'larının) gerçekten
üretilmiş çıktıları, 2026-07-06 tarihli bugün bile, hâlâ commit edilmeden diskte duruyor. Bu
gözlem, Bölüm 5/6'daki "372 gerçekten çalıştı ama arıza yüzünden hem NO_GO oldu hem de commit'e
giremedi" tablosunu bağımsız (git-durum tabanlı) bir ikinci kaynaktan doğruluyor.

---

## 5. 372-arıza vakası — abonelik-kesintisi → 8 dürüst-NO_GO

**Ham-özet:** sprint-372, 6 root-task dispatch etti (`.deckent/runtime/jobs/sprint-372.json`,
`completedAt: 2026-07-05T14:01:40.746Z`, süre 7dk 14sn). Bunlardan 2'si (372-002, 372-005) temiz
DONE oldu; 4'ü (372-001, 372-003, 372-004, 372-006) **canlı bir Claude-abonelik-erişim kesintisi**
yüzünden NO_GO'ya düştü. Sistem, kesinti sırasında hiçbir sahte-DONE üretmedi — her worker,
gerçek `exitCode`/`is_error` durumunu olduğu gibi rapor etti (bkz. alt-bölümler).

### 5.1 Kanıt — kesintinin kendisi (worker `.log` dosyaları, ham JSON satırları)

Root-task'ların (372-001/003/004/006) kendi `.log` dosyalarının SON satırı (tek-satırlık JSON,
`node -e "JSON.parse(...)"` ile ayrıştırıldı):

```
task-372-001.log: {"is_error":true,"api_error_status":403,"subtype":"success",
  "result":"Failed to authenticate. API Error: 403 The socket connection was closed
  unexpectedly. For more information, pass `verbose: true` in the second argumen[t]",
  "duration_ms":410590}
task-372-003.log: … aynı result-mesajı, duration_ms:398510
task-372-004.log: … aynı result-mesajı, duration_ms:365937
task-372-006.log: … aynı result-mesajı, duration_ms:376854
```

Bu 4 root-task, 365-410 saniye boyunca GERÇEK iş yaptı (bkz. 5.2 — dosyalar gerçekten
değişti), ama oturumun sonunda socket kesintisiyle 403'e düştü.

Brain'in bu 4 task için ürettiği `-fix` (öncelikli-düzeltme) denemeleri ise **farklı** bir
403 mesajıyla, neredeyse anında (≈500ms, 0 token) başarısız oldu — bu, mid-session socket-drop
değil, sert bir erişim-reddi:

```
task-372-001-fix.log: {"is_error":true,"api_error_status":403,"duration_ms":505,
  "result":"Your organization has disabled Claude subscription access for Claude Code ·
  Use an Anthropic API key instead, or ask your admin to enable access", "usage":{... 0 token ...}}
task-372-003-fix.log / -004-fix.log / -006-fix.log: aynı mesaj, aynı 0-token örüntü
```

`task-372-002.log` (DONE olan task) da aynı "organization has disabled…" mesajını taşıyor
AMA 43 turn / 348622ms / gerçek token-kullanımı (`input_tokens:16298, output_tokens:25378`)
ile — yani bu worker gerçek işini bitirip `.result` dosyasını DONE olarak yazdıktan SONRA,
oturumun kapanış-turunda aynı kesintiye çarpmış (rubric 100 → DONE, `task-372-002.json
createdAt/status` ile tutarlı). `task-372-005.log` ise temiz: `is_error:false,
api_error_status:null` — bu kesintiden hiç etkilenmedi.

**Zaman-çizelgesi (task-JSON `createdAt` alanlarından, ham):**

| Adım | Zaman (UTC) | Task-ID'ler | Sonuç |
|---|---|---|---|
| Sprint dispatch | 2026-07-05T13:52:17.341Z | 372-001..006 (root, 6 task) | 2 DONE (002,005) / 4 socket-drop-403 (001,003,004,006) |
| İlk `-fix` dispatch | 2026-07-05T13:59:03 – 13:59:12Z | 001-fix, 003-fix, 004-fix, 006-fix | 4/4 anında "org disabled subscription" 403 |
| İkinci `-fix-fix` dispatch (oluşturuldu) | 2026-07-05T13:59:31 – 13:59:32Z | 001-fix-fix, 003-fix-fix, 004-fix-fix, 006-fix-fix | **status: PENDING** — hiçbiri hiç spawn edilmedi (ne `.hb`, ne `.log`, ne `.result` var) |
| Sprint kapandı | 2026-07-05T14:01:40.746Z | — | job-dosyası `status:"COMPLETE"`, `totalTasks:10` (6 root + 4 fix; 4 fix-fix hiç sayılmadı çünkü hiç çalışmadı) |

Komut (fix-fix'lerin hiç çalışmadığını doğrulamak için):
```
ls -la .brain/archive/sprint-372-tasks/ | grep "fix-fix"
# → yalnız 4× *.json (task-tanımı) var; *.hb / *.log / *.result YOK
```

### 5.2 Kanıt — root-task'ların gerçekten çalıştığı (kesinti işi yalanlamadı)

`task-372-001.result`'ın kendi `notes` alanı, Brain'in bu durumu nasıl gördüğünü ham şekilde
belgeliyor: *"Worker timeout/killed (exitCode=1) but git diff shows 40 files modified. Brain
should reconcile via Spurious NO_GO helper."* — yani worker gerçek dosya değişikliği üretti
(`filesChanged` alanında 40 dosya, `docs/adr/adr-d-011-global-install-project-scope.md` dahil),
ama oturum socket-kesintisiyle koptuğu için `exitCode:1` ile işaretlendi ve rubric 45.33 puanla
NO_GO'ya düştü (100 eşik yerine). Aynı örüntü 372-003 (45.87), 372-004 (45.07/44.8 fix-varyantı),
372-006 (45.33) için de birebir tekrarlanıyor.

**Sonuç (ham, yorumsuz):** 372'nin 8 ham NO_GO'sunun (job-dosyası `noGo:8`, Bölüm 2 (B) sütunu)
tamamı, tek bir canlı altyapı-olayına (Claude abonelik-erişiminin geçici olarak kapatılması)
bağlanabiliyor — hiçbir worker, kesinti sırasında sahte bir DONE/başarı raporu üretmedi;
her biri gerçek `exitCode`/`is_error`/`api_error_status` durumunu olduğu gibi yansıttı.

---

## 6. 373-dürüstlük-sınavı — aynı DIRECTIVES'in yeniden-koşusu, 6/6 ground-truth-first

**Ham-özet:** `sprint-373`'ün DIRECTIVES dosyası (`.brain/archive/DIRECTIVES-sprint-373.md`)
kendi başlığında bile hâlâ **"SPRINT-372: KARAR-KAPISI ADR-PAKETİ + E2E-SMOKE + DEBT-371 +
CURSOR-HARNESS (6 task)"** yazıyor — yani 373, 372'nin DIRECTIVES'inin harfiyen (byte-seviyesinde
aynı 6 task-tanımı, aynı scope/goCriteria/nogo) yeniden-koşusu. Commit mesajı bunu doğruluyor:
`ebc3eafc feat(sprint-373): 372'nin tam yeniden-koşusu — 6/6 DONE (0 DEBT, 0 NO_GO, 9dk) +
dürüstlük-sınavı kanıtı`. Bu, Bölüm 5'teki arızanın giderilmesinden sonra AYNI 6 task'ın
temiz-ortamda tekrar denenmesidir.

**Sonuç:** 6/6 DONE, 0 DEBT, 0 NO_GO, 9dk 20sn — 372'nin 2/6 DONE'una karşı tam-kapanış.

### Ground-truth-first davranış örnekleri (6 worker'ın kendi `.result.notes` alanından, aynen alıntı)

Her 6 worker da, kendi task'ının hedef-dosyasının **disk'te zaten var olduğunu** (372'nin
socket-kesintisi öncesi ürettiği gerçek iş — bkz. Bölüm 5.2) tespit etti ve — Karpathy Disiplin
2/3 (sadelik-öncelik, cerrahi-değişiklik) gereği — SIFIRDAN YENİDEN YAZMAK yerine, mevcut taslağı
**satır-satır disk'e karşı yeniden-doğruladı**, yalnız somut hatâ bulduğu yerlerde düzeltti:

- **373-001** (`adr-d-011-global-install-project-scope.md`): *"Ground-truth check first (per
  CLAUDE.md disk-verify rule): … already existed on disk … Instead of rewriting … I verified
  every factual and line-number citation against current source … Found and fixed one
  imprecision: the citation 'src/core/config.ts:1446-1487' implied all four merge layers …
  actually live at ~1529-1550, outside it. Replaced with a precise per-layer citation."*
- **373-002** (`adr-d-012-terminal-risk-language.md`): *"… this sprint's 373-002 is a re-queue
  of the same task because the prior container was OOM/force-stopped before writing its own
  .result … Rather than rewrite it … I re-verified every major disk-citation against the
  CURRENT source tree … confirmed via git log/git diff --stat that [4 dosya] are all unchanged
  at HEAD … Found and fixed 2 real citation errors."*
- **373-003** (`adr-d-013-nl-dispatch-default.md`): *"… treated as in-progress work from an
  interrupted prior turn, not a finished task. Verified every file:line citation against
  current disk state before accepting it … Found and fixed one real gap: the draft cited
  docs/design/term5-risk-language.md directly but never mentioned that ADR-D-012 … already
  exists on disk."*
- **373-004** (`serve-endpoints-smoke.test.ts`): *"Write-scope file … already existed on disk
  (untracked, uncommitted) fully implementing the required hermetic real-binary smoke harness
  -- verified it rather than rewriting it … npx vitest run tests/e2e/serve-endpoints-smoke.test.ts
  -> 8/8 passed in 1.28s … dist/cli/entry.js is present on this checkout so the suite exercised
  the real binary path, not the skip branch."*
- **373-005** (`debt-close-371.md`): *"… docs/analysis/debt-close-371.md ALREADY existed (git
  status: untracked/??) … Root cause: sprint-372 was never committed at all (git log has no
  sprint-372 commit …) … Rather than trust 372-005's claims or the DB's blanket 'resolved'
  status (per project rule 'Disk-verify ground truth' …), I independently re-derived everything
  from zero … Ran `npx vitest run tests/core/builtins/catalog-sync-parity.test.ts
  tests/core/agent-pool.test.ts` myself -> 101/101 pass … matching 372-005's reported numbers
  exactly."*
- **373-006** (`cursor-model.ts` + test): *"Found src/cli/repl/cursor-model.ts +
  tests/cli/repl-cursor-model.test.ts already present on disk, untracked … with header comments
  citing 'Task 372-006' … git log/SPRINT-LOG show 372-006 was the same CURSOR-HARNESS task in
  sprint-372, which ended NO_GO … rather than rewriting a working in-scope implementation from
  scratch, I independently re-verified it against this task's goCriteria: `npx tsc --noEmit` is
  clean, and `npx vitest run tests/cli/repl-cursor-model.test.ts` passes 34/34 … Only change I
  made … corrected the stale 'Task 372-006' header references to 'Task 373-006'."*

**Ham-desen (yorumsuz, 6/6 worker'da tekrarlanan adım-sırası):** (1) disk'te zaten var olan
içeriği keşfet → (2) SIFIRDAN yazmak yerine mevcut içeriği kabul-adayı olarak ele al → (3) her
somut iddiayı/satır-referansını GÜNCEL kaynağa karşı tek-tek yeniden-doğrula → (4) yalnız
gerçek-hata bulunan noktaları düzelt (minimum-diff) → (5) proje lint/test komutlarını gerçekten
çalıştırıp kanıtı `notes`'a yaz → (6) `docImpact:` ile kapsam-dışı bulguları (373-002,
373-003, 373-005) orkestratöre iade et. Hiçbir worker "zaten var, DONE" deyip es geçmedi;
hiçbiri de körü körüne yeniden-yazmadı — ikisi arasındaki "doğrula-sonra-tamamla" orta-yolu
6/6'da tutarlı şekilde uygulandı.

---

## Appendix — Kaynak Komutları (tekrar-üretilebilirlik)

```
# Section 1
node scripts/series-metrics.mjs 357 373 --out-json=/tmp/series-357-373.json --out-md=/tmp/series-357-373.md

# Section 2 (per-sprint job metrics, örnek n=371..373 — 357..370 için closing-data-357-370.md Appendix'e bakın)
for n in 371 372 373; do
  node -e "const d=require('./.deckent/runtime/jobs/sprint-$n.json'); const m=d.metrics||{}; \
    console.log('$n', JSON.stringify({status:d.status, totalTasks:m.totalTasks, done:m.done, techDebt:m.techDebt, noGo:m.noGo, duration:m.duration}))"
done
# injected-fix (attempted/healed) sütunu: /tmp/series-357-373.json içindeki her sprint'in
# fixHeal.{attempted,healed} alanından.

# Section 3
grep -n "^| 4[5-8][0-9] |" docs/MASTER-PLAN.md
grep -n "born(37[123]" docs/MASTER-PLAN.md   # boş — 371-373 yeni born-satırı doğurmadı
git diff docs/MASTER-PLAN.md                 # bu task sırasında eşzamanlı +3 satır (487-489, Kaynak: A/CX-analiz — 371-373'ten bağımsız)

# Section 4
git log --oneline --all | grep -E "sprint-37[123]"
git log --oneline --all | grep -i "sprint-372"   # boş — 372'nin kapanış-commit'i yokluğunu doğrular
for c in 669b2904 ebc3eafc; do
  git show --stat --format="%h %ci %s" "$c" | head -1
  git show --stat --format="" "$c" | tail -1
done
git status --short   # 372'nin filesChanged'iyle örtüşen hâlâ-untracked yollar

# Section 5
for i in 001 003 004 006; do
  tail -1 .brain/archive/sprint-372-tasks/task-372-$i.log
  tail -1 .brain/archive/sprint-372-tasks/task-372-$i-fix.log
done
ls -la .brain/archive/sprint-372-tasks/ | grep "fix-fix"   # yalnız *.json — hiç spawn edilmedi
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('.brain/archive/sprint-372-tasks/task-372-001.result','utf8'));console.log(d.notes)"

# Section 6
head -5 .brain/archive/DIRECTIVES-sprint-373.md   # başlık hâlâ "SPRINT-372" — tam-yeniden-koşu kanıtı
for i in 001 002 003 004 005 006; do
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('.brain/archive/sprint-373-tasks/task-373-$i.result','utf8'));console.log('$i:',d.selfAssessment); console.log(d.notes)"
done
```
