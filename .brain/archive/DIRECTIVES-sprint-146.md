# DIRECTIVES — Sprint 146: Prompt God Template Reform + Critical Bug Fix + Rubric Consolidation

> **Sprint tipi:** P0 ağırlıklı, beta yolu (Sprint 150 GA — Per 23 Nis TRT, 3 gün sonra)
> **Önceki sprint:** sprint-145 (27/28 done, 24 TD, 1 NO_GO T-145-002, gate FAILURE vitestFail 3)
> **Tema:** "Prompt kalitesi 64/100 → 85/100 + 3 canlı kanıt bug fix + rubric 3-sistem konsolidasyon"
> **Toplam task:** 17
> **Hard cap:** 5h
> **Cost cap:** $95 (subs mode)
> **Wave sayısı:** 6

## Referanslar
- Sprint 145 retro: `.brain/archive/retro-sprint-145.md`
- Nervous System spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`
- Memory: `project_sprint146_prompt_god_template.md`, `project_deckent_nervous_system.md`
- Sprint 145 canlı bug kanıtları: DIRECTIVES mid-sprint silme (08:14 TRT), agent routing test-writer 14/27, SDL dead write
- ADR: `.brain/exports/decisions.md`

## Goal

Sprint 145'in ürettiği 24 tech debt ve 3 canlı bug'ı Sprint 146'da köklü şekilde kapatmak: (1) **Prompt God Template Reform** (agent V2 + limit + ADR relevance scoring + scope sanitize + generative template pattern) 10 task → prompt kalite 64/100 → 85/100, (2) **3 canlı bug fix** (DIRECTIVES mid-sprint silme + SDL decision log dead write + agent exclusion hard-code) 3 task, (3) **Rubric system consolidation** (3 paralel skor sistemi → 1 canonical, worker self-report kaldır, Brain-side Quality Assessor tek kaynak) 2 task, (4) **Sprint 145 test regression fix** (vitest 3 fail) 1 task, (5) **Sprint 147 nervous system preflight** (ADR-040 draft + types yer ayır) 1 task. Sprint 147'ye temiz zemin, Sprint 150 beta GA yolu açık.

## Sprint 146 Tema Özeti

**"Prompt kaliteli olunca worker çıktı kaliteli olur."**

Sprint 145 kanıtladı: DIRECTIVES task description güçlü olduğu için worker'lar prompt bug'lara rağmen 27/28 tamamladı. Şimdi prompt'un kendisini iyileştirince Sprint 147 nervous system + Sprint 148-150 beta GA çok daha sağlam çıkar.

---

## Task 1: Agent Truncation Bug Fix
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/agent-pool.ts, tests/core/agent-pool.test.ts
- Scope: src/core/, tests/core/

### Description
Sprint 145 canlı kanıt: 3/3 prompt dosyasında agent.md içeriği satır 29'da "Clean up fil" olarak kesiliyor. Prompt builder agent content'i truncate ediyor. `grep -n "substring\|slice(0\|readFile" src/core/agent-pool.ts` ile truncation noktasını bul. Eğer `readFileSync().substring(0, N)` varsa `N` limitini kaldır veya 50000'e çıkar. Agent PROMPT.md dosyasını tam yüklediğini doğrula.

### Test (5 test)
1. `loadAgent('architect')` tam PROMPT.md içeriği döner (>1000 satır mock)
2. `loadAgent('test-writer')` tam içerik
3. `loadAgent('doc-writer')` tam içerik
4. Cache invalidate sonrası tam içerik
5. `buildWorkerPrompt({agent: 'architect', ...})` çıktısında "Clean up fil" kırpımı yok

**Kanıt:** `grep -c "Clean up fil" .tasks/.prompt-146-*.txt` → 0. tsc PASS, vitest 5/5 PASS.

---

## Task 2: Agent Routing V2 Retrain + Intent Classifier Refresh
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/task-router.ts, src/core/intent-classifier.ts, src/core/activation-engine.ts, tests/orchestra/agent-routing-health.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 145 canlı: test-writer 14/27 task aldı (%52), doc task bile test-writer'a route edildi (T-145-020 ANA-PLAN-TR). Intent classifier doc task'ları "testing" olarak sınıflandırıyor.

Intent keyword mapping refresh:
- "documentation", "doc update", ".md", "güncelleme" → intent: `documentation`
- "adaptive", "timeout", "estimator" → intent: `core-dev`
- "rubric", "eval", "assess" → intent: `evaluation`
- "test", "coverage", "spec" → intent: `testing`
- "wire", "fix", "bug", "runtime" → intent: `bug-fix`

Agent activation rules refresh:
- documentation → doc-writer
- core-dev → architect veya refactorer
- testing → test-writer
- bug-fix → bug-fixer
- evaluation → security-auditor

Agent exclusion hard-code kaldır, context-aware dinamik exclusion ekle.

### Test (12 test)
1. T-145-020 scope `./` filesWrite `["DECKENT-ANA-PLAN-TR.md"]` → intent: `documentation`, agent: `doc-writer`
2. T-145-002 scope `src/orchestra/` title `Brain Heuristic Timeout Estimator` → agent: `architect`
3. T-145-027 scope `tests/integration/` → agent: `test-writer`
4. T-145-004 scope `src/agents/` → agent: `bug-fixer` veya `security-auditor`
5-8. 4 scope tipinde doğru exclusion
9. Intent classifier confidence > 0.6 kanonik task'lar için
10. Sprint 145 27 task re-route simulation'da test-writer count ≤ 6 (önce 14)
11. `routingMeta.routingVersion === 'v2'`
12. Forced skills override hâlâ çalışıyor (backward compat)

**Kanıt:** `npx vitest run tests/orchestra/agent-routing-health.test.ts` 12/12 PASS.

---

## Task 3: ADR Relevance Scoring Engine
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/adr-selector.ts, src/orchestra/task-builder.ts, tests/orchestra/adr-selector.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 145 canlı: 3/3 prompt'ta 5 ADR full-text inject edildi, %52-76 dosya boyutu ADR gürültüsü. Ör. T-145-001 Timeout Config task'ına ADR-033 Product Vision (100 satır) relevant değil.

Yeni dosya `src/orchestra/adr-selector.ts` API:

```typescript
export interface AdrRelevance {
  adrId: string;
  title: string;
  score: number;
  matchReasons: string[];
}

