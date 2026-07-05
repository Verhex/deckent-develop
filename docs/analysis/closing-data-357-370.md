# CLOSING-DATA-PACK — Sprint 357–370 (7 Temmuz Kapanış Veri-Paketi)

Generated: 2026-07-05 (task 371-007, worker-authored). **Bu doküman ham-ama-doğrulanabilir
veridir — yorum/değerlendirme katmanı kapsamı dışında** (7-Tem kapanış-analizinin yorum kısmı
ayrı bir el tarafından yapılacak). Her bölümün üretim komutu Appendix'te tekrar-üretilebilir
şekilde belgelenmiştir.

---

## 1. `series-metrics.mjs` — 357–370 (script değişmez)

Komut (script dosyasına dokunulmadı; çıktı `.brain/archive/`/`scripts/` dışına, `/tmp/`'a yazıldı):

```
node scripts/series-metrics.mjs 357 370 --out-json=/tmp/series-357-370.json --out-md=/tmp/series-357-370.md
```

Kaynak: `.brain/archive/sprint-N-tasks/` (task JSON + `.result` dosyaları). Aynı-sprint `-fix`
zincirleri en-derin somut-sonuca katlanır (fold); `.result.brainEvaluation` alanı
`task.json.status`'a önceliklidir (bkz. `scripts/series-metrics.mjs:61-66`).

Ham script çıktısı (generated 2026-07-05T12:42:03.086Z), aynen:

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
| **Cumulative** | **167** | **111** | **35** | **3** | **18** | **10h 57m** | **80%** | **66%** |

Eksik-arşiv sprint yok (14/14 sprint için `.brain/archive/sprint-N-tasks/` mevcut ve okundu).

**Tanım notu (script'in kendi doc-comment'inden, `scripts/series-metrics.mjs:1-19`):** "Tasks"
alanı aynı-sprint fix-zincirlerinin kök-slota katlanmış (folded) sayısıdır — ham dispatch
sayısı değildir. Bölüm 2'deki ikinci tablo ham dispatch sayısını (runtime job dosyası) ayrı
sütunda taşır; iki sayı kasıtlı olarak farklı tanımlar üzerinden üretilir (fold vs. ham).

**365/366 "Pending" satırları hakkında ham veri:** her iki sprint için de arşivde gerçek
`.result` dosyaları mevcuttur (`.brain/archive/sprint-365-tasks/task-365-00{1..9}.result`,
`.brain/archive/sprint-366-tasks/task-366-00{1..8}.result`) — `task.json.status` alanı
`EXECUTING`/`PENDING` üzerinde donmuş kaldığı için script bunları "pending" sayar (kök-neden:
`docs/MASTER-PLAN.md` satır 169, born-484 — bkz. Bölüm 3).

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
| **Toplam** | **167** | **111** | **35** | **3** | **18** | **10h 57m** | **171** | **125** | **38** | **6** | — | **29/19** |

Not (ham veri — (A) vs (B) farkı): 365/366 satırlarında (B) job-dosyası `totalTasks` değeri
(A)'nın çok altında (1 vs 9; 0 vs 8) — bu, born-484 EVAL-LOOP-TRUNCATION-SILENT kök-nedeninin
job-dosyasına yansımasıdır (EVALUATE-döngüsü erken kesildiği için `calculateMetrics` az sayıda
task değerlendirdi; bkz. Bölüm 3, born-484). 360 satırında (A) 17 / (B) 28 farkı ise fold-vs-ham
tanım farkıdır (aynı-sprint fix-zincirleri (A)'da kök-slota katlanır, (B) her dispatch'i ayrı
sayar) — script'in kendi doc-comment'i bu farkı `.brain/archive` fold-mantığının kasıtlı bir
özelliği olarak tanımlar (Bölüm 1 tanım-notu).

---

## 3. Born-457..486 kayıtlarının durum-özeti (MASTER-PLAN'dan)

Kaynak: `docs/MASTER-PLAN.md` (satır 36 başlık-satırı: `Sıra | ID | Pillar | İş Kalemi | Kaynak |
Önc | Bağımlılık | Durum | Tarih | Not`). Bu veri-çekiminde MASTER-PLAN'daki en yüksek born-ID
**486**'dır — **487 kaydı henüz mevcut değil** (task başlığındaki "457..487" aralığı bu nedenle
457–486 olarak raporlanıyor; 487 doğmadıysa ilerideki bir kapanış-turunda eklenecektir).

