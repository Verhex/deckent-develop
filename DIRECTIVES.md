# DIRECTIVES — Sprint 240: Work-Model Consumer Migration #2 (WM-2c-safe)

## Goal: Canonical work-model SSOT'un consumer'larını genişlet — `task-router` (routing intent) ve `adr-selector` (ADR-domain) `Task.type` (canonical `TaskKind`) set ise reverse-helper'lardan (`taskKindToIntent`, `taskKindToAdrDomain`) türetsin; set değilse mevcut legacy mantık AYNEN fallback. **Additive-safe (enum-SİLME YOK):** duplike taksonomilerin fiilen kaldırılması ayrı, gündüz-reviewed cleanup adımı — gece-loop'ta yalnız consume-köprüsü (regresyon-sıfır). rubric (WM-2b) deseninin birebir tekrarı, iki consumer daha.

## Ortak kurallar
- **Backward-safe + regression-zero ZORUNLU:** mevcut legacy detection/mantık fallback olarak KALIR (silinmez); `Task.type` yoksa davranış birebir. Yeni kanonik-yol eşdeğer task için eski-yolla AYNI sonucu üretir.
- **i18n** muaf (internal routing/adr). **ESM `.js`.** No tech debt. ADR-008 (orchestra core'u import edebilir).
- **.result kontratı** api-surface.md. Tier-0 → unit-test yeterli.

---

## Task 1: 240-001 — task-router + adr-selector canonical-consume (fallback korunur)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert, code-simplifier, testing-expert
- Files: src/orchestra/task-router.ts, src/orchestra/adr-selector.ts, tests/orchestra/work-model-consumer-2.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Önce oku: `src/core/work-model.ts` (`taskKindToIntent`, `taskKindToAdrDomain`), `src/orchestra/task-router.ts` (mevcut `detectTaskType`/intent kullanımı), `src/orchestra/adr-selector.ts` (mevcut domain seçimi), ve referans desen `src/orchestra/rubric-registry.ts:194` (WM-2b köprüsü).

1. **task-router.ts:** routing-intent/TaskType belirlenen noktada → `task.type != null ? taskKindToIntent(task.type) : <mevcut legacy detection>`. Mevcut legacy fonksiyon/mantık SİLİNMEZ (fallback). Routing kararı (agent/skill seçimi) AYNI kalır — sadece intent-kaynağı canonical'a köprülenir.
2. **adr-selector.ts:** ADR-domain belirlenen noktada → `task.type != null ? taskKindToAdrDomain(task.type) : <mevcut legacy domain detection>`. Legacy fallback korunur.
3. **Sıfır-regresyon kanıtı:** eşdeğer task için yeni-yol == eski-yol (router intent + adr domain), 3 task-türünde.

**Tasarım:** minimum-diff, mevcut imzaları koru, legacy fallback kalsın, pure-bridge (rubric-registry WM-2b deseni birebir). Karpathy scope-içi.

**Kanıt:** `grep "taskKindToIntent" src/orchestra/task-router.ts` + `grep "taskKindToAdrDomain" src/orchestra/adr-selector.ts` → köprü var · legacy detection fonksiyonları HÂLÂ mevcut (fallback) · `npx tsc --noEmit` temiz.

**Test (≥8):** `tests/orchestra/work-model-consumer-2.test.ts` — (a) `task.type` set → router intent + adr domain canonical'dan; (b) `task.type` yok → legacy fallback aynen; (c) regression-eşitlik 3 task-türü (yeni==eski); hermetik. Yeni test yeşil + **mevcut task-router/adr-selector testleri BOZULMAZ** (`npx vitest run tests/orchestra/task-router.test.ts tests/orchestra/adr-selector.test.ts` — varsa, yeşil).

**Smoke:** yok (Tier-0); Brain/ben post-sprint orchestration-smoke (trivial sprint plan→spawn→evaluate, routing+adr doğru).

---

**Beklenen:** 1/1 DONE. SSOT artık 3 consumer'da (rubric+router+adr) tüketiliyor; WM-2c-safe tamam (duplike-silme ayrı cleanup). Disk-verify: 2 köprü + fallback korundu + tsc temiz + yeni test + mevcut testler yeşil (sıfır regresyon). **Post-sprint orchestration-smoke (ben):** routing/adr-eval doğru.

İlgili ADR: ADR-053 · ADR-015 (TaskRouter) · ADR-036 (ADR governance) · ADR-008. Memory: [[sprint_239_workmodel_consumer]] (WM-2b deseni) · [[feedback_agent_routing_imbalance]] (routing hassasiyeti) · [[feedback_trust_brain_eval_not_worker]].
</content>