export function selectRelevantAdrs(task: Task, allAdrs: MemoryEntry[], topN: number): AdrRelevance[];
export function buildAdrPromptSection(adrs: AdrRelevance[], mode: 'full' | 'summary'): string;
```

Skorlama: scope path match +0.4, keyword match +0.3, intent preference +0.2, age penalty. Default topN=3.

### Test (10 test)
1. Core dev task → top3: ADR-008, 015, 023
2. Docs task → top3: ADR-029, 030, 032
3. CLI task → ADR-010, 011, 022-v2
4. Scope match skoru correct
5. Keyword match skoru correct
6. Age penalty correct
7. TopN cap (3) uygulanmış
8. Empty input → []
9. buildAdrPromptSection 'full' full text
10. buildAdrPromptSection 'summary' 3-5 satır

**Kanıt:** `npx vitest run tests/orchestra/adr-selector.test.ts` 10/10 PASS. Sprint 146 prompt'ları ADR section ≤ %30 dosya boyutu.

---

## Task 4: Scope Sanitizer
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/scope-sanitizer.ts, src/orchestra/task-builder.ts, tests/orchestra/scope-sanitizer.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 145 canlı: T-145-001 `filesWrite: [..., "config.json", "dist/cli/entry.js"]` — config.json global, dist/ derleme output yazılmamalı. T-145-002+003 duplicate paths.

Yeni dosya `src/orchestra/scope-sanitizer.ts` filtreler:
1. `dist/` prefix → remove
2. Extension-only (`.ts`, `.md`) → remove
3. Unqualified filename (`init.ts` without src/ prefix) → remove + warning
4. Global protected (`config.json`, `package.json`, `tsconfig.json`) → remove
5. Duplicate paths (case-insensitive) → dedupe
6. "(yeni)" suffix strip + dedupe
7. Absolute paths → reject
8. `..` path traversal → reject

### Test (10 test)
1. `filesWrite: ["dist/cli/entry.js"]` → removed
2. `filesWrite: [".ts"]` → removed
3. `filesWrite: ["init.ts"]` → warning
4. `filesWrite: ["config.json"]` → removed
5. `filesWrite: ["src/a.ts", "src/a.ts"]` → deduped
6. `filesWrite: ["src/a.ts (yeni)", "src/a.ts"]` → deduped
7. `filesWrite: ["../etc/passwd"]` → rejected
8. `filesWrite: ["/etc/passwd"]` → rejected
9. Normal scope unchanged
10. Integration: `task-builder.ts` scope output sanitized

**Kanıt:** `npx vitest run tests/orchestra/scope-sanitizer.test.ts` 10/10 PASS.

---

## Task 5: Generative Useful God Template — buildTaskPrompt Single Entry
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/prompt-god-template.ts, src/orchestra/task-builder.ts, tests/orchestra/prompt-god-template.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Prompt oluşturma tek noktada. Yeni dosya `src/orchestra/prompt-god-template.ts` (~400 LoC) API:

```typescript
export interface PromptArtifact {
  prompt: string;
  metadata: {
    agent: string;
    skills: string[];
    adrIds: string[];
    scopeWarnings: string[];
    charCount: number;
    estimatedTokens: number;
  };
}

