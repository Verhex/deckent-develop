# DIRECTIVES — Sprint 227 (S-INT): Brain RETRO/Export/Decay Integrity Fix (🔴 P0)

## Goal: sprint-226 sonrası bulunan **3 Brain defter-tutma bug'ını** (MASTER-PLAN §4F) düzelt — bunlar HER sprintte tekrarlayıp veri kaybediyor: (1) rubric total sabit 78.75 (kalite ayrımı yok), (2) sprint-içi export `.brain/exports/*.md`'yi boşaltıyor (ADR'ler uçuyor), (3) DECAY memory learnings'i DB'den siliyor (decay_after_sprints=20 olmasına rağmen 1'e düştü). Sprint çıktısı bozulmuyor ama Brain bookkeeping + tarihsel hafıza zarar görüyor. **Önce bu = sonraki feature sprint'leri güvenle koşar.** **god-level, RUN-VERIFY, CI yeşil KORUNUR, [[feedback_db_silmek_yasak]].**

## Ortak kurallar
- **🟢 RUN-VERIFY (ADR-079):** kanıt çağıran-dosyada (def DIŞLA); Brain-internal = Tier-0, unit yeterli. Mock-only = GO_WITH_TECH_DEBT (ama burada gerçek-DB tmpdir testi şart).
- **🔴 HERMETİK:** tmpdir + sandbox HOME, **async spawn (spawnSync YASAK)**, `npm run test:ci-sim` yeşil. CI yeşil KORUNUR.
- **🔴 DB-SAFE:** memory.db silinmez ([[feedback_db_silmek_yasak]]); testler tmpdir DB kullanır, gerçek `.brain/memory.db`'ye DOKUNMAZ.
- ESM `.js`. ≤200 LoC/task, YENİ test dosyası, sadece kendi filesWrite'ına yaz.

---

