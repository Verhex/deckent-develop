# DIRECTIVES — Sprint 165: Brain Final Stability Closure + Open Source Hazırlık

## Goal

İki paralel hat:
(1) **Brain Final Stability Closure:** Sprint 164 dogfood'unda canlı reproduce olan 4 katman bug (Bug X/Y/Z/W) Sprint 165'te tek seferde kapatılır — Brain artık "production-ready" damgası alabilir.
(2) **Open Source Hazırlık:** Dokümantasyon freeze + public repo flip hazırlığı (Beta GA gate kapanışı). `VerhexIO/deckent` public flip Sprint 166 başlamadan önce hazır olur.

Sprint 166 (`dependency_pipeline_enabled: true` canlı retry) için temiz foundation. Open source GA için %100 hazır kod tabanı + dokümantasyon.

## Sprint 164 Retro Forensic Özeti (Bug X/Y/Z/W Canlı Replay)

Sprint 164 6 task çalışırken kendi 4 katman bug'ını canlı reproduce etti — meta-dogfood 5. uygulama:

| Bug | Tanım | Forensic Kanıt |
|---|---|---|
| **X** | Brain "no-result → CODE_VERIFIED_DONE" stub yazımı (Sprint 156-011 CRITICAL debt EXACT replay) | 164-006 worker docker HB shutdown → Brain stub: `linesAdded:0, testsPassed:false, selfAssessment:"DONE", codeVerified:"CODE_VERIFIED_DONE"` |
| **Y** | Brain processQueue legacy FIFO Wave 2→3 geçişinde stall (Sprint 161 forensic dogfood replay) | 164-006 Wave 2 sırasında 27dk hayalet kaldı, active=0 + 1 pending → spawn yok |
| **Z** | Vitest gate +1 fail kronik (worker 17→0 raporladı, Brain audit FAIL — uyumsuzluk) | 164-003-fix worker notes: "delta.fail: 17 → 0", Brain audit: "vitestDelta.fail = 1" |
| **W** | Auditor `dead_event_stream` detector Sprint 148'den `reserve_for: sprint-148` ile uyuyor | 164-006 27dk hayalet kaldı, `alerts: []`, alarm verilmedi |

Sprint 164 task çıktıları korundu (ADR-045 + wire 13 grep match + 14 yeni test 8/8+6/6 PASS). Brain runtime'ında etkili olması için Sprint 165 öncesi build + MCP restart **gereklidir**.

## Wave Plan + Spawn Ordering (maxWorkers=6 restore)

`dependency_pipeline_enabled: false` (Sprint 166 flip için bekletilir). Brain legacy FIFO ile çalışır + maxWorkers=6 — task ID sırası spawn'ı belirler. Task numaralandırma dependency'leri respect edecek şekilde:

- **Wave 1 (paralel, bağımsız 3 fix):** Task 1 (Bug X stub fix) + Task 2 (Bug Y processQueue) + Task 3 (Bug Z vitest)
- **Wave 2 (Wave 1 stable sonrası):** Task 4 (Bug W detector activate)
- **Wave 3 (Final closure):** Task 5 (Documentation freeze + public repo prep)

Race fallback: Brain'in `fix_phase_enabled: true` + `max_fix_retries: 2` güvenlik ağı. Sprint 164'te 164-003 NO_GO sonrası FIX phase başarılı oldu (5-sprint chronic regression eradicated kanıtı).

---

## Task 1: Bug X Fix — Brain "no-result → CODE_VERIFIED_DONE" Stub Eradication

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/result-evaluator.ts, src/orchestra/debt-manager.ts, src/orchestra/sprint-phases.ts, src/agents/worker.ts, tests/orchestra/no-result-stub-eradication.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description

Sprint 156-011-fix CRITICAL debt'in (Sprint 163'te yarı fix edildi sanılıyordu) Sprint 164 canlı reproduce kanıtı: 164-006 worker docker HB shutdown ile `.result` dosyası yazmadan kayboldu. Brain bunu görüp **stub** yazdı:

```json
{
  "linesAdded": 0,
  "testsPassed": false,
  "selfAssessment": "DONE",
  "codeVerified": "CODE_VERIFIED_DONE",
  "notes": "Code physically verified despite missing .result (Sprint 135 docker HB shutdown bug pattern)"
}
```

Bu **gerçek bir DONE değil** — worker çalışmadı, hiçbir dosya yazılmadı (`linesAdded: 0`), testsPassed false. Ama Brain "selfAssessment: DONE" stub'ı ile sprint'i 6/6 DONE saydı, audit FAIL'ı görmezden geldi.

