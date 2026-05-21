# Sprint 186 Prompt — Per-File Codebase Audit (479 Task, Manifest-Driven, DOC-ONLY)

> Alperen `deckent set-directives --file .brain/audits/sprint-186-directives-prompt.md` ile yükler.
> Brain `deckent plan` ile yorumlar (structured mode — Sprint 184'te 90 task ürettiği yöntemin aynısı, 479'a ölçeklenir).
> Manifest: `.brain/audits/pilot-479-manifest.json` (479 dosya, 111,409 LoC, low=302/normal=139/high=38).
> Master spec: `docs/superpowers/specs/2026-05-21-oss-launch-initiative.md` §3 Phase 2.

---

# DIRECTIVES — Sprint 186: Per-File Full Coverage Audit (479 Task, DOC-ONLY)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-oss-launch-initiative.md` §3 Phase 2 — per-file audit, DOC-ONLY enforcement 3-katman
- **Manifest:** `.brain/audits/pilot-479-manifest.json` (479 src/ TypeScript dosyası, full coverage)
- **Predecessor:** Sprint 185 GO_WITH_TECH_DEBT (6 subdirectory-bunch audit, %96 semantik kapsama — bu sprint o eksiği kapatır per-file deep audit ile)
- **Sprint 184 pilot başarı:** structured mode manifest-driven 90 task üretebildi; aynı pattern 479 dosyaya ölçeklenir
- **Truncation YASAK:** [[feedback_prompt_completeness_over_brevity]]
- **God-level scope:** [[feedback_no_minimum_no_mvp_deckent]] — minimum/MVP/azaltma önerme YASAK
- **No retro/stub task kuralı:** [[feedback_no_retro_task_in_directives]]

## Goal

`.brain/audits/pilot-479-manifest.json` içindeki **479 src/ dosyasının HER BİRİ için ayrı audit task** üret. Sprint 185'in subdirectory-konsolide yaklaşımının aksine bu sprint **per-file deep audit** — her dosya satır-satır okunur, 9-section markdown rapor yazılır. **KOD YAZIMI MUTLAK YASAK** — sadece `docs/audits/per-file-2026-05-21/<flat-path>.md` markdown dosyaları.

Her audit task:
- Model: **opus** (deep code reading, satır-satır context)
- Effort: manifest'ten okunur (low <200 LoC, normal 200-600, high 600+)
- Agent: **code-reviewer**
- Skills: **typescript-expert, documentation-writer, security-specialist**
- Scope.directories: `["docs/audits/per-file-2026-05-21/"]`
- Scope.filesRead: `[<path>, "src/**", "tests/**", "docs/**", ".brain/exports/decisions.md"]`
- Scope.filesWrite: `[manifest entry'sindeki output alanı]` (tek dosya whitelist)
- Priority: NORMAL (bağımsız)

## Brain Planning Instructions