Komut: `grep -n "^| 4[5-8][0-9] |" docs/MASTER-PLAN.md` (+ tam-metin için ilgili satır numarası).
"Not" sütunundaki uzun gerekçe metinleri burada tekrarlanmıyor (SSOT-drift'ten kaçınmak için) —
tam metin için `docs/MASTER-PLAN.md:<satır>` referansına bakın.

| Born-ID | ID (kart-adı) | Pillar | Kaynak | Önc | Durum | Tarih | MASTER-PLAN satırı |
|---:|---|---|---|:---:|:---:|---|---:|
| 457 | MODEL-COST-SSOT-SYNC | GOV·COST | A(bulgu)+CC(fix) | P1 | ✅ | 2026-07-02 | 142 |
| 458 | DEP-REF-SILENT-DROP | GOV·PLAN | born(357 canlı) | P1 | ✅ | 2026-07-02 | 143 |
| 459 | EVAL-DEBT-CEILING-RUBRIC-BYPASS | GOV·EVAL | born(357 canlı) | P0 | ✅ | 2026-07-02 | 144 |
| 460 | RETRO-DEBT-COUNT-DRIFT | GOV·OBS | born(357 gözlem) | P2 | ✅ | 2026-07-02 | 145 |
| 461 | GEN-REFDOCS-ADR-REGEX | DOCS·GOV | born(357-015) | P2 | ✅ | 2026-07-02 | 146 |
| 462 | APR-CROSS-PROCESS-FEED | APR | born(canlı-test) | P1 | ✅ | 2026-07-02 | 147 |
| 463 | REPL-SURFACE-CONFIG-WIRE | TERM·GOV | A(canlı-test)+CC(el-fix) | P0 | ✅ | 2026-07-02 | 148 |
| 464 | CONFIG-RESOLVER-FLAG-DROP | GOV·CFG | A(canlı-test)+CC(el-fix) | P0 | ✅ | 2026-07-02 | 149 |
| 465 | DEP-REF-RUNTIME-MISMATCH | GOV·PLAN | A(canlı-gözlem)+CC(iz) | P1 | ✅ | 2026-07-02 | 150 |
| 466 | WRAPPER-EXITCODE-MASK | GOV·MOAT | Fable(analiz)+CC(verify) | P0 | ✅ | 2026-07-02 | 151 |
| 467 | WRAPPER-UNTRACKED-DIFF | GOV·MOAT | Fable(analiz)+CC(verify) | P0 | ✅ | 2026-07-02 | 152 |
| 468 | WRAPPER-HB-DUALWRITER | GOV·OBS | Fable(analiz)+CC(verify) | P1 | ✅ | 2026-07-02 | 153 |
| 469 | ADR-POINTER-ACCESS | PROMPT·GOV | Fable(analiz)+CC(verify) | P1 | ✅ | 2026-07-02 | 154 |
| 470 | ROUTE-DOMAIN-FROM-SCOPE | ROUTE·PROMPT | Fable(analiz, 3-vaka) | P1 | ✅ | 2026-07-02 | 155 |
| 471 | SPAWN-ALLOWLIST-FROM-FILESWRITE | SEC·TOOL | Fable(analiz)+CC(verify) | P2 | ✅ | 2026-07-02 | 156 |
| 472 | REPL-DETACHED-START | TERM | CL(öneri)+A(onay) | P1 | ✅ | 2026-07-02 | 157 |
| 473 | WRAPPER-P0-FIX | GOV·MOAT | Fable(analiz)+CC(el-fix) | P0 | ✅ | 2026-07-02 | 158 |
| 474 | LIMIT-PREFLIGHT | GOV·COST | A(kural)+CL | P0 | ✅ | 2026-07-03 | 159 |
| 475 | DEP-CHILD-POSTFIX-DISPATCH | GOV·SCHED | born(360 canlı) | P1 | ✅ | 2026-07-03 | 160 |
| 476 | FIX-MODEL-PRESERVE | GOV·ROUTE | born(360 canlı) | P1 | ✅ | 2026-07-03 | 161 |
| 477 | OPENROUTER-PROVIDER | TOOL·COST | A(istek)+CL | P1 | 🟡 | 2026-07-03 | 162 |
| 478 | LIMIT-STALL-SELFHEAL-PROOF | MOAT·GOV | canlı-kanıt | P0 | ✅ | 2026-07-03 | 163 |
| 479 | MODEL-OVERRIDE-DROP-STRUCTURED | GOV·ROUTE | born(361 canlı) | P0 | ✅ | 2026-07-03 | 164 |
| 480 | TEST-HERMETIC-RUNSTATE | CI·TEST | born(361 keşif) | P1 | ✅ | 2026-07-03 | 165 |
| 481 | SUBPROCESS-PROVIDER-CLI-MISMATCH | GOV·ROUTE | born(363 canlı) | P0 | ✅ | 2026-07-03 | 166 |
| 482 | EVAL-CEILING-FASTPATH-BYPASS | GOV·EVAL | born(364 canlı)+CC(el-fix) | P0 | ✅ | 2026-07-03 | 167 |
| 483 | PLAN-CONFIRM-PARTIAL | GOV·PLAN | born(365 canlı) | P0 | ✅ | 2026-07-05 | 168 |
| 484 | EVAL-LOOP-TRUNCATION-SILENT | GOV·EVAL | born(366 canlı) | P0 | ✅ | 2026-07-05 | 169 |
| 485 | HARVEST-RED-TESTS-SPAWN-TIMEOUT | CI·TEST | CC-verify (2026-07-05) | P1 | ✅ | 2026-07-05 | 170 |
| 486 | CLEANUP-STALE-HB-LEAK | GOV·SCHED | CC-forensik (2026-07-05) | P2 | ✅ | 2026-07-05 | 171 |

Durum-dağılımı (ham sayım): 29/30 `✅` (Tamam), 1/30 `🟡` (Kısmi — born-477
OPENROUTER-PROVIDER). `🔴`/`⬜`/`⏸️` durumunda hiçbir born-457..486 kaydı yok.

---

## 4. Teslim-edilen dosya-sayıları (git log --stat, commit-ref'li)

Komut: `git log --oneline --all | grep -E "sprint-(35[7-9]|36[0-9]|370)"` → her commit için
`git show --stat --format="%h %ci %s" <hash>` + `git show --stat --format="" <hash> | tail -1`.

**Sprint-kapanış commit'leri (357–370):**

| Sprint | Commit | Commit tarihi | Files changed | Insertions | Deletions |
|---|---|---|---:|---:|---:|
| 357 | `36dbcdd8` | 2026-07-02 09:58:20 +0300 | 86 | 7496 | 475 |
| 358 | `d490d6f3` | 2026-07-02 17:01:12 +0300 | 95 | 8194 | 403 |
| 359 | `06947b09` | 2026-07-02 18:38:53 +0300 | 100 | 9309 | 374 |
| 360 | `13e2d4d1` | 2026-07-03 01:04:01 +0300 | 76 | 7531 | 358 |
| 361 | `70fe74be` | 2026-07-03 01:54:55 +0300 | 95 | 10137 | 318 |
| 362 | `00e23c61` | 2026-07-03 04:01:59 +0300 | 77 | 7256 | 321 |
| 363 | `08330de5` | 2026-07-03 06:06:40 +0300 | 78 | 6360 | 252 |
| 364 | `874c7b6b` | 2026-07-03 08:17:50 +0300 | 74 | 4968 | 252 |
| 365 | *(yok — bkz. not)* | — | — | — | — |
| 366 | `0d2cf4da` (sprint-366-hasat) | 2026-07-03 12:07:18 +0300 | 72 | 4378 | 197 |
| 367 | `147f7f81` | 2026-07-05 14:16:45 +0300 | 40 | 2540 | 129 |
| 368 | `220a66f5` | 2026-07-05 14:47:26 +0300 | 44 | 3195 | 58 |
| 369 | `ea87df64` | 2026-07-05 15:17:54 +0300 | 47 | 3798 | 106 |
| 370 | `0610f915` | 2026-07-05 15:38:13 +0300 | 41 | 2869 | 46 |
| **Toplam (13 commit)** | — | — | **925** | **78031** | **3289** |

**Not — sprint-365'in ayrı kapanış commit'i yok:** `git log --oneline --all | grep 365` bir
"sprint-365" başlıklı commit döndürmüyor. Sprint-365'in dispatch edilen 9 task'ının teslimatı
(bkz. Bölüm 1/2, born-484 kök-nedeni) `sprint-366-hasat` commit'i (`0d2cf4da`) içinde
harmanlanmış görünüyor. Yukarıdaki 13-commit toplamı bu nedenle 14 sprint'in tamamını değil,
357–364 + [365+366]-birleşik + 367–370'i kapsar.

**Sprint-dışı / forensik takip commit'leri (365/366/born-483-484 zinciriyle ilgili, sprint-kapanış commit'i DEĞİL):**