**Bug kökeni:** `CODE_VERIFIED_DONE` codepath src/orchestra'da bir yerde — Brain "fiziksel kanıt var (filesChanged listesi)" diye DONE stub yazıyor, ama linesAdded=0 + testsPassed=false olunca BU DONE OLAMAZ. 3 koşul birlikte fail olmalı.

**Fix prosedürü:**

1. **Codepath bulma:** `grep -rn "CODE_VERIFIED_DONE\|codeVerified" src/` → stub'ı yazan kod parçası tespit
2. **Guard ekleme:** `linesAdded === 0 && testsPassed === false` koşulu varsa `selfAssessment: 'NO_GO'` olmalı, `codeVerified` field hiç yazılmamalı
3. **Worker ölmüşse:** Brain ölü worker'ı **`status: NO_GO + reason: 'worker-crashed-no-result'`** olarak işaretler, FIX phase tetiklenir (re-spawn opsiyonu)
4. **`filesChanged` mantığı:** Eğer worker `filesChanged` listesi yazdı ama `linesAdded === 0` ise, bu **scope ihlali tespit** sinyali (164-006 DIRECTIVES.md'ye yazmaya çalışmış — boundary violation)
5. **Audit trail:** Stub yazılmadan önce `runEvaluatePhase:stub-write` event'i emit edilir; Auditor bu event'i bekler, izin verir veya REJECT eder

**Kanıt:**
- `grep -rn "CODE_VERIFIED_DONE" src/` → fix öncesi 1+ match, fix sonrası 0 match (codepath silindi veya guarded)
- `npx vitest run tests/orchestra/no-result-stub-eradication.test.ts` → 6/6 PASS
- Forensic test: worker .result yazmadan kapanırsa Brain NO_GO ile sınıflar, DONE stub'ı yazmaz
- Sprint 156-011 debt resmi CLOSED (memory.db'de `status: resolved`)

**Test:** 6 unit test:
- (a) Worker `.result` yazdı + filesChanged dolu + linesAdded > 0 + testsPassed true → DONE (normal happy path)
- (b) Worker `.result` yazdı + filesChanged dolu + linesAdded > 0 + testsPassed false → NO_GO veya GO_WITH_TECH_DEBT (worker self-assess'e göre)
- (c) Worker `.result` YAZMADI + filesChanged listesi disk'te değişiklik gösteriyor → **NO_GO** (164-006 senaryosu — stub değil)
- (d) Worker `.result` yazdı + linesAdded === 0 + testsPassed false → **NO_GO** (fiziksel kanıt yok)
- (e) Worker docker crash + heartbeat timeout → `worker-crashed-no-result` NO_GO + FIX phase trigger
- (f) Worker scope ihlali (filesWrite dışı dosya) + linesAdded > 0 → **NO_GO** + boundary violation alarm

---

## Task 2: Bug Y Fix — Brain processQueue Legacy FIFO Stall

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/processqueue-stall.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

Sprint 161 stalled forensic Sprint 164'te dogfood replay'i: `dependency_pipeline_enabled: false` ile bile `processQueue` Wave 2→3 geçişinde stall etti. 164-006 spawn olmadı, sprint 5/6 DONE + 1 pending kaldı.

**Bug kökeni:** `processQueue` `queuedTasks` listesinden shift atıyor ama döngü iteration'da bir koşul (muhtemelen `if (collected.size === taskIds.size) break;` veya benzer) **eligible task'ları görmüyor**. Sprint 161'de 2 task hayalet kaldı, Sprint 164'te 1 task. Hayalet sayısı = queue iter bug threshold.

**Soft dependency:** Task 1 (Bug X stub fix) DONE — eğer Task 2 çalışırken bug pattern tetiklenirse stub yazımı YOK olur (Task 1 guard), gerçek NO_GO + FIX phase devreye girer.

**Fix prosedürü:**

1. **Forensic:** `waitForResults` ana döngüsünde her tur sonu `queuedTasks.length` + `currentlyExecuting` log et (debug breadcrumb)
2. **Iteration condition:** `while (collected.size < taskIds.size)` döngüsünde `processQueue` çağrı + sleep yeterli mi kontrol et
3. **Eligibility re-check:** Slot açıldığında **tüm PENDING task'lar** scan edilir (sadece queuedTasks değil), eligibility'e göre spawn edilir
4. **Wave 2 trigger:** Wave 1'in son task'ı DONE olunca **Wave 2 task'ları otomatik PENDING'den eligible'a geçer** (bağımlılıklar resolved); legacy FIFO mode'da bu cascade çalışmıyor — fix
5. **Timeout güvencesi:** Slot 5+ dakika boş kalırsa `processQueue` **force re-scan** yapar, hayalet task'ları cover eder

**Kanıt:**
- `grep -n "processQueue" src/orchestra/result-collector.ts` → fix öncesi 1 çağrı, sonrası 1-2 çağrı (force re-scan dahil)
- Sprint 161 forensic replay: 5 task plan, hepsi PENDING start, sprint sonunda 5/5 spawn → 5/5 DONE (hayalet sıfır)
- Sprint 164 hayalet senaryosu replay: 6 task, 5 quickly DONE + 1 PENDING + slot açık → 6/6 spawn (hayalet sıfır)

**Test:** 8 unit test:
- (a) 3 task no-dep + maxWorkers=3 → 3 paralel spawn, hepsi DONE (legacy baseline)
- (b) 5 task no-dep + maxWorkers=3 → 3 spawn + 2 queue; ilk DONE → 4. spawn; ikinci DONE → 5. spawn (Sprint 161 fix)
- (c) 6 task no-dep + maxWorkers=6 → 6 paralel spawn (Sprint 164 happy path)
- (d) 6 task no-dep + maxWorkers=3 → ilk 3 + sonra 3 (Sprint 164 hayalet senaryo fix)
- (e) Brain force re-scan + slot 5dk boş → hayalet task spawn et
- (f) `currentlyExecuting > 0` + `queuedTasks.length > 0` + slot saturated → wait
- (g) Wave 1 son task DONE + Wave 2 eligible → Wave 2 trigger (legacy mode'da bile)
- (h) `processQueue` idempotent — çift çağrı çift spawn yapmaz

---

## Task 3: Bug Z Fix — Vitest Gate +1 Fail Kaynak Araştırma + Worker/Brain Audit Uyumu

- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert, ci-testing
- Agent: bug-fixer
- Files: scripts/run-self-audit.ts, src/monitor/auditor.ts, src/orchestra/result-evaluator.ts, tests/audit/worker-brain-audit-parity.test.ts
- Scope: scripts/, src/monitor/, src/orchestra/, tests/audit/

### Description

Sprint 159'dan beri 6 sprint kronik regression: Brain self-audit `vitestDelta.fail = 1` damgası vuruyor, sprint GATE_FAILURE damgalı kapanıyor. Sprint 164 T2'de 164-003-fix worker "delta.fail: 17 → 0 (5-sprint chronic regression eradicated)" raporladı — yani worker baseline'ı 17 olarak görüyor, fix sonrası 0 sayıyor. AMA Brain audit hâlâ +1 görüyor.

**Bug kökeni — 4 hipotez:**

1. **Worker vitest invocation farklı suite çalıştırıyor:** Worker `npx vitest run` çalıştırmış (tam suite), Brain audit script (`scripts/run-self-audit.ts`) farklı vitest config kullanıyor (dashboard config dahil veya exclude eden)
2. **Baseline mismatch:** Worker delta'yı önceki sprint baseline ile karşılaştırıyor, Brain audit gerçek mutlak fail count ile bakıyor
3. **Mock state leak:** Test'lerden biri Sprint 164 wire kodu test ediyordu (`dependency-pipeline-*.test.ts`), Brain audit'i çalıştırırken farklı module load order ile bir test fail oluyor
4. **Race condition:** Audit anında bir background test (örn. Docker E2E) çalışıyor, network timeout ile fail veriyor

**Fix prosedürü:**

1. **Discovery:** `npx tsx scripts/run-self-audit.ts 2>&1 | grep -A5 "vitest"` ile audit'in HANGİ test fail dediği EXACT line tespit
2. **Worker vs Brain karşılaştırma:** `npx vitest run --reporter=json` worker'da + audit script çıktısı yan yana, hangi test ID'leri farklı
3. **Hipotez doğrulama:** 4 hipotezden hangisi geçerli (suite mismatch / baseline / mock leak / race)
4. **Fix:** Kökene göre — audit script'i worker ile aynı suite + aynı config kullanır + idempotent baseline hesabı
5. **Parity test:** `worker-brain-audit-parity.test.ts` — Brain audit ile worker `npx vitest run` aynı fail count vermek zorunda

**Anti-pattern (YASAK):**
- Audit script'i "loosen" yaparak fail'i kabul etmek
- Failing test'i `it.skip()` gerekçesiz
- Mock'u "tolerate" etmek

**Kanıt:**
- `npx tsx scripts/run-self-audit.ts 2>&1 | grep vitest` → `status=PASS` veya `delta.fail=0`
- `npx vitest run` ile audit script çıktısı aynı fail count (parity)
- Hangi test'in fail ettiği `notes`'ta dokumante; eğer skip yolu seçildiyse ADR-046 amendment önerisi

**Test:** 4 parity test:
- (a) Worker `npx vitest run` ↔ audit script aynı fail count
- (b) Audit script idempotent (5 kez çalış, hep aynı sonuç)
- (c) Yeni test eklendiğinde delta hesaplama doğru
- (d) Race condition guard (audit anında parallel suite çalışmasını engelle)

---

## Task 4: Bug W Fix — Auditor `dead_event_stream` Detector Activate

- Model: sonnet
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: code-reviewer
- Files: src/nervous/detectors/dead-event-stream.ts, src/nervous/detector-registry.ts, .deckent/config.json, tests/nervous/dead-event-stream.test.ts
- Scope: src/nervous/, tests/nervous/, .deckent/

### Description

Auditor `dead_event_stream` detector Sprint 148'den `enabled: false, reserve_for: sprint-148` ile uyuyor — 16 sprint boyunca reserve'de. Sprint 164'te 164-006 27dk hayalet kaldı, `alerts: []` damgası vuruldu — alarm verilmedi. **Bu detector'ün varlık sebebi tam olarak buydu.**

**Soft dependency:** Task 2 (processQueue stall fix) DONE — Bug Y çözüldükten sonra dead_event_stream detector "olumlu false alarm" üretmez; sadece gerçek stall'da uyarır.

**Fix prosedürü:**

1. **Kod inceleme:** `src/nervous/detectors/dead-event-stream.ts` mevcut mu? (Sprint 148'de stub yazılmış olabilir)
2. **Eğer stub varsa:** Implementation tamamla — sprint event stream'i scan eder, son N dakika içinde event yoksa + active worker varsa alarm verir
3. **Eğer yoksa:** Yeni dosya yaz, `NervousDetector` interface implementi
4. **Config activate:** `.deckent/config.json` → `nervous_system.detectors.dead_event_stream.enabled: true` + `threshold_ms: 600000` (10dk) + `reserve_for` field SİLİNİR
5. **Detector registry:** `src/nervous/detector-registry.ts` import + register
6. **Alarm format:** `{ severity: 'critical', detector: 'dead_event_stream', message: 'Sprint event stream silent for X minutes — possible stall', actions: ['investigate', 'force_evaluate', 'kill_workers'] }`

**Kanıt:**
- `cat .deckent/config.json | grep -A3 dead_event_stream` → `enabled: true`, `reserve_for` SİLİNMİŞ
- `grep -n "dead_event_stream" src/nervous/detector-registry.ts` → 1+ register line
- `npx vitest run tests/nervous/dead-event-stream.test.ts` → 4/4 PASS
- Sprint 164 hayalet senaryo replay: 27dk event-less sprint → alarm trigger

**Test:** 4 unit test:
- (a) Sprint event stream 10dk+ silent + active worker var → alarm `severity: critical`
- (b) Sprint event stream silent + active worker yok → no alarm (normal idle)
- (c) Yeni event yazıldı → silent counter reset
- (d) Sprint kapandı (status COMPLETE) → detector pasif

---

## Task 5: Documentation Freeze + Public Repo Prep — Open Source GA Hazırlık

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, git-expert
- Agent: doc-writer
- Files: docs/release/public-repo-flip-handoff.md, docs/release/sprint-165-final-state.md, CHANGELOG.md, docs/launch/announce-final.md
- Scope: docs/

### Description

Sprint 165 sonrası Beta GA gate kapanışı — Sprint 166 öncesi public repo flip için tüm dokümantasyon "open source ready" hale getirilir. Alperen'in ifadesi: **"Deckent işlevselliğini tamamlayıp repoyu açık kaynağa çekmek istiyorum."**

**Soft dependency:** Task 1+2+3+4 DONE — Bug X/Y/Z/W kapandı; dokümantasyon Sprint 165 final state ile tutarlı yazılabilir.

**İş paketi:**

1. **`docs/release/sprint-165-final-state.md`:** Sprint 165 outcome dump — Bug X/Y/Z/W close kanıtı + Sprint 164 → 165 transition + Sprint 166 plan (dep_pipeline canlı flip)

2. **`CHANGELOG.md` update:**
   ```
   ## [0.4.1-beta] — 2026-05-XX (Sprint 165)
   ### Fixed
   - Brain "no-result → CODE_VERIFIED_DONE" stub eradication (Bug X, Sprint 156-011 debt CLOSED)
   - processQueue legacy FIFO Wave transition stall (Bug Y, Sprint 161/164 forensic replay fix)
   - Vitest gate +1 fail chronic regression (Bug Z, Sprint 159-164 6-sprint debt)
   - Auditor dead_event_stream detector activated (Bug W, Sprint 148+ reserve cleared)
   ### Added
   - ADR-045 Wave-Based Execution Semantics (code-complete, runtime flag-gated)
   - Wire integration test suite (dependency-pipeline-integration.test.ts, 6 scenarios)
   ```

3. **`docs/launch/announce-final.md`** (yeni veya update):
   - Show HN draft güncel sayılar ile (Sprint 165, 45 ADR, 12500+ test, 89.33% coverage)
   - Twitter thread (Türkçe + English)
   - Reddit r/LocalLLaMA + r/programming launch post

4. **Public repo flip checklist** (`docs/release/public-repo-flip-handoff.md`):
   - `.deck` file gitignore doğrulaması
   - Sensitive data scan (detect-secrets)
   - `.brain/memory.db` gitignore (binary file)
   - CONTRIBUTING.md mevcut + güncel
   - LICENSE MIT
   - GitHub Actions CI/CD configured
   - `npm publish --dry-run` clean
   - VerhexIO/deckent-dev → VerhexIO/deckent (public) rename hazırlığı

5. **Sprint history sync** — `docs/architecture/sprint-lifecycle.md` veya benzeri varsa sprint sayısı 164 → 165

**Kanıt:**
- `ls docs/release/sprint-165-final-state.md` → mevcut
- `grep "0.4.1-beta" CHANGELOG.md` → match
- `grep "Bug X\|Bug Y\|Bug Z\|Bug W" docs/release/sprint-165-final-state.md` → 4+ match
- `cat docs/release/public-repo-flip-handoff.md` → güncel checklist

**Test:** 0 test (dokümantasyon task)

---

## Anchor Kurallar (worker'lar zorunlu okur)

- **`npm run build` YASAK** worker'larda — Alperen kararı (final build doğrulaması Alperen onayı ile)
- **Test izole:** `npx vitest run path/to/file.test.ts` ile tek dosya çalıştır
- **Scope discipline:** Sadece `Files:` field'daki dosyalara yaz; `git diff --stat` Auditor tarafından izlenir
- **ESM import:** `.js` uzantısı zorunlu (Node16 resolution)
- **No mid-sprint refactor:** Task'ın `Files:` dışına çıkma
- **TDD discipline:** Test önce yaz, fail doğrula, kod yaz, pass doğrula, commit
- **NO MVP / NO MINIMUM** — T4-modified disiplin, full god-level scope
- **NO docs/ + .deckent/ PATH MENTION** task description'larında — planner `filesWrite`'a alıyor
- **Config flip YASAK Sprint 165'te:** `dependency_pipeline_enabled` config değiştirilmez (default `false` kalır). Flip Sprint 166'da canlı retry için Alperen onayı ile yapılır
- **Sprint 164 wire korunur (Task 2 için):** respawnEligibleTasks wire kodu Sprint 164'te yazıldı (13 grep match), `dependency_pipeline_enabled: false` modunda Task 2 wire kodunu **silmez veya değiştirmez** — sadece legacy FIFO processQueue fix yapılır
- **Test skip discipline (Task 3 için):** `it.skip()` gerekçesiz YASAK. Skip ediyorsan: (i) inline yorum sebep + (ii) takip task ID + (iii) ADR amendment notu
- **Stub yazımı YASAK (Task 1 sonrası):** Worker `.result` yazmadıysa Brain stub yazmamalı — Task 1 bu davranışı KALDIRACAK; eğer fix sırasında geri eklenirse otomatik scope ihlali

## GO/NO_GO Criteria

- ✅ **5/5 task DONE** (T1 + T2 + T3 + T4 + T5)
- ✅ `tsc --noEmit` PASS (Auditor self-gate)
- ✅ `npx vitest run` PASS, **delta 0 fail** (Bug Z fix kanıtı — 6-sprint chronic regression CLOSED)
- ✅ 22 yeni test PASS (T1: 6 + T2: 8 + T3: 4 + T4: 4), 0 regression
- ✅ Bug X: `grep -rn "CODE_VERIFIED_DONE" src/` → 0 match (codepath silindi) **VEYA** koşullu guard ile sadece TEST modunda erişilebilir
- ✅ Bug Y: Sprint 161 forensic replay test 5/5 spawn (hayalet sıfır)
- ✅ Bug Z: `npx tsx scripts/run-self-audit.ts` → `status=PASS`, worker ile parity test PASS
- ✅ Bug W: `cat .deckent/config.json | grep dead_event_stream` → `enabled: true`, reserve_for SİLİNMİŞ
- ✅ Sprint 156-011 CRITICAL debt memory.db'de `status: resolved`
- ✅ Documentation: CHANGELOG güncel, public repo flip checklist hazır, Sprint 165 final state report yazılı
- ✅ Self-audit gate: `overallGate=PASS` (vitest fail 0, tsc 0, honesty violations 0)

### NO_GO senaryoları ve aksiyon:

- **Task 1 NO_GO** (Bug X fix fail veya regression açtı): Sprint 165 status `GO_WITH_GATE_FAILURE`; Brain stub eradication kritik P0 olmaya devam — Sprint 166'da P0 öncelik, dep_pipeline flip ERTELENİR
- **Task 2 NO_GO** (processQueue stall fix fail): Bug Y kronik kalır, Sprint 166 flip live retry ERTELENİR (legacy mode'da bile stall riski)
- **Task 3 NO_GO** (vitest +1 fail kaynak araştırma fail): Gate FAILURE devam — Sprint 166'a taşınır, ama Sprint 166 önceliği bu olur (flip değil)
- **Task 4 NO_GO** (detector activate fail): Minor — Sprint 166'a taşınır, blocker değil ama observability eksikliği devam
- **Task 5 NO_GO** (dokümantasyon eksik): Public repo flip ERTELENİR, Sprint 166'da tamamlanır

## Sprint 166 İçin Hazırlık (Not — Sprint 165 retro'da netleşir)

Sprint 165 DONE sonrası Sprint 166 önerilen scope (DRAFT, retro sonrası netleşir):
- **Config flip:** `dependency_pipeline_enabled: false → true` (Alperen onayı ile, ADR-045 contract canlı)
- **Minimal 3-task multi-wave smoke sprint** (Wave 1: 2 task no-dep, Wave 2: 1 task dep on Wave 1)
- **Live evidence:** `wave.respawn` metric emit, events.jsonl'de `BRAIN→WORKER:DEPENDENCY_BLOCKED` (eğer NO_GO senaryosu)
- **Sprint 161 stalled forensic ile karşılaştırma:** Bu kez Wave 2 task'ı spawn ediyor mu? Hayalet kaybolmuş mu?
- **Sprint 156-002 + Sprint 164 fail'leri Sprint 166'da canlı doğrulanır** → ADR-045 status onaylı kalır
- **Public repo flip:** `VerhexIO/deckent-dev` → `VerhexIO/deckent` public, npm publish v1.0.0-beta.2
- **Show HN launch:** Sprint 166 sonrası 24 saat içinde

## Post-Sprint Verify Protokolü (manual review — opsiyonel ama önerilen)

Sprint 165 finalize sonrası Alperen manuel doğrulama yapar:

1. **Bug X kanıtı:** `grep -rn "CODE_VERIFIED_DONE" src/` → 0 match (veya guard'lı)
2. **Bug Y kanıtı:** `grep -n "processQueue" src/orchestra/result-collector.ts` → 1-2 match (force re-scan dahil)
3. **Bug Z kanıtı:** `.deckent/sprint-165-gate.json` → `vitest.delta.fail === 0` mı?
4. **Bug W kanıtı:** `cat .deckent/config.json | grep -A3 dead_event_stream` → enabled true
5. **Memory.db kanıtı:** `npx deckent recall "debt-156-011"` → status resolved
6. **Test count:** `npx vitest run` → fail 0, 22+ yeni test PASS
7. **Documentation kanıtı:** `ls docs/release/sprint-165-final-state.md docs/release/public-repo-flip-handoff.md` → mevcut
8. **maxWorkers korundu mu:** `cat .deckent/config.json | grep max_workers` → 6 (Sprint 164 restore sonrası)

Bu protokol opsiyonel — Brain self-audit gate ve Auditor scan bu kontrolleri içerikte kapsıyor; manuel review çift-katman güven katar.