- **Mode:** `structured` (Sprint 184'te 90 task'lık manifest-driven plan üretti; AI mode'un zero-config split kuralı 479'u 5-11'e düşürür — structured manifest okur, 479 task üretir)
- **dependency_pipeline_enabled:** false (manuel wave gate per ADR-047, 479 task bağımsız paralel)
- **nervous_system.enabled:** false (deckent-dev self-modify riski; Sprint 188 clean clone'da açılacak)
- **max_workers:** 6 (performance mode default; daily quota dağıtımı için)
- **brain_planning:** ai (config'de set, ama mode override edebilir — eğer 479 task üretemezse Brain'e `structured` zorla)
- **Provider:** claude (subscription mode, $0 cost)

## Manifest Reading Instructions

Brain plan-time'da:

1. `.brain/audits/pilot-479-manifest.json` oku → 479 file entry parse et
2. Her file entry için bir audit task JSON üret (`.tasks/task-186-NNN.json`):
   - `task.id`: manifest'teki `task_id` (örn. `186-001`)
   - `task.title`: `Audit: <path>` (örn. `Audit: src/agents/worker.ts`)
   - `task.description`: aşağıdaki "Audit Output Template" + path-specific instructions
   - `task.model`: `opus`
   - `task.effort`: manifest'teki `effort` field'ı
   - `task.scope`: manifest'teki output dosyası tek whitelist
   - `task.assignedAgent`: `code-reviewer`
   - `task.assignedSkills`: `["typescript-expert", "documentation-writer", "security-specialist"]`
   - `task.priority`: `NORMAL`
   - `task.dependencies`: `[]` (bağımsız paralel)

## Audit Output Template (9 section — her task aynısı)

```markdown
# Audit: <relative-file-path> — 2026-05-21

## 1. Inventory
- **LoC:** <total lines>
- **Last modified (git log -1 --format=%cs):** YYYY-MM-DD
- **First commit sprint:** <git log first commit sprint number>
- **Public exports:** [list of exported names with brief description]
- **Direct imports:** [list of modules this file imports from]
- **Reverse dependencies (grep -r "<filename>" src/):** [list of modules importing this file]

## 2. Bağlam (Architectural Context)
- Hangi katmana ait
- Sub-system role: <bir-iki cümle açıklama>
- ADR-related: hangi ADR'lerle ilgili (ör. ADR-008 import boundary, ADR-037 RBAC)

## 3. Debt Risk
| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| ... | high/med/low | ... | split/keep |

## 4. Dead Code Candidates
- [ ] Exported but zero-caller (grep evidence)
- [ ] Branches with unreachable logic
- [ ] Deprecated marker without removal
ADR-038 cross-reference: <if applicable>

## 5. Documentation Gaps
- Public API without JSDoc: [list]
- Stale comments contradicting code: [file:line]

## 6. ADR Compliance Check
| ADR | Relevant? | Compliant? | Evidence/Violation |
|-----|-----------|------------|--------------------|
| ADR-001 TypeScript+ESM | yes/no | yes/no | ... |
| ADR-002 Node16 (.js suffix) | yes/no | yes/no | ... |
| ADR-008 Brain centralized import | yes/no | yes/no | ... |
(diğer ilgili ADR'ler)

## 7. Refactor Recommendations
1. **<concrete action>** — `<file:line>` — rationale, impact, effort
2. ...

## 8. Sprint 187 Follow-up Items
- [ ] <numbered item with priority P0/P1/P2>

## 9. Summary
- **Overall health:** healthy / debt-bearing / refactor-needed / dead-code-candidate
- **Top 3 priorities:** ranked list
```

## Worker Contract

- **Sadece tek atanan `docs/audits/per-file-2026-05-21/<flat>.md` dosyası yazılır**
- `src/`, `tests/`, `scripts/`, `package.json`, `.github/`, `NERVOUS-TODO.md`, `.deckent/`, `.brain/` **YASAK**
- TDD KAPSAM DIŞI (doc-only)
- ESM `.js` uzantı (yalnızca kod örneğinde)
- Truncation YASAK — full 9-section template
- selfAssessment honest: DONE = 9 section eksiksiz + tek output yazıldı + src/ dokunulmadı
- coverageRelaxed: true (doc work, vitest coverage uygulanamaz)
- Post-sprint commit ZORUNLU
- DIRECTIVES'te retro/stub task YOK — Brain otomatik

## GO/NO_GO

**GATE-1 (Doc-only enforcement):** post-sprint `git diff --stat src/ tests/ NERVOUS-TODO.md` **EMPTY**. Source diff → tüm sprint NO_GO.

**GATE-2 (Output completeness):** `find docs/audits/per-file-2026-05-21/ -name "*.md" | wc -l` ≥ **430** (479 hedef, 49 fail tolerance ~%10). Her dosya ≥9 section başlığı (`grep "^## " <file> | wc -l ≥ 9`).

**GATE-3 (Sprint capacity report):** Brain `sprint-reporter.ts` retro otomatik bölümde 479 task süre dağılımı + en yavaş 10 task + Brain Quality Scorer ortalama + Daily quota tüketimi raporlar.

**Sprint verdict:**
- **GO** = ≥430/479 DONE + GATE-1 EMPTY + GATE-2 ≥430
- **GO_WITH_TECH_DEBT** = 380-429/479 DONE + GATE-1 EMPTY + GATE-2 ≥380
- **NO_GO** = <380/479 DONE **veya** GATE-1 violation

## Capacity Estimate

- 479 task × opus model × ortalama 10dk per task / 6 paralel = **~13 saat** (low effort dosyalar 5dk, high effort 30dk)
- Subscription mode: $0 cost
- Daily Anthropic quota: tahminen **~60-80%** tüketim (Sprint 185 30dk = %0.8 ⇒ 479 task = ~%50-80)
- Sprint timeout: docker_max_timeout 14400s = 4 saat **YETMEZ** — `.deckent/config.json` `docker_max_timeout: 86400` (24 saat) yapılmalı sprint öncesi

## Stress-Test Hedefleri

1. **Manifest-driven scaling:** Brain 90 → 479 task üretim throughput'u
2. **Per-file output:** 479 markdown dosyası concurrent yazımda lock contention?
3. **6 paralel max_workers stability:** ~80 dalga × 6 worker = 480 spawn cycle, heartbeat daemon stability
4. **Subscription daily quota burn rate:** opus 479 task subscription quota'sı limitine ulaşır mı?
5. **FIX phase scaling:** Sprint 185'te 1 NO_GO → 1 fix worker; 479'da ~5-10 NO_GO bekleniyor, FIX phase paralel cascade?

Brain `sprint-reporter.ts` retro'da bu 5 ölçümü ayrı bölümde raporlayacak — Sprint 187+ AI Planner.dynamicFileTreeSplit() özellik kararı için input veri.
