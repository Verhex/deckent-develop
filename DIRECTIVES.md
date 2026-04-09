# DIRECTIVES — Sprint 129: Enterprise Kalite Reformu — Tech Debt Temizliği + DEBT.md Parse Fix + Evaluator Tutarlılık

## Goal: Sprint 125-126'dan kalan kritik tech debt'leri temizle. DEBT.md JSON parse hatasını düzelt (markdown table → JSON.parse bug). evaluateResult() ve evaluateWithRubric() arasındaki tutarsızlığı gider. FIX fazı evaluations Map güncelleme mantığını doğrula. Tüm değişiklikler test ile kanıtlanmalı.

---

## Task 1: DEBT.md Parse Hatası Düzeltmesi + Sprint Reporter Robustness
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/debt-parse-fix.test.ts
- Scope: src/orchestra/, tests/orchestra/, tests/

### Description
sprint-reporter.ts satır 562-563'te DEBT.md dosyası JSON.parse() ile okunmaya çalışılıyor ama dosya markdown table formatında (pipe-delimited). Bu her sprint'te `writeRetrospective:parseDebt: Unexpected token '|'` hatası veriyor.

**Düzeltme adımları:**

1. `src/orchestra/sprint-reporter.ts` dosyasında writeRetrospective() fonksiyonunu bul (yaklaşık satır 555-570 arası).
2. `debt = JSON.parse(debtRaw)` satırını bul.
3. Markdown table formatını parse eden bir `parseDebtMarkdownTable(raw: string)` yardımcı fonksiyon yaz:
   - Pipe-delimited satırları oku (ilk 2 satır header + separator, skip et)
   - Her satırdan: ID, Description, Task, Sprint, Priority, Open, Resolved, FixedIn, Created alanlarını çıkar
   - Return: `DebtEntry[]` array (mevcut tiplere bak — debt-manager.ts'deki DebtEntry tipini kullan veya uyumlu yeni tip)
4. `JSON.parse(debtRaw)` yerine `parseDebtMarkdownTable(debtRaw)` kullan.
5. Error handling: parse başarısız olursa boş array dön, log yaz.
6. Mevcut `writeDebtTable()` fonksiyonunu kontrol et — debt yazma formatı ile okuma formatı tutarlı olmalı.

**Test dosyası:** `tests/orchestra/debt-parse-fix.test.ts` oluştur:
- Test 1: parseDebtMarkdownTable() geçerli markdown tabloyu doğru parse eder (3+ satır)
- Test 2: parseDebtMarkdownTable() boş string → boş array döner
- Test 3: parseDebtMarkdownTable() bozuk format → boş array döner, hata fırlatmaz
- Test 4: parseDebtMarkdownTable() header-only tablo → boş array döner
- Test 5: writeRetrospective() entegrasyon — DEBT.md markdown table ile çağrıldığında hata vermez

**Kanıt:** `npx vitest run tests/orchestra/debt-parse-fix.test.ts` → tüm testler geçer
**Test:** 5 test (parse valid, parse empty, parse corrupt, parse header-only, integration no-throw)

---

## Task 2: Evaluator Tutarlılık Reformu — evaluateResult/evaluateWithRubric Birleştirme
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: refactorer
- Files: src/orchestra/result-evaluator.ts, src/orchestra/sprint-phases.ts, tests/orchestra/evaluator-consistency.test.ts
- Scope: src/orchestra/, tests/orchestra/, tests/

### Description
EVALUATE fazında evaluateResult() (satır ~346), FIX fazında evaluateWithRubric() (satır ~503) kullanılıyor. Bu tutarsızlık farklı grading mantığı demek — aynı task farklı fazlarda farklı değerlendirilir.

**Düzeltme adımları:**

1. `src/orchestra/sprint-phases.ts` dosyasında EVALUATE fazını bul (runEvaluatePhase veya evaluate loop).
2. `evaluateResult()` çağrısını `evaluateWithRubric()` ile değiştir:
   - `evaluateWithRubric(result, task)` çağır
   - Return tipi `EvaluationResult` — bunun `.decision` alanı `TaskEvaluation` enum'dur (DONE/NO_GO/GO_WITH_TECH_DEBT)
   - Mevcut evaluations Map'e `.decision` değerini kaydet (uyumluluğu koru)
3. FIX fazındaki mevcut evaluateWithRubric() çağrısını koru — zaten doğru.
4. evaluateResult() fonksiyonunu KALDIR veya `@deprecated` işaretle (eğer başka yerlerden çağrılıyorsa deprecate, çağrılmıyorsa sil).
5. `tsc --noEmit` → temiz olmalı. Tüm import referanslarını güncelle.

**DİKKAT:** evaluateResult() başka modüllerden import edilip edilmediğini kontrol et (grep ile). Eğer dışarıdan kullanılıyorsa: export'u koru + deprecated JSDoc ekle. İç kullanımsa: sil.

**Test dosyası:** `tests/orchestra/evaluator-consistency.test.ts` oluştur:
- Test 1: evaluateWithRubric() DONE döner — testsPassed true, coverage yeterli
- Test 2: evaluateWithRubric() NO_GO döner — testsPassed false
- Test 3: evaluateWithRubric() GO_WITH_TECH_DEBT döner — bash unavailable pattern
- Test 4: evaluateWithRubric() default rubric ile çağrılır (rubric parametresi opsiyonel)
- Test 5: sprint-phases.ts'de evaluateResult import'u kalmamış olmalı (grep negative test)

**Kanıt:** `npx vitest run tests/orchestra/evaluator-consistency.test.ts` → tüm testler geçer + `grep -r "evaluateResult" src/orchestra/sprint-phases.ts` → sonuç yok
**Test:** 5 test (rubric DONE, rubric NO_GO, rubric TECH_DEBT, default rubric, no evaluateResult import)

---

## Task 3: FIX Fazı Map Mutation Doğrulaması + Tech Debt Kapatma
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: test-writer
- Files: tests/orchestra/fix-phase-map.test.ts, src/orchestra/sprint-phases.ts
- Scope: tests/orchestra/, tests/, src/orchestra/

### Description
FIX fazında fix task başarılı olduğunda orijinal task'ın evaluation'ı güncellenmeli (evaluations Map'te). Sprint 126'da bu bug rapor edildi (debt-126-001-fix). Ayrıca mevcut 8 açık tech debt'in durumunu doğrula.

**Düzeltme adımları:**

1. `src/orchestra/sprint-phases.ts` dosyasında FIX fazını bul (runFixPhase veya fix loop, yaklaşık satır 480-520).
2. Fix task başarılı olduğunda (evaluateWithRubric → DONE veya GO_WITH_TECH_DEBT):
   - `evaluations.set(fixTask.fixForTaskId, fixEval.decision)` çağrılmalı
   - Orijinal task ID ile Map güncellenmeli
   - Eğer `fixForTaskId` undefined ise veya Map'te yoksa, yeni entry oluşturulmalı
3. Fix task NO_GO döndüğünde: orijinal task evaluation DEĞİŞMEMELİ (NO_GO kalmalı).

**Test dosyası:** `tests/orchestra/fix-phase-map.test.ts` oluştur:
- Test 1: Fix task DONE → orijinal task evaluations Map'te DONE olarak güncellenir
- Test 2: Fix task GO_WITH_TECH_DEBT → orijinal task evaluations Map'te GO_WITH_TECH_DEBT olarak güncellenir
- Test 3: Fix task NO_GO → orijinal task evaluations Map'te DEĞİŞMEZ (hâlâ NO_GO)
- Test 4: fixForTaskId undefined olan fix task → Map'te crash yok, graceful handle
- Test 5: evaluations Map boş başlatılır, fix task sonrası doğru key-value var

**NOT:** Bu task mevcut sprint-phases.ts kodunu DEĞİŞTİRMEYEBİLİR — eğer fix zaten çalışıyorsa sadece test yaz ve doğrula. Eğer bug varsa düzelt.

**Kanıt:** `npx vitest run tests/orchestra/fix-phase-map.test.ts` → tüm testler geçer
**Test:** 5 test (fix DONE updates map, fix TECH_DEBT updates map, fix NO_GO no change, undefined fixForTaskId, empty map graceful)

---

## Quality Rules
- `npx tsc --noEmit` temiz olmalı — SIFIR hata
- `npx vitest run tests/orchestra/debt-parse-fix.test.ts` geçmeli
- `npx vitest run tests/orchestra/evaluator-consistency.test.ts` geçmeli
- `npx vitest run tests/orchestra/fix-phase-map.test.ts` geçmeli
- Mevcut testler kırılmamalı: `npx vitest run` tam suite geçmeli
- Yeni dosyalar oluşturulacak, mevcut dosyalar SADECE bug fix için değiştirilmeli
- Her task bağımsız — birbirine bağımlılık YOK, paralel çalışabilir