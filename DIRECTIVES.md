# DIRECTIVES — Sprint 140: Deckent Self-Analysis Ayna Sprint (Explicit 409 Task)

> Sprint 140 tamamen yeniden tasarlandı (Alperen direktifi 2026-04-15). Orijinal "Operasyonel Disiplin + Recovery Mechanisms" planı Sprint 141'e ertelendi. Sprint 140 = **Deckent kendi kendini her dosya olarak tam analiz eder, raporlar, brain tek kapsamlı final rapor üretir.**
>
> **Bu DIRECTIVES.md CC tarafından script ile üretildi (Seçenek 4, 2026-04-15 13:45).** 409 explicit task: 331 src per-file + 28 tests per-category + 14 docs per-category + 1 root md + 15 .brain/ per-file + 5 config/scripts + 15 meta-analysis + 1 final aggregation. AI mode provider bootstrap fail nedeniyle explicit task regen tercih edildi.

## Referanslar
- Sprint 140 preflight memory: `project_sprint140_selfanalysis.md`
- Sprint 141 preflight memory (orijinal Sprint 140 plan): `project_sprint141_preflight.md`
- Sprint 139 manuel scorecard: `.deckent/sprint-139-layer3-scorecard.md`
- Kill approval kuralı (MUTLAK): `feedback_deckent_kill_approval_required.md`
- Brain memory limit artırımları: `src/core/constants.ts` (MEMORY 1500, budget 5000, decay 20)

## Goal

**Deckent kendi kendini tanısın.** Her TypeScript dosyası, her test kategori, her doküman, her markdown, her config, her .brain/ dosyası paralel worker'lar tarafından read-only analiz edilir. Her worker kendi rapor dosyasına yazar, birbirinin işine girmez. Brain finalize phase'de tüm raporları toplayıp **tek kapsamlı final rapor** üretir (`.deckent/sprint-140-analysis/FINAL-REPORT.md`). Hiçbir dosya okunmamış kalmayacak. Test çalıştırılmayacak, commit yapılmayacak.

**Total: 409 task, 12h hard cap**

## Kurallar (MUTLAK)

1. **READ-ONLY:** Worker'lar hiçbir kaynak dosya değiştirmez. Kaynak kod mutasyonu → NO_GO + alarm
2. **Test çalıştırma YASAK:** `tsc --noEmit` + `vitest run` worker verify loop'ta devre dışı (`VITEST_SKIP_E2E_SPRINT=1`, `DECKENT_SKIP_VERIFY=1`)
3. **Commit YASAK:** Worker'lar git commit yapmaz, sprint sonunda Alperen elle commit eder
4. **Cross-contamination YOK:** Her worker sadece kendi rapor dosyasına yazar, başka worker'ın raporuna bakmaz
5. **Sink dizin:** Tüm rapor dosyaları `.deckent/sprint-140-analysis/<category>/<name>.md` formatında
6. **TEK final rapor:** Brain finalize'de `.deckent/sprint-140-analysis/FINAL-REPORT.md` (Alperen şart koştu)
7. **Başarısız analiz → flag:** NO_GO worker'ların bıraktığı dosyalar final rapor Section 16'da ayrı listelenir

## Pre-flight Limit Artırımları (CC 2026-04-15, commit c6b21c8)

| Constant | Eski | Yeni |
|----------|------|------|
| `MEMORY_MAX_LINES` | 300 | **1500** (5x) |
| `PATTERNS_MAX_LINES` | 150 | **800** (5.3x) |
| `RETRO_MAX_LINES` | 120 | **400** (3.3x) |
| `SPRINT_LOG_MAX_LINES` | 100 | **500** (5x) |
| `ERRORS_MAX_LINES` | 200 | **600** (3x) |
| `DECISIONS_MAX_LINES` | yok | **1200** (yeni) |
| `BRAIN_TOTAL_LINE_BUDGET` | 900 | **5000** (5.5x) |
| `MEMORY_DECAY_SPRINTS` | 8 | **20** (2.5x) |
| `PATTERN_DECAY_SPRINTS` | 12 | **25** (2x) |
| `.deckent/config.json memory_budget` | 900 | **5000** |
| `.deckent/config.json decay_after_sprints` | 5 | **20** |

## Worker Rapor Formatı (Per-File Task Template)

Her worker `.deckent/sprint-140-analysis/<category>/<file>.md` dosyasına şu template'i yazmalı:

```markdown
# Analysis: <file-path>

**Task ID:** 140-XXX
**Worker:** <worker-id>
**Analysis date:** 2026-04-XX
**File type:** TypeScript | Test | Markdown | JSON | ...
**LoC:** <number>

## 1. Amacı (1-2 cümle)
## 2. Public API (export'lar + type signatures)
## 3. Iç Bağımlılıklar (dosya içi import'lar)
## 4. Dış Bağımlılıklar (node_modules import'ları)
## 5. Complexity Metrics (fonksiyon sayısı, cyclomatic rough)
## 6. Type Safety Issues (any, @ts-ignore, non-null, as unknown)
## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-037 RBAC, ADR-039 self-modifying)
## 8. Test Coverage (src/X.ts → tests/X.test.ts var mı?)
## 9. TODO/FIXME/HACK Comments (inventory)
## 10. Documentation Coverage (JSDoc var mı?)
## 11. Dead Code Candidates (unused export?)
## 12. Security Findings (input validation, secret, OWASP)
## 13. Öneriler (Sprint 141+ iyileştirme input'ları)
## 14. Verdict: ANALYZED | PARTIAL | UNREADABLE
```

## Task Kategorileri Özeti (409 task)

| Kategori | Task Range | Count | Açıklama |
|----------|-----------|-------|----------|
| 1. src/ per-file (tümü, dashboard dahil) | 140-001..140-331 | 331 | 287 non-dashboard + 44 dashboard React TS |
| 2. tests/ per-category | 140-332..140-359 | 28 | 27 test kategori klasörü (batch analiz) |
| 3. docs/ per-category | 140-360..140-373 | 14 | 13 doc üst dizin + 1 root MD |
| 4. .brain/ per-file | 140-375..140-389 | 15 | DECISIONS + MEMORY + RETRO + DEBT + PATTERNS + ERRORS + sprints/archive |
| 5. Root config + scripts + rules | 140-390..140-394 | 5 | JSON config + scripts/ + .deckent config + .claude/rules + contracts |
| 6. Meta-analysis cross-cutting | 140-396..140-410 | 15 | Architecture graph + dead code + ADR compliance + security + coverage + type safety + i18n + etc. |
| 7. Final aggregation | 140-411 | 1 | **FINAL-REPORT.md** — tek kapsamlı Alperen rapor |

**NOT:** Task ID 140-374 ve 140-395 script counter'da atlandı (fonksiyonel boşluk yok, 409 valid task). Wave layout aşağıda.

## Wave Layout (Sprint 140 Plan-Time Recommendation)

**Wave 1 — src/ Per-File Analysis (331 task, paralel):**
Task 140-001..140-331. max_workers=3, ~110 batch × ~5dk = ~9 saat. Ancak görevler tamamen bağımsız (her dosya ayrı), worker throughput yüksek. Gerçek süre: ~2-3 saat.

**Wave 2 — tests/ Per-Category (28 task, paralel):**
Task 140-332..140-359. ~10 batch × ~3dk = ~30 dk.

**Wave 3 — docs/ + .brain/ + config (34 task, paralel):**
Task 140-360..140-395 (minus gaps). ~12 batch × ~3dk = ~35 dk.

**Wave 4 — Meta-Analysis Cross-Cutting (15 task, paralel, Wave 1+2+3 tamamlanmış olmalı):**
Task 140-396..140-410. Bu task'lar tüm src/tests/docs'u scan eder, Wave 1+2+3 hazır olmalı. ~5 batch × ~15dk = ~75 dk.

**Wave 5 — Final Aggregation (1 task, serial):**
Task 140-411. TÜM diğer task'lar bağımlı (worker report'lar `.deckent/sprint-140-analysis/` altında olmalı). opus + high effort. ~90-120 dk.

**Toplam tahmini süre:** 5-7 saat (12 saat hard cap altında rahat)

## Hedef Metrikleri

| Metrik | Hedef |
|--------|-------|
| Task sayısı | **409** |
| Task throughput | ≥%98 |
| Read-only violation | **0** |
| Dosya coverage | **%100** (hiçbir dosya okunmamış kalmamalı) |
| Final aggregated report | **1 adet** (FINAL-REPORT.md ≥2000 satır) |
| Worker report files | ~409 adet (task başına 1 rapor) |
| Süre hard cap | **12 saat** |
| Commit count | **0** |
| MCP stability | 2+ saat kopma yok |
| Zero manual recovery | ✅ (panic kill YOK) |

## Koordinatör Commitment (Sprint 139 Lesson)

Sprint 139 ilk 3 dakikasındaki panic kill incident **Sprint 140'ta kesinlikle tekrar olmayacak**. Pre-flight ilk 10 dakika sadece gözlem, 2-3 task DONE beklenir, routing hipotezi yapılmaz. `deckent_kill/cleanup/docker stop/rm .tasks/*` onaysız YASAK, istisnasız. Sprint 140 read-only olduğu için kill ihtiyacı çok daha az olacak.

---

# EXPLICIT TASK DEFINITIONS (409 TASK)


## Task 140-001: src/agents/adaptive-agent.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/adaptive-agent.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/adaptive-agent.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/adaptive-agent.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/adaptive-agent.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-002: src/agents/agent-genealogy.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/agent-genealogy.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/agent-genealogy.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/agent-genealogy.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/agent-genealogy.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-003: src/agents/agent-retirement.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/agent-retirement.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/agent-retirement.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/agent-retirement.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/agent-retirement.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-004: src/agents/cross-sprint-analyzer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/cross-sprint-analyzer.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/cross-sprint-analyzer.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/cross-sprint-analyzer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/cross-sprint-analyzer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-005: src/agents/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/index.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/index.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-006: src/agents/permission-guard.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/permission-guard.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/permission-guard.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/permission-guard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/permission-guard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-007: src/agents/prompt-ab-test.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/prompt-ab-test.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/prompt-ab-test.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/prompt-ab-test.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/prompt-ab-test.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-008: src/agents/prompt-analytics.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/prompt-analytics.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/prompt-analytics.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/prompt-analytics.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/prompt-analytics.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-009: src/agents/prompt-evolution.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/prompt-evolution.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/prompt-evolution.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/prompt-evolution.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/prompt-evolution.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-010: src/agents/prompt-metrics.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/prompt-metrics.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/prompt-metrics.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/prompt-metrics.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/prompt-metrics.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-011: src/agents/prompt-rollback.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/prompt-rollback.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/prompt-rollback.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/prompt-rollback.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/prompt-rollback.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-012: src/agents/prompt-version.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/prompt-version.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/prompt-version.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/prompt-version.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/prompt-version.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-013: src/agents/shared-context.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/shared-context.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/shared-context.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/shared-context.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/shared-context.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-014: src/agents/specialization-drift.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/specialization-drift.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/specialization-drift.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/specialization-drift.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/specialization-drift.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-015: src/agents/worker-ipc.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/worker-ipc.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/worker-ipc.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/worker-ipc.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/worker-ipc.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-016: src/agents/worker.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/agents/worker.ts
- Scope: src/agents

