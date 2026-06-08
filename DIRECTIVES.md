# DIRECTIVES — Sprint 239: Work-Model Consumer Migration #1 (WM-2b)

## Goal: Canonical work-model SSOT'un (Sprint 238 `src/core/work-model.ts`) **İLK GERÇEK CONSUMER'ı** — `rubric-registry`'yi kanonik `TaskKind`'dan rubric seçecek şekilde migrate et + `task-builder` plan-time'da `Task.type` set etsin. Bu, SSOT'un değerini KANITLAR (artık "ölü" değil, tüketiliyor). **Behavior-sensitive (eval-rubric yolu) → mutlak backward-compatible + regression-eşitlik:** `Task.type` set ise `taskKindToRubric(task.type)` kullan; set değilse mevcut scope-shape `detectTaskType` fallback'ı AYNEN korunur. Yeni-yol ESKİ-yolla AYNI rubric'i üretmeli (sıfır eval-regresyonu).

## Ortak kurallar
- **Backward-safe + regression-zero ZORUNLU:** mevcut `detectTaskType` (scope-shape) fallback olarak KALIR; `Task.type` yoksa davranış birebir aynı. Yeni kanonik-yol, eşdeğer task için ESKİ-yolla aynı rubric'i seçtiğini testle kanıtla.
- **i18n:** muaf (internal eval logic). **ESM `.js` zorunlu.** No tech debt.
- ADR-008 (core→orchestra import yok; work-model core'da, rubric-registry orchestra'da → orchestra core'u import edebilir, ters değil ✅). ADR-053 (taxonomy) realize ediliyor.
- **.result kontratı:** `docs/reference/api-surface.md`. Tier-0 (internal eval) → unit-test yeterli.

---

## Task 1: 239-001 — rubric-registry + task-builder canonical TaskKind migration
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert, code-simplifier, testing-expert
- Files: src/orchestra/rubric-registry.ts, src/orchestra/task-builder.ts, tests/orchestra/work-model-consumer.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Önce oku: `src/core/work-model.ts` (canonical `TaskKind` + `taskKindToRubric`), `src/orchestra/rubric-registry.ts` (mevcut `detectTaskType` scope-shape + `getRubric`/`EFFECT_CLASS_REGISTRY`), `src/orchestra/task-builder.ts` (task oluşturma).

1. **rubric-registry.ts — canonical-consume + fallback:** `getRubric(task)` (veya rubric-seçen fonksiyon) şöyle çalışsın: **(a)** `task.type` (canonical `TaskKind`) set ise → `taskKindToRubric(task.type)` ile rubric-tipini türet; **(b)** set değilse → mevcut `detectTaskType(task)` scope-shape fallback'ı AYNEN. Mevcut `detectTaskType` fonksiyonu SİLİNMEZ (fallback). `EFFECT_CLASS_REGISTRY` ve rubric-seçim mantığı korunur, sadece tip-kaynağı canonical'a köprülenir.
2. **task-builder.ts — `Task.type` set:** task oluştururken kanonik `TaskKind` türet (mevcut scope/description sinyalinden — `detectTaskType` sonucunu `rubricTypeToKind` ile canonical'a çevir, VEYA doğrudan uygun adaptör) ve `task.type` alanına yaz. Böylece yeni task'lar canonical type taşır → rubric yeni-yoldan seçer.
3. **Sıfır-regresyon kanıtı:** eşdeğer task için **yeni-yol (task.type set) rubric == eski-yol (fallback) rubric** olduğunu testle göster (3 task-türü: code/doc/audit).

**Tasarım:** minimum-diff, mevcut imzaları koru; `detectTaskType` fallback kalsın; pure-bridge. Karpathy: scope-içi, mevcut-pattern.

**Kanıt:** `grep "taskKindToRubric\|task.type" src/orchestra/rubric-registry.ts` → köprü var · `grep "\.type\s*=" src/orchestra/task-builder.ts` → set ediliyor · `npx tsc --noEmit` temiz.

**Test (≥8):** `tests/orchestra/work-model-consumer.test.ts` — (a) `task.type='code-development'`→CODE rubric, `'documentation'`→DOC, `'audit'`→AUDIT; (b) `task.type` YOK → `detectTaskType` fallback aynen çalışır (eski davranış); (c) **regression-eşitlik:** 3 örnek task'ta yeni-yol==eski-yol rubric; (d) task-builder ürettiği task'ta `type` set; hermetik. `npx vitest run tests/orchestra/work-model-consumer.test.ts` yeşil. **Ayrıca mevcut rubric-registry testleri BOZULMAMALI** (`npx vitest run tests/orchestra/rubric-registry.test.ts` yeşil — varsa).

**Smoke:** yok (Tier-0 internal eval); ama Brain/ben post-sprint **orchestration-smoke** (trivial sprint plan→spawn→evaluate, rubric doğru seçilir).

---

**Beklenen:** 1/1 DONE. SSOT artık TÜKETİLİYOR (WM-2 ilerledi). Disk-verify: köprü kodu + task.type set + tsc temiz + yeni test yeşil + mevcut rubric testleri yeşil (sıfır regresyon). **Post-sprint orchestration-smoke (ben):** core-eval-touching → deckent trivial sprint'i hâlâ doğru plan→spawn→**evaluate** (rubric drift yok).

İlgili ADR: ADR-053 (TaskType taxonomy realize) · ADR-070 (eval integrity) · ADR-008. Memory: [[sprint_238_work_model_foundation]] (WM-2a SSOT) · [[feedback_brain_rubric_bridge_broken]] (rubric-eval hassasiyeti) · [[feedback_trust_brain_eval_not_worker]].
</content>
