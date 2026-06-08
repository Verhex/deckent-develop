# DIRECTIVES — Sprint 062: CI Guardian — Agent + Skill + Hook System

## Goal: Deckent'in CI/CD sürecini yöneten ci-guardian agent + ci-testing skill + sprint hook'ları oluştur. Her sprint öncesi tsc/vitest kontrolü, her task sonrası regression tespiti, sprint sonrası CI raporu. Actions fail'lerini sprint içinde yakala, öğren, düzelt. Mevcut agent/skill/plugin-hook altyapısı üzerine inşa et.

---

## Task 1: ci-guardian Agent Tanımı + PROMPT.md
- Model: opus
- Effort: high
- Files: .deckent/agents/ci-guardian/agent.json, .deckent/agents/ci-guardian/PROMPT.md
- Scope: .deckent/agents/, src/core/agent-pool.ts, tests/core/

### Description
Yeni built-in agent: ci-guardian. CI/CD süreçlerini izleyen, test failure'ları analiz eden, regression tespit eden uzman agent.

**A) agent.json Oluştur:**
```json
{
  "id": "ci-guardian",
  "name": "CI Guardian",
  "type": "builtin",
  "description": "CI/CD pipeline guardian — ensures tsc, vitest, and build pass before and after sprint tasks",
  "expertise": ["ci-cd", "testing", "regression-detection", "build-verification", "github-actions"],
  "preferredModel": "sonnet",
  "effortMultiplier": 0.8,
  "triggerKeywords": ["ci", "test", "build", "lint", "regression", "pipeline", "workflow", "actions", "tsc", "vitest", "coverage"],
  "triggerScopes": ["tests/", ".github/", "src/"],
  "triggerFilePatterns": ["*.test.ts", "*.yml", "vitest.config.*", "tsconfig.*"],
  "allowedTools": ["Read", "Bash", "Write"],
  "deniedTools": [],
  "persistent": false,
  "enabled": true,
  "source": "builtin",
  "systemPrompt": "...",
  "stats": { "totalUses": 0, "successRate": 0, "avgCoverage": 0, "lastUsedInSprint": "" }
}
```

**B) PROMPT.md Oluştur (domain-specific):**
CI Guardian rolü, sorumlulukları, kontrol listesi:
- tsc --noEmit MUTLAKA geçmeli
- npx vitest run 0 fail olmalı
- Yeni test dosyaları mevcut test pattern'ine uymalı
- Mevcut testlerde regression olmamalı
- Coverage düşmemeli (önceki sprint'le karşılaştır)
- Build artifact'ler oluşmalı (dist/ dizini)
- GitHub Actions workflow'larıyla uyumluluk

**C) Agent Pool'a Kaydet:**
agent-pool.ts'deki BUILTIN_AGENTS listesine ci-guardian ekle. selectAgent() logic'inde CI-related task'lar için ci-guardian seçilmeli.

**Test:** 8+ test — agent.json valid, PROMPT.md mevcut, selectAgent CI task'ta ci-guardian seçmeli.

---

## Task 2: ci-testing Skill Tanımı + SKILL.md
- Model: sonnet
- Effort: high
- Files: .deckent/skills/ci-testing/manifest.json, .deckent/skills/ci-testing/SKILL.md
- Scope: .deckent/skills/, src/core/skill-pool.ts, tests/core/

### Description
Yeni built-in skill: ci-testing. CI pipeline'da test stratejisi, regression tespiti, coverage analizi uzmanlığı.

**A) manifest.json Oluştur:**
```json
{
  "id": "ci-testing",
  "name": "CI Testing Expert",
  "version": "1.0.0",
  "description": "CI/CD testing expertise — regression detection, coverage analysis, test strategy",
  "entrypoint": "SKILL.md",
  "category": "workflow",
  "triggers": ["ci", "test", "regression", "coverage", "pipeline", "build", "lint", "actions"],
  "stackDetection": { "files": [".github/workflows/*.yml", "vitest.config.*", "tsconfig.json"] },
  "composableWith": ["testing-expert", "typescript-expert"],
  "priority": 12,
  "promptInjection": { "position": "prepend", "maxTokens": 1500 },
  "enabled": true,
  "stats": { "totalUses": 0, "lastUsed": "" }
}
```

**B) SKILL.md Oluştur:**
CI testing uzmanlığı rehberi:
- Staged test execution stratejisi (core → orchestra → cli → remaining)
- Regression detection: önceki sprint test sayısıyla karşılaştır
- Coverage analizi: v8 provider, barrel exclude pattern
- tsc --noEmit hata analizi: type error kategorileri
- vitest failure analizi: mock sorunları, import hataları, timeout'lar
- GitHub Actions workflow debugging: matrix, timeout, artifact
- Pre-commit kontrol listesi: tsc + vitest + build