### Description

Read-only analysis of `src/agents/worker.ts`. Write report to `.deckent/sprint-140-analysis/src/agents/worker.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/agents/worker.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-017: src/api/auth.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/api/auth.ts
- Scope: src/api

### Description

Read-only analysis of `src/api/auth.ts`. Write report to `.deckent/sprint-140-analysis/src/api/auth.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/api/auth.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-018: src/api/rate-limiter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/api/rate-limiter.ts
- Scope: src/api

### Description

Read-only analysis of `src/api/rate-limiter.ts`. Write report to `.deckent/sprint-140-analysis/src/api/rate-limiter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/api/rate-limiter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-019: src/api/server.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/api/server.ts
- Scope: src/api

### Description

Read-only analysis of `src/api/server.ts`. Write report to `.deckent/sprint-140-analysis/src/api/server.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/api/server.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-020: src/api/watcher.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/api/watcher.ts
- Scope: src/api

### Description

Read-only analysis of `src/api/watcher.ts`. Write report to `.deckent/sprint-140-analysis/src/api/watcher.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/api/watcher.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-021: src/cli/auto-setup.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/auto-setup.ts
- Scope: src/cli

### Description

Read-only analysis of `src/cli/auto-setup.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/auto-setup.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/auto-setup.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-022: src/cli/commands/agent.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/agent.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/agent.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/agent.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/agent.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-023: src/cli/commands/analyze.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/analyze.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/analyze.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/analyze.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/analyze.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-024: src/cli/commands/archive-debt.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/archive-debt.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/archive-debt.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/archive-debt.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/archive-debt.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-025: src/cli/commands/attach.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/attach.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/attach.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/attach.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/attach.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-026: src/cli/commands/checkpoint.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/checkpoint.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/checkpoint.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/checkpoint.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/checkpoint.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-027: src/cli/commands/cleanup.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/cleanup.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/cleanup.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/cleanup.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/cleanup.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-028: src/cli/commands/config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/config.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/config.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-029: src/cli/commands/dashboard.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/dashboard.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/dashboard.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/dashboard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/dashboard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-030: src/cli/commands/docs.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/docs.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/docs.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/docs.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/docs.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-031: src/cli/commands/doctor.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/doctor.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/doctor.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/doctor.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/doctor.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-032: src/cli/commands/explain.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/explain.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/explain.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/explain.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/explain.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-033: src/cli/commands/finalize.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/finalize.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/finalize.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/finalize.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/finalize.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-034: src/cli/commands/heartbeat.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/heartbeat.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/heartbeat.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/heartbeat.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/heartbeat.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-035: src/cli/commands/history.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/history.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/history.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/history.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/history.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-036: src/cli/commands/init.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/init.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/init.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/init.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-037: src/cli/commands/kill.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/kill.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/kill.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/kill.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/kill.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-038: src/cli/commands/onboard.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/onboard.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/onboard.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/onboard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/onboard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-039: src/cli/commands/output.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/output.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/output.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/output.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/output.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-040: src/cli/commands/plan.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/plan.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/plan.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/plan.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/plan.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-041: src/cli/commands/plugin.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/plugin.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/plugin.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/plugin.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/plugin.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-042: src/cli/commands/quick-start.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/quick-start.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/quick-start.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/quick-start.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/quick-start.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-043: src/cli/commands/resume.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/resume.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/resume.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/resume.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/resume.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-044: src/cli/commands/retro.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/retro.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/retro.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/retro.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/retro.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-045: src/cli/commands/review.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/review.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/review.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/review.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/review.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-046: src/cli/commands/run.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/run.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/run.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/run.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/run.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-047: src/cli/commands/serve.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/serve.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/serve.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/serve.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/serve.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-048: src/cli/commands/set-directives.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/set-directives.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/set-directives.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/set-directives.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/set-directives.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-049: src/cli/commands/skill-marketplace.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/skill-marketplace.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/skill-marketplace.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/skill-marketplace.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/skill-marketplace.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-050: src/cli/commands/skill.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/skill.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/skill.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/skill.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/skill.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-051: src/cli/commands/spawn.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/spawn.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/spawn.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/spawn.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/spawn.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-052: src/cli/commands/start.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/start.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/start.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/start.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/start.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-053: src/cli/commands/status.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/status.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/status.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/status.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/status.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-054: src/cli/commands/sync.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/sync.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/sync.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/sync.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/sync.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-055: src/cli/commands/test-run.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/test-run.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/test-run.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/test-run.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/test-run.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-056: src/cli/commands/upgrade.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/upgrade.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/upgrade.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/upgrade.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/upgrade.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-057: src/cli/commands/watch.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/watch.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/watch.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/watch.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/watch.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-058: src/cli/commands/web.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/web.ts
- Scope: src/cli/commands

### Description

Read-only analysis of `src/cli/commands/web.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/commands/web.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/commands/web.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-059: src/cli/entry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/entry.ts
- Scope: src/cli

### Description

Read-only analysis of `src/cli/entry.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/entry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/entry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-060: src/cli/helpers/agent-performance.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/agent-performance.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/agent-performance.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/agent-performance.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/agent-performance.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-061: src/cli/helpers/agent-templates.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/agent-templates.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/agent-templates.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/agent-templates.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/agent-templates.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-062: src/cli/helpers/change-categorizer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/change-categorizer.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/change-categorizer.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/change-categorizer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/change-categorizer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-063: src/cli/helpers/codex-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/codex-config.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/codex-config.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/codex-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/codex-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-064: src/cli/helpers/config-reader.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/config-reader.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/config-reader.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/config-reader.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/config-reader.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-065: src/cli/helpers/cursor-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/cursor-config.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/cursor-config.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/cursor-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/cursor-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-066: src/cli/helpers/error-handler.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/error-handler.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/error-handler.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/error-handler.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/error-handler.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-067: src/cli/helpers/eta-calculator.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/eta-calculator.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/eta-calculator.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/eta-calculator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/eta-calculator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-068: src/cli/helpers/gemini-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/gemini-config.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/gemini-config.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/gemini-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/gemini-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-069: src/cli/helpers/hints.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/hints.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/hints.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/hints.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/hints.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-070: src/cli/helpers/messages.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/messages.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/messages.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/messages.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/messages.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-071: src/cli/helpers/output-mode.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/output-mode.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/output-mode.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/output-mode.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/output-mode.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-072: src/cli/helpers/output.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/output.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/output.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/output.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/output.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-073: src/cli/helpers/process.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/process.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/process.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/process.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/process.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-074: src/cli/helpers/progress-persistence.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/progress-persistence.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/progress-persistence.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/progress-persistence.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/progress-persistence.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-075: src/cli/helpers/progress.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/progress.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/progress.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/progress.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/progress.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-076: src/cli/helpers/prompt.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/prompt.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/prompt.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/prompt.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/prompt.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-077: src/cli/helpers/queue-display.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/queue-display.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/queue-display.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/queue-display.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/queue-display.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-078: src/cli/helpers/recommendations.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/recommendations.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/recommendations.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/recommendations.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/recommendations.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-079: src/cli/helpers/review-actions.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/review-actions.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/review-actions.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/review-actions.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/review-actions.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-080: src/cli/helpers/review-summary.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/review-summary.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/review-summary.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/review-summary.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/review-summary.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-081: src/cli/helpers/selective-retry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/selective-retry.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/selective-retry.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/selective-retry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/selective-retry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-082: src/cli/helpers/splash.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/splash.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/splash.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/splash.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/splash.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-083: src/cli/helpers/sprint-comparison.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/sprint-comparison.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/sprint-comparison.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/sprint-comparison.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/sprint-comparison.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-084: src/cli/helpers/sprint-summary-rich.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/sprint-summary-rich.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/sprint-summary-rich.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/sprint-summary-rich.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/sprint-summary-rich.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-085: src/cli/helpers/sprint-summary.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/sprint-summary.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/sprint-summary.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/sprint-summary.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/sprint-summary.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-086: src/cli/helpers/terminal-utils.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/terminal-utils.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/terminal-utils.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/terminal-utils.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/terminal-utils.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-087: src/cli/helpers/theme.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/theme.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/theme.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/theme.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/theme.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-088: src/cli/helpers/wizard.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/wizard.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/wizard.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/wizard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/wizard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-089: src/cli/helpers/worker-status.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/worker-status.ts
- Scope: src/cli/helpers

### Description

Read-only analysis of `src/cli/helpers/worker-status.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/helpers/worker-status.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/helpers/worker-status.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-090: src/cli/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/index.ts
- Scope: src/cli

### Description

Read-only analysis of `src/cli/index.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-091: src/cli/version-info.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/version-info.ts
- Scope: src/cli

### Description

Read-only analysis of `src/cli/version-info.ts`. Write report to `.deckent/sprint-140-analysis/src/cli/version-info.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/cli/version-info.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-092: src/core/activation-engine.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/activation-engine.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/activation-engine.ts`. Write report to `.deckent/sprint-140-analysis/src/core/activation-engine.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/activation-engine.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-093: src/core/agent-cache.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/agent-cache.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/agent-cache.ts`. Write report to `.deckent/sprint-140-analysis/src/core/agent-cache.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/agent-cache.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-094: src/core/agent-pool.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/agent-pool.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/agent-pool.ts`. Write report to `.deckent/sprint-140-analysis/src/core/agent-pool.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/agent-pool.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-095: src/core/agent-selector.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/agent-selector.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/agent-selector.ts`. Write report to `.deckent/sprint-140-analysis/src/core/agent-selector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/agent-selector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-096: src/core/agent-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/agent-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/agent-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/agent-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/agent-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-097: src/core/analyzer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/analyzer.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/analyzer.ts`. Write report to `.deckent/sprint-140-analysis/src/core/analyzer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/analyzer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-098: src/core/ci-learning.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/ci-learning.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/ci-learning.ts`. Write report to `.deckent/sprint-140-analysis/src/core/ci-learning.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/ci-learning.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-099: src/core/condition-evaluator.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/condition-evaluator.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/condition-evaluator.ts`. Write report to `.deckent/sprint-140-analysis/src/core/condition-evaluator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/condition-evaluator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-100: src/core/config-migration.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/config-migration.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/config-migration.ts`. Write report to `.deckent/sprint-140-analysis/src/core/config-migration.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/config-migration.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-101: src/core/config-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/config-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/config-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/config-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/config-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-102: src/core/config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/config.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/config.ts`. Write report to `.deckent/sprint-140-analysis/src/core/config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-103: src/core/constants.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/constants.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/constants.ts`. Write report to `.deckent/sprint-140-analysis/src/core/constants.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/constants.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-104: src/core/credential-encryption.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/credential-encryption.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/credential-encryption.ts`. Write report to `.deckent/sprint-140-analysis/src/core/credential-encryption.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/credential-encryption.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-105: src/core/credentials.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/credentials.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/credentials.ts`. Write report to `.deckent/sprint-140-analysis/src/core/credentials.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/credentials.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-106: src/core/decision-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/decision-config.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/decision-config.ts`. Write report to `.deckent/sprint-140-analysis/src/core/decision-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/decision-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-107: src/core/decision-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/decision-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/decision-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/decision-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/decision-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-108: src/core/deck-file.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/deck-file.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/deck-file.ts`. Write report to `.deckent/sprint-140-analysis/src/core/deck-file.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/deck-file.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-109: src/core/environment.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/environment.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/environment.ts`. Write report to `.deckent/sprint-140-analysis/src/core/environment.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/environment.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-110: src/core/errors.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/errors.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/errors.ts`. Write report to `.deckent/sprint-140-analysis/src/core/errors.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/errors.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-111: src/core/file-lock.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/file-lock.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/file-lock.ts`. Write report to `.deckent/sprint-140-analysis/src/core/file-lock.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/file-lock.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-112: src/core/global-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/global-config.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/global-config.ts`. Write report to `.deckent/sprint-140-analysis/src/core/global-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/global-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-113: src/core/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/index.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/index.ts`. Write report to `.deckent/sprint-140-analysis/src/core/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-114: src/core/intent-classifier.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/intent-classifier.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/intent-classifier.ts`. Write report to `.deckent/sprint-140-analysis/src/core/intent-classifier.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/intent-classifier.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-115: src/core/lazy-loader.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/lazy-loader.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/lazy-loader.ts`. Write report to `.deckent/sprint-140-analysis/src/core/lazy-loader.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/lazy-loader.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-116: src/core/manifest-migrator.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/manifest-migrator.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/manifest-migrator.ts`. Write report to `.deckent/sprint-140-analysis/src/core/manifest-migrator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/manifest-migrator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-117: src/core/marketplace/dependency-resolver.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/marketplace/dependency-resolver.ts
- Scope: src/core/marketplace

### Description

Read-only analysis of `src/core/marketplace/dependency-resolver.ts`. Write report to `.deckent/sprint-140-analysis/src/core/marketplace/dependency-resolver.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/marketplace/dependency-resolver.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-118: src/core/marketplace/marketplace-auth.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/marketplace/marketplace-auth.ts
- Scope: src/core/marketplace

