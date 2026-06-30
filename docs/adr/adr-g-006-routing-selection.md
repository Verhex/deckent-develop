# ADR-G-006: Routing & Selection (Learned Model/Effort + Agent/Skill)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** routing-engine contract (routeTaskV2; V1 purged)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-015 (TaskRouter 6-level) + ADR-028 (Decision-Engine V1→V2→V3) + ADR-072 (Routing Balance multi-signal) + ADR-073 (Routing Live Validation + FIX-prompt) + ADR-075 Part-B (skill→agent affinity)
**Crosswalk:** 015 (+028+072+073+075B) → ADR-G-006

> **Authoring note (Alperen):** "Bunun ADR/dokümante kısmı bugünü VE yarını hedef-niyetlerle açıklasın, şeffaf olsun. Bu bizim için önemli ve kritik." This ADR is the first-class application of the ADR-AUTHORING-STD (today + tomorrow, transparent).

---

## Context

Routing decides, per task: which agent, which skills, which provider, which model, which effort. The old stack was a 6-level router (ADR-015) plus a V1 decision-engine (ADR-028) that was superseded by V2 (`routeTaskV2`) but never removed; plus a chronic distribution-skew problem (one agent winning ~12/16 tasks) that ADR-072/073/075B mitigated with domain-enrichment, domain-match-bonus, skill→agent affinity, a live-diversity test, and a CI imbalance guard. The 2026-06-30 review consolidates routing into one ADR, **purges V1 entirely**, and commits to a **learned, evolving** selection model (V3).

---

## Decision (Today)

- **`routeTaskV2` is the routing engine.** Selection combines: intent domain-enrichment (scope-path → api/security/design/data/devops/docs intent), **domain-match bonus (+3)**, **skill→agent affinity** (`SKILL_AGENT_MAP` + affinity-bonus), surface-aware bonus (ADR-G-009 Tier-1 → api-builder/frontend-designer/ci-guardian), and `force-*` overrides (preserved).
- **Guards:** live routing-diversity test (single-agent ≤60%, ≥4 distinct agents on a mixed set) + CI imbalance guard (`routing-distribution.mjs --ci`, >80% → fail). **FIX-prompt enrichment** (original-task + NO_GO-reason injected; `selectFixAgent` mirrors original agent, not bug-fixer-by-default).
- **🔴 V1 PURGE:** the V1 decision-engine (`DecisionOrchestrator` + `routing_engine:'v1'` config + V1 tests + manifest entry + every reference) is **deleted entirely — "izi bile kalmayacak"** (in an orchestration this comprehensive, V1 is unacceptable).

---

## Intent / Roadmap (Tomorrow) — Learned Routing V3

V2 is sufficient *today* but **not the target**. V3 = a **learned model/effort selection matrix**:

```xml
<routing-v3 intent="learned + auditable">
  <learn>per-task-type outcome metrics (success / quality / cost / latency) → the
    model/effort matrix auto-updates from real results.</learn>
  <auto-adopt>new models auto-adopted on merit (e.g. opus-4.9 &gt; 4.8; live capability,
    zero-hardcode — F1-AD).</auto-adopt>
  <vector-select>natural selection over (task-kind × cost × latency × risk ×
    provider-health × outcome).</vector-select>
  <scope>project + provider scoped; USER-manageable; force-* preserved.</scope>
  <transparency>the ADR documents today AND tomorrow with target-intent — this is
    important and critical to us.</transparency>
</routing-v3>
```

(= ROUTE-1+ / ROUTE-V1-PURGE / PROV-MATRIX, fusing outcome-tracker + F5 + F1-AD — the Codex ModelPolicyEngine convergence.) Distribution balance remains a **continuously-monitored** target (the +3 bonus is the first link; ADR-G-023 affinity + WM-7 language-mismatch-penalty deepen it).

---

## Consequences

**(+)** One routing law; V1 gone; selection is multi-signal and diversity-guarded today, and learned/auditable tomorrow. New models adopt on merit without hardcoded IDs. User + project scoping.

**(−)** Distribution skew is mitigated, not solved (recurred at Sprint 211 as refactorer-heavy) — balance stays a monitored target until V3. V3 (learned matrix) is roadmap; today is V2 + guards.

---

## References / Absorbed

- **Absorbs:** ADR-015 + ADR-028 (V1-purge) + ADR-072 + ADR-073 + ADR-075 Part-B.
- **Cross-ref:** ADR-G-008 (provider/model registry, cost) · ADR-G-009 (surface-aware routing, eval) · ADR-G-023 (agent/skill taxonomy, affinity) · ADR-G-032 (evolution — outcome signal) · ADR-G-028 (work taxonomy).
- **Born / MASTER-PLAN:** ROUTE-1+ (Routing V3) · ROUTE-V1-PURGE · PROV-MATRIX · F1-AD.
- **Memory:** `feedback_agent_routing_imbalance` · `feedback_fix_prompt_quality`.