**C) Skill Pool'a Kaydet:**
skill-pool.ts veya skill-registry.ts'deki BUILTIN_SKILLS listesine ci-testing ekle.

**Test:** 6+ test — manifest valid, SKILL.md mevcut, skill selection CI task'ta ci-testing seçmeli.

---

## Task 3: beforeSprint Hook — Pre-Sprint CI Validation
- Model: opus
- Effort: high
- Files: src/core/plugin-hooks.ts, src/orchestra/sprint-controller.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
Sprint başlamadan ÖNCE CI kontrolü çalıştıran hook mekanizması.

**A) beforeSprint Hook'a CI Validation Ekle:**
Mevcut `runHooks('beforeSprint')` çağrısı sprint-controller.ts'de var. Bu hook'a built-in CI validation ekle:

1. `tsc --noEmit` çalıştır — fail ederse sprint BAŞLATMA, hata mesajı göster
2. `npx vitest run` çalıştır — fail ederse uyar (bloklamayabilir, configurable)
3. Mevcut test sayısını kaydet (sprint sonunda karşılaştırma için)
4. Coverage baseline kaydet

**B) Config'le Kontrol:**
```json
{
  "ci_guardian": {
    "enabled": true,
    "pre_sprint_check": true,
    "block_on_tsc_fail": true,
    "block_on_test_fail": false,
    "track_coverage": true,
    "track_test_count": true
  }
}
```

**C) Sprint State'e Baseline Kaydet:**
`.deckent/ci-baseline.json` dosyasına sprint başındaki metrikleri yaz:
```json
{
  "sprintId": "sprint-062",
  "baseline": {
    "tscPassed": true,
    "testCount": 11315,
    "testPassed": 11315,
    "testFailed": 0,
    "coverage": 96.0,
    "timestamp": "2026-03-26T..."
  }
}
```

**Test:** 10+ test — tsc fail → sprint blok, test fail → uyarı, baseline kayıt, config disable.

---

## Task 4: afterTask Hook — Task-Level Regression Detection
- Model: opus
- Effort: high
- Files: src/core/plugin-hooks.ts, src/orchestra/sprint-controller.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
Her task tamamlandıktan SONRA regression kontrolü.

**A) afterTask Hook'a Regression Check Ekle:**
Task result dosyası yazıldıktan sonra:
1. `tsc --noEmit` çalıştır — fail ederse task'ı NO_GO olarak işaretle
2. Worker'ın değiştirdiği dosyalarla ilgili testleri çalıştır (targeted test)
3. Baseline'daki test sayısıyla karşılaştır — test sayısı düştüyse uyar

**B) Targeted Test Execution:**
Task result'taki `filesChanged` listesinden ilgili test dosyalarını bul:
- `src/cli/commands/config.ts` → `tests/cli/commands/config*.test.ts`
- `src/orchestra/sprint-controller.ts` → `tests/orchestra/sprint-controller*.test.ts`
- Pattern: `src/{path}` → `tests/{path}` + wildcard

**C) Regression Alert:**
Regression tespit edilirse:
- Dashboard'a alert ekle
- Task result'a `regressionDetected: true` field ekle
- Brain evaluation'da bu bilgiyi kullan (NO_GO kararını etkilesin)

**D) Performance:**
Her task sonrası full vitest çalıştırmak yavaş. Sadece targeted test çalıştır (ilgili dosyalar). Full suite sadece sprint sonunda.

**Test:** 10+ test — tsc fail → NO_GO, targeted test çalıştırma, regression detection, performance.

---

## Task 5: afterSprint Hook — Sprint CI Raporu
- Model: sonnet
- Effort: high
- Files: src/core/plugin-hooks.ts, src/orchestra/sprint-reporter.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
Sprint tamamlandıktan SONRA kapsamlı CI raporu.

**A) Full Test Suite Çalıştır:**
Sprint sonunda `npx vitest run` tam suite çalıştır. Baseline ile karşılaştır.

**B) CI Report Oluştur:**
`.brain/ci-report-sprint-{id}.json` dosyasına:
```json
{
  "sprintId": "sprint-062",
  "baseline": { "testCount": 11315, "coverage": 96.0 },
  "result": { "testCount": 11400, "testPassed": 11400, "testFailed": 0, "coverage": 96.2 },
  "delta": { "newTests": 85, "regressions": 0, "coverageDelta": 0.2 },
  "tscPassed": true,
  "buildPassed": true,
  "timestamp": "2026-03-26T..."
}
```

