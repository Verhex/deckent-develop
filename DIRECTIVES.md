# DIRECTIVES — Sprint 049: Critical Evaluation Fix + ADR Update + Identity Fix

## Goal: evaluateResult() TECH_DEBT pattern fix, DECISIONS.md ADR-014 through ADR-021, updateProjectIdentity() tamamen yeniden yaz

---

## Task 1: evaluateResult() — Brain Override Worker Self-Assessment
- Model: opus
- Effort: high
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/result-evaluator.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
CRITICAL FIX. Mevcut evaluateResult() satır 47-48: worker selfAssessment='GO_WITH_TECH_DEBT' dediğinde Brain bunu körü körüne kabul ediyor. Bu yüzden sprint'lerin %70+'ı TECH_DEBT oluyor.

YENİ MANTIK — selfAssessment sadece ipucu, Brain kendi doğrulamasını yapar:

```typescript
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string): TaskEvaluation {
  // Step 1: Hard failures — NO_GO regardless of self-assessment
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  
  // Step 2: Doc tasks — DONE if tests pass (skip coverage)
  if (isDocTask(task)) return TaskEvaluation.DONE;
  
  // Step 3: Brain makes the final call based on objective criteria
  // Worker self-assessment is just a HINT, not the final decision
  
  // Check: did worker write new test files?
  const hasNewTests = result.filesChanged?.some(f => 
    f.includes('.test.') || f.includes('.spec.')
  ) ?? false;
  
  // Check: vitest coverage validation (if JSON available)
  if (vitestJsonOutput !== undefined) {
    const coverageCheck = validateWorkerCoverage({
      reportedCoverage: result.coverage,
      vitestJsonOutput,
      taskScope: { directories: task.scope?.directories ?? [] },
    });
    if (coverageCheck && coverageCheck.level === 'WARNING') {
      return TaskEvaluation.GO_WITH_TECH_DEBT;
    }
  }
  
  // If tsc passes AND tests pass AND worker wrote tests → DONE
  // (tsc pass is implied by testsPassed since vitest uses tsc)
  if (result.testsPassed && hasNewTests) {
    return TaskEvaluation.DONE;
  }
  
  // If tsc passes AND tests pass but no new tests → TECH_DEBT
  if (result.testsPassed && !hasNewTests && result.coverage < 90) {
    return TaskEvaluation.GO_WITH_TECH_DEBT;
  }
  
  // Coverage >= 90 with passing tests → DONE
  if (result.coverage >= 90) return TaskEvaluation.DONE;
  
  // Default: respect worker hint for edge cases
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') {
    return TaskEvaluation.GO_WITH_TECH_DEBT;
  }
  
  return TaskEvaluation.DONE;
}
```

KEY CHANGE: Satır 48'deki `if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;` KALDIRILDI. Worker'ın ipucusu sadece en sonda fallback olarak kullanılıyor.

Ayrıca .brain/PATTERNS.md dosyasını oku, high_tech_debt_rate pattern'ını resolved olarak işaretle: `"resolved": true, "resolvedInSprint": "sprint-049"`.

20+ test yaz:
- testsPassed=true + hasNewTests=true → DONE (worker GO_WITH_TECH_DEBT dese bile)
- testsPassed=true + hasNewTests=false + coverage<90 → GO_WITH_TECH_DEBT
- testsPassed=true + coverage>=90 → DONE
- testsPassed=false → NO_GO (worker DONE dese bile)
- selfAssessment=NO_GO → NO_GO (her zaman)
- isDocTask → DONE (test geçiyorsa)
- hasNewTests algılama: .test.ts, .spec.ts dosyaları
- Mevcut testleri KIRMA — eski test expectation'larını yeni mantığa göre güncelle

---

## Task 2: DECISIONS.md — ADR-014 through ADR-021
- Model: sonnet
- Effort: normal
- Files: .brain/DECISIONS.md
- Scope: .brain/

### Description
Sprint 044-048'de alınan mimari kararları ADR olarak ekle. Mevcut 13 ADR'nin devamı.

ADR-014: .deck Secret File System (Sprint 044)
- Context: Provider API key'leri .env'de tutmak proje .env dosyasıyla çakışıyordu
- Decision: Ayrı .deck dosyası oluşturuldu, DECKENT_ prefix'li key'ler, .gitignore'a otomatik ekleme
- Consequence: Worker'lar .deck içeriğini görmez, Brain sadece gerekli key'leri inject eder

ADR-015: TaskRouter Module — 6-level routing (Sprint 044)
- Context: Task → provider atama mantığı sprint-controller'da inline'dı ve genişletilemezdi
- Decision: Ayrı TaskRouter modülü, 6 seviyeli öncelik: config→force→agent→skill→worker→fallback
- Consequence: Yeni routing kuralları sprint-controller'a dokunmadan eklenebilir

ADR-016: Connector Module — provider lifecycle (Sprint 044)
- Context: Provider'ların sağlık durumu sadece bootstrap'ta kontrol ediliyordu
- Decision: Connector class ile runtime health check, lazy init, auditor entegrasyonu
- Consequence: Sprint sırasında provider düşerse tespit edilir

ADR-017: MCP-Native Provider Adapters (Sprint 045)
- Context: Codex/Gemini adapter'ları mock komutlar kullanıyordu
- Decision: Gerçek CLI komutlarına geçiş — codex exec --full-auto, gemini -p --output-format json
- Consequence: Gerçek provider'larla test mümkün, describe.skipIf ile CI'da skip