### Description

Read-only analysis of `src/core/marketplace/marketplace-auth.ts`. Write report to `.deckent/sprint-140-analysis/src/core/marketplace/marketplace-auth.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/marketplace/marketplace-auth.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-119: src/core/marketplace/rating-system.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/marketplace/rating-system.ts
- Scope: src/core/marketplace

### Description

Read-only analysis of `src/core/marketplace/rating-system.ts`. Write report to `.deckent/sprint-140-analysis/src/core/marketplace/rating-system.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/marketplace/rating-system.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-120: src/core/marketplace/registry-client.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/marketplace/registry-client.ts
- Scope: src/core/marketplace

### Description

Read-only analysis of `src/core/marketplace/registry-client.ts`. Write report to `.deckent/sprint-140-analysis/src/core/marketplace/registry-client.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/marketplace/registry-client.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-121: src/core/marketplace/skill-sandbox.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/marketplace/skill-sandbox.ts
- Scope: src/core/marketplace

### Description

Read-only analysis of `src/core/marketplace/skill-sandbox.ts`. Write report to `.deckent/sprint-140-analysis/src/core/marketplace/skill-sandbox.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/marketplace/skill-sandbox.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-122: src/core/mode-presets.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/mode-presets.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/mode-presets.ts`. Write report to `.deckent/sprint-140-analysis/src/core/mode-presets.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/mode-presets.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-123: src/core/model-equivalence.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/model-equivalence.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/model-equivalence.ts`. Write report to `.deckent/sprint-140-analysis/src/core/model-equivalence.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/model-equivalence.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-124: src/core/model-registry.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/model-registry.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/model-registry.ts`. Write report to `.deckent/sprint-140-analysis/src/core/model-registry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/model-registry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-125: src/core/monitoring-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/monitoring-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/monitoring-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/monitoring-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/monitoring-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-126: src/core/multi-ide.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/multi-ide.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/multi-ide.ts`. Write report to `.deckent/sprint-140-analysis/src/core/multi-ide.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/multi-ide.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-127: src/core/notification-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notification-config.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/notification-config.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notification-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notification-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-128: src/core/notification-dispatcher.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notification-dispatcher.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/notification-dispatcher.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notification-dispatcher.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notification-dispatcher.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-129: src/core/notification-providers/discord.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notification-providers/discord.ts
- Scope: src/core/notification-providers

### Description

Read-only analysis of `src/core/notification-providers/discord.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notification-providers/discord.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notification-providers/discord.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-130: src/core/notification-providers/slack.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notification-providers/slack.ts
- Scope: src/core/notification-providers

### Description

Read-only analysis of `src/core/notification-providers/slack.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notification-providers/slack.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notification-providers/slack.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-131: src/core/notification-providers/webhook.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notification-providers/webhook.ts
- Scope: src/core/notification-providers

### Description

Read-only analysis of `src/core/notification-providers/webhook.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notification-providers/webhook.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notification-providers/webhook.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-132: src/core/notifications.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notifications.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/notifications.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notifications.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notifications.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-133: src/core/notify-adapters/cli-adapter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notify-adapters/cli-adapter.ts
- Scope: src/core/notify-adapters

### Description

Read-only analysis of `src/core/notify-adapters/cli-adapter.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notify-adapters/cli-adapter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notify-adapters/cli-adapter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-134: src/core/notify-adapters/mcp-adapter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/notify-adapters/mcp-adapter.ts
- Scope: src/core/notify-adapters

### Description

Read-only analysis of `src/core/notify-adapters/mcp-adapter.ts`. Write report to `.deckent/sprint-140-analysis/src/core/notify-adapters/mcp-adapter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/notify-adapters/mcp-adapter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-135: src/core/observability.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/observability.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/observability.ts`. Write report to `.deckent/sprint-140-analysis/src/core/observability.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/observability.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-136: src/core/output-collector.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/output-collector.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/output-collector.ts`. Write report to `.deckent/sprint-140-analysis/src/core/output-collector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/output-collector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-137: src/core/output-formatter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/output-formatter.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/output-formatter.ts`. Write report to `.deckent/sprint-140-analysis/src/core/output-formatter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/output-formatter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-138: src/core/plugin-hooks.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/plugin-hooks.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/plugin-hooks.ts`. Write report to `.deckent/sprint-140-analysis/src/core/plugin-hooks.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/plugin-hooks.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-139: src/core/plugin-loader.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/plugin-loader.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/plugin-loader.ts`. Write report to `.deckent/sprint-140-analysis/src/core/plugin-loader.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/plugin-loader.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-140: src/core/plugin.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/plugin.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/plugin.ts`. Write report to `.deckent/sprint-140-analysis/src/core/plugin.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/plugin.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-141: src/core/provider-capabilities.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/provider-capabilities.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/provider-capabilities.ts`. Write report to `.deckent/sprint-140-analysis/src/core/provider-capabilities.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/provider-capabilities.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-142: src/core/provider.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/provider.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/provider.ts`. Write report to `.deckent/sprint-140-analysis/src/core/provider.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/provider.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-143: src/core/routing-engine.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/routing-engine.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/routing-engine.ts`. Write report to `.deckent/sprint-140-analysis/src/core/routing-engine.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/routing-engine.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-144: src/core/routing-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/routing-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/routing-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/routing-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/routing-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-145: src/core/skill-cache.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/skill-cache.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/skill-cache.ts`. Write report to `.deckent/sprint-140-analysis/src/core/skill-cache.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/skill-cache.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-146: src/core/skill-pool.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/skill-pool.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/skill-pool.ts`. Write report to `.deckent/sprint-140-analysis/src/core/skill-pool.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/skill-pool.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-147: src/core/skill-registry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/skill-registry.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/skill-registry.ts`. Write report to `.deckent/sprint-140-analysis/src/core/skill-registry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/skill-registry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-148: src/core/skill-selector.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/skill-selector.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/skill-selector.ts`. Write report to `.deckent/sprint-140-analysis/src/core/skill-selector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/skill-selector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-149: src/core/skill-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/skill-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/skill-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/skill-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/skill-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-150: src/core/sprint-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/sprint-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/sprint-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/sprint-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/sprint-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-151: src/core/stack-detector.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/stack-detector.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/stack-detector.ts`. Write report to `.deckent/sprint-140-analysis/src/core/stack-detector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/stack-detector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-152: src/core/subscription.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/subscription.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/subscription.ts`. Write report to `.deckent/sprint-140-analysis/src/core/subscription.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/subscription.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-153: src/core/system-profile.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/system-profile.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/system-profile.ts`. Write report to `.deckent/sprint-140-analysis/src/core/system-profile.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/system-profile.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-154: src/core/task-types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/task-types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/task-types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/task-types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/task-types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-155: src/core/telemetry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/telemetry.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/telemetry.ts`. Write report to `.deckent/sprint-140-analysis/src/core/telemetry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/telemetry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-156: src/core/token-counter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/token-counter.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/token-counter.ts`. Write report to `.deckent/sprint-140-analysis/src/core/token-counter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/token-counter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-157: src/core/types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/types.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/types.ts`. Write report to `.deckent/sprint-140-analysis/src/core/types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-158: src/core/utils.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/utils.ts
- Scope: src/core

### Description

Read-only analysis of `src/core/utils.ts`. Write report to `.deckent/sprint-140-analysis/src/core/utils.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/core/utils.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-159: src/extensions/vscode/extension.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/extensions/vscode/extension.ts
- Scope: src/extensions/vscode

### Description

Read-only analysis of `src/extensions/vscode/extension.ts`. Write report to `.deckent/sprint-140-analysis/src/extensions/vscode/extension.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/extensions/vscode/extension.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-160: src/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/index.ts
- Scope: src

### Description

Read-only analysis of `src/index.ts`. Write report to `.deckent/sprint-140-analysis/src/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-161: src/mcp/helpers/enrich.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/helpers/enrich.ts
- Scope: src/mcp/helpers

### Description

Read-only analysis of `src/mcp/helpers/enrich.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/helpers/enrich.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/helpers/enrich.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-162: src/mcp/helpers/format.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/helpers/format.ts
- Scope: src/mcp/helpers

### Description

Read-only analysis of `src/mcp/helpers/format.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/helpers/format.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/helpers/format.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-163: src/mcp/helpers/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/helpers/index.ts
- Scope: src/mcp/helpers

### Description

Read-only analysis of `src/mcp/helpers/index.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/helpers/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/helpers/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-164: src/mcp/resources/agents.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/agents.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/agents.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/agents.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/agents.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-165: src/mcp/resources/config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/config.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/config.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-166: src/mcp/resources/dashboard.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/dashboard.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/dashboard.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/dashboard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/dashboard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-167: src/mcp/resources/debt.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/debt.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/debt.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/debt.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/debt.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-168: src/mcp/resources/directives.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/directives.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/directives.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/directives.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/directives.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-169: src/mcp/resources/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/index.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/index.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-170: src/mcp/resources/memory.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/memory.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/memory.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/memory.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/memory.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-171: src/mcp/resources/retro.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/retro.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/retro.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/retro.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/retro.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-172: src/mcp/resources/tasks.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/tasks.ts
- Scope: src/mcp/resources

### Description

Read-only analysis of `src/mcp/resources/tasks.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/resources/tasks.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/resources/tasks.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-173: src/mcp/server.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/server.ts
- Scope: src/mcp

