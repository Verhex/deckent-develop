# DIRECTIVES — Sprint 099: RETRO Debug + Job Output Reform + Docs Tutarlılık

## Goal: RETRO Done sayacı evaluations map debug, job output'a detaylı gerekçe/metrik ekle, summary çift sayım fix, tüm docs dosyalarındaki eski sayıları güncelle, ANALYSIS Sprint 098 sonuçlarını ekle.

---

## Task 1: RETRO Done Sayacı — Evaluations Map Debug + Fix
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts
- Scope: src/orchestra/

### Description
RETRO Agent/Skill Performance tablosunda Done sütunu hep 0. Kod doğru (buildAgentPerformance GO_WITH_TECH_DEBT'i done'a sayıyor) ama runtime'da evaluations map writeRetrospective'e boş ulaşıyor.

A) Mevcut debug log'u kontrol et (sprint-reporter.ts satır ~96, buildAgentPerformance içinde debugLog çağrısı var).

B) sprint-controller.ts finalizeSprint() fonksiyonunda evaluations map'in writeRetrospective'e geçirildiği noktaya (satır ~1298) debug log ekle:
```
debugLog('finalizeSprint:preRetro', `evaluations.size=${evaluations.size} keys=[${[...evaluations.keys()].join(',')}]`);
```

C) sprint-phases.ts runEvaluatePhase() sonunda evaluations map'in dolu olduğunu doğrula:
```
debugLog('runEvaluatePhase:done', `evaluations.size=${evaluations.size}`);
```

D) Kök nedeni bul ve düzelt. Olası nedenler:
- FIX phase'de evaluations map temizleniyor
- handleCrossDependencies evaluations'ı bozuyor
- sprint.tasks referansı değişiyor

E) Fix'ten sonra RETRO'da Done > 0 olmalı.

**Kanıt:** `grep "debugLog.*evaluations" src/orchestra/sprint-controller.ts src/orchestra/sprint-phases.ts` → 2+ satır

**Test:** `npx vitest run tests/orchestra/sprint-reporter*.test.ts` → 0 fail

---

## Task 2: Job Output Reform — Detaylı Gerekçe + Metrik
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/core/types.ts
- Scope: src/orchestra/, src/core/

### Description
.deckent/jobs/{sprintId}.json dosyası sadece evaluation kararını tutuyor. Her task için detaylı bilgi eklenmeli.

A) finalizeSprint() içindeki job summary yazma bloğunu (satır ~1538-1578) genişlet:

evaluations objesini zenginleştir — her task için:
```json
{
  "098-001": {
    "evaluation": "GO_WITH_TECH_DEBT",
    "reason": "Tests passed but no new test files written",
    "filesChanged": ["src/orchestra/sprint-reporter.ts"],
    "linesAdded": 15,
    "linesRemoved": 3,
    "testsPassed": true,
    "coverage": 0,
    "selfAssessment": "DONE",
    "techDebtDetail": "Test dosyası güncellendi ama yeni test eklenmedi"
  }
}
```

B) Summary çift sayım fix: `completedTasks + techDebtTasks` formülü yanlış. GO_WITH_TECH_DEBT hem completedTasks'a hem techDebtTasks'a sayılıyor → "10/5 task" gibi çıktı. Doğru formül: summary'de `completedTasks` (DONE + GO_WITH_TECH_DEBT toplamı) kullan, ayrı satırda DONE ve TECH_DEBT say.

C) Summary format önerisi:
```
Sprint sprint-099 tamamlandı (Xdk Ysn) — 5/5 task başarılı: 3 DONE, 2 TECH_DEBT, 0 NO_GO | Agent: bug-fixer(2), doc-writer(3)
```

