# Sprint 184 Prompt — Codebase Self-Audit Pilot (DOC-ONLY)

> Alperen bu prompt'u `deckent set-directives` ile Brain'e iletir.
> Brain `deckent plan --mode ai` ile bu prompt'u yorumlayıp 90 task üretir.
> Manifest dosyası: `.brain/audits/pilot-90-manifest.json` (90 dosya, 47,308 LoC).
> Master spec: `docs/superpowers/specs/2026-05-21-oss-launch-initiative.md` §3 Phase 2.

---

# DIRECTIVES — Sprint 184: Codebase Self-Audit Pilot (Phase 2 Pilot, DOC-ONLY)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-oss-launch-initiative.md` §3 Phase 2 — codebase self-audit DOC-ONLY enforcement
- **Pilot manifest:** `.brain/audits/pilot-90-manifest.json` (90 critical src/ files: top 50 by LoC + 40 critical entry/security/recent Crisis Stab deliverables)
- **Predecessor:** Crisis Stabilization Initiative kapanış Sprint 183 GO_WITH_TECH_DEBT (`docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md`)
- **No retro/stub task kuralı:** [[feedback_no_retro_task_in_directives]] — DIRECTIVES'te retro/stub task YASAK
- **Truncation YASAK:** [[feedback_prompt_completeness_over_brevity]] — full content audits, abbreviation yok
- **God-level scope:** [[feedback_no_minimum_no_mvp_deckent]] — minimum/MVP/azaltma önerme YASAK

## Goal

OSS Launch Initiative Phase 2 **pilot run**: `.brain/audits/pilot-90-manifest.json` içindeki **90 src/ dosyasının her biri için satır-satır bağlam analizi yapan birer audit task üret**. Brain (AI Planner) manifest'i okur, her dosya için 1 audit task çıkartır. Toplam 90 task, ~47,308 LoC pilot kapsamı. **KOD YAZIMI MUTLAK YASAK** — sadece `docs/audits/full-codebase-2026-05-21/` altına markdown raporları yazılır.

Bu pilot sprint Brain'in:
1. Manifest-driven planlama yeteneği (90 task structured üretim)
2. Doc-only enforcement (3-katman: DIRECTIVES scope + worker filesWrite + Auditor boundary scan)
3. Paralel max_workers throughput limiti (gerçek pilot capacity ölçümü)

stress-test eder. Sprint 184 sonrası tüm 479 src/ + 870 tests/ + 549 docs/ → 1898 task / 21 batch sprint projeksiyonu çıkar.

## Brain Planning Instructions

