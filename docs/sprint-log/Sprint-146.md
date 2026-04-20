# Sprint 146 — Prompt God Template Reform + Critical Bug Fix + Rubric Consolidation

<!-- Dil: TR | Teknik terimler EN -->

**Tarih:** 2026-04-20
**Versiyon:** 0.4.0-beta.2
**Sprint tipi:** P0 ağırlıklı, beta yolu
**Önceki sprint:** sprint-145 (27/28 done, 24 TD, 1 NO_GO)
**Beta GA yolu:** Sprint 146 → 147 → 148 → 149 → 150 🚀

---

## Tema

> **"Prompt kaliteli olunca worker çıktı kaliteli olur."**

Sprint 145 kanıtladı: DIRECTIVES task description güçlü olduğu için worker'lar prompt bug'lara rağmen 27/28 tamamladı. Sprint 146'da prompt'un kendisi iyileştiriliyor — Sprint 147 nervous system + Sprint 148-150 beta GA için daha sağlam zemin.

---

## Hedefler

| # | Hedef | Task'lar |
|---|-------|---------|
| 1 | **Prompt God Template Reform** — prompt kalite 64/100 → 85/100 | T1-T7 |
| 2 | **3 Canlı Bug Fix** — DIRECTIVES silme + SDL dead write + agent exclusion hard-code | T8-T9, T14 |
| 3 | **Rubric System Consolidation** — 3 paralel sistem → 1 kanonik | T10 |
| 4 | **Sprint 145 Vitest Regression Fix** — 3 fail kapanması | T11 |
| 5 | **Sprint 147 Nervous System Preflight** — ADR-040 draft + types | T12 |
| 6 | **Dokümantasyon** — Sprint log, CHANGELOG, canlı record güncelleme | T13, T16, T17 |
| 7 | **Chain Safety Gate** — Sprint 146 sonrası sıkı gate script | T15 |

---

## Sprint Gate

| Kriter | Eşik |
|--------|------|
| `deckent doctor` | ≥ 90/100 |
| `tsc --noEmit` | PASS |
| `npx vitest run` | ≥ %99.3 pass |
| Cost | < $95 |
| NO_GO count | ≤ 2 |
| `prompt_linter avg` | ≥ 75/100 |

---

## 17 Task Deliverables

| ID | Başlık | Agent | Effort | Durum |
|----|--------|-------|--------|-------|
| T1 | Agent Truncation Bug Fix | architect | normal | — |
| T2 | Agent Routing V2 Retrain + Intent Classifier Refresh | architect | high | — |
| T3 | ADR Relevance Scoring Engine | architect | normal | — |
| T4 | Scope Sanitizer | architect | normal | — |
| T5 | Generative Useful God Template — buildTaskPrompt Single Entry | architect | high | — |
| T6 | Task-Type ADR Preset Matrix + Filler Cleanup | refactorer | normal | — |
| T7 | Prompt Quality Linter | test-writer | normal | — |
| T8 | DIRECTIVES.md Mid-Sprint Silme Bug Fix | bug-fixer | normal | — |
| T9 | SDL Decision Log Rehabilitation | refactorer | normal | — |
| T10 | Rubric System Consolidation | architect | high | — |
| T11 | Sprint 145 vitest Regression Fix | bug-fixer | normal | — |
| T12 | Nervous System Preflight — ADR-040 + Types | architect | normal | — |
| T13 | Sprint 146 Retro Template + Docs Update | doc-writer | low | — |
| T14 | Agent Exclusion Dynamic (Task 2 tamamlayıcı) | architect | normal | — |
| T15 | Chain Safety Gate Script | test-writer | low | — |
| T16 | Sprint 146 Living Record Update (FINAL-EXECUTIVE-REPORT.md) | doc-writer | low | — |
| T17 | ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 Append | doc-writer | low | — |

---

## Teknik Detaylar