**C) RETRO.md'ye CI Bölümü Ekle:**
Sprint retrospektifine "## CI Health" bölümü ekle:
```
## CI Health
| What | Value |
|------|-------|
| tsc --noEmit | PASS |
| Tests | 11400/11400 (0 regression) |
| New tests | +85 |
| Coverage | 96.2% (+0.2%) |
| Build | PASS |
```

**D) Trend Tracking:**
Son 5 sprint'in CI raporu → trend analizi. Test sayısı artıyor mu, coverage stabil mi.

**Test:** 8+ test — CI report oluşturma, baseline karşılaştırma, RETRO entegrasyon, trend.

---

## Task 6: CI Dashboard Entegrasyonu
- Model: sonnet
- Effort: high
- Files: src/cli/commands/doctor.ts, src/cli/commands/status.ts, src/cli/helpers/output.ts
- Scope: src/cli/, tests/cli/

### Description
CI Guardian sonuçlarını mevcut CLI komutlarına entegre et.

**A) doctor CI Health Check:**
`deckent doctor` çıktısına CI health bölümü ekle:
- Son sprint CI raporu özeti
- tsc durumu (PASS/FAIL)
- Test count trend (artan/azalan)
- Coverage trend

**B) status CI Indicator:**
`deckent status` çıktısına CI durumu ekle:
- Sprint sırasında: "CI: Baseline 11315 tests, 96% coverage"
- Task sonrası: "CI: 0 regressions detected"
- Sprint sonrası: "CI: +85 new tests, 0 regressions"

**C) `deckent ci` Komutu (Opsiyonel):**
Standalone CI kontrol komutu:
- `deckent ci check` → tsc + vitest çalıştır, sonuçları raporla
- `deckent ci report` → son CI raporu göster
- `deckent ci trend` → son 5 sprint CI trendi

**Test:** 8+ test

---

## Task 7: GitHub Actions Workflow İyileştirme
- Model: sonnet
- Effort: high
- Files: .github/workflows/ci.yml
- Scope: .github/, tests/

### Description
Mevcut CI workflow'unu deckent sprint sonuçlarıyla entegre et.

**A) CI Workflow'a Coverage Upload Ekle:**
Test çalıştıktan sonra coverage raporu artifact olarak yükle.

**B) CI Workflow'a npm audit Ekle:**
Security scanning: `npm audit --audit-level=high` — fail etmezse devam.

**C) Blueprint Test Isolation:**
Blueprint/docs testleri ayrı job'da çalışsın (hızlı fail).

**D) Dashboard Build Verification:**
Dashboard build'ini de CI'a ekle: `npm run test:dashboard`.

**Test:** 5+ test (workflow YAML validation, artifact check).

---

## Task 8: CI Learning — Sprint-to-Sprint Öğrenme
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-reporter.ts, src/core/ci-learning.ts (new)
- Scope: src/orchestra/, src/core/, tests/

### Description
CI Guardian'ın sprint'ten sprint'e öğrenmesi.

**A) Failure Pattern Detection:**
Son 5 sprint'teki CI raporlardan pattern çıkar:
- Hangi dosyalar en çok regression üretiyor?
- Hangi test kategorileri en çok fail oluyor?
- tsc hataları hangi pattern'de? (missing import, type mismatch, etc.)

**B) Proactive Suggestions:**
Pattern'lere göre öneri üret:
- "src/orchestra/sprint-controller.ts son 3 sprint'te regression üretti — bu dosyaya dokunulurken extra dikkat"
- "Mock güncellemeleri en sık fail nedeni — yeni export eklenince mock'ları güncelle"
- "Coverage %96 → %94 düşüş trendi — test yazma zorunluluğu artırılmalı"

**C) MEMORY.md CI Learnings:**
Sprint sonrası MEMORY.md'ye CI öğrenmeleri ekle:
```
## CI Learnings
- Sprint 062: 85 new tests, 0 regressions, mock update pattern detected
- Sprint 061: 20 new tests, 3 regressions (config mock, brain mock, skill mock)
```

**D) Config Suggestion:**
CI pattern'lere göre config önerisi:
- Regression oranı yüksekse → `ci_guardian.block_on_test_fail: true` öner
- Coverage düşüyorsa → `ci_guardian.min_coverage: 90` öner

**Test:** 8+ test — pattern detection, suggestion generation, MEMORY entegrasyon.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression (11,300+ test geçmeli)
- ci-guardian agent selectAgent'ta CI task'lar için seçilmeli
- ci-testing skill CI task'lar için inject edilmeli
- beforeSprint hook tsc fail'de sprint'i bloklayabilmeli
- afterTask hook regression tespit edebilmeli
- CI raporu JSON formatında oluşmalı
- %100 GO hedefli
