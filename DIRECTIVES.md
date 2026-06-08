# DIRECTIVES — Sprint 241: EffectClass → Autonomous Policy-Gate Wire (WM-6)

## Goal: Autonomous policy-gate'in G3 risk-katmanını GERÇEKTEN çalıştır. Bugün `getEffectClass` (`rubric-registry.ts:375`) TANIMLI ama autonomous'ta kullanılmıyor: tek caller `runtime-loop.ts` `decidePolicy(entry)`'yi **computed effect geçmeden** çağırıyor → default `'reversible'` (AUTO_SAFE) → `risk-tagged`/irreversible entry'ler `auto` ile AYNI yolu izliyor (park ETMİYOR). Fix: decidePolicy'ye entry'nin doğasından **hesaplanmış EffectClass** geçir → non-auto-safe (critical-irreversible/compensable/idempotent) entry'ler approval-required'a park etsin. **Düşük-risk: yalnız autonomous (flag-gated default-off), ana sprint/spawn-path'e DOKUNMAZ.**

## Ortak kurallar
- **Backward-safe:** default davranış korunur (effect verilmezse eski `'reversible'` default kalır — imza opsiyonel); yeni-yol yalnız computed-effect ekler. ADR-055 (EffectClass) realize. ADR-037/040 (authority/approval) korunur — **OTO-APPROVE YOK**.
- **i18n** muaf (internal policy). **ESM `.js`.** No tech debt. **.result kontratı** api-surface.md. Tier-0 → unit-test.

---

## Task 1: 241-001 — decidePolicy'ye computed EffectClass wire
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, system-architect, testing-expert
- Files: src/orchestra/autonomous/policy-gate.ts, src/orchestra/autonomous/runtime-loop.ts, tests/orchestra/autonomous/policy-gate-effectclass.test.ts
- Scope: src/orchestra/autonomous/, tests/orchestra/autonomous/
- Dependencies:

### Description
Önce oku: `src/orchestra/autonomous/policy-gate.ts` (`decidePolicy`, `AUTO_SAFE` set, `EffectClass`), `src/orchestra/autonomous/runtime-loop.ts` (decidePolicy caller, ~satır 220), `src/orchestra/rubric-registry.ts:375` (`getEffectClass`), `src/orchestra/autonomous/backlog-types.ts` (`BacklogEntry`).

1. **EffectClass hesaplama köprüsü:** autonomous backlog entry için EffectClass türet. Yol: entry'nin doğasından (`entry.kind`, `entry.spec.scopeDir`/`description`) bir `TaskKind`/minimal-task çıkar → `getEffectClass` (veya `EFFECT_CLASS_REGISTRY`) ile EffectClass hesapla. Saf, deterministik bir `computeEntryEffectClass(entry): EffectClass` fonksiyonu (policy-gate.ts veya yardımcı). Belirsiz/bilinmeyen → **güvenli taraf: en-kısıtlayıcı** (auto-safe-DEĞİL → park; fail-safe, ADR-040 default-deny ruhuyla).
2. **runtime-loop.ts wire:** `decidePolicy(entry)` çağrısını `decidePolicy(entry, computeEntryEffectClass(entry))` yap. `decidePolicy` imzası opsiyonel-effect korunur (verilmezse eski default).
3. **Sonuç:** `pure`/`reversible` → `auto`; `compensable`/`idempotent`/`critical-irreversible` → approval-required (park). risk-tagged artık gerçek anlam taşır.

**Tasarım:** minimum-diff, opsiyonel-imza (backward), pure-compute, fail-safe (belirsiz→park). OTO-APPROVE eklenmez (ADR-040). Karpathy scope-içi.

**Kanıt:** `grep "computeEntryEffectClass\|decidePolicy(entry," src/orchestra/autonomous/runtime-loop.ts` → wire var · `decidePolicy` artık computed-effect alıyor · `npx tsc --noEmit` temiz.

**Test (≥6):** `tests/orchestra/autonomous/policy-gate-effectclass.test.ts` — (a) pure/reversible entry → decision `auto`; (b) critical-irreversible/compensable → approval-required (park); (c) bilinmeyen-doğa → fail-safe park; (d) `decidePolicy` effect-verilmeden çağrılırsa eski default (backward); hermetik. `npx vitest run tests/orchestra/autonomous/policy-gate-effectclass.test.ts` yeşil + **mevcut policy-gate testleri BOZULMAZ**.

**Smoke:** yok (Tier-0 autonomous-internal, flag-gated). Ana sprint-path etkilenmez → orchestration-smoke gerekmez (autonomous default-off); ben yine de tsc+test+build doğrularım.

---

**Beklenen:** 1/1 DONE. Autonomous G3 risk-gate canlı (risk-tagged park eder). Disk-verify: computeEntryEffectClass + wire + fail-safe + tsc temiz + yeni test + mevcut policy-gate testleri yeşil. memory wipe-check.

İlgili ADR: ADR-055 (EffectClass realize) · ADR-040 (nervous approval, no-auto-approve) · ADR-037 (authority). Memory: [[project_merged_product_flow_analysis]] (EffectClass G3 defaulted-open bulgusu) · [[sprint_240_workmodel_consumer2]] · [[feedback_trust_brain_eval_not_worker]].
</content>