### Wave 1 — Foundation (Paralel)
- **T1** `src/core/agent-pool.ts` — Agent truncation fix: `substring(0, N)` limiti kaldır/büyüt
- **T2** `src/core/intent-classifier.ts`, `src/core/activation-engine.ts` — Intent keyword mapping yenileme, agent routing V2 retrain
- **T3** `src/orchestra/adr-selector.ts` (YENİ) — `selectRelevantAdrs()`, `buildAdrPromptSection()`, `AdrRelevance` interface
- **T4** `src/orchestra/scope-sanitizer.ts` (YENİ) — dist/ filter, path traversal reject, dedupe, "(yeni)" strip

### Wave 2 — Build (Paralel)
- **T5** `src/orchestra/prompt-god-template.ts` (YENİ) — `buildTaskPrompt()` tek entry, `PromptArtifact` interface, char/token count metadata
- **T6** `TASK_TYPE_ADR_PRESETS` matrix, filler header conditional emit
- **T7** `scripts/prompt-linter.mjs` — 6 kalite kontrolü, exit 0 avg ≥ 75

### Wave 3 — Bug Fix (Paralel)
- **T8** `src/orchestra/sprint-finalizer.ts` — `archiveDirectives()` phase guard (yalnızca CLEANUP fazında)
- **T9** `src/orchestra/task-router.ts` — SDL log: yalnızca v2 routing, meaningful events, input/output dolu
- **T10** Rubric konsolidasyon: worker self-report kaldır, Quality Assessor kanonik, `assessQuality()` zorunlu

### Wave 4 — Preflight (Paralel)
- **T11** Sprint 145 vitest 3 fail → fix (event-bus, timeout-estimator kandidat)
- **T12** `src/core/nervous-types.ts` (YENİ) — `AuthorityMode`, `NervousNotification`, ADR-040 draft `status: proposed`
- **T13** Dokümantasyon (bu task)

### Wave 5 — Integration (Paralel)
- **T14** `getDynamicExclusions()` — intent + scope'a dinamik exclusion, global hard-code kaldır
- **T15** `scripts/chain-gate-check.mjs` — 6 kriter, exit 0 = GO

### Wave 6 — Doc (Paralel)
- **T16** `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` — Section 1/5/6/8 + Section N append
- **T17** `DECKENT-ANA-PLAN-TR.md`, `DECKENT-MASTER-BLUEPRINT.md`, `BETA-TRACKER.md`, `BETA-TRACKER-TR.md` Sprint 146 append

---

## Yeni Dosyalar (Sprint 146)

| Dosya | Açıklama |
|-------|----------|
| `src/orchestra/adr-selector.ts` | ADR relevance scoring engine |
| `src/orchestra/scope-sanitizer.ts` | Scope path sanitization |
| `src/orchestra/prompt-god-template.ts` | Unified prompt builder (~400 LoC) |
| `src/core/nervous-types.ts` | Sprint 147 nervous system type placeholders |
| `scripts/prompt-linter.mjs` | Prompt quality linter |
| `scripts/chain-gate-check.mjs` | Sprint gate check script |

---

## Sprint 147 Önizleme — Nervous System

Sprint 146'nın ADR-040 draft'ı ve `nervous-types.ts` Sprint 147'nin zeminini hazırlar:

- **AuthorityMode** — Brain/Auditor/Worker yetki modları
- **RiskLevel** — Task risk sınıflandırması
- **ApprovalPolicy** — Onay akış kuralları
- **NervousNotification** — Cross-component bildirim protocol
- **AuthorityMatrix** — Runtime yetki matris yapısı

**Beta GA Takvimi:**
- Sprint 146 (2026-04-20) — Prompt reform + bug fix ✅
- Sprint 147 (2026-04-22/Sal) — Nervous system V1
- Sprint 148 (2026-04-23/Çar) — Integration & hardening
- Sprint 149 (2026-04-23-24/Çar-Per) — Final polish
- Sprint 150 (2026-04-24/Per) 🚀 **GA**

---

## Metrikler

| Metrik | Hedef |
|--------|-------|
| Toplam Task | 17 |
| Wave Sayısı | 6 |
| Hard Cap | 5h |
| Cost Cap | $95 (subs mode) |
| Prompt Kalite | 64/100 → ≥ 75/100 |
| Prompt Char Count | ~45K → ≤ 27K (%40 azalma) |
| vitest Pass Rate | ≥ %99.3 |
