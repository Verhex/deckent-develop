# ADR-G-006: Routing & Selection (Learned Model/Effort + Agent/Skill)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`routeTaskV2` multi-signal selection (intent domain-enrichment + domain-match-bonus + surface-aware bonus; skill→agent affinity config-enableable, default-off) + live routing-diversity test + routing-distribution script — **⚠️ V1-purge is MANDATED but NOT yet executed: V1 is still live (`['v1','v2']` config, type union, planner `?? 'v1'` default-fallback, `decision-engine.ts`) → ROUTE-V1-PURGE (P0)** → tomorrow=learned Routing V3 (per-task-type outcome matrix auto-updating from real results, new-model auto-adopt on merit, vector-selection over task-kind×cost×latency×risk×provider-health×outcome; project+provider-scoped, user-manageable) — ROUTE-1+ · PROV-MATRIX · F1-AD
**Status:** accepted (provisional — ROUTE-V1-PURGE P0: V1 still live; + routing-version-label cleanup + affinity-default decision) · **Date:** 2026-06-30 · **Absorbs:** ADR-015 (TaskRouter 6-level) + ADR-028 (Decision-Engine V1→V2→V3) + ADR-072 (Routing Balance multi-signal) + ADR-073 (Routing Live Validation + FIX-prompt) + ADR-075 Part-B (skill→agent affinity)
**Crosswalk:** 015 (+028+072+073+075B) → ADR-G-006

> **Authoring note (Alperen):** an ADR's documentation must explain both **today AND tomorrow** through its target-intent, transparently — "this matters and is critical to us." This ADR is the first-class application of the ADR-AUTHORING-STD (ADR-G-019: document today + tomorrow, transparently).

---

## Context

Routing decides, per task: which agent, which skills, which provider, which model, which effort. The old stack was a 6-level router (ADR-015) plus a V1 decision-engine (ADR-028) that was superseded by V2 (`routeTaskV2`) but **never removed**; plus a chronic distribution-skew problem (one agent winning ~12/16 tasks) that ADR-072/073/075B mitigated with domain-enrichment, domain-match-bonus, skill→agent affinity, a live-diversity test, and a routing-distribution guard. The 2026-06-30 review consolidates routing into one ADR, **mandates the complete removal of V1** (decided — "izi bile kalmayacak"), and commits to a **learned, evolving** selection model (V3).

---

## Decision (Today)

- **`routeTaskV2` is the routing engine.** Selection combines: intent domain-enrichment (scope-path → api/security/design/data/devops/docs intent), **domain-match bonus (+3)**, surface-aware bonus (ADR-G-009 Tier-1 → api-builder/frontend-designer/ci-guardian), and `force-*` overrides (preserved). **Skill→agent affinity** (`SKILL_AGENT_MAP` + affinity-bonus) is a **config-enableable** signal, **default-off** today (`skillAgentAffinity ?? false`) — a real selection lever once enabled, not an always-on default (AFFINITY-DEFAULT-DECISION: make default-on, or keep config-gated by design).
- **Guards:** live routing-diversity test (single-agent ≤60%, ≥4 distinct agents on a mixed set) + a **routing-distribution script** (`routing-distribution.mjs --ci`, >80% → fail) wired in CI — note it is **advisory in practice**: with no `.deckent/routing/learnings.json` data it passes vacuously, so it is "script + tests + optional guard", not a hard standalone gate. **FIX-prompt enrichment** (original-task + NO_GO-reason injected). `selectFixAgent` is **not** bug-fixer-by-default: it **preserves the model (identity)** and applies a **fresh-eyes agent rotation** (a complementary agent — e.g. architect→code-reviewer), while **preserving the original agent for specific failure modes** (test / doc / bug / exit-no-result) and rotating only for the generic case.
- **🔴 V1 removal — DECIDED + MANDATORY, NOT yet executed.** The decision stands: the V1 decision-engine must be deleted entirely — "izi bile kalmayacak" (in an orchestration this comprehensive, V1 is unacceptable). **State-of-code (2026-06-30, honest): V1 is still live** — `config.ts` accepts `['v1', 'v2']`, the config type is `'v1' | 'v2'`, `sprint-planner.ts` uses `config.routing_engine ?? 'v1'` (so V1 is even the **default fallback** when unset — itself a bug, the default is `'v2'`), `src/orchestra/decision-engine.ts` is still in the repo, plus V1 tests + a `decision-orchestrator-v1` manifest entry. **ROUTE-V1-PURGE (P0)** executes the deletion: config value + type + planner fallback (→ `'v2'`) + `decision-engine.ts` + manifest + tests, every reference.

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

(= ROUTE-1+ / ROUTE-V1-PURGE / PROV-MATRIX, fusing outcome-tracker + F5 + F1-AD — the Codex ModelPolicyEngine convergence.) Distribution balance remains a **continuously-monitored** target (the +3 bonus is the first link; ADR-G-023 affinity + WM-7 language-mismatch-penalty deepen it). **Routing-version labelling** is also cleaned up here: `routeTaskV2` currently returns `routingVersion: 'v3'` while the planner stamps `'v2'` on the task — today's engine is V2, so the label is reconciled (ROUTING-VERSION-LABEL) rather than left to imply V3 already ships.

---

## Consequences

**(+)** One routing law; selection is multi-signal and diversity-guarded today, and learned/auditable tomorrow. New models adopt on merit without hardcoded IDs. User + project scoping.

**(−)** **V1 is not yet gone** — the purge is decided + mandatory but pending (ROUTE-V1-PURGE, P0); until then V1 remains a valid config value and the planner's default fallback. Distribution skew is mitigated, not solved (recurred at Sprint 211 as refactorer-heavy) — and the skill→agent affinity lever that would deepen the fix is **default-off** today (AFFINITY-DEFAULT-DECISION). The `routingVersion` label is inconsistent (`'v3'` returned vs `'v2'` stamped — ROUTING-VERSION-LABEL). V3 (learned matrix) is roadmap; today is V2 + guards.

---

## References / Absorbed

- **Absorbs:** ADR-015 + ADR-028 (V1 lineage — purge mandated, pending) + ADR-072 + ADR-073 + ADR-075 Part-B.
- **Cross-ref:** ADR-G-008 (provider/model registry, cost) · ADR-G-009 (surface-aware routing, eval) · ADR-G-023 (agent/skill taxonomy, affinity) · ADR-G-032 (evolution — outcome signal) · ADR-G-028 (work taxonomy).
- **Born / MASTER-PLAN:** **ROUTE-V1-PURGE** (P0 — delete V1 config/type/planner-fallback/`decision-engine.ts`/manifest/tests entirely) · ROUTE-1+ (Routing V3) · PROV-MATRIX · F1-AD · **ROUTING-VERSION-LABEL** (P2 — reconcile `'v3'`-return vs `'v2'`-stamp + planner `?? 'v2'` default) · **AFFINITY-DEFAULT-DECISION** (P1 — skill→agent affinity default-on vs config-gated-by-design).
- **Memory:** `feedback_agent_routing_imbalance`.