### Description

Read-only analysis of `src/mcp/server.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/server.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/server.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-174: src/mcp/tools/agent-list.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/agent-list.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/agent-list.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/agent-list.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/agent-list.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-175: src/mcp/tools/analyze.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/analyze.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/analyze.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/analyze.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/analyze.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-176: src/mcp/tools/checkpoint.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/checkpoint.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/checkpoint.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/checkpoint.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/checkpoint.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-177: src/mcp/tools/cleanup.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/cleanup.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/cleanup.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/cleanup.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/cleanup.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-178: src/mcp/tools/config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/config.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/config.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-179: src/mcp/tools/directives.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/directives.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/directives.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/directives.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/directives.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-180: src/mcp/tools/docs.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/docs.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/docs.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/docs.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/docs.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-181: src/mcp/tools/doctor.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/doctor.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/doctor.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/doctor.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/doctor.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-182: src/mcp/tools/explain.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/explain.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/explain.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/explain.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/explain.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-183: src/mcp/tools/help.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/help.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/help.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/help.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/help.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-184: src/mcp/tools/history.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/history.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/history.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/history.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/history.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-185: src/mcp/tools/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/index.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/index.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-186: src/mcp/tools/init.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/init.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/init.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/init.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/init.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-187: src/mcp/tools/job-runner.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/job-runner.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/job-runner.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/job-runner.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/job-runner.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-188: src/mcp/tools/kill.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/kill.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/kill.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/kill.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/kill.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-189: src/mcp/tools/plan.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/plan.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/plan.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/plan.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/plan.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-190: src/mcp/tools/retro.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/retro.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/retro.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/retro.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/retro.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-191: src/mcp/tools/review.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/review.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/review.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/review.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/review.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-192: src/mcp/tools/run.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/run.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/run.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/run.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/run.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-193: src/mcp/tools/skill-list.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/skill-list.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/skill-list.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/skill-list.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/skill-list.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-194: src/mcp/tools/start.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/start.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/start.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/start.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/start.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-195: src/mcp/tools/status.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/status.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/status.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/status.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/status.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-196: src/mcp/tools/sync.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/sync.ts
- Scope: src/mcp/tools

### Description

Read-only analysis of `src/mcp/tools/sync.ts`. Write report to `.deckent/sprint-140-analysis/src/mcp/tools/sync.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/mcp/tools/sync.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-197: src/monitor/auditor.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/monitor/auditor.ts
- Scope: src/monitor

### Description

Read-only analysis of `src/monitor/auditor.ts`. Write report to `.deckent/sprint-140-analysis/src/monitor/auditor.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/monitor/auditor.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-198: src/monitor/dashboard-manager.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/monitor/dashboard-manager.ts
- Scope: src/monitor

### Description

Read-only analysis of `src/monitor/dashboard-manager.ts`. Write report to `.deckent/sprint-140-analysis/src/monitor/dashboard-manager.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/monitor/dashboard-manager.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-199: src/monitor/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/monitor/index.ts
- Scope: src/monitor

### Description

Read-only analysis of `src/monitor/index.ts`. Write report to `.deckent/sprint-140-analysis/src/monitor/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/monitor/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-200: src/monitor/sprint-state.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/monitor/sprint-state.ts
- Scope: src/monitor

### Description

Read-only analysis of `src/monitor/sprint-state.ts`. Write report to `.deckent/sprint-140-analysis/src/monitor/sprint-state.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/monitor/sprint-state.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-201: src/orchestra/authority-enforcer.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/authority-enforcer.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/authority-enforcer.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/authority-enforcer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/authority-enforcer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-202: src/orchestra/baseline-tracker.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/baseline-tracker.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/baseline-tracker.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/baseline-tracker.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/baseline-tracker.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-203: src/orchestra/batch-stats.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/batch-stats.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/batch-stats.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/batch-stats.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/batch-stats.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-204: src/orchestra/brain-context.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/brain-context.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/brain-context.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/brain-context.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/brain-context.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-205: src/orchestra/brain.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/brain.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/brain.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/brain.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/brain.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-206: src/orchestra/ci-reporter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/ci-reporter.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/ci-reporter.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/ci-reporter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/ci-reporter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-207: src/orchestra/conflict-resolver.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/conflict-resolver.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/conflict-resolver.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/conflict-resolver.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/conflict-resolver.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-208: src/orchestra/connector.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/connector.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/connector.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/connector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/connector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-209: src/orchestra/coverage-validator.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/coverage-validator.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/coverage-validator.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/coverage-validator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/coverage-validator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-210: src/orchestra/debt-manager.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/debt-manager.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/debt-manager.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/debt-manager.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/debt-manager.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-211: src/orchestra/decision-engine.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/decision-engine.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/decision-engine.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/decision-engine.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/decision-engine.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-212: src/orchestra/decision-logger.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/decision-logger.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/decision-logger.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/decision-logger.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/decision-logger.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-213: src/orchestra/decision-replay.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/decision-replay.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/decision-replay.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/decision-replay.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/decision-replay.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-214: src/orchestra/decision-steps/agent-step.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/decision-steps/agent-step.ts
- Scope: src/orchestra/decision-steps

### Description

Read-only analysis of `src/orchestra/decision-steps/agent-step.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/decision-steps/agent-step.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/decision-steps/agent-step.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-215: src/orchestra/decision-steps/scope-step.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/decision-steps/scope-step.ts
- Scope: src/orchestra/decision-steps

### Description

Read-only analysis of `src/orchestra/decision-steps/scope-step.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/decision-steps/scope-step.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/decision-steps/scope-step.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-216: src/orchestra/dependency-scheduler.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/dependency-scheduler.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/dependency-scheduler.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/dependency-scheduler.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/dependency-scheduler.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-217: src/orchestra/doc-updaters/changelog.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/changelog.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/changelog.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/changelog.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/changelog.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-218: src/orchestra/doc-updaters/health-check.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/health-check.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/health-check.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/health-check.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/health-check.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-219: src/orchestra/doc-updaters/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/index.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/index.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-220: src/orchestra/doc-updaters/metrics-updater.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/metrics-updater.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/metrics-updater.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/metrics-updater.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/metrics-updater.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-221: src/orchestra/doc-updaters/readme-metrics.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/readme-metrics.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/readme-metrics.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/readme-metrics.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/readme-metrics.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-222: src/orchestra/doc-updaters/registry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/registry.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/registry.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/registry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/registry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-223: src/orchestra/doc-updaters/sprint-log.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/sprint-log.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/sprint-log.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/sprint-log.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/sprint-log.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-224: src/orchestra/doc-updaters/types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/types.ts
- Scope: src/orchestra/doc-updaters

### Description

Read-only analysis of `src/orchestra/doc-updaters/types.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/doc-updaters/types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-225: src/orchestra/ecosystem-intelligence.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/ecosystem-intelligence.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/ecosystem-intelligence.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/ecosystem-intelligence.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/ecosystem-intelligence.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-226: src/orchestra/event-stream.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/event-stream.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/event-stream.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/event-stream.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/event-stream.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-227: src/orchestra/handoff-protocol.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/handoff-protocol.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/handoff-protocol.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/handoff-protocol.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/handoff-protocol.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-228: src/orchestra/heartbeat-daemon.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/heartbeat-daemon.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/heartbeat-daemon.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/heartbeat-daemon.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/heartbeat-daemon.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-229: src/orchestra/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/index.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/index.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-230: src/orchestra/ipc-registry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/ipc-registry.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/ipc-registry.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/ipc-registry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/ipc-registry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-231: src/orchestra/managed-docs/content-generators.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/content-generators.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/content-generators.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/content-generators.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/content-generators.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-232: src/orchestra/managed-docs/doc-cache.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/doc-cache.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/doc-cache.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/doc-cache.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/doc-cache.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-233: src/orchestra/managed-docs/docs-config.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/docs-config.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/docs-config.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/docs-config.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/docs-config.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-234: src/orchestra/managed-docs/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/index.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/index.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-235: src/orchestra/managed-docs/managed-doc-runner.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/managed-doc-runner.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/managed-doc-runner.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/managed-doc-runner.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/managed-doc-runner.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-236: src/orchestra/managed-docs/plugin-loader.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/plugin-loader.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/plugin-loader.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/plugin-loader.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/plugin-loader.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-237: src/orchestra/managed-docs/section-updater.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/section-updater.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/section-updater.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/section-updater.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/section-updater.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-238: src/orchestra/managed-docs/template-renderer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/template-renderer.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/template-renderer.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/template-renderer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/template-renderer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-239: src/orchestra/managed-docs/types.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/types.ts
- Scope: src/orchestra/managed-docs

### Description

Read-only analysis of `src/orchestra/managed-docs/types.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/managed-docs/types.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/managed-docs/types.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-240: src/orchestra/mid-sprint-adapter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/mid-sprint-adapter.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/mid-sprint-adapter.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/mid-sprint-adapter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/mid-sprint-adapter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-241: src/orchestra/model-selector.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/model-selector.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/model-selector.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/model-selector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/model-selector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-242: src/orchestra/multi-agent.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/multi-agent.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/multi-agent.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/multi-agent.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/multi-agent.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-243: src/orchestra/outcome-tracker.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/outcome-tracker.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/outcome-tracker.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/outcome-tracker.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/outcome-tracker.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-244: src/orchestra/parallel-pipeline.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/parallel-pipeline.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/parallel-pipeline.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/parallel-pipeline.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/parallel-pipeline.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-245: src/orchestra/pattern-reader.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/pattern-reader.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/pattern-reader.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/pattern-reader.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/pattern-reader.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-246: src/orchestra/pattern-recorder.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/pattern-recorder.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/pattern-recorder.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/pattern-recorder.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/pattern-recorder.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-247: src/orchestra/planner.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/planner.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/planner.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/planner.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/planner.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-248: src/orchestra/promotion-pipeline.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/promotion-pipeline.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/promotion-pipeline.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/promotion-pipeline.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/promotion-pipeline.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-249: src/orchestra/prompt-token-optimizer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/prompt-token-optimizer.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/prompt-token-optimizer.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/prompt-token-optimizer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/prompt-token-optimizer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-250: src/orchestra/quality-assessor.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/quality-assessor.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/quality-assessor.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/quality-assessor.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/quality-assessor.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-251: src/orchestra/result-collector.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/result-collector.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/result-collector.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/result-collector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/result-collector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-252: src/orchestra/result-evaluator.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/result-evaluator.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/result-evaluator.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/result-evaluator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/result-evaluator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-253: src/orchestra/result-merger.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/result-merger.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/result-merger.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/result-merger.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/result-merger.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-254: src/orchestra/result-watcher.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/result-watcher.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/result-watcher.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/result-watcher.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/result-watcher.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-255: src/orchestra/rollback.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/rollback.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/rollback.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/rollback.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/rollback.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-256: src/orchestra/rule-evolver.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/rule-evolver.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/rule-evolver.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/rule-evolver.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/rule-evolver.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-257: src/orchestra/self-modifying-detector.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/self-modifying-detector.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/self-modifying-detector.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/self-modifying-detector.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/self-modifying-detector.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-258: src/orchestra/shared-memory.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/shared-memory.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/shared-memory.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/shared-memory.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/shared-memory.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-259: src/orchestra/spawn-backend-docker.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/spawn-backend-docker.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/spawn-backend-docker.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/spawn-backend-docker.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/spawn-backend-docker.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-260: src/orchestra/spawn-backend-mock.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/spawn-backend-mock.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/spawn-backend-mock.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/spawn-backend-mock.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/spawn-backend-mock.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-261: src/orchestra/spawn-backend.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/spawn-backend.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/spawn-backend.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/spawn-backend.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/spawn-backend.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-262: src/orchestra/sprint-checkpoint.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-checkpoint.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-checkpoint.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-checkpoint.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-checkpoint.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-263: src/orchestra/sprint-controller.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-controller.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-controller.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-controller.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-controller.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-264: src/orchestra/sprint-docs-helpers.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-docs-helpers.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-docs-helpers.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-docs-helpers.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-docs-helpers.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-265: src/orchestra/sprint-docs-updater.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-docs-updater.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-docs-updater.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-docs-updater.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-docs-updater.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-266: src/orchestra/sprint-estimator.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-estimator.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-estimator.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-estimator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-estimator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-267: src/orchestra/sprint-finalizer.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-finalizer.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-finalizer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-finalizer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-268: src/orchestra/sprint-lifecycle.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-lifecycle.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-lifecycle.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-lifecycle.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-lifecycle.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-269: src/orchestra/sprint-metrics.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-metrics.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-metrics.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-metrics.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-metrics.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-270: src/orchestra/sprint-phases.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-phases.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-phases.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-phases.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-phases.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-271: src/orchestra/sprint-pid-manager.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-pid-manager.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-pid-manager.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-pid-manager.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-pid-manager.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-272: src/orchestra/sprint-planner.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-planner.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-planner.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-planner.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-planner.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-273: src/orchestra/sprint-reporter.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-reporter.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-reporter.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-reporter.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-reporter.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-274: src/orchestra/sprint-retro-writer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-retro-writer.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-retro-writer.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-retro-writer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-retro-writer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-275: src/orchestra/sprint-spawner.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-spawner.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-spawner.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-spawner.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-spawner.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-276: src/orchestra/sprint-utils.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-utils.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/sprint-utils.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/sprint-utils.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/sprint-utils.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-277: src/orchestra/task-analyzer.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/task-analyzer.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/task-analyzer.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/task-analyzer.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/task-analyzer.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-278: src/orchestra/task-builder.ts Analysis
- Model: opus
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/task-builder.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/task-builder.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/task-builder.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/task-builder.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-279: src/orchestra/task-retry.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/task-retry.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/task-retry.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/task-retry.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/task-retry.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-280: src/orchestra/task-router.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/task-router.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/task-router.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/task-router.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/task-router.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-281: src/orchestra/temp-skill-generator.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/temp-skill-generator.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/temp-skill-generator.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/temp-skill-generator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/temp-skill-generator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-282: src/orchestra/tmux.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/tmux.ts
- Scope: src/orchestra