- **Mode:** `ai` (AI Planner, manifest-driven 90 task generation)
- **Self-modifying:** HAYIR — src/ scope dışı, sadece `docs/audits/full-codebase-2026-05-21/*.md` yazılır
- **Wave:** Brain'in kendi kararı (90 task topological sort gerek YOK — dosyalar bağımsız audit, paralel maksimum)
- **Max workers:** 6 (deckent-dev `.deckent/config.json` performance mode default)
- **dependency_pipeline_enabled:** `false` (deckent-dev manuel wave gate per ADR-047 — 90 task wave'siz dispatch)
- **nervous_system.enabled:** `false` (Phase 4 clean clone'da açılacak, deckent-dev'de KAPALI)
- **Provider:** claude
- **Per-task model:** opus (deep code reading, dosya başına satır-satır bağlam)
- **Per-task effort:** normal (orta-büyük dosyalar high, küçükler low; Brain LoC bazlı karar versin — manifest LoC alanı mevcut)
- **Per-task agent:** code-reviewer (audit görevi)
- **Per-task skill:** typescript-expert, documentation-writer, security-specialist (her audit task'a 3 skill enjekte)

## Audit Output Template (her task aynı yapıyı üretir)

Her audit task aynı template'i dolduran bir markdown rapor yazar — `docs/audits/full-codebase-2026-05-21/<flattened-path>.md`:

```markdown
# Audit: <relative-file-path> — 2026-05-21

## 1. Inventory
- **LoC:** <total lines>
- **Last modified (git log -1 --format=%cs):** YYYY-MM-DD
- **Public exports:** [list of exported names with brief description]
- **Direct imports (dependencies):** [list of modules this file imports from]
- **Reverse dependencies (callers — grep -r "<filename>" src/):** [list of modules importing this file]

## 2. Bağlam (Architectural Context)
- Hangi katmana ait (orchestra / core / agents / nervous / api / mcp / cli)
- Hangi sprint'te eklendi (git log first commit)
- Sub-system role: <bir-iki cümle açıklama>

## 3. Debt Risk
| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| God-object (>500 LoC + multi-responsibility) | high/med/low | ... | split/keep |
| Type-safety hole (any/unknown without narrow) | high/med/low | ... | type/branded |
| Error-handling gap (try without catch, swallowed errors) | high/med/low | ... | propagate/handle |
| Async/Promise misuse (unhandled rejection, race) | high/med/low | ... | ... |
| Test coverage gap | high/med/low | ... | add tests |

## 4. Dead Code Candidates
- [ ] Exported but zero-caller — grep evidence
- [ ] Branches with unreachable logic
- [ ] Deprecated marker without removal
ADR-038 cross-reference: <if applicable>

## 5. Documentation Gaps
- Public API without JSDoc: [list]
- Stale comments contradicting code: [file:line]
- Missing companion doc: <suggested path>

## 6. ADR Compliance Check
| ADR | Relevant? | Compliant? | Evidence/Violation |
|-----|-----------|------------|--------------------|
| ADR-001 TypeScript+ESM | yes/no | yes/no | ... |
| ADR-002 Node16 resolution (.js suffix) | yes/no | yes/no | ... |
| ADR-006 spawnSync security | yes/no | yes/no | ... |
| ADR-008 Brain centralized import | yes/no | yes/no | ... |
| ADR-037 RBAC Authority Matrix | yes/no | yes/no | ... |
| ADR-038 Dead code disposition | yes/no | yes/no | ... |
| ADR-048 Prompt Lifecycle (worker prompts only) | yes/no | yes/no | ... |
| Other ADRs touched | ... | ... | ... |

## 7. Refactor Recommendations
1. **<concrete action>** — `<file:line>` — rationale, expected impact, effort estimate
2. ...

## 8. Sprint 187 Follow-up Items
- [ ] <numbered item with priority P0/P1/P2>
- [ ] ...

## 9. Summary
- **Overall health:** healthy / debt-bearing / refactor-needed / dead-code-candidate
- **Top 3 priorities:** ranked list of cleanup actions
```

## Worker Contract

- **Sadece `docs/audits/full-codebase-2026-05-21/<flattened-path>.md` dosyası yazılır.** Her task tek dosya whitelist'i ile sınırlı.
- **`src/`, `tests/`, `scripts/`, `package.json`, `.github/`, `NERVOUS-TODO.md`, `.deckent/`, `.brain/` YASAK** — boundary violation → NO_GO + scope-bounded rollback (Sprint 181 W0 mekanizması)
- **TDD KAPSAM DIŞI:** Doc-only sprint, test yazımı yok.
- **memory.db:** schema değişikliği YOK.
- **Post-sprint commit ZORUNLU:** [[feedback-post-sprint-commit-mandatory]]
- **DIRECTIVES'te retro/stub task YOK:** Brain `sprint-reporter.ts` otomatik retro yazar
- **Truncation YASAK:** her audit task full 9-section template doldurur
- **PROMPT.md kanonik:** agent.json systemPrompt prompt injection'a girmez

`.tasks/task-<id>.result` her task için:
- `filesChanged`: `["docs/audits/full-codebase-2026-05-21/<flattened>.md"]` tek dosya
- `coverageRelaxed`: `true` (doc work, vitest coverage uygulanamaz)
- `selfAssessment`: DONE / GO_WITH_TECH_DEBT / NO_GO
- `notes`: audit özeti + top 3 finding

## GO/NO_GO Criteria

**GATE-1 (Doc-only enforcement):** `git diff --stat src/ tests/ NERVOUS-TODO.md package.json` post-sprint **EMPTY** olmalı. Herhangi bir source diff → tüm sprint NO_GO (boundary violation systemic).

**GATE-2 (Output completeness):** `find docs/audits/full-codebase-2026-05-21/ -name "*.md" | wc -l` ≥ **80** (90 hedef, 10 fail tolerance for pilot). Her dosya minimum 9 section başlığı içerir (`grep "^## " <file> | wc -l` ≥ 9).

**GATE-3 (Pilot capacity report):** Brain `sprint-reporter.ts` retro otomatik bir bölümde tüm 90 task süre dağılımı + total sprint duration + Brain Quality Scorer ortalama skor + en yavaş 10 task analizini yazar. Bu, kalan 4710 dosyalık projeksiyon için input veri.

**Sprint verdict:**
- **GO** = ≥85/90 DONE + GATE-1 EMPTY + GATE-2 ≥80 + GATE-3 retro var
- **GO_WITH_TECH_DEBT** = 70-84/90 DONE + GATE-1 EMPTY + GATE-2 ≥70 + en az 5 NO_GO yok bir subdir'de toplanmamış (pattern değil sporadic)
- **NO_GO** = <70/90 DONE **veya** GATE-1 violation **veya** GATE-2 <70 (pilot başarısız, scale-up reddedilir, doc-only enforcement mekanizması düzeltilmeli)

## AI Planner — Manifest Reading Instructions

Brain AI Planner şu adımları takip etsin:

1. **Read manifest:** `.brain/audits/pilot-90-manifest.json` → 90 file entry parse et
2. **Per-file task generation:** Her file entry için bir audit task JSON üret:
   - `task.id`: manifest'teki `task_id` (örn. `184-001`)
   - `task.title`: `Audit: <path>` (örn. `Audit: src/orchestra/sprint-controller.ts`)
   - `task.description`: yukarıdaki "Audit Output Template" referansı + path-specific instructions
   - `task.model`: `opus` (zorunlu, manifest LoC bağımsız)
   - `task.effort`: LoC < 200 → low, 200-600 → normal, 600+ → high
   - `task.scope.directories`: `["docs/audits/full-codebase-2026-05-21/"]`
   - `task.scope.filesRead`: `[<path>, "src/**", "tests/**", "docs/**", ".brain/exports/decisions.md"]` (audit için cross-ref gerekli)
   - `task.scope.filesWrite`: `[manifest entry'sindeki "output" alanı]` (tek dosya)
   - `task.assignedAgent`: `code-reviewer`
   - `task.assignedSkills`: `["typescript-expert", "documentation-writer", "security-specialist"]`
   - `task.priority`: `NORMAL` (90 task birbirinden bağımsız, paralel)
   - `task.goNogo`: bu DIRECTIVES'in GO/NO_GO Criteria bölümüne reference

3. **Wave structure:** 90 task bağımsız → tek dalga, max_workers 6 paralel dispatch
4. **Dependency:** YOK — her dosya bağımsız audit
5. **Output integrity:** Brain plan-time'da 90 task JSON'unun her birinin `.tasks/task-184-NNN.json` dosyasında doğru oluştuğunu doğrula

## Brain Self-Awareness Notes

- Bu sprint **Brain'i kendisini stres test ediyor**. AI Planner 90 task üretimini, IPC daemon 90 worker spawn'ı, heartbeat daemon 90 paralel canlılığı, result-collector 90 sonuç birleştirmesini kaldırmalı. Herhangi bir noktada `OOM`, `EMFILE`, lock contention, IPC race condition → GATE-3 retro'ya kaydet (pilot değeri budur).
- Brain `sprint-reporter.ts` retro yazımında **kalan 4710 dosya projeksiyonu** ekler: bu pilot 90 dosya/N saat sürdü → toplam 4710/90 × N = M saat tahmini. Alperen bu projeksiyonla scale-up kararını verir (5 batch sprint × 950 dosya, 21 batch sprint × 250 dosya, vs.).
- Brain Quality Scorer her audit task'a doc rubric uygular:
  - **correctness:** rapor 9 section eksiksiz mi
  - **coverage:** her section dolu mu (boş bullet/table yok)
  - **scope_compliance:** sadece atanan output dosyası yazıldı mı (git diff doğrulama)
  - **documentation:** rapor okunabilir, structured, file:line citation var mı