**Kanıt:** `grep "reason\|filesChanged\|selfAssessment" src/orchestra/sprint-controller.ts` → 3+ satır

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-controller*.test.ts` → 0 fail

---

## Task 3: VISION.md + health-check.md + roadmap.md Sayı Güncellemeleri
- Model: opus
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: VISION.md, docs/reference/health-check.md, docs/reference/roadmap.md
- Scope: ./, docs/reference/

### Description
3 dosyada eski sayılar var, hepsini güncelle:

A) VISION.md (7 düzeltme):
- Sprint sayısı: 82 → 98+
- CLI komut: 33 → 34+
- MCP resource: 9 → 8 (satır 59 ve 106)
- Built-in agent: 9 → 16
- Built-in skill: 11 → 21
- Model sayısı: varsa → 13 (ModelRegistry)

B) docs/reference/health-check.md (6 düzeltme):
- Satır 4: 65 sprints → 98+ sprints
- Satır 4: 11,862 tests → 12,193+ tests
- Satır 79: 11,862 tests, 469 test files → 12,193+ tests
- Satır 95: 11,862 → 12,193+
- Satır 104: agents 9 → 16
- Satır 105: skills 11 → 21

C) docs/reference/roadmap.md:
- Satır 100: Sprint 095 → Sprint 098+

**Kanıt:** `grep "98\|12,193\|16 built-in\|21 skill" VISION.md docs/reference/health-check.md docs/reference/roadmap.md | wc -l` → 6+

**Test:** Dosyalar valid markdown.

---

## Task 4: README Badge + ANALYSIS Sprint 098 Güncelleme
- Model: opus
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: README.md, README-TR.md, docs/ANALYSIS-2026-04-02.md
- Scope: ./, docs/

### Description
A) README.md ve README-TR.md:
- Sprint badge: 97+ → 98+
- Varsa eski sayıları güncelle

B) ANALYSIS-2026-04-02.md:
- Bölüm I tablo: Toplam Sprint 97 → 98
- Orchestra Modülleri: 47 → 49
- Core Modülleri: 48 → 52
- Sprint 098 metriklerini ekle (IV. bölüm sonuna):
  ```
  ### Sprint 098 Metrikleri
  - **Kapsam:** Dokümantasyon + Sprint Output + History Fix
  - **Task:** 5/5 (tümü GO_WITH_TECH_DEBT)
  - **Süre:** 8dk 25sn
  - **Kod:** +77 / -56 satır
  - **Önemli değişiklikler:**
    - MCP history tool .brain/archive/ okuyor (85 sprint log erişilebilir)
    - sprint-reporter.ts debug log eklendi (evaluations map debug)
    - ANALYSIS, README, DECKENT.md ModelRegistry güncellemeleri
  ```
- Bölüm IX Sonuç: Sprint 097 → Sprint 098

**Kanıt:** `grep "Sprint 098\|98\+\|49\|52" docs/ANALYSIS-2026-04-02.md | wc -l` → 4+

**Test:** Dosyalar valid markdown.

---

## Task 5: PROJECT-IDENTITY Test Count Fix + CLAUDE.md Module Count
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/PROJECT-IDENTITY.md, CLAUDE.md
- Scope: .brain/, ./

### Description
A) .brain/PROJECT-IDENTITY.md:
- Test Count: 12 → 12,193+  (kısaltılmış/bozuk değer)
- Sprint: 98 doğrula

B) CLAUDE.md:
- orchestra/ modül sayısı: 47 modules → 49 modules
- core/ modül sayısı: 50 modules → 52 modules (model-registry.ts, mode-presets.ts eklendi)
- Sprint sayısı: 97+ → 98+

**Kanıt:** `grep "49 modules\|52 modules\|12,193\|98" .brain/PROJECT-IDENTITY.md CLAUDE.md | wc -l` → 4+

**Test:** Dosyalar valid markdown.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Job output'da her task için reason + filesChanged + selfAssessment bulunmalı
- Summary'de çift sayım olmamalı (totalTasks = done + techDebt + noGo DEĞİL, completedTasks = DONE + TECH_DEBT)
- Tüm docs'ta sayılar güncel: sprint 98+, agent 16, skill 21, model 13, tests 12,193+
- %100 GO hedefli