### Description

Read-only analysis of `src/orchestra/tmux.ts`. Write report to `.deckent/sprint-140-analysis/src/orchestra/tmux.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/orchestra/tmux.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-283: src/providers/claude.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/providers/claude.ts
- Scope: src/providers

### Description

Read-only analysis of `src/providers/claude.ts`. Write report to `.deckent/sprint-140-analysis/src/providers/claude.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/providers/claude.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-284: src/providers/codex.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/providers/codex.ts
- Scope: src/providers

### Description

Read-only analysis of `src/providers/codex.ts`. Write report to `.deckent/sprint-140-analysis/src/providers/codex.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/providers/codex.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-285: src/providers/gemini.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/providers/gemini.ts
- Scope: src/providers

### Description

Read-only analysis of `src/providers/gemini.ts`. Write report to `.deckent/sprint-140-analysis/src/providers/gemini.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/providers/gemini.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-286: src/providers/sandbox.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/providers/sandbox.ts
- Scope: src/providers

### Description

Read-only analysis of `src/providers/sandbox.ts`. Write report to `.deckent/sprint-140-analysis/src/providers/sandbox.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/providers/sandbox.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-287: src/providers/subprocess.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/providers/subprocess.ts
- Scope: src/providers

### Description

Read-only analysis of `src/providers/subprocess.ts`. Write report to `.deckent/sprint-140-analysis/src/providers/subprocess.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/providers/subprocess.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-288: src/dashboard/src/App.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/App.tsx
- Scope: src/dashboard/src

### Description

Read-only analysis of `src/dashboard/src/App.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/App.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/App.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-289: src/dashboard/src/components/ActivityFeed.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ActivityFeed.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/ActivityFeed.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ActivityFeed.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ActivityFeed.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-290: src/dashboard/src/components/AgentDetail.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/AgentDetail.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/AgentDetail.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/AgentDetail.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/AgentDetail.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-291: src/dashboard/src/components/DebtTable.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/DebtTable.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/DebtTable.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/DebtTable.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/DebtTable.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-292: src/dashboard/src/components/EmptyState.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/EmptyState.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/EmptyState.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/EmptyState.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/EmptyState.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-293: src/dashboard/src/components/Layout.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/Layout.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/Layout.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/Layout.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/Layout.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-294: src/dashboard/src/components/NewSprintModal.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/NewSprintModal.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/NewSprintModal.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/NewSprintModal.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/NewSprintModal.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-295: src/dashboard/src/components/SimpleMarkdown.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/SimpleMarkdown.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/SimpleMarkdown.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/SimpleMarkdown.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/SimpleMarkdown.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-296: src/dashboard/src/components/Skeleton.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/Skeleton.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/Skeleton.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/Skeleton.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/Skeleton.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-297: src/dashboard/src/components/SprintChart.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/SprintChart.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/SprintChart.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/SprintChart.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/SprintChart.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-298: src/dashboard/src/components/SprintPhaseTimeline.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/SprintPhaseTimeline.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/SprintPhaseTimeline.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/SprintPhaseTimeline.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/SprintPhaseTimeline.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-299: src/dashboard/src/components/SprintSummary.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/SprintSummary.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/SprintSummary.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/SprintSummary.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/SprintSummary.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-300: src/dashboard/src/components/TaskCard.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/TaskCard.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/TaskCard.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/TaskCard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/TaskCard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-301: src/dashboard/src/components/ThemeProvider.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ThemeProvider.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/ThemeProvider.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ThemeProvider.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ThemeProvider.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-302: src/dashboard/src/components/WorkerCard.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/WorkerCard.tsx
- Scope: src/dashboard/src/components

### Description

Read-only analysis of `src/dashboard/src/components/WorkerCard.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/WorkerCard.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/WorkerCard.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-303: src/dashboard/src/components/ui/badge.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/badge.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/badge.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/badge.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/badge.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-304: src/dashboard/src/components/ui/button.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/button.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/button.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/button.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/button.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-305: src/dashboard/src/components/ui/card.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/card.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/card.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/card.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/card.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-306: src/dashboard/src/components/ui/dialog.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/dialog.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/dialog.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/dialog.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/dialog.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-307: src/dashboard/src/components/ui/input.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/input.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/input.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/input.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/input.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-308: src/dashboard/src/components/ui/label.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/label.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/label.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/label.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/label.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-309: src/dashboard/src/components/ui/progress.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/progress.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/progress.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/progress.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/progress.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-310: src/dashboard/src/components/ui/scroll-area.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/scroll-area.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/scroll-area.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/scroll-area.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/scroll-area.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-311: src/dashboard/src/components/ui/select.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/select.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/select.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/select.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/select.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-312: src/dashboard/src/components/ui/separator.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/separator.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/separator.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/separator.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/separator.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-313: src/dashboard/src/components/ui/sheet.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/sheet.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/sheet.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/sheet.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/sheet.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-314: src/dashboard/src/components/ui/table.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/table.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/table.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/table.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/table.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-315: src/dashboard/src/components/ui/tabs.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/tabs.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/tabs.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/tabs.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/tabs.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-316: src/dashboard/src/components/ui/textarea.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/components/ui/textarea.tsx
- Scope: src/dashboard/src/components/ui

### Description

Read-only analysis of `src/dashboard/src/components/ui/textarea.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/textarea.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/components/ui/textarea.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-317: src/dashboard/src/hooks/useApi.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/hooks/useApi.ts
- Scope: src/dashboard/src/hooks

### Description

Read-only analysis of `src/dashboard/src/hooks/useApi.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/hooks/useApi.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/hooks/useApi.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-318: src/dashboard/src/hooks/useSSE.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/hooks/useSSE.ts
- Scope: src/dashboard/src/hooks

### Description

Read-only analysis of `src/dashboard/src/hooks/useSSE.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/hooks/useSSE.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/hooks/useSSE.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-319: src/dashboard/src/i18n/LanguageProvider.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/i18n/LanguageProvider.tsx
- Scope: src/dashboard/src/i18n

### Description

Read-only analysis of `src/dashboard/src/i18n/LanguageProvider.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/i18n/LanguageProvider.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/i18n/LanguageProvider.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-320: src/dashboard/src/i18n/en.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/i18n/en.ts
- Scope: src/dashboard/src/i18n

### Description

Read-only analysis of `src/dashboard/src/i18n/en.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/i18n/en.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/i18n/en.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-321: src/dashboard/src/i18n/tr.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/src/i18n

### Description

Read-only analysis of `src/dashboard/src/i18n/tr.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/i18n/tr.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/i18n/tr.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-322: src/dashboard/src/lib/api.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/lib/api.ts
- Scope: src/dashboard/src/lib

### Description

Read-only analysis of `src/dashboard/src/lib/api.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/lib/api.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/lib/api.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-323: src/dashboard/src/lib/utils.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/lib/utils.ts
- Scope: src/dashboard/src/lib

### Description

Read-only analysis of `src/dashboard/src/lib/utils.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/lib/utils.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/lib/utils.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-324: src/dashboard/src/main.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/main.tsx
- Scope: src/dashboard/src

### Description

Read-only analysis of `src/dashboard/src/main.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/main.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/main.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-325: src/dashboard/src/pages/ConfigPage.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/pages/ConfigPage.tsx
- Scope: src/dashboard/src/pages

### Description

Read-only analysis of `src/dashboard/src/pages/ConfigPage.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/pages/ConfigPage.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/pages/ConfigPage.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-326: src/dashboard/src/pages/DashboardPage.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/pages/DashboardPage.tsx
- Scope: src/dashboard/src/pages

### Description

