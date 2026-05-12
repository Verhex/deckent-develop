# DIRECTIVES — Sprint 154 (Bug B Fix + TaskType Registry Foundation)

> Hedef: Sprint 153 smoke test'inde canlı yakalanan **Bug B** (coverage:null doc task patolojisi) için **TaskType Registry foundation** kur. Bu, Hybrid Scoring vision'ının ilk somut implementasyonu — gelecekteki agentic OS rubric mimarisinin tohumu.
>
> **Dogfooding sprint:** Deckent kendi kendini fixliyor. Worker'lar Brain-level evaluation patolojisini koddan çözüyor.

## Bağlam (mutlaka okuyun)

**Sorun:** `src/orchestra/result-evaluator.ts:701` `evaluateWithRubric()` doc-only task'larda da code-rubric uyguluyor. Bu kombinasyon false NO_GO üretiyor:
1. `validateResultSchema:499` `typeof null !== 'number'` → coverage:null reject → schema NO_GO
2. `isDocTask` legacy `evaluateResult`'ta var (line 56) ama yeni `evaluateWithRubric` onu çağırmıyor
3. `scoreTestCoverage:586` `Math.min(null, 100) = 0` (schema bypass'lansa bile)

**Kanıt:** Sprint 153 smoke (2026-05-12) — 10 doc task'ın 9'u `coverage:null` raporladı → Brain hepsine NO_GO. 1 task `coverage:0` (number) → DONE. Worker non-determinism + tek-tip rubric birleşince sistem güvenilmez.

**Çözüm yönü:** TaskType taxonomy (`audit` / `document-write` / `code-development`) + per-type rubric + scope-shape detection (i18n-neutral, gaming-proof) + coverage tip-opsiyonel.

**Referans:** `.brain/exports/memory.md` içinde "TaskType + EnvironmentType taxonomy" memory'si — Hybrid Scoring vision detayları.

## Goal

3 baseline task type'ı recognize eden + per-type rubric dispatch eden + coverage:null'ı non-code task'larda tolere eden **RubricRegistry foundation** implement et. Test seti ile doğrula.

**Acceptance:**
- `tsc --noEmit` 0 error
- Yeni unit testler PASS (registry detection + per-type scoring + schema tolerance)
- Mevcut testler regression YOK
- Sprint 153 doc task senaryosu (`coverage:null` + filesWrite docs/*.md) artık DONE alır

---

## Task 1: RubricRegistry Core Foundation
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/rubric-registry.ts
- Scope: src/orchestra/

### Description
**Yeni dosya** `src/orchestra/rubric-registry.ts` oluştur. İçerik:

1. **TaskType taxonomy:** `export type TaskType = 'audit' | 'document-write' | 'code-development'`

2. **3 rubric constant:**
   - `CODE_RUBRIC` — mevcut `DEFAULT_RUBRIC`'in kopyası (correctness 0.4 / test_coverage 0.25 / scope_compliance 0.2 / documentation 0.15, passingScore 70)
   - `AUDIT_RUBRIC` — audit_completeness 0.4 / finding_count 0.3 / citation_density 0.2 / migration_triage 0.1, passingScore 70
   - `DOC_WRITE_RUBRIC` — correctness 0.3 / word_count 0.25 / scope_compliance 0.25 / documentation_quality 0.2, passingScore 70

3. **Detection heuristics (scope-shape, i18n-neutral):**
   - `isAuditTask(task)` — exactly 1 filesWrite başlıyor `docs/audits/` + biten `.md`, scope.directories'te src/tests/lib YOK
   - `isDocumentWriteTask(task)` — filesWrite hepsi `docs/` ile başlar (ama `docs/audits/` HARİÇ) + `.md`, scope.directories'te src/tests/lib YOK
   - `detectTaskType(task): TaskType` — öncelik: audit > document-write > code-development (default)

4. **Registry API:**
   - `getRubric(task): EvaluationRubric` — `RUBRIC_REGISTRY[detectTaskType(task)]`
   - `coverageOptional(task): boolean` — `detectTaskType(task) !== 'code-development'`

5. **SECURITY note (JSDoc):** rubric weights config-override yasak. User config.evaluation_rubric ile bu constantlar değiştirilemez — gaming önleyici.

Import: `Task`, `EvaluationRubric` from `../core/types.js`. ESM modules.

### Acceptance Criteria
- File var, exports TaskType + 3 rubric + 3 detection function + getRubric + coverageOptional
- tsc clean (own file)
- JSDoc her exported entity için
- 0 import from result-evaluator.ts (no circular)

---

## Task 2: New Scorer Functions (audit + doc-write criteria)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts
- Scope: src/orchestra/
- Dependencies: 153-001

### Description
`src/orchestra/result-evaluator.ts`'ye 5 yeni scorer ekle. Mevcut pattern (`scoreCorrectness`, `scoreDocumentation`) örnek alın.

1. **`scoreWordCount(result, task)`** — DOC_WRITE_RUBRIC için
   - Worker notes'unda "N kelime" / "N words" pattern ara (Türkçe + İngilizce)
   - Task description'da "≥X kelime" / "≥X words" target ara
   - Score = (actual / target) × 100, max 100
   - Target bulunamazsa: notes ≥200 char = 70, else 30

2. **`scoreAuditCompleteness(result, task)`** — AUDIT_RUBRIC için
   - Worker'ın yazdığı dosyayı `readFileSync` ile oku (filesChanged[0])
   - Score: H1/H2 başlık varlığı + bullet/table varlığı + minimum 500 char
   - Skor: heading 30 + bullet/table 40 + length ≥500 30

3. **`scoreFindingCount(result, task)`** — AUDIT_RUBRIC için
   - Dosyada "Finding|Bug|Risk|Issue|Drift" pattern (case-insensitive) say
   - 0→10, 1-3→50, 4-7→80, 8+→100

4. **`scoreCitationDensity(result, task)`** — AUDIT_RUBRIC için
   - Dosyada `file:line` veya `<file>.ts:<N>` pattern say
   - 0→20, 1-2→50, 3-5→75, 6+→100

5. **`scoreMigrationTriage(result, task)`** — AUDIT_RUBRIC için
   - Dosyada "P0|P1|P2|P3|CRITICAL|HIGH|MEDIUM|LOW" distinct label say
   - 0→0, 1-2→50, 3+→100

6. **`scoreDocumentationQuality(result, task)`** — DOC_WRITE_RUBRIC için
   - Dosyada h2 (`##`) + h3 (`###`) başlık sayısı
   - 0 heading → 30, 1-2 → 60, 3+ → 100

Tüm scorerlar `RubricScore` döner: `{ criterion, score, passed, reason }`. File-read fail durumunda graceful fallback (notes-based fallback).

### Acceptance Criteria
- 6 yeni scorer fonksiyonu export edilmiş
- Her biri `RubricScore` döner, `passed` field criterion threshold ile karşılaştırılmış
- File-read exception graceful handled (`try/catch`, fallback skoru)
- tsc clean

---

## Task 3: scoreCriterion Switch + evaluateWithRubric Registry Wire
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts
- Scope: src/orchestra/
- Dependencies: 153-001, 153-002

### Description
`result-evaluator.ts`'de iki entegrasyon:

1. **`scoreCriterion(name, result, task)` switch'i genişlet** (line 681 civarı):
   ```typescript
   case 'audit_completeness':    return scoreAuditCompleteness(result, task);
   case 'finding_count':          return scoreFindingCount(result, task);
   case 'citation_density':       return scoreCitationDensity(result, task);
   case 'migration_triage':       return scoreMigrationTriage(result, task);
   case 'word_count':             return scoreWordCount(result, task);
   case 'documentation_quality':  return scoreDocumentationQuality(result, task);
   ```

2. **`evaluateWithRubric` registry wire** (line 701 civarı):
   - Top of function (schema check'ten ÖNCE): `import { getRubric, coverageOptional } from './rubric-registry.js'`
   - Schema check `validateResultSchema(result, task)` (TASK PARAMETER EKLE)
   - Eğer `rubric === undefined`: `const autoRubric = getRubric(task); const merged: EvaluationRubric = autoRubric;`
   - rubric verilmişse merged eskisi gibi

### Acceptance Criteria
- 6 new case added to scoreCriterion
- evaluateWithRubric registry uses `getRubric(task)` when rubric undefined
- Mevcut `evaluateWithRubric` çağrı yerleri (sprint-phases.ts:558 vs.) regression vermez
- tsc clean

---

## Task 4: validateResultSchema Coverage:null Tolerance
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/result-evaluator.ts
- Scope: src/orchestra/
- Dependencies: 153-001

### Description
`validateResultSchema(result)` line 499 — coverage:null sadece code task'larda fail olsun. Non-code task'lar (`coverageOptional(task) === true`) için coverage null kabul edilsin.

Yapı:
1. **Signature genişlet:** `validateResultSchema(result: TaskResult, task?: Task): ResultSchemaValidation`
2. **Coverage check modify:**
   ```typescript
   if (typeof result.coverage !== 'number') {
     // Allow null for non-code task types
     if (task && coverageOptional(task)) {
       // skip — null is acceptable
     } else {
       missingFields.push('coverage');
     }
   }
   ```
3. **Import:** `import { coverageOptional } from './rubric-registry.js'`
4. **Mevcut tek caller `evaluateWithRubric`:** `task` parametre geçirir (Task 3'te zaten yapıldı)

### Acceptance Criteria
- coverage:null on doc/audit task → schema valid (`missingFields.length === 0`)
- coverage:null on code task → still invalid (regression korunur)
- Diğer field check'leri değişmez (testsPassed, selfAssessment, taskId, filesChanged)
- tsc clean

---

## Task 5: RubricRegistry Test Suite
- Model: opus
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/orchestra/rubric-registry.test.ts
- Scope: tests/orchestra/
- Dependencies: 153-001

### Description
`tests/orchestra/rubric-registry.test.ts` yeni dosya. Test kapsamı:

1. **`isAuditTask`** — 5+ test
   - Tek filesWrite `docs/audits/sprint-N/T-N.md` + scope.dirs=[docs/audits/sprint-N/] → true
   - filesWrite 2 entry → false
   - filesWrite `docs/audits/X.md` ama scope.dirs içinde `src/` → false
   - filesWrite `docs/non-audit.md` → false (audits path değil)
   - Empty filesWrite → false

2. **`isDocumentWriteTask`** — 5+ test
   - Tek filesWrite `docs/smoke/T.md` + scope dirs=[docs/smoke/] → true
   - filesWrite `docs/audits/X.md` → false (audit exclude)
   - filesWrite multiple `docs/X.md` + `docs/Y.md` hepsi doc → true
   - scope dirs içinde `src/orchestra/` → false
   - Empty filesWrite → false

3. **`detectTaskType`** — 4+ test
   - audit priority over doc-write (filesWrite docs/audits/X.md)
   - doc-write detection (filesWrite docs/smoke/X.md)
   - code-development default (filesWrite src/X.ts)
   - no scope → code-development

4. **`getRubric`** — 3 test
   - audit task → AUDIT_RUBRIC reference
   - doc-write task → DOC_WRITE_RUBRIC reference
   - code task → CODE_RUBRIC reference

5. **`coverageOptional`** — 3 test
   - audit task → true
   - doc-write task → true
   - code task → false

### Acceptance Criteria
- vitest run path ile sadece bu test dosyası → tüm test'ler PASS
- 20+ test case
- AAA pattern (Arrange, Act, Assert) consistent
- Test isimlendirme `describe('isAuditTask', ...)` gruplama

---

## Task 6: Evaluator Integration Test (audit + doc-write scenarios)
- Model: opus
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/orchestra/result-evaluator-typed.test.ts
- Scope: tests/orchestra/
- Dependencies: 153-002, 153-003, 153-004

### Description
`tests/orchestra/result-evaluator-typed.test.ts` yeni dosya. End-to-end senaryolar:

1. **Doc-write task DONE path** — Sprint 153 smoke senaryosu
   - task = scope.filesWrite=[docs/smoke/T.md]
   - result = { coverage:null, testsPassed:true, selfAssessment:'DONE', notes:'... 800 kelime ...', filesChanged:[docs/smoke/T.md] }
   - Beklenen: `evaluateWithRubric(result, task)` → `decision: DONE`, totalScore ≥70
   - **Bu test Sprint 153 false NO_GO bug'ı için regression guard**

2. **Audit task DONE path**
   - task = filesWrite=[docs/audits/sprint-X/T.md]
   - result = coverage:null, notes detailed, filesChanged ile aynı path
   - Beklenen: DONE veya GO_WITH_TECH_DEBT (audit rubric scorers ne döndürüyor)

3. **Code task coverage:null still NO_GO (regression)**
   - task = filesWrite=[src/x.ts]
   - result = coverage:null
   - Beklenen: schema fail → NO_GO

4. **Coverage:0 number doc task DONE (153-005 senaryo)**
   - task = doc-write
   - result = coverage:0 number
   - Beklenen: DONE (schema ok, rubric ok)

5. **Doc-write but worker writes to wrong path** — scope violation
   - task = filesWrite=[docs/smoke/T.md]
   - result = filesChanged=[src/x.ts]
   - Beklenen: NO_GO (scope compliance düşük)

### Acceptance Criteria
- 8+ test case, vitest run sadece bu dosya PASS
- Mock dosya okuma için `fs` mock veya gerçek tmpfile (tercih: gerçek file `tmp/test-output.md` yaz + cleanup)
- Test'lerin Sprint 153 dogfood'undan referans alıntıları olsun (yorum)

---

## Sprint Sonu Doğrulama (Brain → user'a sun)

- Yeni `src/orchestra/rubric-registry.ts` 1 dosya, ~200 LoC
- `src/orchestra/result-evaluator.ts` modify (~150 LoC eklendi)
- `tests/orchestra/rubric-registry.test.ts` ~250 LoC
- `tests/orchestra/result-evaluator-typed.test.ts` ~200 LoC
- Toplam ~800 LoC, 6 task

Sprint sonrası user manuel doğrulama:
- `npx tsc --noEmit` → 0 error
- `npx vitest run tests/orchestra/rubric-registry.test.ts tests/orchestra/result-evaluator-typed.test.ts` → all pass
- Smoke test 2 (5-10 doc task) re-koş → 10/10 DONE bekleniyor