| Commit | Tarih | Başlık (kısaltılmış) | Files changed | Insertions | Deletions |
|---|---|---|---:|---:|---:|
| `73295c10` | 2026-07-03 10:11:57 +0300 | docs(master-plan): born-483 PLAN-CONFIRM-PARTIAL | 1 | 2 | 1 |
| `c1872454` | 2026-07-03 12:09:14 +0300 | docs(born-484): CC-forensik mühürü | 1 | 1 | 1 |
| `14f0a244` | 2026-07-05 13:29:12 +0300 | fix(evaluate): born-484 kök-neden | 17 | 612 | 30 |

---

## Appendix — Kaynak Komutları (tekrar-üretilebilirlik)

```
# Section 1
node scripts/series-metrics.mjs 357 370 --out-json=/tmp/series-357-370.json --out-md=/tmp/series-357-370.md

# Section 2 (per-sprint job metrics, örnek n=357..370)
for n in 357 358 359 360 361 362 363 364 365 366 367 368 369 370; do
  node -e "const d=require('./.deckent/runtime/jobs/sprint-$n.json'); const m=d.metrics||{}; \
    console.log('$n', JSON.stringify({status:d.status, totalTasks:m.totalTasks, done:m.done, techDebt:m.techDebt, noGo:m.noGo, duration:m.duration}))"
done
# injected-fix (attempted/healed) sütunu: /tmp/series-357-370.json içindeki her sprint'in
# fixHeal.{attempted,healed} alanından.

# Section 3
grep -n "^| 4[5-8][0-9] |" docs/MASTER-PLAN.md
grep -n "^| Sıra" docs/MASTER-PLAN.md   # kolon başlıkları (satır 36)

# Section 4
git log --oneline --all | grep -E "sprint-(35[7-9]|36[0-9]|370)"
git log --oneline --all | grep 365   # sprint-365 kapanış-commit'i yokluğunu doğrular
for c in 36dbcdd8 d490d6f3 06947b09 13e2d4d1 70fe74be 00e23c61 08330de5 874c7b6b 0d2cf4da 147f7f81 220a66f5 ea87df64 0610f915 73295c10 c1872454 14f0a244; do
  git show --stat --format="%h %ci %s" "$c" | head -1
  git show --stat --format="" "$c" | tail -1
done
```