Read-only analysis of `src/dashboard/src/pages/DashboardPage.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/pages/DashboardPage.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/pages/DashboardPage.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-327: src/dashboard/src/pages/HistoryPage.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/pages/HistoryPage.tsx
- Scope: src/dashboard/src/pages

### Description

Read-only analysis of `src/dashboard/src/pages/HistoryPage.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/pages/HistoryPage.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/pages/HistoryPage.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-328: src/dashboard/src/pages/MemoryPage.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/pages/MemoryPage.tsx
- Scope: src/dashboard/src/pages

### Description

Read-only analysis of `src/dashboard/src/pages/MemoryPage.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/pages/MemoryPage.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/pages/MemoryPage.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-329: src/dashboard/src/pages/SettingsPage.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/pages/SettingsPage.tsx
- Scope: src/dashboard/src/pages

### Description

Read-only analysis of `src/dashboard/src/pages/SettingsPage.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/pages/SettingsPage.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/pages/SettingsPage.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-330: src/dashboard/src/pages/StatusPage.tsx Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/pages/StatusPage.tsx
- Scope: src/dashboard/src/pages

### Description

Read-only analysis of `src/dashboard/src/pages/StatusPage.tsx`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/pages/StatusPage.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/pages/StatusPage.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-331: src/dashboard/src/types/index.ts Analysis
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/dashboard/src/types/index.ts
- Scope: src/dashboard/src/types

### Description

Read-only analysis of `src/dashboard/src/types/index.ts`. Write report to `.deckent/sprint-140-analysis/src/dashboard/src/types/index.md` using the worker report template.