export function buildTaskPrompt(task: Task, ctx: SprintContext): PromptArtifact;
```

İç akış: classifyTaskType → selectAgent → selectSkills → selectRelevantAdrs (topN=3) → sanitizeScope → renderTemplate. Metadata içinde char/token count.

`src/orchestra/task-builder.ts` `buildWorkerPrompt()` bu fonksiyonu çağırır (inline render kaldır).

### Test (15 test)
1-3. Core dev / docs / test task'lar doğru agent + ADR seçer
4. Metadata.charCount < 30000
5. Metadata.estimatedTokens < 25000
6. adrMode 'summary' when any ADR > 3000 chars
7. Filler boş header atlanır
8. Agent prompt tam, truncation yok
9. Skill prompts sırayla inject
10. Scope warnings görünür
11. ADR topN=3 limit
12. Dependencies info prompt'ta
13. Rubric spec prompt'ta YOK (Task 10 sonuçları)
14. Token usage spec var
15. Honest assessment block var

**Kanıt:** `npx vitest run tests/orchestra/prompt-god-template.test.ts` 15/15 PASS. Prompt char count %40 azalmış (45K → ≤27K).

---

## Task 6: Task-Type ADR Preset Matrix + Filler Cleanup
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/adr-selector.ts, src/orchestra/prompt-god-template.ts, tests/orchestra/adr-preset.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Task 3 relevance üzerine preset matrix:

```typescript
export const TASK_TYPE_ADR_PRESETS: Record<TaskType, string[]> = {
  'core-dev':      ['adr-001', 'adr-002', 'adr-008', 'adr-015'],
  'docs':          ['adr-029', 'adr-030', 'adr-032'],
  'test':          ['adr-003', 'adr-019'],
  'cli':           ['adr-010', 'adr-011', 'adr-012', 'adr-022-v2'],
  'mcp':           ['adr-022-v2', 'adr-017'],
  'security':      ['adr-006', 'adr-037', 'adr-038'],
  'observability': ['adr-035'],
};
```

Preset match +0.3 skor bonus. Filler header `=== Task === / === Skills ===` boş ise yazılmaz (conditional emit).

### Test (6 test)
1-2. Preset ADR'lar top3'e girer (core-dev, docs)
3. Preset + relevance birleşik skor
4-5. Boş header atlanır / dolu header yazılır
6. Dependencies yoksa section yok

**Kanıt:** `npx vitest run tests/orchestra/adr-preset.test.ts` 6/6 PASS.

---

## Task 7: Prompt Quality Linter
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: scripts/prompt-linter.mjs, tests/scripts/prompt-linter.test.ts
- Scope: scripts/, tests/scripts/

### Description
Sprint sonrası prompt kalite ölçümü. `scripts/prompt-linter.mjs`:

Checks:
- ADR ratio > 0.5 → -15 puan, > 0.7 → -15 daha
- Agent truncation ("Clean up fil" pattern) → -20 puan
- Empty filler headers → -5 puan
- Rubric spec present (Sprint 146 sonrası olmamalı) → -10 puan
- Char count > 40000 → -10 puan
- Duplicate scope paths → -5 puan

Exit code 0 avg ≥ 75/100.

### Test (5 test)
1. Clean prompt → score 100
2. ADR ratio %60 → score 85
3. Truncation → score 80
4. Empty filler → score 95
5. Integration: Sprint 146 avg ≥ 75

**Kanıt:** `node scripts/prompt-linter.mjs --sprint 146` avg ≥ 75. `npx vitest run tests/scripts/prompt-linter.test.ts` 5/5 PASS.

---

## Task 8: DIRECTIVES.md Mid-Sprint Silme Bug Fix
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-docs-updater.ts, tests/orchestra/archive-directives-phase.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 145 canlı kanıt (08:14 TRT, t+18dk): DIRECTIVES.md template-hale dönüştü EXECUTE phase'de. archiveDirectives yanlış tetiklenmiş. Sprint 144 archive 463 byte (template) — pattern 2 sprint üst üste.

archiveDirectives() fonksiyonuna phase guard ekle:

```typescript
export function archiveDirectives(projectRoot: string, sprintId: string, phase: SprintPhase): void {
  if (phase !== 'CLEANUP') {
    debugLog('archiveDirectives', `REJECTED: called in phase ${phase}, only CLEANUP allowed`);
    return;
  }
  // existing logic
}
```

Emergency restore: eğer mid-sprint çağrı durumunda task JSON'dan reconstruct et.

### Test (7 test)
1-5. PLAN/EXECUTE/FIX/RETRO/CLEANUP phase'lerde beklenen davranış
6. Emergency restore: mid-sprint çağrıda task JSON'dan reconstruct
7. Sprint 145 08:14 TRT senaryo simulate: reject edilir

**Kanıt:** `npx vitest run tests/orchestra/archive-directives-phase.test.ts` 7/7 PASS.

---

## Task 9: SDL Decision Log Rehabilitation
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/task-router.ts, src/orchestra/routing-engine.ts, src/cli/commands/explain.ts, tests/orchestra/decision-log.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description
Sprint 145 audit kanıt: `.deckent/decisions/decision-NNN.json` 27 dosya yazıldı ama hiçbir yerde okunmuyor. `input: {}` / `output: {}` boş → debug değersiz.

Karar: Hibrit (c) — anlamlı olayları log'la + input/output doldur + v2 filter.

writeDecisionLog():
- Sadece `routingVersion: v2` task'lar
- Meaningful steps filter (agent değişimi, skill budget exceed, exclusion match)
- `input` ve `output` dolu
- `deckent explain <taskId>` komutunda okunur

### Test (6 test)
1. v2 routing → log yazılır
2. v1 routing → log yok
3. Anlamsız routing → log yok (boş filter)
4. Agent exclusion rule match → `excluded: true`
5. Skill budget exceed → output dolu
6. `deckent explain 146-001` → decision log okunur

**Kanıt:** `npx vitest run tests/orchestra/decision-log.test.ts` 6/6 PASS.

---

## Task 10: Rubric System Consolidation
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/quality-assessor.ts, src/orchestra/result-evaluator.ts, src/orchestra/sprint-retro-writer.ts, src/core/task-types.ts, src/orchestra/prompt-god-template.ts, tests/orchestra/rubric-consolidation.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 145 audit: 3 paralel rubric sistemi var. Worker self-report (propaganda risk) + Brain scoreCriterion (aktif) + Quality Assessor dimensions (aktif).

Karar: Worker self-report kaldır, Quality Assessor dimensions kanonik.

Adımlar:
1. `prompt-god-template.ts` rubric spec section tamamen kaldırılır
2. `TaskResult.rubricScores` `@deprecated`
3. `sprint-retro-writer.ts` `formatRubricScoresSection()` Quality Assessor dimensions kullanır
4. `assessQuality()` her evaluate sonrası zorunlu
5. Field naming: `coverage`, `scopeAdherence`, `completeness`

### Test (10 test)
1. Worker prompt'ta rubricScores spec yok
2. TaskResult rubricScores gelirse @deprecated warning
3. assessQuality() her evaluate sonrası çağrılır
4. RETRO dimensions kullanır
5. Field naming kanonik
6. Backward compat: eski result parse edilir
7. Quality Assessor sonucu outcome-tracker'a
8. rubricScores olmayan result → Quality Assessor yine hesaplar
9. RETRO table doğru başlıklar
10. Integration: 17 task evaluate → quality scores

**Kanıt:** `npx vitest run tests/orchestra/rubric-consolidation.test.ts` 10/10 PASS.

---

## Task 11: Sprint 145 vitest Regression Fix
- Model: opus
- Effort: normal
- Skills: testing-expert, typescript-expert
- Files: tests/
- Scope: tests/

### Description
Sprint 145 gate: vitestFail 3. `npx vitest run 2>&1 | grep -E "FAIL|failed"` ile 3 fail test'i bul, fix et.

Muhtemel adaylar: T-003 event-bus.ts yeni dosya import path, T-002 timeout-estimator.ts (NO_GO'dan kalma partial test).

### Test
- `npx vitest run` exitCode 0 veya fail < 3
- Fail rate < %1

**Kanıt:** Sprint 146 pre-start vitest ≥ %99.28 PASS.

---

## Task 12: Nervous System Preflight — ADR-040 + Types
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Files: src/core/nervous-types.ts, tests/core/nervous-types.test.ts
- Scope: src/core/, tests/core/

### Description
Sprint 147 nervous system zemin.

src/core/nervous-types.ts (~100 LoC placeholder types):
- AuthorityMode, RiskLevel, ApprovalPolicy, Severity, SafetyFloorAction
- NervousNotification, NotificationAction, AuthorityMatrix interfaces

Memory store'a ADR-040 draft `status: 'proposed'` (accept Sprint 147 sonu).

### Test (3 test)
1. AuthorityMode union compile eder
2. NervousNotification structure doğru
3. ADR-040 memory'de var, status: proposed

**Kanıt:** tsc PASS. `store.getByType('adr').filter(a => a.id === 'adr-040')` döner.

---

## Task 13: Sprint 146 Retro Template + Docs Update
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/sprint-log/Sprint-146.md, CHANGELOG.md
- Scope: docs/, ./

### Description
Sprint 146 deliverables dokümantasyonu:
- `docs/sprint-log/Sprint-146.md` — Sprint 146 hedefleri + 17 task deliverables
- `CHANGELOG.md` 0.4.0-beta.2 entry: prompt god template + 3 bug fix + rubric consolidation

### Test
- Sprint-146.md exists, içerik valid
- CHANGELOG.md 0.4.0-beta.2 entry var

**Kanıt:** `grep "0.4.0-beta.2" CHANGELOG.md` → 1+ match.

---

## Task 14: Agent Exclusion Dynamic (Task 2 tamamlayıcı)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-router.ts, src/core/activation-engine.ts, tests/orchestra/agent-exclusion-dynamic.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 145 SDL decision log kanıt: `architecture-planner`, `frontend-designer`, `migration-specialist` her task'ta hard-coded exclude. Yanlış.

getDynamicExclusions() implementation — intent + scope'a dinamik:
- documentation → exclude: migration-specialist, devops-engineer, security-auditor
- src/orchestra/ → exclude: frontend-designer, accessibility-auditor
- src/cli/ → exclude: frontend-designer, accessibility-auditor, migration-specialist
- src/dashboard/ → exclude: data-engineer, migration-specialist
- security task → boş exclusion

### Test (8 test)
1-5. 5 intent+scope kombinasyonunda doğru exclusion
6. Her intent+scope doğru exclusion
7. Eski 3 agent global exclude değil
8. Integration: Sprint 146 senaryo

**Kanıt:** Sprint 146 canlı decision-log'larda exclusion farklı task'larda farklı.

---

## Task 15: Chain Safety Gate Script
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: scripts/chain-gate-check.mjs, tests/scripts/chain-gate.test.ts
- Scope: scripts/, tests/scripts/

### Description
Sprint 145 gate FAILURE (vitestFail 3). Sprint 146 sıkı gate script'i.

Checks: tsc, vitest (fail < 3), doctor (≥ 90), cost (< $95), NO_GO (≤ 2), prompt_linter (avg ≥ 75). Exit code 0 hepsi PASS.

### Test (6 test)
1-6. Her check doğru threshold

**Kanıt:** `node scripts/chain-gate-check.mjs` Sprint 146 sonrası GO döner.

---

## Task 16: Sprint 146 Living Record Update (FINAL-EXECUTIVE-REPORT.md)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md
- Scope: docs/audits/

### Description
Sprint 145 inline güncelleme pattern'i Sprint 146 için. Section 1 (tema) + Section 5 (roadmap Sprint 147-150) + Section 6 (risk register prompt bug'ları closed, nervous system risk'leri open) + Section 8 (acceptance criteria 17 task deliverables) + Section N append.

### Test
- `grep -c "Sprint 146" docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` ≥ 20

**Kanıt:** git diff Section 1/5/6/8 + Section N append.

---

## Task 17: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 Append
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: DECKENT-ANA-PLAN-TR.md, DECKENT-MASTER-BLUEPRINT.md, BETA-TRACKER.md, BETA-TRACKER-TR.md
- Scope: ./

### Description
4 doc'a Sprint 146 bölümü append:
- Teması (prompt god template reform)
- 17 task özet
- Deliverables + bug fix'ler
- Sprint 147 preview (nervous system)

ANA-PLAN-TR + MASTER-BLUEPRINT (EN) parity. BETA-TRACKER EN+TR 5-gün roadmap Sprint 145 ✅ Sprint 146 aktif Sprint 147-150 planlandı.

### Test
- 4 doc'ta "Sprint 146" geçer
- 4 doc'ta "nervous system" preview

**Kanıt:** `grep -l "Sprint 146" DECKENT-ANA-PLAN-TR.md DECKENT-MASTER-BLUEPRINT.md BETA-TRACKER.md BETA-TRACKER-TR.md` → 4 dosya.

---

## Bağımlılık Zinciri

```
Wave 1 (paralel, foundation): T1 + T2 + T3 + T4
Wave 2 (paralel, build):      T5 ← {T2,T3,T4} | T6 ← {T3,T5} | T7
Wave 3 (paralel, bug fix):    T8 + T9 + T10
Wave 4 (paralel, preflight):  T11 + T12 + T13
Wave 5 (paralel, integrate):  T14 ← T2 | T15
Wave 6 (paralel, doc):        T16 + T17
```

## Sprint Gate (Chain Safety)
1. doctor ≥ 90/100
2. tsc PASS
3. vitest ≥ %99.3 pass
4. cost < $95
5. NO_GO ≤ 2
6. prompt_linter avg ≥ 75/100

## Sprint 146 Self-Modifying Uyarısı
Deckent kendi src/'sini değiştiriyor. Koordinatör disiplin:
- Sprint canlı iken src/ müdahale YASAK (Sprint 144/145 lesson)
- Monitor 15-30s, izlem-only
- Task 8 canlı olunca DIRECTIVES.md mid-sprint korunacak

## Sprint 147 Yolu
Sprint 146 başarılı kapanış kriterleri:
- Prompt kalite ortalama ≥ 75/100 (linter pass)
- DIRECTIVES mid-sprint korumalı
- SDL log meaningful
- Agent exclusion dinamik
- Worker prompt rubric spec yok
- vitest ≥ %99.3
- ADR-040 draft kayıtlı
- Types placeholder Sprint 147 için hazır

**Beta GA yolu:** Sprint 146 (bugün) → Sprint 147 (Sal) → Sprint 148 (Çar) → Sprint 149 (Çar-Per) → Sprint 150 (Per 🚀 GA)