ADR-018: Multi-Environment Config Generation (Sprint 046)
- Context: Her IDE/ortam farklı config dosyası bekliyor
- Decision: Ortam başına config generator: Codex→config.toml, Gemini→settings.json, Cursor→mcp.json
- Consequence: deckent init --all-envs tüm ortamları tek seferde hazırlar

ADR-019: Language-Agnostic Worker Verify (Sprint 046)
- Context: Worker verify loop sadece tsc+vitest çalıştırıyordu
- Decision: STACK_COMMANDS ile dil bazlı build/test komutu: Python→pytest, Go→go test, Rust→cargo test
- Consequence: Deckent TypeScript dışı projelerde de çalışır

ADR-020: Rich Sprint Output — 7-section summary (Sprint 044)
- Context: Sprint sonuç çıktısı tek satır metric'ti, kullanıcı ne olduğunu anlamıyordu
- Decision: 7 bölümlü rich output: Header, Results, Changes, Tests, Agents, Learnings, Next Steps
- Consequence: Her sprint sonunda kullanıcı tam resmi görür, ANSI renk + NO_COLOR desteği

ADR-021: Kraken ASCII Brand Identity (Sprint 044)
- Context: Deckent'in görsel bir kimliği yoktu
- Decision: Kraken ASCII mascot: teal gövde (#4db8a4), gold DECKENT (#c4a855), dim tagline
- Consequence: deckent --version ve deckent init'te splash gösterilir

3+ test yaz (ADR sayısı, format kontrolü).

---

## Task 3: updateProjectIdentity() — Tamamen Yeniden Yaz
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
updateProjectIdentity() tamamen bozuk — şu an: Test Count: 8, Coverage: 11.9%, Total Sprints: 10. Gerçek: 10.088 test, 48 sprint.

SORUN 1: countProjectTestCases() dosya içeriğini regex ile sayıyor ama yanlış sayıyor.
FIX: `npx vitest run --reporter=json` çıktısından test sayısını parse et. JSON çıktı: `{ numPassedTests, numFailedTests, numTotalTests }`. Eğer vitest çalışmazsa (timeout/error), .brain/sprints/ altındaki son sprint log'undan "Tests" satırını oku.

SORUN 2: totalSprints .brain/sprints/ dosya sayısına bakıyor ama eski sprint'ler archive'a taşındı.
FIX: config.last_sprint_id'den sprint numarasını çıkar (sprint-048 → 48).

SORUN 3: Coverage clover.xml'den okuyor ama clover.xml üretilmiyor.
FIX: vitest --coverage ile text summary çalıştır, "All files" satırındaki % değerini parse et. Çalışmazsa önceki değeri koru.

SORUN 4: Completed tasks kümülatif ama her sprint resetliyor.
FIX: Önceki PROJECT-IDENTITY'den oku + mevcut sprint'in completed task'larını ekle.

YENİ updateProjectIdentity() fonksiyonu:
```typescript
export function updateProjectIdentity(
  projectRoot: string,
  sprintId: string,
  metrics: SprintMetrics,
  totalSprints?: number,
): void {
  // Test count: try vitest --reporter=json, fallback to previous value
  const testCount = getTestCountFromVitest(projectRoot) 
    ?? readPreviousTestCount(content)
    ?? countProjectTestCases(projectRoot);
  
  // Total sprints: from sprint ID number
  const sprintNumber = extractSprintNumber(sprintId) ?? totalSprints ?? 1;
  
  // Coverage: try vitest --coverage, fallback to previous, fallback to metrics
  const coverage = getCoverageFromVitest(projectRoot)
    ?? readPreviousCoverage(content)
    ?? (metrics.coveragePercent > 0 ? metrics.coveragePercent : 0);
  
  // Completed tasks: cumulative
  const previousCompleted = readPreviousCompletedTasks(content);
  const cumulativeCompleted = previousCompleted + metrics.completedTasks;
  
  // No-Go rate: current sprint's rate
  const noGoRate = metrics.noGoRate;
  
  // Write updated state
  // ...
}
```

Helper fonksiyonlar:
- getTestCountFromVitest(root): `spawnSync('npx', ['vitest', 'run', '--reporter=json'], ...)` → parse numTotalTests. Timeout 30s. Fail → null.
- getCoverageFromVitest(root): `spawnSync('npx', ['vitest', 'run', '--coverage', '--reporter=default'], ...)` → parse "All files" satırı. Timeout 60s. Fail → null.
- readPreviousTestCount(content): PROJECT-IDENTITY.md'den "Test Count: N" oku.

IMPORTANT: vitest çalıştırma sırasında sprint'i bloklamayacak şekilde timeout kısa tut (30s). Fail olursa graceful fallback.

15+ test yaz:
- getTestCountFromVitest doğru parse ediyor
- getCoverageFromVitest doğru parse ediyor
- vitest fail → fallback to previous
- sprintNumber doğru çıkarılıyor
- cumulativeCompleted doğru hesaplanıyor
- Mevcut testleri KIRMA

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing 10,088 tests: 0 regression
- evaluateResult() değişikliği mevcut testleri etkileyecek — güncelle
- DECISIONS.md format: ## ADR-NNN: Title + Context/Decision/Consequence
- updateProjectIdentity() vitest çağrısı timeout=30s, non-blocking