**Analysis checklist:**
1. Amacı (1-2 cümle)
2. Public API (export'lar + type signatures)
3. Iç + dış bağımlılıklar
4. Complexity metrics (LoC + fonksiyon sayısı)
5. Type Safety issues (any, @ts-ignore, non-null)
6. ADR compliance (ADR-006/008/010/037/039)
7. Test coverage (src/X → tests/X.test.ts matching)
8. TODO/FIXME/HACK comment inventory
9. Documentation coverage (JSDoc var mı?)
10. Dead code candidates (unused export?)
11. Security findings
12. Öneriler (Sprint 141+ input)

**Kanıt:** `.deckent/sprint-140-analysis/src/dashboard/src/types/index.md` mevcut, ≥50 satır, template'in tüm section'ları dolu.

**Test:** Yok (read-only analysis, test yasağı)

---

## Task 140-332: tests/agents/ Category Analysis (25 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/agents/**/*.test.ts
- Scope: tests/agents

### Description

Batch read-only analysis of all 25 test files in `tests/agents/`. Write category report to `.deckent/sprint-140-analysis/tests/agents.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/agents.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-333: tests/analytics/ Category Analysis (4 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/analytics/**/*.test.ts
- Scope: tests/analytics

### Description

Batch read-only analysis of all 4 test files in `tests/analytics/`. Write category report to `.deckent/sprint-140-analysis/tests/analytics.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/analytics.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-334: tests/api/ Category Analysis (11 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/api/**/*.test.ts
- Scope: tests/api

### Description

Batch read-only analysis of all 11 test files in `tests/api/`. Write category report to `.deckent/sprint-140-analysis/tests/api.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/api.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-335: tests/audits/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/audits/**/*.test.ts
- Scope: tests/audits

### Description

Batch read-only analysis of all 1 test files in `tests/audits/`. Write category report to `.deckent/sprint-140-analysis/tests/audits.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/audits.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-336: tests/blueprint/ Category Analysis (4 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/blueprint/**/*.test.ts
- Scope: tests/blueprint

### Description

Batch read-only analysis of all 4 test files in `tests/blueprint/`. Write category report to `.deckent/sprint-140-analysis/tests/blueprint.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/blueprint.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-337: tests/brain/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/brain/**/*.test.ts
- Scope: tests/brain

### Description

Batch read-only analysis of all 1 test files in `tests/brain/`. Write category report to `.deckent/sprint-140-analysis/tests/brain.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/brain.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-338: tests/cli/ Category Analysis (126 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/cli/**/*.test.ts
- Scope: tests/cli

### Description

Batch read-only analysis of all 126 test files in `tests/cli/`. Write category report to `.deckent/sprint-140-analysis/tests/cli.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/cli.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-339: tests/config/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/config/**/*.test.ts
- Scope: tests/config

### Description

Batch read-only analysis of all 1 test files in `tests/config/`. Write category report to `.deckent/sprint-140-analysis/tests/config.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/config.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-340: tests/core/ Category Analysis (109 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/core/**/*.test.ts
- Scope: tests/core

### Description

Batch read-only analysis of all 109 test files in `tests/core/`. Write category report to `.deckent/sprint-140-analysis/tests/core.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/core.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-341: tests/dashboard/ Category Analysis (16 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/dashboard/**/*.test.ts
- Scope: tests/dashboard

### Description

Batch read-only analysis of all 16 test files in `tests/dashboard/`. Write category report to `.deckent/sprint-140-analysis/tests/dashboard.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/dashboard.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-342: tests/docker/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/docker/**/*.test.ts
- Scope: tests/docker

### Description

Batch read-only analysis of all 1 test files in `tests/docker/`. Write category report to `.deckent/sprint-140-analysis/tests/docker.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/docker.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-343: tests/docs/ Category Analysis (25 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/docs/**/*.test.ts
- Scope: tests/docs

### Description

Batch read-only analysis of all 25 test files in `tests/docs/`. Write category report to `.deckent/sprint-140-analysis/tests/docs.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/docs.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-344: tests/e2e/ Category Analysis (10 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/e2e/**/*.test.ts
- Scope: tests/e2e

### Description

Batch read-only analysis of all 10 test files in `tests/e2e/`. Write category report to `.deckent/sprint-140-analysis/tests/e2e.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/e2e.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-345: tests/extensions/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/extensions/**/*.test.ts
- Scope: tests/extensions

### Description

Batch read-only analysis of all 1 test files in `tests/extensions/`. Write category report to `.deckent/sprint-140-analysis/tests/extensions.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/extensions.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-346: tests/github/ Category Analysis (5 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/github/**/*.test.ts
- Scope: tests/github

### Description

Batch read-only analysis of all 5 test files in `tests/github/`. Write category report to `.deckent/sprint-140-analysis/tests/github.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/github.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-347: tests/helpers/ Category Analysis (2 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/helpers/**/*.test.ts
- Scope: tests/helpers

### Description

Batch read-only analysis of all 2 test files in `tests/helpers/`. Write category report to `.deckent/sprint-140-analysis/tests/helpers.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/helpers.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-348: tests/integration/ Category Analysis (29 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/integration/**/*.test.ts
- Scope: tests/integration

### Description

Batch read-only analysis of all 29 test files in `tests/integration/`. Write category report to `.deckent/sprint-140-analysis/tests/integration.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/integration.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-349: tests/load/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/load/**/*.test.ts
- Scope: tests/load

### Description

Batch read-only analysis of all 1 test files in `tests/load/`. Write category report to `.deckent/sprint-140-analysis/tests/load.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/load.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-350: tests/mcp/ Category Analysis (27 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/mcp/**/*.test.ts
- Scope: tests/mcp

### Description

Batch read-only analysis of all 27 test files in `tests/mcp/`. Write category report to `.deckent/sprint-140-analysis/tests/mcp.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/mcp.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-351: tests/monitor/ Category Analysis (9 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/monitor/**/*.test.ts
- Scope: tests/monitor

### Description

Batch read-only analysis of all 9 test files in `tests/monitor/`. Write category report to `.deckent/sprint-140-analysis/tests/monitor.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/monitor.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-352: tests/orchestra/ Category Analysis (118 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/orchestra/**/*.test.ts
- Scope: tests/orchestra

### Description

Batch read-only analysis of all 118 test files in `tests/orchestra/`. Write category report to `.deckent/sprint-140-analysis/tests/orchestra.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/orchestra.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-353: tests/providers/ Category Analysis (7 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/providers/**/*.test.ts
- Scope: tests/providers

### Description

Batch read-only analysis of all 7 test files in `tests/providers/`. Write category report to `.deckent/sprint-140-analysis/tests/providers.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/providers.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-354: tests/scripts/ Category Analysis (10 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/scripts/**/*.test.ts
- Scope: tests/scripts

### Description

Batch read-only analysis of all 10 test files in `tests/scripts/`. Write category report to `.deckent/sprint-140-analysis/tests/scripts.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/scripts.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-355: tests/security/ Category Analysis (3 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/security/**/*.test.ts
- Scope: tests/security

### Description

Batch read-only analysis of all 3 test files in `tests/security/`. Write category report to `.deckent/sprint-140-analysis/tests/security.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/security.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-356: tests/skills/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/skills/**/*.test.ts
- Scope: tests/skills

### Description

Batch read-only analysis of all 1 test files in `tests/skills/`. Write category report to `.deckent/sprint-140-analysis/tests/skills.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/skills.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-357: tests/smoke/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/smoke/**/*.test.ts
- Scope: tests/smoke

### Description

Batch read-only analysis of all 1 test files in `tests/smoke/`. Write category report to `.deckent/sprint-140-analysis/tests/smoke.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/smoke.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-358: tests/unit/ Category Analysis (5 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/unit/**/*.test.ts
- Scope: tests/unit

### Description

Batch read-only analysis of all 5 test files in `tests/unit/`. Write category report to `.deckent/sprint-140-analysis/tests/unit.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/unit.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-359: tests/workflows/ Category Analysis (1 test files)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: yok
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/workflows/**/*.test.ts
- Scope: tests/workflows

### Description

Batch read-only analysis of all 1 test files in `tests/workflows/`. Write category report to `.deckent/sprint-140-analysis/tests/workflows.md`.

**Analysis checklist:**
1. Test inventory (test file list + describe/it block counts)
2. Mock pattern audit (vi.mock, jest.fn, manual stubs)
3. Coverage mapping (src/X.ts karşılığı var mı?)
4. Orphan test detection (src/ karşılığı yok olanlar)
5. Test duplication
6. Flaky candidate signs (retry, timeout, sleep)
7. Naming convention uniformity
8. Imports + dependencies overview
9. TODO/FIXME in tests
10. Coverage gap hypotheses

**Kanıt:** `.deckent/sprint-140-analysis/tests/workflows.md` mevcut, ≥100 satır, her alt madde dolu.

**Test:** Yok (read-only, test çalıştırma yasağı)

---

## Task 140-360: docs/.vitepress/ Documentation Analysis (0 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/.vitepress/**/*.md
- Scope: docs/.vitepress

### Description

Read-only analysis of all 0 markdown files in `docs/.vitepress/`. Write category report to `.deckent/sprint-140-analysis/docs/vitepress.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/vitepress.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-361: docs/analysis/ Documentation Analysis (5 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/analysis/**/*.md
- Scope: docs/analysis

### Description

Read-only analysis of all 5 markdown files in `docs/analysis/`. Write category report to `.deckent/sprint-140-analysis/docs/analysis.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/analysis.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-362: docs/architecture/ Documentation Analysis (6 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/architecture/**/*.md
- Scope: docs/architecture

### Description

Read-only analysis of all 6 markdown files in `docs/architecture/`. Write category report to `.deckent/sprint-140-analysis/docs/architecture.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/architecture.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-363: docs/archive/ Documentation Analysis (8 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/archive/**/*.md
- Scope: docs/archive

### Description

Read-only analysis of all 8 markdown files in `docs/archive/`. Write category report to `.deckent/sprint-140-analysis/docs/archive.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/archive.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-364: docs/audits/ Documentation Analysis (16 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/audits/**/*.md
- Scope: docs/audits

### Description

Read-only analysis of all 16 markdown files in `docs/audits/`. Write category report to `.deckent/sprint-140-analysis/docs/audits.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/audits.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-365: docs/design/ Documentation Analysis (1 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/design/**/*.md
- Scope: docs/design

### Description

Read-only analysis of all 1 markdown files in `docs/design/`. Write category report to `.deckent/sprint-140-analysis/docs/design.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/design.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-366: docs/development/ Documentation Analysis (6 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/development/**/*.md
- Scope: docs/development

### Description

Read-only analysis of all 6 markdown files in `docs/development/`. Write category report to `.deckent/sprint-140-analysis/docs/development.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/development.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-367: docs/directives/ Documentation Analysis (29 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/directives/**/*.md
- Scope: docs/directives

### Description

Read-only analysis of all 29 markdown files in `docs/directives/`. Write category report to `.deckent/sprint-140-analysis/docs/directives.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/directives.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-368: docs/guide/ Documentation Analysis (7 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/guide/**/*.md
- Scope: docs/guide

### Description

Read-only analysis of all 7 markdown files in `docs/guide/`. Write category report to `.deckent/sprint-140-analysis/docs/guide.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/guide.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-369: docs/reference/ Documentation Analysis (13 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/reference/**/*.md
- Scope: docs/reference

### Description

Read-only analysis of all 13 markdown files in `docs/reference/`. Write category report to `.deckent/sprint-140-analysis/docs/reference.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/reference.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-370: docs/release/ Documentation Analysis (3 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/release/**/*.md
- Scope: docs/release

### Description

Read-only analysis of all 3 markdown files in `docs/release/`. Write category report to `.deckent/sprint-140-analysis/docs/release.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/release.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-371: docs/superpowers/ Documentation Analysis (16 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/superpowers/**/*.md
- Scope: docs/superpowers

### Description

Read-only analysis of all 16 markdown files in `docs/superpowers/`. Write category report to `.deckent/sprint-140-analysis/docs/superpowers.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/superpowers.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-372: docs/vision/ Documentation Analysis (1 md files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/vision/**/*.md
- Scope: docs/vision

### Description

Read-only analysis of all 1 markdown files in `docs/vision/`. Write category report to `.deckent/sprint-140-analysis/docs/vision.md`.

**Analysis checklist:**
1. Document inventory (file list + last-modified dates)
2. Güncellik (stale doc detection — Sprint 130+ delta)
3. Link integrity (broken internal refs)
4. TR/EN parity (i18n coverage)
5. Redundancy + duplication
6. API/code example freshness
7. Formatting consistency
8. Linked ADR references
9. Sprint 146 Doc Finalization candidates

**Kanıt:** `.deckent/sprint-140-analysis/docs/vision.md` mevcut, ≥80 satır.

**Test:** Yok

---

## Task 140-373: Root Markdown Files Analysis (18 files)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: *.md (root)
- Scope: .

### Description

Read-only analysis of all 18 root markdown files: README.md, CLAUDE.md, DECKENT.md, DIRECTIVES.md, BETA-TRACKER.md, DECKENT-MASTER-BLUEPRINT.md, AGENTS.md, and others. Write report to `.deckent/sprint-140-analysis/docs/root-md.md`.

**Kanıt:** Rapor ≥80 satır, her root .md dosya için 1 paragraf özet + güncellik check.

**Test:** Yok

---

## Task 140-375: .brain/DECISIONS.md Analysis
- Model: opus
- Effort: high
- Priority: HIGH
- Dependencies: yok
- Skills: system-architect
- Agent: architecture-planner
- Files: .brain/DECISIONS.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/DECISIONS.md`. Focus: 37+ ADR detailed per-ADR analysis. Write report to `.deckent/sprint-140-analysis/brain/_brain_DECISIONS_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-376: .brain/MEMORY.md Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/MEMORY.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/MEMORY.md`. Focus: Sprint learnings cumulative 132-139. Write report to `.deckent/sprint-140-analysis/brain/_brain_MEMORY_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-377: .brain/RETRO.md Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/RETRO.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/RETRO.md`. Focus: Current retro (Sprint 139). Write report to `.deckent/sprint-140-analysis/brain/_brain_RETRO_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-378: .brain/PROJECT-IDENTITY.md Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: system-architect
- Agent: architecture-planner
- Files: .brain/PROJECT-IDENTITY.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/PROJECT-IDENTITY.md`. Focus: Project identity file. Write report to `.deckent/sprint-140-analysis/brain/_brain_PROJECT-IDENTITY_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-379: .brain/DEBT.md Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: system-architect
- Agent: architect
- Files: .brain/DEBT.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/DEBT.md`. Focus: Tech debt table — 2 open items. Write report to `.deckent/sprint-140-analysis/brain/_brain_DEBT_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-380: .brain/PATTERNS.md Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/PATTERNS.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/PATTERNS.md`. Focus: Active + resolved pattern registry. Write report to `.deckent/sprint-140-analysis/brain/_brain_PATTERNS_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-381: .brain/ERRORS.md Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Agent: bug-fixer
- Files: .brain/ERRORS.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/ERRORS.md`. Focus: Error registry. Write report to `.deckent/sprint-140-analysis/brain/_brain_ERRORS_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-382: .brain/sprints/sprint-132..139 batch Analysis
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/sprints/sprint-132..139 batch
- Scope: .brain/

### Description

Read-only analysis of `.brain/sprints/sprint-132..139 batch`. Focus: Sprint log files (Sprint 132-139 cumulative). Write report to `.deckent/sprint-140-analysis/brain/_brain_sprints_sprint-132__139_batch.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-383: .brain/archive/retro-sprint-139.md Analysis
- Model: opus
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: code-reviewer
- Files: .brain/archive/retro-sprint-139.md
- Scope: .brain/

### Description

Read-only analysis of `.brain/archive/retro-sprint-139.md`. Focus: Sprint 139 retro regression evidence (Sprint 138 content mismatch — Task 3 context confusion). Write report to `.deckent/sprint-140-analysis/brain/_brain_archive_retro-sprint-139_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-384: .brain/archive/DIRECTIVES-sprint-NNN.md batch Analysis
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/archive/DIRECTIVES-sprint-NNN.md batch
- Scope: .brain/

### Description

Read-only analysis of `.brain/archive/DIRECTIVES-sprint-NNN.md batch`. Focus: Archived DIRECTIVES files across sprints. Write report to `.deckent/sprint-140-analysis/brain/_brain_archive_DIRECTIVES-sprint-NNN_md_batch.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-385: .brain/archive/sprint-139-tasks/ batch Analysis
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/archive/sprint-139-tasks/ batch
- Scope: .brain/

### Description

Read-only analysis of `.brain/archive/sprint-139-tasks/ batch`. Focus: Sprint 139 task file archive (165 files moved in Seçenek A cleanup). Write report to `.deckent/sprint-140-analysis/brain/_brain_archive_sprint-139-tasks__batch.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-386: .brain/sprints/ root batch Analysis
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/sprints/ root batch
- Scope: .brain/

### Description

Read-only analysis of `.brain/sprints/ root batch`. Focus: .brain/sprints/ remaining files. Write report to `.deckent/sprint-140-analysis/brain/_brain_sprints__root_batch.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-387: .brain/ root other md Analysis
- Model: haiku
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/ root other md
- Scope: .brain/

### Description

Read-only analysis of `.brain/ root other md`. Focus: Other .brain/ root markdown files. Write report to `.deckent/sprint-140-analysis/brain/_brain__root_other_md.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-388: .brain/archive/ remaining Analysis
- Model: haiku
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/archive/ remaining
- Scope: .brain/

### Description

Read-only analysis of `.brain/archive/ remaining`. Focus: Other .brain/archive/ remaining files. Write report to `.deckent/sprint-140-analysis/brain/_brain_archive__remaining.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-389: .brain/ cache/temp if exist Analysis
- Model: haiku
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/ cache/temp if exist
- Scope: .brain/

### Description

Read-only analysis of `.brain/ cache/temp if exist`. Focus: .brain/ cache or temp dirs if present. Write report to `.deckent/sprint-140-analysis/brain/_brain__cache_temp_if_exist.md`.

**Analysis checklist:**
1. Content inventory + structure overview
2. Staleness detection (Sprint 130+ delta)
3. Size vs budget check (new 5000 budget aware)
4. Cross-reference consistency (linked ADRs, sprint logs)
5. Sprint-id context errors (Sprint 139 lesson pattern)
6. Decay candidate detection
7. Sprint 141+ actionable input

**Kanıt:** Rapor ≥100 satır, her checklist item dolu.

**Test:** Yok

---

## Task 140-390: Root JSON files (package.json, tsconfig.json, vitest.config.ts, prettier, eslintrc, etc.)
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: devops-engineer
- Agent: devops-engineer
- Files: (see description)
- Scope: .

### Description

Read-only analysis. Focus: Configuration files audit — ADR-010 minimal deps check, strict TS, vitest config. Write report to `.deckent/sprint-140-analysis/meta/root-config-json.md`.

**Analysis checklist:**
1. File inventory + purpose of each
2. Schema/format consistency
3. Cross-file references
4. ADR compliance (relevant ADRs)
5. Staleness detection
6. Security findings (secrets, hardcoded creds)
7. Sprint 141+ improvement input

**Kanıt:** Rapor ≥80 satır, her dosya için 1 paragraf.

**Test:** Yok

---

## Task 140-391: scripts/ directory (13+ utility files)
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: devops-engineer
- Agent: devops-engineer
- Files: (see description)
- Scope: .

### Description

Read-only analysis. Focus: Utility scripts analysis — deckent-cleanup, adr-validator, pre-flight-health-check, generate-load-report. Write report to `.deckent/sprint-140-analysis/meta/scripts-util.md`.

**Analysis checklist:**
1. File inventory + purpose of each
2. Schema/format consistency
3. Cross-file references
4. ADR compliance (relevant ADRs)
5. Staleness detection
6. Security findings (secrets, hardcoded creds)
7. Sprint 141+ improvement input

**Kanıt:** Rapor ≥80 satır, her dosya için 1 paragraf.

**Test:** Yok

---

## Task 140-392: .deckent/ root config files (config.json, docs.json, project-stack.json, ci-baseline.json, safety-point.json)
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: system-architect
- Agent: architecture-planner
- Files: (see description)
- Scope: .

### Description

Read-only analysis. Focus: .deckent/ config files analysis — 3-layer merge, schema consistency. Write report to `.deckent/sprint-140-analysis/meta/deckent-root-config.md`.

**Analysis checklist:**
1. File inventory + purpose of each
2. Schema/format consistency
3. Cross-file references
4. ADR compliance (relevant ADRs)
5. Staleness detection
6. Security findings (secrets, hardcoded creds)
7. Sprint 141+ improvement input

**Kanıt:** Rapor ≥80 satır, her dosya için 1 paragraf.

**Test:** Yok

---

## Task 140-393: .claude/rules/ (brain.md + auditor.md + worker-default.md)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: (see description)
- Scope: .

### Description

Read-only analysis. Focus: Claude role rules analysis — ADR-037 Authority Matrix compliance. Write report to `.deckent/sprint-140-analysis/meta/claude-rules.md`.

**Analysis checklist:**
1. File inventory + purpose of each
2. Schema/format consistency
3. Cross-file references
4. ADR compliance (relevant ADRs)
5. Staleness detection
6. Security findings (secrets, hardcoded creds)
7. Sprint 141+ improvement input

**Kanıt:** Rapor ≥80 satır, her dosya için 1 paragraf.

**Test:** Yok

---

## Task 140-394: .contracts/api-surface.md + contracts/ directory
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: api-builder
- Agent: doc-writer
- Files: (see description)
- Scope: .

### Description

Read-only analysis. Focus: API surface contract analysis — task/result/lock file formats. Write report to `.deckent/sprint-140-analysis/meta/contracts.md`.

**Analysis checklist:**
1. File inventory + purpose of each
2. Schema/format consistency
3. Cross-file references
4. ADR compliance (relevant ADRs)
5. Staleness detection
6. Security findings (secrets, hardcoded creds)
7. Sprint 141+ improvement input

**Kanıt:** Rapor ≥80 satır, her dosya için 1 paragraf.

**Test:** Yok

---

## Task 140-396: META — Architecture Graph Reconstruction
- Model: opus
- Effort: high
- Priority: HIGH
- Dependencies: yok
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: src/**/*.ts + .brain/DECISIONS.md
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: src/ module dependency graph, Brain/Auditor/Worker/Core/CLI/MCP categorization, circular dependency detection (ADR-008). Write report to `.deckent/sprint-140-analysis/meta/architecture-graph.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/architecture-graph.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-397: META — Dead Code Detection
- Model: opus
- Effort: high
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert, code-simplifier
- Agent: refactorer
- Files: src/**/*.ts + tests/**/*.test.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: Unused export inventory, unreferenced function list, ts-prune style static analysis, Sprint 139 3 dead module removal extended. Write report to `.deckent/sprint-140-analysis/meta/dead-code-inventory.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/dead-code-inventory.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-398: META — ADR Compliance Check (37+ ADR)
- Model: opus
- Effort: high
- Priority: HIGH
- Dependencies: yok
- Skills: system-architect
- Agent: architecture-planner
- Files: src/**/*.ts + .brain/DECISIONS.md
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: Per-ADR codebase violation scan — ADR-001 ESM, ADR-002 Node16, ADR-006 spawnSync security, ADR-008 Brain central import, ADR-010 minimal deps, ADR-022 CLI/MCP parity, ADR-027 hybrid reject, ADR-033 SaaS ban, ADR-034 multi-project, ADR-035 event stream, ADR-037 RBAC, ADR-038 dead code, ADR-039 self-modifying. Write report to `.deckent/sprint-140-analysis/meta/adr-compliance.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/adr-compliance.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-399: META — Security Audit (OWASP + Secrets + CVE)
- Model: opus
- Effort: high
- Priority: HIGH
- Dependencies: yok
- Skills: security-specialist
- Agent: security-auditor
- Files: src/**/*.ts + package.json
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: OWASP Top 10 + secret detection + dependency CVE + input validation boundaries (HTTP API, MCP, CLI args, worker prompts). Write report to `.deckent/sprint-140-analysis/meta/security-audit.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/security-audit.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-400: META — Test Coverage Mapping
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: testing-expert
- Agent: test-writer
- Files: src/**/*.ts + tests/**/*.test.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: src/file.ts → tests/file.test.ts matching, orphan src/test detection, coverage gap heatmap per module. Write report to `.deckent/sprint-140-analysis/meta/test-coverage-mapping.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/test-coverage-mapping.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-401: META — TODO/FIXME/HACK Comment Inventory
- Model: haiku
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: code-simplifier
- Agent: doc-writer
- Files: src/**/*.ts + tests/**/*.ts + docs/**/*.md
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: Grep all TODO/FIXME/HACK/XXX/NOTE/BUG comments, categorize urgent/planned/archived. Write report to `.deckent/sprint-140-analysis/meta/todo-inventory.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/todo-inventory.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-402: META — Documentation Coverage Gap
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: documentation-writer
- Agent: doc-writer
- Files: src/**/*.ts + docs/**/*.md + README.md
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: Exported function/class JSDoc check, README freshness, API docs vs actual API mismatch. Write report to `.deckent/sprint-140-analysis/meta/doc-coverage-gap.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/doc-coverage-gap.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-403: META — Type Safety Audit
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Agent: code-reviewer
- Files: src/**/*.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: any, @ts-ignore, @ts-expect-error, as unknown, non-null assertion, unsafe casts, strict mode compliance. Write report to `.deckent/sprint-140-analysis/meta/type-safety-audit.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/type-safety-audit.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-404: META — Circular Dependency Detection
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Agent: architect
- Files: src/**/*.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: madge-style static analysis, directed acyclic graph validation, ADR-008 enforcement. Write report to `.deckent/sprint-140-analysis/meta/circular-dependency.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/circular-dependency.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-405: META — i18n Coverage (TR/EN Parity)
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: accessibility-expert
- Agent: doc-writer
- Files: src/dashboard/ + src/cli/ + src/mcp/ + docs/
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: Dashboard + CLI help + MCP tool descriptions + docs TR/EN parity, ADR-032 i18n Pattern System compliance. Write report to `.deckent/sprint-140-analysis/meta/i18n-coverage.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/i18n-coverage.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-406: META — CLI/MCP Parity (ADR-022)
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: api-builder
- Agent: architect
- Files: src/cli/ + src/mcp/
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: 36+ CLI command vs 21 MCP tool + 8 resource mapping, parity gap report, CLI-only vs MCP-only classification. Write report to `.deckent/sprint-140-analysis/meta/cli-mcp-parity.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/cli-mcp-parity.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-407: META — Performance Hot Path (Sync I/O Update)
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: performance-optimizer
- Agent: performance-analyzer
- Files: src/**/*.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: Sprint 132 audit 799 sync I/O baseline update, hot path classification (sprint lifecycle vs rarely-called), readFileSync/writeFileSync/existsSync/statSync/readdirSync/spawnSync/execSync inventory. Write report to `.deckent/sprint-140-analysis/meta/performance-hotpath.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/performance-hotpath.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-408: META — Plugin Sandbox Audit
- Model: opus
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: security-specialist
- Agent: security-auditor
- Files: src/core/plugin-loader.ts + src/core/skill-sandbox.ts + src/orchestra/managed-docs/plugin-loader.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: AST validation coverage, unsafe eval/Function/require, JSON vs MJS format security, Sprint 131 ADR-030 plugin loader safety. Write report to `.deckent/sprint-140-analysis/meta/plugin-sandbox-audit.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/plugin-sandbox-audit.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-409: META — Config Schema Consistency
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Agent: code-reviewer
- Files: src/core/config.ts + src/core/config-types.ts + .deckent/config.json
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: config.json ↔ config-types.ts ↔ config.ts validation ↔ ~/.deckent/config.json global 3-layer merge consistency, ADR-004 compliance. Write report to `.deckent/sprint-140-analysis/meta/config-schema.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/config-schema.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-410: META — Error Handling Pattern Uniformity
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Agent: code-reviewer
- Files: src/**/*.ts
- Scope: src/, tests/, docs/, .brain/

### Description

Cross-cutting meta-analysis. Focus: try/catch pattern uniformity, BrainError + worker error types, error propagation (console vs throw vs result.NO_GO), silent swallow anti-pattern. Write report to `.deckent/sprint-140-analysis/meta/error-handling-patterns.md`.

**Analysis depth:**
- Codebase-wide pattern scan (grep + file walk)
- Per-module finding breakdown
- Severity classification (critical/high/normal/low)
- Counter-examples (compliant code samples)
- Sprint 141+ actionable recommendations (prioritized)

**Kanıt:** `.deckent/sprint-140-analysis/meta/error-handling-patterns.md` mevcut, ≥200 satır, findings sayılı + kategorize.

**Test:** Yok (read-only analysis only)

---

## Task 140-411: FINAL AGGREGATION — Sprint 140 Self-Analysis FINAL-REPORT.md
- Model: opus
- Effort: high
- Priority: CRITICAL
- Dependencies: (all 410 prior tasks 140-001..140-410)
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: .deckent/sprint-140-analysis/FINAL-REPORT.md (YENİ)
- Scope: .deckent/sprint-140-analysis/

### Description

**Alperen direktifi (birebir):** *"1 adet sprint 140 tam analiz sonucu raporu istiyorum (tüm workerların çıktılarının analiz edip toplanmış hali) bu kesin."*

This is the **LAST task** of Sprint 140. Read all worker reports under `.deckent/sprint-140-analysis/`, aggregate by category, perform cross-reference meta-analysis, produce a single comprehensive `.deckent/sprint-140-analysis/FINAL-REPORT.md` for Alperen.

**Final Report Structure (~2000-3000 satır hedef, 20 section):**

1. Executive Summary (top 10 findings + health score /100 + Sprint 141+ critical input)
2. src/ Module-by-Module Analysis (10 modül + dashboard, her biri top 5 finding)
3. Test Coverage Gap Heatmap (per-module + orphan src/test lists)
4. Documentation Coverage Gap (JSDoc missing + stale docs + Sprint 146 input)
5. ADR Compliance Report (37+ ADR × violation count × severity)
6. Dead Code Inventory (unused exports + unreferenced functions)
7. Security Findings (OWASP breakdown + secrets + CVE)
8. Performance Hot Paths (sync I/O baseline update from Sprint 132 = 799)
9. Type Safety Issues (any/@ts-ignore/non-null count)
10. Circular Dependency Report (ADR-008 status + DOT graph)
11. i18n Coverage Gap (TR/EN parity per surface)
12. CLI/MCP Parity Gap (ADR-022 compliance)
13. Plugin Sandbox Audit Summary
14. Config Schema Inconsistencies
15. Error Handling Anti-Patterns
16. Failed Analysis Flags (NO_GO worker reports — which files could not be analyzed)
17. Sprint 141-145 Debt Candidates (prioritized P0/P1/P2/P3)
18. Alperen Decision Points (strategic calls + risk trade-offs + roadmap adjustments)
19. Sprint 140 Meta-Metrics (task throughput, agent/skill performance, coverage %, rubric scores)
20. References (worker report file map + linked ADRs + memory files)

**Kanıt:**
- `.deckent/sprint-140-analysis/FINAL-REPORT.md` runtime mevcut
- File line count ≥2000
- Section 1-20 tüm başlıklar mevcut
- Her section'da ≥1 concrete finding (empty section YOK)
- Section 16 (failed analysis) NO_GO worker sayısı = Sprint 140 NO_GO count
- Section 17 Sprint 141+ debt candidates ≥30 item prioritized

**Test:** Yok (aggregation task, test çalıştırma yasağı devam)

---
