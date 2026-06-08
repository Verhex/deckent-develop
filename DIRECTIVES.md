# DIRECTIVES — Sprint 238: Canonical Work-Model Foundation (WM-2a, additive)

## Goal: MASTER-PLAN §14 Küme A'nın temel taşı — tüm yüzey ve alt-sistemlerin paylaşacağı **tek kanonik work-model** tiplerini ADDITIVE (sıfır mevcut-callsite değişikliği) olarak kur. 5 uyumsuz `TaskType` enum'unu tek `TaskKind` SSOT'a indirgeyecek adaptör katmanı + hybrid two-axis `EnvironmentType` + `RequirementProfile` + `ExecutionRequest` input-kontratı + `Task`'a OPSİYONEL `type` alanı. Bu adım **bilinçle additive**: yeni modül kimse tüketene kadar "ölü"dür → "foundation laid" sayılır, "WM-2 done" DEĞİL (consumer-migration sonraki sprint'ler). Referans tasarım: `docs/superpowers/specs/2026-06-08-canonical-work-model-design.md` (OKU).

## Ortak kurallar
- **Backward-safe ZORUNLU:** mevcut hiçbir callsite değişmez; `Task`'a eklenen alan **OPSİYONEL** (`type?:`) — `Task` JSON'dan inşa edilir (planner yazar/worker okur, tsc-denetlenmez yol), required alan runtime'ı kırar. tsc yeşil ≠ deckent hâlâ orkestre eder.
- **i18n:** muaf (internal type'lar, user-facing string yok). **ESM `.js` uzantısı zorunlu.**
- **No tech debt:** tüm adaptörler pure-function, tam unit-test'li. ADR-053 (TaskType taxonomy) genişletilir (realize-edilmiş tek-kaynak hali); yeni ADR WM-2c'de yazılır, bu additive adımda değil.
- **.result kontratı:** `docs/reference/api-surface.md`.
- Tier-0 (internal/structural, `src/core/`) → unit-test yeterli, Smoke gerekmez.

---

## Task 1: 238-001 — Canonical work-model SSOT modülü (additive)
- Provider: claude
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect, code-simplifier, testing-expert
- Files: src/core/work-model.ts, src/core/task-types.ts, tests/core/work-model.test.ts
- Scope: src/core/, tests/core/

### Description
Önce `docs/superpowers/specs/2026-06-08-canonical-work-model-design.md`'yi ve mevcut 5 enum'u oku (`src/core/decision-types.ts:8`, `src/orchestra/rubric-registry.ts:21`, `src/orchestra/task-router.ts:55`, `src/orchestra/adr-selector.ts:45`, `src/core/routing-types.ts`). Sonra **yeni `src/core/work-model.ts`** dosyasını oluştur:

1. **Kanonik tipler** (spec §2 birebir): `TaskKind` (11-değerli union), `WorkDomain`+`ExecutionContext`+`EnvironmentType` (two-axis interface), `Capability`+`ResourceNeed`+`RequirementProfile`, `ExecutionRequest` (input-kontratı; `scope: TaskScope`, `provider?: ProviderName`, `model?: ModelType` mevcut tiplerden import — sıfır hardcode 'claude').
2. **Legacy→canonical adaptörleri** (pure): `decisionTypeToKind`, `rubricTypeToKind`, `routerTypeToKind`, `adrSelectorToKind`, `intentToKind` — her 5 enum'un HER değeri kanonik `TaskKind`'a eşlenir (spec §3). Bilinmeyen→`'generic'`.
3. **Reverse helper'lar** (pure): `taskKindToRubric` (→ 'audit'|'document-write'|'code-development'), `taskKindToAdrDomain`, `taskKindToIntent` — alt-sistemlerin tek kanonik kind'dan kendi görüşünü türetmesi için.
4. `src/core/task-types.ts`: `Task` interface'ine **opsiyonel** `type?: TaskKind` alanı ekle (work-model.ts'ten import; tek satır, mevcut hiçbir şey değişmez).

**Tasarım kuralı:** tüm fonksiyonlar pure (side-effect yok); `work-model.ts` yalnız tip + saf-fonksiyon (I/O yok). Mevcut `TaskScope`/`GoNoGoCriteria`/`TaskEffort`/`TaskPriority`/`ProviderName`/`ModelType` tiplerini import et, yeniden tanımlama.

**Kanıt:** `grep -c "export" src/core/work-model.ts` ≥ 12 (tipler+adaptörler) · `grep "type?:" src/core/task-types.ts` → eklendi · `npx tsc --noEmit` temiz.

**Test (≥12):** `tests/core/work-model.test.ts` — (a) 5 adaptörün HER değeri doğru `TaskKind`'a map'lenir (her enum için ≥1 test), (b) bilinmeyen→'generic', (c) 3 reverse-helper round-trip, (d) `ExecutionRequest`/`EnvironmentType`/`RequirementProfile` tip-construction derler, (e) hermetik (I/O yok, tmpdir gerekmez). `npx vitest run tests/core/work-model.test.ts` yeşil.

**Smoke:** yok (Tier-0 internal-type; unit-test yeterli).

---

**Beklenen:** 1/1 DONE. Additive (sıfır callsite değişikliği → mevcut tüm testler + deckent orkestrasyon BOZULMAZ). Disk-verify: `work-model.ts` var + 12+ export + `task-types.ts` opsiyonel `type?` + tsc temiz + work-model test yeşil. **Post-sprint orchestration-smoke (Brain/ben):** core-touching olduğundan deckent'in hâlâ trivial 1-task plan→spawn→evaluate yapabildiğini doğrula (tsc-green ≠ orkestre-eder).

İlgili ADR: ADR-053 (TaskType taxonomy — bu onun realize-edilmiş tek-kaynak hali) · ADR-008 (import yönü) · ADR-002 (ESM `.js`). Memory: [[project_merged_product_flow_analysis]] (5-enum bulgusu) · [[feedback_no_minimum_no_mvp_deckent]].
</content>