## Task 1: 227-001 — Rubric total diagnostic fix (coverage:null → renormalize)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/rubric-coverage-renorm.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Kök neden (doğrulandı):** `scoreTestCoverage` (`result-evaluator.ts:735`) coverage:null→cov=0, +15 (hasNewTests) = **score 15**; `evaluateWithRubric` weight-loop (`:1192`) 0.4×100 + 0.25×**15** + 0.2×100 + 0.15×100 = **her iyi DONE için sabit 78.75** → kalite ayrımı yok (sprint-218/224/226). Worker self-rubricScores yoksayılıyor.
**Çözüm:** coverage **yapısal olarak ölçülemediğinde** (null/unmeasured) `test_coverage` kriterini total'den **çıkar + kalan ağırlıkları renormalize et** (correctness .4/scope .2/doc .15 → /0.75) → coverage'sız mükemmel task ~100 alır, 78.75 değil. **Koru:** testsPassed:false → correctness düşer; out-of-scope → scope düşer; passingScore eşiği + reconcile çalışmaya devam eder; coverage **sayısal verildiğinde** eskisi gibi kullanılır. Caller result-evaluator.ts.
**Kanıt:** `grep -c "renormaliz\|coverageAbsent\|unmeasured\|reweight" src/orchestra/result-evaluator.ts` → ≥1; `npx vitest run tests/orchestra/rubric-coverage-renorm.test.ts` → 4+ pass
**Test:** ≥4 (coverage:null+tüm-iyi → ≥90 [78.75 DEĞİL], coverage:null+testsFail → düşük/NO_GO, coverage=85 sayısal → kullanılır, passingScore eşiği korunur) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 2: 227-002 — [P0] Export-wipe guard (dolu .md'yi boşla EZME)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/core/memory-export.ts, src/orchestra/sprint-finalizer.ts, tests/orchestra/export-wipe-guard.test.ts
- Scope: src/core/, src/orchestra/, tests/orchestra/
### Description
**Kök neden:** sprint-finalizer post-finalize export (`sprint-finalizer.ts:1272` "memory export → identity → adr → rule regen") DB'de 75 ADR varken `decisions.md`'yi 8518→2 satır boşalttı; standalone `deckent memory export` ÇALIŞIYOR → finalize-yolu buggy (zamanlama/kısmi-DB).
**Çözüm:** **sanity guard** — her export .md'si yazılmadan önce: DB'de ilgili tip ≥1 entry varken render çıktısı **boş/ADR-yok** ise → **YAZMA, öncekini koru + uyarı emit et** (örn. `exportDecisionsMd` boş ama `store.getByType('adr').length>0` → abort). sprint-finalizer bu guard'lı writer'ı çağırsın. Caller sprint-finalizer.ts + memory-export writer.
**Kanıt:** `grep -c "guard\|refuse\|empty.*export\|getByType.*adr\|skipWrite" src/core/memory-export.ts src/orchestra/sprint-finalizer.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/orchestra/export-wipe-guard.test.ts` → 4+ pass
**Test:** ≥4 (DB-ADR-var + render-boş → yazılmaz+öncekini-korur, DB-ADR-var + render-dolu → yazılır, DB-boş + render-boş → izinli, uyarı emit edilir) — hermetik (tmpdir DB + tmpdir exports)
**Smoke:** (Tier-0) unit yeterli; tmpdir e2e finalize-export non-empty doğrular.

## Task 3: 227-003 — [P0] Decay safety (decay_after_sprints'e uy, collapse ETME)
- Model: opus
- Effort: high
- Skills: typescript-expert, security-specialist
- Files: src/core/memory-store.ts, tests/core/decay-safety.test.ts
- Scope: src/core/, tests/core/
### Description
**Kök neden:** `memory-store.ts:838 decay(currentSprintNum, decayAfterSprints)` (caller `debt-manager.ts:653`) sprint-226 sonrası memory/sprint/pattern/retro'yu **1'er taneye düşürdü** — decay_after_sprints=20 ile sprint-206..226 (~20) kalmalıydı. Muhtemel: entry'lerin sprint_num'u yok/yanlış parse → "çok eski" sanılıp silindi.
**Çözüm:** (a) decay yaş-hesabını düzelt — window içindeki (currentNum - decayAfterSprints ≤ entryNum) entry'ler **silinmez**; sprint_num yok/parse-edilemez → **silme (koru)**, default-delete YAPMA. (b) **Güvenlik guard:** bir decay batch'i non-exempt entry'lerin **>%50'sini silecekse → abort + uyarı** (catastrophic-decay koruması, [[feedback_db_silmek_yasak]]). ADR'ler decay-exempt KALIR. Caller memory-store.ts decay.
**Kanıt:** `grep -c "guard\|threshold\|window\|>.*0.5\|catastrophic\|skipDelete" src/core/memory-store.ts` → ≥2; `npx vitest run tests/core/decay-safety.test.ts` → 4+ pass
**Test:** ≥4 (window-içi entry survives, sprint_num-yok → korunur, >%50 silme → abort, ADR decay-exempt korunur) — hermetik (tmpdir DB seed)
**Smoke:** (Tier-0) unit yeterli.

## Task 4: 227-004 — Brain-integrity regression e2e (3 bug birlikte)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/brain-integrity-regression.test.ts
- Scope: tests/orchestra/
- Dependencies: 227-001, 227-002, 227-003
### Description
Tmpdir DB'yi ADR+memory+sprint ile seed et, RETRO→export→decay zincirini simüle et; assert: (1) exports **non-empty** (decisions ADR içerir), (2) decay window-içini **korur** (collapse yok), (3) coverage:null mükemmel task rubric ≥ eşik **ve** 78.75'e sabitlenmiyor (varyans). 3 fix'in birlikte proof-of-function'ı. Mevcut suite yeşil kalır.
**Kanıt:** `grep -c "non-empty\|decay\|78.75\|rubric\|getByType" tests/orchestra/brain-integrity-regression.test.ts` → ≥3; `npx vitest run tests/orchestra/brain-integrity-regression.test.ts` → 3+ pass
**Test:** ≥3 (export-non-empty-after-finalize, decay-keeps-window, rubric-varies-not-78.75) — hermetik (tmpdir DB+exports)

---

**Beklenen:** 4/4 DONE. Wave-1 (227-001, 227-002, 227-003 paralel ayrık-dosya) → Wave-2 (227-004 regression). 3 Brain bug kapanır → sonraki sprint'ler export/memory kaybetmez, rubric diagnostic olur. **Bu sprint'in KENDİSİ de bu bug'lara maruz** (export-wipe/decay) → koş sonrası operasyonel önlem (DB backup + export-verify + commit, §4F) uygula; ama fix'ler landed olduğu için bir sonraki sprintten itibaren temiz. CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu ✅ + `.brain/memory.db.bak` var. build:all + /mcp restart + RE-PLAN (Alperen). **CLI'dan `env -u ANTHROPIC_API_KEY`**. Her wave sonrası `git log -1` + `git stash list`.

İlgili: MASTER-PLAN §4F · ADR-070 (Evaluation Integrity). Memory: [[project_brain_integrity_sprint226_cluster]] · [[feedback_db_silmek_yasak]] · [[feedback_brain_rubric_bridge_broken]] · [[feedback_trust_brain_eval_not_worker]] · [[project_ci_green_root_causes]].
